export function crossings(t: number[], x: number[], level: number, dir: 'up' | 'down' | 'any'): number[] {
  const result: number[] = []
  if (t.length < 2) return result

  for (let i = 0; i < t.length - 1; i++) {
    const x0 = x[i]
    const x1 = x[i + 1]

    if (x0 < level && x1 > level) {
      if (dir === 'up' || dir === 'any') {
        const f = (level - x0) / (x1 - x0)
        result.push(t[i] + f * (t[i + 1] - t[i]))
      }
    } else if (x0 > level && x1 < level) {
      if (dir === 'down' || dir === 'any') {
        const f = (level - x0) / (x1 - x0)
        result.push(t[i] + f * (t[i + 1] - t[i]))
      }
    } else if (x0 === level && x1 > level) {
      if (dir === 'up' || dir === 'any') result.push(t[i])
    } else if (x0 === level && x1 < level) {
      if (dir === 'down' || dir === 'any') result.push(t[i])
    } else if (x0 < level && x1 === level) {
      if (dir === 'up' || dir === 'any') result.push(t[i + 1])
    } else if (x0 > level && x1 === level) {
      if (dir === 'down' || dir === 'any') result.push(t[i + 1])
    }
  }

  const uniqueResult: number[] = []
  for (const time of result) {
    if (uniqueResult.length === 0 || uniqueResult[uniqueResult.length - 1] !== time) {
      uniqueResult.push(time)
    }
  }
  return uniqueResult
}

export function periodic(t: number[], x: number[]): { period: number; frequency: number; amplitude: number; cycles: number } | null {
  if (t.length < 2) return null
  let min = x[0]
  let max = x[0]
  for (const v of x) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const mid = (min + max) / 2
  const amplitude = (max - min) / 2

  const crossUp = crossings(t, x, mid, 'up')
  const crossDown = crossings(t, x, mid, 'down')

  const cUp = crossUp.length >= 2 ? crossUp.length - 1 : 0
  const cDown = crossDown.length >= 2 ? crossDown.length - 1 : 0

  if (cUp === 0 && cDown === 0) return null

  let period: number
  let cycles: number

  if (cUp >= cDown) {
    cycles = cUp
    period = (crossUp[crossUp.length - 1] - crossUp[0]) / cycles
  } else {
    cycles = cDown
    period = (crossDown[crossDown.length - 1] - crossDown[0]) / cycles
  }

  return { period, frequency: 1 / period, amplitude, cycles }
}

export function flight(t: number[], x: number[], y: number[], groundY: number): { range: number; maxHeight: number; flightTime: number } | null {
  if (t.length < 2) return null
  const startX = x[0]
  const startY = y[0]
  const startT = t[0]

  let maxHeight = startY
  for (let i = 0; i < t.length; i++) {
    if (y[i] > maxHeight) maxHeight = y[i]
  }

  let hasRisen = false
  let crossT = -1
  let crossX = -1

  for (let i = 0; i < t.length - 1; i++) {
    const y0 = y[i]
    const y1 = y[i + 1]

    if (y0 > groundY) hasRisen = true

    if (hasRisen) {
      if (y0 >= groundY && y1 < groundY) {
        const f = (groundY - y0) / (y1 - y0)
        crossT = t[i] + f * (t[i + 1] - t[i])
        crossX = x[i] + f * (x[i + 1] - x[i])
        break
      }
    }
  }

  if (crossT === -1) return null

  return {
    range: crossX - startX,
    maxHeight: maxHeight - startY,
    flightTime: crossT - startT
  }
}

export function peaks(t: number[], y: number[]): { t: number; y: number }[] {
  const result: { t: number; y: number }[] = []
  if (t.length < 3) return result

  for (let i = 1; i < t.length - 1; i++) {
    const y0 = y[i - 1]
    const y1 = y[i]
    const y2 = y[i + 1]

    if (y1 > y0 && y1 > y2) {
      const t0 = t[i - 1]
      const t1 = t[i]
      const t2 = t[i + 1]

      const u0 = t0 - t1
      const u2 = t2 - t1
      const dy0 = y0 - y1
      const dy2 = y2 - y1
      const D = u0 * u0 * u2 - u2 * u2 * u0

      if (D !== 0) {
        const a = (dy0 * u2 - dy2 * u0) / D
        const b = (u0 * u0 * dy2 - u2 * u2 * dy0) / D

        if (a < 0) {
          const uPeak = -b / (2 * a)
          if (uPeak >= u0 && uPeak <= u2) {
            const tPeak = t1 + uPeak
            const yPeak = a * uPeak * uPeak + b * uPeak + y1
            result.push({ t: tPeak, y: yPeak })
            continue
          }
        }
      }
      result.push({ t: t1, y: y1 })
    }
  }
  return result
}

export function stopDistance(t: number[], x: number[], v: number[], vStop: number = 0.001): { distance: number; time: number } | null {
  if (t.length === 0) return null

  if (Math.abs(v[0]) <= vStop) {
    return { distance: 0, time: 0 }
  }

  for (let i = 0; i < t.length - 1; i++) {
    const v0 = Math.abs(v[i])
    const v1 = Math.abs(v[i + 1])

    if (v0 > vStop && v1 <= vStop) {
      const f = (vStop - v0) / (v1 - v0)
      const crossT = t[i] + f * (t[i + 1] - t[i])
      const crossX = x[i] + f * (x[i + 1] - x[i])

      return {
        distance: Math.abs(crossX - x[0]),
        time: crossT - t[0]
      }
    }
  }
  return null
}

export function pathLength(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0
  let len = 0
  for (let i = 0; i < xs.length - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    const dy = ys[i + 1] - ys[i]
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return len
}

export function centralAcceleration(t: number[], v: number[], i: number): number | null {
  if (i <= 0 || i >= t.length - 1) return null
  const dt = t[i + 1] - t[i - 1]
  if (dt === 0) return null
  return (v[i + 1] - v[i - 1]) / dt
}

export function bounces(t: number[], vy: number[]): { t: number; vIn: number; vOut: number; e: number }[] {
  const result: { t: number; vIn: number; vOut: number; e: number }[] = []
  if (t.length < 2) return result

  for (let i = 0; i < t.length - 1; i++) {
    const vy0 = vy[i]
    const vy1 = vy[i + 1]

    if (vy0 < 0 && vy1 > 0) {
      const f = (0 - vy0) / (vy1 - vy0)
      const tBounce = t[i] + f * (t[i + 1] - t[i])
      const vIn = -vy0
      const vOut = vy1
      const e = vOut / vIn
      result.push({ t: tBounce, vIn, vOut, e })
    }
  }
  return result
}

export function ruler(a: [number, number, number], b: [number, number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function angleAt(a: [number, number, number], vertex: [number, number, number], c: [number, number, number]): number {
  const v1x = a[0] - vertex[0]
  const v1y = a[1] - vertex[1]
  const v1z = a[2] - vertex[2]

  const v2x = c[0] - vertex[0]
  const v2y = c[1] - vertex[1]
  const v2z = c[2] - vertex[2]

  const dot = v1x * v2x + v1y * v2y + v1z * v2z
  const len1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z)

  if (len1 === 0 || len2 === 0) return 0

  let cosTheta = dot / (len1 * len2)
  if (cosTheta > 1) cosTheta = 1
  if (cosTheta < -1) cosTheta = -1

  return Math.acos(cosTheta) * 180 / Math.PI
}
