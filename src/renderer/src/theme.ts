import type { ITheme } from '@xterm/xterm'
import { useSettings } from './settings'

export type ThemeId = 'graphite' | 'tokyo' | 'mocha' | 'nord' | 'github-light' | 'solarized-light'

interface ThemeDef {
  name: string
  dark: boolean
  ui: {
    app: string
    term: string
    panel: string
    card: string
    line: string
    fg: string
    dim: string
    accent: string
    accentFg: string
    ok: string
    err: string
    warn: string
    folder: string
  }
  ansi: [string, string, string, string, string, string, string, string]
  bright: [string, string, string, string, string, string, string, string]
  termFg: string
}

export const themes: Record<ThemeId, ThemeDef> = {
  graphite: {
    name: '石墨',
    dark: true,
    ui: {
      app: '#0d0e12', term: '#15161c', panel: '#1b1c23', card: '#1d1f27', line: '#262832',
      fg: '#e6e7eb', dim: '#8a8d99', accent: '#5b8def', accentFg: '#ffffff',
      ok: '#3ecf8e', err: '#f2555a', warn: '#f5b544', folder: '#f0c05a'
    },
    termFg: '#d4d6dd',
    ansi: ['#2a2c35', '#f2555a', '#3ecf8e', '#f5c451', '#5b8def', '#b480f5', '#3cc7d6', '#c9ccd6'],
    bright: ['#5c606d', '#ff7a7e', '#6ee0a8', '#ffd77a', '#85aaf6', '#c9a1fa', '#6fdbe6', '#ffffff']
  },
  tokyo: {
    name: 'Tokyo Night',
    dark: true,
    ui: {
      app: '#13131a', term: '#1a1b26', panel: '#1f2030', card: '#222436', line: '#2a2c3f',
      fg: '#c0caf5', dim: '#7a82ad', accent: '#7aa2f7', accentFg: '#16161e',
      ok: '#9ece6a', err: '#f7768e', warn: '#e0af68', folder: '#e0af68'
    },
    termFg: '#c0caf5',
    ansi: ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
    bright: ['#414868', '#ff8ea1', '#b4e083', '#f0c38a', '#93b5ff', '#cdb2ff', '#a4dcff', '#c0caf5']
  },
  mocha: {
    name: 'Catppuccin',
    dark: true,
    ui: {
      app: '#11111b', term: '#1e1e2e', panel: '#24243a', card: '#242438', line: '#313244',
      fg: '#cdd6f4', dim: '#9399b2', accent: '#cba6f7', accentFg: '#1e1e2e',
      ok: '#a6e3a1', err: '#f38ba8', warn: '#f9e2af', folder: '#f9e2af'
    },
    termFg: '#cdd6f4',
    ansi: ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'],
    bright: ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']
  },
  nord: {
    name: 'Nord',
    dark: true,
    ui: {
      app: '#242933', term: '#2e3440', panel: '#343b49', card: '#3b4252', line: '#3f4757',
      fg: '#eceff4', dim: '#9ba5b7', accent: '#88c0d0', accentFg: '#2e3440',
      ok: '#a3be8c', err: '#bf616a', warn: '#ebcb8b', folder: '#ebcb8b'
    },
    termFg: '#d8dee9',
    ansi: ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
    bright: ['#4c566a', '#d08770', '#b5cfa0', '#f0d8a8', '#94b4d4', '#c5a3c0', '#8fbcbb', '#eceff4']
  },
  'github-light': {
    name: 'GitHub 浅色',
    dark: false,
    ui: {
      app: '#eff2f5', term: '#ffffff', panel: '#f6f8fa', card: '#ffffff', line: '#d8dee4',
      fg: '#1f2328', dim: '#656d76', accent: '#0969da', accentFg: '#ffffff',
      ok: '#1a7f37', err: '#cf222e', warn: '#9a6700', folder: '#d4a72c'
    },
    termFg: '#1f2328',
    ansi: ['#24292f', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781'],
    bright: ['#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f']
  },
  'solarized-light': {
    name: 'Solarized 浅色',
    dark: false,
    ui: {
      app: '#eee8d5', term: '#fdf6e3', panel: '#f5efdc', card: '#fdf6e3', line: '#e0d9c3',
      fg: '#45585f', dim: '#8a9a9b', accent: '#268bd2', accentFg: '#ffffff',
      ok: '#859900', err: '#dc322f', warn: '#b58900', folder: '#b58900'
    },
    termFg: '#586e75',
    ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#93a1a1'],
    bright: ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']
  }
}

export const accentPresets = ['#5b8def', '#8b5cf6', '#14b8a6', '#22c55e', '#f97316', '#ec4899', '#eab308']

/** Terminal colors; `ansi` holds the 8 normal followed by the 8 bright colors. */
export interface TermColors {
  background: string
  foreground: string
  cursor: string
  selection: string
  ansi: string[]
}

export interface CustomScheme {
  id: string
  name: string
  /** Built-in theme supplying the window chrome colors. */
  base: ThemeId
  colors: TermColors
}

export function findScheme(theme: string): CustomScheme | undefined {
  if (!theme.startsWith('custom:')) return undefined
  return useSettings.getState().customSchemes.find((s) => `custom:${s.id}` === theme)
}

export function resolveThemeId(theme: string): ThemeId {
  if (theme === 'system')
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'github-light' : 'graphite'
  if (theme.startsWith('custom:')) return findScheme(theme)?.base ?? 'graphite'
  return theme in themes ? (theme as ThemeId) : 'graphite'
}

export function themeLabel(theme: string): string {
  if (theme === 'system') return '跟随系统'
  return findScheme(theme)?.name ?? themes[resolveThemeId(theme)].name
}

export function termColors(theme: string, accent: string | null): TermColors {
  const scheme = findScheme(theme)
  if (scheme) return scheme.colors
  const t = themes[resolveThemeId(theme)]
  const cursor = accent ?? t.ui.accent
  return {
    background: t.ui.term,
    foreground: t.termFg,
    cursor,
    selection: cursor,
    ansi: [...t.ansi, ...t.bright]
  }
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return hex.length === 7 ? hex + a : hex
}

export function terminalTheme(theme: string, accent: string | null): ITheme {
  const c = termColors(theme, accent)
  const dark = themes[resolveThemeId(theme)].dark
  const [black, red, green, yellow, blue, magenta, cyan, white] = c.ansi
  const [bBlack, bRed, bGreen, bYellow, bBlue, bMagenta, bCyan, bWhite] = c.ansi.slice(8)
  return {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor,
    cursorAccent: c.background,
    selectionBackground: withAlpha(c.selection, dark ? 0.32 : 0.25),
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack: bBlack, brightRed: bRed, brightGreen: bGreen, brightYellow: bYellow,
    brightBlue: bBlue, brightMagenta: bMagenta, brightCyan: bCyan, brightWhite: bWhite
  }
}

// ---------- Windows Terminal scheme JSON interop ----------

const wtKeys = [
  'black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightPurple', 'brightCyan', 'brightWhite'
]

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7)
  return null
}

