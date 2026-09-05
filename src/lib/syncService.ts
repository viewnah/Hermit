import { db, kvGet, kvSet } from '../db'
import type {
  BookRecord, KosyncConfig, ProgressRecord, ReaderSettings, WebDavConfig,
} from '../types'
import { DEFAULT_KOSYNC_URL, kosyncPull, kosyncPush } from './kosync'
import {
  DEFAULT_WEBDAV_PATH, davGet, davGetJson, davList, davMkdir, davPut, davTest,
} from './webdav'
import { md5Bytes } from './digest'

export const getWebdavConfig = async (): Promise<WebDavConfig | null> =>
  await kvGet<WebDavConfig>('webdav') ?? null

export const saveWebdavConfig = async (config: WebDavConfig) => {
  await kvSet('webdav', config)
}

export const getKosyncConfig = async (): Promise<KosyncConfig | null> =>
  await kvGet<KosyncConfig>('kosync') ?? null

export const saveKosyncConfig = async (config: KosyncConfig) => {
  await kvSet('kosync', config)
}

export const defaultWebdavConfig = (): WebDavConfig => ({
  url: '',
  username: '',
  password: '',
  path: DEFAULT_WEBDAV_PATH,
  syncBooks: true,
})

export const defaultKosyncConfig = (): KosyncConfig => ({
  url: DEFAULT_KOSYNC_URL,
  username: '',
  userkey: '',
  device: 'Hermit',
  autoSync: true,
})

interface SyncPayload {
  version: 1
  updatedAt: number
  settings?: ReaderSettings & { savedAt?: number }
  progress?: Record<string, Omit<ProgressRecord, 'bookId'>>
  fonts?: { hash: string; name: string; family: string }[]
  wallpapers?: { hash: string; name: string }[]
}

const hashBlob = async (blob: Blob) => md5Bytes(new Uint8Array(await blob.arrayBuffer()))

export interface SyncReport {
  settingsPulled: boolean
  progressMerged: number
  booksUploaded: number
  booksDownloaded: number
  fontsPulled: number
  wallpapersPulled: number
}

