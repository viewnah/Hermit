import { useEffect, useState } from 'react'
import { md5String } from '../lib/digest'
import { kosyncAuth, kosyncRegister, kosyncPull, kosyncPush, KosyncError } from '../lib/kosync'
import { WebDavError, davTest } from '../lib/webdav'
import { syncWebdav } from '../lib/syncService'
import { db } from '../db'
import { confirmDialog, toast } from './ui'
import { SectionCard } from './SectionCard'
import {
  addSyncSource, defaultKosyncConfig, defaultWebDavSyncConfig,
  isKosync, isWebDavSync, listSyncSources, removeSyncSource, setSyncReport,
  toggleSyncEnabled, updateSyncSource, deriveSyncName,
} from '../lib/syncSources'
import type { KosyncConfig, SyncSource, WebDavConfig } from '../types'

/* 图标 */
const IconCloud = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 1.78A4 4 0 0 0 5 19h12.5z" />
  </svg>
)
const IconBook = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M9 7h7M9 11h5" />
  </svg>
)
const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const formatTime = (ts?: number): string => {
  if (!ts) return '尚未同步'
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export const SyncPanel = ({ currentBookId }: { currentBookId?: number }) => {
  const [sources, setSources] = useState<SyncSource[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const refresh = async () => setSources(await listSyncSources())

  useEffect(() => { void refresh() }, [])

  const handleToggle = async (s: SyncSource) => {
    await toggleSyncEnabled(s.id)
    await refresh()
    toast(s.enabled ? '已停用' : '已启用')
  }

  const handleRemove = async (s: SyncSource) => {
    const ok = await confirmDialog(`移除「${s.name}」？`, {
      body: '已下载的书籍不会删除', confirmLabel: '移除',
    })
    if (!ok) return
    await removeSyncSource(s.id)
    if (expandedId === s.id) setExpandedId(null)
    await refresh()
    toast('已移除')
  }

  const handleAddWebdav = async () => {
    const cfg = defaultWebDavSyncConfig()
    const name = deriveSyncName('webdav', cfg)
    await addSyncSource({ kind: 'webdav', name, config: cfg, enabled: false })
    const list = await listSyncSources()
    const created = list[list.length - 1]
    setSources(list)
    setExpandedId(created.id)
  }

  const handleAddKosync = async () => {
    const cfg = defaultKosyncConfig()
    await addSyncSource({ kind: 'kosync', name: 'KOReader', config: cfg, enabled: false })
    const list = await listSyncSources()
    const created = list[list.length - 1]
    setSources(list)
    setExpandedId(created.id)
  }

  const renderEditor = (s: SyncSource) => {
    if (isWebDavSync(s)) {
      return <WebDavSyncEditor source={s} currentBookId={currentBookId}
        onSaved={refresh} onClose={() => setExpandedId(null)} onRemove={() => handleRemove(s)} />
    }
    if (isKosync(s)) {
      return <KosyncEditor source={s} currentBookId={currentBookId}
        onSaved={refresh} onClose={() => setExpandedId(null)} onRemove={() => handleRemove(s)} />
    }
    return null
  }

  const renderCard = (s: SyncSource) => {
    const icon = isWebDavSync(s) ? <IconCloud /> : <IconBook />
    const enabled = s.enabled
    const subtitle = !s.config.url
      ? <span><span className="dot off" />未配置</span>
      : enabled
        ? <span><span className="dot" />已连接 · 上次同步 {formatTime((s as { lastSyncAt?: number }).lastSyncAt)}</span>
        : <span><span className="dot off" />已停用</span>
    return (
      <SectionCard
        key={s.id}
        icon={icon}
        title={s.name}
        subtitle={subtitle}
        primaryAction={
          <span
            className={`toggle ${enabled ? 'on' : ''}`}
            onClick={e => { e.stopPropagation(); void handleToggle(s) }}
            role="switch"
            aria-checked={enabled}
          />
        }
        onPrimaryClick={() => void handleToggle(s)}
        expanded={expandedId === s.id}
        onExpand={() => setExpandedId(s.id)}
        onCollapse={() => setExpandedId(null)}
      >
        {renderEditor(s)}
      </SectionCard>
    )
  }

  return (
    <div className="section-group">
      <div className="section-group-head">
        <span className="section-group-title">同步管理</span>
        <button className="section-head-add" onClick={() => setAddOpen(v => !v)} aria-label="添加同步服务">＋ 添加同步服务</button>
      </div>

      {addOpen && (
        <div style={{ display: 'flex', gap: 10, marginTop: -4, marginBottom: 12 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => { setAddOpen(false); void handleAddWebdav() }}>
            ＋ WebDAV
          </button>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => { setAddOpen(false); void handleAddKosync() }}>
            ＋ KOReader
          </button>
        </div>
      )}

      <div>
        {sources.length === 0 ? (
          <div className="section-empty hint">
            <span className="label">还没有同步服务</span>
            <span className="hint">点击上方「添加同步服务」</span>
          </div>
        ) : sources.map(renderCard)}
      </div>
    </div>
  )
}

/* ---------------- WebDAV 同步编辑 ---------------- */

type WebDavSyncSource = SyncSource & { kind: 'webdav' }

const WebDavSyncEditor = ({
  source, onSaved, onClose, onRemove, currentBookId,
}: {
  source: WebDavSyncSource
  onSaved: () => Promise<void> | void
  onClose: () => void
  onRemove: () => void
  currentBookId?: number
}) => {
  const [cfg, setCfg] = useState<WebDavConfig>(source.config)
  const [busy, setBusy] = useState(false)

  const handleTest = async () => {
    setBusy(true)
    try {
      await davTest(cfg)
      toast('连接成功')
    } catch (e) {
      toast(e instanceof WebDavError ? e.message : '连接失败')
    } finally { setBusy(false) }
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: cfg, name: cfg.url ? deriveSyncName('webdav', cfg) : source.name })
      await onSaved()
      onClose()
      toast('已保存')
    } finally { setBusy(false) }
  }

  const handleSync = async () => {
    if (!cfg.url) { toast('请填写 WebDAV 地址'); return }
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: cfg })
      const report = await syncWebdav(cfg)
      const bits: string[] = []
      if (report.settingsPulled) bits.push('设置已更新')
      if (report.progressMerged) bits.push(`进度 ${report.progressMerged} 条`)
      if (report.booksUploaded) bits.push(`上传 ${report.booksUploaded} 本`)
      if (report.booksDownloaded) bits.push(`下载 ${report.booksDownloaded} 本`)
      if (report.fontsPulled) bits.push(`字体 ${report.fontsPulled}`)
      if (report.wallpapersPulled) bits.push(`壁纸 ${report.wallpapersPulled}`)
      const summary = bits.length ? bits.join('，') : '云端无变化'
      await setSyncReport(source.id, { lastSyncAt: Date.now(), lastSyncSummary: summary })
      await onSaved()
      toast('同步完成：' + summary)
    } catch (e) {
      toast(e instanceof WebDavError ? e.message : '同步失败')
    } finally { setBusy(false) }
  }

  return (
    <>
      <label className="field">
        <span className="field-label">服务器地址</span>
        <input type="url" placeholder="https://dav.example.com/dav"
          value={cfg.url} onChange={e => setCfg({ ...cfg, url: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span className="field-label">用户名</span>
        <input type="text" autoComplete="off"
          value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">密码</span>
        <input type="password" autoComplete="new-password"
          value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">同步目录</span>
        <input type="text" placeholder="/clip-reader"
          value={cfg.path} onChange={e => setCfg({ ...cfg, path: e.target.value.trim() || '/clip-reader' })} />
      </label>
      <label className="row-card" style={{ width: '100%', textAlign: 'left' }}
        onClick={() => setCfg({ ...cfg, syncBooks: !cfg.syncBooks })}>
        <div className="grow">
          <div className="title">同步书籍文件</div>
          <div className="sub">书籍随设置与进度一同上传下载</div>
        </div>
        <span className={`toggle ${cfg.syncBooks ? 'on' : ''}`} />
      </label>

      <div className="section-card-footer">
        <button className="btn" style={{ flex: 'none', padding: '8px 14px', color: 'var(--accent)' }}
          onClick={onRemove}>删除</button>
        <button className="btn" disabled={busy} onClick={handleTest}>测试连接</button>
        <button className="btn primary" disabled={busy} onClick={handleSync}>立即同步</button>
        <button className="btn primary" disabled={busy} onClick={handleSave}>保存</button>
      </div>
    </>
  )
}

/* ---------------- KOReader 编辑 ---------------- */

type KosyncSource = SyncSource & { kind: 'kosync' }

const KosyncEditor = ({
  source, currentBookId, onSaved, onClose, onRemove,
}: {
  source: KosyncSource
  currentBookId?: number
  onSaved: () => Promise<void> | void
  onClose: () => void
  onRemove: () => void
}) => {
  const [cfg, setCfg] = useState<KosyncConfig>(source.config)
  const [pwd, setPwd] = useState(source.config.userkey ? '________' : '')
  const [busy, setBusy] = useState(false)

  const applyPwd = (next: KosyncConfig): KosyncConfig => {
    const userkey = pwd && pwd !== '________' ? md5String(pwd) : next.userkey
    return { ...next, userkey }
  }

  const persist = (patch: Partial<KosyncConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    void updateSyncSource(source.id, { config: next })
  }

  const handleRegister = async () => {
    if (!cfg.username || !pwd || pwd === '________') { toast('请填写用户名和密码'); return }
    const final = applyPwd(cfg)
    setCfg(final)
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: final })
      await kosyncRegister(final)
      await onSaved()
      toast('注册成功')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '注册失败')
    } finally { setBusy(false) }
  }

  const handleAuth = async () => {
    if (!cfg.username || !pwd) { toast('请填写用户名和密码'); return }
    const final = applyPwd(cfg)
    setCfg(final)
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: final })
      await kosyncAuth(final)
      await onSaved()
      toast('验证成功')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '验证失败')
    } finally { setBusy(false) }
  }

  const handleSave = async () => {
    const final = applyPwd(cfg)
    setCfg(final)
    await updateSyncSource(source.id, { config: final })
    await onSaved()
    onClose()
    toast('已保存')
  }

  const handlePush = async () => {
    if (!currentBookId) { toast('请先打开一本书'); return }
    const book = await db.books.get(currentBookId)
    const progress = await db.progress.get(currentBookId)
    if (!book || !progress) { toast('暂无阅读进度'); return }
    const final = cfg.userkey ? cfg : applyPwd(cfg)
    setCfg(final)
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: final })
      await kosyncPush(final, book.digest, progress.cfi, progress.percentage)
      toast('已推送进度到 KOReader')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '推送失败')
    } finally { setBusy(false) }
  }

  const handlePull = async () => {
    if (!currentBookId) { toast('请先打开一本书'); return }
    const book = await db.books.get(currentBookId)
    if (!book) return
    const final = cfg.userkey ? cfg : applyPwd(cfg)
    setCfg(final)
    setBusy(true)
    try {
      await updateSyncSource(source.id, { config: final })
      const remote = await kosyncPull(final, book.digest)
      if (!remote) { toast('云端暂无此书进度'); return }
      await db.progress.put({
        bookId: currentBookId,
        cfi: remote.progress.startsWith('epubcfi(') ? remote.progress : '',
        fraction: remote.percentage,
        percentage: remote.percentage,
        sectionIndex: 0,
        updatedAt: remote.timestamp * 1000,
      })
      toast('已拉取进度，重新打开本书生效')
    } catch (e) {
      toast(e instanceof KosyncError ? e.message : '拉取失败')
    } finally { setBusy(false) }
  }

  return (
    <>
      <label className="field">
        <span className="field-label">服务器</span>
        <input type="url" placeholder="https://sync.koreader.rocks"
          value={cfg.url} onChange={e => persist({ url: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span className="field-label">用户名</span>
        <input type="text" autoComplete="off"
          value={cfg.username} onChange={e => persist({ username: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span className="field-label">密码</span>
        <input type="password" autoComplete="new-password" placeholder="用于注册 / 登录"
          value={pwd} onChange={e => setPwd(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">设备名称（其他设备可见）</span>
        <input type="text" value={cfg.device} onChange={e => persist({ device: e.target.value })} />
      </label>
      <label className="row-card" style={{ width: '100%', textAlign: 'left' }}
        onClick={() => persist({ autoSync: !cfg.autoSync })}>
        <div className="grow">
          <div className="title">自动同步</div>
          <div className="sub">阅读时自动推送进度，打开时自动拉取</div>
        </div>
        <span className={`toggle ${cfg.autoSync ? 'on' : ''}`} />
      </label>

      <div className="section-card-footer">
        <button className="btn" style={{ flex: 'none', padding: '8px 14px', color: 'var(--accent)' }}
          onClick={onRemove}>删除</button>
        {currentBookId != null && (
          <>
            <button className="btn" disabled={busy} onClick={handlePush}>推送</button>
            <button className="btn" disabled={busy} onClick={handlePull}>拉取</button>
          </>
        )}
        <button className="btn" disabled={busy} onClick={handleRegister}>注册</button>
        <button className="btn" disabled={busy} onClick={handleAuth}>验证</button>
        <button className="btn primary" disabled={busy} onClick={handleSave}>保存</button>
      </div>
    </>
  )
}