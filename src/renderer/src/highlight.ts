import type { HighlightRuleKey, HighlightSettings } from './settings'

interface RuleDef {
  key: HighlightRuleKey
  label: string
  sample: string
  source: string
  /** Extra SGR attributes (underline/bold) and how to undo them. */
  style?: [string, string]
}

/** Order matters: earlier rules win when matches overlap (URLs before paths and IPs). */
export const highlightRules: RuleDef[] = [
  {
    key: 'url',
    label: '网址',
    sample: 'https://ubuntu.com/pro',
    source: String.raw`\b(?:https?|ftp|sftp|ssh|file)://[^\s'"<>()\[\]{}]*[^\s'"<>()\[\]{}.,;:!?]`,
    style: ['4', '24']
  },
  {
    key: 'ip',
    label: 'IP 地址',
    sample: '10.0.0.14:22',
    source: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5})?(?:/\d{1,2})?\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b`,
  },
  {
    key: 'error',
    label: '错误',
    sample: 'Permission denied',
    source: String.raw`\b(?:errors?|failed|failure|fatal|denied|refused|critical|panic|exception|unreachable|timed out|not found|no such file or directory|segmentation fault)\b|错误|失败|拒绝`,
    style: ['1', '22']
  },
  {
    key: 'warning',
    label: '警告',
    sample: 'warning: deprecated',
    source: String.raw`\b(?:warn|warning|warnings|deprecated|caution)\b|警告`,
  },
  {
    key: 'success',
    label: '成功',
    sample: 'active (running)  OK',
    source: String.raw`\b(?:ok|success|successful|successfully|succeeded|done|active|running|passed|completed)\b|成功|完成`,
  },
  {
    key: 'datetime',
    label: '日期时间',
    sample: '2026-11-02 15:37:54',
    source: String.raw`\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b|\b\d{1,2}:\d{2}:\d{2}\b|\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +\d{1,2}\b`
  },
  {
    key: 'number',
    label: '百分比 / 容量',
    sample: '63.7%  39.26GB',
    source: String.raw`\b\d+(?:\.\d+)?(?:\s?%|\s?[KMGTP]i?B\b|[KMGT]\b)`
  },
  {
    key: 'path',
    label: '文件路径',
    sample: '/etc/nginx/nginx.conf',
    source: String.raw`(?<![\w./:-])(?:~|\.{1,2})?/(?:[\w.@+-]+/?)+`
  },
  {
    key: 'string',
    label: '引号字符串',
    sample: "'do-release-upgrade'",
    source: String.raw`'[^'\n]{1,120}'|"[^"\n]{1,120}"`
  }
]

export const commandRule = { key: 'command' as const, label: '输入的命令', sample: 'ls -la' }

/** ANSI palette index (0–15) → SGR foreground code. */
export function sgrColor(index: number): string {
  return String(index < 8 ? 30 + index : 90 + index - 8)
}

let cache: { key: string; re: RegExp; groups: RuleDef[] } | null = null

function compile(settings: HighlightSettings): { re: RegExp; groups: RuleDef[] } | null {
  const active = highlightRules.filter((r) => settings.rules[r.key]?.on)
  const key = active.map((r) => r.key).join(',')
  if (cache?.key === key) return cache
  if (!active.length) return null
  const parts = active.map((r) => `(${r.source})`)
  cache = { key, re: new RegExp(parts.join('|'), 'gi'), groups: active }
  return cache
}