export const syncWebdav = async (
  config: WebDavConfig,
  onStatus?: (msg: string) => void,
): Promise<SyncReport> => {
  const report: SyncReport = {
    settingsPulled: false, progressMerged: 0, booksUploaded: 0,
    booksDownloaded: 0, fontsPulled: 0, wallpapersPulled: 0,
  }
  onStatus?.('连接 WebDAV…')
  await davTest(config)
  await davMkdir(config)

  onStatus?.('拉取云端数据…')
  const remote = (await davGetJson<SyncPayload>(config, '/sync.json')) ?? null

  // settings: last write wins by savedAt
  if (remote?.settings?.savedAt) {
    const local = await kvGet<ReaderSettings>('settings')
    const localSavedAt = (local as ReaderSettings & { savedAt?: number })?.savedAt ?? 0
    if ((remote.settings.savedAt ?? 0) > localSavedAt) {
      const { savedAt: _savedAt, ...settings } = remote.settings
      await kvSet('settings', settings)
      report.settingsPulled = true
    }
  }

  // progress merge by digest, last write wins by updatedAt
  const books = await db.books.toArray()
  const byDigest = new Map(books.map(b => [b.digest, b]))
  if (remote?.progress) {
    for (const [digest, rec] of Object.entries(remote.progress)) {
      const book = byDigest.get(digest)
      if (!book?.id) continue
      const local = await db.progress.get(book.id)
      if (!local || rec.updatedAt > local.updatedAt) {
        await db.progress.put({ ...rec, bookId: book.id })
        report.progressMerged++
      }
    }
  }

  // assets: fonts & wallpapers
  if (remote?.fonts) {
    for (const f of remote.fonts) {
      const exists = (await db.fonts.toArray()).some(x => x.family === f.family)
      if (exists) continue
      const blob = await davGet(config, `/assets/${f.hash}`)
      if (blob) {
        await db.fonts.add({ name: f.name, family: f.family, blob, addedAt: Date.now() })
        report.fontsPulled++
      }
    }
  }
  if (remote?.wallpapers) {
    for (const w of remote.wallpapers) {
      const exists = (await db.wallpapers.toArray()).some(x => x.name === w.name)
      if (exists) continue
      const blob = await davGet(config, `/assets/${w.hash}`)
      if (blob) {
        await db.wallpapers.add({ name: w.name, blob, addedAt: Date.now() })
        report.wallpapersPulled++
      }
    }
  }

  // books download
  if (config.syncBooks) {
    onStatus?.('检查云端书库…')
    try {
      const listed = await davList(config, '/books')
      for (const item of listed) {
        const digest = item.name.replace(/\.epub$/i, '')
        if (!/^[0-9a-f]{32}$/.test(digest) || byDigest.has(digest)) continue
        onStatus?.(`下载《${item.name}》…`)
        const blob = await davGet(config, `/books/${item.name}`)
        if (!blob) continue
        const file = new File([blob], item.name, { type: 'application/epub+zip' })
        const { importBookFile } = await import('./bookService')
        await importBookFile(file)
        report.booksDownloaded++
      }
    } catch { /* book listing optional */ }
  }

  // push local state
  onStatus?.('上传本地数据…')
  const push: SyncPayload = { version: 1, updatedAt: Date.now() }

  const localSettings = await kvGet<ReaderSettings & { savedAt?: number }>('settings')
  if (localSettings) push.settings = { ...localSettings, savedAt: localSettings.savedAt ?? Date.now() }

  const progressMap: SyncPayload['progress'] = {}
  const allProgress = await db.progress.toArray()
  for (const rec of allProgress) {
    const book = books.find(b => b.id === rec.bookId)
    if (book) progressMap[book.digest] = {
      cfi: rec.cfi, fraction: rec.fraction,
      percentage: rec.percentage, sectionIndex: rec.sectionIndex,
      updatedAt: rec.updatedAt,
    }
  }
  if (remote?.progress)
    for (const [digest, rec] of Object.entries(remote.progress))
      if (!progressMap[digest]) progressMap[digest] = rec
  push.progress = progressMap

  const fonts = await db.fonts.toArray()
  push.fonts = []
  for (const f of fonts) {
    const hash = await hashBlob(f.blob)
    push.fonts.push({ hash, name: f.name, family: f.family })
  }
  const wallpapers = await db.wallpapers.toArray()
  push.wallpapers = []
  for (const w of wallpapers) {
    const hash = await hashBlob(w.blob)
    push.wallpapers.push({ hash, name: w.name })
  }

  await davPut(config, '/sync.json', JSON.stringify(push), 'application/json')

  // upload missing assets
  const remoteFontHashes = new Set((remote?.fonts ?? []).map(f => f.hash))
  const remoteWallHashes = new Set((remote?.wallpapers ?? []).map(w => w.hash))
  for (let i = 0; i < fonts.length; i++) {
    const hash = push.fonts![i].hash
    if (!remoteFontHashes.has(hash))
      await davPut(config, `/assets/${hash}`, fonts[i].blob)
  }
  for (let i = 0; i < wallpapers.length; i++) {
    const hash = push.wallpapers![i].hash
    if (!remoteWallHashes.has(hash))
      await davPut(config, `/assets/${hash}`, wallpapers[i].blob)
  }

  // upload missing books
  if (config.syncBooks) {
    let remoteBookNames: Set<string> | null = null
    try {
      remoteBookNames = new Set((await davList(config, '/books')).map(x => x.name))
    } catch { remoteBookNames = null }
    for (const book of books) {
      const name = `${book.digest}.epub`
      if (remoteBookNames?.has(name)) continue
      onStatus?.(`上传《${book.title}》…`)
      await davPut(config, `/books/${name}`, book.file, 'application/epub+zip')
      report.booksUploaded++
    }
  }

  return report
}

// ---- kosync ----

export const pushKosyncProgress = async (
  book: BookRecord,
  progress: ProgressRecord,
) => {
  const config = await getKosyncConfig()
  if (!config?.username || !config.autoSync) return
  await kosyncPush(config, book.digest, progress.cfi, progress.percentage)
}

export const pullKosyncProgress = async (
  book: BookRecord,
): Promise<{ percentage: number; progress: string; timestamp: number } | null> => {
  const config = await getKosyncConfig()
  if (!config?.username) return null
  const remote = await kosyncPull(config, book.digest)
  if (!remote) return null
  return {
    percentage: remote.percentage,
    progress: remote.progress,
    timestamp: remote.timestamp * 1000,
  }
}
