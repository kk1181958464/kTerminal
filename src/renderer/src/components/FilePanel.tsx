import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FilePen,
  Settings2,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
  HardDrive,
  Home,
  Monitor,
  Laptop,
  FileDown,
  FileStack,
  Pencil,
  RotateCw,
  Server,
  Trash2,
  Upload
} from 'lucide-react'
import type { FileEntry, TransferDirection } from '../../../shared/types'
import {
  confirmDialog,
  errorMessage,
  openMenu,
  openMenuAt,
  promptDialog,
  toast,
  useStore,
  type MenuItem,
  type Tab
} from '../store'
import { formatSize, formatTime } from '../format'
import { useSettings } from '../settings'

type Kind = 'local' | 'remote'
const DRAG_MIME = (kind: Kind): string => `application/x-xssh-${kind}`

interface PaneApi {
  home(): Promise<string>
  list(dir: string): Promise<FileEntry[]>
  mkdir(dir: string, name: string): Promise<void>
  rename(dir: string, from: string, to: string): Promise<void>
  remove(entries: FileEntry[]): Promise<void>
}

function parentOf(kind: Kind, path: string): string | null {
  // Remote paths, and local ones on macOS/Linux, are POSIX.
  if (kind === 'remote' || path.startsWith('/')) {
    if (path === '/') return null
    const i = path.replace(/\/+$/, '').lastIndexOf('/')
    return i <= 0 ? '/' : path.slice(0, i)
  }
  if (!path) return null
  if (/^[a-z]:\\?$/i.test(path)) return ''
  const trimmed = path.replace(/\\+$/, '')
  const parent = trimmed.slice(0, trimmed.lastIndexOf('\\'))
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent
}

const extIcons: [RegExp, typeof File][] = [
  [/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i, FileImage],
  [/\.(zip|gz|tgz|tar|rar|7z|xz|bz2|deb|rpm)$/i, FileArchive],
  [/\.(js|ts|tsx|jsx|py|sh|go|rs|java|c|cpp|h|json|ya?ml|toml|xml|html|css|conf|ini|sql|php|rb)$/i, FileCode2],
  [/\.(txt|md|log|csv)$/i, FileText]
]

function EntryIcon({ entry, kind }: { entry: FileEntry; kind: Kind }): React.JSX.Element {
  if (kind === 'local' && /^[a-z]:\\$/i.test(entry.path))
    return <HardDrive size={15} className="shrink-0 text-dim" />
  if (entry.isDir) {
    const Icon = entry.isLink ? FolderSymlink : Folder
    return <Icon size={15} className="shrink-0 fill-folder/20 text-folder" />
  }
  const Icon = extIcons.find(([re]) => re.test(entry.name))?.[1] ?? File
  return <Icon size={15} className="shrink-0 text-dim" />
}

