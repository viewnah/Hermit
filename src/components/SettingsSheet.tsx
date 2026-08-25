import { useEffect, useRef, useState } from 'react'
import { useSettings, THEMES, FONT_PRESETS, resolveTheme } from '../store/settings'
import { Sheet, SliderRow, Segmented, ToggleRow, toast, confirmDialog } from './ui'
import {
  deleteFont, deleteWallpaper, getFontAssets, getWallpaperAssets,
  importFontFile, importWallpaperFile, loadAssets,
} from '../lib/assetService'
import { SyncPanel } from './SyncPanel'
import type { Flow } from '../types'

const TAB_TITLES: Record<string, string> = {
  type: '排版',
  theme: '主题',
  page: '设置',
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
  const [sub, setSub] = useState<'font' | 'more' | null>(null)
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
    return FONT_PRESETS.find(p => p.id === settings.fontPreset)?.name ?? '默认字体'
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
                    <span className="sample" style={{ fontFamily: p.stack }}>千山鸟飞绝，万径人踪灭</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-group">
              <div className="setting-label">
                <span>自定义字体</span>
                <span className="value" style={{ fontSize: 12 }}>双击删除</span>
              </div>
              {fonts.map(f => (
                <div
                  key={f.id}
                  className="row-card"
                  style={{
                    outline: settings.fontPreset === `custom:${f.family}` ? '2px solid var(--accent)' : 'none',
                  }}
                >
                  <button className="grow" style={{ textAlign: 'left' }}
                    onClick={() => update({ fontPreset: `custom:${f.family}` })}
                    onDoubleClick={() => {
                      void confirmDialog(`删除字体「${f.name}」？`, { confirmLabel: '删除' }).then(ok => {
                        if (ok) {
                          void deleteFont(f.id!).then(() => {
                            if (settings.fontPreset === `custom:${f.family}`)
                              update({ fontPreset: 'default' })
                            void refreshAssets()
                          })
                        }
                      })
                    }}>
                    <div className="title">{f.name}</div>
                    <div className="sub">{settings.fontPreset === `custom:${f.family}` ? '使用中' : '点击应用'}</div>
                  </button>
                </div>
              ))}
              <button className="btn" style={{ width: '100%' }}
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

        {tab === 'theme' && (
          <>
            <div className="setting-group">
              <div className="setting-label"><span>阅读主题</span></div>
              <div className="swatch-row">
                {THEMES.filter(t => t.id !== 'custom').map(t => (
                  <button
                    key={t.id}
                    className={`swatch ${settings.themeId === t.id ? 'selected' : ''}`}
                    style={{ background: t.bg, color: t.fg }}
                    onClick={() => update({ themeId: t.id })}
                  >
                    <span className="name">{t.name}</span>
                    <span style={{ fontSize: 12 }}>文墨</span>
                  </button>
                ))}
                <button
                  className={`swatch ${settings.themeId === 'custom' ? 'selected' : ''}`}
                  style={{ background: settings.customBg, color: settings.customFg }}
                  onClick={() => update({ themeId: 'custom' })}
                >
                  <span className="name">自定义</span>
                  <span style={{ fontSize: 12 }}>文墨</span>
                </button>
              </div>
            </div>

            {settings.themeId === 'custom' && (
              <div className="setting-group">
                <div className="setting-label"><span>自定义颜色</span></div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label className="color-input">
                    <input type="color" value={settings.customBg}
                      onChange={e => update({ customBg: e.target.value })} />
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>背景</span>
                  </label>
                  <label className="color-input">
                    <input type="color" value={settings.customFg}
                      onChange={e => update({ customFg: e.target.value })} />
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>文字</span>
                  </label>
                </div>
              </div>
            )}

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
                    onDoubleClick={() => {
                      void confirmDialog(`删除壁纸「${w.name}」？`, { confirmLabel: '删除' }).then(ok => {
                        if (ok) {
                          void deleteWallpaper(w.id!).then(() => {
                            if (settings.wallpaperId === w.id) update({ wallpaperId: null })
                            void refreshAssets()
                          })
                        }
                      })
                    }}
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
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>双击壁纸可删除</span>
              </div>
            </div>

            {settings.wallpaperId != null && (
              <>
                <SliderRow label="遮罩浓度" value={settings.wallpaperDim} min={0} max={0.9} step={0.05}
                  onChange={v => update({ wallpaperDim: v })} format={v => `${Math.round(v * 100)}%`} />
                <SliderRow label="背景模糊" value={settings.wallpaperBlur} min={0} max={24} step={1}
                  onChange={v => update({ wallpaperBlur: v })} format={v => `${v} px`} />
                <div className="setting-label">
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                    壁纸模式下文字颜色沿用主题（{theme.name}）
                  </span>
                </div>
              </>
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
