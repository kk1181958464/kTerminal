import clsx from 'clsx'
import { Reorder } from 'framer-motion'
import { PanelLeft, Plus, TerminalSquare, X } from 'lucide-react'
import { openMenuAt, useStore, type MenuItem } from '../store'
import { useSettings } from '../settings'
import { StatusDot } from './StatusDot'

export function TitleBar(): React.JSX.Element {
  const tabs = useStore((s) => s.tabs)
  const sessions = useStore((s) => s.sessions)
  const activeTabId = useStore((s) => s.activeTabId)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const reorderTabs = useStore((s) => s.reorderTabs)
  const openTab = useStore((s) => s.openTab)
  const openDialog = useStore((s) => s.openDialog)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const setSettings = useSettings((s) => s.set)

  const quickConnect = (el: HTMLElement): void => {
    const items: (MenuItem | 'sep')[] = sessions.slice(0, 12).map((s) => ({
      label: s.name,
      hint: `${s.username}@${s.host}`,
      icon: TerminalSquare,
      onClick: () => openTab(s)
    }))
    if (items.length) items.push('sep')
    items.push({ label: '新建会话…', icon: Plus, onClick: () => openDialog() })
    openMenuAt(el, items)
  }

  return (
    // Right padding leaves room for the native window controls (titleBarOverlay).
    <header className="drag flex h-10 shrink-0 items-center gap-1.5 bg-app pr-[140px] pl-2">
      <button
        title={collapsed ? '显示侧边栏' : '隐藏侧边栏'}
        onClick={() => setSettings({ sidebarCollapsed: !collapsed })}
        className="no-drag icon-btn"
      >
        <PanelLeft size={15} />
      </button>
      <div className="flex shrink-0 items-center gap-2 pr-2 pl-1">
        <div className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent text-accent-fg">
          <TerminalSquare size={11} strokeWidth={2.5} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight">kTerminal</span>
      </div>
      {tabs.length > 0 && <div className="mx-1 h-4 w-px shrink-0 bg-line" />}

      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={reorderTabs}
        className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 scrollbar-none"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <Reorder.Item
              as="div"
              key={tab.id}
              value={tab}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              whileDrag={{ scale: 1.04, zIndex: 10 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              onPointerDown={() => setActiveTab(tab.id)}
              onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
              className={clsx(
                'no-drag group relative flex h-7 max-w-[200px] min-w-[110px] shrink-0 cursor-default items-center gap-2 rounded-lg border pr-1 pl-2.5 text-[12.5px] transition-colors',
                active
                  ? 'border-line bg-term text-fg shadow-[0_1px_2px_rgb(0_0_0/0.15)]'
                  : 'border-transparent text-dim hover:bg-fg/[0.05] hover:text-fg'
              )}
            >
              <StatusDot status={tab.status} />
              <span className="truncate">{tab.title}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => closeTab(tab.id)}
                className={clsx(
                  'ml-auto grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md transition hover:bg-fg/10',
                  active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                )}
              >
                <X size={12} />
              </button>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>

      <button
        title="新建连接"
        onClick={(e) => quickConnect(e.currentTarget)}
        className="no-drag icon-btn"
      >
        <Plus size={15} />
      </button>
    </header>
  )
}
