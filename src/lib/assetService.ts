import { db } from '../db'
import type { FontAsset, WallpaperAsset } from '../types'
import type { LoadedFont } from './themeCss'

const loadedFonts = new Map<number, { family: string; url: string; asset: FontAsset }>()
const wallpaperUrls = new Map<number, string>()
let fontsSnapshot: FontAsset[] = []

export const getLoadedFonts = (): LoadedFont[] =>
  Array.from(loadedFonts.values()).map(f => ({ family: f.family, url: f.url }))

export const getFontAssets = (): FontAsset[] => fontsSnapshot

export const getWallpaperUrl = (id: number | null): string | null =>
  id == null ? null : wallpaperUrls.get(id) ?? null

export const getWallpaperAssets = (): WallpaperAsset[] => wallpaperAssetsSnapshot

let wallpaperAssetsSnapshot: WallpaperAsset[] = []

const fontFamilyFor = (asset: FontAsset): string =>
  'clip-font-' + asset.family

export const loadAssets = async () => {
  const fonts = await db.fonts.toArray()
  const seen = new Set(fonts.map(f => f.id))
  for (const [id, entry] of loadedFonts)
    if (!seen.has(id)) {
      URL.revokeObjectURL(entry.url)
      loadedFonts.delete(id)
    }
  for (const asset of fonts) {
    if (loadedFonts.has(asset.id!)) continue
    const url = URL.createObjectURL(asset.blob)
    loadedFonts.set(asset.id!, { family: fontFamilyFor(asset), url, asset })
  }
  fontsSnapshot = fonts

  const wallpapers = await db.wallpapers.toArray()
  const seenW = new Set(wallpapers.map(w => w.id))
  for (const [id, url] of wallpaperUrls)
    if (!seenW.has(id)) {
      URL.revokeObjectURL(url)
      wallpaperUrls.delete(id)
    }
  for (const asset of wallpapers)
    if (!wallpaperUrls.has(asset.id!))
      wallpaperUrls.set(asset.id!, URL.createObjectURL(asset.blob))
  wallpaperAssetsSnapshot = wallpapers
}

// Android SAF File 持久化后不可重读，复制字节为自有 Blob
const toStoredBlob = async (file: File): Promise<Blob> =>
  new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' })

export const importFontFile = async (file: File): Promise<FontAsset> => {
  const familySeed = file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 24) || 'font'
  const asset: FontAsset = {
    name: familySeed,
    family: familySeed.toLowerCase() + '-' + Math.random().toString(36).slice(2, 6),
    blob: await toStoredBlob(file),
    addedAt: Date.now(),
  }
  asset.id = await db.fonts.add(asset)
  await loadAssets()
  return asset
}

export const deleteFont = async (id: number) => {
  await db.fonts.delete(id)
  await loadAssets()
}

export const importWallpaperFile = async (file: File): Promise<WallpaperAsset> => {
  const asset: WallpaperAsset = {
    name: file.name.replace(/\.(png|jpe?g|webp|gif)$/i, ''),
    blob: await toStoredBlob(file),
    addedAt: Date.now(),
  }
  asset.id = await db.wallpapers.add(asset)
  await loadAssets()
  return asset
}

export const deleteWallpaper = async (id: number) => {
  await db.wallpapers.delete(id)
  await loadAssets()
}
