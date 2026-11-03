import { BrowserWindow, dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { ConfigImportResult } from '../shared/types'
import { listSessions, saveSession } from './store'
import { getSettings, updateSettings } from './settings'

const FORMAT = 'kterminal-config'

interface ConfigFile {
  format: typeof FORMAT
  version: 1
  exportedAt: string
  /** Renderer preferences (theme, terminal, highlight…); validated by the renderer on import. */
  settings: Record<string, unknown>
  app: { editorPath?: string; closeToTray?: boolean }
  sessions: {
    name: string
    group: string
    host: string
    port: number
    username: string
    authType: 'password' | 'key'
    privateKeyPath?: string
  }[]
}

/**
 * Saved passwords are deliberately left out: they are encrypted with this machine's OS key
 * (DPAPI/Keychain) and could not be decrypted elsewhere anyway.
 */
export async function exportConfig(win: BrowserWindow, settings: Record<string, unknown>): Promise<string | null> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const result = await dialog.showSaveDialog(win, {
    title: '导出配置',
    defaultPath: `kterminal-config-${date}.json`,
    filters: [{ name: 'kTerminal 配置', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  const { editorPath, closeToTray } = getSettings()
  const config: ConfigFile = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    app: { editorPath, closeToTray },
    sessions: listSessions().map(({ name, group, host, port, username, authType, privateKeyPath }) => ({
      name,
      group,
      host,
      port,
      username,
      authType,
      privateKeyPath
    }))
  }
  writeFileSync(result.filePath, JSON.stringify(config, null, 2))
  return result.filePath
}

export async function importConfig(win: BrowserWindow): Promise<ConfigImportResult | null> {
  const result = await dialog.showOpenDialog(win, {
    title: '导入配置',
    filters: [{ name: 'kTerminal 配置', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null

  let config: ConfigFile
  try {
    config = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (config?.format !== FORMAT) throw new Error('这不是 kTerminal 导出的配置文件')

  // Merge sessions: an identical connection (name + host + port + user) is skipped, not duplicated.
  const key = (s: { name: string; host: string; port: number; username: string }): string =>
    `${s.name}\n${s.host}\n${s.port}\n${s.username}`
  const existing = new Set(listSessions().map(key))
  let added = 0
  let skipped = 0
  for (const s of Array.isArray(config.sessions) ? config.sessions : []) {
    if (typeof s?.host !== 'string' || typeof s.username !== 'string') continue
    const session = {
      name: String(s.name || s.host),
      group: String(s.group ?? ''),
      host: s.host,
      port: Number(s.port) || 22,
      username: s.username,
      authType: s.authType === 'key' ? ('key' as const) : ('password' as const),
      privateKeyPath: typeof s.privateKeyPath === 'string' ? s.privateKeyPath : undefined
    }
    if (existing.has(key(session))) {
      skipped++
      continue
    }
    saveSession(session)
    existing.add(key(session))
    added++
  }

  const app = config.app ?? {}
  updateSettings({
    ...(typeof app.closeToTray === 'boolean' ? { closeToTray: app.closeToTray } : {}),
    // An editor path from another machine only helps if that program exists here.
    ...(typeof app.editorPath === 'string' && existsSync(app.editorPath) ? { editorPath: app.editorPath } : {})
  })
  return { settings: config.settings && typeof config.settings === 'object' ? config.settings : {}, added, skipped }
}
