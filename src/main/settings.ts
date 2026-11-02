import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  editorPath?: string
  closeToTray?: boolean
  trayHintShown?: boolean
}

const filePath = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (!existsSync(filePath())) return {}
  try {
    return JSON.parse(readFileSync(filePath(), 'utf8'))
  } catch {
    return {}
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  writeFileSync(filePath(), JSON.stringify(next, null, 2))
  return next
}
