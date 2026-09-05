import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { db } from '../db'
import { pushBackHandler } from '../lib/backButton'
import { deleteBook, importBookFile } from '../lib/bookService'
import { toast, confirmDialog } from '../components/ui'
import { SyncPanel } from '../components/SyncPanel'
import { SectionCard } from '../components/SectionCard'
import { LibraryDirPicker } from '../components/LibraryDirPicker'
import { PasswordField } from '../components/PasswordField'
import { LibraryBrowse } from './LibraryBrowse'
import {
  addLibrarySource, defaultLibraryWebDavConfig, deriveLibraryName,
  isWebDavLibrary, listLibrarySources, removeLibrarySource, toggleLibraryEnabled,
  updateLibrarySource,
} from '../lib/librarySources'
import { testLibraryConnection } from '../lib/libraryBrowse'
import { WebDavError } from '../lib/webdav'
import type { LibrarySource, LibraryWebDavConfig } from '../types'

interface BookRow {
  id: number
  title: string
  author: string
  coverUrl: string | null
  percentage: number
  lastReadAt: number | undefined
  addedAt: number
}

type Tab = 'shelf' | 'mine'
type SortMode = 'recent' | 'added' | 'title'
type Menu = 'sort' | 'more' | null

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'recent', label: '最近阅读' },
  { id: 'added', label: '导入时间' },
  { id: 'title', label: '书名' },
]

const TAB_TITLES: Record<Tab, string> = { shelf: '全部书籍', mine: '我的' }

const SORT_KEY = 'clipreader.sort'
const loadSort = (): SortMode => {
  const saved = localStorage.getItem(SORT_KEY)
  return SORTS.some(s => s.id === saved) ? saved as SortMode : 'recent'
}

const formatPct = (v: number) => `${Math.round(v * 100)}%`

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
)
const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
  </svg>
)
const IconChevron = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const IconPlus = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconShelf = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="4.5" height="13" rx="1" />
    <rect x="10.5" y="6" width="4.5" height="11" rx="1" />
    <path d="M17 5l3 .8-2.2 11.2-3-.8z" />
    <line x1="3" y1="20.5" x2="21" y2="20.5" />
  </svg>
)
const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
)

const useCoverUrls = (rows: BookRow[], covers: Map<number, Blob | null>) => {
  const [urls, setUrls] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    const next = new Map<number, string>()
    for (const row of rows) {
      const blob = covers.get(row.id)
      if (blob) next.set(row.id, URL.createObjectURL(blob))
    }
    setUrls(next)
    return () => { for (const url of next.values()) URL.revokeObjectURL(url) }
  }, [rows, covers])
  return urls
}

