// Pure rules and formatting for parametric curves and surfaces in Graphing (Finding 4.2).
// Renders structured textbook math fields (x(t), y(t), z(t)) and parameter bounds instead of
// single horizontal-scrolling code strings like curve(...) or surface(...).

import { math, preprocess, sceneNames, splitArgs } from '../math/expr'
import type { GraphKind } from '../core/types'

export interface ParametricCurve2D {
  kind: 'curve2d'
  x: string
  y: string
  tMin: string
  tMax: string
}

export interface ParametricCurve3D {
  kind: 'curve3d'
  x: string
  y: string
  z: string
  tMin: string
  tMax: string
}

export interface ParametricSurface3D {
  kind: 'surface3d'
  x: string
  y: string
  z: string
  uMin: string
  uMax: string
  vMin: string
  vMax: string
}

export type ParametricDef = ParametricCurve2D | ParametricCurve3D | ParametricSurface3D

/** Parses a graph source or kind into a structured parametric definition. Returns null if not parametric. */
export function parseParametric(source: string, kind?: GraphKind): ParametricDef | null {
  const text = source.trim()

  const curveMatch = text.match(/^\s*curve\s*\((.+)\)\s*$/i)
  if (curveMatch) {
    const parts = splitArgs(curveMatch[1]).map((p) => p.trim())
    // 5 parts: curve(x, y, z, tMin, tMax) is always a 3D curve in space.
    // Explicit kind takes precedence; 3 parts with a formula of t in parts[2] is 3D (commands/graph.ts).
    const is3d =
      kind === 'curve3d' ||
      (kind !== 'parametric' && (parts.length >= 5 || (parts.length === 3 && /\bt\b/.test(parts[2]))))
    if (is3d) {
      return {
        kind: 'curve3d',
        x: parts[0] || 'cos(t)',
        y: parts[1] || 'sin(t)',
        z: parts[2] || 't',
        tMin: parts[3] !== undefined ? parts[3] : '0',
        tMax: parts[4] !== undefined ? parts[4] : '2 pi'
      }
    }
    // 2 to 4 parts: curve(x, y, [tMin], [tMax]) is a 2D parametric curve
    if (parts.length >= 2) {
      return {
        kind: 'curve2d',
        x: parts[0] || 'cos(t)',
        y: parts[1] || 'sin(t)',
        tMin: parts[2] !== undefined ? parts[2] : '0',
        tMax: parts[3] !== undefined ? parts[3] : '2 pi'
      }
    }
  }

  const surfMatch = text.match(/^\s*surface\s*\((.+)\)\s*$/i)
  if (surfMatch) {
    const parts = splitArgs(surfMatch[1]).map((p) => p.trim())
    if (parts.length >= 3) {
      return {
        kind: 'surface3d',
        x: parts[0],
        y: parts[1],
        z: parts[2],
        uMin: parts[3] !== undefined ? parts[3] : '0',
        uMax: parts[4] !== undefined ? parts[4] : '2 pi',
        vMin: parts[5] !== undefined ? parts[5] : '0',
        vMax: parts[6] !== undefined ? parts[6] : 'pi'
      }
    }
  }

  if (kind === 'parametric') {
    return {
      kind: 'curve2d',
      x: 'cos(t)',
      y: 'sin(t)',
      tMin: '0',
      tMax: '2 pi'
    }
  }

  if (kind === 'curve3d') {
    return {
      kind: 'curve3d',
      x: 'cos(t)',
      y: 'sin(t)',
      z: 't',
      tMin: '0',
      tMax: '2 pi'
    }
  }

  if (kind === 'psurface') {
    return {
      kind: 'surface3d',
      x: 'u',
      y: 'v',
      z: '0',
      uMin: '0',
      uMax: '2 pi',
      vMin: '0',
      vMax: 'pi'
    }
  }

  return null
}

/** Formats structured parametric fields into an executable command line. */
export function formatParametric(def: ParametricDef): string {
  if (def.kind === 'curve2d') {
    return `curve(${def.x}, ${def.y}, ${def.tMin}, ${def.tMax})`
  }
  if (def.kind === 'curve3d') {
    return `curve(${def.x}, ${def.y}, ${def.z}, ${def.tMin}, ${def.tMax})`
  }
  return `surface(${def.x}, ${def.y}, ${def.z}, ${def.uMin}, ${def.uMax}, ${def.vMin}, ${def.vMax})`
}

function cleanTeX(expr: string): string {
  if (!expr.trim()) return ''
  try {
    return math
      .parse(preprocess(expr, sceneNames()))
      .toTex({ parenthesis: 'auto' })
      .replace(/\{ /g, '{')
      .trim()
  } catch {
    return expr
      .replace(/\*/g, '')
      .replace(/\bpi\b/g, '\\pi')
      .replace(/<=/g, '\\le ')
      .replace(/>=/g, '\\ge ')
      .trim()
  }
}

function boundTeX(b: string): string {
  const trimmed = b.trim()
  if (!trimmed) return ''
  return cleanTeX(trimmed)
}

/** The cases formula part alone for a parametric card. */
function parametricCasesTeX(def: ParametricDef): string {
  if (def.kind === 'curve2d') {
    const xTex = cleanTeX(def.x)
    const yTex = cleanTeX(def.y)
    return `\\begin{cases} x(t) = ${xTex} \\\\ y(t) = ${yTex} \\end{cases}`
  }
  if (def.kind === 'curve3d') {
    const xTex = cleanTeX(def.x)
    const yTex = cleanTeX(def.y)
    const zTex = cleanTeX(def.z)
    return `\\begin{cases} x(t) = ${xTex} \\\\ y(t) = ${yTex} \\\\ z(t) = ${zTex} \\end{cases}`
  }
  const xTex = cleanTeX(def.x)
  const yTex = cleanTeX(def.y)
  const zTex = cleanTeX(def.z)
  return `\\begin{cases} x(u,v) = ${xTex} \\\\ y(u,v) = ${yTex} \\\\ z(u,v) = ${zTex} \\end{cases}`
}

/** The domain interval string alone for a parametric card. */
function parametricBoundsTeX(def: ParametricDef): string {
  if (def.kind === 'curve2d' || def.kind === 'curve3d') {
    const t0 = boundTeX(def.tMin)
    const t1 = boundTeX(def.tMax)
    return `t \\in [${t0},\\, ${t1}]`
  }
  const u0 = boundTeX(def.uMin)
  const u1 = boundTeX(def.uMax)
  const v0 = boundTeX(def.vMin)
  const v1 = boundTeX(def.vMax)
  return `u \\in [${u0},\\, ${u1}],\\; v \\in [${v0},\\, ${v1}]`
}

/** Generates textbook KaTeX representation for a parametric card. */
export function parametricToTeX(def: ParametricDef): string {
  const cases = parametricCasesTeX(def)
  const bounds = parametricBoundsTeX(def)
  return `\\begin{gathered} ${cases} \\\\[4pt] \\textstyle ${bounds} \\end{gathered}`
}
