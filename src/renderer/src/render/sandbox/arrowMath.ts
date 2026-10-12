import { fmtLabel } from '../../math/format'

export type ArrowKind = 'velocity' | 'acceleration' | 'force' | 'momentum'

export const ARROW_SCALE: Record<ArrowKind, { metresPer: number; unit: string }> = {
  velocity: { metresPer: 0.5, unit: 'm/s' },
  acceleration: { metresPer: 0.2, unit: 'm/s²' },
  force: { metresPer: 0.1, unit: 'N' },
  momentum: { metresPer: 0.2, unit: 'kg m/s' }
}

export function sceneScale(kind: ArrowKind, sceneSizeM: number, typicalValue: number): number {
  let scale = ARROW_SCALE[kind].metresPer;
  if (typicalValue === 0) return scale;
  const absVal = Math.abs(typicalValue);
  let arrowLen = absVal * scale;

  let doublings = 0;
  while (arrowLen < 0.05 * sceneSizeM && doublings < 60) {
    scale *= 2;
    arrowLen = absVal * scale;
    doublings++;
  }
  let halvings = 0;
  while (arrowLen > 0.25 * sceneSizeM && halvings < 60) {
    scale /= 2;
    arrowLen = absVal * scale;
    halvings++;
  }
  return scale;
}

export function arrowGeometry(
  tail: [number, number, number],
  vec: [number, number, number],
  metresPerUnit: number,
  pixelsPerMetre: number,
  opts?: { shaftPx?: number; headPx?: number }
): { tip: [number, number, number]; length: number; shaftRadius: number; headLength: number; headRadius: number; visible: boolean } {
  const shaftPx = opts?.shaftPx ?? 3;
  const headPx = opts?.headPx ?? 12;

  const vx = vec[0];
  const vy = vec[1];
  const vz = vec[2];
  const vecMag = Math.hypot(vx, vy, vz);

  const length = vecMag * metresPerUnit;

  const shaftRadius = shaftPx / (2 * pixelsPerMetre);
  const headLength = headPx / pixelsPerMetre;
  const headRadius = headPx / (2 * pixelsPerMetre);

  const visible = length >= headLength;

  const tip: [number, number, number] = [
    tail[0] + (vecMag === 0 ? 0 : (vx / vecMag) * length),
    tail[1] + (vecMag === 0 ? 0 : (vy / vecMag) * length),
    tail[2] + (vecMag === 0 ? 0 : (vz / vecMag) * length)
  ];

  return {
    tip,
    length,
    shaftRadius,
    headLength,
    headRadius,
    visible
  };
}

export function labelPosition(
  tip: [number, number, number],
  dir: [number, number, number],
  pixelsPerMetre: number,
  offsetPx = 10
): [number, number, number] {
  const dMag = Math.hypot(dir[0], dir[1], dir[2]);
  if (dMag === 0) return [...tip];
  const offsetM = offsetPx / pixelsPerMetre;
  return [
    tip[0] + (dir[0] / dMag) * offsetM,
    tip[1] + (dir[1] / dMag) * offsetM,
    tip[2] + (dir[2] / dMag) * offsetM
  ];
}

export function scaleKeyText(kind: ArrowKind, metresPerUnit: number): string {
  const unit = ARROW_SCALE[kind].unit;
  const valuePerM = 1 / metresPerUnit;
  return `1 m = ${fmtLabel(valuePerM)} ${unit}`;
}

export function multiflashSteps(firstStep: number, lastStep: number, rate: number, interval: number, max = 60): number[] {
  if (rate * interval <= 0) return [];
  const stepGap = Math.round(rate * interval);
  if (stepGap <= 0) return [];
  const result: number[] = [];
  for (let s = firstStep; s <= lastStep; s += stepGap) {
    result.push(s);
  }
  if (result.length > max) {
    return result.slice(result.length - max);
  }
  return result;
}
