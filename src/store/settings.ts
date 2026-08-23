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
  { id: 'system-serif', name: '默认衬线', stack: 'Georgia, "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif' },
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
  margin: 8,
  indent: true,
  justify: true,
  fontPreset: 'system-serif',
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
    const saved = await kvGet<ReaderSettings>('settings')
    set({ settings: { ...DEFAULT_SETTINGS, ...saved }, loaded: true })
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
