import { useEffect, useState } from 'react'
import { davList, WebDavError } from '../lib/webdav'
import { toast } from './ui'
import type { LibraryWebDavConfig } from '../types'

const IconFolder = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

/** 拼接绝对路径（根目录 '/' 特判，避免双斜杠） */
const joinPath = (base: string, name: string): string => {
  if (base === '/' || base === '') return '/' + name
  return base.replace(/\/+$/, '') + '/' + name
}

/** 把绝对路径拆成面包屑段（不含根） */
const crumbsOf = (path: string): string[] =>
  (path === '/' || path === '' ? [] : path.split('/').filter(Boolean))

interface Props {
  /** 编辑中的配置（url / 账号），用于连通远端 */
  cfg: LibraryWebDavConfig
  /** 当前已选目录（编辑表单里的 cfg.path），作为浏览起点 */
  initialPath: string
  /** 用户确认选中某目录 */
  onPick: (path: string) => void
  /** 取消/收起 */
  onCancel: () => void
}

/**
 * 远端目录选择器：内嵌在「在线书库」编辑表单中。
 * 测试连接成功后显示；逐层列出目录，点目录进入，点「使用此目录」确认。
 */
export const LibraryDirPicker = ({ cfg, initialPath, onPick, onCancel }: Props) => {
  const [cwd, setCwd] = useState<string>(initialPath || '/')
  const [dirs, setDirs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = async (dir: string) => {
    setLoading(true)
    try {
      const list = await davList({ url: cfg.url, username: cfg.username, password: cfg.password, path: dir }, '/')
      const folders = list
        .map(x => ({ name: x.name, isDir: x.href.endsWith('/') }))
        .filter(x => x.isDir && x.name)
        .map(x => x.name)
        .sort((a, b) => a.localeCompare(b, 'zh'))
      setDirs(folders)
    } catch (e) {
      toast(e instanceof WebDavError ? e.message : '读取目录失败')
      setDirs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh(cwd) }, [cwd])

  const crumbs = crumbsOf(cwd)

  const enter = (name: string) => setCwd(joinPath(cwd, name))
  const jumpTo = (idx: number) => setCwd(idx < 0 ? '/' : '/' + crumbs.slice(0, idx + 1).join('/'))

  return (
    <div className="dir-picker">
      <div className="dir-picker-head">
        <span className="dir-picker-label">选择目录</span>
        <button className="btn small" onClick={onCancel} aria-label="收起">收起</button>
      </div>

      <div className="dir-picker-crumb">
        <span
          className={cwd === '/' ? 'crumb active' : 'crumb'}
          onClick={() => jumpTo(-1)}
        >根目录</span>
        {crumbs.map((c, i) => (
          <span key={c + i}>
            <span style={{ margin: '0 4px', color: 'var(--ink-faint)' }}>›</span>
            <span className={i === crumbs.length - 1 ? 'crumb active' : 'crumb'} onClick={() => jumpTo(i)}>{c}</span>
          </span>
        ))}
      </div>

      <div className="dir-picker-list">
        {loading && dirs.length === 0 ? (
          <div className="dir-picker-empty">读取中…</div>
        ) : dirs.length === 0 ? (
          <div className="dir-picker-empty">此目录下没有子目录</div>
        ) : dirs.map(name => (
          <button key={name} className="dir-picker-item" onClick={() => enter(name)}>
            <IconFolder />
            <span className="dir-picker-name">{name}</span>
            <span style={{ color: 'var(--ink-faint)', marginLeft: 'auto' }}>›</span>
          </button>
        ))}
      </div>

      <div className="dir-picker-foot">
        <button className="btn primary" style={{ width: '100%' }}
          onClick={() => onPick(cwd)}>
          {cwd === '/' ? '使用根目录' : `使用 ${cwd}`}
        </button>
      </div>
    </div>
  )
}
