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

// 覆盖翻页（turn-style="cover"）的 ::view-transition 伪元素挂在文档根部，
// 只能从顶层文档注入样式，paginator 自己的 shadow root 管不到
const VT_STYLE_ID = 'foliate-view-transition-styles'
// 页面本体（foliate-turn）与悬浮页眉/页脚（foliate-turn-head/foot，由宿主应用
// 命名）各成一个 VT 组，共用同一套翻页动画才能同步移动、看起来像一张完整的纸
const vtTurnGroupCss = (name, shadow) => `
        .foliate-vt::view-transition-old(${name}),
        .foliate-vt::view-transition-new(${name}) {
            animation: none;
            background: var(--foliate-vt-bg, Canvas);
            /* 必须正常混合而非默认的 plus-lighter，否则旧页快照盖不住新页 */
            mix-blend-mode: normal;
        }
        /* 覆盖：整页平移滑出（前进）/滑入（后退） */
        .foliate-vt-cover.foliate-vt-forward::view-transition-old(${name}) {
            z-index: 1;
            animation: foliate-turn-out-left 300ms cubic-bezier(.25,.46,.45,.94) both;
            ${shadow}
        }
        .foliate-vt-cover.foliate-vt-forward.foliate-vt-right::view-transition-old(${name}) {
            animation-name: foliate-turn-out-right;
        }
        .foliate-vt-cover.foliate-vt-forward.foliate-vt-top::view-transition-old(${name}) {
            animation-name: foliate-turn-out-top;
        }
        .foliate-vt-cover.foliate-vt-backward::view-transition-new(${name}) {
            z-index: 1;
            animation: foliate-turn-in-left 300ms cubic-bezier(.25,.46,.45,.94) both;
            ${shadow}
        }
        .foliate-vt-cover.foliate-vt-backward.foliate-vt-right::view-transition-new(${name}) {
            animation-name: foliate-turn-in-right;
        }
        .foliate-vt-cover.foliate-vt-backward.foliate-vt-top::view-transition-new(${name}) {
            animation-name: foliate-turn-in-top;
        }
        /* 仿真：透明圆盘从书外侧下角（eat 类切换起点）向外生长成折痕弧，
           旧页沿弧线被"卷走"；两个方向都只动旧页，新页静止在下。
           Chrome 不给活的 new 层画 mask、只画静态 old 快照，所以后退也编排
           旧页从书脊侧退去，读感等同新页展开。6% 是卷起的软边渐变带 */
        .foliate-vt-curl::view-transition-old(${name}) {
            z-index: 1;
            -webkit-mask-image: radial-gradient(circle at var(--foliate-fold-x, 108%) 108%,
                transparent calc(var(--foliate-fold) - 6%), black var(--foliate-fold));
            mask-image: radial-gradient(circle at var(--foliate-fold-x, 108%) 108%,
                transparent calc(var(--foliate-fold) - 6%), black var(--foliate-fold));
            animation: foliate-turn-curl-fold 450ms cubic-bezier(.3,.1,.4,1) both;
        }
        .foliate-vt-curl::view-transition-new(${name}) {
            animation: none;
        }`
