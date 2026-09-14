import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'foliate-js/view.js'
import type { FoliateRelocateDetail, FoliateSearchResult, FoliateView } from 'foliate-js/view.js'
import { db } from '../db'
import type { BookmarkRecord, BookRecord, ProgressRecord } from '../types'
import { useSettings, resolveTheme, useSystemDark, effectiveBrightness, BRIGHTNESS_BASE } from '../store/settings'
import { buildReaderCss, type LoadedFont } from '../lib/themeCss'
import { getLoadedFonts, getWallpaperUrl, loadAssets } from '../lib/assetService'
import { pullKosyncProgress, pushKosyncProgress } from '../lib/syncService'
import { pushBackHandler } from '../lib/backButton'
import { toast } from '../components/ui'
import { TocPanel, type TocItem } from '../components/TocPanel'
import { SettingsSheet } from '../components/SettingsSheet'

const SAVE_DEBOUNCE = 800
const KOSYNC_PUSH_DEBOUNCE = 15000

// Android WebView edge-to-edge 下 env() 不可用，原生会注入同名 CSS 变量；
// 注入前读到的是 "env(...)" 字符串，parseFloat 为 NaN，回退 0
const safePx = (name: string) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(v) ? v : 0
}

const hexToRgba = (hex: string, alpha: number): string => {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(0, 0, 0, ${alpha})`
  let s = m[1]
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  const n = parseInt(s, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const Reader = ({ bookId, onBack }: { bookId: number; onBack: () => void }) => {
  const { settings, update } = useSettings()
  const systemDark = useSystemDark()
  const [book, setBook] = useState<BookRecord | null>(null)
  const [view, setView] = useState<FoliateView | null>(null)
  const [ready, setReady] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(false)
  // 底部导航当前视图：'none' 为默认（进度滑块区+章节行展开、顶栏可见），
  // 'toc'/'settings' 为覆盖层视图（隐藏章节行与进度区、隐藏顶栏、页眉保持显示）
  const [panel, setPanel] = useState<'none' | 'toc' | 'settings'>('none')
  const [settingsTab, setSettingsTab] = useState('type')
  const [percent, setPercent] = useState(0)
  const [chapter, setChapter] = useState('')
  const [activeTocHref, setActiveTocHref] = useState<string | null>(null)
  const [fonts, setFonts] = useState<LoadedFont[]>([])
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null)
  const [secPage, setSecPage] = useState<{ cur: number; total: number } | null>(null)
  const [bookPage, setBookPage] = useState<{ cur: number; total: number } | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  // 下拉书签：下拉距离驱动正文跟手位移与丝带高度，>80 松手触发
  const [pullDist, setPullDist] = useState(0)
  const [pullDragging, setPullDragging] = useState(false)
  // 当前页标识（章节序号:章节内页码），驱动右上角常驻书签标记与切换逻辑
  const [pageKey, setPageKey] = useState<string | null>(null)
  // 全书搜索：输入防抖触发顶栏搜索条，结果计数 + 上下导航跳转
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FoliateSearchResult[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeq = useRef(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const bottombarRef = useRef<HTMLDivElement>(null)
  const extraRef = useRef<HTMLDivElement>(null)
  // 底栏高度与折叠区高度：不经 React state，由 ResizeObserver 直接写 CSS 变量，
  // 面板 bottom 逐帧跟随底栏顶边（绕开 React 渲染循环，避免动画期间跳变）
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kosyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDetail = useRef<FoliateRelocateDetail | null>(null)
  const lastSavedCfi = useRef<string | null>(null)
  const lastPushedCfi = useRef<string | null>(null)
  const viewRef = useRef<FoliateView | null>(null)
  const bookRef = useRef<BookRecord | null>(null)
  const tapHandlerRef = useRef<(clientX: number) => void>(() => {})
  const scrolledRef = useRef(false)
  const toggleBookmarkRef = useRef<() => void>(() => {})
  const panelRef = useRef(panel)
  const onBackRef = useRef(onBack)
  // 菜单可见状态与打开时的页面位置：供 "点击退出菜单 / 翻页后自动退出" 判定
  const chromeVisibleRef = useRef(false)
  const chromeOpenCfi = useRef<string | null>(null)
  // 拖动进度条/切换章节时不自动退出菜单（延迟重置，避免 relocate 事件立即触发退出）
  const progressDraggingRef = useRef(false)
  const progressDragTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chapterNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  panelRef.current = panel
  onBackRef.current = onBack
  chromeVisibleRef.current = chromeVisible

  const theme = resolveTheme(settings)
  const scrolled = settings.flow === 'scrolled'
  scrolledRef.current = scrolled
  // 翻页的页眉/页脚跟随由 paginator 的分层快照统一负责：正文 + 页眉页脚
  // 所在的 .reader-turn-root 被 [data-view-transition-root] 标成一个
  // view-transition 组（foliate-turn），翻页/拖拽时整页快照一起动，
  // 页码随翻页起点即刻 relocate 更新，无需宿主侧任何跟踪逻辑

  // 扁平化 TOC，用于上一章/下一章导航
  const flatToc = useMemo(() => {
    const flat: { label: string; href: string }[] = []
    const walk = (items?: TocItem[]) => {
      for (const item of items ?? []) {
        if (item.href) flat.push({ label: item.label ?? '未命名', href: item.href })
        walk(item.subitems)
      }
    }
    walk(view?.book?.toc as TocItem[] | undefined)
    return flat
  }, [view?.book?.toc])
  const tocIndex = flatToc.findIndex(t => activeTocHref != null && t.href === activeTocHref)
  const canPrevToc = tocIndex > 0
  const canNextToc = tocIndex >= 0 && tocIndex < flatToc.length - 1
  const goPrevToc = () => {
    if (!canPrevToc) return
    progressDraggingRef.current = true
    if (chapterNavTimer.current) clearTimeout(chapterNavTimer.current)
    chapterNavTimer.current = setTimeout(() => { progressDraggingRef.current = false }, 800)
    void view?.goTo(flatToc[tocIndex - 1].href)
  }
  const goNextToc = () => {
    if (!canNextToc) return
    progressDraggingRef.current = true
    if (chapterNavTimer.current) clearTimeout(chapterNavTimer.current)
    chapterNavTimer.current = setTimeout(() => { progressDraggingRef.current = false }, 800)
    void view?.goTo(flatToc[tocIndex + 1].href)
  }

  // ---- open book ----
  useEffect(() => {
    let cancelled = false
    let openedView: FoliateView | null = null

    const open = async () => {
      await loadAssets()
      setFonts(getLoadedFonts())
      setWallpaperUrl(getWallpaperUrl(settings.wallpaperId))

      const record = await db.books.get(bookId)
      if (cancelled) return
      if (!record) {
        toast('未找到书籍')
        onBack()
        return
      }
      bookRef.current = record
      setBook(record)

      const v = document.createElement('foliate-view') as FoliateView
      openedView = v
      viewRef.current = v

      v.addEventListener('relocate', (e: CustomEvent<FoliateRelocateDetail>) => {
        const d = e.detail
        latestDetail.current = d
        setPercent(d.fraction)
        percentRef.current = d.fraction
        if (d.tocItem?.label) setChapter(d.tocItem.label)
        if (d.tocItem?.href) setActiveTocHref(d.tocItem.href)
        scheduleSave()
        // 菜单打开时页面位置变化（滑动翻页/跳转）→ 自动退出菜单
        // 进度条拖动期间不退出；设置（页边距/字号等）改动引起的重新排版也会发
        // relocate 且 cfi 必然变化，但这不是用户导航，需在宽限窗口内忽略，
        // 否则拖动设置滑块时面板会被立即收起
        if (chromeVisibleRef.current && chromeOpenCfi.current != null
          && d.cfi && d.cfi !== chromeOpenCfi.current
          && !progressDraggingRef.current
          && Date.now() - lastSettingsApplyAt > 800) {
          setChromeVisible(false)
          // 覆盖层面板（目录/设置）随翻页一并退回默认视图
          setPanel('none')
        }
      })

      try {
        await v.open(record.file)
        if (cancelled) return
        applyRendererSettings(v, settings, getLoadedFonts())
        attachPageInfo(v)
        v.addEventListener('load', ev => {
          attachDocTapHandler(ev.detail.doc)
        })

        // foliate 的分页渲染依赖元素尺寸，必须先挂载再 init
        containerRef.current?.appendChild(v)
        setView(v)

        const saved = await db.progress.get(bookId)
        await v.init({ lastLocation: saved?.cfi })
        if (cancelled) return

        setReady(true)
        await db.books.update(bookId, { lastReadAt: Date.now() })

        // 原生注入 --safe-top 后重算页边距，保证页眉/页脚带随系统栏高度扩展
        for (const ms of [600, 1600]) {
          setTimeout(() => {
            if (!cancelled && viewRef.current) applyRendererSettings(viewRef.current, settings, getLoadedFonts())
          }, ms)
        }

        void syncFromKoreader(v, record, saved)
      } catch (err) {
        console.error(err)
        const detail = err instanceof Error ? `：${err.message}` : ''
        toast(`打开书籍失败${detail}，请重新导入该书以修复`)
        onBack()
      }
    }

    void open()
    return () => {
      cancelled = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (kosyncTimer.current) clearTimeout(kosyncTimer.current)
      void flushSave()
      openedView?.close()
      openedView?.remove()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // ---- apply settings live ----
  useEffect(() => {
    if (!view || !ready) return
    applyRendererSettings(view, settings, fonts)
    setWallpaperUrl(getWallpaperUrl(settings.wallpaperId))
  }, [view, ready, settings, fonts])

  // ---- apply assets after sheet operations ----
  const reloadAssets = useCallback(async () => {
    await loadAssets()
    setFonts(getLoadedFonts())
  }, [])

  // ---- bookmarks ----
  const loadBookmarks = async () => {
    const rows = await db.bookmarks.where('bookId').equals(bookId).toArray()
    rows.sort((a, b) => b.createdAt - a.createdAt)
    setBookmarks(rows)
  }

  useEffect(() => { void loadBookmarks() }, [bookId])

  // 当前页是否已有书签：页面级匹配（章节+页码），旧数据（无 pageKey）退化为 CFI 精确匹配。
  // 匹配规则须与 toggleBookmark 完全一致，否则丝带/按钮状态与实际切换行为脱节
  const hasMark = bookmarks.some(bm =>
    (pageKey != null && bm.pageKey === pageKey)
    || bm.cfi === latestDetail.current?.cfi)

  // 下拉切换书签：当前页已有书签则移除，否则添加；按页面去重避免重复标记
  const toggleBookmark = async () => {
    const d = latestDetail.current
    if (!d?.cfi) { toast('当前无可标记的位置'); return }
    const existing = bookmarks.find(bm =>
      (pageKey != null && bm.pageKey === pageKey) || bm.cfi === d.cfi)
    if (existing) {
      setBookmarks(prev => prev.filter(b => b !== existing && b.id !== existing.id))
      if (existing.id != null) await db.bookmarks.delete(existing.id)
      toast('已移除书签')
      return
    }
    const rec: BookmarkRecord = {
      bookId,
      cfi: d.cfi,
      label: chapter || bookRef.current?.title || '书签',
      percentage: d.fraction * 100,
      pageKey: pageKey ?? undefined,
      createdAt: Date.now(),
    }
    // 乐观更新保证松手瞬间丝带无闪烁地落入常驻位置
    setBookmarks(prev => [rec, ...prev])
    const id = await db.bookmarks.add(rec)
    setBookmarks(prev => prev.map(b => (b === rec ? { ...b, id } : b)))
    toast('已添加书签')
  }

  const goToBookmark = (bm: BookmarkRecord) => {
    void view?.goTo(bm.cfi)
    setPanel('none')
  }

  const deleteBookmark = async (bm: BookmarkRecord) => {
    if (bm.id != null) await db.bookmarks.delete(bm.id)
    void loadBookmarks()
  }

  toggleBookmarkRef.current = () => { void toggleBookmark() }

  // ---- search ----
  // 基于 foliate 原生 search：遍历全书收集 { cfi, excerpt }，
  // 匹配项自动高亮，跳转用 'foliate-search:' 前缀与高亮保持同步
  const runSearch = async (query: string) => {
    const v = viewRef.current
    if (!v) return
    const seq = ++searchSeq.current
    const q = query.trim()
    if (!q) {
      v.clearSearch()
      setSearchResults([])
      setSearchIndex(0)
      setSearching(false)
      return
    }
    setSearching(true)
    const results: FoliateSearchResult[] = []
    try {
      for await (const r of v.search({ query: q })) {
        if (searchSeq.current !== seq) break
        if (typeof r === 'string') break
        if ('subitems' in r && r.subitems) results.push(...r.subitems)
        else if ('cfi' in r && r.cfi) results.push(r)
      }
    } catch (err) {
      console.warn('search failed', err)
    }
    if (searchSeq.current !== seq) return
    setSearchResults(results)
    setSearchIndex(0)
    setSearching(false)
    if (results.length) void v.goTo(`foliate-search:${results[0].cfi}`)
    else toast('未找到相关内容')
  }

  const openSearch = () => {
    setPanel('none')
    setChromeVisible(true)
    setSearchOpen(true)
  }

  const closeSearch = useCallback(() => {
    searchSeq.current++
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
    viewRef.current?.clearSearch()
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchIndex(0)
    setSearching(false)
  }, [])

  const onSearchInput = (query: string) => {
    setSearchQuery(query)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void runSearch(query), 400)
  }

  const goToSearch = (i: number) => {
    const r = searchResults[i]
    if (!r) return
    setSearchIndex(i)
    void viewRef.current?.goTo(`foliate-search:${r.cfi}`)
  }

  // ---- progress persistence ----
  const flushSave = async () => {
    const d = latestDetail.current
    const b = bookRef.current
    if (!d || !b?.id) return
    if (d.cfi === lastSavedCfi.current) return
    const rec: ProgressRecord = {
      bookId: b.id,
      cfi: d.cfi,
      fraction: d.fraction,
      percentage: d.fraction,
      sectionIndex: d.section?.current ?? 0,
      updatedAt: Date.now(),
    }
    await db.progress.put(rec)
    lastSavedCfi.current = d.cfi
  }

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void flushSave()
      scheduleKosyncPush()
    }, SAVE_DEBOUNCE)
  }

  const scheduleKosyncPush = () => {
    if (kosyncTimer.current) clearTimeout(kosyncTimer.current)
    kosyncTimer.current = setTimeout(() => void pushKosync(), KOSYNC_PUSH_DEBOUNCE)
  }

  const pushKosync = async () => {
    const d = latestDetail.current
    const b = bookRef.current
    if (!d || !b || d.cfi === lastPushedCfi.current) return
    try {
      await pushKosyncProgress(b, {
        bookId: b.id!,
        cfi: d.cfi,
        fraction: d.fraction,
        percentage: d.fraction,
        sectionIndex: d.section?.current ?? 0,
        updatedAt: Date.now(),
      })
      lastPushedCfi.current = d.cfi
    } catch (e) {
      console.warn('kosync push failed', e)
    }
  }

  const syncFromKoreader = async (
    v: FoliateView, record: BookRecord, saved?: ProgressRecord,
  ) => {
    try {
      const remote = await pullKosyncProgress(record)
      if (!remote) return
      const localTime = saved?.updatedAt ?? 0
      if (remote.timestamp <= localTime) return
      if (remote.progress?.startsWith('epubcfi(')) await v.goTo(remote.progress)
      else await v.goToFraction(remote.percentage)
      toast('已从 KOReader 同步阅读进度')
    } catch (e) {
      console.warn('kosync pull failed', e)
    }
  }

  // ---- navigation ----
  // 点击翻页：禁用点击动画（tapAnimated=false）时临时移除 renderer 的 animated 属性
  // （点击立即切换，无 300ms 过渡），翻页完成后恢复（若全局 animated 开启）
  const turnPage = useCallback((dir: 1 | -1) => {
    const v = viewRef.current
    const r = v?.renderer
    if (!v) return
    // 阅读结束提示：已在最后一页时继续翻下一页 → 提示（翻到最后一页本身不提示）
    if (dir === 1 && r?.atEnd) {
      toast('已读完本书')
    }
    const hadAnim = r?.hasAttribute('animated') ?? false
    if (hadAnim && !settings.tapAnimated) r?.removeAttribute('animated')
    void (dir === 1 ? v.next() : v.prev()).finally(() => {
      if (hadAnim && !settings.tapAnimated) r?.setAttribute('animated', '')
    })
  }, [settings.tapAnimated])
  const goNext = useCallback(() => turnPage(1), [turnPage])
  const goPrev = useCallback(() => turnPage(-1), [turnPage])
  // 关闭菜单（顶/底栏）：面板一并退回默认视图，避免抽屉在菜单隐藏后残留
  const closeChrome = useCallback(() => {
    setChromeVisible(false)
    setPanel('none')
  }, [])
  const toggleChrome = useCallback(() => {
    if (chromeVisibleRef.current) {
      closeChrome()
      return
    }
    // 记录打开菜单时的页面位置，翻页后据此自动退出
    chromeOpenCfi.current = latestDetail.current?.cfi ?? null
    setPanel('none')
    setSearchOpen(false)
    setChromeVisible(true)
  }, [closeChrome])
  // 设置面板入口（主题/排版/设置三 Tab）：面板已打开且重复点击同一 Tab → 关闭面板
  // （保留导航状态；只有遮罩/返回/正文点击才会连导航一起收起）
  const openSettings = useCallback((tab: string) => {
    if (panel === 'settings' && settingsTab === tab) {
      setPanel('none')
      return
    }
    setSettingsTab(tab)
    setPanel('settings')
  }, [panel, settingsTab])

  const handleTap = useCallback((clientX: number) => {
    // 面板打开时点击正文（遮罩之外的边缘情形）：直接回阅读页
    if (panel !== 'none') { closeChrome(); return }
    // 搜索条展开时点击正文收起搜索条，不翻页
    if (searchOpen) { closeSearch(); return }
    // 菜单打开时点击正文任意位置：只退出菜单，不翻页
    if (chromeVisibleRef.current) { closeChrome(); return }
    if (!scrolled && settings.tapTurn) {
      const w = window.innerWidth
      // tapLeftNext（左手模式）：左右两侧点击均翻下一页，仅滑动翻上一页
      if (settings.tapLeftNext) {
        if (clientX < w * 0.3) { goNext(); return }
        if (clientX > w * 0.7) { goNext(); return }
      } else {
        if (clientX < w * 0.3) { goPrev(); return }
        if (clientX > w * 0.7) { goNext(); return }
      }
    }
    toggleChrome()
  }, [panel, searchOpen, scrolled, settings.tapTurn, settings.tapLeftNext, goPrev, goNext, toggleChrome, closeSearch, closeChrome])

  tapHandlerRef.current = handleTap

  // 全书进度镜像（view relocate 时更新）与全书 total 缓存：
  // bookPage.cur = round(percent × total)，percent 单调平滑，避免页码抖动
  const percentRef = useRef(0)
  const bookTotalRef = useRef<number | null>(null)

  // foliate 渲染器级 relocate 携带当前章节内的页面比例（fraction/size），
  // 据此换算章节页码；全书页码按"当前章 loc 密度"估算 total，
  // cur 用平滑的 percent × total（percent 来自 view relocate，单调无抖动）
  const attachPageInfo = (v: FoliateView) => {
    v.renderer?.addEventListener('relocate', e => {
      const d = (e as CustomEvent<{ index?: number; fraction?: number; size?: number }>).detail
      if (typeof d?.fraction !== 'number' || typeof d?.size !== 'number' || d.size <= 0) {
        setSecPage(null)
        setBookPage(null)
        setPageKey(null)
        bookTotalRef.current = null
        return
      }
      const total = Math.max(1, Math.round(1 / d.size))
      // 与渲染器实测页码校验：detail 与容器状态偏差过大（跨章中间态）时以实测为准。
      // 注意 foliate 的 page 因容器前后缓冲页偏移，第一页内容在视口时 page 已为 1
      // （1 基显示值），直接使用，不可 +1
      const rp = typeof v.renderer?.page === 'number' ? v.renderer.page : null
      const raw = Math.round(d.fraction / d.size) + 1
      const page = rp != null && Math.abs(rp - raw) <= 1 ? rp : Math.min(total, Math.max(1, raw))
      const cur = Math.min(total, Math.max(1, page))
      setSecPage({ cur, total })
      const idx = typeof d.index === 'number' ? d.index : -1
      setPageKey(`${idx}:${cur}`)

      const secs = (v.book?.sections ?? []) as Array<{ size?: number }>
      const secSize = secs[idx]?.size ?? 0
      const sizeTotal = secs.reduce((a, s) => a + (s.size ?? 0), 0)
      if (secSize > 0 && sizeTotal > 0) {
        const sizeBefore = secs.slice(0, idx).reduce((a, s) => a + (s.size ?? 0), 0)
        // 1500 = foliate view.js 中 SectionProgress 的 sizePerLoc
        const locPerPage = (secSize / 1500) * d.size
        const bTotal = Math.max(1, Math.round(sizeTotal / 1500 / locPerPage))
        // total 变化（跨章重估）时更新并跳转；total 不变时用平滑 percent 推进 cur
        if (bTotal !== bookTotalRef.current) {
          bookTotalRef.current = bTotal
          setBookPage({ cur: Math.min(bTotal, Math.max(1, Math.round(percentRef.current * bTotal))), total: bTotal })
        } else {
          setBookPage(prev => {
            if (!prev) return prev
            const bCur = Math.min(bTotal, Math.max(1, Math.round(percentRef.current * bTotal)))
            return prev.cur !== bCur ? { ...prev, cur: bCur } : prev
          })
        }
      } else {
        setBookPage(null)
        bookTotalRef.current = null
      }
    })
  }

  const attachDocTapHandler = (doc: Document) => {
    // 分页模式下 iframe 内容垂直溢出，浏览器会接管垂直拖动并派发 pointercancel，
    // 导致下拉手势中断。禁止垂直平移（pan-x）让 pointer 流完整保留；
    // 水平方向无溢出不受影响，滑动翻页照常。
    // 滚动模式必须恢复默认 touch-action（''）：pan-x 沿 DOM 祖先链生效，
    // 浏览器不处理垂直平移，滚动容器（overflow: auto）将无法触摸滚动
    doc.documentElement.style.touchAction = scrolledRef.current ? '' : 'pan-x'
    // foliate 的 paginator 会对 touchmove preventDefault 并转为滚动，
    // 合成的 click 事件因此不稳定（垂直微抖/按压稍久都会丢失），改用 pointer 事件自行判定 tap
    let downX = 0, downY = 0, downT = 0, downValid = false
    // 手势全程最大位移：轻扫翻页（松手位移可能很小）必须与轻点区分，
    // 只用松手瞬间的位移判定会把快速轻弹误判成 tap 打开菜单
    let maxMove = 0
    // 菜单打开时"滑动即退菜单"：用捕获阶段 touch 事件检测。
    // foliate 翻页会对 touchmove preventDefault（转滚动），pointer 流会提前
    // 收到 pointercancel 而中断，唯有 touch 捕获阶段必然最先收到移动事件，
    // 保证"先退菜单、再翻页"（阈值 10px，一动即退）
    let touchStart: { x: number; y: number } | null = null
    // 下拉书签：正文任意位置向下拖动即可（同微信读书，仅避开顶部系统手势区），
    // 正文跟手下滑、页眉章节进度右侧垂下书签丝带，超过阈值松手切换书签（有则移除、无则添加）。
    // 长按（选词）后拖动不触发下拉；滚动模式下垂直拖动是正常滚动，禁用；桌面鼠标拖选会干扰，仅触摸启用
    let pullActive = false
    let pullArmed = false
    doc.addEventListener('touchstart', e => {
      const t = e.touches[0]
      touchStart = t ? { x: t.clientX, y: t.clientY } : null
    }, { capture: true, passive: true })
    doc.addEventListener('touchmove', e => {
      if (!chromeVisibleRef.current || !touchStart) return
      const t = e.touches[0]
      if (!t) return
      const dx = Math.abs(t.clientX - touchStart.x)
      const dy = Math.abs(t.clientY - touchStart.y)
      // 移动超过 10px 即视为滑动，立即退出菜单
      if (dx > 10 || dy > 10) {
        touchStart = null
        setChromeVisible(false)
        setPanel('none')
      }
    }, { capture: true, passive: true })
    doc.addEventListener('pointerdown', e => {
      downValid = e.pointerType !== 'mouse' || e.button === 0
      downX = e.clientX
      downY = e.clientY
      downT = e.timeStamp
      maxMove = 0
      const win = doc.defaultView
      const rect = (win?.frameElement as HTMLElement | null)?.getBoundingClientRect()
      const winY = rect && win?.innerHeight
        ? rect.top + (e.clientY / win.innerHeight) * rect.height
        : e.clientY
      // 仅避开顶部系统手势区，正文其余区域均可下拉
      const top = safePx('--safe-top') + 30
      pullActive = e.pointerType === 'touch' && !scrolledRef.current
        && downValid && winY > top
      // 越过 20px 阈值后才持有 pullArmed，保证长按选词不被当成下拉
      pullArmed = false
    })
    // 菜单打开时开始拖动（任意方向 >10px）→ 立即退出菜单；同时负责"下拉锁"：
    // 下拉手势激活期间吞掉 touchmove（capture + stopImmediatePropagation 先于
    // foliate 的处理器），禁止左右滑动翻页造成抖动；一旦水平意图明确（>12px
    // 且水平为主）则放弃下拉改放行翻页。
    // 用 touchmove + capture：foliate 翻页会在 touchmove 上 preventDefault，
    // 导致 pointer 流被 pointercancel 提前中断（pointermove 位移未达阈值就被取消），
    // 而 touch 事件流是 foliate 自己翻页依赖的通道，必然触发；capture 阶段
    // 还先于 foliate 执行，保证"先退菜单、再翻页"的视觉顺序
    doc.addEventListener('touchmove', e => {
      // 1) 菜单打开：一动即退（阈值 10px）
      if (chromeVisibleRef.current) {
        const t0 = e.touches[0]
        if (t0 && touchStart) {
          const dmx = Math.abs(t0.clientX - touchStart.x)
          const dmy = Math.abs(t0.clientY - touchStart.y)
          if (dmx > 10 || dmy > 10) {
            touchStart = null
            setChromeVisible(false)
            setPanel('none')
          }
        }
      }
      // 2) 下拉锁：下拉手势激活期间吞掉所有未明确横滑的 touchmove，禁止左右翻页抖动；
      //    一旦水平意图明确（>12px 且水平为主）则放弃下拉并放行翻页
      if (pullActive) {
        const t = e.touches[0]
        if (t) {
          const dmx = Math.abs(t.clientX - downX)
          const dmy = t.clientY - downY
          if (dmx > 12 && dmx > Math.abs(dmy) * 0.8) {
            // 明确水平滑动意图 → 放弃下拉，交给 foliate 翻页
            pullActive = false
            pullArmed = false
            setPullDragging(false)
            setPullDist(0)
          } else {
            // 下拉进行中（含前几帧微抖）→ 吞掉，禁止左右滑动翻页
            e.stopImmediatePropagation()
          }
        }
      }
    }, { capture: true, passive: true })
    doc.addEventListener('pointermove', e => {
      maxMove = Math.max(maxMove, Math.hypot(e.clientX - downX, e.clientY - downY))
      // 菜单打开时出现明显水平滑动意图（>30px 且以水平为主）：
      // 立即退出菜单（先让出屏幕），随后 foliate 照常接收触摸完成翻页。
      // 仅触摸生效：鼠标悬停移动也会触发 pointermove（无需按下），
      // 若不加限制，唤出菜单后鼠标稍动就会误退菜单
      if (chromeVisibleRef.current && e.pointerType === 'touch') {
        const dmx = Math.abs(e.clientX - downX)
        const dmy = Math.abs(e.clientY - downY)
        if (dmx > 30 && dmx > dmy) {
          setChromeVisible(false)
          setPanel('none')
        }
      }
      if (!pullActive) return
      const dy = e.clientY - downY
      const dx = Math.abs(e.clientX - downX)
      // 水平滑动（翻页）立即取消下拉：位移 12px 且水平为主即可判定，
      // 防止跟手翻页时页面出现 translateY 抖动
      if ((dx > 12 && dx > Math.abs(dy) * 0.8) || dy < -10) {
        pullActive = false
        setPullDragging(false)
        setPullDist(0)
        return
      }
      if (!pullArmed) {
        // 长按超过 320ms 再拖动视为选词/选区，不触发下拉
        if (dy >= 20 && e.timeStamp - downT > 320) {
          pullActive = false
          setPullDragging(false)
          setPullDist(0)
          return
        }
        if (dy < 20) return
      }
      pullArmed = true
      setPullDragging(true)
      setPullDist(Math.min(Math.max(dy, 0), 150))
    })
    const resetPull = () => {
      pullActive = false
      pullArmed = false
      setPullDragging(false)
      setPullDist(0)
    }
    doc.addEventListener('pointercancel', resetPull)
    doc.addEventListener('pointerup', e => {
      if (pullActive && pullArmed) {
        const dy = e.clientY - downY
        const fired = dy > 80 && Math.abs(e.clientX - downX) < 48
        resetPull()
        if (fired) {
          toggleBookmarkRef.current()
          return
        }
        // 已越过下拉阈值（≥20px），松开不再视为 tap，避免回撤后误触翻页
        return
      }
      if (!downValid) return
      // 手势全程位移超过 20px（滑动/轻扫/拖动）不视为 tap：
      // 用 maxMove 而非松手瞬间位移，快速轻弹翻页不再误触菜单
      if (maxMove > 20) return
      if (e.timeStamp - downT > 700) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('a[href]')) return
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) {
        // 长按选词的 pointerup 已被时长过滤，此处是残留选区，清除后仍视为 tap
        sel.removeAllRanges()
      }
      // iframe 坐标系与窗口坐标系存在偏移/缩放，换算到窗口坐标供翻页区域判定
      const win = doc.defaultView
      const frameEl = win?.frameElement as HTMLElement | null
      const rect = frameEl?.getBoundingClientRect()
      const winX = rect && win?.innerWidth
        ? rect.left + (e.clientX / win.innerWidth) * rect.width
        : e.clientX
      tapHandlerRef.current(winX)
    })
  }

  // Android 返回键：原生桥调用 window.__androidBack()，
  // 阅读页内优先关面板（先回导航态），导航态再退 / 否则返回书架（见 lib/backButton.ts）
  useEffect(() => pushBackHandler(() => {
    if (panelRef.current !== 'none') {
      setPanel('none')
      return true
    }
    if (chromeVisibleRef.current) {
      setChromeVisible(false)
      return true
    }
    onBackRef.current()
    return true
  }), [])

  // keyboard navigation (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (searchOpen) { if (e.key === 'Escape') closeSearch(); return }
      // 面板打开时按 Escape：先回导航态（面板关、导航栏保持）
      if (panel !== 'none') { if (e.key === 'Escape') setPanel('none'); return }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goNext()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goPrev()
      else if (e.key === ' ') { e.preventDefault(); goNext() }
      else if (e.key === 'Escape') { setChromeVisible(false); setPanel('none') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, panel, searchOpen, closeSearch])

  // recompute px margins on resize
  useEffect(() => {
    if (!view || !ready) return
    const onResize = () => applyRendererSettings(view, settings, fonts)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [view, ready, settings, fonts])

  // 底栏高度变化（进度滑块区展开/收起、系统栏 inset 变化）→ 直接写 CSS 变量：
  // --panel-bottom（面板停靠位置，随动画逐帧更新，零 React 渲染开销）；
  // --extra-h（折叠区展开高度，仅在无动画时采样：首次挂载 + 过渡结束后，
  // 避免动画中间值污染 max-height 过渡目标导致展开卡住/折叠后无法恢复）
  useEffect(() => {
    const bar = bottombarRef.current
    const root = rootRef.current
    if (!bar) return
    const update = () => {
      root?.style.setProperty('--panel-bottom', `${bar.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    // 首次采样展开高度（此时无过渡动画）
    const extra = extraRef.current
    if (extra && panelRef.current === 'none') {
      root?.style.setProperty('--extra-h', `${extra.offsetHeight}px`)
    }
    // 折叠/展开动画结束后采样，保证 max-height 过渡无死区
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'max-height') return
      if (panelRef.current === 'none' && extra) {
        root?.style.setProperty('--extra-h', `${extra.offsetHeight}px`)
      }
    }
    extra?.addEventListener('transitionend', onTransitionEnd)
    return () => {
      ro.disconnect()
      extra?.removeEventListener('transitionend', onTransitionEnd)
    }
  }, [ready, book])

  // 组件卸载时清理定时器，避免写入已卸载组件
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (progressDragTimer.current) clearTimeout(progressDragTimer.current)
    if (chapterNavTimer.current) clearTimeout(chapterNavTimer.current)
  }, [])

  // ---- render ----
  // 工具栏毛玻璃：跟随阅读主题色，0.8 不透明度兼顾玻璃感与可读性
  const chromeStyle = {
    ['--reader-bg' as string]: settings.wallpaperId != null ? 'transparent' : theme.bg,
    ['--chrome-bg' as string]: hexToRgba(theme.bg, 0.8),
    ['--chrome-fg' as string]: theme.fg,
    ['--chrome-fg-soft' as string]: hexToRgba(theme.fg, 0.45),
    ['--chrome-line' as string]: hexToRgba(theme.fg, 0.28),
    ['--chrome-press' as string]: theme.dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
    // 面板（目录/设置）跟随阅读主题：覆盖全局 --surface/--ink 等变量，
    // 使弹层背景、文字、分隔线与主题色一致（仅作用于阅读页，书架页不受影响）
    ['--surface' as string]: theme.bg,
    ['--surface-2' as string]: `color-mix(in srgb, ${theme.bg} 90%, ${theme.fg})`,
    ['--paper' as string]: `color-mix(in srgb, ${theme.bg} 90%, ${theme.dark ? '#000' : theme.fg})`,
    ['--ink' as string]: theme.fg,
    ['--ink-soft' as string]: hexToRgba(theme.fg, 0.62),
    ['--ink-faint' as string]: hexToRgba(theme.fg, 0.4),
    ['--hairline' as string]: hexToRgba(theme.fg, 0.18),
    ['--accent' as string]: theme.dark ? '#cf6a5c' : '#b3423a',
    ['--accent-soft' as string]: theme.dark ? 'rgba(207, 106, 92, 0.16)' : 'rgba(179, 66, 58, 0.12)',
    ['--shadow' as string]: theme.dark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 32px rgba(43, 38, 32, 0.14)',
  }
  // 亮度：以 0.6 为基准（无滤镜），实际滤镜值 = 亮度 / 0.6，保证默认 60% 即原先 100% 效果
  const brightness = effectiveBrightness(settings, systemDark)
  const filterBrightness = brightness / BRIGHTNESS_BASE
  // 翻页快照（::view-transition-*）挂在文档根下，不在本元素滤镜子树内：
  // 只给 .reader-root 套滤镜的话，翻页瞬间快照会按原始亮度绘制，
  // 整页亮度跳回原值（翻页闪烁）。把同一滤镜写到根元素变量，
  // 由 paginator 注入的样式应用到 foliate-turn 快照组，两层亮度保持一致
  useEffect(() => {
    const root = document.documentElement
    if (filterBrightness !== 1) root.style.setProperty('--foliate-vt-filter', `brightness(${filterBrightness})`)
    else root.style.removeProperty('--foliate-vt-filter')
    return () => { root.style.removeProperty('--foliate-vt-filter') }
  }, [filterBrightness])
  return (
    <div
      ref={rootRef}
      className={`reader-root ${scrolled ? 'scrolled' : ''} ${chromeVisible ? '' : 'chrome-hidden'} ${panel !== 'none' ? 'panel-open' : ''} ${hasMark ? 'marked' : ''}`}
      style={{ ...chromeStyle, filter: filterBrightness !== 1 ? `brightness(${filterBrightness})` : undefined }}
    >
      {wallpaperUrl && (
        <div
          className="reader-wallpaper"
          style={{ backgroundImage: `url(${wallpaperUrl})` }}
        />
      )}

      {/* 翻页 VT 组根：正文 + 页眉页脚作为一个整页参与快照翻动，
          paginator 沿 shadow host 上溯找到 [data-view-transition-root] 命名它 */}
      <div className="reader-turn-root" data-view-transition-root="">
        <div
          ref={containerRef}
          className={`reader-content ${pullDragging ? 'pulling' : ''}`}
          style={pullDist > 0 ? { transform: `translateY(${pullDist * 0.45}px)` } : undefined}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.tagName === 'IFRAME') return
            if (target.closest?.('.reader-topbar, .reader-bottombar')) return
            handleTap(e.clientX)
          }}
        />

        {ready && book && (
          <>
            <div className="reader-head">
              <span className="reader-head-title">{chapter || book.title}</span>
              {secPage && <span className="reader-head-pages">{secPage.cur}/{secPage.total}</span>}
              <div
                className={`pull-ribbon ${hasMark || pullDist > 80 ? 'ready' : ''} ${pullDragging ? 'dragging' : ''}`}
                style={{ height: pullDist > 0 ? Math.min(pullDist, 110) : hasMark ? 22 : 0 }}
              />
            </div>
            <div className="reader-foot">
              <span className="reader-foot-pages">
                {bookPage ? `${bookPage.cur}/${bookPage.total}` : `${Math.round(percent * 100)}%`}
              </span>
            </div>
          </>
        )}
      </div>

      {!ready && (
        <div className="loading-screen" style={{ background: theme.bg, color: theme.fg }}>
          <div className="seal-spin" />
          <div>展 卷</div>
        </div>
      )}

      {ready && book && (
        <>
          {!searchOpen && (
            <div className="reader-topbar">
              <button className="icon-btn" onClick={onBack} aria-label="返回">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
              </button>
              <div className="reader-title">{book.title}</div>
              <div className="reader-topbar-actions">
                <button
                  className={`icon-btn ${hasMark ? 'active' : ''}`}
                  onClick={() => void toggleBookmark()}
                  aria-label={hasMark ? '删除书签' : '添加书签'}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill={hasMark ? 'currentColor' : 'none'} />
                  </svg>
                </button>
                <button className="icon-btn" onClick={openSearch} aria-label="搜索">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
              </div>
            </div>
          )}

          {searchOpen && (
            <div className="reader-searchbar">
              <div className="searchbar-row">
                <button className="icon-btn" onClick={closeSearch} aria-label="关闭搜索">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
                <input
                  className="search-input"
                  type="text"
                  placeholder="搜索全书内容…"
                  autoFocus
                  value={searchQuery}
                  onChange={e => onSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (searchTimer.current) clearTimeout(searchTimer.current)
                      void runSearch(searchQuery)
                    }
                  }}
                />
                {searchQuery && (
                  <button className="icon-btn" onClick={() => onSearchInput('')} aria-label="清空">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5l-5 5m0-5 5 5"/></svg>
                  </button>
                )}
              </div>
              <div className="searchbar-nav">
                {searching ? (
                  <span className="search-status">搜索中…</span>
                ) : searchResults.length > 0 ? (
                  <>
                    <span className="search-count">{searchIndex + 1}/{searchResults.length}</span>
                    <button className="search-nav-btn" disabled={searchIndex <= 0} onClick={() => goToSearch(searchIndex - 1)}>上一个</button>
                    <button className="search-nav-btn" disabled={searchIndex >= searchResults.length - 1} onClick={() => goToSearch(searchIndex + 1)}>下一个</button>
                  </>
                ) : searchQuery.trim() ? (
                  <span className="search-status">未找到相关内容</span>
                ) : null}
              </div>
            </div>
          )}

          <div className="reader-bottombar" ref={bottombarRef}>
            {/* 章节行（章节名 + 上一章/下一章）与进度滑块区：始终挂载，
                目录/设置覆盖层打开或进度选项收起时由 CSS 高度过渡平滑折叠（bottombar-extra），
                避免 DOM 卸载导致底栏高度瞬时跳变 */}
            <div className="bottombar-extra" ref={extraRef}>
              <div className="meta-row">
                <button className="meta-nav" disabled={!canPrevToc} onClick={goPrevToc} aria-label="上一章">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span className="meta-chapter">{chapter || book.title}</span>
                <button className="meta-nav" disabled={!canNextToc} onClick={goNextToc} aria-label="下一章">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
              <div className="progress-row">
                <span className="progress-edge">
                  <svg width="20" height="20" viewBox="0 0 32 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round">
                    <circle cx="16" cy="12" r="8" />
                    <path d="M0 12h5M27 12h5" />
                  </svg>
                </span>
                <input
                  className="progress-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={percent}
                  onPointerDown={() => {
                    progressDraggingRef.current = true
                    if (progressDragTimer.current) { clearTimeout(progressDragTimer.current); progressDragTimer.current = null }
                  }}
                  onPointerUp={() => {
                    // 松手后延迟 600ms 再重置标志，避免 relocate 事件立即触发退出菜单
                    progressDragTimer.current = setTimeout(() => { progressDraggingRef.current = false }, 600)
                  }}
                  onPointerCancel={() => {
                    progressDragTimer.current = setTimeout(() => { progressDraggingRef.current = false }, 600)
                  }}
                  onChange={e => {
                    const frac = parseFloat(e.target.value)
                    setPercent(frac)
                    void view?.goToFraction(frac)
                  }}
                />
                <span className="progress-value">{Math.round(percent * 100)}%</span>
              </div>
            </div>
            <div className="bar-actions">
              <button
                className={`bar-action ${panel === 'toc' ? 'active' : ''}`}
                onClick={() => setPanel(p => (p === 'toc' ? 'none' : 'toc'))}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
              </button>
              <button
                className={`bar-action ${panel === 'settings' && settingsTab === 'theme' ? 'active' : ''}`}
                onClick={() => openSettings('theme')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>
              </button>
              <button
                className={`bar-action ${panel === 'settings' && settingsTab === 'type' ? 'active' : ''}`}
                onClick={() => openSettings('type')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19 12 5l8 14"/><path d="M6.8 14.5h10.4"/></svg>
              </button>
              <button
                className={`bar-action ${panel === 'settings' && settingsTab === 'page' ? 'active' : ''}`}
                onClick={() => openSettings('page')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </button>
            </div>
          </div>

          {pullDist > 30 && (
            <div className={`pull-tip ${pullDist > 80 ? 'ready' : ''}`}>
              {hasMark
                ? (pullDist > 80 ? '松手移除书签' : '下拉移除书签')
                : (pullDist > 80 ? '松手添加书签' : '下拉添加书签')}
            </div>
          )}

          <div className={`toc-drawer ${panel === 'toc' ? 'open' : ''}`}>
            {/* 点击遮罩：直接回阅读页（连同导航一起收起） */}
            <div className="toc-mask" onClick={closeChrome} />
            <div className="toc-drawer-body">
              <TocPanel
                open={panel === 'toc'}
                onClose={closeChrome}
                toc={view?.book?.toc as TocItem[] | undefined}
                activeHref={activeTocHref}
                onNavigate={href => {
                  void view?.goTo(href)
                  setPanel('none')
                }}
                bookTitle={book.title}
                bookTotalPages={bookPage?.total ?? null}
                bookmarks={bookmarks}
                currentMarked={hasMark}
                onAddBookmark={() => void toggleBookmark()}
                onGoToBookmark={goToBookmark}
                onDeleteBookmark={bm => void deleteBookmark(bm)}
              />
            </div>
          </div>

          <SettingsSheet
            open={panel === 'settings'}
            onClose={closeChrome}
            onAssetsChanged={reloadAssets}
            currentBookId={bookId}
            initialTab={settingsTab}
          />
        </>
      )}
    </div>
  )
}

