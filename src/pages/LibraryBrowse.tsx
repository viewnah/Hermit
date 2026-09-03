import { useEffect, useState } from 'react'
import { pushBackHandler } from '../lib/backButton'
import { listLibraryDir, downloadLibraryFile } from '../lib/libraryBrowse'
import { toast } from '../components/ui'
import type { LibraryEntry, LibrarySource } from '../types'

const IconBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
)
const IconFolder = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
const IconEpub = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)
const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)

interface Props {
  source: LibrarySource
  onBack: () => void
}

export const LibraryBrowse = ({ source, onBack }: Props) => {
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const refresh = async (sub: string) => {
    setLoading(true)
    try {
      const list = await listLibraryDir(source, sub)
      // 排序：目录在前，文件在后
      list.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name, 'zh')
      })
      setEntries(list)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '列目录失败'
      toast(msg)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh(path) }, [path, source.id])

  // 返回键
  useEffect(() => pushBackHandler(() => {
    if (path !== '/') {
      const parent = path.split('/').slice(0, -1).join('/') || '/'
      setPath(parent)
      return true
    }
    onBack()
    return true
  }), [path, onBack])

  const handleEntry = async (entry: LibraryEntry) => {
    if (entry.isDir) {
      const next = (path === '/' ? '' : path) + '/' + entry.name
      setPath(next)
      return
    }
    if (downloading) return
    setDownloading(entry.name)
    const res = await downloadLibraryFile(source, entry)
    toast(res.message)
    setDownloading(null)
  }

  const crumbs = (path === '/' ? [''] : path.split('/').filter(Boolean))
    .map((seg, i, all) => ({
      name: seg || '根目录',
      path: '/' + all.slice(0, i + 1).filter(Boolean).join('/'),
    }))

  return (
    <div className="library-browse-root">
      <div className="library-browse-top">
        <div className="library-browse-top-inner">
          <button className="icon-btn" onClick={onBack} aria-label="返回">
            <IconBack />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="library-browse-title">{source.name}</div>
            <div className="library-browse-crumb">
              {crumbs.map((c, i) => (
                <span key={c.path}>
                  {i > 0 && <span style={{ margin: '0 4px' }}>›</span>}
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => setPath(i === 0 ? '/' : c.path)}
                  >{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="library-browse-list">
        {loading && entries.length === 0 && (
          <div className="library-browse-empty">
            <span>加载中…</span>
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="library-browse-empty">
            <div className="glyph">空</div>
            <p>此目录下没有文件</p>
          </div>
        )}
        {entries.map(e => (
          <button
            key={e.href}
            className="library-browse-item"
            onClick={() => void handleEntry(e)}
            disabled={!!downloading}
          >
            <span className="item-icon">
              {e.isDir ? <IconFolder /> : <IconEpub />}
            </span>
            <span className="item-main">
              <div className="item-name">{e.name}</div>
              {e.isDir
                ? <div className="item-sub">目录</div>
                : downloading === e.name
                  ? <div className="item-sub">下载中…</div>
                  : /\.epub$/i.test(e.name) ? <div className="item-sub">点击导入书架</div>
                  : <div className="item-sub">不支持的格式</div>}
            </span>
            {e.isDir && <span style={{ color: 'var(--ink-faint)' }}><IconChevron /></span>}
          </button>
        ))}
      </div>
    </div>
  )
}