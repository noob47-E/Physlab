import { describe, expect, it } from 'vitest'
import { pinnedAxisLabels } from '../src/renderer/src/render/gridLabels'
import { DEFAULT_SETTINGS, useScene } from '../src/renderer/src/core/store'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Part G5: Graphing zoom, pinned axis numbers, hide-numbers switch, smooth 3-D zoom', () => {
  const settings: MeasureSettings = {
    decimals: 2,
    precisionMode: 'dp',
    unit: 'unit',
    unitPerSquare: 1,
    angleUnit: 'deg'
  }

  describe('1. Pinned axis numbers when axes leave screen', () => {
    const size = { width: 1000, height: 600 }
    const toScreen = (p: readonly number[]) => ({
      x: 500 + p[0] * 50,
      y: 300 - p[1] * 50
    })

    it('places origin and tick labels normally when origin is on screen', () => {
      const b = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 }
      const origin = { x: 500, y: 300 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).not.toBeNull()
      expect(labels.originTick?.text).toBe('0')
      expect(labels.originTick?.x).toBe(500 - 8)
      expect(labels.originTick?.y).toBe(300 + 12)

      // X-axis numbers sit under horizontal axis at origin.y + 14
      expect(labels.xTicks.length).toBeGreaterThan(0)
      for (const tick of labels.xTicks) {
        expect(tick.y).toBe(300 + 14)
        expect(tick.align).toBe('center')
      }

      // Y-axis numbers sit to the left of vertical axis at origin.x - 8
      expect(labels.yTicks.length).toBeGreaterThan(0)
      for (const tick of labels.yTicks) {
        expect(tick.x).toBe(500 - 8)
        expect(tick.align).toBe('right')
      }
    })

    it('pins Y-axis numbers to the left edge with left alignment when Y-axis is off-screen to the left', () => {
      // Panned right, so x = 0 is far to the left of the screen (origin.x = -500)
      const b = { xMin: 10, xMax: 30, yMin: -6, yMax: 6 }
      const origin = { x: -500, y: 300 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).toBeNull() // Origin is off-screen, detached origin tick suppressed
      expect(labels.yTicks.length).toBeGreaterThan(0)

      for (const tick of labels.yTicks) {
        // Pinned to left edge with positive screen margin and left alignment so minus signs and digits never clip
        expect(tick.x).toBe(8)
        expect(tick.align).toBe('left')
        expect(tick.y).toBeGreaterThanOrEqual(16)
        expect(tick.y).toBeLessThanOrEqual(size.height - 16)
      }
    })

    it('pins Y-axis numbers to the right edge with right alignment when Y-axis is off-screen to the right', () => {
      // Panned left, so x = 0 is far to the right of the screen (origin.x = 1500)
      const b = { xMin: -30, xMax: -10, yMin: -6, yMax: 6 }
      const origin = { x: 1500, y: 300 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).toBeNull()
      expect(labels.yTicks.length).toBeGreaterThan(0)

      for (const tick of labels.yTicks) {
        expect(tick.x).toBe(size.width - 12)
        expect(tick.align).toBe('right')
      }
    })

    it('pins X-axis numbers to the bottom edge when X-axis is off-screen below', () => {
      // Panned up, so y = 0 is below the viewport (origin.y = 1000)
      const b = { xMin: -10, xMax: 10, yMin: 10, yMax: 22 }
      const origin = { x: 500, y: 1000 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).toBeNull()
      expect(labels.xTicks.length).toBeGreaterThan(0)

      for (const tick of labels.xTicks) {
        expect(tick.y).toBe(size.height - 14)
        expect(tick.align).toBe('center')
        expect(tick.x).toBeGreaterThanOrEqual(24)
        expect(tick.x).toBeLessThanOrEqual(size.width - 24)
      }

      // If x = 0 is in view, the pinned bottom axis includes 0
      const zeroTick = labels.xTicks.find((t) => t.text === '0')
      expect(zeroTick).toBeDefined()
    })

    it('pins X-axis numbers to the top edge when X-axis is off-screen above', () => {
      // Panned down, so y = 0 is above the viewport (origin.y = -400)
      const b = { xMin: -10, xMax: 10, yMin: -22, yMax: -10 }
      const origin = { x: 500, y: -400 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).toBeNull()
      expect(labels.xTicks.length).toBeGreaterThan(0)

      for (const tick of labels.xTicks) {
        expect(tick.y).toBe(14)
        expect(tick.align).toBe('center')
      }
    })

    it('handles origin visible near edge (x=20, y=15) without losing origin tick', () => {
      const b = { xMin: -2, xMax: 18, yMin: -1, yMax: 11 }
      const origin = { x: 20, y: 15 }
      const labels = pinnedAxisLabels(b, size, origin, 2, 0.5, settings, toScreen)

      expect(labels.originTick).not.toBeNull()
      expect(labels.originTick?.text).toBe('0')
      for (const tick of labels.yTicks) {
        expect(tick.x).toBe(8)
        expect(tick.align).toBe('left')
      }
    })
  })

  describe('2. Zooming far out past -8000', () => {
    it('CameraRig configures MapControls minZoom <= 0.005 to permit zooming far past -8000', () => {
      const code = readFileSync(resolve(__dirname, '../src/renderer/src/render/CameraRig.tsx'), 'utf8')
      expect(code).toMatch(/minZoom=\{MIN_ZOOM_2D\}/)
      const defMatch = code.match(/MIN_ZOOM_2D\s*=\s*mode\s*===\s*'graphing'\s*\?\s*([0-9.]+)/)
      expect(defMatch).not.toBeNull()
      const minZoomVal = parseFloat(defMatch![1])
      expect(minZoomVal).toBeLessThanOrEqual(0.005)
    })

    it('axis labels format properly for far zoom domains like [-50000, 50000]', () => {
      const b = { xMin: -50000, xMax: 50000, yMin: -30000, yMax: 30000 }
      const size = { width: 1000, height: 600 }
      const origin = { x: 500, y: 300 }
      const labels = pinnedAxisLabels(b, size, origin, 20000, 5000, settings, (p) => ({
        x: 500 + (p[0] / 50000) * 500,
        y: 300 - (p[1] / 30000) * 300
      }))

      expect(labels.xTicks.length).toBeGreaterThan(0)
      expect(labels.yTicks.length).toBeGreaterThan(0)
      // Labels should contain clean formatted numbers like "-40 000" or "-20 000"
      expect(labels.xTicks.some((t) => t.text.includes('40') || t.text.includes('20'))).toBe(true)
    })
  })

  describe('3. Switch to hide axis numbers', () => {
    it('DEFAULT_SETTINGS includes showAxisNumbers: true', () => {
      expect(DEFAULT_SETTINGS.showAxisNumbers).toBe(true)
    })

    it('scene store supports updating showAxisNumbers', () => {
      useScene.getState().setSettings({ showAxisNumbers: false })
      expect(useScene.getState().settings.showAxisNumbers).toBe(false)
      useScene.getState().setSettings({ showAxisNumbers: true })
      expect(useScene.getState().settings.showAxisNumbers).toBe(true)
    })

    it('Viewport includes a Numbers toggle button beside Axes', () => {
      const code = readFileSync(resolve(__dirname, '../src/renderer/src/render/Viewport.tsx'), 'utf8')
      expect(code).toMatch(/showAxisNumbers/)
      expect(code).toMatch(/Numbers/)
    })
  })

  describe('4. Smooth 3-D zoom', () => {
    it('CameraRig OrbitControls uses smooth zoomSpeed <= 0.6 and bounds distance clamp around -60..80', () => {
      const code = readFileSync(resolve(__dirname, '../src/renderer/src/render/CameraRig.tsx'), 'utf8')
      expect(code).toMatch(/<OrbitControls[^>]+zoomSpeed=\{[^}]*0\.6[^}]*\}/)
      expect(code).toMatch(/<OrbitControls[^>]+maxDistance=\{[0-9.]+\}/)
    })
  })
})
