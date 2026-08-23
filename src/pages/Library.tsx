import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { db } from '../db'
import { pushBackHandler } from '../lib/backButton'
import { deleteBook, importBookFile } from '../lib/bookService'
import { toast, confirmDialog } from '../components/ui'
import { SyncPanel } from '../components/SyncPanel'

interface BookRow {
  id: number
  title: string
  author: string
  coverUrl: string | null
  percentage: number
  lastReadAt: number | undefined
  addedAt: number
}

type Tab = 'shelf' | 'recent' | 'mine'
type SortMode = 'recent' | 'added' | 'title'
type Menu = 'sort' | 'more' | null

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'recent', label: '最近阅读' },
  { id: 'added', label: '导入时间' },
  { id: 'title', label: '书名' },
]

const TAB_TITLES: Record<Tab, string> = { shelf: '全部书籍', recent: '最近', mine: '我的' }

const SORT_KEY = 'clipreader.sort'
const loadSort = (): SortMode => {
  const saved = localStorage.getItem(SORT_KEY)
  return SORTS.some(s => s.id === saved) ? saved as SortMode : 'recent'
}

const formatPct = (v: number) => `${Math.round(v * 100)}%`

const formatReadTime = (t: number) => {
  const d = new Date(t)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d.toDateString() === now.toDateString()) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const yesterday = new Date(now.getTime() - 86400000)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

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
const IconClock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
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

  const recentRows = useMemo(
    () => rows.filter(r => r.lastReadAt).sort((a, b) => b.lastReadAt! - a.lastReadAt!),
    [rows])

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
      const file = new File([blob], '三国演义·青梅煮酒.epub', { type: 'application/epub+zip' })
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
              <div className="home-title">{TAB_TITLES[tab]}</div>
            )}
            <button className="icon-btn" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="菜单">
              <IconMenu />
            </button>
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

        {tab === 'recent' && (recentRows.length === 0 ? (
          <div className="library-empty">
            <div className="glyph">阅</div>
            <h2>还没有阅读记录</h2>
            <p>打开一本书<br />下次可以从这里继续</p>
          </div>
        ) : (
          <div className="recent-list">
            {recentRows.map((row, i) => (
              <button
                key={row.id}
                className="recent-item"
                style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
                onClick={() => onOpen(row.id)}
                {...pressProps(row)}
              >
                <div className="recent-cover">
                  {coverUrls.get(row.id) ? (
                    <img src={coverUrls.get(row.id)} alt={row.title} />
                  ) : (
                    <div className="cover-fallback">{row.title}</div>
                  )}
                </div>
                <div className="recent-info">
                  <div className="recent-title">{row.title}</div>
                  <div className="recent-meta">{row.author}</div>
                  <div className="recent-bottom">
                    <span className="recent-progress">
                      {row.percentage > 0 ? `已读 ${formatPct(row.percentage)}` : '未开始'}
                    </span>
                    <span>{formatReadTime(row.lastReadAt!)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}

        {tab === 'mine' && (
          <div className="mine-page">
            <div className="mine-brand">
              <div className="mine-logo">夹页<span className="seal" /></div>
              <div className="mine-slogan">一页一世界</div>
              <div className="mine-version">v0.1.2</div>
            </div>
            <div className="mine-section">
              <div className="mine-section-title">数据同步</div>
              <SyncPanel />
            </div>
            <div className="mine-section">
              <div className="mine-section-title">关于</div>
              <div className="mine-about">
                夹页是一款本地优先的 EPUB 阅读器。书籍与阅读数据保存在设备本地，支持自定义排版、主题与字体，可通过 WebDAV 云备份，并与 KOReader 同步阅读进度。
              </div>
            </div>
          </div>
        )}
      </div>

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
        <button className={`nav-item ${tab === 'recent' ? 'active' : ''}`} onClick={() => setTab('recent')}>
          <IconClock /><span>最近</span>
        </button>
        <button className={`nav-item ${tab === 'shelf' ? 'active' : ''}`} onClick={() => setTab('shelf')}>
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
