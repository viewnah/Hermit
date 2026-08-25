import { resolveTheme, FONT_PRESETS } from '../store/settings'
import type { ReaderSettings } from '../types'

export interface LoadedFont {
  family: string
  url: string
}

const escapeUrl = (url: string) => url.replace(/\\/g, '/')

export const fontStackOf = (settings: ReaderSettings, fonts: LoadedFont[]): string => {
  if (settings.fontPreset.startsWith('custom:')) {
    const family = settings.fontPreset.slice('custom:'.length)
    // loadedFonts 中的 family 带 clip-font- 前缀（见 assetService.fontFamilyFor）
    const loaded = fonts.find(f => f.family === `clip-font-${family}`)
    if (loaded) return `"${loaded.family}", Georgia, "Songti SC", serif`
  }
  const preset = FONT_PRESETS.find(p => p.id === settings.fontPreset)
  // 空 stack = 默认字体：不覆盖 font-family，使用 EPUB 书籍自带字体
  return preset?.stack ?? ''
}

export const buildReaderCss = (
  settings: ReaderSettings,
  fonts: LoadedFont[],
): string => {
  const theme = resolveTheme(settings)
  const s = settings
  const fontStack = fontStackOf(s, fonts)
  const wallpaperMode = s.wallpaperId != null

  const fontFaces = fonts
    .map(f => `@font-face { font-family: "${f.family}"; src: url("${escapeUrl(f.url)}"); font-display: swap; }`)
    .join('\n')

  const bg = wallpaperMode ? 'transparent' : theme.bg
  const textSelectors = 'body, p, li, blockquote, dd, dt, figcaption, td, th, div, section, article, h1, h2, h3, h4, h5, h6'
  const paraSelectors = 'p, li, blockquote, dd, dt, figcaption, td, th'

  const lines: string[] = []
  lines.push(`@namespace epub "http://www.idpf.org/2007/ops";`)
  lines.push(fontFaces)
  // 默认字体（fontStack 为空）：不注入 font-family，保留 EPUB 书籍自带字体
  const fontRule = fontStack ? `  font-family: ${fontStack} !important;` : ''
  lines.push(`html {
  --theme-bg-color: ${wallpaperMode ? 'transparent' : theme.bg};
  color-scheme: ${theme.dark ? 'dark' : 'light'};
  background: ${bg} !important;
  color: ${theme.fg} !important;
${fontRule}
}`)
  lines.push(`body {
  font-size: ${s.fontSize}px !important;
${fontRule}
}`)
  if (fontStack) {
    lines.push(`${textSelectors} {
  font-family: ${fontStack} !important;
}`)
  }
  lines.push(`${paraSelectors} {
  font-size: ${s.fontSize}px !important;
  font-weight: ${s.bold ? 'bold' : 'normal'} !important;
  line-height: ${s.lineHeight} !important;
  letter-spacing: ${s.letterSpacing}em;
  text-align: ${s.justify ? 'justify' : 'start'};
  -webkit-hyphens: manual;
  hyphens: manual;
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}`)
  if (s.paraSpacing > 0) {
    lines.push(`p, li {
  margin: 0 0 ${s.paraSpacing}em 0 !important;
}`)
  }
  if (s.indent) {
    lines.push(`p {
  text-indent: 2em !important;
}`)
  }
  lines.push(`[align="left"] { text-align: left; }
[align="right"] { text-align: right; }
[align="center"] { text-align: center; }
[align="justify"] { text-align: justify; }`)
  lines.push(`pre { white-space: pre-wrap !important; }`)
  lines.push(`a:link, a:visited {
  color: ${theme.dark ? '#9db8d9' : '#3d5a80'} !important;
  text-decoration: none;
}`)
  lines.push(`::selection {
  background: rgba(179, 66, 58, 0.28);
}`)
  return lines.join('\n')
}
