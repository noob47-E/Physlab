// Tests for Part L2: The Esc Mode Wheel
//
// 1. Esc order: close menu -> cancel unfinished drawing -> back to Move -> clear selection -> open wheel.
// 2. Pause/resume: opening pauses running engine/replay/slider; closing without picking resumes; picking new mode stays paused.
// 3. Number keys 1-7, Arrow keys, Enter, and Esc handling on the wheel.
// 4. Exactly 7 modes in clockwise order starting with Calculator at top; hidden modes never shown.
// 5. Theme tokens defined across all 4 themes.

import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WHEEL_MODES, getWheelModeByIndex, segmentAt } from '../src/renderer/src/app/modeWheelData'
import { useModeWheel, wheelKeyDown } from '../src/renderer/src/app/modeWheelStore'
import { scene } from '../src/renderer/src/core/store'
import { useApp } from '../src/renderer/src/app/modes'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useTape } from '../src/renderer/src/sim/tapeStore'
import { shortcutKeyDown } from '../src/renderer/src/app/shortcuts'
import { useTool, resetTool } from '../src/renderer/src/render/tools'
import { Builder } from '../src/renderer/src/core/factory'

describe('Part L2: Mode Wheel Data and Structure', () => {
  it('contains exactly the 7 ready modes in the specified clockwise order', () => {
    const ids = WHEEL_MODES.map((m) => m.id)
    expect(ids).toEqual([
      'calculator',
      'graphing',
      'shapes',
      'vectors',
      'sandbox',
      'problems',
      'lab'
    ])
  })

  it('starts at top with Calculator and assigns correct labels and colors', () => {
    expect(WHEEL_MODES[0].id).toBe('calculator')
    expect(WHEEL_MODES[0].label).toBe('Calculator')
    expect(WHEEL_MODES[0].colorToken).toBe('var(--mode-calculator)')

    expect(WHEEL_MODES[1].id).toBe('graphing')
    expect(WHEEL_MODES[1].label).toBe('Graphing')
    expect(WHEEL_MODES[1].colorToken).toBe('var(--mode-graphing)')

    expect(WHEEL_MODES[2].id).toBe('shapes')
    expect(WHEEL_MODES[2].label).toBe('Geometry')
    expect(WHEEL_MODES[2].colorToken).toBe('var(--mode-geometry)')

    expect(WHEEL_MODES[3].id).toBe('vectors')
    expect(WHEEL_MODES[3].label).toBe('Vectors')
    expect(WHEEL_MODES[3].colorToken).toBe('var(--mode-vectors)')

    expect(WHEEL_MODES[4].id).toBe('sandbox')
    expect(WHEEL_MODES[4].label).toBe('Sandbox')
    expect(WHEEL_MODES[4].colorToken).toBe('var(--mode-sandbox)')

    expect(WHEEL_MODES[5].id).toBe('problems')
    expect(WHEEL_MODES[5].label).toBe('Problem Sets')
    expect(WHEEL_MODES[5].colorToken).toBe('var(--mode-problems)')

    expect(WHEEL_MODES[6].id).toBe('lab')
    expect(WHEEL_MODES[6].label).toBe('Lab Data')
    expect(WHEEL_MODES[6].colorToken).toBe('var(--mode-lab)')
  })

  it('does not include hidden or coming-soon modes', () => {
    const ids = WHEEL_MODES.map((m) => m.id)
    expect(ids).not.toContain('gpu')
    expect(ids).not.toContain('console')
    expect(ids).not.toContain('waves')
    expect(ids).not.toContain('optics')
  })

  it('maps 1-based index (keys 1-7) to the 7 modes', () => {
    expect(getWheelModeByIndex(1)?.id).toBe('calculator')
    expect(getWheelModeByIndex(2)?.id).toBe('graphing')
    expect(getWheelModeByIndex(3)?.id).toBe('shapes')
    expect(getWheelModeByIndex(4)?.id).toBe('vectors')
    expect(getWheelModeByIndex(5)?.id).toBe('sandbox')
    expect(getWheelModeByIndex(6)?.id).toBe('problems')
    expect(getWheelModeByIndex(7)?.id).toBe('lab')
    expect(getWheelModeByIndex(0)).toBeUndefined()
    expect(getWheelModeByIndex(8)).toBeUndefined()
  })
})

