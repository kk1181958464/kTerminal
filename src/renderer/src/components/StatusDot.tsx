import clsx from 'clsx'
import type { TabStatus } from '../store'

export const statusMeta: Record<TabStatus, { label: string; dot: string }> = {
  auth: { label: '等待认证', dot: 'bg-warn' },
  connecting: { label: '连接中', dot: 'bg-warn animate-pulse' },
  connected: {
    label: '已连接',
    dot: 'bg-ok shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-ok)_22%,transparent)]'
  },
  closed: { label: '已断开', dot: 'bg-dim/60' },
  error: { label: '连接失败', dot: 'bg-err' }
}

export function StatusDot({ status }: { status: TabStatus }): React.JSX.Element {
  return <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', statusMeta[status].dot)} />
}
