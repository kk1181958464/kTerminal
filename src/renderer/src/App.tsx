import { useEffect, useRef } from 'react'
import { MotionConfig } from 'framer-motion'
import { toast, useStore } from './store'
import { useSettings } from './settings'
import { applyTheme, resolveThemeId } from './theme'
import { loadCustomFonts } from './fonts'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Welcome } from './components/Welcome'
import { TerminalView } from './components/TerminalView'
import { SessionDialog } from './components/SessionDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { StatusBar } from './components/StatusBar'
import { Overlays } from './components/Overlays'
import { TransferPopover } from './components/TransferPopover'

function useTheme(): void {
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const schemes = useSettings((s) => s.customSchemes)
  const firstPaint = useRef(true)

  useEffect(() => {
    const apply = (): void =>
      applyTheme(resolveThemeId(theme), accent, !firstPaint.current && useSettings.getState().animations)
    apply()
    firstPaint.current = false
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, accent, schemes])
}

function App(): React.JSX.Element {
  const loadSessions = useStore((s) => s.loadSessions)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const upsertTransfer = useStore((s) => s.upsertTransfer)
  const animations = useSettings((s) => s.animations)

  useTheme()

  useEffect(() => {
    loadSessions()
    loadCustomFonts()
    window.api.pty.shells().then((localShells) => useStore.setState({ localShells }))
  }, [loadSessions])

  useEffect(() => window.api.transfer.onUpdate(upsertTransfer), [upsertTransfer])

  useEffect(() => {
    window.api.edit.getEditor().then((editor) => useStore.setState({ editor }))
    return window.api.edit.onSynced(({ tabId, remotePath, ok, error }) => {
      const name = remotePath.slice(remotePath.lastIndexOf('/') + 1)
      if (!ok) return toast(`${name} 上传失败：${error}`, 'error')
      toast(`已保存到服务器：${name}`, 'success')
      const dir = remotePath.slice(0, remotePath.lastIndexOf('/')) || '/'
      useStore.setState({ remoteChanged: { tabId, dir, at: Date.now() } })
    })
  }, [])

  useEffect(() => {
    // Capture phase so the shortcut works even while the terminal has focus.
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault()
        e.stopPropagation()
        useSettings.getState().setSettingsOpen(true)
      } else if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().openLocalTab()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <MotionConfig reducedMotion={animations ? 'never' : 'always'}>
      <div className="flex h-full flex-col bg-app text-fg">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1">
            {tabs.length === 0 && <Welcome />}
            {tabs.map((tab) => (
              <TerminalView key={tab.id} tab={tab} active={tab.id === activeTabId} />
            ))}
          </main>
        </div>
        <StatusBar />
        <TransferPopover />
        <SessionDialog />
        <SettingsDialog />
        <Overlays />
      </div>
    </MotionConfig>
  )
}

export default App
