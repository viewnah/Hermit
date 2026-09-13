const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const debounce = (f, wait, immediate) => {
    let timeout
    return (...args) => {
        const later = () => {
            timeout = null
            if (!immediate) f(...args)
        }
        const callNow = immediate && !timeout
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(later, wait)
        if (callNow) f(...args)
    }
}

const lerp = (min, max, x) => x * (max - min) + min
const easeOutQuad = x => 1 - (1 - x) * (1 - x)
const animate = (a, b, duration, ease, render) => new Promise(resolve => {
    let start
    const step = now => {
        start ??= now
        const fraction = Math.min(1, (now - start) / duration)
        render(lerp(a, b, ease(fraction)))
        if (fraction < 1) requestAnimationFrame(step)
        else resolve()
    }
    requestAnimationFrame(step)
})

// 分层翻页（覆盖/仿真/滑动）的 ::view-transition 伪元素挂在文档根部，
// 只能从顶层文档注入样式，paginator 自己的 shadow root 管不到。
// 参考 Readest：整个「页面卡片」（正文 + 宿主页眉页脚）被宿主以
// [data-view-transition-root] 标成一个 VT 组（foliate-turn），翻页快照
// 整体移动，页眉页脚自然跟随；拖拽通过暂停/擦洗动画跟手
const VT_STYLE_ID = 'foliate-view-transition-styles'
const injectViewTransitionStyles = () => {
    if (document.getElementById(VT_STYLE_ID)) return
    const style = document.createElement('style')
    style.id = VT_STYLE_ID
    style.textContent = `
        .foliate-vt::view-transition { pointer-events: none; }
        .foliate-vt::view-transition-old(root),
        .foliate-vt::view-transition-new(root) { animation: none; }
        /* 翻页的两层必须互相遮挡而非 plus-lighter 混合，且垫上页面底色 */
        .foliate-vt::view-transition-old(foliate-turn),
        .foliate-vt::view-transition-new(foliate-turn) {
            animation: none;
            background: var(--foliate-vt-bg, Canvas);
            mix-blend-mode: normal;
        }
        /* 覆盖：前进=旧页带阴影滑出露出静止新页，后退=新页滑入盖住旧页 */
        .foliate-vt-cover.foliate-vt-forward::view-transition-old(foliate-turn) {
            z-index: 1;
            animation: foliate-turn-out-left 300ms cubic-bezier(.25,.46,.45,.94) both;
            box-shadow: 0 0 24px rgba(0, 0, 0, .35);
        }
        .foliate-vt-cover.foliate-vt-forward.foliate-vt-right::view-transition-old(foliate-turn) {
            animation-name: foliate-turn-out-right;
        }
        .foliate-vt-cover.foliate-vt-backward::view-transition-new(foliate-turn) {
            z-index: 1;
            animation: foliate-turn-in-left 300ms cubic-bezier(.25,.46,.45,.94) both;
            box-shadow: 0 0 24px rgba(0, 0, 0, .35);
        }
        .foliate-vt-cover.foliate-vt-backward.foliate-vt-right::view-transition-new(foliate-turn) {
            animation-name: foliate-turn-in-right;
        }
        /* 滑动：旧页滑出、新页同步跟进（双页同动的连环画式翻页），
           两层全程错位不相交，无需 z-index 与阴影 */
        .foliate-vt-slide.foliate-vt-forward::view-transition-old(foliate-turn) {
            animation: foliate-turn-out-left 300ms cubic-bezier(.25,.46,.45,.94) both;
        }
        .foliate-vt-slide.foliate-vt-forward::view-transition-new(foliate-turn) {
            animation: foliate-turn-in-right 300ms cubic-bezier(.25,.46,.45,.94) both;
        }
        .foliate-vt-slide.foliate-vt-forward.foliate-vt-right::view-transition-old(foliate-turn) {
            animation-name: foliate-turn-out-right;
        }
        .foliate-vt-slide.foliate-vt-forward.foliate-vt-right::view-transition-new(foliate-turn) {
            animation-name: foliate-turn-in-left;
        }
        .foliate-vt-slide.foliate-vt-backward::view-transition-old(foliate-turn) {
            animation: foliate-turn-out-right 300ms cubic-bezier(.25,.46,.45,.94) both;
        }
        .foliate-vt-slide.foliate-vt-backward::view-transition-new(foliate-turn) {
            animation: foliate-turn-in-left 300ms cubic-bezier(.25,.46,.45,.94) both;
        }
        .foliate-vt-slide.foliate-vt-backward.foliate-vt-right::view-transition-old(foliate-turn) {
            animation-name: foliate-turn-out-left;
        }
        .foliate-vt-slide.foliate-vt-backward.foliate-vt-right::view-transition-new(foliate-turn) {
            animation-name: foliate-turn-in-right;
        }
        /* 仿真：透明圆盘从书外侧下角（eat 类切换起点）向外生长成折痕弧，
           旧页沿弧线被"卷走"；两个方向都只动旧页，新页静止在下。
           Chrome 不给活的 new 层画 mask、只画静态 old 快照，所以后退也编排
           旧页从书脊侧退去，读感等同新页展开。6% 是卷起的软边渐变带 */
        .foliate-vt-curl::view-transition-old(foliate-turn) {
            z-index: 1;
            -webkit-mask-image: radial-gradient(circle at var(--foliate-fold-x, 108%) 108%,
                transparent calc(var(--foliate-fold) - 6%), black var(--foliate-fold));
            mask-image: radial-gradient(circle at var(--foliate-fold-x, 108%) 108%,
                transparent calc(var(--foliate-fold) - 6%), black var(--foliate-fold));
            animation: foliate-turn-curl-fold 450ms cubic-bezier(.3,.1,.4,1) both;
        }
        .foliate-vt-curl::view-transition-new(foliate-turn) {
            animation: none;
        }
        /* 手指跟手拖拽把位移直接映射到动画时间，必须线性；
           部分 Android WebView 暴露不了 UA 伪元素动画的 updateTiming，
           在 CSS 源头声明线性兜底 */
        .foliate-vt-scrub::view-transition-old(foliate-turn),
        .foliate-vt-scrub::view-transition-new(foliate-turn) {
            animation-timing-function: linear !important;
        }
        /* 折痕起点：默认外侧角（eat-right，108% 108%）；后退/RTL 从书脊侧角扫过 */
        .foliate-vt-curl.foliate-vt-eat-left { --foliate-fold-x: -8%; }
        /* 注册成 <percentage> 才能在 keyframes 里插值，驱动 mask 的渐变断点逐帧重绘 */
        @property --foliate-fold {
            syntax: '<percentage>';
            inherits: false;
            initial-value: 0%;
        }
        @keyframes foliate-turn-out-left { to { transform: translateX(-100%) } }
        @keyframes foliate-turn-out-right { to { transform: translateX(100%) } }
        @keyframes foliate-turn-in-left { from { transform: translateX(-100%) } }
        @keyframes foliate-turn-in-right { from { transform: translateX(100%) } }
        @keyframes foliate-turn-curl-fold {
            from { --foliate-fold: 0%; }
            to { --foliate-fold: 118%; }
        }
    `
    document.head.append(style)
}

// 拖拽跟手与松手决策的参数（Readest 同款）
const VIEW_TRANSITION_CLASSES = [
    'foliate-vt', 'foliate-vt-cover', 'foliate-vt-curl', 'foliate-vt-slide',
    'foliate-vt-scrub',
    'foliate-vt-forward', 'foliate-vt-backward',
    'foliate-vt-left', 'foliate-vt-right',
    'foliate-vt-eat-left', 'foliate-vt-eat-right',
]
const RELEASE_VELOCITY_WINDOW_MS = 90
const RELEASE_PAUSE_THRESHOLD_MS = 80
const SLIDE_RELEASE_PROJECTION_MS = 240
const LAYERED_EDGE_REGION = 0.18
const LAYERED_EARLY_CLAIM_PX = 6
const LAYERED_EARLY_SAMPLE_INTERVAL_MS = 80
const LAYERED_VERTICAL_REJECT_PX = 8
const LAYERED_FALLBACK_CLAIM_PX = 24
const LAYERED_FALLBACK_DOMINANCE = 1.5

const updateReleaseSample = (state, distance, time) => {
    const previous = state.releaseSamples.at(-1)
    if (!previous || distance !== previous.distance) state.lastMovementTime = time
    if (previous?.time === time) previous.distance = distance
    else state.releaseSamples.push({ distance, time })

    const cutoff = time - RELEASE_VELOCITY_WINDOW_MS
    while (state.releaseSamples.length > 2
        && state.releaseSamples[1].time < cutoff) state.releaseSamples.shift()
}

// 用松手前 90ms 窗口内的位移样本估算实时速度，停顿后视为 0
const getReleaseVelocity = state => {
    const latest = state.releaseSamples.at(-1)
    if (!latest || latest.time - state.lastMovementTime > RELEASE_PAUSE_THRESHOLD_MS) return 0

    const cutoff = latest.time - RELEASE_VELOCITY_WINDOW_MS
    const before = state.releaseSamples[0]
    const after = state.releaseSamples.find(sample => sample.time >= cutoff)
    if (!before || !after) return 0

    const startTime = Math.max(cutoff, before.time)
    if (latest.time <= startTime) return 0
    const interval = after.time - before.time
    const startDistance = interval > 0 && startTime > before.time
        ? before.distance
            + (after.distance - before.distance) * (startTime - before.time) / interval
        : after.distance
    return (latest.distance - startDistance) / (latest.time - startTime)
}

