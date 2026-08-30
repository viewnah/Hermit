import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSettings, THEMES, FONT_PRESETS, resolveTheme, BRIGHTNESS_MIN, BRIGHTNESS_MAX } from '../store/settings'
import { Sheet, SliderRow, Segmented, ToggleRow, toast, confirmDialog } from './ui'
import {
  deleteFont, deleteWallpaper, getFontAssets, getWallpaperAssets,
  importFontFile, importWallpaperFile, loadAssets,
} from '../lib/assetService'
import { SyncPanel } from './SyncPanel'
import type { Flow, CustomTheme } from '../types'

const TAB_TITLES: Record<string, string> = {
  type: '排版',
  theme: '主题',
  page: '翻页',
  sync: '同步',
}

/* 排版图标（行间距 / 水平边距 / 垂直边距） */
const IconLineSpacing = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h20" />
    <path d="M2 20h20" />
    <path d="M12 6.5v11" />
    <path d="m9.5 9 2.5-2.5L14.5 9" />
    <path d="m9.5 15 2.5 2.5 2.5-2.5" />
  </svg>
)

const IconMarginH = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <path d="M3 5v14" />
    <path d="M21 5v14" />
    <path d="M7 12h10" />
  </svg>
)

const IconMarginV = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <path d="M5 3h14" />
    <path d="M5 21h14" />
    <path d="M12 7v10" />
  </svg>
)

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const IconBrightness = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" /><path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
  </svg>
)

/* ---- 内嵌取色器（替代系统全局取色器：Android 上 input[type=color] 会弹出
   系统颜色选择对话框，与应用风格割裂；改为应用内 HSV 面板 + 色相条 + 预设色板） ---- */