describe('Part L2: Theme Tokens in styles.css', () => {
  const css = readFileSync(resolve(__dirname, '../src/renderer/src/styles.css'), 'utf-8')

  const darkTokens = [
    ['--mode-calculator', '#F2B544'],
    ['--mode-graphing', '#5B9CFF'],
    ['--mode-geometry', '#4CC38A'],
    ['--mode-vectors', '#A78BFA'],
    ['--mode-sandbox', '#FF8A5B'],
    ['--mode-problems', '#F472B6'],
    ['--mode-lab', '#38C6D9']
  ]

  const lightTokens = [
    ['--mode-calculator', '#A86B00'],
    ['--mode-graphing', '#1F5FD1'],
    ['--mode-geometry', '#18794E'],
    ['--mode-vectors', '#6D3FD6'],
    ['--mode-sandbox', '#C2410C'],
    ['--mode-problems', '#BE185D'],
    ['--mode-lab', '#0E7490']
  ]

  it('declares mode color tokens in the dark theme blocks (Dark, Moonlight, Moongold)', () => {
    for (const [token, val] of darkTokens) {
      const reg = new RegExp(`${token}\\s*:\\s*${val}`, 'i')
      expect(css).toMatch(reg)
    }
  })

  it('declares deeper mode color tokens in the Light theme block', () => {
    for (const [token, val] of lightTokens) {
      const reg = new RegExp(`${token}\\s*:\\s*${val}`, 'i')
      expect(css).toMatch(reg)
    }
  })
})

describe('Part L2: Pause and Resume Behavior', () => {
  beforeEach(() => {
    useModeWheel.getState().close(false)
    scene().setPlaying(false)
    useTape.setState({ playing: false })
  })

  it('pauses running scene when the wheel opens, and resumes if closed without choice', () => {
    scene().setPlaying(true)
    expect(scene().playing).toBe(true)

    useModeWheel.getState().openWheel()
    expect(useModeWheel.getState().open).toBe(true)
    expect(scene().playing).toBe(false)

    // Close without picking a mode -> resumes
    useModeWheel.getState().close(false)
    expect(useModeWheel.getState().open).toBe(false)
    expect(scene().playing).toBe(true)
  })

  it('pauses running tape replay when the wheel opens, and resumes if closed without choice', () => {
    useTape.setState({ playing: true })
    expect(useTape.getState().playing).toBe(true)

    useModeWheel.getState().openWheel()
    expect(useModeWheel.getState().open).toBe(true)
    expect(useTape.getState().playing).toBe(false)

    useModeWheel.getState().close(false)
    expect(useTape.getState().playing).toBe(true)
  })

  it('leaves the old run paused when a new mode is chosen', () => {
    scene().setPlaying(true)
    useModeWheel.getState().openWheel()
    expect(scene().playing).toBe(false)

    // Select a mode (picked = true)
    useModeWheel.getState().selectMode('graphing')
    expect(useModeWheel.getState().open).toBe(false)
    expect(scene().playing).toBe(false)
  })
})

