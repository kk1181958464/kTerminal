import { existsSync } from 'fs'
import { delimiter, join } from 'path'

export function findOnPath(exe: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const full = join(dir, exe)
    if (existsSync(full)) return full
  }
  return undefined
}
