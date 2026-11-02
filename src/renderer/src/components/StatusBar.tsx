import clsx from 'clsx'
import { ArrowUpDown, FolderOpen, Palette } from 'lucide-react'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { themeLabel } from '../theme'
import { StatusDot, statusMeta } from './StatusDot'

export function StatusBar(): React.JSX.Element {
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const session = useStore((s) => s.sessions.find((x) => x.id === tab?.sessionId))
  const sessionCount = useStore((s) => s.sessions.length)
  const updateTab = useStore((s) => s.updateTab)
  const transfersOpen = useStore((s) => s.transfersOpen)
  const setTransfersOpen = useStore((s) => s.setTransfersOpen)
  const activeTransfers = useStore(
    (s) => s.transfers.filter((t) => t.status === 'running' || t.status === 'queued').length
  )
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
          {session && (
            <span className="px-1.5 font-mono">
              {session.username}@{session.host}:{session.port}
            </span>
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

      <span className="ml-auto px-1.5">UTF-8</span>
      <BarButton
        title="切换主题"
        onClick={() => setSettingsOpen(true)}
        icon={<Palette size={12} />}
        label={themeLabel(theme)}
      />
      {tab && (
        <>
          <BarButton
            active={tab.filesOpen}
            onClick={() => updateTab(tab.id, { filesOpen: !tab.filesOpen })}
            icon={<FolderOpen size={12} />}
            label="文件"
          />
          <BarButton
            active={transfersOpen}
            onClick={() => setTransfersOpen(!transfersOpen)}
            icon={<ArrowUpDown size={12} />}
            label="传输"
            badge={activeTransfers}
          />
        </>
      )}
    </footer>
  )
}

function BarButton({
  active,
  onClick,
  icon,
  label,
  badge,
  title
}: {
  active?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  title?: string
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-5 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-fg/[0.07] hover:text-fg',
        active && 'bg-accent/12 text-accent hover:bg-accent/18 hover:text-accent'
      )}
    >
      {icon}
      {label}
      {!!badge && (
        <span className="grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[9.5px] font-semibold text-accent-fg">
          {badge}
        </span>
      )}
    </button>
  )
}
