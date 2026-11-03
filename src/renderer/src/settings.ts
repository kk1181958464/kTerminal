import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomScheme } from './theme'
import type { PredictMode } from './predict'

export type CursorStyle = 'block' | 'bar' | 'underline'
export type FilePanelPosition = 'right' | 'bottom'
export type HighlightRuleKey =
  | 'url'
  | 'ip'
  | 'error'
  | 'warning'
  | 'success'
  | 'datetime'
  | 'number'
  | 'path'
  | 'string'
  | 'command'

export interface HighlightSettings {
  enabled: boolean
  /** `color` is an ANSI palette index (0–15) so highlights follow the active theme. */
  rules: Record<HighlightRuleKey, { on: boolean; color: number }>
}

export const defaultHighlight: HighlightSettings = {
  enabled: true,
  rules: {
    command: { on: true, color: 11 },
    url: { on: true, color: 12 },
    ip: { on: true, color: 13 },
    error: { on: true, color: 9 },
    warning: { on: true, color: 11 },
    success: { on: true, color: 10 },
    datetime: { on: true, color: 14 },
    number: { on: true, color: 3 },
    path: { on: true, color: 6 },
    string: { on: true, color: 2 }
  }
}

export interface Settings {
  /** A built-in ThemeId, 'system', or `custom:<schemeId>`. */
  theme: string
  customSchemes: CustomScheme[]
  accent: string | null
  /** Overrides the terminal's default text color for every theme; null keeps the theme's. */
  termForeground: string | null
  animations: boolean
  sidebarCollapsed: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  rightClickPaste: boolean
  showHiddenFiles: boolean
  filePanelPosition: FilePanelPosition
  highlight: HighlightSettings
  /** Local shell opened by default; null picks the first detected one. */
  defaultShell: string | null
  /** Working directory for new local terminals; null means the home directory. */
  localCwd: string | null
  autoUpdate: boolean
  predictiveEcho: PredictMode
}

export const defaultSettings: Settings = {
  theme: 'graphite',
  customSchemes: [],
  accent: null,
  termForeground: null,
  animations: true,
  sidebarCollapsed: false,
  fontFamily: 'Cascadia Mono',
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  rightClickPaste: true,
  showHiddenFiles: false,
  filePanelPosition: 'right',
  highlight: defaultHighlight,
  defaultShell: null,
  localCwd: null,
  autoUpdate: true,
  predictiveEcho: 'auto'
}

interface SettingsState extends Settings {
  settingsOpen: boolean
  set(patch: Partial<Settings>): void
  reset(): void
  setSettingsOpen(open: boolean): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      settingsOpen: false,
      set: (patch) => set(patch),
      // Custom color schemes are user content, not preferences; keep them on reset.
      reset: () => set((s) => ({ ...defaultSettings, customSchemes: s.customSchemes })),
      setSettingsOpen: (open) => set({ settingsOpen: open })
    }),
    {
      name: 'xssh-settings',
      partialize: ({ settingsOpen: _open, set: _set, reset: _reset, setSettingsOpen: _s, ...rest }) => rest
    }
  )
)

/** The persisted preferences, without UI state or actions. */
export function exportableSettings(): Record<string, unknown> {
  const state = useSettings.getState()
  return Object.fromEntries(Object.keys(defaultSettings).map((k) => [k, state[k as keyof Settings]]))
}

/** Applies imported preferences, keeping only known keys whose type matches the default. */
export function applyImportedSettings(raw: Record<string, unknown>): number {
  const patch: Partial<Settings> = {}
  for (const [key, def] of Object.entries(defaultSettings)) {
    const value = raw[key]
    if (value === undefined) continue
    const sameType = def === null ? value === null || typeof value === 'string' : typeof value === typeof def
    const sameShape = Array.isArray(def) === Array.isArray(value)
    if (sameType && sameShape) (patch as Record<string, unknown>)[key] = value
  }
  useSettings.getState().set(patch)
  return Object.keys(patch).length
}

/** Installed Nerd Fonts supply prompt icons/powerline glyphs (oh-my-posh, starship) the main font lacks. */
const NERD_FALLBACKS = [
  'Symbols Nerd Font Mono',
  'FiraCode Nerd Font Mono',
  'CaskaydiaCove Nerd Font Mono',
  'CaskaydiaMono Nerd Font Mono',
  'JetBrainsMono Nerd Font Mono',
  'MesloLGS NF',
  'MesloLGM Nerd Font Mono',
  'Hack Nerd Font Mono'
]
  .map((f) => `"${f}"`)
  .join(', ')

export function terminalFontFamily(family: string): string {
  return `"${family}", "Cascadia Mono", Consolas, ${NERD_FALLBACKS}, "Microsoft YaHei Mono", monospace`
}
