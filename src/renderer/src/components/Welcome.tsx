import { motion, type Variants } from 'framer-motion'
import { ArrowRight, FolderSync, Monitor, Plus, ShieldCheck, TerminalSquare } from 'lucide-react'
import { useStore } from '../store'
import { Avatar } from './ui'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } }
}
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } }
}

const features = [
  { icon: TerminalSquare, title: '多标签终端', desc: '同时管理多个 SSH 会话' },
  { icon: FolderSync, title: '文件传输', desc: '双栏 SFTP，拖拽即传' },
  { icon: ShieldCheck, title: '安全存储', desc: '凭据经系统加密保存' }
]

const shortcuts: [string[], string][] = [
  [['Ctrl', 'Shift', 'C'], '复制'],
  [['Ctrl', 'Shift', 'V'], '粘贴'],
  [['Ctrl', ','], '打开设置'],
  [['Ctrl', 'Shift', 'T'], '本地终端'],
  [['双击会话'], '快速连接']
]

export function Welcome(): React.JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const openTab = useStore((s) => s.openTab)
  const openDialog = useStore((s) => s.openDialog)
  const openLocalTab = useStore((s) => s.openLocalTab)

  return (
    <div className="absolute inset-0 pr-2 pb-2">
      <div className="surface relative h-full overflow-y-auto">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              'radial-gradient(600px 220px at 50% 0%, color-mix(in srgb, var(--c-accent) 14%, transparent), transparent)'
          }}
        />
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative mx-auto flex max-w-2xl flex-col px-8 pt-[11vh] pb-12"
        >
          <motion.div variants={item} className="flex items-center gap-4">
            <div
              className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-fg"
              style={{ boxShadow: '0 10px 40px -8px color-mix(in srgb, var(--c-accent) 60%, transparent)' }}
            >
              <TerminalSquare size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">欢迎使用 kTerminal</h1>
              <p className="mt-1 text-[13px] text-dim">SSH 终端与 SFTP 文件传输，一个窗口搞定</p>
            </div>
          </motion.div>

          <motion.div variants={item} className="mt-8 flex gap-2">
            <button onClick={() => openDialog()} className="btn btn-primary h-10 px-5">
              <Plus size={16} />
              新建会话
            </button>
            <button onClick={() => openLocalTab()} className="btn btn-ghost h-10 px-5">
              <Monitor size={16} />
              本地终端
            </button>
          </motion.div>

          {sessions.length > 0 && (
            <motion.section variants={item} className="mt-10">
              <h2 className="mb-3 text-xs font-medium text-dim">最近会话</h2>
              <div className="grid grid-cols-2 gap-2">
                {sessions.slice(0, 6).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openTab(s)}
                    className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel/50 p-3 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-accent/40 hover:bg-panel"
                  >
                    <Avatar name={s.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{s.name}</div>
                      <div className="truncate font-mono text-[11px] text-dim">
                        {s.username}@{s.host}
                      </div>
                    </div>
                    <ArrowRight
                      size={15}
                      className="-translate-x-1 text-accent opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          <motion.section variants={item} className="mt-10 grid grid-cols-3 gap-2">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-line/70 p-4">
                <Icon size={17} className="mb-3 text-accent" />
                <div className="text-[13px]">{title}</div>
                <div className="mt-0.5 text-[11.5px] text-dim">{desc}</div>
              </div>
            ))}
          </motion.section>

          <motion.section variants={item} className="mt-10">
            <h2 className="mb-3 text-xs font-medium text-dim">快捷键</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              {shortcuts.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-dim">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="kbd">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        </motion.div>
      </div>
    </div>
  )
}