// 松手后的收尾播放速率随甩动速度加快（覆盖/滑动更轻快，仿真更沉）
const LAYERED_SETTLE_CONFIG = {
    cover: { minSpeed: 0.2, maxSpeed: 1, maxRate: 2 },
    slide: { minSpeed: 0.2, maxSpeed: 1, maxRate: 2 },
    curl: { minSpeed: 0.3, maxSpeed: 1.5, maxRate: 1.5 },
}

const layeredSettlePlaybackRate = (style, speed) => {
    const config = LAYERED_SETTLE_CONFIG[style]
    if (!config || !(speed > config.minSpeed)) return 1
    const { minSpeed, maxSpeed, maxRate } = config
    const amount = Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed))
    return 1 + amount * (maxRate - 1)
}

const updatePlaybackRate = (animation, rate) => {
    if (rate === 1) return
    try {
        animation.updatePlaybackRate(rate)
        return
    } catch { /* unsupported for this UA animation */ }
    try { animation.playbackRate = rate } catch { /* unsupported */ }
}

// 遮挡/隐藏的页面里 View Transition 可能永不落定（快照捕获挂起）。
// 对过渡生命周期的一切等待都要限时：'ok'=正常完成，'fail'=被跳过/中止，
// 'timeout'=超时（按捕获失败处理，走无动画路径）
const vtSettled = (promise, ms) => Promise.race([
    promise.then(() => 'ok', () => 'fail'),
    new Promise(resolve => setTimeout(() => resolve('timeout'), ms)),
])

// collapsed range doesn't return client rects sometimes (or always?)
// try make get a non-collapsed range or element
const uncollapse = range => {
    if (!range?.collapsed) return range
    const { endOffset, endContainer } = range
    if (endContainer.nodeType === 1) {
        const node = endContainer.childNodes[endOffset]
        if (node?.nodeType === 1) return node
        return endContainer
    }
    if (endOffset + 1 < endContainer.length) range.setEnd(endContainer, endOffset + 1)
    else if (endOffset > 1) range.setStart(endContainer, endOffset - 1)
    else return endContainer.parentNode
    return range
}

const makeRange = (doc, node, start, end = start) => {
    const range = doc.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    return range
}

// use binary search to find an offset value in a text node
const bisectNode = (doc, node, cb, start = 0, end = node.nodeValue.length) => {
    if (end - start === 1) {
        const result = cb(makeRange(doc, node, start), makeRange(doc, node, end))
        return result < 0 ? start : end
    }
    const mid = Math.floor(start + (end - start) / 2)
    const result = cb(makeRange(doc, node, start, mid), makeRange(doc, node, mid, end))
    return result < 0 ? bisectNode(doc, node, cb, start, mid)
        : result > 0 ? bisectNode(doc, node, cb, mid, end) : mid
}

const { SHOW_ELEMENT, SHOW_TEXT, SHOW_CDATA_SECTION,
    FILTER_ACCEPT, FILTER_REJECT, FILTER_SKIP } = NodeFilter

const filter = SHOW_ELEMENT | SHOW_TEXT | SHOW_CDATA_SECTION

// needed cause there seems to be a bug in `getBoundingClientRect()` in Firefox
// where it fails to include rects that have zero width and non-zero height
// (CSSOM spec says "rectangles [...] of which the height or width is not zero")
// which makes the visible range include an extra space at column boundaries
const getBoundingClientRect = target => {
    let top = Infinity, right = -Infinity, left = Infinity, bottom = -Infinity
    for (const rect of target.getClientRects()) {
        left = Math.min(left, rect.left)
        top = Math.min(top, rect.top)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
    }
    return new DOMRect(left, top, right - left, bottom - top)
}

const getVisibleRange = (doc, start, end, mapRect) => {
    // first get all visible nodes
    const acceptNode = node => {
        const name = node.localName?.toLowerCase()
        // ignore all scripts, styles, and their children
        if (name === 'script' || name === 'style') return FILTER_REJECT
        if (node.nodeType === 1) {
            const { left, right } = mapRect(node.getBoundingClientRect())
            // no need to check child nodes if it's completely out of view
            if (right < start || left > end) return FILTER_REJECT
            // elements must be completely in view to be considered visible
            // because you can't specify offsets for elements
            if (left >= start && right <= end) return FILTER_ACCEPT
            // TODO: it should probably allow elements that do not contain text
            // because they can exceed the whole viewport in both directions
            // especially in scrolled mode
        } else {
            // ignore empty text nodes
            if (!node.nodeValue?.trim()) return FILTER_SKIP
            // create range to get rect
            const range = doc.createRange()
            range.selectNodeContents(node)
            const { left, right } = mapRect(range.getBoundingClientRect())
            // it's visible if any part of it is in view
            if (right >= start && left <= end) return FILTER_ACCEPT
        }
        return FILTER_SKIP
    }
    const walker = doc.createTreeWalker(doc.body, filter, { acceptNode })
    const nodes = []
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node)

    // we're only interested in the first and last visible nodes
    const from = nodes[0] ?? doc.body
    const to = nodes[nodes.length - 1] ?? from

    // find the offset at which visibility changes
    const startOffset = from.nodeType === 1 ? 0
        : bisectNode(doc, from, (a, b) => {
            const p = mapRect(getBoundingClientRect(a))
            const q = mapRect(getBoundingClientRect(b))
            if (p.right < start && q.left > start) return 0
            return q.left > start ? -1 : 1
        })
    const endOffset = to.nodeType === 1 ? 0
        : bisectNode(doc, to, (a, b) => {
            const p = mapRect(getBoundingClientRect(a))
            const q = mapRect(getBoundingClientRect(b))
            if (p.right < end && q.left > end) return 0
            return q.left > end ? -1 : 1
        })

    const range = doc.createRange()
    range.setStart(from, startOffset)
    range.setEnd(to, endOffset)
    return range
}

const selectionIsBackward = sel => {
    const range = document.createRange()
    range.setStart(sel.anchorNode, sel.anchorOffset)
    range.setEnd(sel.focusNode, sel.focusOffset)
    return range.collapsed
}

const setSelectionTo = (target, collapse) => {
    let range
    if (target.startContainer) range = target.cloneRange()
    else if (target.nodeType) {
        range = document.createRange()
        range.selectNode(target)
    }
    if (range) {
        const sel = range.startContainer.ownerDocument.defaultView.getSelection()
        sel.removeAllRanges()
        if (collapse === -1) range.collapse(true)
        else if (collapse === 1) range.collapse()
        sel.addRange(range)
    }
}

const getDirection = doc => {
    const { defaultView } = doc
    const { writingMode, direction } = defaultView.getComputedStyle(doc.body)
    const vertical = writingMode === 'vertical-rl'
        || writingMode === 'vertical-lr'
    const rtl = doc.body.dir === 'rtl'
        || direction === 'rtl'
        || doc.documentElement.dir === 'rtl'
    return { vertical, rtl }
}

const getBackground = doc => {
    const bodyStyle = doc.defaultView.getComputedStyle(doc.body)
    return bodyStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && bodyStyle.backgroundImage === 'none'
        ? doc.defaultView.getComputedStyle(doc.documentElement).background
        : bodyStyle.background
}

const makeMarginals = (length, part) => Array.from({ length }, () => {
    const div = document.createElement('div')
    const child = document.createElement('div')
    div.append(child)
    child.setAttribute('part', part)
    return div
})

const setStylesImportant = (el, styles) => {
    const { style } = el
    for (const [k, v] of Object.entries(styles)) style.setProperty(k, v, 'important')
}

