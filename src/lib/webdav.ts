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

/** 是否运行在 Tauri（桌面/移动）运行时内 */
let tauriCached: boolean | null = null
const isTauri = (): boolean => {
  if (tauriCached == null) {
    // 通过官方 API 检测；模块不存在（纯浏览器）时视为 false
    tauriCached = !!(globalThis as Record<string, unknown>).__TAURI_INTERNALS__
  }
  return tauriCached
}

/** 把 Blob/字符串转成 {encoding, payload} 用于原生通道传输 */
const encodeBody = async (body?: BodyInit | null): Promise<{ encoding?: string; payload?: string } | null> => {
  if (body == null) return null
  if (typeof body === 'string') return { encoding: 'text', payload: body }
  const buf = body instanceof Blob
    ? new Uint8Array(await body.arrayBuffer())
    : new Uint8Array(body as ArrayBuffer)
  return { encoding: 'base64', payload: bytesToBase64(buf) }
}

/** 高效 bytes → base64（分块，避免大数组字符串拼接栈溢出） */
const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** base64 → bytes */
const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** base64url 编码（URL 安全，无 = / +） */
const base64UrlEncode = (s: string): string => {
  const b64 = btoa(s)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 构造 Vite dev 代理地址（方案 B）：
 * 把远端 WebDAV 基址编码进同源路径，由 dev server 转发，绕开浏览器 CORS 与
 * 自定义 method/header 限制。仅浏览器开发环境使用。
 */
const proxyUrlFor = (config: WebDavAuthConfig, path: string): string => {
  const base = config.url.replace(/\/+$/, '')
  const dir = (config.path || '').replace(/^\/+|\/+$/g, '')
  const suffix = (dir ? '/' + dir : '') + (path.startsWith('/') ? path : '/' + path)
  return `/dav-proxy/${base64UrlEncode(base)}${suffix}`
}

/**
 * 统一请求入口：
 * - Tauri 运行时：走 Rust 端 reqwest（绕过浏览器 CORS / 证书限制）
 * - 浏览器环境：走原生 fetch（仅用于网页调试，跨域仍受 CORS 限制）
 * 返回值均归一为 Response 兼容对象。
 */
const request = async (
  config: WebDavAuthConfig,
  method: string,
  path: string,
  body?: BodyInit,
  headers: Record<string, string> = {},
): Promise<Response> => {
  const url = `${buildBase(config)}${path}`.replace(/([^:])\/\//g, '$1/')
  const merged = {
    Authorization: authHeader(config),
    ...headers,
  }

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const encoded = await encodeBody(body)
    let res: {
      status: number
      statusText: string
      headers: Record<string, string>
      bodyBase64?: string | null
    }
    try {
      res = await invoke<typeof res>('http_request', {
        req: {
          url,
          method,
          headers: merged,
          body: encoded?.payload ?? null,
          bodyEncoding: encoded?.encoding ?? null,
        },
      })
    } catch (e) {
      // Rust 端网络错误已转成友好中文信息，直接作为 WebDavError 抛出
      const reason = e instanceof Error ? e.message : String(e)
      throw new WebDavError(reason.replace(/^Error invoking remote function 'http_request': /, ''))
    }
    // 还原 body
    let data: ArrayBuffer | null = null
    if (res.bodyBase64) {
      data = base64ToBytes(res.bodyBase64).buffer as ArrayBuffer
    }
    const resHeaders = new Headers()
    for (const [k, v] of Object.entries(res.headers ?? {})) resHeaders.set(k, v)
    return new Response(data, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  }

  // 浏览器环境：走 Vite dev 代理（同源转发到真实 WebDAV，绕开 CORS）
  const proxyUrl = proxyUrlFor(config, path)
  let res: Response
  try {
    res = await fetch(proxyUrl, {
      method,
      headers: merged,
      body: body as BodyInit | undefined,
    })
  } catch (e) {
    const reason = e instanceof TypeError
      ? '无法连接服务器（请检查地址与网络）'
      : e instanceof Error ? e.message : String(e)
    throw new WebDavError(reason)
  }
  if (!res.ok && res.headers.get('content-type')?.includes('text/plain')) {
    // 代理层返回的中文错误（如 502 “无法连接服务器…”）直接透传
    const text = await res.text().catch(() => '')
    if (/[\u4e00-\u9fa5]/.test(text)) {
      throw new WebDavError(text, res.status)
    }
    // 重建 Response，保留 body 供上层判断
    return new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
  return res
}

export const davTest = async (config: WebDavAuthConfig): Promise<void> => {
  let res: Response
  try {
    res = await request(config, 'PROPFIND', '/', undefined, { Depth: '0' })
  } catch (e) {
    if (e instanceof WebDavError) throw e
    throw new WebDavError('连接失败')
  }
  if (!res.ok) {
    if (res.status === 401) throw new WebDavError('认证失败：账号或密码错误（HTTP 401）', 401)
    if (res.status === 403) throw new WebDavError('无访问权限：该账号不可读写此目录（HTTP 403）', 403)
    if (res.status === 404) throw new WebDavError('目录不存在，将尝试自动创建（HTTP 404）', 404)
    throw new WebDavError(`连接失败（HTTP ${res.status}：${res.statusText || '服务器错误'}）`, res.status)
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
