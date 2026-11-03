/** What the predictor needs to know about the terminal it draws into. */
export interface PredictorHost {
  write(data: string): void
  /** True when nothing but blank cells follow the cursor on its line. */
  cursorAtLineEnd(): boolean
  altScreen(): boolean
  lineBeforeCursor(): string
}

export type PredictMode = 'auto' | 'on' | 'off'

/** Below this echo latency, `auto` mode doesn't predict; local echo would just add flicker. */
const AUTO_THRESHOLD_MS = 50
const SECRET_PROMPT = /pass(word|phrase)|密码|口令|\bpin\b|verification code|token/i
const PRINTABLE = /^[\x20-\x7e]+$/

/**
 * Local echo prediction for high-latency SSH (the approach mosh and VS Code use): printable keys are
 * drawn immediately, dimmed, and replaced by the server's echo when it arrives. Anything unexpected
 * (other output, control keys, a timeout) erases the predictions so the screen shows only what the
 * server sent. Predictions only start once a keystroke on the current line has really been echoed,
 * so lines where the server doesn't echo (password prompts) are never predicted.
 */
export class EchoPredictor {
  /** Predicted characters currently drawn after the real cursor. */
  private shown = ''
  /** Typed characters whose echo hasn't arrived yet, with send times, for matching and latency. */
  private awaiting: { ch: string; at: number }[] = []
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
    if (!PRINTABLE.test(data)) {
      // Enter, Ctrl+C, arrows, backspace, IME text…: drop predictions; the server redraws.
      this.rollback()
      if (data.includes('\r') || data.includes('\x03') || data.includes('\x04')) {
        this.lineConfirmed = false
        this.awaiting = []
      }
      return
    }
    const now = performance.now()
    for (const ch of data) this.awaiting.push({ ch, at: now })
    if (this.awaiting.length > 64) this.awaiting.splice(0, this.awaiting.length - 64)

    if (!this.shouldPredict()) return
    this.host.write(`\x1b[2m${data}\x1b[22m`)
    this.shown += data
    this.armTimeout()
  }

  /** Call with server output; returns the data to actually write to the terminal. */
  onOutput(data: string): string {
    const matched = this.matchEcho(data)
    if (!this.shown) return data

    if (matched > 0 && matched <= this.shown.length && data.length === matched) {
      // Pure echo of predicted characters: redraw them for real (styled by the server/highlighter)
      // and put the cursor back at the end of the still-pending predictions.
      const rest = this.shown.length - matched
      const out = `\x1b[${this.shown.length}D${data}${rest ? `\x1b[${rest}C` : ''}`
      this.shown = this.shown.slice(matched)
      if (!this.shown) clearTimeout(this.timer)
      return out
    }
    // Anything else: erase the predictions (they sit at the end of the line) and show the truth.
    const out = `\x1b[${this.shown.length}D\x1b[K${data}`
    this.shown = ''
    clearTimeout(this.timer)
    return out
  }

  private shouldPredict(): boolean {
    const mode = this.mode()
    if (mode === 'off' || (mode === 'auto' && this.latency < AUTO_THRESHOLD_MS)) return false
    if (!this.lineConfirmed || this.host.altScreen()) return false
    if (!this.shown && !this.host.cursorAtLineEnd()) return false
    return !SECRET_PROMPT.test(this.host.lineBeforeCursor())
  }

  /** Consumes the echoed prefix of `data`; returns how many typed characters it echoed. */
  private matchEcho(data: string): number {
    let n = 0
    while (n < data.length && n < this.awaiting.length && data[n] === this.awaiting[n].ch) n++
    if (n === 0) return 0
    const sample = performance.now() - this.awaiting[0].at
    this.latency = this.latency ? this.latency * 0.7 + sample * 0.3 : sample
    this.onLatency(this.latency)
    this.awaiting.splice(0, n)
    this.lineConfirmed = true
    return n
  }

  private armTimeout(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.rollback(), Math.max(1000, this.latency * 3))
  }

  private rollback(): void {
    clearTimeout(this.timer)
    if (!this.shown) return
    this.host.write(`\x1b[${this.shown.length}D\x1b[K`)
    this.shown = ''
  }
}
