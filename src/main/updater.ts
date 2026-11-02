import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const RELEASES_URL = 'https://github.com/kk1181958464/kTerminal/releases/latest'

// Self-install needs the NSIS build on Windows or an AppImage on Linux. macOS refuses to update an
// app without a Developer ID signature, and .deb installs have no updater: those only get notified.
const canInstall = app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE))

let status: UpdateStatus = { state: 'idle', canInstall }

function broadcast(next: Omit<UpdateStatus, 'canInstall'>): void {
  status = { ...next, canInstall }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', status)
}

function describe(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err)
  if (/net::|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up/i.test(msg)) return '无法连接到更新服务器'
  if (/404/.test(msg)) return '没有找到可用的发布版本'
  return msg.split('\n')[0].slice(0, 160)
}

export function initUpdater(): void {
  autoUpdater.autoDownload = canInstall
  autoUpdater.autoInstallOnAppQuit = canInstall
  // In development, check against the real releases (dev-app-update.yml) but never download.
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'latest' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ state: canInstall ? 'downloading' : 'available', version: info.version, percent: 0 })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', version: status.version, percent: p.percent })
  )
  autoUpdater.on('update-downloaded', (info) => broadcast({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => broadcast({ state: 'error', version: status.version, error: describe(err) }))
}

export async function checkForUpdates(): Promise<void> {
  if (status.state === 'checking' || status.state === 'downloading') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    broadcast({ state: 'error', error: describe(err) })
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}

export function openReleasePage(): void {
  shell.openExternal(RELEASES_URL)
}
