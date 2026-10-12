export interface TapeLike {
  first: number;
  last: number;
  rate: number;
  timeOf(step: number): number;
  record(step: number): Float32Array | null;
}

export type SeriesKind = 'x' | 'y' | 'vx' | 'vy' | 'speed' | 'ke' | 'pe';

function getSteps(first: number, upTo: number, maxPoints: number): number[] {
  if (first > upTo) return [];
  if (first === upTo) return [first];
  const count = upTo - first + 1;
  if (count <= maxPoints) {
    const steps: number[] = [];
    for (let i = 0; i < count; i++) steps.push(first + i);
    return steps;
  }
  
  const steps: number[] = [];
  const spacing = (upTo - first) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const step = Math.round(first + i * spacing);
    if (steps.length === 0 || steps[steps.length - 1] !== step) {
      steps.push(step);
    }
  }
  
  // ensure the last point is strictly `upTo`
  if (steps.length > 0 && steps[steps.length - 1] !== upTo) {
    if (steps[steps.length - 1] > upTo) {
      steps[steps.length - 1] = upTo;
    } else {
      steps.push(upTo);
    }
  }
  
  return steps;
}

export function series(
  tape: TapeLike,
  body: number,
  kinds: SeriesKind[],
  opts: {
    mass: number;
    g: number;
    datumY: number;
    maxPoints?: number;
    upTo?: number;
  }
): { t: number[]; values: Record<SeriesKind, number[]> } {
  const maxPoints = opts.maxPoints ?? 600;
  const upTo = opts.upTo ?? tape.last;
  const steps = getSteps(tape.first, upTo, maxPoints);

  const t: number[] = [];
  const values: Record<SeriesKind, number[]> = {} as Record<SeriesKind, number[]>;
  for (const k of kinds) {
    values[k] = [];
  }

  const offset = body * 13;

  for (const step of steps) {
    const rec = tape.record(step);
    if (!rec) continue;
    
    t.push(tape.timeOf(step));

    const px = rec[offset + 0];
    const py = rec[offset + 1];
    const vx = rec[offset + 7];
    const vy = rec[offset + 8];
    const vz = rec[offset + 9];

    for (const k of kinds) {
      if (k === 'x') values[k].push(px);
      else if (k === 'y') values[k].push(py);
      else if (k === 'vx') values[k].push(vx);
      else if (k === 'vy') values[k].push(vy);
      else if (k === 'speed') {
        values[k].push(Math.sqrt(vx * vx + vy * vy + vz * vz));
      }
      else if (k === 'ke') {
        const speedSq = vx * vx + vy * vy + vz * vz;
        values[k].push(0.5 * opts.mass * speedSq);
      }
      else if (k === 'pe') {
        values[k].push(opts.mass * opts.g * (py - opts.datumY));
      }
    }
  }

  return { t, values };
}

export function springSeries(
  tape: TapeLike,
  a: number,
  b: number | null,
  anchor: [number, number, number] | null,
  k: number,
  restLength: number,
  maxPoints?: number
): { t: number[]; elastic: number[] } {
  const maxPts = maxPoints ?? 600;
  const steps = getSteps(tape.first, tape.last, maxPts);

  const t: number[] = [];
  const elastic: number[] = [];
  const offsetA = a * 13;
  const offsetB = b !== null ? b * 13 : 0;

  for (const step of steps) {
    const rec = tape.record(step);
    if (!rec) continue;
    
    t.push(tape.timeOf(step));

    const pax = rec[offsetA + 0];
    const pay = rec[offsetA + 1];
    const paz = rec[offsetA + 2];

    let pbx = 0, pby = 0, pbz = 0;
    if (b !== null) {
      pbx = rec[offsetB + 0];
      pby = rec[offsetB + 1];
      pbz = rec[offsetB + 2];
    } else if (anchor) {
      pbx = anchor[0];
      pby = anchor[1];
      pbz = anchor[2];
    }
    
    const dx = pax - pbx;
    const dy = pay - pby;
    const dz = paz - pbz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const stretch = dist - restLength;
    
    elastic.push(0.5 * k * stretch * stretch);
  }

  return { t, elastic };
}

export function valueAt(t: number[], values: number[], time: number): number | null {
  if (t.length === 0 || time < t[0] || time > t[t.length - 1]) return null;
  
  let low = 0;
  let high = t.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (t[mid] === time) return values[mid];
    if (t[mid] < time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  if (high < 0 || low >= t.length) return null;
  const t0 = t[high];
  const t1 = t[low];
  const v0 = values[high];
  const v1 = values[low];
  if (t1 === t0) return v0;
  return v0 + (v1 - v0) * (time - t0) / (t1 - t0);
}

export function playheadX(time: number, t0: number, t1: number, width: number): number {
  if (t1 === t0) return 0;
  return ((time - t0) / (t1 - t0)) * width;
}
