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
  /** 水平页边距（占屏宽百分比） */
  marginH: number
  /** 垂直页边距（占屏高百分比） */
  marginV: number
  indent: boolean
  justify: boolean
  /** 正文加粗 */
  bold: boolean
  fontPreset: string
  themeId: string
  /** 用户自定义主题列表（themeId 指向其中某个 id 或内置主题 id） */
  customThemes: CustomTheme[]
  wallpaperId: number | null
  /** 亮度调节，范围 0.2 ~ 0.65，默认 0.6（0.6 为基准亮度，即无滤镜效果；显示百分比以 0.65 为 100%） */
  brightness: number
  /** 跟随系统亮度：开启后亮度随系统深色/浅色模式自动调节，并禁用手动滑块 */
  followSystemBrightness: boolean
  flow: Flow
  animated: boolean
  /** 翻页动画风格：slide = 平移，cover = 覆盖（旧页快照滑出/新页快照滑入，仅分页模式生效） */
  turnStyle: 'slide' | 'cover'
  tapTurn: boolean
  /** 是否禁用点击翻页动画（true = 点击立即切换，无过渡动画） */
  tapAnimated: boolean
  /** 左右两侧点击均翻到下一页（仅滑动翻上一页） */
  tapLeftNext: boolean
}

export interface ThemePreset {
  id: string
  name: string
  fg: string
  bg: string
  dark: boolean
}

/** 用户自定义主题：id 为本地生成的唯一标识（如 custom-<时间戳>） */
export interface CustomTheme {
  id: string
  name: string
  fg: string
  bg: string
}

export interface WebDavConfig {
  url: string
  username: string
  password: string
  path: string
  syncBooks: boolean
}

/** 书库专用的 WebDAV 配置：与同步配置字段独立、语义不同（browseOnly 替代 syncBooks） */
export interface LibraryWebDavConfig {
  url: string
  username: string
  password: string
  path: string
  /** 只浏览不下载到本地 */
  browseOnly: boolean
}

export interface KosyncConfig {
  url: string
  username: string
  userkey: string
  device: string
  autoSync: boolean
}

/** OPDS 书库配置（占位：本期不实现） */
export interface OpdsConfig {
  url: string
  username?: string
  password?: string
}

/** 书库类型 */
export type LibraryKind = 'webdav' | 'opds'

/** 同步类型 */
export type SyncKind = 'webdav' | 'kosync'

/** 通用书库/同步源基础字段 */
export interface SourceBase<K extends string, C> {
  id: string
  kind: K
  /** 显示名（用户可改） */
  name: string
  config: C
  /** 是否启用 */
  enabled: boolean
  createdAt: number
  updatedAt: number
}

/** 书库源：本期支持 WebDAV，OPDS 预留 */
export type LibrarySource =
  | SourceBase<'webdav', LibraryWebDavConfig>
  | SourceBase<'opds', OpdsConfig>

/** 同步源：WebDAV 同步 + KOReader */
export type SyncSource =
  | SourceBase<'webdav', WebDavConfig>
  | SourceBase<'kosync', KosyncConfig>

/** 远端书库浏览的条目（目录或文件） */
export interface LibraryEntry {
  /** 文件名或目录名（含 .epub 后缀） */
  name: string
  isDir: boolean
  size?: number
  /** WebDAV href */
  href: string
}
