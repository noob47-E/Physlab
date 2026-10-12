import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import { BLOCKS, themeBlock, tokenValue, contrast } from './helpers/theme'

// Math helper functions for color calculations
function srgbToLin(c: number): number {
  const v = c / 255.0
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linToXyz(r: number, g: number, b: number): [number, number, number] {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
  const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
  return [x, y, z]
}

function f(t: number): number {
  return t > Math.pow(6 / 29, 3) ? Math.pow(t, 1 / 3) : (1 / 3) * Math.pow(29 / 6, 2) * t + 4 / 29
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const xn = 0.95047, yn = 1.00000, zn = 1.08883
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function hexToLab(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const [x, y, z] = linToXyz(srgbToLin(r), srgbToLin(g), srgbToLin(b))
  return xyzToLab(x, y, z)
}

function labDist(l1: [number, number, number], l2: [number, number, number]): number {
  return Math.sqrt(Math.pow(l1[0] - l2[0], 2) + Math.pow(l1[1] - l2[1], 2) + Math.pow(l1[2] - l2[2], 2))
}

function dE(h1: string, h2: string): number {
  return labDist(hexToLab(h1), hexToLab(h2))
}

function hexToDeutanLab(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = srgbToLin(r), lg = srgbToLin(g), lb = srgbToLin(b)
  
  // Machado matrix severity 1.0
  const dr = 0.367322 * lr + 0.860646 * lg - 0.227968 * lb
  const dg = 0.280085 * lr + 0.672501 * lg + 0.047413 * lb
  const db = -0.011820 * lr + 0.042940 * lg + 0.968881 * lb
  
  const [x, y, z] = linToXyz(dr, dg, db)
  return xyzToLab(x, y, z)
}

function dEDeutan(h1: string, h2: string): number {
  return labDist(hexToDeutanLab(h1), hexToDeutanLab(h2))
}

const REQUIRED_TOKENS = [
  '--q-pos', '--q-vel', '--q-acc', '--q-force', '--q-weight', '--q-normal', '--q-friction', '--q-tension', '--q-spring', '--q-mom', '--q-heat', '--q-work',
  '--tape-track', '--tape-fill', '--tape-head', '--tape-key', '--tape-mark', '--tape-branch',
  '--sim-v-in', '--sim-v-out', '--sim-impulse', '--sim-ghost', '--sim-floor', '--sim-floor-line', '--sim-floor-major', '--sim-key-light', '--sim-fill-light', '--sim-sky-light'
]

const CONTRAST_TOKENS = [
  '--q-pos', '--q-vel', '--q-acc', '--q-force', '--q-weight', '--q-normal', '--q-friction', '--q-tension', '--q-spring', '--q-mom', '--q-heat', '--q-work',
  '--tape-head', '--tape-mark', '--sim-v-in', '--sim-v-out', '--sim-impulse'
]

const ARROW_COLORS = [
  '--q-pos', '--q-vel', '--q-acc', '--q-force', '--q-weight', '--q-normal', '--q-friction', '--q-tension', '--q-spring', '--q-mom'
]

const DEUTAN_COLORS = [
  '--q-pos', '--q-vel', '--q-acc', '--q-force', '--q-weight'
]

describe('sandbox tokens', () => {
  const css = readSource('src/renderer/src/styles.css')

  for (const [theme, selector] of Object.entries(BLOCKS)) {
    describe(`theme: ${theme}`, () => {
      let block: string
      let canvasBg: string
      const tokens: Record<string, string> = {}

      it('can be parsed and has canvas-bg', () => {
        block = themeBlock(css, selector)
        const bg = tokenValue(block, '--canvas-bg')
        expect(bg).toBeDefined()
        canvasBg = bg!
      })

      it('declares all 28 tokens exactly once as 6-digit hex', () => {
        for (const token of REQUIRED_TOKENS) {
          const matches = [...block.matchAll(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`, 'g'))]
          expect(matches.length, `${token} count`).toBe(1)
          tokens[token] = matches[0][1].toLowerCase()
        }
      })

      it('has at least 3.0 contrast for specified tokens against canvas-bg', () => {
        for (const token of CONTRAST_TOKENS) {
          const val = tokens[token]
          expect(contrast(val, canvasBg), `${token} contrast vs ${canvasBg}`).toBeGreaterThanOrEqual(3.0)
        }
      })

      it('arrow colors are pairwise at least 15 apart in dE', () => {
        for (let i = 0; i < ARROW_COLORS.length; i++) {
          for (let j = i + 1; j < ARROW_COLORS.length; j++) {
            const t1 = ARROW_COLORS[i]
            const t2 = ARROW_COLORS[j]
            const dist = dE(tokens[t1], tokens[t2])
            expect(dist, `dE ${t1} vs ${t2}`).toBeGreaterThanOrEqual(15.0)
          }
        }
      })

      it('deutan simulation colors are pairwise at least 8 apart in dE', () => {
        for (let i = 0; i < DEUTAN_COLORS.length; i++) {
          for (let j = i + 1; j < DEUTAN_COLORS.length; j++) {
            const t1 = DEUTAN_COLORS[i]
            const t2 = DEUTAN_COLORS[j]
            const dist = dEDeutan(tokens[t1], tokens[t2])
            expect(dist, `dE_deutan ${t1} vs ${t2}`).toBeGreaterThanOrEqual(8.0)
          }
        }
      })

      it('sim-floor differs from canvas-bg by contrast at least 1.15', () => {
        const floorCont = contrast(tokens['--sim-floor'], canvasBg)
        expect(floorCont, `sim-floor contrast vs canvas-bg`).toBeGreaterThanOrEqual(1.15)
      })

      it('sim-floor-major differs from sim-floor by contrast at least 1.3', () => {
        const majorCont = contrast(tokens['--sim-floor-major'], tokens['--sim-floor'])
        expect(majorCont, `sim-floor-major contrast vs sim-floor`).toBeGreaterThanOrEqual(1.3)
      })
    })
  }
})

