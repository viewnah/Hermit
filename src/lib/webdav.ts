export class WebDavError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

/** WebDAV 认证 + 路径子集：与 WebDavConfig 兼容，但去掉 syncBooks 业务字段，
 * 让书库（LibraryWebDavConfig）和同步（WebDavConfig）共用底层 */
export interface WebDavAuthConfig {
  url: string
  username: string
  password: string
  path: string
}

const buildBase = (config: WebDavAuthConfig): string => {
  const url = config.url.replace(/\/+$/, '')
  const path = config.path.replace(/^\/+|\/+$/g, '')
  return path ? `${url}/${path}` : url
}

const authHeader = (config: WebDavAuthConfig): string =>
  'Basic ' + btoa(config.username + ':' + config.password)

const request = async (
  config: WebDavAuthConfig,
  method: string,
  path: string,
  body?: BodyInit,
  headers: Record<string, string> = {},
): Promise<Response> => {
  const url = `${buildBase(config)}${path}`.replace(/([^:])\/\//g, '$1/')
  const res = await fetch(url, {
    method,
    headers: { Authorization: authHeader(config), ...headers },
    body,
  })
  return res
}

export const davTest = async (config: WebDavAuthConfig): Promise<void> => {
  const res = await request(config, 'PROPFIND', '/', undefined, { Depth: '0' })
  if (!res.ok) {
    if (res.status === 401) throw new WebDavError('认证失败，请检查账号密码', 401)
    if (res.status === 404) throw new WebDavError('目录不存在，将尝试自动创建', 404)
    throw new WebDavError(`连接失败 (${res.status})`, res.status)
  }
}

export const davMkdir = async (config: WebDavAuthConfig): Promise<void> => {
  const res = await request(config, 'MKCOL', '/')
  if (!res.ok && res.status !== 405)
    throw new WebDavError(`创建目录失败 (${res.status})`, res.status)
}

export const davPut = async (
  config: WebDavAuthConfig,
  path: string,
  data: BodyInit,
  contentType = 'application/octet-stream',
): Promise<void> => {
  const res = await request(config, 'PUT', path, data, { 'Content-Type': contentType })
  if (!res.ok) throw new WebDavError(`上传失败 (${res.status})`, res.status)
}

export const davGet = async (
  config: WebDavAuthConfig,
  path: string,
): Promise<Blob | null> => {
  const res = await request(config, 'GET', path)
  if (res.status === 404) return null
  if (!res.ok) throw new WebDavError(`下载失败 (${res.status})`, res.status)
  return res.blob()
}

export const davGetJson = async <T>(config: WebDavAuthConfig, path: string): Promise<T | null> => {
  const blob = await davGet(config, path)
  if (!blob) return null
  return JSON.parse(await blob.text()) as T
}

export const davList = async (
  config: WebDavAuthConfig,
  dir: string,
): Promise<{ href: string; name: string }[]> => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:resourcetype/><d:getcontentlength/></d:prop>
</d:propfind>`
  const res = await request(config, 'PROPFIND', dir, body, {
    Depth: '1',
    'Content-Type': 'application/xml',
  })
  if (!res.ok) throw new WebDavError(`列目录失败 (${res.status})`, res.status)
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const nodes = Array.from(
    doc.getElementsByTagNameNS('DAV:', 'response'),
  )
  const dirPath = `${buildBase(config)}${dir}`.replace(/\/+$/, '') + '/'
  return nodes
    .map(node => {
      const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent ?? ''
      return {
        href,
        name: decodeURIComponent(href).split('/').filter(Boolean).pop() ?? '',
      }
    })
    .filter(x => {
      const normalized = decodeURIComponent(x.href).replace(/\/+$/, '')
      return normalized !== decodeURIComponent(dirPath).replace(/\/+$/, '') && x.name
    })
}

export const DEFAULT_WEBDAV_PATH = '/clip-reader'
