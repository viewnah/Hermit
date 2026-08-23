import Dexie, { type Table } from 'dexie'
import type { BookmarkRecord, BookRecord, FontAsset, ProgressRecord, WallpaperAsset } from './types'

class ReaderDB extends Dexie {
  books!: Table<BookRecord, number>
  progress!: Table<ProgressRecord, number>
  bookmarks!: Table<BookmarkRecord, number>
  fonts!: Table<FontAsset, number>
  wallpapers!: Table<WallpaperAsset, number>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('clip-reader')
    this.version(1).stores({
      books: '++id, digest, title, lastReadAt, addedAt',
      progress: 'bookId, updatedAt',
      fonts: '++id, family',
      wallpapers: '++id, addedAt',
      kv: 'key',
    })
    this.version(2).stores({
      books: '++id, digest, title, lastReadAt, addedAt',
      progress: 'bookId, updatedAt',
      bookmarks: '++id, bookId, createdAt',
      fonts: '++id, family',
      wallpapers: '++id, addedAt',
      kv: 'key',
    })
  }
}

export const db = new ReaderDB()

export const kvGet = async <T>(key: string): Promise<T | undefined> => {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}

export const kvSet = (key: string, value: unknown) =>
  db.kv.put({ key, value })
