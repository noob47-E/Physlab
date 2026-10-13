import { describe, it, expect } from 'vitest'
import {
  stepToX,
  xToStep,
  ticks,
  markerXs,
  hitTest,
  timeText,
  durationWords,
  StripView
} from '../src/renderer/src/render/sandbox/tapeStripMath'

describe('tapeStripMath', () => {
  it('round-trips stepToX/xToStep for random seeded views', () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    for (let i = 0; i < 50; i++) {
      const first = Math.floor(random() * 1000)
      const last = first + Math.floor(random() * 1000) + 10
      const v: StripView = {
        first,
        last,
        rate: 60,
        startStep: 0,
        startTime: 0,
        width: 100 + random() * 900
      }
      
      const step = first + Math.floor(random() * (last - first))
      const x = stepToX(v, step)
      const stepBack = xToStep(v, x)
      expect(stepBack).toBe(step)
    }
  })

  it('clamps stepToX and xToStep', () => {
    const v: StripView = { first: 100, last: 500, rate: 60, startStep: 0, startTime: 0, width: 800 }
    
    expect(stepToX(v, 50)).toBe(0)
    expect(stepToX(v, 600)).toBe(800)
    
    expect(xToStep(v, -100)).toBe(100)
    expect(xToStep(v, 900)).toBe(500)
  })

  it('generates ticks for a 4 s tape at 600 px with 0.5 s or 1 s spacing and >= 60 px gaps', () => {
    // A 4 s tape (e.g. 240 steps at 60 rate)
    const v: StripView = { first: 0, last: 240, rate: 60, startStep: 0, startTime: 0, width: 600 }
    const t = ticks(v, 60)
    
    // Check spacing between first two ticks
    expect(t.length).toBeGreaterThan(1)
    const dt = t[1].step - t[0].step
    const dtSec = dt / 60
    expect(dtSec === 0.5 || dtSec === 1).toBe(true)

    // Check gaps >= 60px
    for (let i = 1; i < t.length; i++) {
      expect(t[i].x - t[i-1].x).toBeGreaterThanOrEqual(60 - 1e-9)
    }

    // Check labels
    const labels = t.map(tk => tk.label)
    expect(labels).toContain('0 s')
    expect(labels).toContain('1 s')
  })

  it('generates ticks for a 300 s tape using minutes', () => {
    const v: StripView = { first: 0, last: 18000, rate: 60, startStep: 0, startTime: 0, width: 600 }
    const t = ticks(v, 60)
    
    expect(t.some(tk => tk.label.includes('min'))).toBe(true)
  })

  it('markerXs merges nearby markers (2 markers 1 px apart, keeps both at 10 px apart)', () => {
    const v: StripView = { first: 0, last: 100, rate: 60, startStep: 0, startTime: 0, width: 100 }
    // width=100, last-first=100 => 1 step = 1 px
    
    // 1 px apart, min gap = 3
    let m = markerXs(v, [10, 11], 3)
    expect(m.length).toBe(1)
    expect(m[0].step).toBe(10)
    
    // 10 px apart, min gap = 3
    m = markerXs(v, [10, 20], 3)
    expect(m.length).toBe(2)
    expect(m[0].step).toBe(10)
    expect(m[1].step).toBe(20)
  })

  it('hitTest finds the nearest within 8 px and null beyond', () => {
    const v: StripView = { first: 0, last: 100, rate: 60, startStep: 0, startTime: 0, width: 100 }
    const markers = [{ step: 10, x: 10 }, { step: 30, x: 30 }]
    
    expect(hitTest(v, 15, markers, 8)).toBe(10) // distance = 5 <= 8
    expect(hitTest(v, 20, markers, 8)).toBe(null) // distance = 10 > 8
  })

  it('timeText(0.78333, 188) = "t = 0.783 s · step 188"', () => {
    expect(timeText(0.78333, 188)).toBe('t = 0.783 s · step 188')
    // Additional test for step formatting
    expect(timeText(0.78333, 1234)).toBe('t = 0.783 s · step 1234')
  })

  it('durationWords outputs as required', () => {
    expect(durationWords(100)).toBe('1 min 40 s')
    expect(durationWords(45)).toBe('45 s')
    expect(durationWords(7500)).toBe('2 h 5 min')
  })

  it('no output contains e- or ^', () => {
    const outputs = [
      durationWords(0.0001),
      durationWords(1000000),
      timeText(0.000001, 10),
      timeText(1000000, 1000000)
    ]
    for (const out of outputs) {
      expect(out).not.toContain('e-')
      expect(out).not.toContain('e+')
      expect(out).not.toContain('^')
    }
  })
})
