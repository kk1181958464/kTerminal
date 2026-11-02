import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Session, SessionInput } from '../shared/types'

type StoredSession = Omit<Session, 'hasSecret'> & { secret?: string }

const filePath = (): string => join(app.getPath('userData'), 'sessions.json')

function load(): StoredSession[] {
  if (!existsSync(filePath())) return []
  try {
    return JSON.parse(readFileSync(filePath(), 'utf8'))
  } catch {
    return []
  }
}

function persist(list: StoredSession[]): void {
  writeFileSync(filePath(), JSON.stringify(list, null, 2))
}

function toSession({ secret, ...rest }: StoredSession): Session {
  return { ...rest, hasSecret: !!secret }
}

export function listSessions(): Session[] {
  return load().map(toSession)
}

export function getSession(id: string): Session | undefined {
  const s = load().find((x) => x.id === id)
  return s && toSession(s)
}

export function getSecret(id: string): string | undefined {
  const secret = load().find((x) => x.id === id)?.secret
  return secret ? safeStorage.decryptString(Buffer.from(secret, 'base64')) : undefined
}

export function saveSession({ secret, ...input }: SessionInput): Session {
  const list = load()
  const index = input.id ? list.findIndex((x) => x.id === input.id) : -1
  const existing = index >= 0 ? list[index] : undefined
  const record: StoredSession = {
    ...input,
    id: existing?.id ?? randomUUID(),
    secret:
      secret === undefined
        ? existing?.secret
        : secret
          ? safeStorage.encryptString(secret).toString('base64')
          : undefined
  }
  if (index >= 0) list[index] = record
  else list.push(record)
  persist(list)
  return toSession(record)
}

export function deleteSession(id: string): void {
  persist(load().filter((x) => x.id !== id))
}
