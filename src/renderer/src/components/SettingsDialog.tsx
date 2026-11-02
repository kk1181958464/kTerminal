import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ChevronDown,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  FileType,
  FolderSync,
  Pencil,
  Trash2,
  Info,
  Minus,
  Monitor,
  FolderOpen,
  Palette,
  PanelBottom,
  Pipette,
  PanelRight,
  RotateCcw,
  TerminalSquare,
  X,
  Plus,
  Square,
  Underline,
  TextCursor
} from 'lucide-react'
import { confirmDialog, toast, useStore } from '../store'
import { terminalFontFamily, useSettings, type CursorStyle, type FilePanelPosition } from '../settings'
import {
  accentPresets,
  contrastRatio,
  fromWindowsTerminal,
  resolveThemeId,
  termColors,
  themes,
  toWindowsTerminal,
  type CustomScheme,
  type TermColors,
  type ThemeId
} from '../theme'
import { importCustomFonts, removeCustomFont } from '../fonts'
import { commandRule, highlightRules } from '../highlight'
import { defaultHighlight, type HighlightRuleKey } from '../settings'
import { promptDialog } from '../store'
import { Segmented, Switch } from './ui'

type Section = 'appearance' | 'terminal' | 'files' | 'about'

const sections: { id: Section; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'files', label: '文件传输', icon: FolderSync },
  { id: 'about', label: '关于', icon: Info }
]

const fontCandidates = [
  'Cascadia Mono',
  'Cascadia Code',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Consolas',
  'Hack',
  'Ubuntu Mono',
  'Sarasa Mono SC',
  'Maple Mono',
  'MesloLGS NF',
  'Lucida Console',
  'Courier New'
]

/** Detects installed fonts by comparing rendered width against generic fallbacks. */
function installedFonts(): string[] {
  const ctx = document.createElement('canvas').getContext('2d')!
  const sample = 'mmmmmmmmmmlli1WQ@#'
  const width = (font: string): number => {
    ctx.font = `32px ${font}`
    return ctx.measureText(sample).width
  }
  const baseMono = width('monospace')
  const baseSerif = width('serif')
  return fontCandidates.filter(
    (f) => width(`"${f}", monospace`) !== baseMono || width(`"${f}", serif`) !== baseSerif
  )
}

export function SettingsDialog(): React.JSX.Element {
  const open = useSettings((s) => s.settingsOpen)
  const setOpen = useSettings((s) => s.setSettingsOpen)
  const [section, setSection] = useState<Section>('appearance')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="flex h-[min(600px,86vh)] w-[min(820px,92vw)] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_80px_-16px_rgb(0_0_0/0.55)]"
          >
            <nav className="flex w-[188px] shrink-0 flex-col border-r border-line bg-panel/50 p-3">
              <div className="px-2 pt-1 pb-4 text-[15px] font-semibold">设置</div>
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={clsx(
                    'relative mb-0.5 flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
                    section === id ? 'text-fg' : 'text-dim hover:text-fg'
                  )}
                >
                  {section === id && (
                    <motion.span
                      layoutId="settings-nav"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      className="absolute inset-0 rounded-lg bg-fg/[0.07]"
                    />
                  )}
                  <Icon size={15} className="relative" />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </nav>

            <div className="relative flex min-w-0 flex-1 flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between px-7">
                <h2 className="text-[15px] font-medium">
                  {sections.find((s) => s.id === section)?.label}
                </h2>
                <button onClick={() => setOpen(false)} className="icon-btn">
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={section}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.14 }}
                  >
                    {section === 'appearance' && <AppearanceSection />}
                    {section === 'terminal' && <TerminalSection />}
                    {section === 'files' && <FilesSection />}
                    {section === 'about' && <AboutSection />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Group({ title, children }: { title?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="mb-7">
      {title && <h3 className="mb-3 text-xs font-medium text-dim">{title}</h3>}
      {children}
    </section>
  )
}

function Row({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/70 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px]">{title}</div>
        {desc && <div className="mt-0.5 text-[11.5px] text-dim">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ThemePreview({ theme }: { theme: string }): React.JSX.Element {
  const t = themes[resolveThemeId(theme)]
  const c = termColors(theme, null, false)
  // Glass themes are previewed over a colorful backdrop to show the translucency.
  const backdrop = t.material
    ? `linear-gradient(${t.ui.app}, ${t.ui.app}), linear-gradient(135deg, #ff9ab3, #8fb0ff 50%, #7fe3c6)`
    : t.ui.app
  return (
    <div className="flex h-full w-full" style={{ background: backdrop }}>
      <div className="w-[28%] space-y-1.5 p-2">
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.ui.line }} />
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.ui.line }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: t.ui.accent, opacity: 0.8 }} />
      </div>
      <div
        className="m-1.5 ml-0 flex-1 space-y-[3px] rounded-md p-2 font-mono text-[7.5px] leading-none"
        style={{ background: c.background, color: c.foreground, border: `1px solid ${t.ui.line}` }}
      >
        <div>
          <span style={{ color: c.ansi[2] }}>root@srv</span>:<span style={{ color: c.ansi[4] }}>~</span>$ ls
        </div>
        <div>
          <span style={{ color: c.ansi[4] }}>app</span> <span style={{ color: c.ansi[1] }}>err.log</span>{' '}
          <span style={{ color: c.ansi[3] }}>run.sh</span>
        </div>
        <div className="flex items-center gap-0.5">
          $ <span className="inline-block h-[7px] w-[4px]" style={{ background: c.cursor }} />
        </div>
      </div>
    </div>
  )
}