const PROMPT_END = /[$#%>❯] $/

/**
 * Stateful filter that colors plain terminal output before it reaches xterm.
 * Text the server already colored, and full-screen apps (alternate screen), pass through untouched.
 */
export class Highlighter {
  private pending = ''
  private colored = false
  private inverse = false
  private altScreen = false
  private lineTail = ''
  private cmd: 'off' | 'name' | 'args' = 'off'
  private cmdPos = 0
  private nameEnd = -1

  constructor(private getSettings: () => HighlightSettings) {}

  process(chunk: string): string {
    const settings = this.getSettings()
    const data = this.pending + chunk
    this.pending = ''
    let out = ''
    let i = 0
    let endedWithText = false

    while (i < data.length) {
      const ch = data[i]
      if (ch === '\x1b') {
        const end = this.escapeEnd(data, i)
        if (end < 0) {
          // Incomplete sequence: hold it until the next chunk arrives.
          this.pending = data.slice(i)
          break
        }
        const seq = data.slice(i, end)
        this.trackEscape(seq)
        out += seq
        i = end
        continue
      }
      if (ch < ' ' || ch === '\x7f') {
        if (ch === '\n') {
          this.lineTail = ''
          this.cmd = 'off'
        } else if (ch === '\r') {
          this.lineTail = ''
        } else if (ch === '\b' && this.cmd !== 'off') {
          this.cmdPos = Math.max(0, this.cmdPos - 1)
          if (this.nameEnd >= 0 && this.cmdPos <= this.nameEnd) {
            this.cmd = 'name'
            this.nameEnd = -1
          }
        }
        out += ch
        i++
        endedWithText = false
        continue
      }
      let j = i
      while (j < data.length && data[j] !== '\x1b' && !(data[j] < ' ' || data[j] === '\x7f')) j++
      const text = data.slice(i, j)
      out += this.colorText(text, settings)
      this.lineTail = (this.lineTail + text).slice(-200)
      i = j
      endedWithText = true
    }

    // A chunk that ends right after "...$ " is a shell prompt waiting for input.
    if (
      settings.enabled &&
      settings.rules.command?.on &&
      !this.altScreen &&
      endedWithText &&
      this.cmd === 'off' &&
      PROMPT_END.test(this.lineTail)
    ) {
      this.cmd = 'name'
      this.cmdPos = 0
      this.nameEnd = -1
    }
    return out
  }

  private colorText(text: string, settings: HighlightSettings): string {
    if (!settings.enabled || this.altScreen || this.colored || this.inverse) return text

    if (this.cmd !== 'off') {
      const color = sgrColor(settings.rules.command?.color ?? 11)
      let out = ''
      for (const c of text) {
        if (this.cmd === 'name' && c === ' ' && this.cmdPos > 0) {
          this.cmd = 'args'
          this.nameEnd = this.cmdPos
        }
        out += this.cmd === 'name' && c !== ' ' ? `\x1b[1;${color}m${c}\x1b[22;39m` : c
        this.cmdPos++
      }
      return out
    }

    const compiled = compile(settings)
    if (!compiled || text.length > 20000) return text
    const { re, groups } = compiled
    re.lastIndex = 0
    let out = ''
    let last = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0]) {
        re.lastIndex++
        continue
      }
      const rule = groups[m.slice(1).findIndex((g) => g !== undefined)]
      const color = sgrColor(settings.rules[rule.key].color)
      const [on, off] = rule.style ?? ['', '']
      out += text.slice(last, m.index)
      out += `\x1b[${on ? on + ';' : ''}${color}m${m[0]}\x1b[${off ? off + ';' : ''}39m`
      last = m.index + m[0].length
    }
    return out + text.slice(last)
  }

  /** Returns the index just past the escape sequence starting at `i`, or -1 if incomplete. */
  private escapeEnd(data: string, i: number): number {
    const next = data[i + 1]
    if (next === undefined) return -1
    if (next === '[') {
      for (let k = i + 2; k < data.length; k++) {
        const code = data.charCodeAt(k)
        if (code >= 0x40 && code <= 0x7e) return k + 1
      }
      return -1
    }
    if (next === ']' || next === 'P' || next === '_' || next === '^') {
      // OSC/DCS/APC/PM: terminated by BEL or ST (ESC \).
      for (let k = i + 2; k < data.length; k++) {
        if (data[k] === '\x07') return k + 1
        if (data[k] === '\x1b' && data[k + 1] === '\\') return k + 2
        if (data[k] === '\x1b' && data[k + 1] === undefined) return -1
      }
      return -1
    }
    if (next === '(' || next === ')' || next === '#') return i + 3 <= data.length ? i + 3 : -1
    return i + 2
  }

  private trackEscape(seq: string): void {
    if (seq[1] !== '[') return
    const final = seq[seq.length - 1]
    const body = seq.slice(2, -1)
    if (final === 'm') {
      const params = body === '' ? [0] : body.split(/[;:]/).map((p) => (p === '' ? 0 : Number(p)))
      for (let k = 0; k < params.length; k++) {
        const p = params[k]
        if (p === 0) {
          this.colored = false
          this.inverse = false
        } else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) this.colored = true
        else if (p === 38) {
          this.colored = true
          k += params[k + 1] === 5 ? 2 : 4
        } else if (p === 48) k += params[k + 1] === 5 ? 2 : 4
        else if (p === 39) this.colored = false
        else if (p === 7) this.inverse = true
        else if (p === 27) this.inverse = false
      }
    } else if ((final === 'h' || final === 'l') && /^\?(1049|1047|47)$/.test(body)) {
      this.altScreen = final === 'h'
      if (this.altScreen) this.cmd = 'off'
    }
  }
}
