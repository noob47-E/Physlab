// The typeset view of a graph line (T983): the line's text as TeX, for the Expressions panel. It reads
// each side of the line with the app's own reader (preprocess, then mathjs parse) and asks mathjs for
// the TeX of the tree, so there is no second parser here. A line that does not read gives no TeX and
// the panel shows the plain text.

import { math, preprocess, sceneNames } from '../math/expr'

type LineTex = { ok: true; tex: string } | { ok: false }

const RELATIONS = ['<=', '>=', '!=', '=', '<', '>'] as const
const TEX_SIGN: Record<string, string> = { '<=': '\\le', '>=': '\\ge', '!=': '\\ne', '=': '=', '<': '<', '>': '>' }

/** Splits a line at its relation signs outside any bracket: "y = x^2" gives ["y", "=", "x^2"]. */
function splitRelations(text: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (depth === 0) {
      const sign = RELATIONS.find((r) => text.startsWith(r, i))
      if (!sign) continue
      parts.push(text.slice(from, i).trim(), sign)
      i += sign.length - 1
      from = i + 1
    }
  }
  if (depth !== 0) return null
  parts.push(text.slice(from).trim())
  return parts
}

/** A function written without brackets, sin 2x or ln x, gets them: the reader wants sin(2x). */
function bracketBareCalls(side: string): string {
  return side.replace(/\b(sin|cos|tan|ln|log|exp|sqrt)\s+([A-Za-z0-9.]+)/g, '$1($2)')
}

function sideTex(side: string): string | null {
  if (!side) return null
  try {
    return math.parse(preprocess(bracketBareCalls(side), sceneNames())).toTex({ parenthesis: 'auto' }).replace(/\{ /g, '{').trim()
  } catch {
    return null
  }
}

/** The TeX of one graph line, or { ok: false } when the line does not read. Never throws. */
export function graphLineToTeX(text: string): LineTex {
  const parts = splitRelations(text.trim())
  if (!parts || parts.length === 0) return { ok: false }
  let tex = ''
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      tex += ` ${TEX_SIGN[parts[i]]} `
      continue
    }
    const side = sideTex(parts[i])
    if (side === null) return { ok: false }
    tex += side
  }
  return { ok: true, tex }
}