function ThemeCard({
  selected,
  label,
  onClick,
  actions,
  children
}: {
  selected: boolean
  label: string
  onClick: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={clsx(
        'group relative cursor-pointer rounded-xl border p-1.5 text-left outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5',
        selected
          ? 'border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]'
          : 'border-line hover:border-fg/20 focus-visible:border-accent'
      )}
    >
      <div className="h-[74px] overflow-hidden rounded-lg">{children}</div>
      <div className="flex items-center justify-between gap-2 px-1 pt-2 pb-0.5 text-[12px]">
        <span className={clsx('truncate', selected ? 'text-fg' : 'text-dim group-hover:text-fg')}>{label}</span>
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-accent-fg"
          >
            <Check size={10} strokeWidth={3} />
          </motion.span>
        )}
      </div>
      {actions && (
        <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}

function CardAction({
  title,
  onClick,
  children,
  danger
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}): React.JSX.Element {
  return (
    <span
      role="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={clsx(
        'grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-line bg-card/95 shadow-sm transition-colors',
        danger ? 'text-err hover:bg-err/10' : 'text-dim hover:text-fg'
      )}
    >
      {children}
    </span>
  )
}

function AppearanceSection(): React.JSX.Element {
  const s = useSettings()
  const [editing, setEditing] = useState<string | null>(null)
  const resolved = themes[resolveThemeId(s.theme)]

  if (editing && s.customSchemes.some((c) => c.id === editing))
    return <SchemeEditor id={editing} onBack={() => setEditing(null)} />

  const createScheme = (): void => {
    const id = crypto.randomUUID().slice(0, 8)
    const scheme: CustomScheme = {
      id,
      name: `我的配色 ${s.customSchemes.length + 1}`,
      base: resolveThemeId(s.theme),
      colors: { ...termColors(s.theme, s.accent, false), ansi: [...termColors(s.theme, s.accent, false).ansi] }
    }
    s.set({ customSchemes: [...s.customSchemes, scheme], theme: `custom:${id}` })
    setEditing(id)
  }

  return (
    <>
      <Group title="主题">
        <div className="grid grid-cols-3 gap-3">
          <ThemeCard selected={s.theme === 'system'} label="跟随系统" onClick={() => s.set({ theme: 'system' })}>
            <div className="relative h-full">
              <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}>
                <ThemePreview theme="graphite" />
              </div>
              <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
                <ThemePreview theme="github-light" />
              </div>
              <Monitor size={16} className="absolute right-2 bottom-2 text-[#656d76]" />
            </div>
          </ThemeCard>
          {(Object.keys(themes) as ThemeId[]).map((id) => (
            <ThemeCard key={id} selected={s.theme === id} label={themes[id].name} onClick={() => s.set({ theme: id })}>
              <ThemePreview theme={id} />
            </ThemeCard>
          ))}
        </div>
      </Group>

      <Group title="自定义配色">
        <div className="grid grid-cols-3 gap-3">
          {s.customSchemes.map((c) => (
            <ThemeCard
              key={c.id}
              selected={s.theme === `custom:${c.id}`}
              label={c.name}
              onClick={() => s.set({ theme: `custom:${c.id}` })}
              actions={
                <CardAction title="编辑" onClick={() => setEditing(c.id)}>
                  <Pencil size={12} />
                </CardAction>
              }
            >
              <ThemePreview theme={`custom:${c.id}`} />
            </ThemeCard>
          ))}
          <button
            onClick={createScheme}
            className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-dim transition-colors hover:border-accent/60 hover:bg-accent/[0.04] hover:text-accent"
          >
            <Plus size={18} />
            <span className="text-[12px]">新建配色</span>
            <span className="text-[10.5px] opacity-70">以当前主题为起点</span>
          </button>
        </div>
      </Group>

      <Group title="强调色">
        <div className="flex flex-wrap items-center gap-2.5">
          {[null, ...accentPresets].map((color) => {
            const selected = s.accent === color
            const shown = color ?? resolved.ui.accent
            return (
              <button
                key={color ?? 'default'}
                title={color ? color : '主题默认'}
                onClick={() => s.set({ accent: color })}
                style={{ background: shown, boxShadow: selected ? `0 0 0 2px var(--c-card), 0 0 0 4px ${shown}` : undefined }}
                className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110"
              >
                {selected && <Check size={13} strokeWidth={3} className="text-white drop-shadow" />}
                {color === null && !selected && (
                  <span className="text-[9px] font-semibold text-white/90">默认</span>
                )}
              </button>
            )
          })}
        </div>
      </Group>

      <TermForegroundGroup />

      <Group title="界面">
        <Row title="界面动画" desc="关闭后所有过渡动画将立即完成">
          <Switch checked={s.animations} onChange={(v) => s.set({ animations: v })} />
        </Row>
        <Row title="显示侧边栏" desc="也可点击左上角按钮切换">
          <Switch checked={!s.sidebarCollapsed} onChange={(v) => s.set({ sidebarCollapsed: !v })} />
        </Row>
        <CloseToTrayRow />
      </Group>
    </>
  )
}

