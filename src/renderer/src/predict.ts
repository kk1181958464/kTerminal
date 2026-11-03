/** What the predictor needs to know about the terminal it draws into. */
export interface PredictorHost {
  write(data: string): void
  /** True when nothing but blank cells follow the cursor on its line. */
  cursorAtLineEnd(): boolean
  altScreen(): boolean
  lineBeforeCursor(): string
}

export type PredictMode = 'auto' | 'on' | 'off'

/** A run of server output; `swallow` runs were already drawn by a prediction and must not be. */
export interface Segment {
  text: string
  swallow: boolean
}

type Op =
  /** shown: drawn dimmed; cancelled: drawn then erased by a predicted backspace; plain: not predicted. */
  | { kind: 'char'; ch: string; state: 'shown' | 'cancelled' | 'plain'; at: number }
  | { kind: 'bs'; predicted: boolean; at: number }

/** Below this echo latency, `auto` mode doesn't predict; local echo would just add flicker. */
const AUTO_THRESHOLD_MS = 50
const SECRET_PROMPT = /pass(word|phrase)|密码|口令|\bpin\b|verification code|token/i
const PRINTABLE = /^[\x20-\x7e]+$/
/** How shells echo a backspace at the end of the line. */
const BACKSPACE_ECHO = /^(?:\x08 \x08|\x08\x1b\[K|\x08\x1b\[1?P|\x1b\[1?D\x1b\[K)/

/**
 * Local echo prediction for high-latency SSH (the approach mosh and VS Code use). Printable keys and
 * backspace take effect on screen immediately; the server's echo is then matched against them. A
 * confirmed character is redrawn from the real echo (so highlighting applies); a confirmed backspace,
 * or the echo of a character the user already deleted, is swallowed because the screen already shows
 * it. Anything unexpected restores the screen to exactly what the server sent.
 *
 * Model: the server's line ends at the real cursor `base`. The screen shows that line minus its last
 * `cut` characters (erased by predicted backspaces; their text is kept in `stash` for rollback),
 * followed by `shown` predicted characters. Predictions are only made at the end of the line and only
 * once a keystroke on the line has really been echoed, so password prompts are never predicted.
 */
export class EchoPredictor {
  private ops: Op[] = []
  private shown = 0
  private cut = 0
  private stash = ''
  /** User-typed characters the server has confirmed on this line: the most backspace may remove. */
  private typed = 0
  private lineConfirmed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  latency = 0

  constructor(
    private host: PredictorHost,
    private mode: () => PredictMode,
    private onLatency: (ms: number) => void
  ) {}

  /** Call with user input right before it is sent to the server. */
  onInput(data: string): void {
    const at = performance.now()
    if (data === '\x7f' || data === '\b') return this.onBackspace(at)
    if (!PRINTABLE.test(data)) {
      // Enter, Ctrl+C, arrows, IME text…: undo predictions and let the server redraw.
      this.rollback()
      this.typed = 0
      if (/[\r\x03\x04]/.test(data)) {
        this.lineConfirmed = false
        this.ops = []
      }
      return
    }
    for (const ch of data) {
      if (this.canPredict()) {
        this.host.write(`\x1b[2m${ch}\x1b[22m`)
        this.ops.push({ kind: 'char', ch, state: 'shown', at })
        this.shown++
        this.armTimeout()
      } else {
        this.ops.push({ kind: 'char', ch, state: 'plain', at })
      }
    }
    if (this.ops.length > 256) this.ops.splice(0, this.ops.length - 256)
  }

  private onBackspace(at: number): void {
    const before = this.host.lineBeforeCursor()
    const deletable = this.shown > 0 || (this.typed - this.cut > 0 && /[\x20-\x7e]$/.test(before))
    if (!this.canPredict() || !deletable) {
      this.ops.push({ kind: 'bs', predicted: false, at })
      return
    }
    if (this.shown > 0) {
      const last = this.ops.findLast((o) => o.kind === 'char' && o.state === 'shown')
      if (last?.kind === 'char') last.state = 'cancelled'
      this.shown--
    } else {
      this.stash = before.slice(-1) + this.stash
      this.cut++
    }
    this.host.write('\b\x1b[K')
    this.ops.push({ kind: 'bs', predicted: true, at })
    this.armTimeout()
  }

  /** Call with server output; returns segments to feed through the rest of the pipeline in order. */
  onOutput(data: string): Segment[] {
    const segs: Segment[] = []
    let i = 0
    while (i < data.length && this.ops.length) {
      const op = this.ops[0]
      if (op.kind === 'char') {
        if (data[i] !== op.ch) break
        this.sample(op.at)
        this.typed++
        this.lineConfirmed = true
        if (op.state === 'shown') {
          // Step back to the real cursor, draw the real echo, then return to the end of the predictions.
          segs.push({ text: `\x1b[${this.shown}D${op.ch}`, swallow: false })
          this.shown--
          if (this.shown) segs.push({ text: `\x1b[${this.shown}C`, swallow: false })
        } else if (op.state === 'cancelled') {
          // Already typed and deleted on screen; the server line just grew under the erased part.
          segs.push({ text: op.ch, swallow: true })
          this.cut++
          this.stash += op.ch
        } else {
          segs.push({ text: op.ch, swallow: false })
        }
        this.ops.shift()
        i++
      } else {
        const m = BACKSPACE_ECHO.exec(data.slice(i))
        if (!m) break
        this.sample(op.at)
        this.typed = Math.max(0, this.typed - 1)
        if (op.predicted) {
          segs.push({ text: m[0], swallow: true })
          this.cut--
          this.stash = this.stash.slice(0, -1)
        } else {
          segs.push({ text: m[0], swallow: false })
        }
        this.ops.shift()
        i += m[0].length
      }
    }
    if (i < data.length) {
      // The server said something we didn't predict: restore its exact state, then show the rest.
      if (this.hasPredictions()) segs.push({ text: this.restoreSequence(), swallow: false })
      this.ops = []
      segs.push({ text: data.slice(i), swallow: false })
    }
    if (!this.hasPredictions()) clearTimeout(this.timer)
    return segs
  }

  private canPredict(): boolean {
    const mode = this.mode()
    if (mode === 'off' || (mode === 'auto' && this.latency < AUTO_THRESHOLD_MS)) return false
    if (!this.lineConfirmed || this.host.altScreen()) return false
    // Mixing in an unpredicted key would make the screen model ambiguous.
    if (this.ops.some((o) => (o.kind === 'char' ? o.state === 'plain' : !o.predicted))) return false
    if (!this.hasPredictions() && !this.host.cursorAtLineEnd()) return false
    return !SECRET_PROMPT.test(this.host.lineBeforeCursor())
  }

  private hasPredictions(): boolean {
    return this.shown > 0 || this.cut > 0
  }

  /** Screen → server state: redraw erased characters and drop predicted ones. */
  private restoreSequence(): string {
    const seq = `${this.shown ? `\x1b[${this.shown}D` : ''}${this.stash}\x1b[K`
    this.shown = 0
    this.cut = 0
    this.stash = ''
    return seq
  }

  private rollback(): void {
    clearTimeout(this.timer)
    if (!this.hasPredictions()) return
    this.host.write(this.restoreSequence())
    // Pending echoes now land on an unmodified screen, so they can be drawn as-is.
    for (const op of this.ops) {
      if (op.kind === 'char') op.state = 'plain'
      else op.predicted = false
    }
  }

  private sample(at: number): void {
    const ms = performance.now() - at
    this.latency = this.latency ? this.latency * 0.7 + ms * 0.3 : ms
    this.onLatency(this.latency)
  }

  private armTimeout(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.rollback(), Math.max(1000, this.latency * 3))
  }
}
