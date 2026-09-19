// DOM overlay containers for the single viewport (labels and axis ticks are HTML
// positioned every frame — crisp text, no GPU text rendering needed).

export const overlay = {
  labels: null as HTMLDivElement | null,
  ticks: null as HTMLDivElement | null,
  canvasHost: null as HTMLDivElement | null,
  /** Small readout that follows the cursor while drawing/dragging. */
  tip: null as HTMLDivElement | null
}

export function showTip(text: string | null, x = 0, y = 0) {
  const el = overlay.tip
  if (!el) return
  if (!text) {
    el.style.display = 'none'
    return
  }
  if (el.textContent !== text) el.textContent = text
  el.style.display = ''
  el.style.transform = `translate(${Math.round(x + 18)}px, ${Math.round(y + 18)}px)`
}

/** World-space anchor + pixel offset for each object's label, written by the renderers. */
export const labelAnchors = new Map<string, { p: [number, number, number]; dx?: number; dy?: number }>()

/** Pool of absolutely positioned spans inside a container. */
export class SpanPool {
  private spans: HTMLSpanElement[] = []
  private used = 0
  constructor(
    private container: () => HTMLDivElement | null,
    private className: string
  ) {}

  begin() {
    this.used = 0
  }

  place(text: string, x: number, y: number, align: 'center' | 'left' | 'right' = 'center', color?: string) {
    const host = this.container()
    if (!host) return
    let el = this.spans[this.used]
    if (!el) {
      el = document.createElement('span')
      el.className = this.className
      host.appendChild(el)
      this.spans.push(el)
    }
    this.used++
    if (el.textContent !== text) el.textContent = text
    const tx = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${tx}, -50%)`
    el.style.display = ''
    el.style.color = color ?? ''
  }

  end() {
    for (let i = this.used; i < this.spans.length; i++) this.spans[i].style.display = 'none'
  }

  dispose() {
    for (const s of this.spans) s.remove()
    this.spans = []
  }
}
