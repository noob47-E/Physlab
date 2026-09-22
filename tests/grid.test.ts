// The grid used to be built from a canvas that had no size yet: zero-length lines, cached as done,
// leaving the viewport black on the first open until something else asked for a new frame.

import { describe, expect, it } from 'vitest'
import {
  circleSegments,
  clipLine,
  DOT_HALF_PX,
  dotQuads,
  finiteArea,
  gridKey,
  gridVertices,
  GRID_STYLES,
  hexCentre,
  hexCorners,
  isoPoint,
  MIN_MINOR_PX,
  minorStepOf,
  needsGridRebuild,
  normaliseGridStyle,
  POLAR_RAYS,
  polarRange,
  snapStep,
  snapToGrid,
  styleFor3D,
  usableSize
} from '../src/renderer/src/render/gridMath'
import { readSource } from './helpers/repo'
import { axisTitle, ringLabels, tickDecimals, tickText } from '../src/renderer/src/render/gridLabels'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { labelPoints } from '../src/renderer/src/math/graphs'
import type { V3 } from '../src/renderer/src/math/vec'

const area = (xMin: number, xMax: number, yMin: number, yMax: number) => ({ xMin, xMax, yMin, yMax })

describe('a frame before the canvas has a size', () => {
  it('is never usable', () => {
    expect(usableSize({ width: 0, height: 0 })).toBe(false)
    expect(usableSize({ width: 1200, height: 0 })).toBe(false)
    expect(usableSize({ width: 1, height: 1 })).toBe(false)
    expect(usableSize({ width: NaN, height: 800 })).toBe(false)
    expect(usableSize({ width: 1200, height: 800 })).toBe(true)
  })

  it('collapses the visible area to nothing, which is rejected', () => {
    // orthoBounds() with width = height = 0 gives exactly this.
    expect(finiteArea(area(0, 0, 0, 0))).toBe(false)
    expect(finiteArea(area(-12, 12, NaN, 9))).toBe(false)
    expect(finiteArea(area(-12, 12, -9, 9))).toBe(true)
  })
})

describe('deciding when to rebuild the grid', () => {
  const built = { key: gridKey(1, { width: 1200, height: 800 }, 50), ...area(-24, 24, -16, 16) }

  it('leaves a grid alone while the view stays inside it', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), built.key)).toBe(false)
  })

  it('rebuilds when the view moves outside what was built', () => {
    expect(needsGridRebuild(built, area(-30, 12, -8, 8), built.key)).toBe(true)
    expect(needsGridRebuild(built, area(-12, 12, -8, 20), built.key)).toBe(true)
  })

  it('rebuilds when the spacing changes', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(2, { width: 1200, height: 800 }, 50))).toBe(true)
  })

  it('rebuilds when the panel is resized at the same spacing', () => {
    // Without the size in the key a panel that grew kept the grid it had when it was small.
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(1, { width: 1600, height: 800 }, 50))).toBe(true)
  })

  it('always rebuilds over the empty cache a zero-size frame used to leave behind', () => {
    const poisoned = { key: gridKey(1, { width: 0, height: 0 }, 1), ...area(0, 0, 0, 0) }
    expect(needsGridRebuild(poisoned, area(-12, 12, -8, 8), gridKey(1, { width: 1200, height: 800 }, 50))).toBe(true)
  })
})

describe('anchoring a graph name', () => {
  it('finds nothing to anchor to when the curve has no points', () => {
    // x² + y² = −1 has no solution in view: an empty segment list used to become [undefined],
    // and projecting that crashed the viewport on every frame.
    expect(labelPoints({ polylines: [], segments: [] })).toBeUndefined()
    expect(labelPoints({ polylines: [] })).toBeUndefined()
    expect(labelPoints({ polylines: [[]], segments: [] })).toBeUndefined()
  })

  it('uses the curve when there is one', () => {
    const a: V3 = [1, 2, 0]
    const b: V3 = [3, 4, 0]
    expect(labelPoints({ polylines: [[a, b]] })).toEqual([a, b])
    expect(labelPoints({ polylines: [], segments: [a, b] })).toEqual([a])
  })
})

