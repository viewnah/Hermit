declare module 'foliate-js/view.js' {
  export interface FoliateTocItem {
    label?: string
    href?: string
    subitems?: FoliateTocItem[]
  }

  export interface FoliateBook {
    metadata?: Record<string, unknown>
    toc?: FoliateTocItem[]
    pageList?: FoliateTocItem[]
    dir?: string
    sections?: unknown[]
    getCover?: () => Promise<Blob | null>
    [key: string]: unknown
  }

  export interface FoliateRelocateDetail {
    fraction: number
    cfi: string
    range?: Range
    tocItem?: { label?: string; href?: string } | null
    pageItem?: { label?: string; href?: string } | null
    section?: { current: number; total: number }
    [key: string]: unknown
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles(styles: string): void
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    goTo(target: unknown): Promise<void>
    /** 当前滚动位置（横向分页为 scrollLeft 语义），翻页动画期间持续变化 */
    containerPosition: number
    /** 当前页序号（0 基，按窗口中心判定），滑动跟手时持续变化 */
    page: number
  }

  export interface FoliateSearchExcerpt {
    pre: string
    match: string
    post: string
  }

  export interface FoliateSearchResult {
    cfi: string
    excerpt: FoliateSearchExcerpt
  }

  export type FoliateSearchYield =
    | FoliateSearchResult
    | { label?: string; subitems: FoliateSearchResult[] }
    | { progress: number }
    | 'done'

  export interface FoliateView extends HTMLElement {
    book: FoliateBook
    lastLocation: unknown
    open(book: Blob | string): Promise<void>
    init(opts: { lastLocation?: unknown; showTextStart?: boolean }): Promise<void>
    close(): void
    goTo(target: string | number): Promise<unknown>
    goToFraction(frac: number): Promise<void>
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    getTOCItemOf(target: string): Promise<unknown>
    search(opts: { query: string; index?: number; [key: string]: unknown }): AsyncGenerator<FoliateSearchYield>
    clearSearch(): void
    renderer: FoliateRenderer
    addEventListener(
      type: 'relocate',
      listener: (ev: CustomEvent<FoliateRelocateDetail>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: 'load',
      listener: (ev: CustomEvent<{ doc: Document; index: number }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void
  }

  export const makeBook: (file: Blob | string) => Promise<FoliateBook>
  export class View extends HTMLElement {}
}

declare global {
  interface HTMLElementTagNameMap {
    'foliate-view': import('foliate-js/view.js').FoliateView
  }
}
