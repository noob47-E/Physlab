export const REC_FLOATS = 13
export const WORK_FLOATS = 5

export interface RecordLayout {
  bodies: string[]
  ropes: { linkId: string; count: number }[]
}

export interface TapeKeyframe<K> {
  step: number
  key: K
}

interface Chunk<E> {
  startStep: number
  records: Float32Array
  work: Float32Array
  events: Map<number, E[]>
}

export class Tape<K = unknown, E = unknown> {
  readonly layout: RecordLayout
  readonly rate: number
  readonly bodyCount: number
  
  readonly capBytes: number
  private startTime: number
  private globalStartStep: number
  private chunks: Chunk<E>[] = []
  private keyframes: TapeKeyframe<K>[] = []
  private _trimmedSeconds: number = 0
  
  private _first: number = 0
  private _last: number = -1

  constructor(layout: RecordLayout, rate: number, startStep: number, startTime: number, capBytes = 64 * 2 ** 20) {
    this.layout = layout
    this.rate = rate
    this.globalStartStep = startStep
    this.startTime = startTime
    this.capBytes = capBytes
    
    let ropeCount = 0
    for (const r of layout.ropes) {
      ropeCount += r.count
    }
    this.bodyCount = layout.bodies.length + ropeCount
  }

  get first(): number {
    return this._first
  }

  get last(): number {
    return this._last
  }

  get bytes(): number {
    let b = 0
    let evCount = 0
    for (const chunk of this.chunks) {
      b += chunk.records.byteLength + chunk.work.byteLength
      for (const evs of chunk.events.values()) {
        evCount += evs.length
      }
    }
    b += evCount * 64
    return b
  }

  timeOf(step: number): number {
    return this.startTime + (step - this.globalStartStep) / this.rate
  }

  trimmedSeconds(): number {
    return this._trimmedSeconds
  }

  push(step: number, rec: Float32Array, work?: Float32Array, events?: E[]): void {
    if (this._last !== -1 && step !== this._last + 1) {
      throw new Error(`Step must be consecutive. Expected ${this._last + 1}, got ${step}.`)
    }
    
    if (rec.length !== REC_FLOATS * this.bodyCount) {
      throw new Error(`Record length must be ${REC_FLOATS * this.bodyCount}, got ${rec.length}.`)
    }
    
    if (work && work.length !== WORK_FLOATS) {
      throw new Error(`Work length must be ${WORK_FLOATS}, got ${work.length}.`)
    }

    if (this.chunks.length === 0 || step >= this.chunks[this.chunks.length - 1].startStep + this.rate) {
      this.chunks.push({
        startStep: step,
        records: new Float32Array(this.rate * REC_FLOATS * this.bodyCount),
        work: new Float32Array(this.rate * WORK_FLOATS),
        events: new Map()
      })
    }

    const chunk = this.chunks[this.chunks.length - 1]
    const localStep = step - chunk.startStep
    
    chunk.records.set(rec, localStep * REC_FLOATS * this.bodyCount)
    if (work) {
      chunk.work.set(work, localStep * WORK_FLOATS)
    }
    
    if (events && events.length > 0) {
      chunk.events.set(step, [...events])
    }
    
    if (this._last === -1) {
      this._first = step
    }
    this._last = step
    
  }

  record(step: number): Float32Array | null {
    // A playhead between two steps (a slowed or scrubbed replay) is a fraction: the record shown is the step at or before
    // it. Unfloored, the view started part-way into a float and threw "start offset of Float32Array should be a multiple
    // of 4", which crashed the Sandbox panel (the Angle fold read the tape at the raw playhead, 14 Oct).
    step = Math.floor(step)
    if (step < this._first || step > this._last || this.chunks.length === 0) return null
    for (const chunk of this.chunks) {
      if (step >= chunk.startStep && step < chunk.startStep + this.rate) {
        const localStep = step - chunk.startStep
        const offset = localStep * REC_FLOATS * this.bodyCount
        return new Float32Array(chunk.records.buffer, chunk.records.byteOffset + offset * 4, REC_FLOATS * this.bodyCount)
      }
    }
    return null
  }

  work(step: number): Float32Array | null {
    step = Math.floor(step) // as in record(): a fractional playhead reads the step at or before it
    if (step < this._first || step > this._last || this.chunks.length === 0) return null
    for (const chunk of this.chunks) {
      if (step >= chunk.startStep && step < chunk.startStep + this.rate) {
        const localStep = step - chunk.startStep
        const offset = localStep * WORK_FLOATS
        return new Float32Array(chunk.work.buffer, chunk.work.byteOffset + offset * 4, WORK_FLOATS)
      }
    }
    return null
  }

  events(step: number): E[] {
    if (step < this._first || step > this._last) return []
    for (const chunk of this.chunks) {
      if (step >= chunk.startStep && step < chunk.startStep + this.rate) {
        return chunk.events.get(step) || []
      }
    }
    return []
  }

