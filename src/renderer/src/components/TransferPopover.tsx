import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ChevronDown, FolderOpen, Folder, RotateCw, X } from 'lucide-react'
import type { TransferTask } from '../../../shared/types'
import { useStore } from '../store'
import { formatDuration, formatSize } from '../format'

const statusText: Record<TransferTask['status'], string> = {
  queued: '等待中',
  running: '传输中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}

/** Floating transfer queue anchored above the status bar; it never takes layout space. */
export function TransferPopover(): React.JSX.Element {
  const open = useStore((s) => s.transfersOpen)
  const transfers = useStore((s) => s.transfers)
  const setOpen = useStore((s) => s.setTransfersOpen)
  const clear = useStore((s) => s.clearTransfers)
  const ref = useRef<HTMLDivElement>(null)
  const active = transfers.filter((t) => t.status === 'running' || t.status === 'queued').length
  const finished = transfers.length - active

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (ref.current?.contains(target) || target.closest('[data-transfer-toggle]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Capture phase: xterm stops mousedown propagation inside the terminal.
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
          style={{ transformOrigin: 'bottom right' }}
          className="fixed right-2 bottom-8 z-40 flex max-h-[min(440px,60vh)] w-[min(600px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-[0_20px_60px_-12px_rgb(0_0_0/0.5)]"
        >
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
            <span className="text-[13px] font-medium">传输队列</span>
            <span className="text-[11px] text-dim">
              {active ? `${active} 个进行中` : '无进行中的任务'}
            </span>
            <button
              disabled={!finished}
              onClick={clear}
              className="ml-auto cursor-pointer text-[11.5px] text-dim hover:text-fg disabled:pointer-events-none disabled:opacity-40"
            >
              清除已结束
            </button>
            <button onClick={() => setOpen(false)} className="icon-btn" title="收起 (Esc)">
              <ChevronDown size={15} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {transfers.length === 0 && (
              <p className="py-12 text-center text-xs text-dim/70">
                暂无传输任务 —— 在文件面板中双击、拖拽或右键即可上传下载
              </p>
            )}
            {[...transfers].reverse().map((t) => (
              <TransferRow key={t.id} task={t} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function TransferRow({ task }: { task: TransferTask }): React.JSX.Element {
  const upload = task.direction === 'upload'
  const percent = task.total ? Math.min(100, (task.transferred / task.total) * 100) : task.status === 'done' ? 100 : 0
  const eta = task.speed > 0 ? (task.total - task.transferred) / task.speed : 0
  const Icon = upload ? ArrowUp : ArrowDown

  return (
    <div className="group mx-2 grid grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_128px_56px] items-center gap-3 rounded-lg px-2 py-2 hover:bg-fg/[0.03]">
      <div
        className={clsx(
          'grid h-7 w-7 place-items-center rounded-lg',
          upload ? 'bg-accent/12 text-accent' : 'bg-ok/10 text-ok'
        )}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12.5px]">
          {task.isDir && <Folder size={12} className="shrink-0 text-folder" />}
          <span className="truncate">{task.name}</span>
        </div>
        <div className="truncate text-[11px] text-dim" title={`${task.source} → ${task.target}`}>
          {upload ? '上传至' : '下载至'} {task.targetDir}
        </div>
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
          <motion.div
            animate={{ width: `${percent}%` }}
            transition={{ ease: 'linear', duration: 0.2 }}
            className={clsx(
              'h-full rounded-full',
              task.status === 'error'
                ? 'bg-err'
                : task.status === 'canceled'
                  ? 'bg-dim/50'
                  : task.status === 'done'
                    ? 'bg-ok'
                    : 'bg-accent'
            )}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-dim tabular-nums">
          <span>
            {formatSize(task.transferred)} / {formatSize(task.total)}
          </span>
          <span>{percent.toFixed(0)}%</span>
        </div>
      </div>
      <div className="truncate text-[11.5px] tabular-nums">
        {task.status === 'running' && task.speed > 0 ? (
          <span className="text-fg">
            {formatSize(task.speed)}/s
            <span className="ml-1.5 text-dim">{formatDuration(eta)}</span>
          </span>
        ) : (
          <span
            title={task.error}
            className={clsx(
              task.status === 'error' ? 'text-err' : task.status === 'done' ? 'text-ok' : 'text-dim'
            )}
          >
            {statusText[task.status]}
            {task.error ? `：${task.error}` : ''}
          </span>
        )}
      </div>
      <div className="flex justify-end gap-0.5">
        {(task.status === 'running' || task.status === 'queued') && (
          <button title="取消" onClick={() => window.api.transfer.cancel(task.id)} className="icon-btn">
            <X size={14} />
          </button>
        )}
        {(task.status === 'error' || task.status === 'canceled') && (
          <button title="重试" onClick={() => window.api.transfer.retry(task.id)} className="icon-btn">
            <RotateCw size={13} />
          </button>
        )}
        {task.status === 'done' && !upload && (
          <button title="在资源管理器中显示" onClick={() => window.api.local.showInFolder(task.target)} className="icon-btn">
            <FolderOpen size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
