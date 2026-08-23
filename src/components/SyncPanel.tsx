import { useEffect, useState } from 'react'
import { db } from '../db'
import { md5String } from '../lib/digest'
import {
  defaultKosyncConfig, defaultWebdavConfig, getKosyncConfig, getWebdavConfig,
  pushKosyncProgress, pullKosyncProgress, saveKosyncConfig, saveWebdavConfig,
  syncWebdav,
} from '../lib/syncService'
import { kosyncAuth, kosyncRegister, KosyncError } from '../lib/kosync'
import { WebDavError } from '../lib/webdav'
import { ToggleRow, toast } from './ui'
import type { KosyncConfig, WebDavConfig } from '../types'

export const SyncPanel = ({ currentBookId }: { currentBookId?: number }) => {
  const [dav, setDav] = useState<WebDavConfig>(defaultWebdavConfig())
  const [kos, setKos] = useState<KosyncConfig>(defaultKosyncConfig())
  const [kosPass, setKosPass] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void getWebdavConfig().then(c => c && setDav(c))
    void getKosyncConfig().then(c => {
      if (c) { setKos(c); setKosPass(c.userkey ? '________' : '') }
    })
  }, [])

  const saveDav = () => {
    void saveWebdavConfig(dav)
    toast('已保存 WebDAV 配置')
  }

  const runSync = async () => {
    if (!dav.url) { toast('请先填写 WebDAV 地址'); return }
    setBusy('webdav')
    try {
      await saveWebdavConfig(dav)
      const report = await syncWebdav(dav, msg => toast(msg))
      const bits: string[] = []
      if (report.settingsPulled) bits.push('设置已更新')
      if (report.progressMerged) bits.push(`进度合并 ${report.progressMerged} 条`)
      if (report.booksUploaded) bits.push(`上传 ${report.booksUploaded} 本`)
      if (report.booksDownloaded) bits.push(`下载 ${report.booksDownloaded} 本`)
      if (report.fontsPulled) bits.push(`字体 ${report.fontsPulled} 个`)
      if (report.wallpapersPulled) bits.push(`壁纸 ${report.wallpapersPulled} 张`)
      toast(bits.length ? '同步完成：' + bits.join('，') : '同步完成，云端无变化')
    } catch (e) {
      toast(e instanceof WebDavError ? e.message : '同步失败，请检查网络与配置')
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  const saveKos = (patch: Partial<KosyncConfig>) => {
    const next = { ...kos, ...patch }
    setKos(next)
    void saveKosyncConfig(next)
  }

  const applyKosPassword = (): KosyncConfig => {
    const userkey = kosPass && kosPass !== '________' ? md5String(kosPass) : kos.userkey
    const next = { ...kos, userkey }
    setKos(next)
    void saveKosyncConfig(next)
    return next
  }

  const registerKos = async () => {
    if (!kos.username || !kosPass || kosPass === '________') { toast('请填写用户名和密码'); return }
    const config = applyKosPassword()
    setBusy('kos')
    try {
      await kosyncRegister(config)
      toast('注册成功')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '注册失败')
    } finally { setBusy(null) }
  }

  const loginKos = async () => {
    if (!kos.username || !kosPass) { toast('请填写用户名和密码'); return }
    const config = applyKosPassword()
    setBusy('kos')
    try {
      await kosyncAuth(config)
      toast('验证成功')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '验证失败')
    } finally { setBusy(null) }
  }

  const pushCurrent = async () => {
    if (!currentBookId) { toast('请先打开一本书'); return }
    const book = await db.books.get(currentBookId)
    const progress = await db.progress.get(currentBookId)
    if (!book || !progress) { toast('暂无阅读进度'); return }
    const config = kos.userkey ? kos : applyKosPassword()
    setBusy('kos')
    try {
      await pushKosyncProgress(book, progress)
      toast('已推送进度到 KOReader')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '推送失败')
    } finally { setBusy(null) }
  }

  const pullCurrent = async () => {
    if (!currentBookId) { toast('请先打开一本书'); return }
    const book = await db.books.get(currentBookId)
    if (!book) return
    const config = kos.userkey ? kos : applyKosPassword()
    setBusy('kos')
    try {
      const remote = await pullKosyncProgress(book)
      if (!remote) { toast('云端暂无此书进度'); return }
      await db.progress.put({
        bookId: currentBookId,
        cfi: remote.progress.startsWith('epubcfi(') ? remote.progress : '',
        fraction: remote.percentage,
        percentage: remote.percentage,
        sectionIndex: 0,
        updatedAt: remote.timestamp,
      })
      toast('已拉取进度，重新打开本书生效')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '拉取失败')
    } finally { setBusy(null) }
  }

  return (
    <>
      <div className="setting-group">
        <div className="setting-label"><span>WebDAV 同步</span></div>
        <label className="field">
          <span className="field-label">服务器地址</span>
          <input type="url" placeholder="https://dav.example.com/dav"
            value={dav.url} onChange={e => setDav({ ...dav, url: e.target.value.trim() })} />
        </label>
        <label className="field">
          <span className="field-label">用户名</span>
          <input type="text" autoComplete="off"
            value={dav.username} onChange={e => setDav({ ...dav, username: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input type="password" autoComplete="new-password"
            value={dav.password} onChange={e => setDav({ ...dav, password: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">同步目录</span>
          <input type="text" placeholder="/clip-reader"
            value={dav.path} onChange={e => setDav({ ...dav, path: e.target.value.trim() || '/clip-reader' })} />
        </label>
        <ToggleRow title="同步书籍文件" sub="书籍随设置与进度一同上传下载"
          on={dav.syncBooks} onChange={v => setDav({ ...dav, syncBooks: v })} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={saveDav}>保存配置</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy === 'webdav'}
            onClick={() => void runSync()}>
            {busy === 'webdav' ? '同步中…' : '立即同步'}
          </button>
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-label"><span>KOReader 进度同步</span></div>
        <label className="field">
          <span className="field-label">服务器</span>
          <input type="url" placeholder="https://sync.koreader.rocks"
            value={kos.url} onChange={e => saveKos({ url: e.target.value.trim() })} />
        </label>
        <label className="field">
          <span className="field-label">用户名</span>
          <input type="text" autoComplete="off"
            value={kos.username} onChange={e => saveKos({ username: e.target.value.trim() })} />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input type="password" autoComplete="new-password" placeholder="用于注册 / 登录"
            value={kosPass} onChange={e => setKosPass(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">设备名称（其他设备可见）</span>
          <input type="text" value={kos.device} onChange={e => saveKos({ device: e.target.value })} />
        </label>
        <ToggleRow title="自动同步" sub="阅读时自动推送进度，打开时自动拉取"
          on={kos.autoSync} onChange={v => saveKos({ autoSync: v })} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy === 'kos'}
            onClick={() => void registerKos()}>注册</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy === 'kos'}
            onClick={() => void loginKos()}>登录验证</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy === 'kos'}
            onClick={() => void pushCurrent()}>推送本书进度</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy === 'kos'}
            onClick={() => void pullCurrent()}>拉取本书进度</button>
        </div>
      </div>
    </>
  )
}