describe('numbering the axes', () => {
  const grid: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }

  it('writes whole ticks without decimals and fractional ticks with just enough', () => {
    expect(tickText(2, 1, grid)).toBe('2')
    expect(tickText(-3, 1, grid)).toBe('−3')
    expect(tickText(0.5, 0.5, grid)).toBe('0.5')
    expect(tickText(0.75, 0.25, grid)).toBe('0.75')
    expect(tickText(0, 0.25, grid)).toBe('0')
  })

  it("follows the drawing's scale and unit, as the Measure panel does", () => {
    // 1 square = 2.5 cm: the tick at grid 2 is 5 cm, and the picture must say so.
    const cm: MeasureSettings = { ...grid, unit: 'cm', unitPerSquare: 2.5 }
    expect(tickText(2, 1, cm)).toBe('5')
    expect(tickText(1, 1, cm)).toBe('2.5')
    expect(tickText(0.5, 0.5, cm)).toBe('1.25')
    expect(axisTitle('x', cm)).toBe('x (cm)')
    expect(axisTitle('x', grid)).toBe('x')
  })

  it('ignores a significant-figures setting, which would number the axis 1.00, 2.00, 3.00', () => {
    const sf: MeasureSettings = { ...grid, precisionMode: 'sf', decimals: 3 }
    expect(tickText(2, 1, sf)).toBe('2')
    expect(tickText(0.5, 0.5, sf)).toBe('0.5')
  })

  it("never runs past the user's decimal places when the scale does not terminate", () => {
    // 1 square = 0.3333333 cm, typed into the scale box: the step needs seven decimals to be exact,
    // and the axis would read 0.3333333, 0.6666666… on every line.
    const thirds: MeasureSettings = { ...grid, unit: 'cm', unitPerSquare: 0.3333333, decimals: 2 }
    expect(tickText(1, 1, thirds)).toBe('0.33')
    expect(tickText(2, 1, thirds)).toBe('0.67')
    expect(tickText(3, 1, thirds)).toBe('1')
    // In significant-figures mode there is no number of decimals to lean on; four is the most.
    const sfThirds: MeasureSettings = { ...thirds, precisionMode: 'sf', decimals: 3 }
    expect(tickText(1, 1, sfThirds)).toBe('0.3333')
    // A setting of 0 decimal places still leaves one, or 0.5 and 1 would both read "1".
    expect(tickText(0.5, 0.5, { ...grid, decimals: 0 })).toBe('0.5')
  })

  it('never shows −0 or floating-point dust', () => {
    expect(tickText(-0, 1, grid)).toBe('0')
    expect(tickText(3 * 0.1, 0.1, grid)).toBe('0.3')
  })

  it('knows how many decimals a step needs', () => {
    expect(tickDecimals(1)).toBe(0)
    expect(tickDecimals(10)).toBe(0)
    expect(tickDecimals(0.5)).toBe(1)
    expect(tickDecimals(0.25)).toBe(2)
    expect(tickDecimals(2.5)).toBe(1)
    expect(tickDecimals(0)).toBe(0)
  })
})