export function toWindowsTerminal(name: string, c: TermColors): string {
  const json: Record<string, string> = {
    name,
    background: c.background,
    foreground: c.foreground,
    cursorColor: c.cursor,
    selectionBackground: c.selection
  }
  wtKeys.forEach((k, i) => (json[k] = c.ansi[i]))
  return JSON.stringify(json, null, 2)
}

export function fromWindowsTerminal(text: string): { name?: string; colors: TermColors } | null {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = normalizeHex(json[k])
      if (v) return v
    }
    return null
  }
  const ansi = wtKeys.map((k) => pick(k, k.replace('urple', 'agenta')))
  const background = pick('background')
  const foreground = pick('foreground')
  if (!background || !foreground || ansi.some((c) => !c)) return null
  return {
    name: typeof json.name === 'string' ? json.name : undefined,
    colors: {
      background,
      foreground,
      cursor: pick('cursorColor', 'cursor') ?? foreground,
      selection: pick('selectionBackground', 'selection') ?? foreground,
      ansi: ansi as string[]
    }
  }
}

export function applyTheme(id: ThemeId, accent: string | null, animate: boolean): void {
  const t = themes[id]
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    setTimeout(() => root.classList.remove('theme-transition'), 350)
  }
  const vars: Record<string, string> = {
    app: t.ui.app, term: t.ui.term, panel: t.ui.panel, card: t.ui.card, line: t.ui.line,
    fg: t.ui.fg, dim: t.ui.dim, ok: t.ui.ok, err: t.ui.err, warn: t.ui.warn, folder: t.ui.folder,
    accent: accent ?? t.ui.accent,
    'accent-fg': accent ? '#ffffff' : t.ui.accentFg
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--c-${k}`, v)
  root.style.colorScheme = t.dark ? 'dark' : 'light'
  root.dataset.dark = String(t.dark)
  window.api.window.setTheme(t.ui.app, t.ui.dim)
}
