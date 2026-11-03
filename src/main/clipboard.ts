import { clipboard } from 'electron'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, posix } from 'path'
import { isLocal } from './pty'
import { getSftp } from './ssh'
import { promisify } from './files'

const LOCAL_DIR = join(tmpdir(), 'kterminal-paste')

export function clipboardHasImageOnly(): boolean {
  const formats = clipboard.availableFormats()
  return formats.some((f) => f.startsWith('image/')) && !formats.includes('text/plain')
}

async function stageBytes(tabId: string, name: string, data: Buffer): Promise<string> {
  if (isLocal(tabId)) {
    mkdirSync(LOCAL_DIR, { recursive: true })
    const path = join(LOCAL_DIR, name)
    writeFileSync(path, data)
    return path
  }
  // SSH tabs: the program reading the path runs on the server, so the file must live there.
  const sftp = await getSftp(tabId)
  const remote = posix.join('/tmp', name)
  await promisify((cb) => sftp.writeFile(remote, data, cb))
  return remote
}

/** Saves the clipboard image as PNG where the tab's shell can read it; returns that path. */
export async function stageClipboardImage(tabId: string): Promise<string | null> {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null
  return stageBytes(tabId, `kterminal-clip-${Date.now()}.png`, image.toPNG())
}

/** Local tabs use the dropped files as-is; SSH tabs get them uploaded to /tmp first. */
export async function stageDroppedFiles(tabId: string, paths: string[]): Promise<string[]> {
  if (isLocal(tabId)) return paths
  const out: string[] = []
  for (const p of paths) out.push(await stageBytes(tabId, `kterminal-${Date.now()}-${basename(p)}`, readFileSync(p)))
  return out
}

export function cleanupPasteDir(): void {
  rmSync(LOCAL_DIR, { recursive: true, force: true })
}
