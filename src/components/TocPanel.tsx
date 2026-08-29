import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookmarkRecord } from '../types'

export interface TocItem {
  label?: string
  href?: string
  subitems?: TocItem[]
}

interface TreeNode {
  key: string
  label: string
  href: string
  depth: number
  /** 目录树中的全局序号，用于估算页码 */
  ordinal: number
  children: TreeNode[]
}

const buildTree = (items: TocItem[] | undefined, depth = 0, base = { n: 0 }): TreeNode[] =>
  (items ?? []).flatMap(item => {
    if (!item) return []
    const node: TreeNode = {
      key: `${item.href ?? 'x'}-${base.n}`,
      label: item.label ?? '未命名',
      href: item.href ?? '',
      depth,
      ordinal: base.n++,
      children: item.subitems?.length ? buildTree(item.subitems, depth + 1, base) : [],
    }
    return [node]
  })

const countNodes = (nodes: TreeNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)

export const TocPanel = ({
  toc, activeHref, onNavigate, bookTitle, bookTotalPages,
  bookmarks, currentMarked, onAddBookmark, onGoToBookmark, onDeleteBookmark, open, onClose,
}: {
  toc: TocItem[] | undefined
  activeHref: string | null
  onNavigate: (href: string) => void
  bookTitle: string
  bookTotalPages: number | null
  bookmarks: BookmarkRecord[]
  currentMarked: boolean
  onAddBookmark: () => void
  onGoToBookmark: (bm: BookmarkRecord) => void
  onDeleteBookmark: (bm: BookmarkRecord) => void
  open: boolean
  onClose: () => void
}) => {
  const [tab, setTab] = useState<'toc' | 'marks'>('toc')
  // 切换方向：marks 在右（左滑进入），toc 在左（右滑进入），用于滑入动画方向
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  // 左右滑动切换目录/书签：记录起点，松手时判定水平位移
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  // 小白条拖拽关闭：向下拖动跟手，超过阈值松手关闭面板
  const gripRef = useRef<HTMLDivElement>(null)
  const gripDragRef = useRef<{ startY: number; body: HTMLElement | null } | null>(null)

  const onGripPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const body = gripRef.current?.closest('.toc-drawer-body') as HTMLElement | null
    if (!body) return
    gripDragRef.current = { startY: e.clientY, body }
    body.style.transition = 'none'
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onGripPointerMove = (e: React.PointerEvent) => {
    const drag = gripDragRef.current
    if (!drag) return
    const dy = Math.max(0, e.clientY - drag.startY)
    drag.body.style.transform = `translateY(${dy}px)`
  }

  const onGripPointerUp = (e: React.PointerEvent) => {
    const drag = gripDragRef.current
    gripDragRef.current = null
    if (!drag) return
    const dy = e.clientY - drag.startY
    drag.body.style.transition = ''
    if (dy > 100) {
      drag.body.style.transform = ''
      onClose()
    } else {
      drag.body.style.transform = ''
    }
  }

  const switchTab = (next: 'toc' | 'marks') => {
    if (next === tab) return
    setSlideDir(next === 'marks' ? 'left' : 'right')
    setTab(next)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current
    swipeRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // 水平 60px 以上且明显大于垂直位移，避免与列表滚动/按钮点击冲突
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    // 输入框内滑动可能是在选词/移动光标，不切换
    if ((e.target as HTMLElement).closest?.('input')) return
    if (dx < 0 && tab === 'toc') switchTab('marks')
    else if (dx > 0 && tab === 'marks') switchTab('toc')
  }

  const tree = useMemo(() => buildTree(toc), [toc])
  const total = useMemo(() => Math.max(countNodes(tree), 1), [tree])

  useEffect(() => {
    setCollapsed(new Set())
  }, [toc])

  // 面板打开时滚动到当前章节
  useEffect(() => {
    if (!open || tab !== 'toc') return
    const el = scrollRef.current?.querySelector('.toc-row.active')
    if (el) {
      const container = scrollRef.current!
      const top = (el as HTMLElement).offsetTop - container.clientHeight / 2 + el.clientHeight
      container.scrollTo({ top: Math.max(0, top) })
    }
  }, [open, tab, tree])

  const pageOf = (ordinal: number) =>
    bookTotalPages ? Math.max(1, Math.round(((ordinal + 1) / total) * bookTotalPages)) : null

  const matchQuery = (node: TreeNode): boolean => {
    if (!query) return true
    if (node.label.toLowerCase().includes(query.toLowerCase())) return true
    return node.children.some(matchQuery)
  }

  const renderNodes = (nodes: TreeNode[]) => nodes.map(node => {
    if (!matchQuery(node)) return null
    const isParent = node.children.length > 0
    const isCollapsed = collapsed.has(node.key)
    const active = node.href === activeHref
    return (
      <div key={node.key} className="toc-node">
        <div className={`toc-row ${active ? 'active' : ''}`} style={{ paddingLeft: 16 + node.depth * 22 }}>
          <button
            className="toc-row-main"
            onClick={() => {
              if (isParent && isCollapsed) {
                setCollapsed(prev => { const next = new Set(prev); next.delete(node.key); return next })
              } else if (node.href) {
                onNavigate(node.href)
              }
              if (isParent && !isCollapsed && !node.href) {
                setCollapsed(prev => { const next = new Set(prev); next.add(node.key); return next })
              }
            }}
          >
            <span className="toc-label">{node.label}</span>
          </button>
          <span className="toc-page">{pageOf(node.ordinal)}</span>
          {isParent ? (
            <button
              className={`toc-caret ${isCollapsed ? 'collapsed' : ''}`}
              aria-label={isCollapsed ? '展开' : '折叠'}
              onClick={() => setCollapsed(prev => {
                const next = new Set(prev)
                if (next.has(node.key)) next.delete(node.key)
                else next.add(node.key)
                return next
              })}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          ) : (
            <span className="toc-caret-spacer" />
          )}
        </div>
        {isParent && !isCollapsed && !query && renderNodes(node.children)}
      </div>
    )
  })

  const fmtTime = (ts: number) => {
    const d = new Date(ts)
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const today = new Date()
    return d.toDateString() === today.toDateString()
      ? `今天 ${hm}`
      : `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <div className="toc-panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        ref={gripRef}
        className="toc-grip"
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
      />
      <div className="toc-tabs">
        <button className={`toc-tab ${tab === 'toc' ? 'on' : ''}`} onClick={() => switchTab('toc')}>目录</button>
        <button className={`toc-tab ${tab === 'marks' ? 'on' : ''}`} onClick={() => switchTab('marks')}>
          书签{bookmarks.length ? ` ${bookmarks.length}` : ''}
        </button>
      </div>

      <div key={tab} className={`toc-tab-body ${slideDir === 'left' ? 'slide-left' : 'slide-right'}`}>
        {tab === 'toc' ? (
        <>
          <div className="toc-book-title">{bookTitle}</div>
          <div className="toc-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input
              type="text"
              placeholder="搜索目录…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="toc-scroll" ref={scrollRef}>
            {tree.length === 0 ? (
              <div className="toc-empty">此书没有目录</div>
            ) : renderNodes(tree)}
          </div>
        </>
      ) : (
        <>
          <button className="toc-add-mark" onClick={onAddBookmark}>
            {currentMarked ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z" fill="currentColor" stroke="none"/></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            )}
            {currentMarked ? '移除当前页书签' : '在当前位置添加书签'}
          </button>
          <div className="toc-scroll">
            {bookmarks.length === 0 ? (
              <div className="toc-empty">还没有书签</div>
            ) : (
              bookmarks.map(bm => (
                <div key={bm.id} className="mark-row">
                  <button className="mark-main" onClick={() => onGoToBookmark(bm)}>
                    <span className="mark-label">{bm.label}</span>
                    <span className="mark-meta">{bm.percentage.toFixed(1)}% · {fmtTime(bm.createdAt)}</span>
                  </button>
                  <button className="mark-del" aria-label="删除书签" onClick={() => onDeleteBookmark(bm)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
      </div>
    </div>
  )
}
