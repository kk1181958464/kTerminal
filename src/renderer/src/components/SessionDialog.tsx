import { useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { FileKey, FolderOpen, KeyRound, Server, X } from 'lucide-react'
import type { AuthType, Session } from '../../../shared/types'
import { useStore } from '../store'

export function SessionDialog(): React.JSX.Element {
  const dialog = useStore((s) => s.dialog)
  const closeDialog = useStore((s) => s.closeDialog)

  return (
    <AnimatePresence>
      {dialog && (
        <motion.div
          key="dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
        >
          <DialogBody session={dialog.session} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DialogBody({ session }: { session?: Session }): React.JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const saveSession = useStore((s) => s.saveSession)
  const closeDialog = useStore((s) => s.closeDialog)
  const openTab = useStore((s) => s.openTab)
  const editing = !!session

  const [form, setForm] = useState({
    name: session?.name ?? '',
    group: session?.group ?? '',
    host: session?.host ?? '',
    port: String(session?.port ?? 22),
    username: session?.username ?? 'root',
    authType: session?.authType ?? ('password' as AuthType),
    privateKeyPath: session?.privateKeyPath ?? '',
    secret: ''
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form, value: string): void =>
    setForm((f) => ({ ...f, [key]: value }))

  const groups = [...new Set(sessions.map((s) => s.group).filter(Boolean))]
  const secretKept = editing && session.hasSecret && session.authType === form.authType

  const submit = async (connectAfter: boolean): Promise<void> => {
    const port = Number(form.port)
    if (!form.host.trim()) return setError('请填写主机地址')
    if (!form.username.trim()) return setError('请填写用户名')
    if (!Number.isInteger(port) || port < 1 || port > 65535) return setError('端口应为 1–65535')
    if (form.authType === 'key' && !form.privateKeyPath) return setError('请选择私钥文件')

    setSaving(true)
    const saved = await saveSession({
      id: session?.id,
      name: form.name.trim() || form.host.trim(),
      group: form.group.trim(),
      host: form.host.trim(),
      port,
      username: form.username.trim(),
      authType: form.authType,
      privateKeyPath: form.authType === 'key' ? form.privateKeyPath : undefined,
      secret: form.secret || (secretKept ? undefined : '')
    })
    closeDialog()
    if (connectAfter) openTab(saved)
  }

  const pickKey = async (): Promise<void> => {
    const path = await window.api.dialog.openPrivateKey()
    if (path) set('privateKeyPath', path)
  }

  return (
    <motion.form
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 12 }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
      onSubmit={(e) => {
        e.preventDefault()
        submit(true)
      }}
      onKeyDown={(e) => e.key === 'Escape' && closeDialog()}
      className="w-[520px] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_80px_-16px_rgb(0_0_0/0.55)]"
    >
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent">
          <Server size={17} />
        </div>
        <div>
          <h2 className="text-[15px] font-medium">{editing ? '编辑会话' : '新建会话'}</h2>
          <p className="text-xs text-dim">配置 SSH 连接信息</p>
        </div>
        <button type="button" onClick={closeDialog} className="icon-btn ml-auto">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="默认使用主机地址"
              className="input"
            />
          </Field>
          <Field label="分组">
            <input
              value={form.group}
              onChange={(e) => set('group', e.target.value)}
              placeholder="默认分组"
              list="session-groups"
              className="input"
            />
            <datalist id="session-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="主机" className="flex-1">
            <input
              autoFocus
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="IP 或域名"
              className="input"
            />
          </Field>
          <Field label="端口" className="w-24">
            <input
              value={form.port}
              onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))}
              className="input"
            />
          </Field>
        </div>

        <Field label="用户名">
          <input
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            className="input"
          />
        </Field>

        <Field label="认证方式">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel p-1">
            {(
              [
                ['password', '密码', KeyRound],
                ['key', '私钥', FileKey]
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => set('authType', value)}
                className={clsx(
                  'relative flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[12.5px] transition',
                  form.authType === value ? 'text-fg' : 'text-dim hover:text-fg'
                )}
              >
                {form.authType === value && (
                  <motion.span
                    layoutId="auth-pill"
                    className="absolute inset-0 rounded-md border border-line bg-card shadow"
                  />
                )}
                <Icon size={13} className="relative" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </Field>

        {form.authType === 'key' && (
          <Field label="私钥文件">
            <div className="flex gap-2">
              <input
                value={form.privateKeyPath}
                onChange={(e) => set('privateKeyPath', e.target.value)}
                placeholder="例如 C:\Users\me\.ssh\id_ed25519"
                className="input"
              />
              <button type="button" onClick={pickKey} className="btn btn-ghost shrink-0 px-3">
                <FolderOpen size={14} />
                浏览
              </button>
            </div>
          </Field>
        )}

        <Field label={form.authType === 'key' ? '密码短语（可选）' : '密码'}>
          <input
            type="password"
            value={form.secret}
            onChange={(e) => set('secret', e.target.value)}
            placeholder={secretKept ? '已保存，留空则保持不变' : '留空则在连接时询问'}
            className="input"
          />
        </Field>

        {error && <p className="text-[12.5px] text-err">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t border-line bg-panel/50 px-6 py-4">
        <button type="button" onClick={closeDialog} className="btn btn-ghost">
          取消
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submit(false)}
          className="btn btn-ghost"
        >
          保存
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary">
          保存并连接
        </button>
      </div>
    </motion.form>
  )
}

function Field({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}