  eventsIn(from: number, to: number): { step: number; e: E }[] {
    const res: { step: number; e: E }[] = []
    for (const chunk of this.chunks) {
      if (chunk.startStep + this.rate <= from || chunk.startStep > to) {
        // chunk is fully out of bounds
        if (chunk.startStep > to) break // as chunks are ordered
        continue
      }
      for (const [step, evs] of chunk.events.entries()) {
        if (step >= from && step <= to) {
          for (const e of evs) {
            res.push({ step, e })
          }
        }
      }
    }
    res.sort((a, b) => a.step - b.step)
    return res
  }

  workSum(from: number, to: number): Float32Array {
    const sum = new Float32Array(WORK_FLOATS)
    const start = Math.max(from, this._first)
    const end = Math.min(to, this._last)
    for (let step = start; step <= end; step++) {
      const w = this.work(step)
      if (w) {
        for (let i = 0; i < WORK_FLOATS; i++) {
          sum[i] += w[i]
        }
      }
    }
    return sum
  }

  addKeyframe(step: number, key: K): void {
    let i = this.keyframes.length
    while (i > 0 && this.keyframes[i - 1].step > step) {
      i--
    }
    this.keyframes.splice(i, 0, { step, key })
  }

  keyframeAtOrBefore(step: number): TapeKeyframe<K> | null {
    let low = 0
    let high = this.keyframes.length - 1
    let best: TapeKeyframe<K> | null = null

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (this.keyframes[mid].step <= step) {
        best = this.keyframes[mid]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return best
  }

  keyframeSteps(): number[] {
    return this.keyframes.map(k => k.step)
  }

  truncateAfter(step: number, free: (k: K) => void): void {
    if (this._last === -1 || step >= this._last) return

    // Find first keyframe after step
    let kIdx = 0
    while (kIdx < this.keyframes.length && this.keyframes[kIdx].step <= step) {
      kIdx++
    }
    const removedKeys = this.keyframes.splice(kIdx)
    for (const k of removedKeys) {
      free(k.key)
    }

    if (step < this._first) {
      this.chunks = []
      this._first = 0
      this._last = -1
      return
    }

    this._last = step

    let cIdx = this.chunks.length - 1
    while (cIdx >= 0 && this.chunks[cIdx].startStep > step) {
      this.chunks.pop()
      cIdx--
    }

    if (cIdx >= 0) {
      const chunk = this.chunks[cIdx]
      // clear events
      for (const evStep of chunk.events.keys()) {
        if (evStep > step) {
          chunk.events.delete(evStep)
        }
      }
    }
  }

  dropOldestChunk(free: (k: K) => void): void {
    if (this.chunks.length === 0) return
    const chunk = this.chunks.shift()!
    this._trimmedSeconds += 1 // one chunk is one second

    let kIdx = 0
    while (kIdx < this.keyframes.length && this.keyframes[kIdx].step < chunk.startStep + this.rate) {
      kIdx++
    }
    const removedKeys = this.keyframes.splice(0, kIdx)
    for (const k of removedKeys) {
      free(k.key)
    }

    if (this.chunks.length > 0) {
      this._first = this.chunks[0].startStep
    } else {
      this._first = 0
      this._last = -1
    }
  }
}

export function blendRecord(a: Float32Array, b: Float32Array, alpha: number, out: Float32Array): void {
  const t = Math.max(0, Math.min(1, alpha))
  if (t === 0) {
    out.set(a)
    return
  }
  if (t === 1) {
    out.set(b)
    return
  }

  const bodies = a.length / REC_FLOATS
  for (let i = 0; i < bodies; i++) {
    const offset = i * REC_FLOATS
    // pos 0,1,2
    for (let j = 0; j < 3; j++) out[offset + j] = a[offset + j] + (b[offset + j] - a[offset + j]) * t
    // quat 3,4,5,6
    const qax = a[offset + 3], qay = a[offset + 4], qaz = a[offset + 5], qaw = a[offset + 6]
    let qbx = b[offset + 3], qby = b[offset + 4], qbz = b[offset + 5], qbw = b[offset + 6]
    const dot = qax * qbx + qay * qby + qaz * qbz + qaw * qbw
    if (dot < 0) {
      qbx = -qbx
      qby = -qby
      qbz = -qbz
      qbw = -qbw
    }
    const rx = qax + (qbx - qax) * t
    const ry = qay + (qby - qay) * t
    const rz = qaz + (qbz - qaz) * t
    const rw = qaw + (qbw - qaw) * t
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw)
    out[offset + 3] = rx / len
    out[offset + 4] = ry / len
    out[offset + 5] = rz / len
    out[offset + 6] = rw / len
    // vel 7,8,9
    for (let j = 7; j < 10; j++) out[offset + j] = a[offset + j] + (b[offset + j] - a[offset + j]) * t
    // ang vel 10,11,12
    for (let j = 10; j < 13; j++) out[offset + j] = a[offset + j] + (b[offset + j] - a[offset + j]) * t
  }
}

export function bytesPerSecond(bodies: number, rate: number): number {
  return 52 * bodies * rate
}
