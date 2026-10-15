import { fmtLabel } from './format'

interface Measurement {
  value: number
  steps: string[]
}

interface PlaneCoefficients {
  a: number
  b: number
  c: number
  d: number
}

type Point = [number, number, number]
type Vector = [number, number, number]

function magnitude(v: Vector): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

function dot(v1: Vector, v2: Vector): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]
}

function cross(v1: Vector, v2: Vector): Vector {
  return [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ]
}

function subtract(p1: Point, p2: Point): Vector {
  return [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
}

export function pointDistance(p1: Point, p2: Point): Measurement {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const dz = p2[2] - p1[2]
  const value = Math.sqrt(dx * dx + dy * dy + dz * dz)

  const steps = [
    `d = √((${p2[0]} − ${p1[0]})² + (${p2[1]} − ${p1[1]})² + (${p2[2]} − ${p1[2]})²)`,
    `d = √(${dx}² + ${dy}² + ${dz}²)`,
    `d = √(${dx * dx} + ${dy * dy} + ${dz * dz})`,
    `d = √${dx * dx + dy * dy + dz * dz}`,
    `d = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function lineLineAngle(dir1: Vector, dir2: Vector): Measurement {
  const mag1 = magnitude(dir1)
  const mag2 = magnitude(dir2)
  const dotProd = dot(dir1, dir2)
  const cosAngle = Math.abs(dotProd) / (mag1 * mag2)
  const value = Math.acos(Math.min(1, cosAngle))

  const steps = [
    `θ = arccos(|u · v| / (|u| |v|))`,
    `u · v = ${dir1[0]} × ${dir2[0]} + ${dir1[1]} × ${dir2[1]} + ${dir1[2]} × ${dir2[2]} = ${dotProd}`,
    `|u| = √(${dir1[0]}² + ${dir1[1]}² + ${dir1[2]}²) = ${fmtLabel(mag1, 6)}`,
    `|v| = √(${dir2[0]}² + ${dir2[1]}² + ${dir2[2]}²) = ${fmtLabel(mag2, 6)}`,
    `θ = arccos(|${dotProd}| / (${fmtLabel(mag1, 6)} × ${fmtLabel(mag2, 6)})) = ${fmtLabel(value, 6)} rad`
  ]
  return { value, steps }
}

export function linePlaneAngle(lineDir: Vector, planeNormal: Vector): Measurement {
  const lineMag = magnitude(lineDir)
  const normalMag = magnitude(planeNormal)
  const dotProd = dot(lineDir, planeNormal)
  const sinAngle = Math.abs(dotProd) / (lineMag * normalMag)
  const value = Math.asin(Math.min(1, sinAngle))

  const steps = [
    `α = arcsin(|l · n| / (|l| |n|))`,
    `l · n = ${lineDir[0]} × ${planeNormal[0]} + ${lineDir[1]} × ${planeNormal[1]} + ${lineDir[2]} × ${planeNormal[2]} = ${dotProd}`,
    `|l| = √(${lineDir[0]}² + ${lineDir[1]}² + ${lineDir[2]}²) = ${fmtLabel(lineMag, 6)}`,
    `|n| = √(${planeNormal[0]}² + ${planeNormal[1]}² + ${planeNormal[2]}²) = ${fmtLabel(normalMag, 6)}`,
    `α = arcsin(|${dotProd}| / (${fmtLabel(lineMag, 6)} × ${fmtLabel(normalMag, 6)})) = ${fmtLabel(value, 6)} rad`
  ]
  return { value, steps }
}

export function planePlaneAngle(normal1: Vector, normal2: Vector): Measurement {
  const mag1 = magnitude(normal1)
  const mag2 = magnitude(normal2)
  const dotProd = dot(normal1, normal2)
  const cosAngle = Math.abs(dotProd) / (mag1 * mag2)
  const value = Math.acos(Math.min(1, cosAngle))

  const steps = [
    `θ = arccos(|n₁ · n₂| / (|n₁| |n₂|))`,
    `n₁ · n₂ = ${normal1[0]} × ${normal2[0]} + ${normal1[1]} × ${normal2[1]} + ${normal1[2]} × ${normal2[2]} = ${dotProd}`,
    `|n₁| = √(${normal1[0]}² + ${normal1[1]}² + ${normal1[2]}²) = ${fmtLabel(mag1, 6)}`,
    `|n₂| = √(${normal2[0]}² + ${normal2[1]}² + ${normal2[2]}²) = ${fmtLabel(mag2, 6)}`,
    `θ = arccos(|${dotProd}| / (${fmtLabel(mag1, 6)} × ${fmtLabel(mag2, 6)})) = ${fmtLabel(value, 6)} rad`
  ]
  return { value, steps }
}

export function pointPlaneDistance(point: Point, a: number, b: number, c: number, d: number): Measurement {
  const numerator = Math.abs(a * point[0] + b * point[1] + c * point[2] - d)
  const denominator = Math.sqrt(a * a + b * b + c * c)
  const value = numerator / denominator

  const steps = [
    `dist = |ax₀ + by₀ + cz₀ − d| / √(a² + b² + c²)`,
    `dist = |${a} × ${point[0]} + ${b} × ${point[1]} + ${c} × ${point[2]} − ${d}| / √(${a}² + ${b}² + ${c}²)`,
    `dist = |${a * point[0] + b * point[1] + c * point[2]} − ${d}| / √${a * a + b * b + c * c}`,
    `dist = ${fmtLabel(numerator, 6)} / ${fmtLabel(denominator, 6)}`,
    `dist = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function planeThrough3Points(p1: Point, p2: Point, p3: Point): PlaneCoefficients | null {
  const v1 = subtract(p2, p1)
  const v2 = subtract(p3, p1)
  const normal = cross(v1, v2)

  if (magnitude(normal) < 1e-10) return null

  const d = normal[0] * p1[0] + normal[1] * p1[1] + normal[2] * p1[2]

  return {
    a: normal[0],
    b: normal[1],
    c: normal[2],
    d
  }
}

export function planeFromEquation(equation: string): PlaneCoefficients | null {
  const eqParts = equation.split('=')
  if (eqParts.length !== 2) return null

  const d = parseFloat(eqParts[1].trim())
  const leftSide = eqParts[0].replace(/\s+/g, '')

  let a = 0, b = 0, c = 0
  const parts = leftSide.match(/[+-]?[^+-]+/g) || []

  for (const part of parts) {
    if (part.includes('x')) {
      const coeff = part.replace('x', '').trim()
      a = coeff === '' || coeff === '+' ? 1 : coeff === '-' ? -1 : parseFloat(coeff)
    } else if (part.includes('y')) {
      const coeff = part.replace('y', '').trim()
      b = coeff === '' || coeff === '+' ? 1 : coeff === '-' ? -1 : parseFloat(coeff)
    } else if (part.includes('z')) {
      const coeff = part.replace('z', '').trim()
      c = coeff === '' || coeff === '+' ? 1 : coeff === '-' ? -1 : parseFloat(coeff)
    }
  }

  return { a, b, c, d }
}

export function cuboidVolume(length: number, width: number, height: number): Measurement {
  const value = length * width * height
  const steps = [
    `V = l × w × h`,
    `V = ${length} × ${width} × ${height}`,
    `V = ${value}`
  ]
  return { value, steps }
}

export function cuboidSurfaceArea(length: number, width: number, height: number): Measurement {
  const value = 2 * (length * width + width * height + height * length)
  const steps = [
    `A = 2(lw + wh + hl)`,
    `A = 2(${length} × ${width} + ${width} × ${height} + ${height} × ${length})`,
    `A = 2(${length * width} + ${width * height} + ${height * length})`,
    `A = 2 × ${length * width + width * height + height * length}`,
    `A = ${value}`
  ]
  return { value, steps }
}

export function sphereVolume(radius: number): Measurement {
  const value = (4/3) * Math.PI * radius * radius * radius
  const steps = [
    `V = (4/3)πr³`,
    `V = (4/3)π × ${radius}³`,
    `V = (4/3)π × ${radius * radius * radius}`,
    `V = ${(4/3) * radius * radius * radius}π`,
    `V ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function sphereSurfaceArea(radius: number): Measurement {
  const value = 4 * Math.PI * radius * radius
  const steps = [
    `A = 4πr²`,
    `A = 4π × ${radius}²`,
    `A = 4π × ${radius * radius}`,
    `A = ${4 * radius * radius}π`,
    `A ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function cylinderVolume(radius: number, height: number): Measurement {
  const value = Math.PI * radius * radius * height
  const steps = [
    `V = πr²h`,
    `V = π × ${radius}² × ${height}`,
    `V = π × ${radius * radius} × ${height}`,
    `V = ${radius * radius * height}π`,
    `V ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function cylinderSurfaceArea(radius: number, height: number): Measurement {
  const value = 2 * Math.PI * radius * (radius + height)
  const steps = [
    `A = 2πr(r + h)`,
    `A = 2π × ${radius} × (${radius} + ${height})`,
    `A = 2π × ${radius} × ${radius + height}`,
    `A = ${2 * radius * (radius + height)}π`,
    `A ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function coneSlantHeight(radius: number, height: number): Measurement {
  const value = Math.sqrt(radius * radius + height * height)
  const steps = [
    `l = √(r² + h²)`,
    `l = √(${radius}² + ${height}²)`,
    `l = √(${radius * radius} + ${height * height})`,
    `l = √${radius * radius + height * height}`,
    `l = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function coneVolume(radius: number, height: number): Measurement {
  const value = (1/3) * Math.PI * radius * radius * height
  const steps = [
    `V = (1/3)πr²h`,
    `V = (1/3)π × ${radius}² × ${height}`,
    `V = (1/3)π × ${radius * radius} × ${height}`,
    `V = (1/3)π × ${radius * radius * height}`,
    `V = ${(1/3) * radius * radius * height}π`,
    `V ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function coneSurfaceArea(radius: number, height: number): Measurement {
  const slant = Math.sqrt(radius * radius + height * height)
  const value = Math.PI * radius * (radius + slant)
  const steps = [
    `A = πr(r + l)`,
    `l = √(${radius}² + ${height}²) = ${fmtLabel(slant, 6)}`,
    `A = π × ${radius} × (${radius} + ${fmtLabel(slant, 6)})`,
    `A = π × ${radius} × ${radius + slant}`,
    `A = ${radius * (radius + slant)}π`,
    `A ≈ ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function squarePyramidVolume(baseLength: number, height: number): Measurement {
  const baseArea = baseLength * baseLength
  const value = (1/3) * baseArea * height
  const steps = [
    `V = (1/3) × base area × h`,
    `V = (1/3) × ${baseLength}² × ${height}`,
    `V = (1/3) × ${baseArea} × ${height}`,
    `V = (1/3) × ${baseArea * height}`,
    `V = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function squarePyramidSurfaceArea(baseLength: number, height: number): Measurement {
  const baseArea = baseLength * baseLength
  const slantH = Math.sqrt((baseLength / 2) * (baseLength / 2) + height * height)
  const triangleArea = 4 * (0.5 * baseLength * slantH)
  const value = baseArea + triangleArea

  const steps = [
    `A = base area + 4 × (1/2 × base × slant height)`,
    `slant height = √((${baseLength}/2)² + ${height}²) = ${fmtLabel(slantH, 6)}`,
    `A = ${baseArea} + 4 × (1/2 × ${baseLength} × ${fmtLabel(slantH, 6)})`,
    `A = ${baseArea} + 4 × ${fmtLabel(0.5 * baseLength * slantH, 6)}`,
    `A = ${baseArea} + ${fmtLabel(triangleArea, 6)}`,
    `A = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

/**
 * The area of a triangle from its three sides (Heron). 3D-3B: the prism took half the product of the first two sides,
 * right only for a right angle between them, so an equilateral end of side 4 read 8 instead of 4√3.
 */
function heron(a: number, b: number, c: number): number {
  const s = (a + b + c) / 2
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)))
}

export function triangularPrismVolume(side1: number, side2: number, side3: number, length: number): Measurement {
  const triangleArea = heron(side1, side2, side3)
  const value = triangleArea * length

  const steps = [
    `V = base area × length`,
    `base area = √(s(s − a)(s − b)(s − c)) = ${fmtLabel(triangleArea, 6)}`,
    `V = ${fmtLabel(triangleArea, 6)} × ${length}`,
    `V = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}

export function triangularPrismSurfaceArea(side1: number, side2: number, side3: number, length: number): Measurement {
  // Triangle area and perimeter
  const triangleArea = heron(side1, side2, side3)
  const perimeter = side1 + side2 + side3

  // Surface area = 2 × triangle area + perimeter × length
  const value = 2 * triangleArea + perimeter * length

  const steps = [
    `A = 2 × base area + perimeter × length`,
    `base area = ${fmtLabel(triangleArea, 6)}`,
    `perimeter = ${side1} + ${side2} + ${side3} = ${perimeter}`,
    `A = 2 × ${triangleArea} + ${perimeter} × ${length}`,
    `A = ${2 * triangleArea} + ${perimeter * length}`,
    `A = ${fmtLabel(value, 6)}`
  ]
  return { value, steps }
}
