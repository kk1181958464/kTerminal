import type { CustomFont } from '../../shared/types'
import { toast, useStore } from './store'

const faces = new Map<string, FontFace>()

async function register(font: CustomFont): Promise<boolean> {
  const old = faces.get(font.id)
  if (old) document.fonts.delete(old)
  try {
    const data = (await window.api.fonts.read(font.id)) as Uint8Array<ArrayBuffer>
    const face = new FontFace(font.family, data)
    await face.load()
    document.fonts.add(face)
    faces.set(font.id, face)
    return true
  } catch {
    faces.delete(font.id)
    return false
  }
}

function isMonospace(family: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.font = `20px "${family}"`
  return Math.abs(ctx.measureText('iiii').width - ctx.measureText('MMMM').width) < 1
}

function publish(list: CustomFont[]): void {
  useStore.setState((s) => ({ customFonts: list, fontsVersion: s.fontsVersion + 1 }))
}

export async function loadCustomFonts(): Promise<void> {
  const list = await window.api.fonts.list()
  const loaded: CustomFont[] = []
  for (const font of list) if (await register(font)) loaded.push(font)
  publish(loaded)
}

/** Opens the picker, loads the chosen fonts and drops any file the browser can't parse. */
export async function importCustomFonts(): Promise<CustomFont[]> {
  const added = await window.api.fonts.import()
  const good: CustomFont[] = []
  for (const font of added) {
    if (await register(font)) {
      good.push(font)
      if (!isMonospace(font.family))
        toast(`${font.family} 不是等宽字体，终端中字符间距会不均匀`, 'info')
    } else {
      toast(`无法识别字体文件：${font.family}`, 'error')
      await window.api.fonts.remove(font.id)
    }
  }
  const current = useStore.getState().customFonts.filter((f) => !good.some((g) => g.id === f.id))
  publish([...current, ...good])
  return good
}

export async function removeCustomFont(id: string): Promise<void> {
  const face = faces.get(id)
  if (face) document.fonts.delete(face)
  faces.delete(id)
  await window.api.fonts.remove(id)
  publish(useStore.getState().customFonts.filter((f) => f.id !== id))
}