const injectViewTransitionStyles = () => {
    if (document.getElementById(VT_STYLE_ID)) return
    const style = document.createElement('style')
    style.id = VT_STYLE_ID
    style.textContent = `
        .foliate-vt::view-transition { pointer-events: none; }
        .foliate-vt::view-transition-old(root),
        .foliate-vt::view-transition-new(root) { animation: none; }
        ${vtTurnGroupCss('foliate-turn', 'box-shadow: 0 0 24px rgba(0, 0, 0, .35);')}
        ${vtTurnGroupCss('foliate-turn-head', '')}
        ${vtTurnGroupCss('foliate-turn-foot', '')}
        /* 覆盖拖拽：按住期间旧层（页面+页眉页脚）跟手平移，
           新层（下层页与其页眉页脚）保持静止；松手后提交滑出或回弹。
           无限慢动画让空 update 的 VT 在整个拖拽期间保持驻留。
           位移变量由 #updateCoverDrag 按平移量与方向预先算好 */
        .foliate-vt-drag::view-transition-group(*) {
            animation: foliate-vt-hold 1e6s linear 1;
        }
        @keyframes foliate-vt-hold {
            from { opacity: 0.99999 }
            to { opacity: 1 }
        }
        .foliate-vt-drag::view-transition-old(foliate-turn),
        .foliate-vt-drag::view-transition-old(foliate-turn-head),
        .foliate-vt-drag::view-transition-old(foliate-turn-foot) {
            animation: none;
            transform: translate(var(--cover-old-x, 0px), var(--cover-old-y, 0px));
            z-index: 1;
        }
        .foliate-vt-drag::view-transition-new(foliate-turn),
        .foliate-vt-drag::view-transition-new(foliate-turn-head),
        .foliate-vt-drag::view-transition-new(foliate-turn-foot) {
            animation: none;
            transform: translate(var(--cover-new-x, 0px), var(--cover-new-y, 0px));
        }
        /* 松手提交（前进）：旧层从当前位置继续滑出，新层原位露出 */
        .foliate-vt-drag.foliate-cover-commit-forward::view-transition-old(foliate-turn),
        .foliate-vt-drag.foliate-cover-commit-forward::view-transition-old(foliate-turn-head),
        .foliate-vt-drag.foliate-cover-commit-forward::view-transition-old(foliate-turn-foot) {
            animation: foliate-cover-exit-forward 260ms cubic-bezier(.25,.46,.45,.94) both;
        }
        /* 松手提交（后退）：旧层向右滑出，露出左侧新层 */
        .foliate-vt-drag.foliate-cover-commit-backward::view-transition-old(foliate-turn),
        .foliate-vt-drag.foliate-cover-commit-backward::view-transition-old(foliate-turn-head),
        .foliate-vt-drag.foliate-cover-commit-backward::view-transition-old(foliate-turn-foot) {
            animation: foliate-cover-exit-backward 260ms cubic-bezier(.25,.46,.45,.94) both;
        }
        @keyframes foliate-cover-exit-forward {
            from { transform: translate(var(--cover-old-x, 0px), var(--cover-old-y, 0px)); }
            to { transform: translate(-100%, 0); }
        }
        @keyframes foliate-cover-exit-backward {
            from { transform: translate(var(--cover-old-x, 0px), var(--cover-old-y, 0px)); }
            to { transform: translate(100%, 0); }
        }
        /* 松手取消：旧层滑回原位，新层滑出屏幕 */
        .foliate-vt-drag.foliate-cover-cancel::view-transition-old(foliate-turn),
        .foliate-vt-drag.foliate-cover-cancel::view-transition-old(foliate-turn-head),
        .foliate-vt-drag.foliate-cover-cancel::view-transition-old(foliate-turn-foot) {
            animation: foliate-cover-back 220ms ease both;
        }
        .foliate-vt-drag.foliate-cover-cancel::view-transition-new(foliate-turn) {
            animation: foliate-cover-new-return 220ms ease both;
        }
        @keyframes foliate-cover-back {
            from { transform: translate(var(--cover-old-x, 0px), var(--cover-old-y, 0px)); }
            to { transform: none; }
        }
        @keyframes foliate-cover-new-return {
            from { transform: translate(var(--cover-new-x, 0px), var(--cover-new-y, 0px)); }
            to { transform: none; }
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
        @keyframes foliate-turn-out-top { to { transform: translateY(-100%) } }
        @keyframes foliate-turn-in-left { from { transform: translateX(-100%) } }
        @keyframes foliate-turn-in-right { from { transform: translateX(100%) } }
        @keyframes foliate-turn-in-top { from { transform: translateY(-100%) } }
        @keyframes foliate-turn-curl-fold {
            from { --foliate-fold: 0%; }
            to { --foliate-fold: 118%; }
        }
    `
    document.head.append(style)
}

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
    // 覆盖翻页的并发令牌：快速连续翻页时旧 transition 被浏览器自动 skip，
    // 仅令牌最新的一次允许做 cleanup，防止拆掉新一次动画的类
    #vtToken = 0
    // 覆盖翻页的手指拖拽会话：按住期间用挂起的 VT 呈现「旧页跟手滑出、
    // 新层静止」的真覆盖样式，松手后提交滑出或回弹
    #coverDrag = null
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
        this.addEventListener('load', ({ detail: { doc } }) => {
            doc.addEventListener('touchstart', this.#onTouchStart.bind(this), opts)
            doc.addEventListener('touchmove', this.#onTouchMove.bind(this), opts)
            doc.addEventListener('touchend', this.#onTouchEnd.bind(this))
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
        const touch = e.changedTouches[0]
        this.#touchState = {
            x: touch?.screenX, y: touch?.screenY,
            sx: touch?.screenX, sy: touch?.screenY,
            t: e.timeStamp,
            vx: 0, xy: 0,
        }
        // 覆盖翻页：按住即进入拖拽会话（挂起 VT 呈现真覆盖：旧层跟手、新层静止）
        if (e.touches.length === 1 && this.#layeredTurn === 'cover' &&
            !this.#coverDrag && typeof document.startViewTransition === 'function') {
            this.#beginCoverDrag()
        }
    }
    #onTouchMove(e) {
        const state = this.#touchState
        if (state.pinched) return
        state.pinched = globalThis.visualViewport.scale > 1
        if (this.scrolled || state.pinched) return
        if (e.touches.length > 1) {
            if (this.#touchScrolled) e.preventDefault()
            return
        }
        const doc = this.#view?.document
        const selection = doc?.getSelection()
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            return
        }
        e.preventDefault()
        const touch = e.changedTouches[0]
        const x = touch.screenX, y = touch.screenY
        const dx = state.x - x, dy = state.y - y
        const dt = e.timeStamp - state.t
        state.x = x
        state.y = y
        state.t = e.timeStamp
        state.vx = dx / dt
        state.vy = dy / dt
        this.#touchScrolled = true
        if (Math.abs(dx) >= Math.abs(dy)) {
            this.scrollBy(dx, 0)
        } else if (Math.abs(dy) > Math.abs(dx)) {
            this.scrollBy(0, dy)
        }
        this.#updateCoverDrag()
    }
    #onTouchEnd() {
        this.#touchScrolled = false
        if (this.scrolled) return
        // 覆盖拖拽会话：按拖距/速度提交或回弹，接管常规 snap 流程
        if (this.#coverDrag) {
            this.#finishCoverDrag(this.#touchState)
            return
        }
        const state = this.#touchState
        // A touch with negligible total displacement is a tap: the host app
        // handles taps on pointerup (which fires before touchend) and may have
        // started a programmatic page turn; snap() would then compute the page
        // from the mid-animation position and scroll it back. Settle to the
        // current page synchronously instead — a no-op when nothing moved.
        const isTap = state
            && Math.abs((state.x ?? 0) - (state.sx ?? 0)) < 24
            && Math.abs((state.y ?? 0) - (state.sy ?? 0)) < 24

        // XXX: Firefox seems to report scale as 1... sometimes...?
        // at this point I'm basically throwing `requestAnimationFrame` at
        // anything that doesn't work
        requestAnimationFrame(() => {
            if (globalThis.visualViewport.scale === 1) {
                if (isTap) this.#scrollToPage(this.page, null)
                else this.snap(state.vx, state.vy)
            }
        })
    }

    // view-transition-name 需要挂在最外层宿主（沿 shadow root 上溯）
    #vtNamedHost() {
        let host = this
        while (host.getRootNode() instanceof ShadowRoot) host = host.getRootNode().host
        return host
    }

    // 覆盖拖拽开始：空 update 的 VT + 无限慢保持动画，让旧页快照在整个
    // 拖拽期间驻留在最上层；此后每帧只更新 --cover-old-*/--cover-new-*
    #beginCoverDrag() {
        const host = this.#vtNamedHost()
        host.style.viewTransitionName = 'foliate-turn'
        injectViewTransitionStyles()
        const html = document.documentElement
        html.classList.add('foliate-vt', 'foliate-vt-drag')
        html.style.setProperty('--cover-old-x', '0px')
        html.style.setProperty('--cover-old-y', '0px')
        html.style.setProperty('--cover-new-x', '0px')
        html.style.setProperty('--cover-new-y', '0px')
        const vt = document.startViewTransition(() => {})
        this.#coverDrag = { vt, startPos: this.containerPosition, host }
    }

    #updateCoverDrag() {
        const drag = this.#coverDrag
        if (!drag) return
        const html = document.documentElement
        // 平移量 p（+前进）；旧层跟手平移 -p，
        // 新层静止在落定位置：前进时（下层页从右侧退回 [0,size]）为 p-size，
        // 后退时（下层页停在左侧 [-size,0]）为 p
        const p = this.containerPosition - drag.startPos
        if (this.#vertical) {
            html.style.setProperty('--cover-old-x', '0px')
            html.style.setProperty('--cover-old-y', -p + 'px')
            html.style.setProperty('--cover-new-x', '0px')
            html.style.setProperty('--cover-new-y', (p >= 0 ? p - this.size : p) + 'px')
        } else {
            html.style.setProperty('--cover-old-x', -p + 'px')
            html.style.setProperty('--cover-old-y', '0px')
            html.style.setProperty('--cover-new-x', (p >= 0 ? p - this.size : p) + 'px')
            html.style.setProperty('--cover-new-y', '0px')
        }
    }

    // 覆盖拖拽结束：拖距过半或同向快甩 → 提交（底层跳到目标页，旧层滑出
    // 剩余距离）；否则回弹（旧层滑回、新层滑出，底层退回起点）
    #finishCoverDrag(state) {
        const drag = this.#coverDrag
        const html = document.documentElement
        const size = this.size
        // dx 与 #updateCoverDrag 同符号：正 = 向前拖（下一页），负 = 向后拖
        const dx = this.containerPosition - drag.startPos
        const isTap = state &&
            Math.abs((state.x ?? 0) - (state.sx ?? 0)) < 24 &&
            Math.abs((state.y ?? 0) - (state.sy ?? 0)) < 24
        const forward = dx > size / 2 || state.vx > 0.5
        const backward = dx < -size / 2 || state.vx < -0.5
        const canForward = forward && !this.atEnd
        const canBackward = backward && !this.atStart
        const cleanup = () => {
            if (cleaned) return
            cleaned = true
            html.classList.remove('foliate-vt', 'foliate-vt-drag',
                'foliate-cover-commit-forward', 'foliate-cover-commit-backward', 'foliate-cover-cancel')
            html.style.removeProperty('--cover-old-x')
            html.style.removeProperty('--cover-old-y')
            html.style.removeProperty('--cover-new-x')
            html.style.removeProperty('--cover-new-y')
            drag.host.style.viewTransitionName = ''
            if (this.#coverDrag === drag) this.#coverDrag = null
        }
        let cleaned = false
        if (isTap || (!canForward && !canBackward)) {
            // 未拖动/不到位/到边界：快照与当前画面一致，直接结束
            drag.vt.skipTransition()
            cleanup()
            return
        }
        if (isTap || (!canForward && !canBackward)) {
            // 未拖动/不到位/到边界：快照与当前画面一致，直接结束
            drag.vt.skipTransition()
            cleanup()
            return
        }
        const jumpTo = (pos, reason) => {
            this.containerPosition = pos
            this.#scrollBounds = [pos, this.atStart ? 0 : this.size, this.atEnd ? 0 : this.size]
            this.#afterScroll(reason)
        }
        const step = this.#rtl ? -size : size
        // 先排程清理（动画结束即可复位），再做底层跳转——
        // 跳转触发的 relocate 若在宿主侧抛错，不能丢掉清理
        setTimeout(cleanup, 320)
        if (canForward) {
            html.classList.add('foliate-cover-commit-forward')
            // 底层跳到目标页（藏在旧层之下），relocate 让页码立即更新
            try {
                jumpTo(drag.startPos + step, 'page')
            } catch (e) {
                console.warn('cover drag commit relocate failed', e)
            }
        } else if (canBackward) {
            html.classList.add('foliate-cover-commit-backward')
            try {
                jumpTo(drag.startPos - step, 'page')
            } catch (e) {
                console.warn('cover drag commit relocate failed', e)
            }
        } else {
            html.classList.add('foliate-cover-cancel')
            try {
                jumpTo(drag.startPos, 'snap')
            } catch (e) {
                console.warn('cover drag cancel relocate failed', e)
            }
        }
        drag.vt.finished.finally(cleanup)
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
        // slide 不走分层快照：滑动是跟手的连续平移，快照无法从拖拽中途的位置
        // 无缝续接；页眉/页脚的跟随由宿主监听 scroll 实时驱动
        return (style === 'cover' || style === 'curl')
            && !this.scrolled
            && typeof document.startViewTransition === 'function'
            ? style : null
    }
    // 覆盖/仿真翻页：startViewTransition 先拍旧页快照，回调内瞬时跳到新页，
    // 之后旧页快照在静止的新页之上"卷走"（覆盖=整卡平移滑出，仿真=折痕弧扫过），
    // 后退则反向编排。页面本身是分栏大容器的一片切片，
    // 无法作为 DOM 层移动，只能靠快照分层
    #viewTransitionTurn(offset, reason) {
        const style = this.#layeredTurn
        const pos = this.containerPosition
        // RTL 横向滚动坐标为负、竖排 scrollTop 恒正，按绝对值比较即可
        const forward = Math.abs(offset) > Math.abs(pos)
        const side = this.#vertical ? 'top' : this.#rtl ? 'right' : 'left'
        // 仿真卷角起点：前进从书外侧角、后退从书脊侧（Readest 同款）
        const eatSide = forward !== this.#rtl ? 'right' : 'left'
        const classes = ['foliate-vt', `foliate-vt-${style}`,
            forward ? 'foliate-vt-forward' : 'foliate-vt-backward',
            `foliate-vt-${side}`, `foliate-vt-eat-${eatSide}`]
        // named 伪元素树从文档根部解析：沿 shadow host 上溯，把
        // view-transition-name 设到最外层宿主（foliate-view）上
        let namedHost = this
        while (namedHost.getRootNode() instanceof ShadowRoot)
            namedHost = namedHost.getRootNode().host
        injectViewTransitionStyles()
        namedHost.style.viewTransitionName = 'foliate-turn'
        const html = document.documentElement
        html.classList.add(...classes)
        const token = ++this.#vtToken
        const cleanup = () => {
            if (this.#vtToken !== token) return
            html.classList.remove(...classes)
            namedHost.style.viewTransitionName = ''
        }
        const transition = document.startViewTransition(() => {
            this.containerPosition = offset
            this.#scrollBounds = [offset, this.atStart ? 0 : this.size, this.atEnd ? 0 : this.size]
            this.#afterScroll(reason)
        })
        transition.finished.finally(cleanup)
        return transition.finished.then(() => {
            // 过渡期间邻接章节加载可能把容器重新锚到旧位置，结束后再钉回目标
            if (this.#vtToken !== token) return
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
        if ((reason === 'snap' || smooth) && this.hasAttribute('animated')) {
            if (this.#layeredTurn) return this.#viewTransitionTurn(offset, reason)
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
        this.#observer.unobserve(this)
        this.#view.destroy()
        this.#view = null
        this.sections[this.#index]?.unload?.()
        this.#mediaQuery.removeEventListener('change', this.#mediaQueryListener)
    }
}

customElements.define('foliate-paginator', Paginator)
