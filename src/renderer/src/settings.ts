import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomScheme } from './theme'

export type CursorStyle = 'block' | 'bar' | 'underline'

export interface Settings {
  /** A built-in ThemeId, 'system', or `custom:<schemeId>`. */
  theme: string
  customSchemes: CustomScheme[]
  accent: string | null
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
}

export const defaultSettings: Settings = {
  theme: 'graphite',
  customSchemes: [],
  accent: null,
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
  showHiddenFiles: false
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

export function terminalFontFamily(family: string): string {
  return `"${family}", "Cascadia Mono", Consolas, "Microsoft YaHei Mono", monospace`
}
