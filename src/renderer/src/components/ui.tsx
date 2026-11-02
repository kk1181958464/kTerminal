import clsx from 'clsx'
import { motion } from 'framer-motion'

const avatarColors = ['#5b8def', '#8b5cf6', '#14b8a6', '#22c55e', '#f97316', '#ec4899', '#eab308', '#06b6d4']

export function Avatar({
  name,
  online,
  size = 32
}: {
  name: string
  online?: boolean
  size?: number
}): React.JSX.Element {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  const color = avatarColors[Math.abs(hash) % avatarColors.length]
  return (
    <div
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        fontSize: size * 0.42
      }}
      className="relative grid shrink-0 place-items-center rounded-lg font-semibold"
    >
      {[...name.trim()][0]?.toUpperCase() ?? '?'}
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-app bg-ok" />
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-fg/15'
      )}
    >
      <motion.span
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id
}: {
  value: T
  options: { value: T; label: string; icon?: React.ComponentType<{ size?: number; className?: string }> }[]
  onChange: (value: T) => void
  /** Unique per instance so the sliding pill animates independently. */
  id: string
}): React.JSX.Element {
  return (
    <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={clsx(
            'relative flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] whitespace-nowrap transition-colors',
            value === v ? 'text-fg' : 'text-dim hover:text-fg'
          )}
        >
          {value === v && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              className="absolute inset-0 rounded-md border border-line bg-term shadow-sm"
            />
          )}
          {Icon && <Icon size={13} className="relative" />}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  )
}
