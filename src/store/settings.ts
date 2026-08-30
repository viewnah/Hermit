import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { kvGet, kvSet } from '../db'
import type { ReaderSettings, ThemePreset, CustomTheme } from '../types'

export const THEMES: ThemePreset[] = [
  { id: 'paper', name: '素纸', fg: '#000000', bg: '#f5f5f5', dark: false },
  { id: 'sepia', name: '黄卷', fg: '#000000', bg: '#eee0c2', dark: false },
  { id: 'bamboo', name: '竹青', fg: '#000000', bg: '#d3e0c9', dark: false },
  { id: 'night', name: '玄夜', fg: '#c9c2b2', bg: '#232019', dark: true },
  { id: 'ink', name: '墨池', fg: '#a89f8d', bg: '#0e0d0b', dark: true },
]

export interface FontPreset {
  id: string
  name: string
  stack: string
}

export const FONT_PRESETS: FontPreset[] = [
  // 系统字体：使用当前平台系统默认字体（安卓 Roboto/思源黑体、iOS/macOS 苹方等）
  { id: 'system', name: '系统字体', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: 'song', name: '宋体', stack: '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif' },
  { id: 'hei', name: '黑体', stack: '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif' },
  { id: 'kai', name: '楷体', stack: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif' },
  { id: 'fangsong', name: '仿宋', stack: '"Fangsong SC", "STFangsong", "FangSong", "仿宋", serif' },
]

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.75,
  paraSpacing: 0.4,
  letterSpacing: 0.02,
  marginH: 8,
  marginV: 8,
  indent: true,
  justify: true,
  bold: false,
  fontPreset: 'system',
  themeId: 'paper',
  customThemes: [],
  wallpaperId: null,
  brightness: 0.6,
  followSystemBrightness: false,
  flow: 'paginated',
  animated: true,
  tapTurn: true,
  tapAnimated: true,
  tapLeftNext: false,
}

interface SettingsState {
  settings: ReaderSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<ReaderSettings>) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const saved = await kvGet<ReaderSettings & { margin?: number; customFg?: string; customBg?: string }>('settings')
    const merged = { ...DEFAULT_SETTINGS, ...saved }
    // 旧版本只有单一 margin 字段，迁移为水平/垂直页边距
    if (saved?.margin != null && saved.marginH == null) {
      merged.marginH = saved.margin
      merged.marginV = saved.margin
    }
    // 旧版本滑块浮点误差可能存入 3.99997 这类小数（页边距滑块 step=1），加载时归一
    merged.marginH = Math.round(merged.marginH)
    merged.marginV = Math.round(merged.marginV)
    // 旧版本"默认衬线"/"默认字体"（使用 EPUB 自带字体）已移除：统一迁移为"系统字体"
    if (merged.fontPreset === 'system-serif' || merged.fontPreset === 'default') merged.fontPreset = 'system'
    // 旧版本只有一组自定义颜色（customFg/customBg）：迁移为第一个自定义主题。
    // 仅当尚无任何自定义主题时迁移，避免旧字段残留导致重复添加
    if ((saved?.customFg != null || saved?.customBg != null) && !(merged.customThemes ?? []).length) {
      const legacy: CustomTheme = {
        id: `custom-${Date.now()}`,
        name: '自定义',
        fg: saved.customFg ?? '#332e26',
        bg: saved.customBg ?? '#f6f1e5',
      }
      merged.customThemes = [legacy]
      if (merged.themeId === 'custom') merged.themeId = legacy.id
    }
    // 清除旧字段，避免残留到下次保存
    delete (merged as Record<string, unknown>).customFg
    delete (merged as Record<string, unknown>).customBg
    // 壁纸遮罩浓度/背景模糊选项已移除（固定为 0），清除旧字段避免残留到下次保存
    delete (merged as Record<string, unknown>).wallpaperDim
    delete (merged as Record<string, unknown>).wallpaperBlur
    // 旧版本 themeId 指向已删除的自定义主题：回退到默认主题
    if (merged.themeId.startsWith('custom-')
      && !(merged.customThemes ?? []).some(t => t.id === merged.themeId)) {
      merged.themeId = 'paper'
    }
    set({ settings: merged, loaded: true })
  },
  update(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void kvSet('settings', { ...settings, savedAt: Date.now() })
  },
}))

export const resolveTheme = (s: ReaderSettings): ThemePreset => {
  // 自定义主题优先：themeId 指向 customThemes 中的某个主题
  const custom = (s.customThemes ?? []).find(t => t.id === s.themeId)
  if (custom)
    return { id: custom.id, name: custom.name, fg: custom.fg, bg: custom.bg, dark: isDarkColor(custom.bg) }
  return THEMES.find(t => t.id === s.themeId) ?? THEMES[0]
}

export const isDarkColor = (hex: string): boolean => {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return false
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

// ---- 跟随系统亮度 ----
// Web 无法直接读取系统屏幕亮度，以 prefers-color-scheme（系统深色/浅色模式）近似：
// 浅色模式（白天）→ 默认基准亮度（无滤镜，与手动默认 60% 效果一致）；
// 深色模式（夜间）→ 自动调暗（0.75x）
export const SYSTEM_BRIGHTNESS = { dark: 0.45, light: 0.6 }

/** 监听系统深色/浅色模式变化 */
export const useSystemDark = (): boolean => {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

/** 计算实际生效的亮度：跟随系统时返回系统亮度，否则返回手动设置值 */
export const effectiveBrightness = (s: ReaderSettings, systemDark: boolean): number =>
  s.followSystemBrightness ? (systemDark ? SYSTEM_BRIGHTNESS.dark : SYSTEM_BRIGHTNESS.light) : s.brightness

/** 亮度基准值：0.6 对应无滤镜（原先 100% 效果），实际滤镜值 = 亮度 / 基准 */
export const BRIGHTNESS_BASE = 0.6

// 亮度范围：线性映射，滑块/手势/浮层统一按数值显示（20-65，不带 %）
export const BRIGHTNESS_MIN = 0.2
export const BRIGHTNESS_MAX = 0.65
