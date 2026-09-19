// 真实触摸版跨章跟手验证：CDP Input.dispatchTouchEvent（可信事件）驱动
// vtprobe.html#real，浏览器会按真实规则把触摸重定向到顶层文档，
// 因此可以判定「换章后事件是否还能驱动快照擦洗」。
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.argv[2] || 'http://localhost:5188/vtprobe.html'
const MODE = process.argv[3] || 'commit'

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtreal-'))
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${userDataDir}`,
  '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--window-size=900,700', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
process.on('exit', () => { try { chrome.kill('SIGKILL') } catch {} })

const httpJson = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let b = ''; res.on('data', c => b += c)
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

;(async () => {
  const wsUrl = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no devtools')), 15000)
    chrome.stderr.on('data', d => {
      const m = /ws:\/\/[^\s]+/.exec(d.toString())
      if (m) { clearTimeout(t); resolve(m[0]) }
    })
  })
  const host = wsUrl.replace(/^ws:\/\//, '').split('/')[0]
  const targets = await httpJson(`http://${host}/json/list`)
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const pending = new Map()
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  const state = async () => JSON.parse(await evaluate('JSON.stringify(window.__state())'))
  const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  })

  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: `${URL}?mode=${MODE}&real=1` })
  // 等探针就绪（停在章节末页）
  for (let i = 0; i < 80; i++) {  // window.__geom set by probe once parked
    const ok = await evaluate('!!window.__geom').catch(() => false)
    if (ok) break
    await new Promise(r => setTimeout(r, 250))
  }
  const geom = await evaluate('JSON.stringify(window.__geom)')
  if (!geom) { console.error('probe not ready'); process.exit(1) }
  const { x0, y } = JSON.parse(geom)
  console.log(await evaluate('(document.getElementById("log")||{}).textContent'))
  console.log(`--- real ${MODE} drag: CDP trusted touch, start x=${x0} y=${y} ---`)

  const steps = MODE === 'commit' || MODE === 'inside' ? 18 : 8
  let x = x0
  await touch('touchStart', x, y)
  for (let i = 0; i < steps; i++) {
    x -= 34 * (MODE === 'cancel' && i >= steps - 2 ? -1 : 1)
    await touch('touchMove', x, y)
    await new Promise(r => setTimeout(r, 25))
    const s = await state()
    console.log(`  step${i}: x=${x} idx=${s.idx} page=${s.page} pos=${s.pos} ` +
      `topMoves=${s.topMoves} moveIns=${s.moveIns} anims=${JSON.stringify(s.anims)}`)
  }
  const mid = await state()
  console.log(`mid-drag: idx=${mid.idx} page=${mid.page} atEnd=${mid.atEnd}`)
  await touch('touchEnd', x, y)
  await new Promise(r => setTimeout(r, 2500))
  const after = await state()
  console.log(`RESULT ${MODE}: idx=${after.idx} page=${after.page} pages=${after.pages} ` +
    `atEnd=${after.atEnd} pos=${after.pos}`)
  // 分页器的 shadow root 是 closed 的，只能靠 CDP 穿透统计：
  // 寄存的旧视图元素若未清理，会多出 iframe（泄漏）
  await new Promise(r => setTimeout(r, 600))
  const doc = await send('DOM.getDocument', { depth: -1, pierce: true })
  let iframes = 0
  const walk = n => {
    if (n.nodeName === 'IFRAME') iframes++
    for (const c of n.children ?? []) walk(c)
    for (const s of n.shadowRoots ?? []) walk(s)
  }
  walk(doc.root)
  console.log(`dom: iframes in pierced tree = ${iframes}`)
  process.exit(0)
})().catch(e => { console.error('ERR', e); process.exit(1) })
