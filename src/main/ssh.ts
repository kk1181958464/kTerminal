import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { readFileSync } from 'fs'
import { StringDecoder } from 'string_decoder'
import type { WebContents } from 'electron'
import type { ConnectResult } from '../shared/types'
import { getSecret, getSession } from './store'

interface Connection {
  client: Client
  stream?: ClientChannel
  sftp?: Promise<SFTPWrapper>
  disposed?: boolean
}

type SshError = Error & { code?: string; level?: string }

const connections = new Map<string, Connection>()

function send(wc: WebContents, channel: string, ...args: unknown[]): void {
  if (!wc.isDestroyed()) wc.send(channel, ...args)
}

function describeError(err: SshError): { error: string; needAuth?: boolean } {
  const msg = err.message || String(err)
  if (err.level === 'client-authentication')
    return { error: '认证失败，请检查用户名、密码或私钥', needAuth: true }
  if (/passphrase/i.test(msg)) return { error: '私钥已加密，请输入密码短语', needAuth: true }
  if (err.code === 'ECONNREFUSED') return { error: '连接被拒绝，请检查主机和端口' }
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return { error: '无法解析主机名' }
  if (err.code === 'ETIMEDOUT' || /timed out/i.test(msg)) return { error: '连接超时' }
  if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') return { error: '主机不可达' }
  if (err.code === 'ECONNRESET') return { error: '连接被重置' }
  if (err.code === 'ENOENT') return { error: '找不到私钥文件' }
  return { error: msg }
}

export function connectShell(
  wc: WebContents,
  tabId: string,
  sessionId: string,
  cols: number,
  rows: number,
  secretOverride?: string
): Promise<ConnectResult> {
  closeShell(tabId)
  const session = getSession(sessionId)
  if (!session) return Promise.resolve({ ok: false, error: '会话不存在或已被删除' })

  const secret = secretOverride ?? getSecret(sessionId)
  const config: ConnectConfig = {
    host: session.host,
    port: session.port,
    username: session.username,
    readyTimeout: 15000,
    keepaliveInterval: 30000,
    tryKeyboard: true
  }
  try {
    if (session.authType === 'key') {
      config.privateKey = readFileSync(session.privateKeyPath ?? '')
      if (secret) config.passphrase = secret
    } else {
      config.password = secret
    }
  } catch (err) {
    return Promise.resolve({ ok: false, ...describeError(err as SshError) })
  }

  return new Promise((resolve) => {
    const client = new Client()
    const conn: Connection = { client }
    connections.set(tabId, conn)
    let settled = false
    let lastError: string | undefined

    const fail = (err: SshError): void => {
      if (settled) return
      settled = true
      if (connections.get(tabId) === conn) connections.delete(tabId)
      client.end()
      resolve({ ok: false, ...describeError(err) })
    }

    client.on('ready', () => {
      client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) return fail(err)
        settled = true
        conn.stream = stream
        const decoder = new StringDecoder('utf8')
        const forward = (chunk: Buffer): void => send(wc, 'ssh:data', tabId, decoder.write(chunk))
        stream.on('data', forward)
        stream.stderr.on('data', forward)
        stream.on('close', () => client.end())
        resolve({ ok: true })
      })
    })
    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) =>
      finish(prompts.map(() => secret ?? ''))
    )
    client.on('error', (err) => {
      if (!settled) fail(err)
      else lastError = describeError(err).error
    })
    client.on('close', () => {
      if (connections.get(tabId) === conn) connections.delete(tabId)
      if (!settled) fail(new Error('连接已关闭'))
      else if (conn.stream && !conn.disposed) send(wc, 'ssh:closed', tabId, lastError)
    })
    client.connect(config)
  })
}

export function getClient(tabId: string): Client {
  const conn = connections.get(tabId)
  if (!conn?.stream) throw new Error('会话未连接')
  return conn.client
}

export function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) =>
    client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
  )
}

/** Shared SFTP channel used for browsing; transfers open their own channels. */
export function getSftp(tabId: string): Promise<SFTPWrapper> {
  const conn = connections.get(tabId)
  if (!conn?.stream) return Promise.reject(new Error('会话未连接'))
  conn.sftp ??= openSftp(conn.client).then(
    (sftp) => {
      sftp.on('close', () => (conn.sftp = undefined))
      return sftp
    },
    (err) => {
      conn.sftp = undefined
      throw err
    }
  )
  return conn.sftp
}

export function writeShell(tabId: string, data: string): void {
  connections.get(tabId)?.stream?.write(data)
}

export function resizeShell(tabId: string, cols: number, rows: number): void {
  connections.get(tabId)?.stream?.setWindow(rows, cols, 0, 0)
}

export function closeShell(tabId: string): void {
  const conn = connections.get(tabId)
  if (!conn) return
  conn.disposed = true
  connections.delete(tabId)
  conn.client.end()
}

export function closeAllShells(): void {
  for (const id of [...connections.keys()]) closeShell(id)
}
