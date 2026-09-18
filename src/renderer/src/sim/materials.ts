// Real materials, so "steel" behaves like steel. Densities are kg/m³, μ is the
// coefficient of friction, e the coefficient of restitution (bounciness) against a hard floor.
// Values are the usual textbook/handbook figures, rounded to what a student would quote.

export interface Material {
  id: string
  label: string
  density: number
  friction: number
  restitution: number
  /** Coefficient of rolling resistance: why a ball rolling on carpet stops and one on steel does not. */
  rolling: number
  color: string
}

export const MATERIALS: Material[] = [
  { id: 'steel', label: 'Steel', density: 7850, friction: 0.6, restitution: 0.6, rolling: 0.002, color: '#adb5bd' },
  { id: 'aluminium', label: 'Aluminium', density: 2700, friction: 0.5, restitution: 0.5, rolling: 0.003, color: '#ced4da' },
  { id: 'wood', label: 'Wood', density: 700, friction: 0.5, restitution: 0.4, rolling: 0.02, color: '#c98a45' },
  { id: 'rubber', label: 'Rubber', density: 1200, friction: 1.0, restitution: 0.85, rolling: 0.03, color: '#495057' },
  { id: 'glass', label: 'Glass', density: 2500, friction: 0.4, restitution: 0.55, rolling: 0.003, color: '#74c0fc' },
  { id: 'concrete', label: 'Concrete', density: 2400, friction: 0.8, restitution: 0.2, rolling: 0.02, color: '#868e96' },
  { id: 'ice', label: 'Ice', density: 917, friction: 0.05, restitution: 0.1, rolling: 0.001, color: '#a5d8ff' },
  { id: 'plastic', label: 'Plastic', density: 950, friction: 0.35, restitution: 0.6, rolling: 0.01, color: '#ffd43b' },
  { id: 'cork', label: 'Cork', density: 240, friction: 0.6, restitution: 0.3, rolling: 0.04, color: '#e8c39e' },
  { id: 'lead', label: 'Lead', density: 11340, friction: 0.5, restitution: 0.2, rolling: 0.005, color: '#5c6670' },
  { id: 'foam', label: 'Foam', density: 60, friction: 0.7, restitution: 0.15, rolling: 0.1, color: '#ffa8a8' }
]

export const materialById = (id: string): Material => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0]

/** Volume of a shape in m³, so density can give a mass the student can check. */
export function shapeVolume(shape: string, size: [number, number, number]): number {
  const [a, b, c] = size
  switch (shape) {
    case 'sphere':
      return (4 / 3) * Math.PI * a ** 3
    case 'cylinder':
      return Math.PI * a ** 2 * b
    case 'capsule':
      return Math.PI * a ** 2 * b + (4 / 3) * Math.PI * a ** 3
    case 'cone':
      return (1 / 3) * Math.PI * a ** 2 * b
    case 'ramp':
      // A wedge: half of the box it fits in.
      return (a * b * c) / 2
    default:
      return a * b * c
  }
}

/** Area facing the direction of travel (m²), used for air drag. */
export function frontalArea(shape: string, size: [number, number, number], dir: [number, number, number]): number {
  const [a, b, c] = size
  const ax = Math.abs(dir[0])
  const ay = Math.abs(dir[1])
  const az = Math.abs(dir[2])
  switch (shape) {
    case 'sphere':
      return Math.PI * a ** 2
    case 'cylinder':
    case 'capsule':
    case 'cone':
      // Round end towards the motion, or the long side.
      return ay * Math.PI * a ** 2 + (1 - ay) * 2 * a * b
    default:
      // Box-like: the projected area of the three faces.
      return ax * b * c + ay * a * c + az * a * b
  }
}

/** Drag coefficient of a shape when the user has not set one. */
export function dragCoefficient(shape: string): number {
  switch (shape) {
    case 'sphere':
      return 0.47
    case 'cylinder':
      return 0.82
    case 'capsule':
      return 0.6
    case 'cone':
      return 0.5
    default:
      return 1.05 // a cube
  }
}
