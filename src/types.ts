export type Flow = 'paginated' | 'scrolled'

export interface BookRecord {
  id?: number
  digest: string
  title: string
  author: string
  language?: string
  publisher?: string
  description?: string
  fileName: string
  size: number
  addedAt: number
  lastReadAt?: number
  cover?: Blob | null
  file: Blob
}

export interface ProgressRecord {
  bookId: number
  cfi: string
  fraction: number
  percentage: number
  sectionIndex: number
  updatedAt: number
}

export interface BookmarkRecord {
  id?: number
  bookId: number
  cfi: string
  label: string
  percentage: number
  /** 当前页标识（章节序号:章节内页码），用于页面级匹配，切换添加/移除 */
  pageKey?: string
  createdAt: number
}

export interface FontAsset {
  id?: number
  name: string
  family: string
  blob: Blob
  addedAt: number
}

export interface WallpaperAsset {
  id?: number
  name: string
  blob: Blob
  addedAt: number
}

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  paraSpacing: number
  letterSpacing: number
  margin: number
  indent: boolean
  justify: boolean
  fontPreset: string
  themeId: string
  customFg: string
  customBg: string
  wallpaperId: number | null
  wallpaperDim: number
  wallpaperBlur: number
  flow: Flow
  animated: boolean
  tapTurn: boolean
}

export interface ThemePreset {
  id: string
  name: string
  fg: string
  bg: string
  dark: boolean
}

export interface WebDavConfig {
  url: string
  username: string
  password: string
  path: string
  syncBooks: boolean
}

export interface KosyncConfig {
  url: string
  username: string
  userkey: string
  device: string
  autoSync: boolean
}