export const Library = ({ onOpen }: { onOpen: (bookId: number) => void }) => {
  const [rows, setRows] = useState<BookRow[]>([])
  const [covers, setCovers] = useState<Map<number, Blob | null>>(new Map())
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState<Tab>('shelf')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>(loadSort)
  const [menu, setMenu] = useState<Menu>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const coverUrls = useCoverUrls(rows, covers)
  const menuRef = useRef(menu)
  menuRef.current = menu

  // 书库浏览子页面
  const [browseSource, setBrowseSource] = useState<LibrarySource | null>(null)
  // 书库卡片展开态（按 source.id 跟踪）
  const [libExpandedId, setLibExpandedId] = useState<string | null>(null)

  // Android 返回键：书架上有弹出菜单时先关闭，否则交还原生（退到后台）
  useEffect(() => pushBackHandler(() => {
    if (menuRef.current) {
      setMenu(null)
      return true
    }
    return false
  }), [])

  const refresh = async () => {
    const books = await db.books.toArray()
    const progress = await db.progress.toArray()
    const pctMap = new Map(progress.map(p => [p.bookId, p.percentage]))
    setCovers(new Map(books.map(b => [b.id!, b.cover ?? null])))
    setRows(books.map(b => ({
      id: b.id!,
      title: b.title,
      author: b.author,
      coverUrl: null as string | null,
      percentage: pctMap.get(b.id!) ?? 0,
      lastReadAt: b.lastReadAt,
      addedAt: b.addedAt,
    })))
  }

  useEffect(() => { void refresh() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? rows.filter(r => r.title.toLowerCase().includes(q) || r.author.toLowerCase().includes(q))
      : rows
    const sorted = [...matched]
    if (sort === 'recent')
      sorted.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || b.addedAt - a.addedAt)
    else if (sort === 'added')
      sorted.sort((a, b) => b.addedAt - a.addedAt)
    else
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    return sorted
  }, [rows, query, sort])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    let added = 0, dup = 0, failed = 0
    for (const file of Array.from(files)) {
      try {
        const result = await importBookFile(file)
        if (result.duplicate) dup++
        else added++
      } catch (e) {
        failed++
        console.error(e)
      }
    }
    setImporting(false)
    await refresh()
    const parts: string[] = []
    if (added) parts.push(`导入 ${added} 本`)
    if (dup) parts.push(`${dup} 本已存在`)
    if (failed) parts.push(`${failed} 本失败`)
    toast(parts.join('，') || '未导入任何书籍')
  }

  const loadDemoBook = async () => {
    setImporting(true)
    try {
      const res = await fetch('/demo/sample.epub')
      const blob = await res.blob()
      const file = new File([blob], '西游记.epub', { type: 'application/epub+zip' })
      const result = await importBookFile(file)
      toast(result.duplicate ? '示例书籍已在书架' : '已载入示例书籍')
    } catch (e) {
      console.error(e)
      toast('示例书籍载入失败')
    }
    setImporting(false)
    await refresh()
  }

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const startPress = (row: BookRow) => () => {
    clearPress()
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      void (async () => {
        if (await confirmDialog(`移除「${row.title}」？`, { body: '阅读进度将一并删除', confirmLabel: '移除' }))
          await removeBook(row)
      })()
    }, 550)
  }
  const removeBook = async (row: BookRow) => {
    await deleteBook(row.id)
    await refresh()
    toast(`已移除「${row.title}」`)
  }
  useEffect(() => clearPress, [])

  const shelfEmpty = rows.length === 0
  const searchEmpty = !shelfEmpty && query.trim() !== '' && filtered.length === 0

  const pressProps = (row: BookRow) => ({
    onPointerDown: startPress(row),
    onPointerUp: clearPress,
    onPointerLeave: clearPress,
    onPointerCancel: clearPress,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  })

  return (
    <div className="grain" style={{ height: '100%' }}>
      <div className="home-top">
        <div className="home-top-inner">
          <header className="home-header">
            {tab === 'shelf' ? (
              <button className="home-title" onClick={() => setMenu(menu === 'sort' ? null : 'sort')}>
                {TAB_TITLES[tab]}
                <span className="chevron"><IconChevron /></span>
              </button>
            ) : (
              <div className="home-title mine-title">我的</div>
            )}
            {tab === 'mine' ? (
              <span className="mine-version">v0.1.2</span>
            ) : (
              <button className="icon-btn" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="菜单">
                <IconMenu />
              </button>
            )}
          </header>

          {tab === 'shelf' && (
            <div className="search-bar">
              <IconSearch />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索书籍"
                enterKeyHint="search"
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')} aria-label="清除">×</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="library-scroll">
        {tab === 'shelf' && (shelfEmpty ? (
          <div className="library-empty">
            <div className="glyph">书</div>
            <h2>书架还空着</h2>
            <p>导入一本 EPUB 电子书<br />开始你的阅读</p>
            <button className="demo-book-btn" onClick={() => void loadDemoBook()} disabled={importing}>
              {importing ? '正在载入…' : '载入示例书籍'}
            </button>
          </div>
        ) : searchEmpty ? (
          <div className="library-empty">
            <div className="glyph">搜</div>
            <h2>没有找到「{query.trim()}」</h2>
            <p>换个关键词试试</p>
          </div>
        ) : (
          <>
            <div className="shelf-meta">
              <span>{filtered.length}本书</span>
              <span>{SORTS.find(s => s.id === sort)?.label}</span>
            </div>
            <div className="book-grid">
              {filtered.map((row, i) => (
                <button
                  key={row.id}
                  className="book-card"
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                  onClick={() => onOpen(row.id)}
                  {...pressProps(row)}
                >
                  <div className="book-cover">
                    {coverUrls.get(row.id) ? (
                      <img src={coverUrls.get(row.id)} alt={row.title} />
                    ) : (
                      <div className="cover-fallback">{row.title}</div>
                    )}
                    {row.percentage > 0 && (
                      <span className="progress-chip">{formatPct(row.percentage)}</span>
                    )}
                  </div>
                  <div className="book-title">{row.title}</div>
                  <div className="book-author">{row.author}</div>
                </button>
              ))}
            </div>
          </>
        ))}

        {tab === 'mine' && (
          <div className="mine-page">
            <LibrarySourcesSection
              browseSource={browseSource}
              onBrowse={setBrowseSource}
              libExpandedId={libExpandedId}
              setLibExpandedId={setLibExpandedId}
            />
            <SyncPanel />
            <div className="mine-about">
              Hermit · 本地优先的 EPUB 阅读器
            </div>
          </div>
        )}
      </div>

      {browseSource && (
        <LibraryBrowse
          source={browseSource}
          onBack={() => {
            setBrowseSource(null)
            // 浏览期间可能从书库下载导入了新书，返回时刷新书架列表
            void refresh()
          }}
        />
      )}

      {tab === 'shelf' && (
        <button
          className="fab-round"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          aria-label="导入 EPUB"
        >
          <IconPlus />
        </button>
      )}

      <nav className="bottom-nav">
        <button
          className={`nav-item ${tab === 'shelf' ? 'active' : ''}`}
          onClick={() => { setTab('shelf'); void refresh() }}
        >
          <IconShelf /><span>书架</span>
        </button>
        <button className={`nav-item ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
          <IconUser /><span>我的</span>
        </button>
      </nav>

      {menu === 'sort' && (
        <div className="menu-mask" onClick={() => setMenu(null)}>
          <div className="popup-menu left" onClick={e => e.stopPropagation()}>
            {SORTS.map(s => (
              <button
                key={s.id}
                className={`menu-item ${sort === s.id ? 'active' : ''}`}
                onClick={() => {
                  setSort(s.id)
                  localStorage.setItem(SORT_KEY, s.id)
                  setMenu(null)
                }}
              >
                {s.label}
                {sort === s.id && <span className="check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {menu === 'more' && (
        <div className="menu-mask" onClick={() => setMenu(null)}>
          <div className="popup-menu right" onClick={e => e.stopPropagation()}>
            <button className="menu-item" onClick={() => { setMenu(null); fileRef.current?.click() }}>
              导入 EPUB
            </button>
            <button className="menu-item" onClick={() => { setMenu(null); void loadDemoBook() }}>
              载入示例书籍
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        className="hidden-file-input"
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        onChange={e => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ---------------- 在线书库 section ---------------- */

const IconLibrary = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 19V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13" />
    <path d="M3 19h20" />
    <path d="M14 10h4a2 2 0 0 1 2 2v7" />
    <path d="M14 10v9h6" />
  </svg>
)
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)

const LibrarySourcesSection = ({
  browseSource, onBrowse, libExpandedId, setLibExpandedId,
}: {
  browseSource: LibrarySource | null
  onBrowse: (s: LibrarySource | null) => void
  libExpandedId: string | null
  setLibExpandedId: (id: string | null) => void
}) => {
  const [sources, setSources] = useState<LibrarySource[]>([])

  const refresh = async () => setSources(await listLibrarySources())
  useEffect(() => { void refresh() }, [])

  /** 正在新增（草稿）的书库；null 表示未在新增。保存成功后才真正入库 */
  const [draft, setDraft] = useState<LibrarySource | null>(null)

  const handleAdd = () => {
    setDraft({
      id: '',
      kind: 'webdav',
      name: '',
      config: defaultLibraryWebDavConfig(),
      enabled: false,
      createdAt: 0,
      updatedAt: 0,
    })
  }
  const closeDraft = () => setDraft(null)

  const handleRemove = async (s: LibrarySource) => {
    const ok = await confirmDialog(`移除「${s.name}」？`, {
      body: '已下载的书籍不会删除', confirmLabel: '移除',
    })
    if (!ok) return
    await removeLibrarySource(s.id)
    if (libExpandedId === s.id) setLibExpandedId(null)
    await refresh()
    toast('已移除')
  }

  const handleEnter = (s: LibrarySource) => {
    // 未配置地址：展开编辑；已配置：进入浏览（点击 EPUB 即导入书架）
    if (!s.config.url) {
      setLibExpandedId(s.id)
      return
    }
    onBrowse(s)
  }

  const renderCard = (s: LibrarySource) => {
    const subtitle = !s.config.url
      ? <span><span className="dot off" />未配置</span>
      : <span><span className="dot" />已连接 · {stripScheme(s.config.url)}</span>

    return (
      <SectionCard
        key={s.id}
        icon={<IconLibrary />}
        title={s.name}
        subtitle={subtitle}
        primaryAction={
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13 }}>进入</span>
            <IconChevronRight />
          </span>
        }
        onPrimaryClick={() => void handleEnter(s)}
        onCollapsedClick={() => void handleEnter(s)}
        expanded={libExpandedId === s.id}
        onExpand={() => setLibExpandedId(s.id)}
        onCollapse={() => setLibExpandedId(null)}
      >
        <LibraryEditor
          draft={false}
          source={s}
          onSaved={refresh}
          onClose={() => setLibExpandedId(null)}
          onRemove={() => handleRemove(s)}
        />
      </SectionCard>
    )
  }

  return (
    <div className="section-group">
      <div className="section-group-head">
        <span className="section-group-title">在线书库</span>
        <button className="section-head-add" onClick={handleAdd} aria-label="添加书库">＋ 添加书库</button>
      </div>

      {draft && (
        <SectionCard
          icon={<IconLibrary />}
          title="添加书库"
          subtitle={null}
          expanded
          onExpand={() => {}}
          onCollapse={closeDraft}
        >
          <LibraryEditor
            draft
            source={draft}
            onSaved={refresh}
            onClose={closeDraft}
            onRemove={() => {}}
          />
        </SectionCard>
      )}

      {sources.length === 0 && !draft ? (
        <div className="section-empty hint">
          <span className="label">还没有书库</span>
          <span className="hint">点击上方「添加书库」</span>
        </div>
      ) : sources.map(renderCard)}
    </div>
  )
}

const stripScheme = (url: string): string =>
  url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || '未填写'

const LibraryEditor = ({
  draft, source, onSaved, onClose, onRemove,
}: {
  draft?: boolean
  source: LibrarySource
  onSaved: () => Promise<void> | void
  onClose: () => void
  onRemove: () => void
}) => {
  const [cfg, setCfg] = useState<LibraryWebDavConfig>(
    isWebDavLibrary(source) ? source.config : defaultLibraryWebDavConfig(),
  )
  // 名称：可手动修改；留空时保存按服务器地址自动生成
  const [name, setName] = useState<string>(source.name ?? '')
  const [busy, setBusy] = useState(false)
  const [tested, setTested] = useState(false)
  const [picking, setPicking] = useState(false)

  const handleTest = async () => {
    if (!cfg.url.trim()) {
      toast('请先填写服务器地址')
      return
    }
    setBusy(true)
    try {
      // 书库编辑器仅用于 WebDAV；测试时以 '/' 为探测根目录，验证服务器与账号即可
      const testSource: LibrarySource = {
        kind: 'webdav',
        id: source.id,
        name: name.trim() || cfg.url.trim(),
        config: { ...cfg, path: '/' },
        enabled: false,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      }
      await testLibraryConnection(testSource)
      toast('连接成功')
      setTested(true)
    } catch (e) {
      setTested(false)
      const reason = e instanceof WebDavError ? e.message : (e instanceof Error ? e.message : '未知错误')
      toast(`连接失败：${reason}`)
    } finally { setBusy(false) }
  }

  const handleSave = async () => {
    if (!cfg.url.trim()) {
      toast('请填写服务器地址')
      return
    }
    setBusy(true)
    try {
      const finalName = name.trim() || deriveLibraryName('webdav', cfg)
      if (draft) {
        await addLibrarySource({ kind: 'webdav', name: finalName, config: cfg, enabled: true })
      } else {
        await updateLibrarySource(source.id, { config: cfg, name: finalName, enabled: true })
      }
      await onSaved()
      onClose()
      toast('已保存')
    } finally { setBusy(false) }
  }

  const renderDirField = () => (
    <div className="field">
      <span className="field-label">选择目录</span>
      {picking ? (
        <LibraryDirPicker
          cfg={cfg}
          initialPath={cfg.path}
          onPick={(path) => {
            setCfg({ ...cfg, path })
            setPicking(false)
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <button
          className="dir-field-btn"
          onClick={() => setPicking(true)}
          type="button"
        >
          <span className="dir-field-path">{cfg.path || '/'}</span>
          <span style={{ color: 'var(--ink-faint)' }}>›</span>
        </button>
      )}
    </div>
  )

  return (
    <>
      <label className="field">
        <span className="field-label">服务器地址</span>
        <input type="url" placeholder="https://dav.example.com/dav"
          value={cfg.url} onChange={e => setCfg({ ...cfg, url: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span className="field-label">用户名</span>
        <input type="text" autoComplete="off"
          value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} />
      </label>
      <PasswordField
        label="密码"
        value={cfg.password}
        onChange={e => setCfg({ ...cfg, password: e.target.value })}
      />
      <label className="field">
        <span className="field-label">名称</span>
        <div className="name-test-row">
          <input type="text"
            placeholder={cfg.url ? `默认：${stripScheme(cfg.url)}` : '留空则按服务器地址自动生成'}
            value={name} onChange={e => setName(e.target.value)} />
          <button className="btn" disabled={busy} onClick={handleTest}>测试连接</button>
        </div>
      </label>

      {tested && renderDirField()}

      <div className="section-card-footer">
        {!draft && (
          <button className="btn" style={{ flex: 'none', padding: '8px 14px', color: 'var(--accent)' }}
            onClick={onRemove}>删除</button>
        )}
        <button className="btn primary" disabled={busy} onClick={handleSave}>保存</button>
      </div>
    </>
  )
}
