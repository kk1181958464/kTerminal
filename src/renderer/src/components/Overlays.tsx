import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useStore } from '../store'

/** Global context menu, confirm/prompt modal and toasts. */
export function Overlays(): React.JSX.Element {
  return (
    <>
      <ContextMenu />
      <Modal />
      <Toasts />
    </>
  )
}

function ContextMenu(): React.JSX.Element | null {
  const menu = useStore((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    setPos({
      x: Math.min(menu.x, window.innerWidth - w - 8),
      y: Math.min(menu.y, window.innerHeight - h - 8)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (): void => useStore.setState({ menu: null })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!menu) return null
  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-[180px] rounded-xl border border-line bg-card p-1 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.45)]"
    >
      {menu.items.map((item, i) =>
        item === 'sep' ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              useStore.setState({ menu: null })
              item.onClick()
            }}
            className={clsx(
              'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition disabled:pointer-events-none disabled:opacity-40',
              item.danger ? 'text-err hover:bg-err/10' : 'text-fg hover:bg-fg/[0.07]',
              item.active && 'bg-accent/12 text-accent'
            )}
          >
            {item.icon && <item.icon size={14} />}
            {item.label}
            {item.hint && <span className="ml-auto pl-6 text-[11px] text-dim">{item.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}

function Modal(): React.JSX.Element {
  const modal = useStore((s) => s.modal)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (modal?.kind === 'prompt') setValue(modal.defaultValue ?? '')
  }, [modal])

  const finish = (ok: boolean): void => {
    if (!modal) return
    if (modal.kind === 'confirm') modal.resolve(ok)
    else modal.resolve(ok && value.trim() ? value.trim() : null)
    useStore.setState({ modal: null })
  }

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && finish(false)}
          className="fixed inset-0 z-[55] grid place-items-center bg-black/50 backdrop-blur-sm"
        >
          <motion.form
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              finish(true)
            }}
            onKeyDown={(e) => e.key === 'Escape' && finish(false)}
            className="w-[400px] rounded-2xl border border-line bg-card p-6 shadow-2xl"
          >
            <h3 className="text-[15px] font-medium">{modal.title}</h3>
            {modal.kind === 'confirm' && modal.message && (
              <p className="mt-2 text-[13px] leading-relaxed break-all whitespace-pre-line text-dim">{modal.message}</p>
            )}
            {modal.kind === 'prompt' && (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => {
                  // Select the name without its extension, like Explorer.
                  const dot = e.target.value.lastIndexOf('.')
                  e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
                }}
                placeholder={modal.placeholder}
                className="input mt-4"
              />
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => finish(false)} className="btn btn-ghost">
                取消
              </button>
              <button
                type="submit"
                autoFocus={modal.kind === 'confirm'}
                className={clsx(
                  'btn',
                  modal.kind === 'confirm' && modal.danger ? 'btn-danger' : 'btn-primary'
                )}
              >
                {modal.okText ?? '确定'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const toastIcon = {
  error: <AlertCircle size={15} className="text-err" />,
  success: <CheckCircle2 size={15} className="text-ok" />,
  info: <Info size={15} className="text-accent" />
}

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed top-14 right-4 z-[70] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="flex max-w-[360px] items-center gap-2.5 rounded-xl border border-line bg-card px-4 py-2.5 text-[12.5px] shadow-[0_12px_32px_-8px_rgb(0_0_0/0.4)]"
          >
            {toastIcon[t.kind]}
            <span className="break-all">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
