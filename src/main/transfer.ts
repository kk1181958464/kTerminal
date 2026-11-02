import type { WebContents } from 'electron'
import { promises as fsp } from 'fs'
import { basename, dirname, join, posix } from 'path'
import { randomUUID } from 'crypto'
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2'
import type { TransferRequest, TransferTask } from '../shared/types'
import { getClient, openSftp } from './ssh'
import { describeFsError, promisify } from './files'

interface Job {
  task: TransferTask
  wc: WebContents
  sftp?: SFTPWrapper
  canceled?: boolean
  partialLocal?: string
  lastEmit: number
  lastBytes: number
}

type Step = { kind: 'dir'; to: string } | { kind: 'file'; from: string; to: string; size: number }

const MAX_RUNNING = 3
const jobs = new Map<string, Job>()

function emit(job: Job, force = false): void {
  const now = Date.now()
  if (!force && now - job.lastEmit < 150) return
  const elapsed = (now - job.lastEmit) / 1000
  if (job.task.status === 'running' && elapsed > 0) {
    const instant = (job.task.transferred - job.lastBytes) / elapsed
    job.task.speed = job.task.speed ? job.task.speed * 0.6 + instant * 0.4 : instant
  }
  job.lastEmit = now
  job.lastBytes = job.task.transferred
  if (!job.wc.isDestroyed()) job.wc.send('transfer:update', { ...job.task })
}

export function startTransfer(wc: WebContents, req: TransferRequest): void {
  const isUpload = req.direction === 'upload'
  for (const source of req.sources) {
    const name = isUpload ? basename(source) : posix.basename(source)
    const task: TransferTask = {
      id: randomUUID(),
      tabId: req.tabId,
      direction: req.direction,
      name,
      source,
      target: isUpload ? posix.join(req.targetDir, name) : join(req.targetDir, name),
      targetDir: req.targetDir,
      isDir: false,
      total: 0,
      transferred: 0,
      speed: 0,
      status: 'queued'
    }
    const job: Job = { task, wc, lastEmit: 0, lastBytes: 0 }
    jobs.set(task.id, job)
    emit(job, true)
  }
  pump()
}

function pump(): void {
  let running = [...jobs.values()].filter((j) => j.task.status === 'running').length
  for (const job of jobs.values()) {
    if (running >= MAX_RUNNING) break
    if (job.task.status !== 'queued') continue
    running++
    run(job)
  }
}

async function planUpload(from: string, to: string): Promise<Step[]> {
  const st = await fsp.stat(from)
  if (!st.isDirectory()) return [{ kind: 'file', from, to, size: st.size }]
  const steps: Step[] = [{ kind: 'dir', to }]
  for (const name of await fsp.readdir(from)) {
    steps.push(...(await planUpload(join(from, name), posix.join(to, name))))
  }
  return steps
}

async function planDownload(sftp: SFTPWrapper, from: string, to: string): Promise<Step[]> {
  const st = await promisify<Stats>((cb) => sftp.stat(from, cb))
  if (!st.isDirectory()) return [{ kind: 'file', from, to, size: st.size }]
  const steps: Step[] = [{ kind: 'dir', to }]
  const items = await promisify<FileEntryWithStats[]>((cb) => sftp.readdir(from, cb))
  for (const i of items) {
    if (i.filename === '.' || i.filename === '..') continue
    const child = posix.join(from, i.filename)
    if (i.attrs.isDirectory()) steps.push(...(await planDownload(sftp, child, join(to, i.filename))))
    else if (!i.attrs.isSymbolicLink() || (await isRemoteFile(sftp, child)))
      steps.push({ kind: 'file', from: child, to: join(to, i.filename), size: i.attrs.size })
  }
  return steps
}

async function isRemoteFile(sftp: SFTPWrapper, path: string): Promise<boolean> {
  try {
    return (await promisify<Stats>((cb) => sftp.stat(path, cb))).isFile()
  } catch {
    return false
  }
}

async function ensureRemoteDir(sftp: SFTPWrapper, path: string): Promise<void> {
  try {
    await promisify((cb) => sftp.mkdir(path, cb))
  } catch (err) {
    const st = await promisify<Stats>((cb) => sftp.stat(path, cb)).catch(() => null)
    if (!st?.isDirectory()) throw err
  }
}

async function run(job: Job): Promise<void> {
  const { task } = job
  Object.assign(task, { status: 'running', transferred: 0, total: 0, speed: 0, error: undefined })
  job.lastBytes = 0
  emit(job, true)
  try {
    const sftp = (job.sftp = await openSftp(getClient(task.tabId)))
    if (job.canceled) throw new Error('canceled')
    const upload = task.direction === 'upload'
    const steps = upload
      ? await planUpload(task.source, task.target)
      : await planDownload(sftp, task.source, task.target)
    task.isDir = steps[0]?.kind === 'dir'
    task.total = steps.reduce((sum, s) => sum + (s.kind === 'file' ? s.size : 0), 0)
    emit(job, true)

    let done = 0
    for (const step of steps) {
      if (job.canceled) throw new Error('canceled')
      if (step.kind === 'dir') {
        if (upload) await ensureRemoteDir(sftp, step.to)
        else await fsp.mkdir(step.to, { recursive: true })
        continue
      }
      const onStep = (transferred: number): void => {
        task.transferred = done + transferred
        emit(job)
      }
      if (upload) {
        await promisify((cb) => sftp.fastPut(step.from, step.to, { step: onStep }, cb))
      } else {
        await fsp.mkdir(dirname(step.to), { recursive: true })
        job.partialLocal = step.to
        await promisify((cb) => sftp.fastGet(step.from, step.to, { step: onStep }, cb))
        job.partialLocal = undefined
      }
      done += step.size
      task.transferred = done
      emit(job)
    }
    task.status = 'done'
  } catch (err) {
    task.status = job.canceled ? 'canceled' : 'error'
    if (!job.canceled) task.error = describeFsError(err)
    if (job.partialLocal) await fsp.rm(job.partialLocal, { force: true }).catch(() => {})
  } finally {
    job.sftp?.end()
    job.sftp = undefined
    job.partialLocal = undefined
    task.speed = 0
    emit(job, true)
    pump()
  }
}

export function cancelTransfer(id: string): void {
  const job = jobs.get(id)
  if (!job) return
  if (job.task.status === 'queued') {
    job.task.status = 'canceled'
    emit(job, true)
  } else if (job.task.status === 'running') {
    job.canceled = true
    job.sftp?.end()
  }
}

export function retryTransfer(id: string): void {
  const job = jobs.get(id)
  if (!job || !['error', 'canceled'].includes(job.task.status)) return
  job.canceled = false
  job.task.status = 'queued'
  job.task.error = undefined
  emit(job, true)
  pump()
}

export function clearTransfers(): void {
  for (const [id, job] of jobs) {
    if (['done', 'error', 'canceled'].includes(job.task.status)) jobs.delete(id)
  }
}