class View {
    #observer = new ResizeObserver(() => this.expand())
    #element = document.createElement('div')
    #iframe = document.createElement('iframe')
    #contentRange = document.createRange()
    #overlayer
    #vertical = false
    #rtl = false
    #column = true
    #size
    #layout = {}
    constructor({ container, onExpand }) {
        this.container = container
        this.onExpand = onExpand
        this.#iframe.setAttribute('part', 'filter')
        this.#element.append(this.#iframe)
        Object.assign(this.#element.style, {
            boxSizing: 'content-box',
            position: 'relative',
            overflow: 'hidden',
            flex: '0 0 auto',
            width: '100%', height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        })
        Object.assign(this.#iframe.style, {
            overflow: 'hidden',
            border: '0',
            display: 'none',
            width: '100%', height: '100%',
        })
        // `allow-scripts` is needed for events because of WebKit bug
        // https://bugs.webkit.org/show_bug.cgi?id=218086
        this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
        this.#iframe.setAttribute('scrolling', 'no')
    }
    get element() {
        return this.#element
    }
    get document() {
        return this.#iframe.contentDocument
    }
    async load(src, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(`${src} is not string`)
        return new Promise(resolve => {
            this.#iframe.addEventListener('load', () => {
                const doc = this.document
                afterLoad?.(doc)

                // it needs to be visible for Firefox to get computed style
                this.#iframe.style.display = 'block'
                const { vertical, rtl } = getDirection(doc)
                this.docBackground = getBackground(doc)
                doc.body.style.background = 'none'
                const background = this.docBackground
                this.#iframe.style.display = 'none'

                this.#vertical = vertical
                this.#rtl = rtl

                this.#contentRange.selectNodeContents(doc.body)
                const layout = beforeRender?.({ vertical, rtl, background })
                this.#iframe.style.display = 'block'
                this.render(layout)
                this.#observer.observe(doc.body)

                // the resize observer above doesn't work in Firefox
                // (see https://bugzilla.mozilla.org/show_bug.cgi?id=1832939)
                // until the bug is fixed we can at least account for font load
                doc.fonts.ready.then(() => this.expand())

                resolve()
            }, { once: true })
            this.#iframe.src = src
        })
    }
    render(layout) {
        if (!layout || !this.document) return
        this.#column = layout.flow !== 'scrolled'
        this.#layout = layout
        if (this.#column) this.columnize(layout)
        else this.scrolled(layout)
    }
    scrolled({ margin, gap, columnWidth }) {
        const vertical = this.#vertical
        const doc = this.document
        // 横排（vertical=false）时 documentElement 垂直 padding 原本为 0，
        // 而 scrolled 模式下 #container 占满整个视口（grid-row: 1 / -1，无留白带），
        // 正文会直接顶到视口顶部（含系统状态栏区域）。
        // 滚动模式下 margin 单值 = 纯 marginV 留白（应用层设置），
        // 上下 padding 用 margin*1.5；系统状态栏避让由容器留白带
        // （--_margin-top/--_margin-bottom = safe-top/safe-bottom）提供
        setStylesImportant(doc.documentElement, {
            'box-sizing': 'border-box',
            'padding': vertical
                ? `${margin*1.5}px ${gap}px`
                : `${margin*1.5}px ${gap}px ${margin*1.5}px`,
            'column-width': 'auto',
            'height': 'auto',
            'width': 'auto',
        })
        setStylesImportant(doc.body, {
            [vertical ? 'max-height' : 'max-width']: `${columnWidth}px`,
            'margin': 'auto',
        })
        this.setImageSize()
        this.expand()
    }
    columnize({ width, height, margin, gap, columnWidth }) {
        const vertical = this.#vertical
        this.#size = vertical ? height : width

        const doc = this.document
        setStylesImportant(doc.documentElement, {
            'box-sizing': 'border-box',
            'column-width': `${Math.trunc(columnWidth)}px`,
            'column-gap': vertical ? `${margin}px` : `${gap}px`,
            'column-fill': 'auto',
            ...(vertical
                ? { 'width': `${width}px` }
                : { 'height': `${height}px` }),
            'padding': vertical ? `${margin / 2}px ${gap}px` : `0 ${gap / 2}px`,
            'overflow': 'hidden',
            // force wrap long words
            'overflow-wrap': 'break-word',
            // reset some potentially problematic props
            'position': 'static', 'border': '0', 'margin': '0',
            'max-height': 'none', 'max-width': 'none',
            'min-height': 'none', 'min-width': 'none',
            // fix glyph clipping in WebKit
            '-webkit-line-box-contain': 'block glyphs replaced',
        })
        setStylesImportant(doc.body, {
            'max-height': 'none',
            'max-width': 'none',
            'margin': '0',
        })
        this.setImageSize()
        this.expand()
    }
    setImageSize() {
        const { width, height, margin } = this.#layout
        const vertical = this.#vertical
        const doc = this.document
        for (const el of doc.body.querySelectorAll('img, svg, video')) {
            // preserve max size if they are already set
            const { maxHeight, maxWidth } = doc.defaultView.getComputedStyle(el)
            setStylesImportant(el, {
                'max-height': vertical
                    ? (maxHeight !== 'none' && maxHeight !== '0px' ? maxHeight : '100%')
                    : `${height - margin * 2}px`,
                'max-width': vertical
                    ? `${width - margin * 2}px`
                    : (maxWidth !== 'none' && maxWidth !== '0px' ? maxWidth : '100%'),
                'object-fit': 'contain',
                'page-break-inside': 'avoid',
                'break-inside': 'avoid',
                'box-sizing': 'border-box',
            })
        }
    }
    expand() {
        const { documentElement } = this.document
        if (this.#column) {
            const side = this.#vertical ? 'height' : 'width'
            const otherSide = this.#vertical ? 'width' : 'height'
            const contentRect = this.#contentRange.getBoundingClientRect()
            const rootRect = documentElement.getBoundingClientRect()
            // offset caused by column break at the start of the page
            // which seem to be supported only by WebKit and only for horizontal writing
            const contentStart = this.#vertical ? 0
                : this.#rtl ? rootRect.right - contentRect.right : contentRect.left - rootRect.left
            const contentSize = contentStart + contentRect[side]
            const pageCount = Math.ceil(contentSize / this.#size)
            const expandedSize = pageCount * this.#size
            this.#element.style.padding = '0'
            this.#iframe.style[side] = `${expandedSize}px`
            this.#element.style[side] = `${expandedSize + this.#size * 2}px`
            this.#iframe.style[otherSide] = '100%'
            this.#element.style[otherSide] = '100%'
            documentElement.style[side] = `${this.#size}px`
            if (this.#overlayer) {
                this.#overlayer.element.style.margin = '0'
                this.#overlayer.element.style.left = this.#vertical ? '0' : `${this.#size}px`
                this.#overlayer.element.style.top = this.#vertical ? `${this.#size}px` : '0'
                this.#overlayer.element.style[side] = `${expandedSize}px`
                this.#overlayer.redraw()
            }
        } else {
            const side = this.#vertical ? 'width' : 'height'
            const otherSide = this.#vertical ? 'height' : 'width'
            const contentSize = documentElement.getBoundingClientRect()[side]
            const expandedSize = contentSize
            const { margin, gap } = this.#layout
            const padding = this.#vertical ? `0 ${gap}px` : `${margin}px 0`
            this.#element.style.padding = padding
            this.#iframe.style[side] = `${expandedSize}px`
            this.#element.style[side] = `${expandedSize}px`
            this.#iframe.style[otherSide] = '100%'
            this.#element.style[otherSide] = '100%'
            if (this.#overlayer) {
                this.#overlayer.element.style.margin = padding
                this.#overlayer.element.style.left = '0'
                this.#overlayer.element.style.top = '0'
                this.#overlayer.element.style[side] = `${expandedSize}px`
                this.#overlayer.redraw()
            }
        }
        this.onExpand()
    }
    set overlayer(overlayer) {
        this.#overlayer = overlayer
        this.#element.append(overlayer.element)
    }
    get overlayer() {
        return this.#overlayer
    }
    destroy() {
        if (this.document) this.#observer.unobserve(this.document.body)
    }
}

// NOTE: everything here assumes the so-called "negative scroll type" for RTL
export class Paginator extends HTMLElement {
    static observedAttributes = [
        'flow', 'gap', 'margin', 'margin-top', 'margin-bottom',
        'max-inline-size', 'max-block-size', 'max-column-count',
    ]
    #root = this.attachShadow({ mode: 'closed' })
    #observer = new ResizeObserver(() => this.render())
    #top
    #background
    #container
    #header
    #footer
    #view
    #vertical = false
    #rtl = false
    #margin = 0
    #index = -1
    #anchor = 0 // anchor view to a fraction (0-1), Range, or Element
    #justAnchored = false
    #locked = false // while true, prevent any further navigation
    // 分层翻页的并发令牌：新一次翻页/拖拽会话递增它，旧会话的异步收尾
    // （动画结束、快照清理）发现令牌不符就自行退出，不拆新会话的样式
    #vtToken = 0
    // 手指跟手拖拽会话（Readest 式快照擦洗）：认领手势后瞬时跳到目标页并
    // 暂停翻页动画，拖动按进度擦洗 currentTime，松手播放/倒放无缝续接
    #vtDrag = null
    #vtFinishing = null
    #vtProgrammatic = null
    #vtNamedHost = null
    #styles
    #styleMap = new WeakMap()
    #mediaQuery = matchMedia('(prefers-color-scheme: dark)')
    #mediaQueryListener
    #scrollBounds
    #touchState
    #touchScrolled
    #lastVisibleRange
    // 滚动模式边界切章的时间戳防抖：切章后 anchor 定位会触发 scroll 事件，
    // 若立即再次检测会误判边界造成死循环，500ms 内不重复切章
    #lastBoundaryTurn = 0
    constructor() {
        super()
        this.#root.innerHTML = `<style>
        :host {
            display: block;
            container-type: size;
        }
        :host, #top {
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            width: 100%;
            height: 100%;
        }
        #top {
            --_gap: 7%;
            --_margin: 48px;
            /* 上下留白带可分别覆盖（margin-top / margin-bottom 属性），默认回落到 --_margin */
            --_margin-top: var(--_margin);
            --_margin-bottom: var(--_margin);
            --_max-inline-size: 720px;
            --_max-block-size: 1440px;
            --_max-column-count: 2;
            --_max-column-count-portrait: 1;
            --_max-column-count-spread: var(--_max-column-count);
            --_half-gap: calc(var(--_gap) / 2);
            --_max-width: calc(var(--_max-inline-size) * var(--_max-column-count-spread));
            --_max-height: var(--_max-block-size);
            display: grid;
            grid-template-columns:
                minmax(0, 1fr)
                var(--_half-gap)
                minmax(0, calc(var(--_max-width) - var(--_gap)))
                var(--_half-gap)
                minmax(0, 1fr);
            grid-template-rows:
                minmax(var(--_margin-top), 1fr)
                minmax(0, var(--_max-height))
                minmax(var(--_margin-bottom), 1fr);
            &.vertical {
                --_max-column-count-spread: var(--_max-column-count-portrait);
                --_max-width: var(--_max-block-size);
                --_max-height: calc(var(--_max-inline-size) * var(--_max-column-count-spread));
            }
            @container (orientation: portrait) {
                & {
                    --_max-column-count-spread: var(--_max-column-count-portrait);
                }
                &.vertical {
                    --_max-column-count-spread: var(--_max-column-count);
                }
            }
        }
        #background {
            grid-column: 1 / -1;
            grid-row: 1 / -1;
        }
        #container {
            grid-column: 1 / -1;
            grid-row: 2;
            overflow: hidden;
        }
        :host([flow="scrolled"]) #container {
            grid-column: 1 / -1;
            /* 滚动容器位于上下留白带之间（与分页模式一致）：
               留白带高度含 safe-top/safe-bottom 系统栏，内容滚动时
               永远不进入状态栏区域（若占满视口 grid-row: 1 / -1，
               滚动到中间时正文会顶到状态栏） */
            grid-row: 2;
            overflow: auto;
        }
        /* 滚动模式：页眉/页脚容器（留白带）去掉，仅保留系统状态栏避让
           （留白带高度 = safe-top/safe-bottom，由应用层设置）；
           正文上下留白由 iframe padding 提供 */
        :host([flow="scrolled"]) #header,
        :host([flow="scrolled"]) #footer {
            display: none;
        }
        #header {
            grid-column: 3 / 4;
            grid-row: 1;
        }
        #footer {
            grid-column: 3 / 4;
            grid-row: 3;
            align-self: end;
        }
        #header, #footer {
            display: grid;
        }
        #header { height: var(--_margin-top); }
        #footer { height: var(--_margin-bottom); }
        :is(#header, #footer) > * {
            display: flex;
            align-items: center;
            min-width: 0;
        }
        :is(#header, #footer) > * > * {
            width: 100%;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            text-align: center;
            font-size: .75em;
            opacity: .6;
        }
        </style>
        <div id="top">
            <div id="background" part="filter"></div>
            <div id="header"></div>
            <div id="container" part="container"></div>
            <div id="footer"></div>
        </div>
        `

        this.#top = this.#root.getElementById('top')
        this.#background = this.#root.getElementById('background')
        this.#container = this.#root.getElementById('container')
        this.#header = this.#root.getElementById('header')
        this.#footer = this.#root.getElementById('footer')

        this.#observer.observe(this.#container)
        this.#container.addEventListener('scroll', () => this.dispatchEvent(new Event('scroll')))
        this.#container.addEventListener('scroll', debounce(() => {
            if (this.scrolled) {
                if (this.#justAnchored) this.#justAnchored = false
                else this.#afterScroll('scroll')
                // 滚动到章节边界（顶部/底部）继续滚动 → 自动切换章节
                this.#checkScrollBoundary()
            }
        }, 250))

        const opts = { passive: false }
        this.addEventListener('touchstart', this.#onTouchStart.bind(this), opts)
        this.addEventListener('touchmove', this.#onTouchMove.bind(this), opts)
        this.addEventListener('touchend', this.#onTouchEnd.bind(this))
        this.addEventListener('touchcancel', this.#onTouchCancel.bind(this))
        this.addEventListener('load', ({ detail: { doc } }) => {
            doc.addEventListener('touchstart', this.#onTouchStart.bind(this), opts)
            doc.addEventListener('touchmove', this.#onTouchMove.bind(this), opts)
            doc.addEventListener('touchend', this.#onTouchEnd.bind(this))
            doc.addEventListener('touchcancel', this.#onTouchCancel.bind(this))
        })

        this.addEventListener('relocate', ({ detail }) => {
            if (detail.reason === 'selection') setSelectionTo(this.#anchor, 0)
            else if (detail.reason === 'navigation') {
                if (this.#anchor === 1) setSelectionTo(detail.range, 1)
                else if (typeof this.#anchor === 'number')
                    setSelectionTo(detail.range, -1)
                else setSelectionTo(this.#anchor, -1)
            }
        })
        const checkPointerSelection = debounce((range, sel) => {
            if (!sel.rangeCount) return
            const selRange = sel.getRangeAt(0)
            const backward = selectionIsBackward(sel)
            if (backward && selRange.compareBoundaryPoints(Range.START_TO_START, range) < 0)
                this.prev()
            else if (!backward && selRange.compareBoundaryPoints(Range.END_TO_END, range) > 0)
                this.next()
        }, 700)
        this.addEventListener('load', ({ detail: { doc } }) => {
            let isPointerSelecting = false
            doc.addEventListener('pointerdown', () => isPointerSelecting = true)
            doc.addEventListener('pointerup', () => isPointerSelecting = false)
            let isKeyboardSelecting = false
            doc.addEventListener('keydown', () => isKeyboardSelecting = true)
            doc.addEventListener('keyup', () => isKeyboardSelecting = false)
            doc.addEventListener('selectionchange', () => {
                if (this.scrolled) return
                const range = this.#lastVisibleRange
                if (!range) return
                const sel = doc.getSelection()
                if (!sel.rangeCount) return
                if (isPointerSelecting && sel.type === 'Range')
                    checkPointerSelection(range, sel)
                else if (isKeyboardSelecting) {
                    const selRange = sel.getRangeAt(0).cloneRange()
                    const backward = selectionIsBackward(sel)
                    if (!backward) selRange.collapse()
                    this.#scrollToAnchor(selRange)
                }
            })
            doc.addEventListener('focusin', e => this.scrolled ? null :
                // NOTE: `requestAnimationFrame` is needed in WebKit
                requestAnimationFrame(() => this.#scrollToAnchor(e.target)))
        })

        this.#mediaQueryListener = () => {
            if (!this.#view) return
            this.#replaceBackground(this.#view.docBackground, this.columnCount)
        }
        this.#mediaQuery.addEventListener('change', this.#mediaQueryListener)
    }
    attributeChangedCallback(name, _, value) {
        switch (name) {
            case 'flow':
                this.render()
                break
            case 'gap':
            case 'margin':
            case 'margin-top':
            case 'margin-bottom':
            case 'max-block-size':
            case 'max-column-count':
                this.#top.style.setProperty('--_' + name, value)
                this.render()
                break
            case 'max-inline-size':
                // needs explicit `render()` as it doesn't necessarily resize
                this.#top.style.setProperty('--_' + name, value)
                this.render()
                break
        }
    }
    open(book) {
        this.bookDir = book.dir
        this.sections = book.sections
        book.transformTarget?.addEventListener('data', ({ detail }) => {
            if (detail.type !== 'text/css') return
            const w = innerWidth
            const h = innerHeight
            detail.data = Promise.resolve(detail.data).then(data => data
                // unprefix as most of the props are (only) supported unprefixed
                .replace(/(?<=[{\s;])-epub-/gi, '')
                // replace vw and vh as they cause problems with layout
                .replace(/(\d*\.?\d+)vw/gi, (_, d) => parseFloat(d) * w / 100 + 'px')
                .replace(/(\d*\.?\d+)vh/gi, (_, d) => parseFloat(d) * h / 100 + 'px')
                // `page-break-*` unsupported in columns; replace with `column-break-*`
                .replace(/page-break-(after|before|inside)\s*:/gi, (_, x) =>
                    `-webkit-column-break-${x}:`)
                .replace(/break-(after|before|inside)\s*:\s*(avoid-)?page/gi, (_, x, y) =>
                    `break-${x}: ${y ?? ''}column`))
        })
    }
    #createView() {
        if (this.#view) {
            this.#view.destroy()
            this.#container.removeChild(this.#view.element)
        }
        this.#view = new View({
            container: this,
            onExpand: () => this.#scrollToAnchor(this.#anchor),
        })
        this.#container.append(this.#view.element)
        return this.#view
    }
    #replaceBackground(background, columnCount) {
        const doc = this.#view?.document
        if (!doc) return
        const htmlStyle = doc.defaultView.getComputedStyle(doc.documentElement)
        const themeBgColor = htmlStyle.getPropertyValue('--theme-bg-color')
        if (background && themeBgColor) {
            const parsedBackground = background.split(/\s(?=(?:url|rgb|hsl|#[0-9a-fA-F]{3,6}))/)
            parsedBackground[0] = themeBgColor
            background = parsedBackground.join(' ')
        }
        if (/cover.*fixed|fixed.*cover/.test(background)) {
            background = background.replace('cover', 'auto 100%').replace('fixed', '')
        }
        this.#background.innerHTML = ''
        this.#background.style.display = 'grid'
        this.#background.style.gridTemplateColumns = `repeat(${columnCount}, 1fr)`
        for (let i = 0; i < columnCount; i++) {
            const column = document.createElement('div')
            column.style.background = background
            column.style.width = '100%'
            column.style.height = '100%'
            this.#background.appendChild(column)
        }
    }
    #beforeRender({ vertical, rtl, background }) {
        this.#vertical = vertical
        this.#rtl = rtl
        this.#top.classList.toggle('vertical', vertical)

        const { width, height } = this.#container.getBoundingClientRect()
        const size = vertical ? height : width

        const style = getComputedStyle(this.#top)
        const maxInlineSize = parseFloat(style.getPropertyValue('--_max-inline-size'))
        const maxColumnCount = parseInt(style.getPropertyValue('--_max-column-count-spread'))
        const margin = parseFloat(style.getPropertyValue('--_margin'))
        this.#margin = margin

        const g = parseFloat(style.getPropertyValue('--_gap')) / 100
        // The gap will be a percentage of the #container, not the whole view.
        // This means the outer padding will be bigger than the column gap. Let
        // `a` be the gap percentage. The actual percentage for the column gap
        // will be (1 - a) * a. Let us call this `b`.
        //
        // To make them the same, we start by shrinking the outer padding
        // setting to `b`, but keep the column gap setting the same at `a`. Then
        // the actual size for the column gap will be (1 - b) * a. Repeating the
        // process again and again, we get the sequence
        //     x₁ = (1 - b) * a
        //     x₂ = (1 - x₁) * a
        //     ...
        // which converges to x = (1 - x) * a. Solving for x, x = a / (1 + a).
        // So to make the spacing even, we must shrink the outer padding with
        //     f(x) = x / (1 + x).
        // But we want to keep the outer padding, and make the inner gap bigger.
        // So we apply the inverse, f⁻¹ = -x / (x - 1) to the column gap.
        const gap = -g / (g - 1) * size

        const flow = this.getAttribute('flow')
        if (flow === 'scrolled') {
            // FIXME: vertical-rl only, not -lr
            this.setAttribute('dir', vertical ? 'rtl' : 'ltr')
            this.#top.style.padding = '0'
            const columnWidth = maxInlineSize

            this.heads = null
            this.feet = null
            this.#header.replaceChildren()
            this.#footer.replaceChildren()

            return { flow, margin, gap, columnWidth }
        }

        const divisor = Math.min(maxColumnCount, Math.ceil(size / maxInlineSize))
        const columnWidth = vertical ? (size / divisor - margin) : (size / divisor - gap)
        this.setAttribute('dir', rtl ? 'rtl' : 'ltr')

        // set background to `doc` background
        // this is needed because the iframe does not fill the whole element
        this.columnCount = divisor
        this.#replaceBackground(background, this.columnCount)

        const marginalDivisor = vertical
            ? Math.min(2, Math.ceil(width / maxInlineSize))
            : divisor
        const marginalStyle = {
            gridTemplateColumns: `repeat(${marginalDivisor}, 1fr)`,
            gap: `${gap}px`,
            direction: this.bookDir === 'rtl' ? 'rtl' : 'ltr',
        }
        Object.assign(this.#header.style, marginalStyle)
        Object.assign(this.#footer.style, marginalStyle)
        const heads = makeMarginals(marginalDivisor, 'head')
        const feet = makeMarginals(marginalDivisor, 'foot')
        this.heads = heads.map(el => el.children[0])
        this.feet = feet.map(el => el.children[0])
        this.#header.replaceChildren(...heads)
        this.#footer.replaceChildren(...feet)

        return { height, width, margin, gap, columnWidth }
    }
    render() {
        if (!this.#view) return
        this.#view.render(this.#beforeRender({
            vertical: this.#vertical,
            rtl: this.#rtl,
        }))
        this.#scrollToAnchor(this.#anchor)
    }
    get scrolled() {
        return this.getAttribute('flow') === 'scrolled'
    }
    get scrollProp() {
        const { scrolled } = this
        return this.#vertical ? (scrolled ? 'scrollLeft' : 'scrollTop')
            : scrolled ? 'scrollTop' : 'scrollLeft'
    }
    get sideProp() {
        const { scrolled } = this
        return this.#vertical ? (scrolled ? 'width' : 'height')
            : scrolled ? 'height' : 'width'
    }
    get size() {
        return this.#container.getBoundingClientRect()[this.sideProp]
    }
    get viewSize() {
        return this.#view.element.getBoundingClientRect()[this.sideProp]
    }
    get start() {
        return Math.abs(this.#container[this.scrollProp])
    }
    get end() {
        return this.start + this.size
    }
    get page() {
        return Math.floor(((this.start + this.end) / 2) / this.size)
    }
    get pages() {
        return Math.round(this.viewSize / this.size)
    }
    // this is the current position of the container
    get containerPosition() {
        return this.#container[this.scrollProp]
    }

    // this is the new position of the containr
    set containerPosition(newVal) {
        this.#container[this.scrollProp] = newVal
    }

    scrollBy(dx, dy) {
        const delta = this.#vertical ? dy : dx
        const [offset, a, b] = this.#scrollBounds
        const rtl = this.#rtl
        const min = rtl ? offset - b : offset - a
        const max = rtl ? offset + a : offset + b
        this.containerPosition = Math.max(min, Math.min(max,
            this.containerPosition + delta))
    }

    snap(vx, vy) {
        const velocity = this.#vertical ? vy : vx
        const [offset, a, b] = this.#scrollBounds
        const { start, end, pages, size } = this
        const min = Math.abs(offset) - a
        const max = Math.abs(offset) + b
        const d = velocity * (this.#rtl ? -size : size)
        const page = Math.floor(
            Math.max(min, Math.min(max, (start + end) / 2
                + (isNaN(d) ? 0 : d))) / size)

        this.#scrollToPage(page, 'snap').then(() => {
            const dir = page <= 0 ? -1 : page >= pages - 1 ? 1 : null
            if (dir) return this.#goTo({
                index: this.#adjacentIndex(dir),
                anchor: dir < 0 ? () => 1 : () => 0,
            })
        })
    }
    #onTouchStart(e) {
        const previousState = this.#touchState
        const replacementTouch = Boolean(previousState?.active)
        if (replacementTouch) this.#rejectLayeredGesture(previousState)
        const multiTouch = e.touches.length > 1
        const touch = e.changedTouches[0]
        // 监听可能挂在内部文档上：文档事件没有宿主几何，用 documentElement 宽度
        const currentTarget = e.currentTarget
        const isInnerDocument = currentTarget?.nodeType === 9
        const bounds = isInnerDocument
            ? { left: 0, width: currentTarget.documentElement?.clientWidth ?? 0 }
            : this.getBoundingClientRect()
        const localX = (touch?.clientX ?? 0) - bounds.left
        // 起手贴左右边缘 18% 内：首次向书内的横移即可认领手势
        const edgeDirection = bounds.width > 0
            ? localX <= bounds.width * LAYERED_EDGE_REGION ? -1
                : localX >= bounds.width * (1 - LAYERED_EDGE_REGION) ? 1 : 0
            : 0
        const blocked = Boolean(multiTouch || this.#vtFinishing || this.#vtProgrammatic)
        this.#touchState = {
            x: touch?.screenX, y: touch?.screenY,
            sx: touch?.screenX, sy: touch?.screenY,
            t: e.timeStamp,
            vx: 0, vy: 0,
            dx: 0, dy: 0, dt: 0,
            releaseSamples: [{ distance: 0, time: e.timeStamp }],
            lastMovementTime: e.timeStamp,
            active: true,
            blocked,
            layeredGesture: blocked ? 'rejected' : 'pending',
            layeredEdgeDirection: edgeDirection,
            layeredHorizontalDirection: 0,
            layeredHorizontalSamples: 0,
            layeredHorizontalSampleTime: null,
        }
        if (replacementTouch || multiTouch) this.#touchScrolled = false
    }
    #onTouchMove(e) {
        const state = this.#touchState
        if (!state?.active || state.blocked) return
        if (e.touches.length > 1) {
            if (this.#touchScrolled) e.preventDefault()
            this.#rejectLayeredGesture(state)
            return
        }
        if (state.pinched) {
            this.#rejectLayeredGesture(state)
            return
        }
        state.pinched = globalThis.visualViewport.scale > 1
        if (state.pinched) {
            this.#rejectLayeredGesture(state)
            return
        }
        if (this.scrolled) return
        const doc = this.#view?.document
        const selection = doc?.getSelection()
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            this.#rejectLayeredGesture(state)
            return
        }
        const touch = e.changedTouches[0]
        const isStylus = touch.touchType === 'stylus'
        if (!isStylus) e.preventDefault()
        const x = touch.screenX, y = touch.screenY
        const dx = state.x - x, dy = state.y - y
        const dt = e.timeStamp - state.t
        state.x = x
        state.y = y
        state.t = e.timeStamp
        state.vx = dx / dt
        state.vy = dy / dt
        state.dx += dx
        state.dy += dy
        state.dt += dt
        updateReleaseSample(state, state.dx, e.timeStamp)
        this.#touchScrolled = true
        // 分层翻页：认领手势后由快照动画的进度跟手，不再原生平移
        const layered = this.#layeredTurn
        if (layered) {
            if (!this.#vtDrag) this.#layeredDragStart(state, dx, dy)
            const drag = this.#vtDrag
            if (drag) {
                // 沿前进方向的净手指行程（RTL 书向右滑前进）
                const along = this.#rtl ? -state.dx : state.dx
                const totalDistance = drag.forward ? along : -along
                // 覆盖/滑动从认领点才「视觉展开」，扣除认领前消耗的位移；
                // 仿真保留相对触起点的折痕
                const visualDistance = drag.style === 'curl'
                    ? totalDistance : totalDistance - drag.visualOriginDistance
                drag.progress = Math.max(0, Math.min(1,
                    visualDistance / drag.width))
                this.#vtDragScrub(drag)
            }
            return
        }
        if (Math.abs(dx) >= Math.abs(dy)) {
            this.scrollBy(dx, 0)
        } else if (Math.abs(dy) > Math.abs(dx)) {
            this.scrollBy(0, dy)
        }
    }
    #onTouchEnd(e) {
        const state = this.#touchState
        if (state) state.active = false
        if (state?.blocked) {
            this.#touchScrolled = false
            return
        }
        if (!this.#touchScrolled) return
        this.#touchScrolled = false
        if (this.scrolled) return
        // 手势已让给其他所有者（竖向/捏合/选区）：交还默认行为
        const layeredRejected = this.#layeredTurn
            && state?.layeredGesture === 'rejected'
        if (layeredRejected) return

        // 停顿后抬手没有甩动速度：最后一段位移样本已过期
        if (state && e && e.timeStamp - state.t > RELEASE_PAUSE_THRESHOLD_MS) {
            state.vx = 0
            state.vy = 0
        }
        const releaseTouch = e?.changedTouches?.[0]
        let releaseDx = state?.dx ?? 0
        let releaseDy = state?.dy ?? 0
        if (state && releaseTouch) {
            // 快速抬手时最后一段位移只出现在 changedTouches 里
            releaseDx += state.x - releaseTouch.screenX
            releaseDy += state.y - releaseTouch.screenY
        }
        if (state) updateReleaseSample(state, releaseDx, e.timeStamp)

        // 跟手拖拽会话在此结算：进度/速度决定提交还是回弹
        const drag = this.#vtDrag
        if (drag) {
            this.#vtDrag = null
            // 提交要求整个手势以横向为主：落点带竖向抖动的手势
            // 不能凭抬手瞬间的抖动翻页
            const gestureAligned = state
                ? Math.abs(releaseDx) > Math.abs(releaseDy) : true
            const alongV = this.#rtl ? -(state?.vx ?? 0) : (state?.vx ?? 0)
            const recentVx = state ? getReleaseVelocity(state) : 0
            const recentAlongV = this.#rtl ? -recentVx : recentVx
            const progressVelocity = recentAlongV * (drag.forward ? 1 : -1)
            const releaseAlong = this.#rtl ? -releaseDx : releaseDx
            const releaseDistance = drag.forward ? releaseAlong : -releaseAlong
            const releaseProgress = Math.max(0, Math.min(1,
                releaseDistance / drag.width))
            const releaseVisualProgress = Math.max(0, Math.min(1,
                (releaseDistance - drag.visualOriginDistance) / drag.width))
            const projectedProgress = releaseProgress
                + progressVelocity * SLIDE_RELEASE_PROJECTION_MS / drag.width
            const curlFlick = Math.abs(alongV) > 0.3
                ? Math.sign(alongV) * (drag.forward ? 1 : -1) : 0
            // 覆盖/滑动把近期速度投影到进度上（甩动补足行程）；
            // 仿真保留「同向快甩即翻、逆向即弹回、否则过半」的原判
            const commit = gestureAligned && (drag.style === 'curl'
                ? curlFlick > 0 ? true : curlFlick < 0 ? false : drag.progress > 0.5
                : projectedProgress > 0.5)
            // 竖向结束的手势不做终帧擦洗：横移快照会破坏意图判定
            if (gestureAligned && drag.style !== 'curl') {
                drag.progress = releaseVisualProgress
                this.#vtDragScrub(drag)
            }
            const targetDirection = (drag.forward ? 1 : -1) * (commit ? 1 : -1)
            const releaseSpeed = recentAlongV * targetDirection
            const playbackRate = layeredSettlePlaybackRate(drag.style, releaseSpeed)
            this.#finishLayeredDrag(drag, commit, playbackRate)
            return
        }

        // 无拖拽会话：轻点=回正（无害的原地落定），滑动=按速度/位移 snap
        const isTap = state
            && Math.abs((state.x ?? 0) - (state.sx ?? 0)) < 24
            && Math.abs((state.y ?? 0) - (state.sy ?? 0)) < 24

        // XXX: Firefox seems to report scale as 1... sometimes...?
        // at this point I'm basically throwing `requestAnimationFrame` at
        // anything that doesn't work
        requestAnimationFrame(() => {
            if (globalThis.visualViewport.scale === 1 && this.#touchState === state) {
                if (isTap) this.#scrollToPage(this.page, null)
                else this.snap(state.vx, state.vy)
            }
        })
    }
    #onTouchCancel() {
        const state = this.#touchState
        if (state) state.active = false
        if (state?.blocked) {
            this.#touchScrolled = false
            return
        }
        const drag = this.#vtDrag
        if (drag) {
            this.#vtDrag = null
            this.#touchScrolled = false
            this.#finishLayeredDrag(drag, false)
            return
        }
        const wasScrolled = this.#touchScrolled
        this.#touchScrolled = false
        if (this.scrolled) return
        if (wasScrolled && this.#scrollBounds) {
            this.#scrollTo(this.#scrollBounds[0], 'snap')
        }
    }

    // 预备一次分层翻页：根节点挂编排类；翻页组名挂到宿主标记的
    // [data-view-transition-root]（包含页眉页脚的整页容器，随快照一起翻动），
    // 没有标记则沿 shadow host 上溯到最外层元素
    #vtSetup(style, forward, scrubbing = false) {
        injectViewTransitionStyles()
        const html = document.documentElement
        const side = this.#rtl ? 'right' : 'left'
        // 仿真折痕的吃入侧：前进从书外侧、后退从书脊侧
        const eatSide = forward !== this.#rtl ? 'right' : 'left'
        const classes = ['foliate-vt', `foliate-vt-${style}`,
            forward ? 'foliate-vt-forward' : 'foliate-vt-backward',
            `foliate-vt-${side}`, `foliate-vt-eat-${eatSide}`]
        if (scrubbing) classes.push('foliate-vt-scrub')
        let namedHost = this
        while (namedHost.getRootNode() instanceof ShadowRoot)
            namedHost = namedHost.getRootNode().host
        namedHost = namedHost.closest?.('[data-view-transition-root]') ?? namedHost
        namedHost.style.viewTransitionName = 'foliate-turn'
        this.#vtNamedHost = namedHost
        // 快照垫上页面底色：主题没有不透明背景时两层会互相透色；
        // 墙纸模式给的是 transparent，同样按无底色处理退回 Canvas
        const doc = this.#view?.document
        const themeBg = doc?.documentElement
            ? doc.defaultView.getComputedStyle(doc.documentElement)
                .getPropertyValue('--theme-bg-color').trim()
            : ''
        html.style.setProperty('--foliate-vt-bg',
            themeBg && themeBg !== 'transparent' ? themeBg : 'Canvas')
        html.classList.remove(...VIEW_TRANSITION_CLASSES)
        html.classList.add(...classes)
        return namedHost
    }

    #vtCleanup() {
        const html = document.documentElement
        html.classList.remove(...VIEW_TRANSITION_CLASSES)
        html.style.removeProperty('--foliate-vt-bg')
        this.#vtNamedHost?.style.removeProperty('view-transition-name')
        this.#vtNamedHost = null
    }

    // 把触摸序列永久让给其他手势（捏合/选区/竖向等）。
    // 已有快照时走正常生命周期取消，而不是让后续样本继续擦洗
    #rejectLayeredGesture(state = this.#touchState) {
        if (state) {
            state.layeredGesture = 'rejected'
            state.layeredHorizontalDirection = 0
            state.layeredHorizontalSamples = 0
            state.layeredHorizontalSampleTime = null
        }
        const drag = this.#vtDrag
        if (!drag) return
        this.#vtDrag = null
        this.#finishLayeredDrag(drag, false)
    }

    // 认领手势开始跟手翻页：瞬时跳到目标页（藏在快照之下）并暂停动画等待
    // 擦洗。认领判据（Readest 同款竞技场）：贴边首滑、中部连续横移 6px、
    // 或 24px 且横向占优的兜底；竖向位移到达阈值则整体否决。
    // 隐藏/遮挡的页面无法完成快照捕获（ready 直接 reject），整场不认领，
    // 松手交给常规 snap
    #layeredDragStart(state, dx, dy) {
        if (this.#vtDrag || this.#vtFinishing || this.#vtProgrammatic || !this.#scrollBounds) return
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        const style = this.#layeredTurn
        if (!style) return
        if (state.layeredGesture !== 'pending') return

        const absDx = Math.abs(state.dx)
        const absDy = Math.abs(state.dy)
        if (absDy >= LAYERED_VERTICAL_REJECT_PX && absDy > absDx) {
            state.layeredGesture = 'rejected'
            return
        }

        const direction = Math.sign(dx)
        const locallyHorizontal = direction !== 0 && Math.abs(dx) > Math.abs(dy)
        const clearlyHorizontal = locallyHorizontal
            && Math.abs(dx) >= Math.abs(dy) * LAYERED_FALLBACK_DOMINANCE
        const cumulativelyHorizontal = absDx
            >= absDy * LAYERED_FALLBACK_DOMINANCE
        if (locallyHorizontal && cumulativelyHorizontal) {
            const recentSample = state.layeredHorizontalSampleTime != null
                && state.t - state.layeredHorizontalSampleTime
                    <= LAYERED_EARLY_SAMPLE_INTERVAL_MS
            if (state.layeredHorizontalDirection === direction && recentSample) {
                state.layeredHorizontalSamples++
            } else {
                state.layeredHorizontalDirection = direction
                state.layeredHorizontalSamples = 1
            }
            state.layeredHorizontalSampleTime = state.t
        } else {
            state.layeredHorizontalDirection = 0
            state.layeredHorizontalSamples = 0
            state.layeredHorizontalSampleTime = null
        }

        const edgeClaim = state.layeredEdgeDirection !== 0
            && direction === state.layeredEdgeDirection
            && Math.sign(state.dx) === state.layeredEdgeDirection
            && clearlyHorizontal
            && cumulativelyHorizontal
        const earlyCenterClaim = state.layeredEdgeDirection === 0
            && state.layeredHorizontalSamples >= 2
            && absDx >= LAYERED_EARLY_CLAIM_PX
            && Math.sign(state.dx) === state.layeredHorizontalDirection
        const fallbackClaim = absDx >= LAYERED_FALLBACK_CLAIM_PX
            && absDx >= absDy * LAYERED_FALLBACK_DOMINANCE
        if (!edgeClaim && !earlyCenterClaim && !fallbackClaim) return

        // 沿前进方向的手指行程决定快照哪一页；到书界则只认领不翻页
        const along = this.#rtl ? -state.dx : state.dx
        const forward = along > 0
        if (forward ? this.atEnd : this.atStart) {
            state.layeredGesture = 'claimed'
            return
        }
        const step = this.#rtl ? -this.size : this.size
        const startPosition = this.containerPosition
        const offset = startPosition + (forward ? step : -step)
        let turnRoot
        let transition
        try {
            turnRoot = this.#vtSetup(style, forward, true)
            transition = document.startViewTransition(() => {
                this.containerPosition = offset
                this.#scrollBounds = [offset, this.atStart ? 0 : this.size, this.atEnd ? 0 : this.size]
                // 底层已就位，立即 relocate 让页眉页脚页码换到目标页
                //（藏在快照之下；取消路径会跳回来并再次 relocate）
                this.#afterScroll('page')
            })
        } catch {
            state.layeredGesture = 'rejected'
            this.containerPosition = startPosition
            this.#vtCleanup()
            return
        }
        const drag = {
            transition, offset, startPosition, forward,
            style, progress: 0, anims: null,
            visualOriginDistance: style === 'curl'
                ? 0 : Math.max(0, forward ? along : -along),
            // 进度必须按快照实宽折算：正文容器可能因页边距更窄，
            // 用它会逐渐跑赢手指
            width: turnRoot.getBoundingClientRect().width
                || this.#container.getBoundingClientRect().width,
        }
        this.#vtDrag = drag
        // 挂起中的过渡被浏览器强制中止时（遮挡恢复等），这两条拒绝会
        // 无人接住：预先挂上空 catch 标记已处理，真正的分支在下方与 finish 里
        transition.updateCallbackDone.catch(() => {})
        transition.finished.catch(() => {})
        vtSettled(transition.ready, 500).then(result => {
            if (this.#vtDrag !== drag && this.#vtFinishing !== drag) return
            if (result !== 'ok') {
                // 快照失败/被跳过/超时（遮挡）：松手走无动画收尾
                drag.failed = true
                return
            }
            const anims = document.getAnimations().filter(a =>
                a.effect?.pseudoElement?.includes('(foliate-turn)'))
            for (const a of anims) {
                // CSS 已声明线性擦洗；对可变的伪元素动画再兜底一次
                try { a.effect.updateTiming({ easing: 'linear' }) } catch { /* UA animation */ }
                a.pause()
            }
            drag.anims = anims
            this.#vtDragScrub(drag)
        })
    }

    #vtDragScrub(drag = this.#vtDrag) {
        if (!drag?.anims) return
        for (const a of drag.anims) {
            const duration = a.effect.getTiming().duration
            a.currentTime = drag.progress * 0.999
                * (typeof duration === 'number' ? duration : 300)
        }
    }

    // 结算跟手翻页：提交=动画从当前位置播放到终点（底层已在目标页）；
    // 取消=倒放回起点，在快照之下恢复原页后再摘掉快照。
    // 捕获失败（ready reject/超时）时没有动画可播：提交原地收尾，取消原位还原
    async #finishLayeredDrag(drag, commit, playbackRate = 1) {
        if (this.#vtFinishing === drag) return
        this.#vtFinishing = drag
        const { transition, offset, startPosition } = drag
        const { size } = this
        const id = ++this.#vtToken
        try {
            await vtSettled(transition.updateCallbackDone, 600)
            const readyState = await vtSettled(transition.ready, 600)
            if (id !== this.#vtToken) return

            const anims = readyState === 'ok' ? drag.anims : null
            if (anims) for (const a of anims) updatePlaybackRate(a, playbackRate)
            if (commit) {
                if (anims) for (const a of anims) a.play()
                await vtSettled(transition.finished, 1200)
                if (id !== this.#vtToken) return
            } else {
                if (anims) {
                    for (const a of anims) a.reverse()
                    await vtSettled(Promise.all(anims.map(a => a.finished)), 800)
                }
                if (id !== this.#vtToken) return
                this.containerPosition = startPosition
                this.#scrollBounds = [startPosition, this.atStart ? 0 : size, this.atEnd ? 0 : size]
                this.#afterScroll('snap')
                // 给宿主两次渲染机会把恢复后的画面画在快照之下。
                // 遮挡/隐藏的页面不派发 rAF，用短定时器兜底，清理永不悬挂
                await new Promise(resolve => {
                    let done = false
                    const once = () => { if (!done) { done = true; resolve() } }
                    requestAnimationFrame(() => requestAnimationFrame(once))
                    setTimeout(once, 120)
                })
                if (id !== this.#vtToken) return
                // 摘快照（对挂起/卡住的过渡也是强制中断）
                try { transition.skipTransition() } catch { /* already done */ }
            }
            this.#vtCleanup()
            const finalPosition = commit ? offset : startPosition
            this.containerPosition = finalPosition
            this.#scrollBounds = [finalPosition, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll('snap')
        } finally {
            if (this.#vtFinishing === drag) this.#vtFinishing = null
        }
    }
    // allows one to process rects as if they were LTR and horizontal
    #getRectMapper() {
        if (this.scrolled) {
            const size = this.viewSize
            const margin = this.#margin
            return this.#vertical
                ? ({ left, right }) =>
                    ({ left: size - right - margin, right: size - left - margin })
                : ({ top, bottom }) => ({ left: top + margin, right: bottom + margin })
        }
        const pxSize = this.pages * this.size
        return this.#rtl
            ? ({ left, right }) =>
                ({ left: pxSize - right, right: pxSize - left })
            : this.#vertical
                ? ({ top, bottom }) => ({ left: top, right: bottom })
                : f => f
    }
    get #layeredTurn() {
        const style = this.getAttribute('turn-style')
        // 三种横排翻页样式（覆盖/仿真/滑动）都走分层快照 + 拖拽擦洗；
        // 竖排与滚动模式除外（快照动画只编排了横向）
        return (style === 'cover' || style === 'curl' || style === 'slide')
            && !this.scrolled
            && !this.#vertical
            && typeof document.startViewTransition === 'function'
            ? style : null
    }
    // 程序化翻页（轻点/键盘/上一页下一页按钮）：startViewTransition 先拍旧页
    // 快照，回调内瞬时跳到新页，之后旧页快照在静止的新页之上"翻走"
    // （覆盖=旧页带阴影滑出，滑动=旧页滑出+新页同步跟进，仿真=折痕弧扫过），
    // 后退则反向编排。页面本身是分栏大容器的一片切片，
    // 无法作为 DOM 层移动，只能靠快照分层
    #viewTransitionTurn(offset, reason) {
        // 分层过渡独占文档级伪元素树：上一场过渡清理完成前忽略重叠导航
        if (this.#vtDrag || this.#vtFinishing || this.#vtProgrammatic) return
        // 手指还按着时来了键盘/轻点翻页：接管导航权，否决待定的手势
        // 竞技场候选，防止它在过渡结束后用旧起点再发动第二次分层翻页
        if (this.#touchState?.active) this.#rejectLayeredGesture(this.#touchState)
        const style = this.#layeredTurn
        const pos = this.containerPosition
        // RTL 横向滚动坐标为负，按绝对值比较方向
        const forward = Math.abs(offset) > Math.abs(pos)
        const token = ++this.#vtToken
        this.#vtSetup(style, forward)
        const transition = document.startViewTransition(() => {
            this.containerPosition = offset
            this.#scrollBounds = [offset, this.atStart ? 0 : this.size, this.atEnd ? 0 : this.size]
            this.#afterScroll(reason)
        })
        this.#vtProgrammatic = { transition, token }
        // 挂起中的过渡被浏览器强制中止时的拒绝无人接住：预先挂空 catch
        transition.updateCallbackDone.catch(() => {})
        transition.ready.catch(() => {})
        transition.finished.catch(() => {})
        // 遮挡/隐藏的页面里 finished 可能永不落定：限时收尾，
        // 超时视为捕获失败，强制摘快照并直接钉到目标位置
        return vtSettled(transition.finished, 1200).then(() => {
            if (this.#vtToken !== token) return
            this.#vtProgrammatic = null
            try { transition.skipTransition() } catch { /* already done */ }
            this.#vtCleanup()
            // 过渡期间邻接章节加载可能把容器重新锚到旧位置，结束后再钉回目标
            this.containerPosition = offset
            this.#scrollBounds = [offset, this.atStart ? 0 : this.size, this.atEnd ? 0 : this.size]
        })
    }
    async #scrollToRect(rect, reason) {
        if (this.scrolled) {
            const offset = this.#getRectMapper()(rect).left - this.#margin
            return this.#scrollTo(offset, reason)
        }
        const offset = this.#getRectMapper()(rect).left
        return this.#scrollToPage(Math.floor(offset / this.size) + (this.#rtl ? -1 : 1), reason)
    }
    async #scrollTo(offset, reason, smooth) {
        const { size } = this
        if (this.containerPosition === offset) {
            this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll(reason)
            return
        }
        // FIXME: vertical-rl only, not -lr
        if (this.scrolled && this.#vertical) offset = -offset
        if ((reason === 'snap' || smooth) && this.hasAttribute('animated')
            && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
            // 隐藏/遮挡的页面里 rAF 与快照捕获都不会推进，动画只能原地悬挂：
            // 直接跳到目标位置，等页面恢复可见后由常规路径接管
            // 分层翻页只用于真正的翻页：跨半页以内的落定回弹必须走普通动画，
            // 否则原地重新快照一次会闪一下
            const turning = Math.abs(offset - this.containerPosition) > size / 2
            const layered = turning ? this.#layeredTurn : null
            if (layered) return this.#viewTransitionTurn(offset, reason)
            return animate(
                this.containerPosition, offset, 300, easeOutQuad,
                x => this.containerPosition = x,
            ).then(() => {
                this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
                this.#afterScroll(reason)
            })
        }
        else {
            this.containerPosition = offset
            this.#scrollBounds = [offset, this.atStart ? 0 : size, this.atEnd ? 0 : size]
            this.#afterScroll(reason)
        }
    }
    async #scrollToPage(page, reason, smooth) {
        const offset = this.size * (this.#rtl ? -page : page)
        return this.#scrollTo(offset, reason, smooth)
    }
    async scrollToAnchor(anchor, select) {
        return this.#scrollToAnchor(anchor, select ? 'selection' : 'navigation')
    }
    async #scrollToAnchor(anchor, reason = 'anchor') {
        this.#anchor = anchor
        const rects = uncollapse(anchor)?.getClientRects?.()
        // if anchor is an element or a range
        if (rects) {
            // when the start of the range is immediately after a hyphen in the
            // previous column, there is an extra zero width rect in that column
            const rect = Array.from(rects)
                .find(r => r.width > 0 && r.height > 0) || rects[0]
            if (!rect) return
            await this.#scrollToRect(rect, reason)
            return
        }
        // if anchor is a fraction
        if (this.scrolled) {
            await this.#scrollTo(anchor * this.viewSize, reason)
            return
        }
        const { pages } = this
        if (!pages) return
        const textPages = pages - 2
        const newPage = Math.round(anchor * (textPages - 1))
        await this.#scrollToPage(newPage + 1, reason)
    }
    #getVisibleRange() {
        if (this.scrolled) return getVisibleRange(this.#view.document,
            this.start + this.#margin, this.end - this.#margin, this.#getRectMapper())
        const size = this.#rtl ? -this.size : this.size
        return getVisibleRange(this.#view.document,
            this.start - size, this.end - size, this.#getRectMapper())
    }
    #afterScroll(reason) {
        const range = this.#getVisibleRange()
        this.#lastVisibleRange = range
        // don't set new anchor if relocation was to scroll to anchor
        if (reason !== 'selection' && reason !== 'navigation' && reason !== 'anchor')
            this.#anchor = range
        else this.#justAnchored = true

        const index = this.#index
        const detail = { reason, range, index }
        if (this.scrolled) detail.fraction = this.start / this.viewSize
        else if (this.pages > 0) {
            const { page, pages } = this
            this.#header.style.visibility = page > 1 ? 'visible' : 'hidden'
            detail.fraction = (page - 1) / (pages - 2)
            detail.size = 1 / (pages - 2)
        }
        this.dispatchEvent(new CustomEvent('relocate', { detail }))
    }
    // 滚动模式：滚动到章节边界继续滚动时自动切换章节（微信读书/readest 式体验）。
    // 仅在用户滚动触发的 scroll 事件中检测；切章后 anchor 定位触发的 scroll
    // 由 #justAnchored 清除 + #lastBoundaryTurn 时间戳防抖拦截，避免死循环
    #checkScrollBoundary() {
        if (this.#locked) return
        const now = performance.now()
        if (now - this.#lastBoundaryTurn < 500) return
        const container = this.#container
        const scrollHeight = container.scrollHeight
        const clientHeight = container.clientHeight
        // 内容不足一屏（不可滚动）时不检测，避免短章链死循环
        if (scrollHeight <= clientHeight + 2) return
        const atBottom = container.scrollTop + clientHeight >= scrollHeight - 2
        const atTop = container.scrollTop <= 2
        if (atBottom && !this.atEnd) {
            this.#lastBoundaryTurn = now
            void this.next()
        } else if (atTop && !this.atStart) {
            this.#lastBoundaryTurn = now
            void this.prev()
        }
    }
    async #display(promise) {
        const { index, src, anchor, onLoad, select } = await promise
        this.#index = index
        const hasFocus = this.#view?.document?.hasFocus()
        if (src) {
            const view = this.#createView()
            const afterLoad = doc => {
                if (doc.head) {
                    const $styleBefore = doc.createElement('style')
                    doc.head.prepend($styleBefore)
                    const $style = doc.createElement('style')
                    doc.head.append($style)
                    this.#styleMap.set(doc, [$styleBefore, $style])
                }
                onLoad?.({ doc, index })
            }
            const beforeRender = this.#beforeRender.bind(this)
            await view.load(src, afterLoad, beforeRender)
            this.dispatchEvent(new CustomEvent('create-overlayer', {
                detail: {
                    doc: view.document, index,
                    attach: overlayer => view.overlayer = overlayer,
                },
            }))
            this.#view = view
        }
        await this.scrollToAnchor((typeof anchor === 'function'
            ? anchor(this.#view.document) : anchor) ?? 0, select)
        if (hasFocus) this.focusView()
    }
    #canGoToIndex(index) {
        return index >= 0 && index <= this.sections.length - 1
    }
    async #goTo({ index, anchor, select }) {
        if (index === this.#index) await this.#display({ index, anchor, select })
        else {
            const oldIndex = this.#index
            const onLoad = detail => {
                this.sections[oldIndex]?.unload?.()
                this.setStyles(this.#styles)
                this.dispatchEvent(new CustomEvent('load', { detail }))
            }
            await this.#display(Promise.resolve(this.sections[index].load())
                .then(src => ({ index, src, anchor, onLoad, select }))
                .catch(e => {
                    console.warn(e)
                    console.warn(new Error(`Failed to load section ${index}`))
                    return {}
                }))
        }
    }
    async goTo(target) {
        if (this.#locked) return
        const resolved = await target
        if (this.#canGoToIndex(resolved.index)) return this.#goTo(resolved)
    }
    #scrollPrev(distance) {
        if (!this.#view) return true
        if (this.scrolled) {
            if (this.start > 0) return this.#scrollTo(
                Math.max(0, this.start - (distance ?? this.size)), null, true)
            return !this.atStart
        }
        if (this.atStart) return
        const page = this.page - 1
        return this.#scrollToPage(page, 'page', true).then(() => page <= 0)
    }
    #scrollNext(distance) {
        if (!this.#view) return true
        if (this.scrolled) {
            if (this.viewSize - this.end > 2) return this.#scrollTo(
                Math.min(this.viewSize, distance ? this.start + distance : this.end), null, true)
            return !this.atEnd
        }
        if (this.atEnd) return
        const page = this.page + 1
        const pages = this.pages
        return this.#scrollToPage(page, 'page', true).then(() => page >= pages - 1)
    }
    get atStart() {
        return this.#adjacentIndex(-1) == null && this.page <= 1
    }
    get atEnd() {
        return this.#adjacentIndex(1) == null && this.page >= this.pages - 2
    }
    #adjacentIndex(dir) {
        for (let index = this.#index + dir; this.#canGoToIndex(index); index += dir)
            if (this.sections[index]?.linear !== 'no') return index
    }
    async #turnPage(dir, distance) {
        if (this.#locked) return
        this.#locked = true
        const prev = dir === -1
        const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))
        if (shouldGo) await this.#goTo({
            index: this.#adjacentIndex(dir),
            anchor: prev ? () => 1 : () => 0,
        })
        if (shouldGo || !this.hasAttribute('animated')) await wait(100)
        this.#locked = false
    }
    async prev(distance) {
        return await this.#turnPage(-1, distance)
    }
    async next(distance) {
        return await this.#turnPage(1, distance)
    }
    prevSection() {
        return this.goTo({ index: this.#adjacentIndex(-1) })
    }
    nextSection() {
        return this.goTo({ index: this.#adjacentIndex(1) })
    }
    firstSection() {
        const index = this.sections.findIndex(section => section.linear !== 'no')
        return this.goTo({ index })
    }
    lastSection() {
        const index = this.sections.findLastIndex(section => section.linear !== 'no')
        return this.goTo({ index })
    }
    getContents() {
        if (this.#view) return [{
            index: this.#index,
            overlayer: this.#view.overlayer,
            doc: this.#view.document,
        }]
        return []
    }
    setStyles(styles) {
        this.#styles = styles
        const $$styles = this.#styleMap.get(this.#view?.document)
        if (!$$styles) return
        const [$beforeStyle, $style] = $$styles
        if (Array.isArray(styles)) {
            const [beforeStyle, style] = styles
            $beforeStyle.textContent = beforeStyle
            $style.textContent = style
        } else $style.textContent = styles

        // NOTE: needs `requestAnimationFrame` in Chromium
        requestAnimationFrame(() => {
            this.#replaceBackground(this.#view.docBackground, this.columnCount)
        })

        // needed because the resize observer doesn't work in Firefox
        this.#view?.document?.fonts?.ready?.then(() => this.#view.expand())
    }
    focusView() {
        this.#view.document.defaultView.focus()
    }
    destroy() {
        // 打断进行中的分层翻页：旧会话的收尾不再触碰已销毁的视图
        const transition = (this.#vtDrag ?? this.#vtFinishing)?.transition
            ?? this.#vtProgrammatic?.transition
        this.#vtDrag = null
        this.#vtFinishing = null
        this.#vtProgrammatic = null
        this.#vtToken++
        if (transition || this.#vtNamedHost) {
            transition?.ready?.catch(() => {})
            transition?.updateCallbackDone?.catch(() => {})
            try { transition?.skipTransition() } catch { /* already done */ }
            this.#vtCleanup()
        }
        this.#observer.unobserve(this)
        this.#view.destroy()
        this.#view = null
        this.sections[this.#index]?.unload?.()
        this.#mediaQuery.removeEventListener('change', this.#mediaQueryListener)
    }
}

customElements.define('foliate-paginator', Paginator)
