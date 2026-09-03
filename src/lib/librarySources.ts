import { kvGet, kvSet } from '../db'
import type { LibrarySource, LibraryKind, LibraryWebDavConfig, OpdsConfig, SourceBase } from '../types'

const KEY = 'librarySources'
const MIGRATED_KEY = 'librarySourcesMigrated'

/** 生成新书库源 id */
export const newLibraryId = (): string =>
  `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** 读取所有书库源 */
export const listLibrarySources = async (): Promise<LibrarySource[]> =>
  await kvGet<LibrarySource[]>(KEY) ?? []

/** 保存全部书库源列表 */
export const saveLibrarySources = async (list: LibrarySource[]) =>
  await kvSet(KEY, list)

/** 新增书库源（写入并返回更新后的列表） */
export const addLibrarySource = async (
  source: Omit<LibrarySource, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<LibrarySource[]> => {
  const list = await listLibrarySources()
  const id = source.id ?? newLibraryId()
  const now = Date.now()
  const next: LibrarySource = { ...source, id, createdAt: now, updatedAt: now } as LibrarySource
  await saveLibrarySources([...list, next])
  return [...list, next]
}

/** 更新书库源 */
export const updateLibrarySource = async (
  id: string,
  patch: Partial<LibrarySource>,
): Promise<LibrarySource[]> => {
  const list = await listLibrarySources()
  const next = list.map(s => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } as LibrarySource : s)
  await saveLibrarySources(next)
  return next
}

/** 移除书库源 */
export const removeLibrarySource = async (id: string): Promise<LibrarySource[]> => {
  const list = await listLibrarySources()
  const next = list.filter(s => s.id !== id)
  await saveLibrarySources(next)
  return next
}

/** 切换启用状态（不写 updatedAt，避免不必要的写入） */
export const toggleLibraryEnabled = async (id: string): Promise<LibrarySource[]> => {
  const list = await listLibrarySources()
  const next = list.map(s => s.id === id ? { ...s, enabled: !s.enabled } as LibrarySource : s)
  await saveLibrarySources(next)
  return next
}

/** 旧 kv 迁移标记：本期不自动迁移 webdav → library（已在 syncSources 占用） */
export const ensureLibraryMigrated = async (): Promise<void> => {
  const flag = await kvGet<boolean>(MIGRATED_KEY)
  if (flag) return
  await kvSet(MIGRATED_KEY, true)
}

/** 默认书库配置（WebDAV） */
export const defaultLibraryWebDavConfig = (): LibraryWebDavConfig => ({
  url: '',
  username: '',
  password: '',
  path: '/clip-reader',
  browseOnly: false,
})

/** 默认书库配置（OPDS 占位） */
export const defaultOpdsConfig = (): OpdsConfig => ({
  url: '',
})

/** 从 URL 推导默认书库名（去掉协议，去掉末尾斜杠） */
export const deriveLibraryName = (kind: LibraryKind, config: { url: string }): string => {
  if (kind === 'webdav') return config.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'WebDAV 书库'
  if (kind === 'opds') return config.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'OPDS 书库'
  return '书库'
}

/** 类型守卫 */
export const isWebDavLibrary = (
  s: LibrarySource,
): s is SourceBase<'webdav', LibraryWebDavConfig> => s.kind === 'webdav'

export const isOpdsLibrary = (
  s: LibrarySource,
): s is SourceBase<'opds', OpdsConfig> => s.kind === 'opds'