// The wheel takes focus when it opens, so a key reaches the wheel's own handler first and then bubbles on to the app's shortcuts
// (window). Unless the wheel stops a key it used, the same press does two things: Esc closed the wheel and, finding nothing else to
// do, opened it again; 3 picked Geometry and flipped 2-D/3-D; Space picked a mode and set the Sandbox playing (Azure, 18 Oct).
describe('Part L2: a key the wheel uses stops at the wheel', () => {
  beforeEach(() => {
    useModeWheel.getState().close(false)
    useApp.getState().setMode('shapes')
    const s = scene()
    s.setViewMode('2d')
    s.setTool('select')
    s.select([])
    resetTool()
  })

  /** One key press as the browser delivers it: to the focused wheel first, then to the window unless the wheel stopped it. */
  const press = (key: string): { stopped: boolean } => {
    let stopped = false
    const e = {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
      target: { tagName: 'DIV' },
      defaultPrevented: false,
      preventDefault() {},
      stopPropagation() {
        stopped = true
      }
    }
    wheelKeyDown(e)
    if (!stopped) shortcutKeyDown(e as unknown as KeyboardEvent)
    return { stopped }
  }

  it('Esc on the open wheel closes it and it stays closed', () => {
    useModeWheel.getState().openWheel()
    expect(press('Escape').stopped).toBe(true)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('3 on the open wheel picks Geometry and leaves the 2-D view alone', () => {
    useModeWheel.getState().openWheel()
    expect(press('3').stopped).toBe(true)
    expect(useApp.getState().mode).toBe('shapes')
    expect(scene().viewMode).toBe('2d')
  })

  it('Space, Enter, the arrows and Tab stop at the wheel too', () => {
    for (const key of [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab']) {
      useModeWheel.getState().openWheel()
      expect(press(key).stopped, key).toBe(true)
      useModeWheel.getState().close(false)
    }
  })

  it('a key the wheel does not use goes on to the app, and nothing stops while the wheel is closed', () => {
    useModeWheel.getState().openWheel()
    expect(press('q').stopped).toBe(false)
    useModeWheel.getState().close(false)
    expect(press('3').stopped).toBe(false)
    expect(scene().viewMode).toBe('3d')
  })

  it('the wheel hands its key presses to wheelKeyDown', () => {
    const src = readFileSync(resolve(__dirname, '../src/renderer/src/app/ModeWheel.tsx'), 'utf8')
    expect(src).toMatch(/onKeyDown=\{wheelKeyDown\}/)
  })
})

describe('Part L2: Esc Key Priority Order', () => {
  beforeEach(() => {
    useModeWheel.getState().close(false)
    useApp.getState().setMode('shapes')
    const s = scene()
    s.setViewMode('2d')
    s.setTool('select')
    s.select([])
    resetTool()
  })

  const pressEsc = () => {
    shortcutKeyDown({
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
      target: { tagName: 'DIV' },
      defaultPrevented: false,
      preventDefault() {}
    } as unknown as KeyboardEvent)
  }

  it('1. If wheel is open, Esc closes the wheel', () => {
    useModeWheel.getState().openWheel()
    expect(useModeWheel.getState().open).toBe(true)

    pressEsc()
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('2. If an unfinished drawing is in progress, Esc cancels it instead of opening the wheel', () => {
    const s = scene()
    s.setTool('segment')
    useTool.setState({ picks: ['p1'] })

    pressEsc()
    expect(useTool.getState().picks.length).toBe(0)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('3. If tool is not Move (select), Esc switches back to Move instead of opening the wheel', () => {
    scene().setTool('segment')
    expect(scene().tool).toBe('segment')

    pressEsc()
    expect(scene().tool).toBe('select')
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('4. If objects are selected, Esc clears the selection instead of opening the wheel', () => {
    const b = new Builder()
    const p1 = b.point([0, 0, 0])
    const p2 = b.point([1, 1, 0])
    b.commit(false)
    scene().select([p1.id, p2.id])
    expect(scene().selection.length).toBe(2)

    pressEsc()
    expect(scene().selection.length).toBe(0)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('5. If Sandbox has a selected body, Esc clears the selection instead of opening the wheel', () => {
    useApp.getState().setMode('sandbox')
    const body = useSandbox.getState().addBody('sphere', [0, 1, 0])
    useSandbox.getState().select(body.id)
    expect(useSandbox.getState().selection).toBe(body.id)

    pressEsc()
    expect(useSandbox.getState().selection).toBeNull()
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('6. Only when all preceding jobs are clear, Esc opens the mode wheel', () => {
    const s = scene()
    s.setTool('select')
    s.select([])
    expect(useModeWheel.getState().open).toBe(false)

    pressEsc()
    expect(useModeWheel.getState().open).toBe(true)
  })
})

describe('Part L2: Wheel Keyboard Navigation and Selection', () => {
  beforeEach(() => {
    useModeWheel.getState().openWheel()
  })

  it('keys 1 to 7 pick modes directly', () => {
    useModeWheel.getState().handleKeyDown('1')
    expect(useApp.getState().mode).toBe('calculator')
    expect(useModeWheel.getState().open).toBe(false)

    useModeWheel.getState().openWheel()
    useModeWheel.getState().handleKeyDown('2')
    expect(useApp.getState().mode).toBe('graphing')
    expect(useModeWheel.getState().open).toBe(false)

    useModeWheel.getState().openWheel()
    useModeWheel.getState().handleKeyDown('5')
    expect(useApp.getState().mode).toBe('sandbox')
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('Arrow keys or Tab navigate around the 7 modes, and Enter selects', () => {
    useModeWheel.setState({ highlightedIndex: 0 }) // Calculator
    useModeWheel.getState().handleKeyDown('ArrowRight')
    expect(useModeWheel.getState().highlightedIndex).toBe(1) // Graphing

    useModeWheel.getState().handleKeyDown('ArrowRight')
    expect(useModeWheel.getState().highlightedIndex).toBe(2) // Geometry

    useModeWheel.getState().handleKeyDown('ArrowLeft')
    expect(useModeWheel.getState().highlightedIndex).toBe(1) // Graphing

    useModeWheel.getState().handleKeyDown('Enter')
    expect(useApp.getState().mode).toBe('graphing')
    expect(useModeWheel.getState().open).toBe(false)
  })
})

// L2b (wave head, 18 Oct; owner's bar "neat, not crowded"): the round button covered panel text on a laptop, two key numbers ran
// into the names, the icons had no colour at rest, and on a small wheel the pointer lit segments from the wrong distance.
describe('Part L2b: the wheel, tidied', () => {
  const wheelSrc = readFileSync(resolve(__dirname, '../src/renderer/src/app/ModeWheel.tsx'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../src/renderer/src/styles.css'), 'utf8')

  it('the round Modes button shows only where the pointer is coarse (a touch screen)', () => {
    expect(wheelSrc).toMatch(/className="modes-fab fixed /)
    // A display utility on the button would beat the stylesheet and show it everywhere again.
    expect(wheelSrc).not.toMatch(/className="modes-fab[^"]*\b(flex|block|inline-flex)\b /)
    expect(css).toMatch(/\.modes-fab \{\s*display: none;\s*\}\s*@media \(pointer: coarse\) \{\s*\.modes-fab \{\s*display: flex;/)
  })

  it('every key number sits in the same place in its segment, above the icon, not out by the rim', () => {
    expect(wheelSrc).not.toMatch(/OUTER_R - 18/)
    expect(wheelSrc).toMatch(/y=\{-30\}[\s\S]{0,300}\{mode\.index\}/)
  })

  it('each icon is drawn in its own mode colour', () => {
    expect(wheelSrc).toMatch(/style=\{\{ color: mode\.colorToken \}\}>\s*<Icon size=\{20\} \/>/)
  })

  it('the segment under the pointer is found in drawing units, whatever size the wheel is shown at', () => {
    // Straight up, mid-ring (175 units out), on the full 520 px wheel and on a phone's 340 px one.
    expect(segmentAt(0, -175, 520)).toBe(0)
    expect(segmentAt(0, -175 * (340 / 520), 340)).toBe(0)
    // Straight right is the third segment (Geometry); up and to the left (the 7th segment's middle, 141° from the right) is Lab Data,
    // and a little below straight left is Problem Sets.
    expect(WHEEL_MODES[segmentAt(175, 0, 520)!].id).toBe('shapes')
    expect(WHEEL_MODES[segmentAt(-89, -71, 340)!].id).toBe('lab')
    expect(WHEEL_MODES[segmentAt(-114, 20, 340)!].id).toBe('problems')
    // On the phone's 340 px wheel, 60 px out is 92 units, the ring's inner edge (read as pixels it was "the hub", nothing lit),
    // and 250 px out is well past the rim (read as pixels it still lit a segment).
    expect(segmentAt(60, 0, 340)).toBe(2)
    expect(segmentAt(250, 0, 340)).toBeNull()
    // The hub and far outside are nothing.
    expect(segmentAt(0, -40, 520)).toBeNull()
    expect(segmentAt(0, -400, 520)).toBeNull()
  })
})