export function FilePanel({
  tab,
  host,
  stacked
}: {
  tab: Tab
  host: string
  /** Local above remote (right-side column) instead of side by side. */
  stacked: boolean
}): React.JSX.Element {
  const ratio = useStore((s) => s.filePaneRatio)
  const setRatio = useStore((s) => s.setFilePaneRatio)
  const columnRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  // Dragging close to either edge collapses that pane to a title bar.
  const snap = (v: number): number => (v < 0.12 ? 0 : v > 0.88 ? 1 : v)
  const localShare = snap(dragRatio ?? ratio)
  const connected = tab.status === 'connected'
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [remotePath, setRemotePath] = useState<string | null>(null)

  useEffect(() => {
    window.api.local.home().then(setLocalPath)
  }, [])

  useEffect(() => {
    if (connected && remotePath === null)
      window.api.sftp
        .home(tab.id)
        .then(setRemotePath)
        .catch((e) => toast(`无法打开 SFTP：${errorMessage(e)}`, 'error'))
  }, [connected, remotePath, tab.id])

  const transfer = (direction: TransferDirection, sources: string[], targetDir: string | null): void => {
    if (!sources.length) return
    if (!connected) return toast('会话未连接', 'error')
    if (targetDir === null) return
    if (direction === 'download' && !targetDir) return toast('请先在本地面板打开一个文件夹', 'error')
    window.api.transfer.start({ tabId: tab.id, direction, sources, targetDir })
  }

  const localApi = useMemo<PaneApi>(
    () => ({
      home: () => window.api.local.home(),
      list: (dir) => window.api.local.list(dir),
      mkdir: (dir, name) => window.api.local.mkdir(dir, name),
      rename: (dir, from, to) => window.api.local.rename(dir, from, to),
      remove: (entries) => window.api.local.remove(entries.map((e) => e.path))
    }),
    []
  )
  const remoteApi = useMemo<PaneApi>(
    () => ({
      home: () => window.api.sftp.home(tab.id),
      list: (dir) => window.api.sftp.list(tab.id, dir),
      mkdir: (dir, name) => window.api.sftp.mkdir(tab.id, dir, name),
      rename: (dir, from, to) => window.api.sftp.rename(tab.id, dir, from, to),
      remove: (entries) => window.api.sftp.remove(tab.id, entries)
    }),
    [tab.id]
  )

  const startSplit = (e: React.MouseEvent): void => {
    e.preventDefault()
    const rect = columnRef.current!.getBoundingClientRect()
    let latest = localShare
    const onMove = (ev: MouseEvent): void => {
      latest = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
      setDragRatio(latest)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      setRatio(snap(latest))
      setDragRatio(null)
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const localPane = (
      <FilePane
        kind="local"
        tabId={tab.id}
        title="本地"
        api={localApi}
        path={localPath}
        setPath={setLocalPath}
        ready
        onSend={(paths) => transfer('upload', paths, remotePath)}
        onReceive={(paths, dir) => transfer('download', paths, dir)}
      />
  )
  const remotePane = (
      <FilePane
        kind="remote"
        tabId={tab.id}
        title={host}
        api={remoteApi}
        path={remotePath}
        setPath={setRemotePath}
        ready={connected}
        onSend={(paths) => transfer('download', paths, localPath)}
        onReceive={(paths, dir) => transfer('upload', paths, dir)}
      />
  )

  if (!stacked)
    return (
      <div className="flex h-full gap-2">
        {localPane}
        {remotePane}
      </div>
    )

  const localCollapsed = localShare === 0
  const remoteCollapsed = localShare === 1

  // Collapsed panes stay mounted (hidden) so their selection and scroll survive.
  return (
    <div ref={columnRef} className="flex h-full flex-col">
      {localCollapsed && <CollapsedPane kind="local" title="本地" onExpand={() => setRatio(0.5)} />}
      <div
        style={
          localCollapsed
            ? { display: 'none' }
            : remoteCollapsed
              ? undefined
              : { height: `calc(${localShare * 100}% - 4px)` }
        }
        className={clsx('flex min-h-0', remoteCollapsed ? 'flex-1' : 'shrink-0')}
      >
        {localPane}
      </div>
      <div
        onMouseDown={startSplit}
        onDoubleClick={() => setRatio(0.5)}
        title="拖动调整比例，拖到顶部或底部可收起一栏，双击恢复"
        className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center"
      >
        <div className="h-[3px] w-10 rounded-full bg-fg/10 transition-colors group-hover:bg-accent/70" />
      </div>
      <div style={remoteCollapsed ? { display: 'none' } : undefined} className="flex min-h-0 flex-1">
        {remotePane}
      </div>
      {remoteCollapsed && <CollapsedPane kind="remote" title={host} onExpand={() => setRatio(0.5)} />}
    </div>
  )
}

function CollapsedPane({
  kind,
  title,
  onExpand
}: {
  kind: Kind
  title: string
  onExpand: () => void
}): React.JSX.Element {
  const Icon = kind === 'remote' ? Server : Monitor
  const Arrow = kind === 'remote' ? ChevronUp : ChevronDown
  return (
    <button
      onClick={onExpand}
      title="展开"
      className="surface flex h-8 shrink-0 cursor-pointer items-center gap-2 px-3 text-[12px] text-dim transition-colors hover:border-fg/15 hover:text-fg"
    >
      <Icon size={12} />
      <span className="truncate">{title}</span>
      <span className="ml-auto flex items-center gap-1 text-[11px]">
        展开
        <Arrow size={12} />
      </span>
    </button>
  )
}

interface PaneProps {
  kind: Kind
  tabId: string
  title: string
  api: PaneApi
  path: string | null
  setPath(path: string): void
  ready: boolean
  /** Transfer own entries to the other pane's current directory. */
  onSend(paths: string[]): void
  /** Transfer entries from the other side (or Explorer) into `dir` of this pane. */
  onReceive(paths: string[], dir: string): void
}

type SortKey = 'name' | 'size' | 'mtime'

function FilePane({ kind, tabId, title, api, path, setPath, ready, onSend, onReceive }: PaneProps): React.JSX.Element {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [showHidden, setShowHidden] = useState(() => useSettings.getState().showHiddenFiles)
  const [pathInput, setPathInput] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const lastDone = useStore((s) => s.lastDone)
  const remoteChanged = useStore((s) => s.remoteChanged)
  const editor = useStore((s) => s.editor)
  const other: Kind = kind === 'local' ? 'remote' : 'local'
  const isRemote = kind === 'remote'
  const rootRef = useRef<HTMLDivElement>(null)
  const [paneWidth, setPaneWidth] = useState(600)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPaneWidth(entry.contentRect.width))
    observer.observe(rootRef.current!)
    return () => observer.disconnect()
  }, [])

  const load = useCallback(
    async (dir: string) => {
      setLoading(true)
      setError('')
      try {
        setEntries(await api.list(dir))
      } catch (e) {
        setError(errorMessage(e))
        setEntries([])
      } finally {
        setLoading(false)
      }
    },
    [api]
  )

  useEffect(() => {
    setPathInput(path ?? '')
    setSelected(new Set())
    if (path !== null && ready) load(path)
  }, [path, ready, load])

  useEffect(() => {
    if (!lastDone || path === null) return
    const mine = isRemote
      ? lastDone.direction === 'upload' && lastDone.tabId === tabId
      : lastDone.direction === 'download'
    if (mine && lastDone.targetDir === path) load(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDone])

  useEffect(() => {
    if (isRemote && remoteChanged?.tabId === tabId && remoteChanged.dir === path && path !== null) load(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteChanged])

  const visible = useMemo(() => {
    const list = entries.filter((e) => showHidden || !e.name.startsWith('.'))
    const dir = sort.asc ? 1 : -1
    return list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      if (sort.key === 'size' && a.size !== b.size) return (a.size - b.size) * dir
      if (sort.key === 'mtime' && a.mtime !== b.mtime) return (a.mtime - b.mtime) * dir
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) * dir
    })
  }, [entries, showHidden, sort])

  const selection = visible.filter((e) => selected.has(e.path))
  const parent = path === null ? null : parentOf(kind, path)
  const atDrives = kind === 'local' && path === ''

  const refresh = (): void => {
    if (path !== null) load(path)
  }

  const open = (entry: FileEntry): void => {
    if (entry.isDir) setPath(entry.path)
    else onSend([entry.path])
  }

  const rename = async (entry: FileEntry): Promise<void> => {
    const name = await promptDialog({ title: '重命名', defaultValue: entry.name, okText: '重命名' })
    if (!name || name === entry.name || path === null) return
    try {
      await api.rename(path, entry.name, name)
      refresh()
    } catch (e) {
      toast(`重命名失败：${errorMessage(e)}`, 'error')
    }
  }

  const remove = async (targets: FileEntry[]): Promise<void> => {
    if (!targets.length || atDrives) return
    const names = targets.slice(0, 3).map((t) => t.name).join('、') + (targets.length > 3 ? ' 等' : '')
    const ok = await confirmDialog({
      title: `删除 ${targets.length} 项？`,
      message: `${names}\n${isRemote ? '远程文件删除后无法恢复。' : '文件将被移至回收站。'}`,
      okText: '删除',
      danger: true
    })
    if (!ok) return
    try {
      await api.remove(targets)
      toast(`已删除 ${targets.length} 项`, 'success')
    } catch (e) {
      toast(`删除失败：${errorMessage(e)}`, 'error')
    }
    refresh()
  }

  const mkdir = async (): Promise<void> => {
    if (path === null || atDrives) return
    const name = await promptDialog({ title: '新建文件夹', placeholder: '文件夹名称', okText: '创建' })
    if (!name) return
    try {
      await api.mkdir(path, name)
      refresh()
    } catch (e) {
      toast(`创建失败：${errorMessage(e)}`, 'error')
    }
  }

  const select = (e: React.MouseEvent, entry: FileEntry, index: number): void => {
    if (e.shiftKey && anchor) {
      const a = visible.findIndex((x) => x.path === anchor)
      const [from, to] = [Math.min(a, index), Math.max(a, index)]
      setSelected(new Set(visible.slice(from, to + 1).map((x) => x.path)))
      return
    }
    if (e.ctrlKey) {
      const next = new Set(selected)
      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      setSelected(next)
    } else {
      setSelected(new Set([entry.path]))
    }
    setAnchor(entry.path)
  }

  const openPlaces = async (el: HTMLElement): Promise<void> => {
    const { drives, folders } = await window.api.local.places()
    const current = path?.slice(0, 2).toUpperCase()
    const folderIcons: Record<string, typeof File> = { 桌面: Laptop, 下载: FileDown, 文档: FileStack, 主目录: Home }
    openMenuAt(el, [
      ...drives.map((d) => ({
        label: d.path === '/' ? '根目录 /' : `本地磁盘 (${d.name})`,
        icon: HardDrive,
        hint: d.total ? `可用 ${formatSize(d.free)} / ${formatSize(d.total)}` : undefined,
        active: d.name === current,
        onClick: () => setPath(d.path)
      })),
      { label: '此电脑', icon: Monitor, active: atDrives, onClick: () => setPath('') },
      'sep',
      ...folders.map((f) => ({ label: f.name, icon: folderIcons[f.name], onClick: () => setPath(f.path) }))
    ])
  }

  const editRemote = async (entry: FileEntry): Promise<void> => {
    if (
      entry.size > 20 * 1024 * 1024 &&
      !(await confirmDialog({
        title: '文件较大',
        message: `${entry.name} 大小为 ${formatSize(entry.size)}，确定要下载并用编辑器打开吗？`,
        okText: '打开'
      }))
    )
      return
    try {
      const name = await window.api.edit.open(tabId, entry.path)
      toast(`已用 ${name} 打开 ${entry.name}，保存后自动上传`, 'info')
    } catch (e) {
      toast(`打开失败：${errorMessage(e)}`, 'error')
    }
  }

  const chooseEditor = async (): Promise<void> => {
    const chosen = await window.api.edit.chooseEditor()
    if (chosen) {
      useStore.setState({ editor: chosen })
      toast(`默认编辑器已设为 ${chosen.name}`, 'success')
    }
  }

  const resetEditor = async (): Promise<void> => {
    const detected = await window.api.edit.resetEditor()
    useStore.setState({ editor: detected })
    toast(`已恢复自动检测：${detected.name}`, 'success')
  }

  const sendLabel = isRemote ? '下载到本地' : '上传到远程'
  const SendIcon = isRemote ? Download : Upload

  const rowMenu = (e: React.MouseEvent, entry: FileEntry): void => {
    let targets = selection
    if (!selected.has(entry.path)) {
      setSelected(new Set([entry.path]))
      setAnchor(entry.path)
      targets = [entry]
    }
    const single = targets.length === 1
    const items: (MenuItem | 'sep')[] = []
    if (single && entry.isDir) items.push({ label: '打开', icon: FolderOpen, onClick: () => setPath(entry.path) })
    if (isRemote && single && !entry.isDir) {
      items.push({ label: '用本地编辑器打开', icon: FilePen, hint: editor?.name, onClick: () => editRemote(entry) })
      items.push({ label: '选择编辑器…', icon: Settings2, onClick: chooseEditor })
      if (editor?.custom) items.push({ label: '恢复自动检测编辑器', icon: RotateCw, onClick: resetEditor })
      items.push('sep')
    }
    if (!atDrives) items.push({ label: sendLabel, icon: SendIcon, onClick: () => onSend(targets.map((t) => t.path)) })
    if (!isRemote && single)
      items.push(
        entry.isDir
          ? { label: '在资源管理器中显示', icon: ExternalLink, onClick: () => window.api.local.showInFolder(entry.path) }
          : { label: '用默认程序打开', icon: ExternalLink, onClick: () => window.api.local.open(entry.path) }
      )
    items.push('sep')
    if (!atDrives) {
      items.push({ label: '重命名', icon: Pencil, disabled: !single, onClick: () => rename(entry) })
      items.push({ label: '复制路径', icon: Copy, onClick: () => navigator.clipboard.writeText(targets.map((t) => t.path).join('\n')) })
      items.push('sep')
      items.push({ label: `删除${targets.length > 1 ? ` ${targets.length} 项` : ''}`, icon: Trash2, danger: true, onClick: () => remove(targets) })
    }
    openMenu(e, items)
  }

  const blankMenu = (e: React.MouseEvent): void => {
    setSelected(new Set())
    const items: (MenuItem | 'sep')[] = [
      { label: '刷新', icon: RotateCw, onClick: refresh },
      { label: '新建文件夹', icon: FolderPlus, disabled: atDrives, onClick: mkdir }
    ]
    if (!isRemote && path)
      items.push({ label: '在资源管理器中打开', icon: ExternalLink, onClick: () => window.api.local.open(path) })
    if (path) items.push({ label: '复制当前路径', icon: Copy, onClick: () => navigator.clipboard.writeText(path) })
    openMenu(e, items)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'Enter' && selection[0]) open(selection[0])
    else if (e.key === 'Delete') remove(selection)
    else if (e.key === 'F2' && selection.length === 1) rename(selection[0])
    else if (e.key === 'F5') refresh()
    else if (e.key === 'Backspace' && parent !== null) setPath(parent)
    else if (e.key === 'a' && e.ctrlKey) setSelected(new Set(visible.map((x) => x.path)))
    else return
    e.preventDefault()
  }

  // ----- drag & drop -----
  const accepts = (e: React.DragEvent): boolean =>
    ready &&
    !atDrives &&
    (e.dataTransfer.types.includes(DRAG_MIME(other)) || (isRemote && e.dataTransfer.types.includes('Files')))

  const onDragOver = (e: React.DragEvent, target: string): void => {
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropTarget(target)
  }

  const onDrop = (e: React.DragEvent, dir: string): void => {
    setDropTarget(null)
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    const internal = e.dataTransfer.getData(DRAG_MIME(other))
    const paths: string[] = internal
      ? JSON.parse(internal)
      : [...e.dataTransfer.files].map((f) => window.api.getPathForFile(f)).filter(Boolean)
    onReceive(paths, dir)
  }

  const onDragStart = (e: React.DragEvent, entry: FileEntry): void => {
    if (atDrives) return e.preventDefault()
    const paths = selected.has(entry.path) ? selection.map((s) => s.path) : [entry.path]
    if (!selected.has(entry.path)) setSelected(new Set([entry.path]))
    e.dataTransfer.setData(DRAG_MIME(kind), JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Narrow panes (e.g. the right-side column) drop the less important columns.
  const showTime = paneWidth >= 380
  const showPerm = isRemote && paneWidth >= 500
  const gridTemplateColumns = ['minmax(0,1fr)', '72px', showTime && '124px', showPerm && '86px']
    .filter(Boolean)
    .join(' ')
  const selectedSize = selection.reduce((sum, e) => sum + (e.isDir ? 0 : e.size), 0)

  const header = (key: SortKey, label: string, align = ''): React.JSX.Element => (
    <button
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      className={clsx('cursor-pointer truncate hover:text-fg', align, sort.key === key && 'text-fg')}
    >
      {label}
      {sort.key === key && (sort.asc ? ' ↑' : ' ↓')}
    </button>
  )

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-pane={kind}
      className="surface flex min-w-0 flex-1 flex-col overflow-hidden outline-none"
    >
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-2">
        {isRemote ? (
          <span className="mr-1.5 flex max-w-[140px] shrink-0 items-center gap-1.5 rounded-md bg-fg/[0.05] px-2 py-0.5 text-[11px] text-dim">
            <Server size={11} />
            <span className="truncate">{title}</span>
          </span>
        ) : (
          <button
            title="切换磁盘或常用位置"
            onClick={(e) => openPlaces(e.currentTarget)}
            className="mr-1.5 flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-fg/[0.05] px-2 text-[11px] text-dim transition hover:bg-fg/[0.1] hover:text-fg"
          >
            {atDrives ? <Monitor size={11} /> : <HardDrive size={11} />}
            {atDrives ? '此电脑' : (path?.match(/^[a-z]:/i)?.[0].toUpperCase() ?? title)}
            <ChevronDown size={11} />
          </button>
        )}
        <button title="上级目录 (Backspace)" disabled={parent === null || !ready} onClick={() => parent !== null && setPath(parent)} className="icon-btn disabled:opacity-30">
          <ArrowUp size={14} />
        </button>
        <button title="刷新 (F5)" disabled={!ready} onClick={refresh} className="icon-btn disabled:opacity-30">
          <RotateCw size={13} className={clsx(loading && 'animate-spin')} />
        </button>
        <button
          title="主目录"
          disabled={!ready}
          onClick={() => api.home().then(setPath).catch((e) => toast(errorMessage(e), 'error'))}
          className="icon-btn disabled:opacity-30"
        >
          <Home size={13} />
        </button>
        <input
          value={atDrives ? '此电脑' : pathInput}
          disabled={!ready}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const next = pathInput.trim()
            if (next === path) refresh()
            else setPath(next)
          }}
          onFocus={(e) => atDrives && (e.target.value = '')}
          spellCheck={false}
          className="input mx-1 h-7 min-w-0 flex-1 rounded-md px-2 font-mono text-[12px]"
        />
        <button title="新建文件夹" disabled={!ready || atDrives} onClick={mkdir} className="icon-btn disabled:opacity-30">
          <FolderPlus size={14} />
        </button>
        <button
          title={showHidden ? '隐藏隐藏文件' : '显示隐藏文件'}
          onClick={() => setShowHidden((v) => !v)}
          className={clsx('icon-btn', showHidden && 'text-accent')}
        >
          {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          title={sendLabel}
          disabled={!selection.length || atDrives}
          onClick={() => onSend(selection.map((s) => s.path))}
          className="icon-btn text-accent disabled:opacity-30"
        >
          <SendIcon size={14} />
        </button>
      </div>

      <div
        style={{ gridTemplateColumns }}
        className="grid shrink-0 gap-3 border-b border-line bg-panel/40 px-3 py-1.5 text-[11px] text-dim"
      >
        {header('name', '名称', 'text-left')}
        {header('size', '大小', 'text-right')}
        {showTime && header('mtime', '修改时间', 'text-left')}
        {showPerm && <span>权限</span>}
      </div>

      <div
        onContextMenu={(e) => ready && blankMenu(e)}
        onMouseDown={(e) => e.target === e.currentTarget && setSelected(new Set())}
        onDragOver={(e) => path !== null && onDragOver(e, path)}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropTarget(null)}
        onDrop={(e) => path !== null && onDrop(e, path)}
        className={clsx(
          'relative min-h-0 flex-1 overflow-y-auto py-1 transition-shadow',
          dropTarget === path && path !== null && 'bg-accent/[0.05] shadow-[inset_0_0_0_2px_var(--c-accent)]'
        )}
      >
        {!ready ? (
          <Placeholder icon={Server} text="连接建立后可浏览远程文件" />
        ) : error ? (
          <Placeholder icon={FolderInput} text={error} error />
        ) : (
          visible.map((entry, index) => (
            <div
              key={entry.path}
              draggable
              onDragStart={(e) => onDragStart(e, entry)}
              onDragOver={(e) => entry.isDir && onDragOver(e, entry.path)}
              onDrop={(e) => entry.isDir && onDrop(e, entry.path)}
              onMouseDown={(e) => {
                if (e.button === 0) select(e, entry, index)
              }}
              onDoubleClick={() => open(entry)}
              onContextMenu={(e) => rowMenu(e, entry)}
              title={showTime ? undefined : `${entry.name}\n${formatTime(entry.mtime)}${entry.permissions ? `  ${entry.permissions}` : ''}`}
              style={{ gridTemplateColumns }}
              className={clsx(
                'mx-1 grid h-7 cursor-default items-center gap-3 rounded-md px-2 text-[12.5px] transition-colors duration-100',
                dropTarget === entry.path
                  ? 'bg-accent/20 ring-1 ring-accent'
                  : selected.has(entry.path)
                    ? 'bg-accent/15 text-fg'
                    : 'hover:bg-fg/[0.04]'
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <EntryIcon entry={entry} kind={kind} />
                <span className={clsx('truncate', entry.name.startsWith('.') && 'opacity-60')}>{entry.name}</span>
              </span>
              <span className="text-right text-[11.5px] text-dim tabular-nums">
                {entry.isDir ? '' : formatSize(entry.size)}
              </span>
              {showTime && <span className="truncate text-[11.5px] text-dim tabular-nums">{formatTime(entry.mtime)}</span>}
              {showPerm && <span className="font-mono text-[11px] text-dim/80">{entry.permissions}</span>}
            </div>
          ))
        )}
        {ready && !error && !loading && visible.length === 0 && path !== null && (
          <Placeholder icon={Folder} text={isRemote ? '空文件夹，可将本地文件拖到这里上传' : '空文件夹'} />
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line px-3 text-[11px] text-dim">
        <span>{ready ? `${visible.length} 项` : ''}</span>
        {selection.length > 0 && (
          <span>
            已选 {selection.length} 项{selectedSize ? ` · ${formatSize(selectedSize)}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function Placeholder({
  icon: Icon,
  text,
  error
}: {
  icon: typeof File
  text: string
  error?: boolean
}): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon size={22} className={error ? 'text-err/80' : 'text-dim/50'} />
      <span className={clsx('text-xs', error ? 'text-err/90' : 'text-dim/70')}>{text}</span>
    </div>
  )
}
