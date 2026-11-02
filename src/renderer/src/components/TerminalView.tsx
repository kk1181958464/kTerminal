import '@xterm/xterm/css/xterm.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import {
  AlertTriangle,
  ClipboardPaste,
  Copy,
  Eraser,
  FolderOpen,
  KeyRound,
  Loader2,
  RotateCw,
  TextSelect
} from 'lucide-react'
import type { Session } from '../../../shared/types'
import { toSessionInput, useStore, type Tab } from '../store'
import { terminalFontFamily, useSettings } from '../settings'
import { termColors, terminalTheme } from '../theme'
import { FilePanel } from './FilePanel'

const spring = { type: 'spring', stiffness: 380, damping: 38 } as const

export function TerminalView({ tab, active }: { tab: Tab; active: boolean }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const session = useStore((s) => s.sessions.find((x) => x.id === tab.sessionId))
  const updateTab = useStore((s) => s.updateTab)
  const closeTab = useStore((s) => s.closeTab)
  const saveSession = useStore((s) => s.saveSession)
  const openDialog = useStore((s) => s.openDialog)
  const filePanelHeight = useStore((s) => s.filePanelHeight)
  const setFilePanelHeight = useStore((s) => s.setFilePanelHeight)
  const filePanelWidth = useStore((s) => s.filePanelWidth)
  const setFilePanelWidth = useStore((s) => s.setFilePanelWidth)
  const settings = useSettings()
  const fontsVersion = useStore((s) => s.fontsVersion)
  const termTheme = useMemo(
    () => terminalTheme(settings.theme, settings.accent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.theme, settings.accent, settings.customSchemes, settings.termForeground]
  )
  const right = settings.filePanelPosition === 'right'
  const [dragSize, setDragSize] = useState<number | null>(null)
  const panelSize = dragSize ?? (right ? filePanelWidth : filePanelHeight)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const start = right ? e.clientX : e.clientY
    const startSize = panelSize
    const root = rootRef.current!
    // Always leave the terminal a usable area.
    const max = right ? root.clientWidth - 380 : root.clientHeight - 160
    const min = right ? 300 : 180
    let latest = startSize
    const onMove = (ev: MouseEvent): void => {
      const delta = start - (right ? ev.clientX : ev.clientY)
      latest = Math.round(Math.max(min, Math.min(max, startSize + delta)))
      setDragSize(latest)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      if (right) setFilePanelWidth(latest)
      else setFilePanelHeight(latest)
      setDragSize(null)
    }
    document.body.style.cursor = right ? 'col-resize' : 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const connect = async (secret?: string, remember = false): Promise<void> => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    if (!session) {
      updateTab(tab.id, { status: 'error', error: '会话不存在或已被删除' })
      return
    }
    updateTab(tab.id, { status: 'connecting', error: undefined })
    fit.fit()
    term.write(`\x1b[2m正在连接 ${session.username}@${session.host}:${session.port} ...\x1b[0m\r\n`)
    const res = await window.api.ssh.connect(tab.id, session.id, term.cols, term.rows, secret)
    if (res.ok) {
      updateTab(tab.id, { status: 'connected', cols: term.cols, rows: term.rows })
      if (remember && secret) saveSession({ ...toSessionInput(session), secret })
      term.focus()
    } else {
      updateTab(tab.id, { status: res.needAuth ? 'auth' : 'error', error: res.error })
    }
  }

  useEffect(() => {
    const s = useSettings.getState()
    const term = new Terminal({
      fontFamily: terminalFontFamily(s.fontFamily),
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorStyle: s.cursorStyle,
      cursorBlink: s.cursorBlink,
      scrollback: s.scrollback,
      allowTransparency: true,
      theme: terminalTheme(s.theme, s.accent)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current!)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // Falls back to the DOM renderer.
    }
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const copy = (): void => {
      if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection())
    }
    const paste = (): void => {
      navigator.clipboard.readText().then((text) => term.paste(text))
    }

    // Ctrl+Shift+C / Ctrl+Shift+V copy & paste; plain Ctrl+C still sends SIGINT.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true
      if (e.code === 'KeyC') {
        copy()
        return false
      }
      if (e.code === 'KeyV') {
        paste()
        return false
      }
      return true
    })
    term.onSelectionChange(() => {
      if (useSettings.getState().copyOnSelect) copy()
    })

    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      if (useSettings.getState().rightClickPaste) {
        // Xshell/PuTTY style: copy when there is a selection, otherwise paste.
        if (term.hasSelection()) {
          copy()
          term.clearSelection()
        } else paste()
        return
      }
      const filesOpen = useStore.getState().tabs.find((t) => t.id === tab.id)?.filesOpen
      useStore.setState({
        menu: {
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: '复制', icon: Copy, hint: 'Ctrl+Shift+C', disabled: !term.hasSelection(), onClick: copy },
            { label: '粘贴', icon: ClipboardPaste, hint: 'Ctrl+Shift+V', onClick: paste },
            { label: '全选', icon: TextSelect, onClick: () => term.selectAll() },
            { label: '清屏', icon: Eraser, onClick: () => term.clear() },
            'sep',
            {
              label: filesOpen ? '隐藏文件面板' : '显示文件面板',
              icon: FolderOpen,
              onClick: () => updateTab(tab.id, { filesOpen: !filesOpen })
            }
          ]
        }
      })
    }
    containerRef.current!.addEventListener('contextmenu', onContextMenu)

    term.onData((data) => window.api.ssh.write(tab.id, data))
    term.onResize(({ cols, rows }) => {
      window.api.ssh.resize(tab.id, cols, rows)
      updateTab(tab.id, { cols, rows })
    })
    const offData = window.api.ssh.onData((id, data) => id === tab.id && term.write(data))
    const offClosed = window.api.ssh.onClosed((id, reason) => {
      if (id !== tab.id) return
      term.write('\r\n\x1b[2m—— 连接已断开 ——\x1b[0m\r\n')
      updateTab(tab.id, { status: 'closed', error: reason })
    })
    // Refit only once the size settles: refitting on every frame of a panel animation
    // re-renders the canvas and resizes the remote PTY each time, which flickers.
    let fitTimer: number | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(fitTimer)
      fitTimer = window.setTimeout(() => {
        if (!containerRef.current?.clientWidth) return
        // Re-wrapping lines on a width change can leave the viewport mid-row; stay pinned to the prompt.
        const buffer = term.buffer.active
        const atBottom = buffer.viewportY >= buffer.baseY
        fit.fit()
        if (atBottom) term.scrollToBottom()
      }, 120)
    })
    observer.observe(containerRef.current!)

    if (session?.authType === 'password' && !session.hasSecret) {
      updateTab(tab.id, { status: 'auth' })
    } else {
      connect()
    }

    const container = containerRef.current!
    return () => {
      clearTimeout(fitTimer)
      observer.disconnect()
      container.removeEventListener('contextmenu', onContextMenu)
      offData()
      offClosed()
      window.api.ssh.close(tab.id)
      window.api.edit.release(tab.id)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // Live-apply appearance settings.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = termTheme
    // Toggling forces xterm to re-measure glyphs once a custom font has loaded.
    term.options.fontFamily = 'monospace'
    term.options.fontFamily = terminalFontFamily(settings.fontFamily)
    term.options.fontSize = settings.fontSize
    term.options.lineHeight = settings.lineHeight
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    term.options.scrollback = settings.scrollback
    fitRef.current?.fit()
  }, [
    termTheme,
    fontsVersion,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.scrollback
  ])

  // "system" theme can flip while the app runs.
  useEffect(() => {
    if (settings.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => {
      if (termRef.current) termRef.current.options.theme = terminalTheme('system', settings.accent)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [settings.theme, settings.accent])

  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      fitRef.current?.fit()
      // Don't steal focus from the password prompt / error overlay.
      if (tab.status === 'connected' || tab.status === 'closed') termRef.current?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <motion.div
      ref={rootRef}
      initial={false}
      animate={
        active
          ? { opacity: 1, visibility: 'visible' }
          : { opacity: 0, transitionEnd: { visibility: 'hidden' } }
      }
      transition={{ duration: 0.16 }}
      className={clsx('absolute inset-0 flex pr-2 pb-2', right ? 'flex-row' : 'flex-col')}
    >
      <div
        className="surface relative min-h-[120px] min-w-[240px] flex-1 overflow-hidden"
        style={{ background: termColors(settings.theme, settings.accent).background }}
      >
        {/* Padding lives on the wrapper: FitAddon measures the parent's border-box height, so
            padding on the parent itself would be counted as space and clip the last row. */}
        <div className="absolute inset-0 py-2.5 pl-3.5">
          <div ref={containerRef} className="h-full w-full" />
        </div>

        <AnimatePresence>
          {tab.status === 'connecting' && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-card/95 px-3.5 py-1.5 text-xs text-dim shadow-lg backdrop-blur"
            >
              <Loader2 size={13} className="animate-spin text-accent" />
              正在连接…
            </motion.div>
          )}
          {tab.status === 'closed' && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={spring}
              className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-card/95 py-1 pr-1 pl-4 text-xs text-dim shadow-xl backdrop-blur"
            >
              连接已断开{tab.error ? `：${tab.error}` : ''}
              <button onClick={() => connect()} className="btn btn-primary h-7 rounded-full px-3 text-xs">
                <RotateCw size={12} />
                重新连接
              </button>
            </motion.div>
          )}
          {tab.status === 'auth' && session && (
            <AuthOverlay
              key="auth"
              session={session}
              error={tab.error}
              onSubmit={connect}
              onCancel={() => closeTab(tab.id)}
            />
          )}
          {tab.status === 'error' && (
            <Overlay key="error">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-err/10 text-err">
                <AlertTriangle size={19} />
              </div>
              <h3 className="text-[15px] font-medium">连接失败</h3>
              <p className="mt-1.5 text-[13px] break-all text-dim">{tab.error}</p>
              <div className="mt-6 flex gap-2">
                <button onClick={() => closeTab(tab.id)} className="btn btn-ghost flex-1">
                  关闭
                </button>
                {session && (
                  <button onClick={() => openDialog(session)} className="btn btn-ghost flex-1">
                    编辑会话
                  </button>
                )}
                <button onClick={() => connect()} className="btn btn-primary flex-1">
                  重试
                </button>
              </div>
            </Overlay>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {tab.filesOpen && (
          <motion.div
            key={settings.filePanelPosition}
            initial={right ? { width: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            animate={right ? { width: panelSize + 8, opacity: 1 } : { height: panelSize + 8, opacity: 1 }}
            exit={right ? { width: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={dragSize !== null ? { duration: 0 } : spring}
            className="relative shrink-0 overflow-hidden"
          >
            <div
              onMouseDown={startResize}
              title={right ? '拖动调整宽度' : '拖动调整高度'}
              className={clsx(
                'group absolute z-10 flex items-center justify-center',
                right ? 'inset-y-0 left-0 w-2 cursor-col-resize' : 'inset-x-0 top-0 h-2 cursor-row-resize'
              )}
            >
              <div
                className={clsx(
                  'rounded-full bg-fg/10 transition-colors group-hover:bg-accent/70',
                  right ? 'h-10 w-[3px]' : 'h-[3px] w-10'
                )}
              />
            </div>
            {/* Fixed-size content anchored to the far edge so it slides in instead of reflowing. */}
            <div
              style={right ? { width: panelSize } : { height: panelSize }}
              className={clsx('absolute', right ? 'inset-y-0 right-0' : 'inset-x-0 bottom-0')}
            >
              <FilePanel tab={tab} host={session?.host ?? ''} stacked={right} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  )
}

function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-10 grid place-items-center bg-term/75 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        transition={spring}
        className="w-[380px] rounded-2xl border border-line bg-card p-6 shadow-2xl"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function AuthOverlay({
  session,
  error,
  onSubmit,
  onCancel
}: {
  session: Session
  error?: string
  onSubmit: (secret: string, remember: boolean) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(true)
  const isKey = session.authType === 'key'
  const noun = isKey ? '密码短语' : '密码'

  return (
    <Overlay>
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent">
        <KeyRound size={19} />
      </div>
      <h3 className="text-[15px] font-medium">{isKey ? '输入私钥密码短语' : '输入密码'}</h3>
      <p className="mt-1 font-mono text-[12px] text-dim">
        {session.username}@{session.host}:{session.port}
      </p>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', x: [0, -6, 6, -3, 0] }}
            className="mt-3 text-[12.5px] text-err"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value, remember)
        }}
        className="mt-5"
      >
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={noun}
          className="input"
        />
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-dim">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-[var(--c-accent)]"
          />
          记住{noun}（使用系统加密保存）
        </label>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">
            取消
          </button>
          <button type="submit" className="btn btn-primary flex-1">
            连接
          </button>
        </div>
      </form>
    </Overlay>
  )
}
