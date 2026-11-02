import { app, shell } from 'electron'
import { existsSync, promises as fsp } from 'fs'
import { join, posix } from 'path'
import { homedir } from 'os'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { FileEntry, LocalPlaces } from '../shared/types'
import { getSftp } from './ssh'

export function promisify<T = void>(
  fn: (cb: (err: Error | null | undefined, result?: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => fn((err, result) => (err ? reject(err) : resolve(result as T))))
}

function modeString(mode: number): string {
  const type = (mode & 0o170000) === 0o040000 ? 'd' : (mode & 0o170000) === 0o120000 ? 'l' : '-'
  let bits = ''
  for (let i = 8; i >= 0; i--) bits += mode & (1 << i) ? 'rwx'[(8 - i) % 3] : '-'
  return type + bits
}

// ---------- local ----------

export function localHome(): string {
  return homedir()
}

function listDrives(): string[] {
  if (process.platform !== 'win32') return ['/']
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .filter((l) => existsSync(`${l}:\\`))
    .map((l) => `${l}:\\`)
}

export async function localPlaces(): Promise<LocalPlaces> {
  const drives = await Promise.all(
    listDrives().map(async (path) => {
      const st = await fsp.statfs(path).catch(() => null)
      return {
        path,
        name: path === '/' ? '/' : path.slice(0, 2),
        free: st ? st.bavail * st.bsize : 0,
        total: st ? st.blocks * st.bsize : 0
      }
    })
  )
  const folders = (
    [
      ['桌面', 'desktop'],
      ['下载', 'downloads'],
      ['文档', 'documents'],
      ['主目录', 'home']
    ] as const
  ).map(([name, key]) => ({ name, path: app.getPath(key) }))
  return { drives, folders }
}

/** An empty path lists the drives ("此电脑"). */
export async function listLocal(dir: string): Promise<FileEntry[]> {
  if (!dir) {
    return listDrives().map((path) => ({
      name: path === '/' ? '/' : path.slice(0, 2),
      path,
      isDir: true,
      isLink: false,
      size: 0,
      mtime: 0
    }))
  }
  const dirents = await fsp.readdir(dir, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const path = join(dir, d.name)
      try {
        const st = await fsp.stat(path)
        return { name: d.name, path, isDir: st.isDirectory(), isLink: d.isSymbolicLink(), size: st.size, mtime: st.mtimeMs }
      } catch {
        return null // system files we cannot stat (pagefile.sys, etc.)
      }
    })
  )
  return entries.filter((e): e is FileEntry => !!e)
}

export async function mkdirLocal(dir: string, name: string): Promise<void> {
  await fsp.mkdir(join(dir, name))
}

export async function renameLocal(dir: string, from: string, to: string): Promise<void> {
  await fsp.rename(join(dir, from), join(dir, to))
}

export async function removeLocal(paths: string[]): Promise<void> {
  for (const p of paths) await shell.trashItem(p)
}

// ---------- remote ----------

export async function remoteHome(tabId: string): Promise<string> {
  const sftp = await getSftp(tabId)
  return promisify<string>((cb) => sftp.realpath('.', cb))
}

export async function listRemote(tabId: string, dir: string): Promise<FileEntry[]> {
  const sftp = await getSftp(tabId)
  const items = await promisify<FileEntryWithStats[]>((cb) => sftp.readdir(dir, cb))
  return Promise.all(
    items
      .filter((i) => i.filename !== '.' && i.filename !== '..')
      .map(async (i) => {
        const path = posix.join(dir, i.filename)
        const isLink = i.attrs.isSymbolicLink()
        let isDir = i.attrs.isDirectory()
        if (isLink) {
          try {
            isDir = (await promisify<Stats>((cb) => sftp.stat(path, cb))).isDirectory()
          } catch {
            // dangling link
          }
        }
        return {
          name: i.filename,
          path,
          isDir,
          isLink,
          size: i.attrs.size,
          mtime: i.attrs.mtime * 1000,
          permissions: modeString(i.attrs.mode)
        }
      })
  )
}

export async function mkdirRemote(tabId: string, dir: string, name: string): Promise<void> {
  const sftp = await getSftp(tabId)
  await promisify((cb) => sftp.mkdir(posix.join(dir, name), cb))
}

export async function renameRemote(tabId: string, dir: string, from: string, to: string): Promise<void> {
  const sftp = await getSftp(tabId)
  await promisify((cb) => sftp.rename(posix.join(dir, from), posix.join(dir, to), cb))
}

async function removeRemotePath(sftp: SFTPWrapper, path: string, isDir: boolean): Promise<void> {
  if (!isDir) return promisify((cb) => sftp.unlink(path, cb))
  const items = await promisify<FileEntryWithStats[]>((cb) => sftp.readdir(path, cb))
  for (const i of items) {
    if (i.filename === '.' || i.filename === '..') continue
    // Symlinks are unlinked, never followed.
    await removeRemotePath(sftp, posix.join(path, i.filename), i.attrs.isDirectory())
  }
  await promisify((cb) => sftp.rmdir(path, cb))
}

export async function removeRemote(tabId: string, entries: FileEntry[]): Promise<void> {
  const sftp = await getSftp(tabId)
  for (const e of entries) await removeRemotePath(sftp, e.path, e.isDir && !e.isLink)
}

export function describeFsError(err: unknown): string {
  const e = err as { code?: string | number; message?: string }
  switch (e.code) {
    case 2:
    case 'ENOENT':
      return '文件或目录不存在'
    case 3:
    case 'EACCES':
    case 'EPERM':
      return '权限不足'
    case 'EEXIST':
      return '同名文件已存在'
    case 'ENOTEMPTY':
      return '目录不为空'
    case 'EBUSY':
      return '文件被占用'
    default:
      return e.message || String(err)
  }
}