// 最近一次设置改动的时间戳：设置引起的重新排版会触发 relocate（cfi 变化），
// relocate 里的"翻页自动退出菜单"逻辑据此在宽限窗口内忽略，避免拖滑块时面板被收起
let lastSettingsApplyAt = 0

function applyRendererSettings(
  view: FoliateView,
  settings: ReturnType<typeof useSettings.getState>['settings'],
  fonts: LoadedFont[],
) {
  const r = view.renderer
  if (!r) return
  lastSettingsApplyAt = Date.now()
  r.setAttribute('flow', settings.flow)
  // 同步 iframe 的 touch-action：分页模式禁垂直平移（pan-x）保 pointer 流（下拉书签），
  // 滚动模式恢复默认允许垂直滚动。flow 切换不重载 iframe，attachDocTapHandler 在
  // load 时设置的 pan-x 会残留，导致滚动模式无法触摸滚动，必须在此同步。
  // Paginator 未暴露 document 属性，须经 getContents() 取当前章节的 iframe document
  const rdoc = r.getContents?.()[0]?.doc ?? null
  if (rdoc?.documentElement) {
    rdoc.documentElement.style.touchAction = settings.flow === 'scrolled' ? '' : 'pan-x'
  }
  r.setAttribute('gap', `${settings.marginH}%`)
  // 页眉/页脚位于正文与屏幕边缘之间：需要容纳 系统栏(inset) + 正文上下留白。
  // 上下按各自的安全区 inset 分别计算，不再取 max——否则较小的一侧（通常是底部
  // 手势条）被顶部状态栏高度撑大，形成"底部多出一截隐藏边距"。
  const halfV = window.innerHeight * settings.marginV / 100 * 0.5
  const marginFor = (inset: number) => Math.max(16, Math.round(inset + halfV))
  const scrolled = settings.flow === 'scrolled'
  // 滚动模式：留白带仅容纳系统状态栏（页眉页脚容器已隐藏），
  // 正文上下留白由 iframe padding 提供（margin 单值 = halfV）
  const marginTopPx = scrolled ? Math.round(safePx('--safe-top')) : marginFor(safePx('--safe-top'))
  const marginBottomPx = scrolled ? Math.round(safePx('--safe-bottom')) : marginFor(safePx('--safe-bottom'))
  // margin：单值基准，供滚动模式 padding（margin*1.5）与图片高度约束使用，
  // 分页模式取两侧较大值保证任何模式下系统栏都被覆盖
  r.setAttribute('margin', `${scrolled ? Math.round(halfV) : Math.max(marginTopPx, marginBottomPx)}px`)
  // margin-top/bottom：分页模式下外层上下留白带各自精确分配
  r.setAttribute('margin-top', `${marginTopPx}px`)
  r.setAttribute('margin-bottom', `${marginBottomPx}px`)
  // 应用层页眉/页脚（.reader-head/.reader-foot）与 paginator 留白带对齐：
  // 覆盖层以带高为自身高度、文字垂直居中，不再用固定 16px 偏移——
  // 否则 marginV 调小后留白带矮于 16px 偏移时，页眉会压住正文第一行
  document.documentElement.style.setProperty('--head-band', `${marginTopPx}px`)
  document.documentElement.style.setProperty('--foot-band', `${marginBottomPx}px`)
  if (settings.animated) r.setAttribute('animated', '')
  else r.removeAttribute('animated')
  // 翻页动画仅在分页模式生效（滚动模式无翻页动画）；
  // 覆盖/仿真/滑动三种横排翻页都由 paginator 的分层快照 + 拖拽擦洗负责
  if (settings.flow === 'paginated') r.setAttribute('turn-style', settings.turnStyle)
  else r.removeAttribute('turn-style')
  document.documentElement.style.setProperty('--foliate-vt-bg', resolveTheme(settings).bg)
  r.setStyles?.(buildReaderCss(settings, fonts))
}
