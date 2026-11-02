import type { WebContents } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, statSync, unwatchFile, watchFile } from 'fs'
import { tmpdir } from 'os'
import { basename, delimiter, dirname, join, posix } from 'path'
import { randomUUID } from 'crypto'
import type { EditorInfo } from '../shared/types'
import { getSftp } from './ssh'
import { describeFsError, promisify } from './files'
import { getSettings } from './settings'

interface EditSession {
  tabId: string
  remotePath: string
  localPath: string
  mtime: number
  wc: WebContents
  uploading: boolean
  pending: boolean
  timer?: NodeJS.Timeout
}

const ROOT = join(tmpdir(), 'xssh-edit')
const sessions = new Map<string, EditSession>()

const editorNames: Record<string, string> = {
  code: 'VS Code',
  cursor: 'Cursor',
  'notepad++': 'Notepad++',
  notepad: '记事本',
  sublime_text: 'Sublime Text',
  zed: 'Zed'
}

function editorName(path: string): string {
  const base = basename(path).replace(/\.exe$/i, '')
  return editorNames[base.toLowerCase()] ?? base
}

function detectEditor(): string {
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    join(local, 'Programs', 'cursor', 'Cursor.exe'),
    'C:\\Program Files\\Notepad++\\notepad++.exe',
    'C:\\Program Files (x86)\\Notepad++\\notepad++.exe'
  ]
  // Custom install locations are usually on PATH: <install>\bin\code.cmd -> <install>\Code.exe
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (existsSync(join(dir, 'code.cmd'))) candidates.push(join(dirname(dir), 'Code.exe'))
    candidates.push(join(dir, 'notepad++.exe'))
  }
  return candidates.find((p) => existsSync(p)) ?? 'notepad.exe'
}

export function resolveEditor(): EditorInfo {
  const configured = getSettings().editorPath
  const path = configured && existsSync(configured) ? configured : detectEditor()
  return { path, name: editorName(path), custom: path === configured }
}

function send(s: EditSession, ok: boolean, error?: string): void {
  if (!s.wc.isDestroyed())
    s.wc.send('edit:synced', { tabId: s.tabId, remotePath: s.remotePath, ok, error })
}

async function sync(s: EditSession): Promise<void> {
  if (s.uploading) {
    s.pending = true
    return
  }
  s.uploading = true
  try {
    const sftp = await getSftp(s.tabId)
    await promisify((cb) => sftp.fastPut(s.localPath, s.remotePath, cb))
    send(s, true)
  } catch (err) {
    send(s, false, describeFsError(err))
  } finally {
    s.uploading = false
    if (s.pending) {
      s.pending = false
      sync(s)
    }
  }
}

/** Downloads a remote file to a temp dir, opens it in the editor and uploads it back on every save. */
export async function openRemoteFile(wc: WebContents, tabId: string, remotePath: string): Promise<string> {
  const key = `${tabId}\n${remotePath}`
  let s = sessions.get(key)
  if (!s || !existsSync(s.localPath)) {
    // A unique dir per file keeps the original filename, so editors pick the right syntax mode.
    const dir = join(ROOT, randomUUID().slice(0, 8))
    mkdirSync(dir, { recursive: true })
    const localPath = join(dir, posix.basename(remotePath))
    const sftp = await getSftp(tabId)
    await promisify((cb) => sftp.fastGet(remotePath, localPath, cb))
    const session: EditSession = {
      tabId,
      remotePath,
      localPath,
      mtime: statSync(localPath).mtimeMs,
      wc,
      uploading: false,
      pending: false
    }
    // Polling (not fs.watch) survives editors that save via rename/replace.
    watchFile(localPath, { interval: 700 }, (cur) => {
      if (!cur.mtimeMs || cur.mtimeMs === session.mtime) return
      session.mtime = cur.mtimeMs
      clearTimeout(session.timer)
      session.timer = setTimeout(() => sync(session), 400)
    })
    sessions.set(key, (s = session))
  }

  const editor = resolveEditor()
  const child = spawn(editor.path, [s.localPath], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', resolve)
  })
  child.unref()
  return editor.name
}

export function releaseTab(tabId: string): void {
  for (const [key, s] of sessions) {
    if (s.tabId !== tabId) continue
    unwatchFile(s.localPath)
    clearTimeout(s.timer)
    rmSync(dirname(s.localPath), { recursive: true, force: true })
    sessions.delete(key)
  }
}

export function releaseAll(): void {
  for (const s of sessions.values()) {
    unwatchFile(s.localPath)
    clearTimeout(s.timer)
  }
  sessions.clear()
  rmSync(ROOT, { recursive: true, force: true })
}
