import type { WebContents } from 'electron'
import { spawn as ptySpawn, type IPty } from '@lydell/node-pty'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, join } from 'path'
import type { ConnectResult, LocalShell } from '../shared/types'

interface ShellDef extends LocalShell {
  path: string
  args: string[]
}

const ptys = new Map<string, IPty>()
let shells: ShellDef[] | null = null

function findOnPath(exe: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const full = join(dir, exe)
    if (dir && existsSync(full)) return full
  }
  return undefined
}

function detectShells(): ShellDef[] {
  if (process.platform !== 'win32') {
    const sh = process.env.SHELL || '/bin/bash'
    return [{ id: 'default', name: sh.split('/').pop() ?? 'shell', path: sh, args: ['-l'] }]
  }
  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  const list: ShellDef[] = []

  const pwsh = findOnPath('pwsh.exe')
  if (pwsh) list.push({ id: 'pwsh', name: 'PowerShell 7', path: pwsh, args: ['-NoLogo'] })
  list.push({
    id: 'powershell',
    name: 'Windows PowerShell',
    path: join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoLogo']
  })
  list.push({ id: 'cmd', name: '命令提示符', path: join(system32, 'cmd.exe'), args: [] })

  // Git for Windows: <install>\cmd\git.exe → <install>\bin\bash.exe
  const git = findOnPath('git.exe')
  const bash = [
    git && join(dirname(dirname(git)), 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe'
  ].find((p): p is string => !!p && existsSync(p))
  if (bash) list.push({ id: 'gitbash', name: 'Git Bash', path: bash, args: ['--login', '-i'] })

  const wsl = join(system32, 'wsl.exe')
  if (existsSync(wsl)) {
    try {
      // `wsl -l -q` prints UTF-16 and exits non-zero when no distro is installed.
      const distros = execFileSync(wsl, ['-l', '-q'], { encoding: 'utf16le', timeout: 3000, windowsHide: true })
        .split(/\r?\n/)
        .map((s) => s.replace(/\0/g, '').trim())
        .filter(Boolean)
      if (distros.length) list.push({ id: 'wsl', name: `WSL (${distros[0]})`, path: wsl, args: [] })
    } catch {
      // No WSL distribution.
    }
  }
  return list
}

export function listShells(): LocalShell[] {
  shells ??= detectShells()
  return shells.map(({ id, name }) => ({ id, name }))
}

function send(wc: WebContents, channel: string, ...args: unknown[]): void {
  if (!wc.isDestroyed()) wc.send(channel, ...args)
}

export function spawnLocal(wc: WebContents, tabId: string, shellId: string, cols: number, rows: number): ConnectResult {
  closeLocal(tabId)
  shells ??= detectShells()
  const shell = shells.find((s) => s.id === shellId) ?? shells[0]
  try {
    const p = ptySpawn(shell.path, shell.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: homedir(),
      env: process.env as Record<string, string>
    })
    ptys.set(tabId, p)
    // Reuses the SSH channels so the renderer treats local and remote tabs the same way.
    p.onData((data) => send(wc, 'ssh:data', tabId, data))
    p.onExit(({ exitCode }) => {
      if (ptys.get(tabId) !== p) return
      ptys.delete(tabId)
      send(wc, 'ssh:closed', tabId, exitCode ? `进程已退出（代码 ${exitCode}）` : undefined)
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `无法启动 ${shell.name}：${(err as Error).message}` }
  }
}

/** The write/resize/close helpers return false when the tab isn't a local terminal. */
export function writeLocal(tabId: string, data: string): boolean {
  const p = ptys.get(tabId)
  p?.write(data)
  return !!p
}

export function resizeLocal(tabId: string, cols: number, rows: number): boolean {
  const p = ptys.get(tabId)
  p?.resize(cols, rows)
  return !!p
}

export function closeLocal(tabId: string): boolean {
  const p = ptys.get(tabId)
  if (!p) return false
  ptys.delete(tabId)
  p.kill()
  return true
}

export function closeAllLocal(): void {
  for (const id of [...ptys.keys()]) closeLocal(id)
}
