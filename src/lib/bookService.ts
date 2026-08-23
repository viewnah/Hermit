import { makeBook } from 'foliate-js/view.js'
import { db } from '../db'
import { partialMd5 } from './digest'
import type { BookRecord } from '../types'

const langMap = (x: unknown): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  const obj = x as Record<string, string>
  const keys = Object.keys(obj)
  return obj[keys[0]] ?? ''
}

const formatAuthor = (author: unknown): string => {
  if (!author) return '佚名'
  const one = (a: unknown) => typeof a === 'string' ? a : langMap((a as { name?: unknown })?.name)
  if (Array.isArray(author)) return author.map(one).filter(Boolean).join(' / ')
  return one(author) || '佚名'
}

export interface ImportResult {
  book: BookRecord
  duplicate: boolean
}

export const importBookFile = async (file: File): Promise<ImportResult> => {
  if (!/\.epub$/i.test(file.name) && file.type !== 'application/epub+zip')
    throw new Error('目前仅支持 EPUB 格式')
  const digest = await partialMd5(file)
  // 旧版导入的记录可能没有 digest 或 digest 不一致（重导入修复场景），
  // 回退按文件名+大小匹配，避免同一本书出现重复条目
  const existing = (await db.books.where('digest').equals(digest).first())
    ?? (await db.books.filter(b => b.fileName === file.name && b.size === file.size).first())

  // Android 文件选择器返回的 File（content:// URI）存入 IndexedDB 后重读会
  // 因权限失效而报错，必须复制字节为自有 File 再持久化（foliate 依赖 name 判格式）
  const storedFile = new File([await file.arrayBuffer()], file.name, {
    type: file.type || 'application/epub+zip',
  })

  if (existing) {
    // 总是用新 File 覆盖：修复旧版直接存 SAF File / 无 name Blob 导致的不可读记录
    await db.books.update(existing.id!, { file: storedFile })
    return { book: { ...existing, file: storedFile }, duplicate: true }
  }

  const book = await makeBook(file)
  const meta = book.metadata ?? {}
  let cover: Blob | null = null
  try { cover = await book.getCover?.() ?? null } catch { cover = null }

  const record: BookRecord = {
    digest,
    title: langMap(meta.title) || file.name.replace(/\.epub$/i, ''),
    author: formatAuthor(meta.author),
    language: Array.isArray(meta.language) ? meta.language[0] : meta.language,
    publisher: langMap((meta.publisher as { name?: unknown } | undefined)?.name ?? ''),
    description: typeof meta.description === 'string' ? meta.description : '',
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
    cover,
    file: storedFile,
  }
  const id = await db.books.add(record)
  return { book: { ...record, id }, duplicate: false }
}

export const deleteBook = async (id: number) => {
  await db.transaction('rw', db.books, db.progress, async () => {
    await db.books.delete(id)
    await db.progress.delete(id)
  })
}