const hexToHsv = (hex: string): { h: number; s: number; v: number } => {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return { h: 0, s: 0, v: 1 }
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

const hsvToHex = (h: number, s: number, v: number): string => {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// 阅读主题常用色（背景/文字通用）
const PRESET_COLORS = [
  '#f6f1e5', '#ffffff', '#faf3dc', '#e8f0e4', '#e4edf2', '#f5e8e4',
  '#e8e6e3', '#d9d4cc', '#c9c4bc', '#b8b2a8', '#8a857c', '#5c574e',
  '#332e26', '#000000', '#4a4a4a', '#5b4636', '#2c3e50', '#2d4a3e',
  '#7a3b2e', '#1a1a1a', '#2b2b2b', '#1e2430', '#1f2a24', '#2a2118',
]

const ColorPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  // 拖动期间 pointermove 连续触发，React 状态异步更新会导致闭包过期；
  // 用 ref 保存最新值，且 onChange 副作用不放进 setState updater（保持纯函数）
  const hsvRef = useRef(hsv)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'sv' | 'hue' | null>(null)
  // hex 输入框文本：外部 value 变化（如切换主题）时同步
  const [hexText, setHexText] = useState(value)
  useEffect(() => { setHexText(value) }, [value])

  const updateHsv = (next: { h: number; s: number; v: number }) => {
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    onChange(hex)
    setHexText(hex)
  }

  const pickSv = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    updateHsv({ ...hsvRef.current, s, v })
  }
  const pickHue = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = hueRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const h = Math.max(0, Math.min(360, ((e.clientY - rect.top) / rect.height) * 360))
    updateHsv({ ...hsvRef.current, h })
  }
  const startDrag = (kind: 'sv' | 'hue') => (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = kind
    e.currentTarget.setPointerCapture(e.pointerId)
    if (kind === 'sv') pickSv(e)
    else pickHue(e)
  }
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === 'sv') pickSv(e)
    else if (dragRef.current === 'hue') pickHue(e)
  }
  const endDrag = () => { dragRef.current = null }

  // hex 输入：合法 #rrggbb 才应用，否则仅更新文本
  const onHexInput = (text: string) => {
    setHexText(text)
    const m = /^#?([\da-f]{6})$/i.exec(text.trim())
    if (!m) return
    const hex = `#${m[1].toLowerCase()}`
    const next = hexToHsv(hex)
    hsvRef.current = next
    setHsv(next)
    onChange(hex)
  }

  return (
    <div className="color-picker">
      <div className="cp-main">
        <div
          ref={svRef}
          className="sv-panel"
          style={{ background: `hsl(${hsv.h} 100% 50%)` }}
          onPointerDown={startDrag('sv')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="sv-white" />
          <div className="sv-black" />
          <div className="sv-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div
          ref={hueRef}
          className="hue-bar"
          onPointerDown={startDrag('hue')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="hue-thumb" style={{ top: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>
      <div className="preset-row">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            className={`preset-dot ${value.toLowerCase() === c ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => { updateHsv(hexToHsv(c)); onChange(c) }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="cp-footer">
        <div className="cp-preview" style={{ background: value }} />
        <input
          className="hex-input"
          value={hexText}
          spellCheck={false}
          onChange={e => onHexInput(e.target.value)}
        />
      </div>
    </div>
  )
}

export const SettingsSheet = ({
  open, onClose, onAssetsChanged, currentBookId, initialTab = 'type',
}: {
  open: boolean
  onClose: () => void
  onAssetsChanged: () => void
  currentBookId?: number
  initialTab?: string
}) => {
  const { settings, update } = useSettings()
  const [tab, setTab] = useState('type')
  const [sub, setSub] = useState<'font' | 'more' | 'custom-edit' | null>(null)
  // 自定义主题取色器当前编辑项：'bg' 背景 / 'fg' 文字 / null 收起
  const [editing, setEditing] = useState<'bg' | 'fg' | null>(null)
  // 自定义主题编辑页当前编辑的主题 id（长按色块进入时定位）
  const [editThemeId, setEditThemeId] = useState<string | null>(null)
  // 长按自定义主题色块直接进入该主题的编辑页（500ms），默认选中背景取色器，
  // 并自动切换当前主题到该主题（阅读页实时跟随编辑效果）；
  // pointerup/leave/cancel 取消（避免与点击切换主题冲突）
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startLongPress = (id: string) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      setEditThemeId(id)
      setEditing('bg')
      setSub('custom-edit')
      update({ themeId: id })
    }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  // 长按壁纸删除（500ms）：pointerdown 启动定时器，pointerup/leave/cancel 取消
  // （避免与点击切换壁纸冲突）
  const wallLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startWallLongPress = (id: number) => {
    if (wallLongPressTimer.current) clearTimeout(wallLongPressTimer.current)
    wallLongPressTimer.current = setTimeout(() => {
      wallLongPressTimer.current = null
      void confirmDialog('删除该壁纸？', { confirmLabel: '删除' }).then(ok => {
        if (!ok) return
        void deleteWallpaper(id).then(() => {
          if (settings.wallpaperId === id) update({ wallpaperId: null })
          void refreshAssets()
        })
      })
    }, 500)
  }
  const cancelWallLongPress = () => {
    if (wallLongPressTimer.current) {
      clearTimeout(wallLongPressTimer.current)
      wallLongPressTimer.current = null
    }
  }
  // 新建主题并直接进入编辑页（默认选中背景取色器，自动切换当前主题到新主题）
  const createTheme = () => {
    const t: CustomTheme = {
      id: `custom-${Date.now()}`,
      name: `自定义 ${settings.customThemes.length + 1}`,
      fg: '#332e26',
      bg: '#f6f1e5',
    }
    update({ customThemes: [...settings.customThemes, t], themeId: t.id })
    setEditThemeId(t.id)
    setEditing('bg')
    setSub('custom-edit')
  }
  // 主题编辑区（列表页与长按直达页共用）：名称 + 背景/文字色块 + 取色器 + 删除
  const renderThemeEditor = (cur: CustomTheme) => {
    const patch = (p: Partial<CustomTheme>) =>
      update({ customThemes: settings.customThemes.map(t => t.id === cur.id ? { ...t, ...p } : t) })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="theme-name-row">
          <span className="theme-name-label">主题名称</span>
          <input
            className="theme-name-input"
            type="text"
            value={cur.name}
            maxLength={12}
            placeholder="主题名称"
            onChange={e => patch({ name: e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            className={`color-chip ${editing === 'bg' ? 'selected' : ''}`}
            style={{ background: cur.bg, color: cur.fg }}
            onClick={() => setEditing(editing === 'bg' ? null : 'bg')}
          >
            背景
          </button>
          <button
            className={`color-chip ${editing === 'fg' ? 'selected' : ''}`}
            style={{ background: cur.fg, color: cur.bg }}
            onClick={() => setEditing(editing === 'fg' ? null : 'fg')}
          >
            文字
          </button>
          <button
            className="icon-btn"
            style={{ marginLeft: 'auto' }}
            aria-label="删除主题"
            onClick={() => {
              void confirmDialog(`删除主题「${cur.name}」？`, { confirmLabel: '删除' }).then(ok => {
                if (!ok) return
                const rest = settings.customThemes.filter(t => t.id !== cur.id)
                update({
                  customThemes: rest,
                  themeId: settings.themeId === cur.id ? 'paper' : settings.themeId,
                })
                setEditThemeId(null)
                setEditing(null)
                setSub(null)
              })
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
        {editing && (
          <ColorPicker
            value={editing === 'bg' ? cur.bg : cur.fg}
            onChange={v => patch(editing === 'bg' ? { bg: v } : { fg: v })}
          />
        )}
      </div>
    )
  }
  const [fonts, setFonts] = useState(getFontAssets())
  const [wallpapers, setWallpapers] = useState(getWallpaperAssets())
  const [wallUrls, setWallUrls] = useState<Map<number, string>>(new Map())
  const fontInputRef = useRef<HTMLInputElement>(null)
  const wallInputRef = useRef<HTMLInputElement>(null)

  const theme = resolveTheme(settings)

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setSub(null)
    setEditThemeId(null)
    setEditing(null)
    void loadAssets().then(() => {
      setFonts(getFontAssets())
      setWallpapers(getWallpaperAssets())
    })
  }, [open, initialTab])

  useEffect(() => {
    const map = new Map<number, string>()
    for (const w of wallpapers) map.set(w.id!, URL.createObjectURL(w.blob))
    setWallUrls(map)
    return () => { for (const url of map.values()) URL.revokeObjectURL(url) }
  }, [wallpapers])

  const refreshAssets = async () => {
    await loadAssets()
    setFonts(getFontAssets())
    setWallpapers(getWallpaperAssets())
    onAssetsChanged()
  }

  const handleFontUpload = async (files: FileList | null) => {
    if (!files?.length) return
    let n = 0
    for (const f of Array.from(files)) {
      try { await importFontFile(f); n++ } catch (e) { console.error(e) }
    }
    await refreshAssets()
    toast(n ? `已导入 ${n} 个字体` : '导入失败')
  }

  const handleWallUpload = async (files: FileList | null) => {
    if (!files?.length) return
    let n = 0
    for (const f of Array.from(files)) {
      try { await importWallpaperFile(f); n++ } catch (e) { console.error(e) }
    }
    await refreshAssets()
    toast(n ? `已导入 ${n} 张壁纸` : '导入失败')
  }

  const currentFontName = (() => {
    if (settings.fontPreset.startsWith('custom:')) {
      const family = settings.fontPreset.slice('custom:'.length)
      return fonts.find(f => f.family === family)?.name ?? '自定义字体'
    }
    return FONT_PRESETS.find(p => p.id === settings.fontPreset)?.name ?? '系统字体'
  })()

  return (
    <Sheet open={open} onClose={onClose} title={TAB_TITLES[tab] ?? '设置'}>
      <div className="sheet-body">
        {tab === 'type' && sub === null && (
          <>
            <SliderRow label="字号" value={settings.fontSize} min={12} max={32} step={1}
              onChange={v => update({ fontSize: v })} format={v => `${v}`}
              start="A" end={
                <button
                  className={`bold-toggle${settings.bold ? ' active' : ''}`}
                  onClick={() => update({ bold: !settings.bold })}
                  aria-label="加粗"
                  aria-pressed={settings.bold}
                >B</button>
              } />
            <SliderRow label="行间距" value={settings.lineHeight} min={1.2} max={2.6} step={0.05}
              onChange={v => update({ lineHeight: v })} format={v => v.toFixed(1)}
              start={<IconLineSpacing />} />
            <div className="slider-grid">
              <SliderRow compact label="水平页边距" value={settings.marginH} min={3} max={16} step={1}
                onChange={v => update({ marginH: v })} format={v => `${v}`}
                start={<IconMarginH />} />
              <SliderRow compact label="垂直页边距" value={settings.marginV} min={3} max={16} step={1}
                onChange={v => update({ marginV: v })} format={v => `${v}`}
                start={<IconMarginV />} />
            </div>
            <div className="setting-nav-row">
              <button className="setting-nav" onClick={() => setSub('font')}>
                <span className="nav-value">{currentFontName}</span>
                <ChevronRight />
              </button>
              <button className="setting-nav" onClick={() => setSub('more')}>
                <span className="nav-value">更多设置</span>
                <ChevronRight />
              </button>
            </div>
          </>
        )}

        {tab === 'type' && sub === 'font' && (
          <div className="sub-panel">
            <div className="sub-header">
              <button className="sub-back" onClick={() => setSub(null)} aria-label="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="sub-title">字体</span>
            </div>
            <div className="setting-group">
              <div className="setting-label"><span>阅读字体</span></div>
              <div className="font-grid">
                {FONT_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`font-card ${settings.fontPreset === p.id ? 'selected' : ''}`}
                    onClick={() => update({ fontPreset: p.id })}
                  >
                    <span className="name" style={{ fontFamily: p.stack }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-group">
              <div className="setting-label">
                <span>自定义字体</span>
                <span className="value" style={{ fontSize: 12 }}>双击删除</span>
              </div>
              <div className="font-grid" style={{ marginTop: 10 }}>
                {fonts.map(f => (
                <button
                  key={f.id}
                  className={`font-card ${settings.fontPreset === `custom:${f.family}` ? 'selected' : ''}`}
                  onClick={() => update({ fontPreset: `custom:${f.family}` })}
                  onDoubleClick={() => {
                    void confirmDialog(`删除字体「${f.name}」？`, { confirmLabel: '删除' }).then(ok => {
                      if (ok) {
                        void deleteFont(f.id!).then(() => {
                          if (settings.fontPreset === `custom:${f.family}`)
                            update({ fontPreset: 'system' })
                          void refreshAssets()
                        })
                      }
                    })
                  }}
                >
                  <span className="name" style={{ fontFamily: `"clip-font-${f.family}"` }}>{f.name}</span>
                </button>
              ))}
              </div>
              <button className="btn" style={{ width: '100%', marginTop: 10 }}
                onClick={() => fontInputRef.current?.click()}>
                ＋ 导入字体（ttf / otf / woff2）
              </button>
            </div>
          </div>
        )}

        {tab === 'type' && sub === 'more' && (
          <div className="sub-panel">
            <div className="sub-header">
              <button className="sub-back" onClick={() => setSub(null)} aria-label="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="sub-title">更多设置</span>
            </div>
            <SliderRow label="段距" value={settings.paraSpacing} min={0} max={2} step={0.1}
              onChange={v => update({ paraSpacing: v })} format={v => `${v.toFixed(1)} em`} />
            <SliderRow label="字距" value={settings.letterSpacing} min={-0.05} max={0.3} step={0.01}
              onChange={v => update({ letterSpacing: v })} format={v => `${v.toFixed(2)} em`} />
            <ToggleRow title="首行缩进" sub="中文段落首行缩进两字"
              on={settings.indent} onChange={v => update({ indent: v })} />
            <ToggleRow title="两端对齐" sub="段落左右对齐排版"
              on={settings.justify} onChange={v => update({ justify: v })} />
          </div>
        )}

        {tab === 'theme' && sub === 'custom-edit' && (
          <div className="sub-panel">
            <div className="sub-header">
              <button className="sub-back" onClick={() => setSub(null)} aria-label="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="sub-title">编辑主题</span>
            </div>
            {(() => {
              const cur = settings.customThemes.find(t => t.id === editThemeId)
              if (!cur) return null
              return (
                <div className="setting-group">
                  {renderThemeEditor(cur)}
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'theme' && sub === null && (
          <>
            {/* 跟随系统时滑块禁用（不可拖动），但保留显示当前亮度 */}
            <SliderRow label="亮度" value={settings.brightness} min={BRIGHTNESS_MIN} max={BRIGHTNESS_MAX} step={0.01}
              onChange={v => update({ brightness: v })}
              // 显示数值（20-65），不带 %，按 1 递增
              format={v => `${Math.round(v * 100)}`}
              start={<IconBrightness />} disabled={settings.followSystemBrightness} />
            <ToggleRow title="跟随系统" sub="亮度跟随系统亮度自动调节"
              on={settings.followSystemBrightness} onChange={v => update({ followSystemBrightness: v })} />

            <div className="setting-group">
              <div className="setting-label"><span>阅读主题</span></div>
              <div className="setting-label" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>内置主题</span>
              </div>
              <div className="swatch-row">
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`swatch ${settings.themeId === t.id ? 'selected' : ''}`}
                    style={{ background: t.bg, color: t.fg }}
                    onClick={() => update({ themeId: t.id })}
                  >
                    <span className="name">{t.name}</span>
                  </button>
                ))}
              </div>
              <div className="setting-label" style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>自定义主题（长按可编辑）</span>
              </div>
              <div className="swatch-row">
                {settings.customThemes.map(t => (
                  <button
                    key={t.id}
                    className={`swatch ${settings.themeId === t.id ? 'selected' : ''}`}
                    style={{ background: t.bg, color: t.fg }}
                    onClick={() => update({ themeId: t.id })}
                    // 长按进入该主题编辑页（500ms），点击仍为切换主题；
                    // preventDefault 阻止 WebView 长按文本选择抢占手势
                    onPointerDown={e => { e.preventDefault(); startLongPress(t.id) }}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                  >
                    <span className="name">{t.name}</span>
                  </button>
                ))}
                <button
                  className="swatch"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}
                  onClick={createTheme}
                >
                  <span style={{ fontSize: 26 }}>＋</span>
                </button>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-label"><span>壁纸</span></div>
              <div className="swatch-row">
                <button
                  className={`swatch ${settings.wallpaperId == null ? 'selected' : ''}`}
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}
                  onClick={() => update({ wallpaperId: null })}
                >
                  <span style={{ fontSize: 22 }}>无</span>
                </button>
                {wallpapers.map(w => (
                  <button
                    key={w.id}
                    className={`swatch ${settings.wallpaperId === w.id ? 'selected' : ''}`}
                    style={{
                      backgroundImage: `url(${wallUrls.get(w.id!)})`,
                      backgroundSize: 'cover',
                    }}
                    onClick={() => update({ wallpaperId: w.id! })}
                    // 长按删除壁纸（500ms），点击仍为切换壁纸；
                    // preventDefault 阻止 WebView 长按文本选择抢占手势
                    onPointerDown={e => { e.preventDefault(); startWallLongPress(w.id!) }}
                    onPointerUp={cancelWallLongPress}
                    onPointerLeave={cancelWallLongPress}
                    onPointerCancel={cancelWallLongPress}
                  />
                ))}
                <button
                  className="swatch"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}
                  onClick={() => wallInputRef.current?.click()}
                >
                  <span style={{ fontSize: 26 }}>＋</span>
                </button>
              </div>
              <div className="setting-label" style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>长按壁纸可删除</span>
              </div>
            </div>

            {settings.wallpaperId != null && (
              <div className="setting-label">
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  壁纸模式下文字颜色沿用主题（{theme.name}）
                </span>
              </div>
            )}
          </>
        )}

        {tab === 'page' && (
          <>
            <div className="setting-group">
              <div className="setting-label"><span>翻页方式</span></div>
              <Segmented
                options={[
                  { value: 'paginated' as Flow, label: '左右翻页' },
                  { value: 'scrolled' as Flow, label: '上下滚动' },
                ]}
                value={settings.flow}
                onChange={v => update({ flow: v })}
              />
            </div>
            <ToggleRow title="禁用点击动画" sub="开启后点击翻页立即切换，无过渡动画"
              on={!settings.tapAnimated} onChange={v => update({ tapAnimated: !v })} />
            <ToggleRow title="左侧点击翻下一页" sub="左右两侧点击均翻下一页，仅滑动翻上一页"
              on={settings.tapLeftNext} onChange={v => update({ tapLeftNext: v })} />
          </>
        )}

        {tab === 'sync' && <SyncPanel currentBookId={currentBookId} />}
      </div>

      <input
        ref={fontInputRef}
        className="hidden-file-input"
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf"
        multiple
        onChange={e => { void handleFontUpload(e.target.files); e.target.value = '' }}
      />
      <input
        ref={wallInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={e => { void handleWallUpload(e.target.files); e.target.value = '' }}
      />
    </Sheet>
  )
}
