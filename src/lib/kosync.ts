import type { KosyncConfig } from '../types'

export interface KosyncProgress {
  device: string
  device_id: string
  document: string
  progress: string
  percentage: number
  timestamp: number
}

const buildUrl = (config: KosyncConfig, path: string) =>
  config.url.replace(/\/+$/, '') + path

const headers = (config: KosyncConfig): HeadersInit => ({
  Accept: 'application/vnd.koreader.v1+json',
  'Content-Type': 'application/json',
  'x-auth-user': config.username,
  'x-auth-key': config.userkey,
})

export class KosyncError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

const checkAuth = (status: number) => {
  if (status === 401) throw new KosyncError('用户名或密码错误', status)
  if (status === 402) throw new KosyncError('用户名已被注册', status)
}

export const kosyncRegister = async (config: KosyncConfig) => {
  const res = await fetch(buildUrl(config, '/users/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.userkey }),
  })
  if (res.status !== 201) {
    let detail = ''
    try { detail = (await res.json())?.detail ?? '' } catch { /* ignore */ }
    checkAuth(res.status)
    throw new KosyncError(detail || `注册失败 (${res.status})`, res.status)
  }
  return true
}

export const kosyncAuth = async (config: KosyncConfig) => {
  const res = await fetch(buildUrl(config, '/users/auth'), {
    headers: headers(config),
  })
  if (res.status !== 200) {
    checkAuth(res.status)
    throw new KosyncError(`验证失败 (${res.status})`, res.status)
  }
  return true
}

export const kosyncPush = async (
  config: KosyncConfig,
  document: string,
  progress: string,
  percentage: number,
) => {
  const res = await fetch(buildUrl(config, '/syncs/progress'), {
    method: 'PUT',
    headers: headers(config),
    body: JSON.stringify({
      document,
      progress,
      percentage,
      device: config.device,
      device_id: getDeviceId(),
    }),
  })
  if (res.status !== 200 && res.status !== 202) {
    checkAuth(res.status)
    throw new KosyncError(`同步进度失败 (${res.status})`, res.status)
  }
  return true
}

export const kosyncPull = async (
  config: KosyncConfig,
  document: string,
): Promise<KosyncProgress | null> => {
  const res = await fetch(buildUrl(config, `/syncs/progress/${document}`), {
    headers: headers(config),
  })
  if (res.status === 404) return null
  if (res.status !== 200) {
    checkAuth(res.status)
    throw new KosyncError(`拉取进度失败 (${res.status})`, res.status)
  }
  return (await res.json()) as KosyncProgress
}

let cachedDeviceId: string | null = null

export const getDeviceId = (): string => {
  if (cachedDeviceId) return cachedDeviceId
  const KEY = 'clip-reader-device-id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    localStorage.setItem(KEY, id)
  }
  cachedDeviceId = id
  return id
}

export const DEFAULT_KOSYNC_URL = 'https://sync.koreader.rocks'
