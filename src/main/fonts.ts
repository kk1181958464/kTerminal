import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import type { CustomFont } from '../shared/types'

const dir = (): string => join(app.getPath('userData'), 'fonts')
const indexPath = (): string => join(dir(), 'index.json')

function load(): CustomFont[] {
  if (!existsSync(indexPath())) return []
  try {
    return JSON.parse(readFileSync(indexPath(), 'utf8'))
  } catch {
    return []
  }
}

function persist(list: CustomFont[]): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(indexPath(), JSON.stringify(list, null, 2))
}

/** Reads the family name from an SFNT (TTF/OTF) `name` table; null for other formats. */
function parseFamilyName(buf: Buffer): string | null {
  if (buf.length < 12) return null
  const sig = buf.readUInt32BE(0)
  if (sig !== 0x00010000 && sig !== 0x4f54544f && sig !== 0x74727565) return null
  const numTables = buf.readUInt16BE(4)
  let nameOffset = -1
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (rec + 16 > buf.length) return null
    if (buf.toString('latin1', rec, rec + 4) === 'name') nameOffset = buf.readUInt32BE(rec + 8)
  }
  if (nameOffset < 0 || nameOffset + 6 > buf.length) return null
  const count = buf.readUInt16BE(nameOffset + 2)
  const strings = nameOffset + buf.readUInt16BE(nameOffset + 4)

  const candidates: { nameId: number; english: boolean; value: string }[] = []
  for (let i = 0; i < count; i++) {
    const r = nameOffset + 6 + i * 12
    if (r + 12 > buf.length) break
    const platform = buf.readUInt16BE(r)
    const lang = buf.readUInt16BE(r + 4)
    const nameId = buf.readUInt16BE(r + 6)
    const length = buf.readUInt16BE(r + 8)
    const offset = strings + buf.readUInt16BE(r + 10)
    if ((nameId !== 1 && nameId !== 16) || offset + length > buf.length) continue
    let value: string
    if (platform === 3 || platform === 0) {
      const raw = Buffer.from(buf.subarray(offset, offset + length))
      raw.swap16()
      value = raw.toString('utf16le')
    } else if (platform === 1) {
      value = buf.toString('latin1', offset, offset + length)
    } else continue
    if (value.trim()) candidates.push({ nameId, english: lang === 0x0409 || platform === 1, value: value.trim() })
  }
  // Prefer the typographic family (16) over the legacy one (1), and English names.
  candidates.sort((a, b) => b.nameId - a.nameId || Number(b.english) - Number(a.english))
  return candidates[0]?.value ?? null
}

export function listFonts(): CustomFont[] {
  return load().filter((f) => existsSync(join(dir(), f.file)))
}

export async function importFonts(win: BrowserWindow): Promise<CustomFont[]> {
  const result = await dialog.showOpenDialog(win, {
    title: '导入字体文件',
    filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled) return []
  mkdirSync(dir(), { recursive: true })
  const list = load()
  const added: CustomFont[] = []
  for (const src of result.filePaths) {
    const family = parseFamilyName(readFileSync(src)) ?? basename(src, extname(src))
    const existing = list.find((f) => f.family === family)
    if (existing) rmSync(join(dir(), existing.file), { force: true })
    const font: CustomFont = { id: existing?.id ?? randomUUID(), family, file: randomUUID() + extname(src).toLowerCase() }
    copyFileSync(src, join(dir(), font.file))
    if (existing) Object.assign(existing, font)
    else list.push(font)
    added.push(font)
  }
  persist(list)
  return added
}

export function readFont(id: string): Buffer {
  const font = load().find((f) => f.id === id)
  if (!font) throw new Error('字体不存在')
  return readFileSync(join(dir(), font.file))
}

export function removeFont(id: string): void {
  const list = load()
  const font = list.find((f) => f.id === id)
  if (font) rmSync(join(dir(), font.file), { force: true })
  persist(list.filter((f) => f.id !== id))
}
