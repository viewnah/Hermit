import { create } from 'zustand'
import { kvGet, kvSet } from '../db'
import type { ReaderSettings, ThemePreset } from '../types'

export const THEMES: ThemePreset[] = [
  { id: 'paper', name: '素纸', fg: '#332e26', bg: '#f6f1e5', dark: false },
  { id: 'sepia', name: '黄卷', fg: '#4c4130', bg: '#eee0c2', dark: false },
  { id: 'bamboo', name: '竹青', fg: '#2e3b30', bg: '#d3e0c9', dark: false },
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
