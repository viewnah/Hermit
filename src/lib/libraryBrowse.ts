import { davGet, davList, WebDavError, type WebDavAuthConfig } from './webdav'
import { isWebDavLibrary } from './librarySources'
import { importBookFile } from './bookService'
import type { LibraryEntry, LibrarySource } from '../types'

/** 把任意 webdav 兼容配置转换为 webdav.ts 所需形态 */
const toWebdavAuth = (cfg: { url: string; username: string; password: string; path: string }): WebDavAuthConfig => ({
  url: cfg.url,
  username: cfg.username,
  password: cfg.password,
  path: cfg.path,
})

/**
 * 列出远端书库某子目录的条目。
 * 仅支持 WebDAV（OPDS 本期不实现）。
 */
export const listLibraryDir = async (
  source: LibrarySource,
  subPath = '/',
): Promise<LibraryEntry[]> => {
  if (!isWebDavLibrary(source)) throw new Error('本期仅支持 WebDAV 书库')
  const path = joinPath(source.config.path, subPath)
  const items = await davList(toWebdavAuth({ ...source.config, path }), '/')
  return items.map(item => {
    const isDir = item.href.endsWith('/')
    return {
      name: item.name,
      isDir,
      href: item.href,
    }
  })
}

/** 拼接路径（避免双斜杠） */
const joinPath = (base: string, sub: string): string => {
  if (!sub || sub === '/') return base
  const b = base.replace(/\/+$/, '')
  const s = sub.replace(/^\/+/, '')
  return `${b}/${s}`
}

/**
 * 下载远端书库的 epub 文件并导入到本地书架。
 * 返回导入结果。
 */
export const downloadLibraryFile = async (
  source: LibrarySource,
  entry: LibraryEntry,
): Promise<{ ok: boolean; message: string }> => {
  if (!isWebDavLibrary(source)) return { ok: false, message: '不支持的书库类型' }
  if (entry.isDir) return { ok: false, message: '请选择文件而非目录' }
  if (!/\.epub$/i.test(entry.name)) return { ok: false, message: '仅支持 EPUB 文件' }
  try {
    const blob = await davGet(toWebdavAuth(source.config), '/' + entry.name)
    if (!blob) return { ok: false, message: '文件不存在' }
    const file = new File([blob], entry.name, { type: 'application/epub+zip' })
    const result = await importBookFile(file)
    return {
      ok: true,
      message: result.duplicate ? `${entry.name} 已在书架中` : `已导入 ${entry.name}`,
    }
  } catch (e) {
    return { ok: false, message: e instanceof WebDavError ? e.message : '下载失败' }
  }
}

/** 测试 WebDAV 书库连接。
 * 成功 resolve；失败时抛出带原因的 WebDavError（认证失败 / 无权限 / 网络错误 / HTTP 状态等） */
export const testLibraryConnection = async (source: LibrarySource): Promise<string> => {
  if (!isWebDavLibrary(source)) throw new Error('本期仅支持 WebDAV 书库')
  // 借用 webdav.ts 的 davTest：网络 / 认证 / HTTP 错误均会抛出带原因的 WebDavError
  const { davTest } = await import('./webdav')
  await davTest(toWebdavAuth(source.config))
  return '连接成功'
}