describe('grid styles', () => {
  // A 4 × 3 area with a major line every 1 and a minor line every 0.25.
  const box = area(0, 4, 0, 3)
  const lines = (flat: number[]) => flat.length / 6
  const crossings = (minor: number) => (Math.floor(4 / minor) + 1) * (Math.floor(3 / minor) + 1)

  it('lines: a minor line at every minor step and a major one at every major step', () => {
    const v = gridVertices('lines', box, 1, 0.25)
    expect(lines(v.minor)).toBe(17 + 13)
    expect(lines(v.major)).toBe(5 + 4)
    expect(v.dots).toEqual([])
  })

  it('dots: one vertex per crossing of the minor grid and no lines at all', () => {
    const v = gridVertices('dots', box, 1, 0.25)
    expect(v.minor).toEqual([])
    expect(v.major).toEqual([])
    expect(v.dots.length / 3).toBe(crossings(0.25))
    // The first dot is the bottom-left crossing, at the given height.
    expect(v.dots.slice(0, 3)).toEqual([0, 0, 0])
    expect(gridVertices('dots', box, 1, 0.25, 0.5).dots[2]).toBe(0.5)
  })

  it('fine: halves the minor step and keeps the major lines', () => {
    const v = gridVertices('fine', box, 1, 0.25)
    expect(lines(v.minor)).toBe(33 + 25)
    expect(lines(v.major)).toBe(5 + 4)
  })

  it('paper: the same lines as lines (the tint is the canvas colour, not a vertex)', () => {
    expect(gridVertices('paper', box, 1, 0.25)).toEqual(gridVertices('lines', box, 1, 0.25))
  })

  it('puts every vertex at the asked-for height', () => {
    const v = gridVertices('lines', box, 1, 0.5, 2)
    for (let i = 2; i < v.minor.length; i += 3) expect(v.minor[i]).toBe(2)
  })

  it('changes the cache key with the style, so a switch rebuilds the grid', () => {
    const size = { width: 1200, height: 800 }
    const keys = new Set(GRID_STYLES.map((g) => gridKey(1, size, 50, g.id)))
    expect(keys.size).toBe(GRID_STYLES.length)
    expect(gridKey(1, size, 50)).toBe(gridKey(1, size, 50, 'lines'))
  })

  it('lists the seven styles in the order every picker shows them, each with a plain label and hint', () => {
    expect(GRID_STYLES.map((g) => g.id)).toEqual(['lines', 'dots', 'fine', 'paper', 'polar', 'isometric', 'hex'])
    for (const g of GRID_STYLES) {
      expect(g.hint.length).toBeGreaterThan(10)
      expect(g.label).toMatch(/^[A-Z]/)
      // Nothing a student would read as code: no identifiers, brackets or quotes.
      expect(`${g.label} ${g.hint}`).not.toMatch(/[_{}[\]()<>"'`]/)
    }
    // The View menu, the right-click menu and the search box all map the same list, so a new
    // style appears in every one of them without a second list to keep in step.
    for (const f of ['src/renderer/src/app/TopBar.tsx', 'src/renderer/src/app/contextActions.ts', 'src/renderer/src/app/SearchPalette.tsx', 'src/renderer/src/render/Viewport.tsx']) {
      expect(readSource(f), f).toContain('GRID_STYLES.map(')
    }
  })

  it('reads a saved style back, and draws lines for one it has never heard of', () => {
    expect(normaliseGridStyle('polar')).toBe('polar')
    expect(normaliseGridStyle('hex')).toBe('hex')
    expect(normaliseGridStyle('nonsense')).toBe('lines')
    expect(normaliseGridStyle(undefined)).toBe('lines')
    expect(normaliseGridStyle(3)).toBe('lines')
    // Both readers of the setting go through it, so an unknown word never reaches gridVertices.
    expect(readSource('src/renderer/src/render/Grid.tsx')).toMatch(/useScene\(\(s\) => normaliseGridStyle\(s\.settings\.gridStyle\)\)/)
    expect(readSource('src/renderer/src/render/Interaction.tsx')).toMatch(/normaliseGridStyle\(s\.settings\.gridStyle\)/)
    // The 3D floor draws lines for the flat patterns.
    expect(styleFor3D('polar')).toBe('lines')
    expect(styleFor3D('isometric')).toBe('lines')
    expect(styleFor3D('hex')).toBe('lines')
    expect(styleFor3D('dots')).toBe('dots')
    expect(readSource('src/renderer/src/render/Grid.tsx')).toMatch(/styleFor3D\(normaliseGridStyle\(s\.settings\.gridStyle\)\)/)
  })

  it('the pickers normalise a saved style too, so an unknown one shows the lines that are drawn', () => {
    // Grid.tsx falls back to lines for a style this build does not know; the <select>, the View
    // menu and the right-click menu must read the same value or they show nothing selected.
    expect(readSource('src/renderer/src/render/Viewport.tsx')).toMatch(/useScene\(\(s\) => normaliseGridStyle\(s\.settings\.gridStyle\)\)/)
    expect(readSource('src/renderer/src/app/TopBar.tsx')).toMatch(/useScene\(\(s\) => normaliseGridStyle\(s\.settings\.gridStyle\)\)/)
    expect(readSource('src/renderer/src/app/contextActions.ts')).toMatch(/normaliseGridStyle\(st\.settings\.gridStyle\)/)
  })

  it('the View menu ticks the grid that is showing, the way it ticks the theme', () => {
    // `on` alone puts a class on the row that the menu never styles; the tick the student sees
    // is the shortcut text, which is how the theme rows do it. With Paper on, the five Grid rows
    // showed no mark at all.
    const src = readSource('src/renderer/src/app/TopBar.tsx')
    const view = src.match(/label="View"[\s\S]*?label="Help"/)?.[0] ?? ''
    const rows = view.match(/GRID_STYLES\.map\([\s\S]*?\n\s*\}\),/)?.[0] ?? ''
    expect(rows).toMatch(/const current = showGrid && gridStyle === g\.id/)
    expect(rows).toMatch(/sc: current \? '✓' : undefined/)
    // The row names the style alone ("Grid: polar"), not the two-line picker label.
    expect(rows).toMatch(/g\.label\.split\(' — '\)\[0\]\.toLowerCase\(\)/)
    expect(view).toMatch(/label: 'Grid: off', sc: showGrid \? undefined : '✓'/)
    // And the themes still use the same mark, so the menu reads as one.
    expect(view).toMatch(/sc: theme === id \? '✓' : undefined/)
  })

  it('draws each dot as a small square, two triangles wide enough to be seen', () => {
    // WebGPU draws a THREE.Points vertex as one device pixel and ignores PointsMaterial.size,
    // so the dots style was invisible on the default renderer; each dot is a quad instead.
    const q = dotQuads([1, 2, 0, 3, 4, 0.5], 0.1)
    expect(q.length).toBe(2 * 18)
    const xs = q.filter((_, i) => i % 3 === 0).slice(0, 6)
    const ys = q.filter((_, i) => i % 3 === 1).slice(0, 6)
    expect(Math.min(...xs)).toBeCloseTo(0.9)
    expect(Math.max(...xs)).toBeCloseTo(1.1)
    expect(Math.min(...ys)).toBeCloseTo(1.9)
    expect(Math.max(...ys)).toBeCloseTo(2.1)
    // Each vertex keeps its dot's height, and both triangles wind the same way (a and c share a diagonal).
    expect(q.slice(18).filter((_, i) => i % 3 === 2)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    expect(q.slice(0, 3)).toEqual(q.slice(9, 12))
    expect(dotQuads([], 1)).toEqual([])
    // Three pixels across: a two-pixel square off the pixel grid blends to a smudge.
    expect(DOT_HALF_PX * 2).toBe(3)
    const grid = readSource('src/renderer/src/render/Grid.tsx')
    expect(grid).not.toMatch(/new THREE\.Points(Material)?\(/)
    expect(grid).toContain('dotQuads(')
  })
})

describe('the step a point snaps to', () => {
  it('is the minor step of the grid: four squares to a major line that starts with 2, five otherwise', () => {
    expect(minorStepOf(1)).toBe(0.2)
    expect(minorStepOf(2)).toBe(0.5)
    expect(minorStepOf(0.2)).toBe(0.05)
    expect(minorStepOf(5)).toBe(1)
    expect(minorStepOf(20)).toBe(5)
  })

  it('halves with the fine style, as the drawn grid does, and is unchanged by the others', () => {
    // Before this, Fine drew squares of minor/2 while a point still snapped to every second crossing.
    expect(snapStep(0.25, 'fine')).toBe(0.125)
    for (const style of ['lines', 'dots', 'paper'] as const) expect(snapStep(0.25, style)).toBe(0.25)
    const box = area(0, 4, 0, 3)
    expect(gridVertices('fine', box, 1, 0.25).minor.length / 6).toBe(Math.floor(4 / snapStep(0.25, 'fine')) + 1 + Math.floor(3 / snapStep(0.25, 'fine')) + 1)
    // Interaction.tsx snaps by the same rule the grid is drawn by.
    const interaction = readSource('src/renderer/src/render/Interaction.tsx')
    expect(interaction).toMatch(/snapStep\(g\.minor, g\.style\)/)
    expect(interaction).toMatch(/snapToGrid\(grid\.style, w, grid\.major, grid\.minor\)/)
    expect(readSource('src/renderer/src/render/Grid.tsx')).toContain('minorStepOf(majorStep)')
  })
})

describe('the axes switch', () => {
  // `showAxes` was drawn correctly from the start but reachable only as a View menu row; a
  // student looking at the grid picker, the right-click menu or the search box never found it.
  it('round-trips through setSettings and starts on', async () => {
    const { useScene } = await import('../src/renderer/src/core/store')
    const scene = () => useScene.getState()
    scene().newScene()
    expect(scene().settings.showAxes).toBe(true)
    scene().setSettings({ showAxes: false })
    expect(scene().settings.showAxes).toBe(false)
    // The grid is untouched by the axes switch: a student can have a grid with no axes.
    expect(scene().settings.showGrid).toBe(true)
    scene().setSettings({ showAxes: true })
    expect(scene().settings.showAxes).toBe(true)
  })

  it('is not part of the cached grid geometry, so toggling it needs no rebuild', () => {
    // The axes are their own FatLines, shown or hidden by React; the lines, dots and their
    // cache key know nothing about them. A rebuild on every toggle would be wasted work, and a
    // key that ignored a *drawn* part would be the black-viewport bug again — so this pins both:
    // the key has no axes term, and the drawing reads the flag outside the cache.
    const size = { width: 1200, height: 800 }
    expect(gridKey(1, size, 50, 'lines')).not.toContain('axes')
    const grid = readSource('src/renderer/src/render/Grid.tsx')
    expect(grid).not.toMatch(/gridKey\([^)]*showAxes/)
    expect(grid).toMatch(/\{showAxes && axes\.x\.length > 0 && \(/)
    expect(grid).toMatch(/\{showAxes && \(\s*<>\s*<FatLine points=\{\[\[-h, 0, 0\]/)
  })

  it('takes the tick numbers and the x/y titles with it, in 2D and 3D', () => {
    // The tick labels are HTML spans placed every frame; the ones not placed in a frame are hidden
    // by `ticks.end()`. Both grids place every tick and title inside `if (showAxes)`, and call
    // `end()` outside it, so hiding the axes hides their numbers on the same frame.
    const grid = readSource('src/renderer/src/render/Grid.tsx')
    const frames = grid.match(/ticks\.begin\(\)[\s\S]*?ticks\.end\(\)/g) ?? []
    expect(frames.length).toBe(2)
    for (const f of frames) {
      expect(f).toMatch(/ticks\.begin\(\)\s*\n\s*if \(showAxes\) \{/)
      expect(f).toMatch(/\}\s*\n\s*ticks\.end\(\)$/)
      // Every place() sits inside the showAxes block: nothing between begin() and the if.
      expect(f.indexOf('ticks.place')).toBeGreaterThan(f.indexOf('if (showAxes)'))
      expect(f).toContain("axisTitle('x', settings)")
      expect(f).toContain("axisTitle('y', settings)")
    }
    expect(readSource('src/renderer/src/render/overlay.ts')).toMatch(/end\(\) \{\s*for \(let i = this\.used; i < this\.spans\.length; i\+\+\) this\.spans\[i\]\.style\.display = 'none'/)
  })

  it('is offered wherever the grid style is, with the same word and a tick', () => {
    const picker = readSource('src/renderer/src/render/Viewport.tsx').match(/function GridStylePicker\(\)[\s\S]*?\n\}/)?.[0] ?? ''
    expect(picker).toMatch(/aria-pressed=\{showAxes\}/)
    expect(picker).toMatch(/\{showAxes \? '✓ Axes' : 'Axes'\}/)
    expect(picker).toMatch(/setSettings\(\{ showAxes: !showAxes \}\)/)
    const menu = readSource('src/renderer/src/app/contextActions.ts').match(/title: 'Grid',[\s\S]*?\]\s*\}/)?.[0] ?? ''
    expect(menu).toMatch(/label: 'Axes', hint: [^,]+, checked: showAxes, run: \(\) => st\.setSettings\(\{ showAxes: !showAxes \}\)/)
    const palette = readSource('src/renderer/src/app/SearchPalette.tsx')
    expect(palette).toMatch(/title: 'Axes: show'.*setSettings\(\{ showAxes: true \}\)/)
    expect(palette).toMatch(/title: 'Axes: hide'.*setSettings\(\{ showAxes: false \}\)/)
    const view = readSource('src/renderer/src/app/TopBar.tsx').match(/label="View"[\s\S]*?label="Help"/)?.[0] ?? ''
    expect(view).toMatch(/label: 'Axes', sc: showAxes \? '✓' : undefined, on: showAxes/)
  })

  it('is found in the search box by the singular a student types', async () => {
    // `score` matches the title and the hint; the titles say "Axes", so "axis", "hide axis" and
    // "x axis" once found only the angle marks. The hints carry the singular. The rows are read
    // from the source and scored by the real scorer.
    const { score } = await import('../src/renderer/src/app/SearchPalette')
    const palette = readSource('src/renderer/src/app/SearchPalette.tsx')
    const rows = [...palette.matchAll(/title: '(Axes: \w+)', hint: '([^']+)'/g)].map((m) => ({ group: 'Settings', title: m[1], hint: m[2], run: () => {} }))
    expect(rows.map((r) => r.title)).toEqual(['Axes: show', 'Axes: hide'])
    for (const q of ['axes', 'axis', 'x axis', 'hide axis', 'show axis']) {
      const hit = rows.filter((r) => score(r, q) > 0).map((r) => r.title)
      expect(hit, q).toContain(q.startsWith('show') ? 'Axes: show' : 'Axes: hide')
    }
    // An unrelated row does not match through the hint by accident.
    expect(score({ group: 'Settings', title: 'Angle marks: hide', hint: 'The arcs at the corners', run: () => {} }, 'axis')).toBe(0)
  })
})

describe('the polar grid', () => {
  // A 4 × 4 box round the origin, a major circle every 1, a minor every 0.5, at 20 px a minor step.
  const box = area(-2, 2, -2, 2)
  const wpp = 0.5 / 20
  const segments = (flat: number[]) => flat.length / 6
  const radii = (flat: number[]) => {
    const rs = new Set<number>()
    for (let i = 0; i < flat.length; i += 3) rs.add(Math.round(Math.hypot(flat[i], flat[i + 1]) * 1e6) / 1e6)
    return [...rs].sort((a, b) => a - b)
  }

  it('draws a circle at every step, the major ones apart, and a ray every 15°', () => {
    const v = gridVertices('polar', box, 1, 0.5, 0, wpp)
    // The far corner is 2√2 ≈ 2.83 away: minor circles at 0.5, 1.5, 2.5; major at 1, 2.
    expect(radii(v.minor)).toEqual([0.5, 1.5, 2.5])
    const minorCount = [0.5, 1.5, 2.5].reduce((n, r) => n + circleSegments(r / wpp), 0)
    expect(segments(v.minor)).toBe(minorCount)
    const majorCount = [1, 2].reduce((n, r) => n + circleSegments(r / wpp), 0)
    expect(segments(v.major)).toBe(majorCount + POLAR_RAYS)
    expect(POLAR_RAYS).toBe(24)
    expect(v.dots).toEqual([])
  })

  it('puts every point of a circle at a whole number of steps from the origin', () => {
    const v = gridVertices('polar', box, 1, 0.5, 0.25, wpp)
    for (let i = 0; i < v.minor.length; i += 3) {
      const r = Math.hypot(v.minor[i], v.minor[i + 1]) / 0.5
      expect(Math.abs(r - Math.round(r))).toBeLessThan(1e-9)
      expect(v.minor[i + 2]).toBe(0.25)
    }
    // The rays are the last 24 segments of the major list, each from the origin along a multiple of 15°.
    const rays = v.major.slice(-POLAR_RAYS * 6)
    for (let n = 0; n < POLAR_RAYS; n++) {
      const [x0, y0, , x1, y1] = rays.slice(n * 6, n * 6 + 6)
      expect(Math.hypot(x0, y0)).toBe(0)
      const angle = Math.atan2(y1, x1) / (Math.PI / 12)
      expect(Math.abs(angle - Math.round(angle))).toBeLessThan(1e-9)
    }
  })

  it('keeps the biggest circle round: chords bulge less than a fifth of a pixel and never fewer than 48', () => {
    expect(circleSegments(10)).toBe(48)
    expect(circleSegments(0)).toBe(48)
    for (const rPx of [100, 1000, 20000]) {
      const n = circleSegments(rPx)
      const sagitta = rPx * (1 - Math.cos(Math.PI / n))
      expect(sagitta, `r = ${rPx} px`).toBeLessThanOrEqual(0.2 + 1e-9)
      expect(n).toBeGreaterThanOrEqual(48)
    }
    // Growing with √r keeps the whole grid affordable: a hundred circles at 20 px a step stay well under 200k numbers.
    let floats = 0
    for (let k = 1; k <= 100; k++) floats += 6 * circleSegments(20 * k)
    expect(floats).toBeLessThan(200_000)
  })

  it('still draws its circles when the origin is off the page, and only the slice that shows', () => {
    const far = area(10, 14, 1, 4)
    const { rMin, rMax, span } = polarRange(far)
    expect(rMin).toBeCloseTo(Math.hypot(10, 1))
    expect(rMax).toBeCloseTo(Math.hypot(14, 4))
    expect(span).toBeLessThan(Math.PI)
    const v = gridVertices('polar', far, 1, 0.5, 0, wpp)
    expect(radii(v.minor).length).toBeGreaterThan(0)
    for (const r of radii(v.minor)) expect(r).toBeGreaterThanOrEqual(rMin - 1e-9)
    // Every drawn point lies in a direction some point of the box lies in, so nothing is spent on the far side of the circle.
    for (let i = 0; i < v.minor.length; i += 3) {
      const t = Math.atan2(v.minor[i + 1], v.minor[i])
      expect(t).toBeGreaterThanOrEqual(Math.atan2(1, 14) - 0.2)
      expect(t).toBeLessThanOrEqual(Math.atan2(4, 10) + 0.2)
    }
    // Round the origin the whole turn is drawn.
    expect(polarRange(box).span).toBeCloseTo(2 * Math.PI)
    expect(polarRange(box).rMin).toBe(0)
    // A box straddling the negative x axis, where the angles wrap from +π to −π.
    const behind = area(-14, -10, -2, 2)
    const r = polarRange(behind)
    expect(r.span).toBeLessThan(Math.PI)
    expect(r.span).toBeGreaterThan(0)
  })

  it('drops the minor circles when a step is too small to see', () => {
    expect(MIN_MINOR_PX).toBe(8)
    const v = gridVertices('polar', box, 1, 0.5, 0, 0.5 / 4)
    expect(v.minor).toEqual([])
    expect(segments(v.major)).toBeGreaterThan(POLAR_RAYS)
  })

  it('labels the rays with fractions of π, or whole degrees, following the angle unit', () => {
    const rad = ringLabels('rad')
    expect(rad.length).toBe(16)
    expect(rad.map((l) => l.text)).toEqual(['0', 'π/6', 'π/4', 'π/3', 'π/2', '2π/3', '3π/4', '5π/6', 'π', '7π/6', '5π/4', '4π/3', '3π/2', '5π/3', '7π/4', '11π/6'])
    for (const l of rad) expect(l.text).not.toMatch(/\d\.\d/)
    const deg = ringLabels('deg')
    expect(deg.map((l) => l.text)).toEqual(['0°', '30°', '45°', '60°', '90°', '120°', '135°', '150°', '180°', '210°', '225°', '240°', '270°', '300°', '315°', '330°'])
    for (let i = 0; i < 16; i++) expect(deg[i].angle).toBeCloseTo(rad[i].angle)
    expect(rad[1].angle).toBeCloseTo(Math.PI / 6)
    // The labels follow the setting and sit with the axis ticks, under the same showAxes switch.
    const grid = readSource('src/renderer/src/render/Grid.tsx')
    expect(grid).toContain('ringLabels(settings.angleUnit)')
    // "Grid: off" clears showGrid and leaves gridStyle 'polar': the labels go with the circles.
    expect(grid).toMatch(/showGrid && gridStyle === 'polar'/)
    expect(readSource('src/renderer/src/render/gridLabels.ts')).not.toContain('.toFixed(')
  })
})

describe('the isometric grid', () => {
  const box = area(-3, 3, -2, 2)
  const s = 0.5
  const h = (s * Math.sqrt(3)) / 2
  // Which of the three families a segment belongs to, by the direction it runs in.
  const familyOf = (x0: number, y0: number, x1: number, y1: number) => {
    const t = ((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI + 360) % 180
    return Math.round(t / 60) % 3
  }
  const onLine = (x: number, y: number, family: number) => {
    // Each family's lines are k·pitch apart along its normal; every point must be on one.
    const k = family === 0 ? y / h : family === 1 ? x / s - y / (Math.sqrt(3) * s) : x / s + y / (Math.sqrt(3) * s)
    return Math.abs(k - Math.round(k)) < 1e-9
  }

  it('draws three line families at 0°, 60° and 120° with every vertex on a lattice line', () => {
    const v = gridVertices('isometric', box, 2.5, s, 0, s / 20)
    const families = new Set<number>()
    for (const list of [v.minor, v.major]) {
      for (let i = 0; i < list.length; i += 6) {
        const [x0, y0, , x1, y1] = list.slice(i, i + 6)
        const f = familyOf(x0, y0, x1, y1)
        families.add(f)
        expect(onLine(x0, y0, f), `${x0},${y0}`).toBe(true)
        expect(onLine(x1, y1, f), `${x1},${y1}`).toBe(true)
        // Clipped to the box, not drawn to the horizon.
        for (const c of [x0, x1]) expect(Math.abs(c) <= 3 + 1e-9).toBe(true)
        for (const c of [y0, y1]) expect(Math.abs(c) <= 2 + 1e-9).toBe(true)
      }
    }
    expect([...families].sort()).toEqual([0, 1, 2])
    // Every fifth line is heavy, so the big triangles have side `major`.
    expect(v.major.length).toBeGreaterThan(0)
    expect(v.major.length).toBeLessThan(v.minor.length)
    expect(v.dots).toEqual([])
  })

  it('passes through the lattice points the snap uses, so the two agree', () => {
    const v = gridVertices('isometric', box, 2.5, s)
    const [px, py] = isoPoint(1, 1, s)
    expect([px, py]).toEqual([0.75, h])
    // (i + j/2, j·√3/2)·s lies on one line of every family.
    for (let f = 0; f < 3; f++) expect(onLine(px, py, f)).toBe(true)
    expect(v.minor.length).toBeGreaterThan(0)
  })

  it('clips a lattice line to the box and drops one that misses', () => {
    expect(clipLine([0, 0], [1, 0], area(-1, 1, -1, 1))).toEqual([-1, 0, 1, 0])
    expect(clipLine([0, 5], [1, 0], area(-1, 1, -1, 1))).toBeNull()
    const d = clipLine([0, 0], [1, 1], area(-1, 1, -1, 1))!
    expect(d[0]).toBeCloseTo(-1)
    expect(d[3]).toBeCloseTo(1)
  })
})

describe('the hexagon grid', () => {
  const a = 1
  const box = area(-4, 4, -3, 3)

  it('draws each shared edge once, every edge one major step long, a dot at each centre', () => {
    const v = gridVertices('hex', box, a, 0.2)
    expect(v.minor).toEqual([])
    const seen = new Set<string>()
    const key = (x: number, y: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`
    for (let i = 0; i < v.major.length; i += 6) {
      const [x0, y0, , x1, y1] = v.major.slice(i, i + 6)
      expect(Math.abs(Math.hypot(x1 - x0, y1 - y0) - a)).toBeLessThan(1e-9)
      const e = [key(x0, y0), key(x1, y1)].sort().join('|')
      expect(seen.has(e), e).toBe(false)
      seen.add(e)
    }
    // One centre inside the box per hexagon that lies in it; the origin is one of them.
    // Five columns 1.5 apart fit in 8; three rows fit an even column, four an odd one.
    expect(v.dots.length / 3).toBe(3 * 3 + 2 * 4)
    let originDots = 0
    for (let i = 0; i < v.dots.length; i += 3) if (v.dots[i] === 0 && v.dots[i + 1] === 0) originDots++
    expect(originDots).toBe(1)
  })

  it('tiles edge to edge: neighbouring centres are √3 apart and share two corners', () => {
    const c0 = hexCentre(0, 0, a)
    const c1 = hexCentre(1, 0, a)
    expect(Math.hypot(c1[0] - c0[0], c1[1] - c0[1])).toBeCloseTo(Math.sqrt(3))
    const shared = hexCorners(c0[0], c0[1], a).filter((p) => hexCorners(c1[0], c1[1], a).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9))
    expect(shared.length).toBe(2)
    expect(Math.hypot(c0[0] - hexCentre(0, 1, a)[0], c0[1] - hexCentre(0, 1, a)[1])).toBeCloseTo(Math.sqrt(3))
  })
})

describe('snapping to the drawn grid', () => {
  const major = 1
  const minor = 0.2

  it('square styles: the nearest step on each axis, halved for fine', () => {
    expect(snapToGrid('lines', [0.29, -0.31, 0.5], major, minor)).toEqual([0.2, -0.4, 0.5].map((v) => expect.closeTo(v, 9)))
    expect(snapToGrid('fine', [0.29, 0, 0], major, minor)).toEqual([0.3, 0, 0].map((v) => expect.closeTo(v, 9)))
    expect(snapToGrid('dots', [1.04, 2.06, 0], major, minor)).toEqual([1, 2, 0].map((v) => expect.closeTo(v, 9)))
  })

  it('polar: a circle at a whole number of minor steps and a ray at a multiple of 15°', () => {
    // A minor step of 0.5 here: 1.3, 0.75 is 1.5 from the origin at 30°, three steps out.
    const p = snapToGrid('polar', [1.3, 0.75, 2], major, 0.5)
    const r = Math.hypot(p[0], p[1]) / 0.5
    expect(Math.abs(r - Math.round(r))).toBeLessThan(1e-9)
    const t = Math.atan2(p[1], p[0]) / (Math.PI / 12)
    expect(Math.abs(t - Math.round(t))).toBeLessThan(1e-9)
    expect(p[2]).toBe(2)
    expect(p[0]).toBeCloseTo(1.5 * Math.cos(Math.PI / 6))
    expect(p[1]).toBeCloseTo(0.75)
    expect(snapToGrid('polar', [0.05, -0.04, 0], major, minor)).toEqual([0, 0, 0])
  })

  it('isometric: the nearest lattice point, which is on the drawn lattice', () => {
    for (const [x, y] of [[0.31, 0.16], [-1.02, 0.9], [2.5, -1.7], [0.1, 0.1]]) {
      const p = snapToGrid('isometric', [x, y, 0], major, minor)
      const j = p[1] / ((minor * Math.sqrt(3)) / 2)
      const i = p[0] / minor - j / 2
      expect(Math.abs(j - Math.round(j)), `${x},${y}`).toBeLessThan(1e-9)
      expect(Math.abs(i - Math.round(i)), `${x},${y}`).toBeLessThan(1e-9)
      // Nothing on the lattice is closer: the point is within a lattice edge of the cursor.
      expect(Math.hypot(p[0] - x, p[1] - y)).toBeLessThanOrEqual(minor / Math.sqrt(3) + 1e-9)
    }
    expect(snapToGrid('isometric', [0.76, 0.86, 0], major, minor)).toEqual([0.7, 0.8660254037844386, 0].map((v) => expect.closeTo(v, 9)))
  })

  it('hex: the nearest centre or corner, whichever is closer', () => {
    const near = (p: V3, q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9
    // Just off the origin: the centre wins.
    expect(snapToGrid('hex', [0.1, 0.05, 0], major, minor)).toEqual([0, 0, 0])
    // Just off the corner at (1, 0): the corner wins.
    const c = snapToGrid('hex', [0.95, 0.05, 0], major, minor)
    expect(near(c, [1, 0])).toBe(true)
    // Wherever the cursor is, what it lands on is a centre or a corner of the tiling.
    for (const [x, y] of [[2.2, 1.7], [-3.3, 0.4], [0.7, -2.6], [4.9, 4.9]]) {
      const p = snapToGrid('hex', [x, y, 1], major, minor)
      expect(p[2]).toBe(1)
      let found = false
      for (let i = -5; i <= 5 && !found; i++) {
        for (let j = -5; j <= 5 && !found; j++) {
          const centre = hexCentre(i, j, major)
          if (near(p, centre) || hexCorners(centre[0], centre[1], major).some((q) => near(p, q))) found = true
        }
      }
      expect(found, `${x},${y}`).toBe(true)
      // Centres and corners together make a triangular lattice of side `major`, so nothing is farther than major/√3 from one.
      expect(Math.hypot(p[0] - x, p[1] - y)).toBeLessThanOrEqual(major / Math.sqrt(3) + 1e-9)
    }
  })
})