const foregroundPresets = ['#f2f2f2', '#9fe870', '#ffcf6b', '#7fd4ff', '#c8b6ff', '#ffadc6']

function TermForegroundGroup(): React.JSX.Element {
  const s = useSettings()
  const base = termColors(s.theme, s.accent, false)
  const current = s.termForeground ?? base.foreground
  const ratio = contrastRatio(current, base.background.startsWith('rgba') ? themes[resolveThemeId(s.theme)].ui.term : base.background)
  const isCustom = s.termForeground !== null && !foregroundPresets.includes(s.termForeground)

  const swatch = (color: string, selected: boolean): React.CSSProperties => ({
    background: color,
    boxShadow: selected ? `0 0 0 2px var(--c-card), 0 0 0 4px ${color}` : 'inset 0 0 0 1px rgb(127 127 127 / 0.35)'
  })

  return (
    <Group title="终端文字颜色">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          title={`主题默认 ${base.foreground}`}
          onClick={() => s.set({ termForeground: null })}
          style={swatch(base.foreground, s.termForeground === null)}
          className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110"
        >
          <span className="text-[9px] font-semibold" style={{ color: base.background.startsWith('rgba') ? '#000' : base.background }}>
            默认
          </span>
        </button>
        {foregroundPresets.map((color) => (
          <button
            key={color}
            title={color}
            onClick={() => s.set({ termForeground: color })}
            style={swatch(color, s.termForeground === color)}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110"
          >
            {s.termForeground === color && <Check size={13} strokeWidth={3} className="text-black/70" />}
          </button>
        ))}
        <label
          title="自定义颜色"
          style={isCustom ? swatch(s.termForeground!, true) : undefined}
          className={clsx(
            'relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full transition-transform hover:scale-110',
            !isCustom && 'border border-dashed border-fg/30 text-dim hover:text-fg'
          )}
        >
          <Pipette size={13} className={isCustom ? 'text-black/70' : ''} />
          <input
            type="color"
            value={current.startsWith('#') ? current.slice(0, 7) : '#ffffff'}
            onChange={(e) => s.set({ termForeground: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <span className="ml-1 font-mono text-[11.5px] text-dim">{current}</span>
      </div>
      {ratio < 3 && (
        <p className="mt-2.5 text-[11.5px] text-warn">
          当前颜色与终端背景对比度较低（{ratio.toFixed(1)}:1），文字可能看不清
        </p>
      )}
    </Group>
  )
}

function CloseToTrayRow(): React.JSX.Element {
  const [value, setValue] = useState(false)
  useEffect(() => {
    window.api.window.getCloseToTray().then(setValue)
  }, [])
  return (
    <Row title="关闭窗口时最小化到托盘" desc="SSH 连接保持在后台，可从托盘图标恢复或退出">
      <Switch
        checked={value}
        onChange={(v) => {
          setValue(v)
          window.api.window.setCloseToTray(v)
        }}
      />
    </Row>
  )
}

const ansiNames = ['黑', '红', '绿', '黄', '蓝', '品红', '青', '白']

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel/40 p-1.5 pr-2 transition-colors focus-within:border-accent/60">
      <label
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-fg/10 shadow-inner"
        style={{ background: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10.5px] leading-tight text-dim">{label}</div>
        <input
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase())
          }}
          onBlur={() => setText(value)}
          className="w-full bg-transparent font-mono text-[12px] leading-tight outline-none"
        />
      </div>
    </div>
  )
}

