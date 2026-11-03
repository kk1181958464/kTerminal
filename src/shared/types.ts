export type AuthType = 'password' | 'key'

export interface Session {
  id: string
  name: string
  group: string
  host: string
  port: number
  username: string
  authType: AuthType
  privateKeyPath?: string
  hasSecret: boolean
}

export interface SessionInput {
  id?: string
  name: string
  group: string
  host: string
  port: number
  username: string
  authType: AuthType
  privateKeyPath?: string
  /** undefined: keep the stored secret; '': clear it */
  secret?: string
}

export type ConnectResult = { ok: true } | { ok: false; error: string; needAuth?: boolean }

export interface Api {
  sessions: {
    list(): Promise<Session[]>
    save(input: SessionInput): Promise<Session>
    remove(id: string): Promise<void>
  }
  ssh: {
    connect(
      tabId: string,
      sessionId: string,
      cols: number,
      rows: number,
      secret?: string
    ): Promise<ConnectResult>
    write(tabId: string, data: string): void
    resize(tabId: string, cols: number, rows: number): void
    close(tabId: string): void
    onData(cb: (tabId: string, data: string) => void): () => void
    onClosed(cb: (tabId: string, reason?: string) => void): () => void
  }
  dialog: {
    openPrivateKey(): Promise<string | null>
    openDirectory(defaultPath?: string): Promise<string | null>
  }
  update: {
    status(): Promise<UpdateStatus>
    check(): Promise<void>
    /** Quits and installs a downloaded update. */
    install(): void
    openReleasePage(): void
    onStatus(cb: (status: UpdateStatus) => void): () => void
  }
  local: {
    home(): Promise<string>
    places(): Promise<LocalPlaces>
    list(dir: string): Promise<FileEntry[]>
    mkdir(dir: string, name: string): Promise<void>
    rename(dir: string, from: string, to: string): Promise<void>
    remove(paths: string[]): Promise<void>
    open(path: string): Promise<void>
    showInFolder(path: string): void
  }
  sftp: {
    home(tabId: string): Promise<string>
    list(tabId: string, dir: string): Promise<FileEntry[]>
    mkdir(tabId: string, dir: string, name: string): Promise<void>
    rename(tabId: string, dir: string, from: string, to: string): Promise<void>
    remove(tabId: string, entries: FileEntry[]): Promise<void>
  }
  transfer: {
    start(req: TransferRequest): Promise<void>
    cancel(id: string): void
    retry(id: string): void
    clear(): Promise<void>
    onUpdate(cb: (task: TransferTask) => void): () => void
  }
  edit: {
    /** Resolves with the editor name used. */
    open(tabId: string, remotePath: string): Promise<string>
    getEditor(): Promise<EditorInfo>
    chooseEditor(): Promise<EditorInfo | null>
    resetEditor(): Promise<EditorInfo>
    release(tabId: string): void
    onSynced(cb: (e: EditSyncEvent) => void): () => void
  }
  window: {
    /** Recolors the native title bar overlay (min/max/close buttons). */
    /** `solid` is the opaque fallback used where native blur is unavailable. */
    setTheme(background: string, symbol: string, material: 'acrylic' | 'none', solid: string): void
    getCloseToTray(): Promise<boolean>
    setCloseToTray(value: boolean): void
  }
  fonts: {
    list(): Promise<CustomFont[]>
    /** Opens a file picker; resolves with the newly imported fonts. */
    import(): Promise<CustomFont[]>
    read(id: string): Promise<Uint8Array>
    remove(id: string): Promise<void>
  }
  pty: {
    shells(): Promise<LocalShell[]>
    /** Output, exit and input reuse the `ssh` channels, keyed by tab id. */
    /** `cwd` falls back to the home directory when missing or not a directory. */
    spawn(tabId: string, shellId: string, cols: number, rows: number, cwd?: string): Promise<ConnectResult>
  }
  term: {
    clipboardHasImageOnly(): Promise<boolean>
    /** Saves the clipboard image where the tab's shell can read it (uploads for SSH tabs). */
    stageClipboardImage(tabId: string): Promise<string | null>
    stageFiles(tabId: string, paths: string[]): Promise<string[]>
  }
  config: {
    /** Resolves with the saved file path, or null if cancelled. */
    export(settings: Record<string, unknown>): Promise<string | null>
    import(): Promise<ConfigImportResult | null>
  }
  appVersion(): Promise<string>
  getPathForFile(file: File): string
}

export interface ConfigImportResult {
  settings: Record<string, unknown>
  added: number
  skipped: number
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  error?: string
  /** False where the app can't replace itself (macOS without signing, .deb, dev builds). */
  canInstall: boolean
}

export interface LocalShell {
  id: string
  name: string
}

export interface CustomFont {
  id: string
  family: string
  file: string
}

export interface EditorInfo {
  path: string
  name: string
  custom: boolean
}

export interface EditSyncEvent {
  tabId: string
  remotePath: string
  ok: boolean
  error?: string
}

export interface LocalPlaces {
  drives: { path: string; name: string; free: number; total: number }[]
  folders: { name: string; path: string }[]
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  isLink: boolean
  size: number
  mtime: number
  permissions?: string
}

export type TransferDirection = 'upload' | 'download'
export type TransferStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface TransferRequest {
  tabId: string
  direction: TransferDirection
  sources: string[]
  targetDir: string
}

export interface TransferTask {
  id: string
  tabId: string
  direction: TransferDirection
  name: string
  source: string
  target: string
  targetDir: string
  isDir: boolean
  total: number
  transferred: number
  speed: number
  status: TransferStatus
  error?: string
}
