import { create } from 'zustand'
import type { CustomFont, EditorInfo, Session, SessionInput, TransferTask } from '../../shared/types'

export type TabStatus = 'auth' | 'connecting' | 'connected' | 'closed' | 'error'

export interface Tab {
  id: string
  sessionId: string
  title: string
  status: TabStatus
  error?: string
  filesOpen: boolean
  cols?: number
  rows?: number
}

export interface MenuItem {
  label: string
  icon?: React.ComponentType<{ size?: number }>
  onClick: () => void
  hint?: string
  danger?: boolean
  disabled?: boolean
  active?: boolean
}

export type ModalState =
  | { kind: 'confirm'; title: string; message?: string; okText?: string; danger?: boolean; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; title: string; defaultValue?: string; placeholder?: string; okText?: string; resolve: (value: string | null) => void }

export interface Toast {
  id: number
  text: string
  kind: 'error' | 'success' | 'info'
}

interface State {
  sessions: Session[]
  tabs: Tab[]
  activeTabId: string | null
  dialog: { session?: Session } | null
  transfers: TransferTask[]
  transfersOpen: boolean
  lastDone: TransferTask | null
  /** Bumped when a remote dir changed outside a transfer (e.g. an editor save). */
  remoteChanged: { tabId: string; dir: string; at: number } | null
  editor: EditorInfo | null
  customFonts: CustomFont[]
  /** Bumped whenever custom fonts finish loading so terminals re-measure glyphs. */
  fontsVersion: number
  filePanelHeight: number
  toasts: Toast[]
  modal: ModalState | null
  menu: { x: number; y: number; items: (MenuItem | 'sep')[] } | null

  loadSessions(): Promise<void>
  saveSession(input: SessionInput): Promise<Session>
  deleteSession(id: string): Promise<void>
  openTab(session: Session): void
  closeTab(id: string): void
  setActiveTab(id: string): void
  reorderTabs(tabs: Tab[]): void
  updateTab(id: string, patch: Partial<Tab>): void
  openDialog(session?: Session): void
  closeDialog(): void
  upsertTransfer(task: TransferTask): void
  clearTransfers(): Promise<void>
  setTransfersOpen(open: boolean): void
  setFilePanelHeight(height: number): void
}

export function toSessionInput(s: Session): SessionInput {
  return {
    id: s.id,
    name: s.name,
    group: s.group,
    host: s.host,
    port: s.port,
    username: s.username,
    authType: s.authType,
    privateKeyPath: s.privateKeyPath
  }
}

export const useStore = create<State>((set, get) => ({
  sessions: [],
  tabs: [],
  activeTabId: null,
  dialog: null,
  transfers: [],
  transfersOpen: false,
  lastDone: null,
  remoteChanged: null,
  editor: null,
  customFonts: [],
  fontsVersion: 0,
  filePanelHeight: Number(localStorage.getItem('filePanelHeight')) || 320,
  toasts: [],
  modal: null,
  menu: null,

  async loadSessions() {
    set({ sessions: await window.api.sessions.list() })
  },
  async saveSession(input) {
    const saved = await window.api.sessions.save(input)
    await get().loadSessions()
    return saved
  },
  async deleteSession(id) {
    await window.api.sessions.remove(id)
    await get().loadSessions()
  },

  openTab(session) {
    const same = get().tabs.filter((t) => t.sessionId === session.id).length
    const tab: Tab = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      title: same ? `${session.name} (${same + 1})` : session.name,
      status: 'connecting',
      filesOpen: localStorage.getItem('filesOpen') !== '0'
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },
  closeTab(id) {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId =
        s.activeTabId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    })
  },
  setActiveTab(id) {
    set({ activeTabId: id })
  },
  reorderTabs(tabs) {
    set({ tabs })
  },
  updateTab(id, patch) {
    if (patch.filesOpen !== undefined) localStorage.setItem('filesOpen', patch.filesOpen ? '1' : '0')
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  },

  openDialog(session) {
    set({ dialog: { session } })
  },
  closeDialog() {
    set({ dialog: null })
  },

  upsertTransfer(task) {
    set((s) => {
      const exists = s.transfers.some((t) => t.id === task.id)
      return {
        transfers: exists
          ? s.transfers.map((t) => (t.id === task.id ? task : t))
          : [...s.transfers, task],
        transfersOpen: exists ? s.transfersOpen : true,
        lastDone: task.status === 'done' ? task : s.lastDone
      }
    })
  },
  async clearTransfers() {
    await window.api.transfer.clear()
    set((s) => ({
      transfers: s.transfers.filter((t) => t.status === 'queued' || t.status === 'running')
    }))
  },
  setTransfersOpen(open) {
    set({ transfersOpen: open })
  },
  setFilePanelHeight(height) {
    localStorage.setItem('filePanelHeight', String(height))
    set({ filePanelHeight: height })
  }
}))

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId
  useStore.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
  setTimeout(() => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
}

/** Strips Electron's "Error invoking remote method 'x': Error: " prefix. */
export function errorMessage(err: unknown): string {
  return String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

type Opts<K extends ModalState['kind']> = Omit<Extract<ModalState, { kind: K }>, 'kind' | 'resolve'>

export function confirmDialog(opts: Opts<'confirm'>): Promise<boolean> {
  return new Promise((resolve) => useStore.setState({ modal: { kind: 'confirm', ...opts, resolve } }))
}

export function promptDialog(opts: Opts<'prompt'>): Promise<string | null> {
  return new Promise((resolve) => useStore.setState({ modal: { kind: 'prompt', ...opts, resolve } }))
}

export function openMenu(e: React.MouseEvent, items: (MenuItem | 'sep')[]): void {
  e.preventDefault()
  e.stopPropagation()
  useStore.setState({ menu: { x: e.clientX, y: e.clientY, items } })
}

/** Opens a menu anchored below an element (for dropdown buttons). */
export function openMenuAt(el: HTMLElement, items: (MenuItem | 'sep')[]): void {
  const rect = el.getBoundingClientRect()
  useStore.setState({ menu: { x: rect.left, y: rect.bottom + 4, items } })
}
