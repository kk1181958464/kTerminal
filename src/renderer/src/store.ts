import { create } from 'zustand'
import type { CustomFont, EditorInfo, LocalShell, Session, SessionInput, TransferTask } from '../../shared/types'
import { useSettings } from './settings'

export type TabStatus = 'auth' | 'connecting' | 'connected' | 'closed' | 'error'

export interface Tab {
  id: string
  /** 'local' tabs run a shell on this machine through a PTY and have no session. */
  kind: 'ssh' | 'local'
  sessionId: string
  shell?: LocalShell
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
  localShells: LocalShell[]
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
  filePanelWidth: number
  /** Share of the stacked file column taken by the local pane. */
  filePaneRatio: number
  toasts: Toast[]
  /** Asks the TerminalView owning `id` to reconnect or disconnect (sent from the tab bar). */
  tabRequest: { id: string; action: 'reconnect' | 'disconnect'; at: number } | null
  modal: ModalState | null
  menu: { x: number; y: number; items: (MenuItem | 'sep')[] } | null

  loadSessions(): Promise<void>
  saveSession(input: SessionInput): Promise<Session>
  deleteSession(id: string): Promise<void>
  openTab(session: Session): void
  openLocalTab(shell?: LocalShell): void
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
  setFilePanelWidth(width: number): void
  setFilePaneRatio(ratio: number): void
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
  localShells: [],
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
  filePanelWidth: Number(localStorage.getItem('filePanelWidth')) || 440,
  // 0 and 1 are valid (a collapsed pane), so don't fall back on falsy values.
  filePaneRatio: Number(localStorage.getItem('filePaneRatio') ?? 0.5),
  toasts: [],
  tabRequest: null,
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
      kind: 'ssh',
      sessionId: session.id,
      title: same ? `${session.name} (${same + 1})` : session.name,
      status: 'connecting',
      filesOpen: localStorage.getItem('filesOpen') !== '0'
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },
  openLocalTab(shell) {
    const shells = get().localShells
    const chosen = shell ?? shells.find((s) => s.id === useSettings.getState().defaultShell) ?? shells[0]
    if (!chosen) return toast('未检测到可用的本地 Shell', 'error')
    const same = get().tabs.filter((t) => t.kind === 'local' && t.shell?.id === chosen.id).length
    const tab: Tab = {
      id: crypto.randomUUID(),
      kind: 'local',
      sessionId: '',
      shell: chosen,
      title: same ? `${chosen.name} (${same + 1})` : chosen.name,
      status: 'connecting',
      filesOpen: false
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
    const prev = get().transfers.find((t) => t.id === task.id)
    if (prev?.status !== task.status) announceTransfer(task, get().transfers)
    set((s) => {
      const exists = s.transfers.some((t) => t.id === task.id)
      return {
        transfers: exists
          ? s.transfers.map((t) => (t.id === task.id ? task : t))
          : [...s.transfers, task],
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
  },
  setFilePanelWidth(width) {
    localStorage.setItem('filePanelWidth', String(width))
    set({ filePanelWidth: width })
  },
  setFilePaneRatio(ratio) {
    localStorage.setItem('filePaneRatio', String(ratio))
    set({ filePaneRatio: ratio })
  }
}))

let batchDone = 0
function announceTransfer(task: TransferTask, all: TransferTask[]): void {
  if (task.status === 'error') toast(`传输失败：${task.name}（${task.error}）`, 'error')
  if (task.status !== 'done') return
  batchDone++
  const stillActive = all.some(
    (t) => t.id !== task.id && (t.status === 'running' || t.status === 'queued')
  )
  if (stillActive) return
  toast(batchDone > 1 ? `${batchDone} 个传输已完成` : `传输完成：${task.name}`, 'success')
  batchDone = 0
}

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
