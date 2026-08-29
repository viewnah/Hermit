import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { kvGet, kvSet } from '../db'
import type { ReaderSettings, ThemePreset } from '../types'

export const THEMES: ThemePreset[] = [
  { id: 'paper', name: '素纸', fg: '#000000', bg: '#f5f5f5', dark: false },
  { id: 'sepia', name: '黄卷', fg: '#000000', bg: '#eee0c2', dark: false },
  { id: 'bamboo', name: '竹青', fg: '#000000', bg: '#d3e0c9', dark: false },
  { id: 'night', name: '玄夜', fg: '#c9c2b2', bg: '#232019', dark: true },
  { id: 'ink', name: '墨池', fg: '#a89f8d', bg: '#0e0d0b', dark: true },
  { id: 'custom', name: '自定义', fg: '#332e26', bg: '#f6f1e5', dark: false },
]

export interface FontPreset {
  id: string
  name: string
  stack: string
}

export const FONT_PRESETS: FontPreset[] = [
  // 默认字体：不覆盖 font-family，使用 EPUB 书籍自带字体
  { id: 'default', name: '默认字体', stack: '' },
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
  fontPreset: 'default',
  themeId: 'paper',
  customFg: '#332e26',
  customBg: '#f6f1e5',
  wallpaperId: null,
  wallpaperDim: 0.35,
  wallpaperBlur: 0,
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
    const saved = await kvGet<ReaderSettings & { margin?: number }>('settings')
    const merged = { ...DEFAULT_SETTINGS, ...saved }
    // 旧版本只有单一 margin 字段，迁移为水平/垂直页边距
    if (saved?.margin != null && saved.marginH == null) {
      merged.marginH = saved.margin
      merged.marginV = saved.margin
    }
    // 旧版本"默认衬线"更名为"默认字体"（使用 EPUB 自带字体）
    if (merged.fontPreset === 'system-serif') merged.fontPreset = 'default'
    set({ settings: merged, loaded: true })
  },
  update(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void kvSet('settings', { ...settings, savedAt: Date.now() })
  },
}))

export const resolveTheme = (s: ReaderSettings): ThemePreset => {
  if (s.themeId === 'custom')
    return { id: 'custom', name: '自定义', fg: s.customFg, bg: s.customBg, dark: isDarkColor(s.customBg) }
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
