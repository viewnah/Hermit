import { kvGet, kvSet } from '../db'
import type {
  KosyncConfig, SyncSource, WebDavConfig, SourceBase,
} from '../types'

const KEY = 'syncSources'
const MIGRATED_KEY = 'syncSourcesMigrated'

/** 生成新同步源 id */
export const newSyncId = (): string =>
  `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** 读取所有同步源 */
export const listSyncSources = async (): Promise<SyncSource[]> =>
  await kvGet<SyncSource[]>(KEY) ?? []

/** 保存全部同步源列表 */
export const saveSyncSources = async (list: SyncSource[]) =>
  await kvSet(KEY, list)

/** 新增同步源 */
export const addSyncSource = async (
  source: Omit<SyncSource, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<SyncSource[]> => {
  const list = await listSyncSources()
  const id = source.id ?? newSyncId()
  const now = Date.now()
  const next: SyncSource = { ...source, id, createdAt: now, updatedAt: now } as SyncSource
  await saveSyncSources([...list, next])
  return [...list, next]
}

/** 更新同步源 */
export const updateSyncSource = async (
  id: string,
  patch: Partial<SyncSource>,
): Promise<SyncSource[]> => {
  const list = await listSyncSources()
  const next = list.map(s => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } as SyncSource : s)
  await saveSyncSources(next)
  return next
}

/** 移除同步源 */
export const removeSyncSource = async (id: string): Promise<SyncSource[]> => {
  const list = await listSyncSources()
  const next = list.filter(s => s.id !== id)
  await saveSyncSources(next)
  return next
}

/** 切换启用状态 */
export const toggleSyncEnabled = async (id: string): Promise<SyncSource[]> => {
  const list = await listSyncSources()
  const next = list.map(s => s.id === id ? { ...s, enabled: !s.enabled } as SyncSource : s)
  await saveSyncSources(next)
  return next
}

/** 写入同步摘要（不更新 updatedAt） */
export const setSyncReport = async (
  id: string,
  report: { lastSyncAt: number; lastSyncSummary: string },
): Promise<SyncSource[]> => {
  const list = await listSyncSources()
  const next = list.map(s => s.id === id ? { ...s, ...report } as SyncSource : s)
  await saveSyncSources(next)
  return next
}

/** 默认同步配置（WebDAV） */
export const defaultWebDavSyncConfig = (): WebDavConfig => ({
  url: '',
  username: '',
  password: '',
  path: '/clip-reader',
  syncBooks: true,
})

/** 默认同步配置（KOReader） */
export const defaultKosyncConfig = (): KosyncConfig => ({
  url: 'https://sync.koreader.rocks',
  username: '',
  userkey: '',
  device: 'Hermit',
  autoSync: true,
})

/** 从 URL 推导默认同步源名称 */
export const deriveSyncName = (kind: 'webdav' | 'kosync', config: { url: string }): string => {
  if (kind === 'webdav') return config.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'WebDAV 同步'
  return 'KOReader'
}

/** 一次性迁移：把旧 kv 中的 webdav/kosync 配置迁移为同步源条目 */
export const ensureSyncMigrated = async (): Promise<void> => {
  const flag = await kvGet<boolean>(MIGRATED_KEY)
  if (flag) return

  const existing = await listSyncSources()
  if (existing.length > 0) {
    await kvSet(MIGRATED_KEY, true)
    return
  }

  const legacyDav = await kvGet<WebDavConfig>('webdav')
  const legacyKos = await kvGet<KosyncConfig>('kosync')
  const now = Date.now()
  const migrated: SyncSource[] = []

  if (legacyDav && legacyDav.url) {
    migrated.push({
      id: newSyncId(),
      kind: 'webdav',
      name: legacyDav.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'WebDAV 同步',
      config: legacyDav,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    } as SourceBase<'webdav', WebDavConfig>)
  }
  if (legacyKos && legacyKos.username) {
    migrated.push({
      id: newSyncId(),
      kind: 'kosync',
      name: 'KOReader',
      config: legacyKos,
      enabled: legacyKos.autoSync,
      createdAt: now,
      updatedAt: now,
    } as SourceBase<'kosync', KosyncConfig>)
  }

  if (migrated.length > 0) {
    await saveSyncSources(migrated)
  }
  await kvSet(MIGRATED_KEY, true)
}

/** 类型守卫 */
export const isWebDavSync = (
  s: SyncSource,
): s is SourceBase<'webdav', WebDavConfig> => s.kind === 'webdav'

export const isKosync = (
  s: SyncSource,
): s is SourceBase<'kosync', KosyncConfig> => s.kind === 'kosync'