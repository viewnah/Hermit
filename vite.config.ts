import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as http from 'node:http'
import * as https from 'node:https'

/**
 * WebDAV 开发代理（方案 B，仅开发模式使用）：
 *
 * 浏览器同源请求可携带任意 method（PROPFIND/MKCOL/PUT…）与自定义头（Authorization/Depth），
 * 且不受 CORS 限制。因此这里提供一个中转端点：
 *
 *   /dav-proxy/<base64url(目标服务器基址)>/<远端路径>
 *
 * 由 Vite dev server（Node）把请求转发到目标 WebDAV 服务器，从而绕开 CORS 与
 * 浏览器自定义 method/header 限制。目标地址由前端编码在 URL 里，无需改配置即可
 * 连接任意服务器，方便本地调试。
 */

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}

function davProxyPlugin(): Plugin {
  return {
    name: 'hermit-webdav-proxy',
    configureServer(server) {
      server.middlewares.use('/dav-proxy/', (req, res) => {
        void handle(req as http.IncomingMessage, res as http.ServerResponse)
      })
    },
  }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    // req.url 形如 /dav-proxy/<b64>/some/path
    const rawUrl = req.url ?? '/'
    const rest = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl // dav-proxy/<b64>...
    const slash = rest.indexOf('/')
    const encoded = slash === -1 ? rest : rest.slice(0, slash) // <b64>
    const tail = slash === -1 ? '' : rest.slice(slash) // /some/path
    const target = base64UrlDecode(encoded)
    if (!/^https?:\/\//i.test(target)) {
      res.statusCode = 400
      res.end('bad proxy target')
      return
    }

    // 目标基址 + 前端请求的相对路径（WebDAV 以 base 为根，tail 即 base 下的路径）
    const targetUrl = new URL(target)
    let finalPath = tail || '/'
    if (targetUrl.search) finalPath += targetUrl.search

    const isHttps = targetUrl.protocol === 'https:'
    const lib = isHttps ? https : http

    // 透传必要请求头，剔除由代理自行管理的字段
    const headers: Record<string, string | string[] | number | undefined> = {
      ...req.headers,
    }
    delete headers.host
    delete headers.connection
    delete headers['content-length']

    const proxyReq = lib.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        method: req.method,
        path: finalPath,
        headers,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode ?? 502
        res.statusMessage = proxyRes.statusMessage ?? ''
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (k === 'transfer-encoding' || k === 'connection') continue
          res.setHeader(k, v)
        }
        proxyRes.pipe(res)
      },
    )

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy(new Error('proxy timeout'))
    })
    proxyReq.on('error', (err: NodeJS.ErrnoException) => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        const code = err.code
        const msg = code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH'
          ? '无法连接服务器（请检查地址与网络）'
          : `代理错误：${err.message}`
        res.end(msg)
      } else {
        res.destroy()
      }
    })

    // 把客户端 body 转发过去
    req.pipe(proxyReq)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('代理错误：' + (e instanceof Error ? e.message : String(e)))
  }
}

export default defineConfig({
  plugins: [react(), davProxyPlugin()],
  server: {
    host: true,
    port: 5188,
  },
  build: {
    target: 'es2022',
  },
})
