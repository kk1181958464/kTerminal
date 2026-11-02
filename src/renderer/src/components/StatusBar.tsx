import clsx from 'clsx'
import { ArrowUpDown, Download, FolderOpen, Palette, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { themeLabel } from '../theme'
import { formatSize } from '../format'
import { StatusDot, statusMeta } from './StatusDot'

export function StatusBar(): React.JSX.Element {
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const session = useStore((s) => s.sessions.find((x) => x.id === tab?.sessionId))
  const sessionCount = useStore((s) => s.sessions.length)
  const updateTab = useStore((s) => s.updateTab)
  const transfersOpen = useStore((s) => s.transfersOpen)
  const setTransfersOpen = useStore((s) => s.setTransfersOpen)
  const transfers = useStore((s) => s.transfers)
  const active = transfers.filter((t) => t.status === 'running' || t.status === 'queued')
  const total = active.reduce((sum, t) => sum + t.total, 0)
  const done = active.reduce((sum, t) => sum + t.transferred, 0)
  const speed = active.reduce((sum, t) => sum + t.speed, 0)
  const percent = total ? Math.min(100, (done / total) * 100) : 0
  const theme = useSettings((s) => s.theme)
  const setSettingsOpen = useSettings((s) => s.setSettingsOpen)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-1 bg-app px-2 text-[11px] text-dim">
      {tab ? (
        <>
          <span className="flex items-center gap-1.5 px-1.5">
            <StatusDot status={tab.status} />
            {statusMeta[tab.status].label}
          </span>
          {tab.kind === 'local' ? (
            <span className="max-w-[420px] truncate px-1.5" title={tab.cwd}>
              本地 · {tab.shell?.name}
              {tab.cwd && ` · ${tab.cwd}`}
            </span>
          ) : (
            session && (
              <span className="px-1.5 font-mono">
                {session.username}@{session.host}:{session.port}
              </span>
            )
          )}
          {tab.cols && tab.status === 'connected' && (
            <span className="px-1.5 tabular-nums">
              {tab.cols}×{tab.rows}
            </span>
          )}
        </>
      ) : (
        <span className="px-1.5">就绪 · {sessionCount} 个会话</span>
      )}

      <span className="ml-auto" />
      <UpdateIndicator />
      <span className="px-1.5">UTF-8</span>
      <BarButton
        title="切换主题"
        onClick={() => setSettingsOpen(true)}
        icon={<Palette size={12} />}
        label={themeLabel(theme)}
      />
      {tab?.kind === 'ssh' && (
        <BarButton
          active={tab.filesOpen}
          onClick={() => updateTab(tab.id, { filesOpen: !tab.filesOpen })}
          icon={<FolderOpen size={12} />}
          label="文件"
        />
      )}
      {(tab || transfers.length > 0) && (
        <BarButton
          toggle
          active={transfersOpen}
          onClick={() => setTransfersOpen(!transfersOpen)}
          icon={<ArrowUpDown size={12} />}
          label="传输"
          badge={active.length}
        >
          {active.length > 0 && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <span className="h-1 w-14 overflow-hidden rounded-full bg-fg/10">
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </span>
              {percent.toFixed(0)}%{speed > 0 && ` · ${formatSize(speed)}/s`}
            </span>
          )}
        </BarButton>
      )}
    </footer>
  )
}

function UpdateIndicator(): React.JSX.Element | null {
  const update = useStore((s) => s.update)
  if (update.state === 'downloading')
    return (
      <span className="flex items-center gap-1.5 px-1.5 tabular-nums" title={`正在下载 v${update.version}`}>
        <Download size={12} className="text-accent" />
        下载更新 {Math.floor(update.percent ?? 0)}%
      </span>
    )
  if (update.state === 'ready')
    return (
      <BarButton
        active
        title="重启应用以完成更新"
        onClick={() => window.api.update.install()}
        icon={<RefreshCw size={12} />}
        label={`重启以更新 v${update.version}`}
      />
    )
  if (update.state === 'available')
    return (
      <BarButton
        active
        title="前往下载页面"
        onClick={() => window.api.update.openReleasePage()}
        icon={<Download size={12} />}
        label={`新版本 v${update.version}`}
      />
    )
  return null
}

function BarButton({
  active,
  onClick,
  icon,
  label,
  badge,
  title,
  toggle,
  children
}: {
  active?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  title?: string
  /** Marks the transfer toggle so the popover's outside-click handler ignores it. */
  toggle?: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      data-transfer-toggle={toggle || undefined}
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-5 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-fg/[0.07] hover:text-fg',
        active && 'bg-accent/12 text-accent hover:bg-accent/18 hover:text-accent'
      )}
    >
      {icon}
      {label}
      {children}
      {!!badge && (
        <span className="grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[9.5px] font-semibold text-accent-fg">
          {badge}
        </span>
      )}
    </button>
  )
}