function SchemeEditor({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const s = useSettings()
  const scheme = s.customSchemes.find((c) => c.id === id)!
  const active = s.theme === `custom:${id}`
  const c = scheme.colors
  const ui = themes[scheme.base].ui

  const update = (patch: Partial<CustomScheme>): void =>
    s.set({
      customSchemes: useSettings.getState().customSchemes.map((x) => (x.id === id ? { ...x, ...patch } : x))
    })
  const setColor = (key: keyof Omit<TermColors, 'ansi'>, value: string): void =>
    update({ colors: { ...c, [key]: value } })
  const setAnsi = (i: number, value: string): void => {
    const ansi = [...c.ansi]
    ansi[i] = value
    update({ colors: { ...c, ansi } })
  }

  const importClipboard = async (): Promise<void> => {
    const parsed = fromWindowsTerminal(await navigator.clipboard.readText())
    if (!parsed) return toast('剪贴板中没有有效的 Windows Terminal 配色 JSON', 'error')
    update({ colors: parsed.colors, ...(parsed.name ? { name: parsed.name } : {}) })
    toast('已导入配色', 'success')
  }
  const exportClipboard = async (): Promise<void> => {
    await navigator.clipboard.writeText(toWindowsTerminal(scheme.name, c))
    toast('已复制 Windows Terminal 格式的配色 JSON', 'success')
  }
  const rename = async (): Promise<void> => {
    const name = await promptDialog({ title: '重命名配色', defaultValue: scheme.name, okText: '确定' })
    if (name) update({ name })
  }
  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({ title: '删除配色？', message: `「${scheme.name}」将被删除。`, okText: '删除', danger: true })
    if (!ok) return
    s.set({
      customSchemes: s.customSchemes.filter((x) => x.id !== id),
      ...(active ? { theme: scheme.base } : {})
    })
    onBack()
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <button onClick={onBack} className="icon-btn" title="返回">
          <ArrowLeft size={16} />
        </button>
        <button
          onClick={rename}
          title="点击重命名"
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[14px] font-medium hover:bg-fg/[0.06]"
        >
          <span className="truncate">{scheme.name}</span>
          <Pencil size={12} className="shrink-0 text-dim" />
        </button>
        {active ? (
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] text-accent">使用中</span>
        ) : (
          <button onClick={() => s.set({ theme: `custom:${id}` })} className="btn btn-primary h-7 px-3 text-xs">
            使用
          </button>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={importClipboard} title="从剪贴板导入 Windows Terminal 配色 JSON" className="btn btn-ghost h-7 px-2.5 text-xs">
            <ClipboardPaste size={13} />
            导入
          </button>
          <button onClick={exportClipboard} title="复制为 Windows Terminal 配色 JSON" className="btn btn-ghost h-7 px-2.5 text-xs">
            <ClipboardCopy size={13} />
            导出
          </button>
          <button onClick={remove} title="删除配色" className="icon-btn h-7 w-7 hover:!text-err">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div
        className="mb-6 overflow-hidden rounded-xl border p-4 font-mono text-[13px] leading-[1.55]"
        style={{ background: c.background, color: c.foreground, borderColor: ui.line, fontFamily: terminalFontFamily(s.fontFamily) }}
      >
        <div>
          <span style={{ color: c.ansi[2] }}>ubuntu@server</span>:<span style={{ color: c.ansi[4] }}>~/app</span>$ ls -la
        </div>
        <div>
          <span style={{ color: c.ansi[12] }}>src</span>  <span style={{ color: c.ansi[10] }}>deploy.sh</span>{'  '}
          <span style={{ color: c.ansi[1] }}>error.log</span>  <span style={{ color: c.ansi[3] }}>config.yml</span>{'  '}
          <span style={{ color: c.ansi[5] }}>logo.png</span>  <span style={{ color: c.ansi[6] }}>link →</span>
        </div>
        <div>
          <span style={{ background: c.selection + '55' }}>这一行模拟选中的文本 selected text</span>
        </div>
        <div className="mt-2 flex gap-1">
          {c.ansi.map((color, i) => (
            <span key={i} className="h-4 flex-1 rounded-sm" style={{ background: color }} title={`${i}`} />
          ))}
        </div>
        <div className="mt-2 flex items-center">
          <span style={{ color: c.ansi[2] }}>ubuntu@server</span>:<span style={{ color: c.ansi[4] }}>~/app</span>$&nbsp;
          <span className="inline-block h-[1.1em] w-[0.6em]" style={{ background: c.cursor }} />
        </div>
      </div>

      <Group title="界面框架">
        <Row title="基于主题" desc="决定窗口、侧边栏、文件面板等界面的颜色">
          <select
            value={scheme.base}
            onChange={(e) => update({ base: e.target.value as ThemeId })}
            className="input h-8 w-44 cursor-pointer"
          >
            {(Object.keys(themes) as ThemeId[]).map((t) => (
              <option key={t} value={t}>
                {themes[t].name}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="基础颜色">
        <div className="grid grid-cols-4 gap-2">
          <ColorField label="背景" value={c.background} onChange={(v) => setColor('background', v)} />
          <ColorField label="前景（文字）" value={c.foreground} onChange={(v) => setColor('foreground', v)} />
          <ColorField label="光标" value={c.cursor} onChange={(v) => setColor('cursor', v)} />
          <ColorField label="选中背景" value={c.selection} onChange={(v) => setColor('selection', v)} />
        </div>
      </Group>
      <Group title="标准颜色">
        <div className="grid grid-cols-4 gap-2">
          {ansiNames.map((n, i) => (
            <ColorField key={i} label={n} value={c.ansi[i]} onChange={(v) => setAnsi(i, v)} />
          ))}
        </div>
      </Group>
      <Group title="高亮颜色">
        <div className="grid grid-cols-4 gap-2">
          {ansiNames.map((n, i) => (
            <ColorField key={i} label={`亮${n}`} value={c.ansi[i + 8]} onChange={(v) => setAnsi(i + 8, v)} />
          ))}
        </div>
      </Group>
    </>
  )
}

function Stepper({
  value,
  min,
  max,
  step,
  format,
  onChange
}: {
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}): React.JSX.Element {
  const clamp = (v: number): number => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
      <div className="flex items-center rounded-lg border border-line bg-panel">
        <button onClick={() => onChange(clamp(value - step))} className="icon-btn h-7 w-7">
          <Minus size={12} />
        </button>
        <span className="w-10 text-center text-[12px] tabular-nums">{format ? format(value) : value}</span>
        <button onClick={() => onChange(clamp(value + step))} className="icon-btn h-7 w-7">
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

function TerminalSection(): React.JSX.Element {
  const s = useSettings()
  const customFonts = useStore((st) => st.customFonts)
  const [fonts] = useState(installedFonts)
  const t = termColors(s.theme, s.accent)
  const accent = t.cursor
  const customFamilies = customFonts.map((f) => f.family)
  const systemFonts = fonts.filter((f) => !customFamilies.includes(f))
  const known = [...customFamilies, ...systemFonts]

  const onFontChange = async (value: string): Promise<void> => {
    if (value !== '__other__') return s.set({ fontFamily: value })
    const name = await promptDialog({ title: '输入字体名称', placeholder: '例如 Microsoft YaHei Mono', okText: '使用' })
    if (name) s.set({ fontFamily: name })
  }
  const importFonts = async (): Promise<void> => {
    const added = await importCustomFonts()
    if (!added.length) return
    s.set({ fontFamily: added[0].family })
    toast(`已导入 ${added.map((f) => f.family).join('、')}`, 'success')
  }

  return (
    <>
      <div
        className="mb-7 overflow-hidden rounded-xl border border-line p-4"
        style={{
          background: t.background,
          color: t.foreground,
          fontFamily: terminalFontFamily(s.fontFamily),
          fontSize: s.fontSize,
          lineHeight: s.lineHeight
        }}
      >
        <div>
          <span style={{ color: t.ansi[2] }}>ubuntu@server</span>:<span style={{ color: t.ansi[4] }}>~/app</span>$ git status
        </div>
        <div>
          On branch <span style={{ color: t.ansi[6] }}>main</span> · 修改: <span style={{ color: t.ansi[1] }}>config.yml</span>{' '}
          <span style={{ color: t.ansi[3] }}>⚠ 2 warnings</span>
        </div>
        <div className="flex items-center">
          <span style={{ color: t.ansi[2] }}>ubuntu@server</span>:<span style={{ color: t.ansi[4] }}>~/app</span>$&nbsp;
          <motion.span
            animate={s.cursorBlink ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
            transition={{ duration: 1.1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
            style={{
              background: s.cursorStyle === 'block' ? accent : 'transparent',
              borderLeft: s.cursorStyle === 'bar' ? `2px solid ${accent}` : undefined,
              borderBottom: s.cursorStyle === 'underline' ? `2px solid ${accent}` : undefined,
              width: '0.6em',
              height: '1.15em',
              display: 'inline-block'
            }}
          />
        </div>
      </div>

      <DefaultShellRow />

      <Group title="字体">
        <Row title="字体" desc="已导入的字体和本机已安装的等宽字体">
          <select
            value={s.fontFamily}
            onChange={(e) => onFontChange(e.target.value)}
            className="input h-8 w-52 cursor-pointer"
          >
            {!known.includes(s.fontFamily) && <option value={s.fontFamily}>{s.fontFamily}</option>}
            {customFamilies.length > 0 && (
              <optgroup label="已导入">
                {customFamilies.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="系统字体">
              {systemFonts.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
            <option value="__other__">输入其他字体名称…</option>
          </select>
        </Row>
        <Row title="导入字体文件" desc="支持 TTF / OTF / WOFF / WOFF2，导入后保存在本机">
          <button onClick={importFonts} className="btn btn-ghost h-8 px-3 text-xs">
            <FileType size={13} />
            选择文件…
          </button>
        </Row>
        {customFonts.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-2 pt-1 pb-3">
            {customFonts.map((f) => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border py-1 pr-1 pl-2.5 text-[12px]',
                  s.fontFamily === f.family ? 'border-accent/60 bg-accent/10' : 'border-line bg-panel/40'
                )}
              >
                <button
                  onClick={() => s.set({ fontFamily: f.family })}
                  className="cursor-pointer"
                  style={{ fontFamily: `"${f.family}"` }}
                  title="使用此字体"
                >
                  {f.family}
                </button>
                <button
                  title="删除字体"
                  onClick={async () => {
                    const ok = await confirmDialog({ title: '删除字体？', message: f.family, okText: '删除', danger: true })
                    if (!ok) return
                    await removeCustomFont(f.id)
                    if (useSettings.getState().fontFamily === f.family) s.set({ fontFamily: 'Cascadia Mono' })
                  }}
                  className="icon-btn h-5 w-5 hover:!text-err"
                >
                  <X size={11} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
        <Row title="字号">
          <Stepper value={s.fontSize} min={10} max={24} step={1} onChange={(v) => s.set({ fontSize: v })} />
        </Row>
        <Row title="行高">
          <Stepper
            value={s.lineHeight}
            min={1}
            max={1.8}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => s.set({ lineHeight: v })}
          />
        </Row>
      </Group>

      <Group title="光标">
        <Row title="光标样式">
          <Segmented<CursorStyle>
            id="cursor"
            value={s.cursorStyle}
            onChange={(v) => s.set({ cursorStyle: v })}
            options={[
              { value: 'block', label: '方块', icon: Square },
              { value: 'bar', label: '竖线', icon: TextCursor },
              { value: 'underline', label: '下划线', icon: Underline }
            ]}
          />
        </Row>
        <Row title="光标闪烁">
          <Switch checked={s.cursorBlink} onChange={(v) => s.set({ cursorBlink: v })} />
        </Row>
      </Group>

      <Group title="行为">
        <Row title="选中即复制" desc="选中文本后自动复制到剪贴板">
          <Switch checked={s.copyOnSelect} onChange={(v) => s.set({ copyOnSelect: v })} />
        </Row>
        <Row title="右键粘贴" desc="开启：有选中时复制、否则粘贴（Xshell 风格）；关闭：显示右键菜单">
          <Switch checked={s.rightClickPaste} onChange={(v) => s.set({ rightClickPaste: v })} />
        </Row>
        <Row title="回滚行数" desc="终端可向上滚动查看的历史行数">
          <select
            value={s.scrollback}
            onChange={(e) => s.set({ scrollback: Number(e.target.value) })}
            className="input h-8 w-32 cursor-pointer"
          >
            {[1000, 5000, 10000, 50000, 100000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} 行
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <HighlightGroup />
    </>
  )
}

const paletteNames = ['黑', '红', '绿', '黄', '蓝', '品红', '青', '白']
const pickable = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]

function ColorSlotPicker({
  value,
  palette,
  onChange
}: {
  value: number
  palette: string[]
  onChange: (index: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  const name = (i: number): string => (i >= 8 ? '亮' : '') + paletteNames[i % 8]
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={name(value)}
        className="flex h-7 w-[86px] cursor-pointer items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-[11.5px] text-dim hover:text-fg"
      >
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: palette[value] }} />
        {name(value)}
        <ChevronDown size={12} className="ml-auto" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-8 right-0 z-10 grid grid-cols-7 gap-1.5 rounded-lg border border-line bg-card p-2 shadow-xl"
          >
            {pickable.map((i) => (
              <button
                key={i}
                title={name(i)}
                onClick={() => {
                  onChange(i)
                  setOpen(false)
                }}
                style={{
                  background: palette[i],
                  boxShadow: i === value ? `0 0 0 2px var(--c-card), 0 0 0 3.5px ${palette[i]}` : undefined
                }}
                className="h-5 w-5 cursor-pointer rounded-full transition-transform hover:scale-110"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const updateText: Record<string, string> = {
  idle: '尚未检查',
  checking: '正在检查…',
  latest: '已是最新版本',
  available: '发现新版本',
  downloading: '正在下载更新',
  ready: '更新已下载，重启后生效',
  error: '检查失败'
}

function UpdateGroup(): React.JSX.Element {
  const update = useStore((st) => st.update)
  const autoUpdate = useSettings((st) => st.autoUpdate)
  const set = useSettings((st) => st.set)
  const busy = update.state === 'checking' || update.state === 'downloading'
  let desc = updateText[update.state]
  if (update.version && update.state !== 'latest') desc += ` v${update.version}`
  if (update.state === 'downloading') desc += ` · ${Math.floor(update.percent ?? 0)}%`
  if (update.state === 'error') desc += `：${update.error}`
  if (update.state === 'available' && !update.canInstall) desc += '（当前平台需手动下载安装）'

  return (
    <Group title="更新">
      <Row title="检查更新" desc={desc}>
        {update.state === 'ready' ? (
          <button onClick={() => window.api.update.install()} className="btn btn-primary h-8 px-3 text-xs">
            重启并更新
          </button>
        ) : update.state === 'available' ? (
          <button onClick={() => window.api.update.openReleasePage()} className="btn btn-primary h-8 px-3 text-xs">
            前往下载
          </button>
        ) : (
          <button disabled={busy} onClick={() => window.api.update.check()} className="btn btn-ghost h-8 px-3 text-xs">
            <RotateCcw size={13} className={clsx(busy && 'animate-spin')} />
            检查更新
          </button>
        )}
      </Row>
      <Row title="自动检查更新" desc="启动时及之后每 6 小时检查一次；Windows 与 Linux AppImage 会在后台下载">
        <Switch checked={autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
      </Row>
    </Group>
  )
}

function DefaultShellRow(): React.JSX.Element {
  const s = useSettings()
  const shells = useStore((st) => st.localShells)
  const current = shells.find((x) => x.id === s.defaultShell) ?? shells[0]
  const pickCwd = async (): Promise<void> => {
    const dir = await window.api.dialog.openDirectory(s.localCwd ?? undefined)
    if (dir) s.set({ localCwd: dir })
  }
  return (
    <Group title="本地终端">
      <Row title="默认 Shell" desc="点击侧边栏「本地终端」或按 Ctrl+Shift+T 时打开">
        <select
          value={current?.id ?? ''}
          onChange={(e) => s.set({ defaultShell: e.target.value })}
          className="input h-8 w-52 cursor-pointer"
        >
          {shells.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Row>
      <Row title="默认打开目录" desc={s.localCwd ?? '用户主目录'}>
        <div className="flex gap-2">
          {s.localCwd && (
            <button onClick={() => s.set({ localCwd: null })} className="btn btn-ghost h-8 px-3 text-xs">
              <RotateCcw size={13} />
              主目录
            </button>
          )}
          <button onClick={pickCwd} className="btn btn-ghost h-8 px-3 text-xs">
            <FolderOpen size={13} />
            选择…
          </button>
        </div>
      </Row>
    </Group>
  )
}

function HighlightGroup(): React.JSX.Element {
  const s = useSettings()
  const hl = s.highlight
  const colors = termColors(s.theme, s.accent)
  const background = colors.background.startsWith('rgba') ? themes[resolveThemeId(s.theme)].ui.term : colors.background
  const rule = (key: HighlightRuleKey): { on: boolean; color: number } => hl.rules[key] ?? defaultHighlight.rules[key]
  const setRule = (key: HighlightRuleKey, patch: Partial<{ on: boolean; color: number }>): void =>
    s.set({ highlight: { ...hl, rules: { ...hl.rules, [key]: { ...rule(key), ...patch } } } })

  const rows = [
    { key: commandRule.key, label: commandRule.label, sample: commandRule.sample, bold: true, underline: false },
    ...highlightRules.map((r) => ({
      key: r.key,
      label: r.label,
      sample: r.sample,
      bold: r.key === 'error',
      underline: r.key === 'url'
    }))
  ]

  return (
    <Group title="语法高亮">
      <Row title="启用语法高亮" desc="按内容为输出着色；服务器已着色的文字和 vim、top 等全屏程序不受影响">
        <Switch checked={hl.enabled} onChange={(v) => s.set({ highlight: { ...hl, enabled: v } })} />
      </Row>
      <div className={clsx('mt-1 space-y-1.5 transition-opacity', !hl.enabled && 'pointer-events-none opacity-40')}>
        {rows.map(({ key, label, sample, bold, underline }) => {
          const r = rule(key)
          return (
            <div key={key} className="flex items-center gap-3 rounded-lg px-1 py-1">
              <Switch checked={r.on} onChange={(v) => setRule(key, { on: v })} />
              <span className="w-24 shrink-0 text-[12.5px]">{label}</span>
              <span
                className="min-w-0 flex-1 truncate rounded-md px-2.5 py-1 font-mono text-[12px]"
                style={{
                  background,
                  color: r.on ? colors.ansi[r.color] : colors.foreground,
                  fontWeight: r.on && bold ? 700 : 400,
                  textDecoration: r.on && underline ? 'underline' : 'none',
                  fontFamily: terminalFontFamily(s.fontFamily)
                }}
              >
                {key === 'command' ? (
                  <>
                    <span style={{ color: colors.ansi[2] }}>user@host</span>
                    <span style={{ color: colors.foreground, fontWeight: 400 }}>:~$ </span>
                    {sample.split(' ')[0]}
                    <span style={{ color: colors.foreground, fontWeight: 400 }}> {sample.split(' ').slice(1).join(' ')}</span>
                  </>
                ) : (
                  sample
                )}
              </span>
              <ColorSlotPicker value={r.color} palette={colors.ansi} onChange={(color) => setRule(key, { color })} />
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-dim">
        <span>网址可按住 Ctrl 单击在浏览器中打开</span>
        <button
          onClick={() => s.set({ highlight: defaultHighlight })}
          className="cursor-pointer hover:text-fg"
        >
          恢复默认高亮
        </button>
      </div>
    </Group>
  )
}

function FilesSection(): React.JSX.Element {
  const s = useSettings()
  const editor = useStore((st) => st.editor)

  const choose = async (): Promise<void> => {
    const chosen = await window.api.edit.chooseEditor()
    if (chosen) useStore.setState({ editor: chosen })
  }
  const reset = async (): Promise<void> => {
    useStore.setState({ editor: await window.api.edit.resetEditor() })
  }

  return (
    <>
      <Group title="远程文件编辑">
        <Row title="本地编辑器" desc={editor ? `${editor.custom ? '已指定' : '自动检测'} · ${editor.path}` : undefined}>
          <div className="flex gap-2">
            {editor?.custom && (
              <button onClick={reset} className="btn btn-ghost h-8 px-3 text-xs">
                <RotateCcw size={13} />
                自动检测
              </button>
            )}
            <button onClick={choose} className="btn btn-ghost h-8 px-3 text-xs">
              选择…
            </button>
          </div>
        </Row>
      </Group>
      <Group title="文件面板">
        <Row title="文件面板位置" desc="右侧：终端保持完整高度，本地与远程上下排列；底部：本地与远程左右排列">
          <Segmented<FilePanelPosition>
            id="file-panel-position"
            value={s.filePanelPosition}
            onChange={(v) => s.set({ filePanelPosition: v })}
            options={[
              { value: 'right', label: '右侧', icon: PanelRight },
              { value: 'bottom', label: '底部', icon: PanelBottom }
            ]}
          />
        </Row>
        <Row title="默认显示隐藏文件" desc="以 . 开头的文件和文件夹，对新打开的面板生效">
          <Switch checked={s.showHiddenFiles} onChange={(v) => s.set({ showHiddenFiles: v })} />
        </Row>
      </Group>
    </>
  )
}

function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const reset = useSettings((s) => s.reset)
  const versions = window.electron.process.versions

  useEffect(() => {
    window.api.appVersion().then(setVersion)
  }, [])

  return (
    <>
      <div className="mb-7 flex items-center gap-4 rounded-xl border border-line p-5">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-fg">
          <TerminalSquare size={22} />
        </div>
        <div>
          <div className="text-[15px] font-semibold">kTerminal</div>
          <div className="mt-0.5 text-xs text-dim">版本 {version} · SSH 终端与 SFTP 文件传输</div>
        </div>
      </div>
      <UpdateGroup />
      <Group title="运行环境">
        {([
          ['Electron', versions.electron],
          ['Chromium', versions.chrome],
          ['Node.js', versions.node]
        ] as [string, string | undefined][]).map(([k, v]) => (
          <Row key={k} title={k}>
            <span className="font-mono text-xs text-dim">{v}</span>
          </Row>
        ))}
      </Group>
      <Group title="重置">
        <Row title="恢复默认设置" desc="外观、终端和文件面板设置恢复为默认值，不影响会话">
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: '恢复默认设置？',
                message: '所有设置将恢复为默认值。',
                okText: '恢复',
                danger: true
              })
              if (!ok) return
              reset()
              toast('已恢复默认设置', 'success')
            }}
            className="btn btn-ghost h-8 px-3 text-xs"
          >
            <RotateCcw size={13} />
            恢复默认
          </button>
        </Row>
      </Group>
    </>
  )
}

