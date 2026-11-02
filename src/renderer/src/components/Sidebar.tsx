import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  Copy,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  ServerCog,
  Settings,
  Sun,
  Trash2
} from 'lucide-react'
import type { Session } from '../../../shared/types'
import { confirmDialog, openMenu, openMenuAt, toast, useStore, type MenuItem } from '../store'
import { useSettings } from '../settings'
import { resolveThemeId, themes } from '../theme'
import { Avatar } from './ui'

const DEFAULT_GROUP = '默认分组'

export function Sidebar(): React.JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const openDialog = useStore((s) => s.openDialog)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const theme = useSettings((s) => s.theme)
  const setSettings = useSettings((s) => s.set)
  const setSettingsOpen = useSettings((s) => s.setSettingsOpen)
  const [query, setQuery] = useState('')
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const dark = themes[resolveThemeId(theme)].dark

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      const text = `${s.name} ${s.host} ${s.username} ${s.group}`.toLowerCase()
      if (q && !text.includes(q)) continue
      const group = s.group || DEFAULT_GROUP
      map.set(group, [...(map.get(group) ?? []), s])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  }, [sessions, query])

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : 252, opacity: collapsed ? 0 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="shrink-0 overflow-hidden"
    >
      <div className="flex h-full w-[252px] flex-col pb-2 pl-2">
        <div className="flex gap-1.5 pt-0.5 pr-2 pb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话"
              className="input h-8 bg-term pl-8"
            />
          </div>
          <button
            title="新建会话"
            onClick={() => openDialog()}
            className="btn btn-primary h-8 w-8 shrink-0 px-0"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {sessions.length === 0 && (
            <div className="flex flex-col items-center px-4 pt-14 text-center">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-fg/[0.05] text-dim">
                <ServerCog size={20} />
              </div>
              <p className="text-[13px] text-fg">还没有会话</p>
              <p className="mt-1 text-xs text-dim">添加一台服务器开始使用</p>
              <button onClick={() => openDialog()} className="btn btn-ghost mt-4 h-8 text-xs">
                <Plus size={14} />
                新建会话
              </button>
            </div>
          )}
          {sessions.length > 0 && groups.length === 0 && (
            <p className="pt-10 text-center text-xs text-dim">没有匹配「{query}」的会话</p>
          )}
          {groups.map(([group, list]) => (
            <div key={group} className="mb-2">
              <button
                onClick={() => setFolded((f) => ({ ...f, [group]: !f[group] }))}
                className="flex w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold tracking-wide text-dim/80 transition-colors hover:text-fg"
              >
                <ChevronRight
                  size={12}
                  className={clsx('transition-transform duration-200', !folded[group] && 'rotate-90')}
                />
                <span className="truncate">{group}</span>
                <span className="ml-auto font-normal text-dim/50">{list.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {!folded[group] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    {list.map((s) => (
                      <SessionItem key={s.id} session={s} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <div className="mt-1 mr-2 flex items-center gap-1 border-t border-line pt-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12.5px] text-dim transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <Settings size={15} />
            设置
            <span className="ml-auto flex gap-0.5">
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">,</kbd>
            </span>
          </button>
          <button
            title={dark ? '切换到浅色主题' : '切换到深色主题'}
            onClick={() => setSettings({ theme: dark ? 'github-light' : 'graphite' })}
            className="icon-btn h-8 w-8"
          >
            <motion.span
              key={String(dark)}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              className="grid place-items-center"
            >
              {dark ? <Moon size={15} /> : <Sun size={15} />}
            </motion.span>
          </button>
        </div>
      </div>
    </motion.aside>
  )
}

function SessionItem({ session }: { session: Session }): React.JSX.Element {
  const openTab = useStore((s) => s.openTab)
  const openDialog = useStore((s) => s.openDialog)
  const deleteSession = useStore((s) => s.deleteSession)
  const online = useStore((s) =>
    s.tabs.some((t) => t.sessionId === session.id && t.status === 'connected')
  )

  const items = (): (MenuItem | 'sep')[] => [
    { label: '连接', icon: Play, onClick: () => openTab(session) },
    { label: '编辑', icon: Pencil, onClick: () => openDialog(session) },
    {
      label: '复制地址',
      icon: Copy,
      onClick: () => {
        navigator.clipboard.writeText(`${session.username}@${session.host}`)
        toast('已复制到剪贴板', 'success')
      }
    },
    'sep',
    {
      label: '删除',
      icon: Trash2,
      danger: true,
      onClick: async () =>
        (await confirmDialog({
          title: '删除会话',
          message: `确定删除会话「${session.name}」吗？`,
          okText: '删除',
          danger: true
        })) && deleteSession(session.id)
    }
  ]

  return (
    <div
      onDoubleClick={() => openTab(session)}
      onContextMenu={(e) => openMenu(e, items())}
      title="双击连接"
      className="group flex cursor-default items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-fg/[0.05]"
    >
      <Avatar name={session.name} online={online} size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] leading-tight text-fg">{session.name}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] leading-tight text-dim">
          {session.username}@{session.host}
        </div>
      </div>
      <button
        onClick={(e) => openMenuAt(e.currentTarget, items())}
        onDoubleClick={(e) => e.stopPropagation()}
        className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}
