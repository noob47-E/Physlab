// What the right-click menu offers for each kind of object, in each mode.

import { visibleOrder } from '../core/visibility'
import { scene } from '../core/store'
import { Builder } from '../core/factory'
import { isFree } from '../core/evaluate'
import type { Computed, ObjId, SceneObject } from '../core/types'
import { heading, len, neg, normalize, toDeg, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'
import { useTool } from '../render/tools'
import { GRID_STYLES } from '../render/gridMath'
import { ANGLE_MARKS_HELP } from '../ui/LabelControls'
import { fitCamera, resetCamera } from '../render/viewState'
import { addVectorFromScene } from '../panels/vectorCalcStore'
import type { MenuGroup, MenuItem } from '../ui/ContextMenu'
import { useApp } from './modes'

const s = () => scene()

/** Start a tool with this object already picked ("… with another point"). */
function startTool(tool: Parameters<ReturnType<typeof scene>['setTool']>[0], picks: ObjId[]) {
  s().setTool(tool)
  useTool.setState({ picks, dragStart: null, firstTail: null, stroke: [] })
}

const focusPanel = (id: string) => s().requestFocus(id)

function commonItems(o: SceneObject): MenuItem[] {
  const pinned = o.labelPin === 'always'
  return [
    {
      label: pinned ? 'Unpin label' : 'Pin label',
      hint: 'Keep this label on the drawing whatever the Labels setting says',
      checked: pinned,
      run: () => s().updateObject(o.id, (d) => void (d.labelPin = pinned ? undefined : 'always'))
    },
    { label: 'Rename, colour, details…', run: () => (s().select([o.id]), focusPanel('properties')) },
    { label: 'Hide', hint: 'Bring it back from the Outliner', run: () => s().updateObject(o.id, (d) => void (d.visible = false)) },
    {
      label: o.locked ? 'Unlock' : 'Lock',
      checked: o.locked,
      hint: 'A locked object cannot be dragged',
      run: () => s().updateObject(o.id, (d) => void (d.locked = !d.locked))
    },
    { label: 'Delete', shortcut: 'Del', danger: true, run: () => s().removeObjects([o.id]) }
  ]
}

function pointItems(o: SceneObject, c: Extract<Computed, { type: 'point' }>): MenuItem[] {
  const showsValue = o.labelMode === 'value' || o.labelMode === 'nameValue'
  return [
    {
      label: showsValue ? 'Hide coordinates' : 'Show coordinates',
      checked: showsValue,
      run: () => s().updateObject(o.id, (d) => void (d.labelMode = showsValue ? 'name' : 'nameValue'))
    },
    { label: 'Measure distance from here…', hint: 'Then click the second point', run: () => startTool('distance', [o.id]) },
    { label: 'Midpoint with…', run: () => startTool('midpoint', [o.id]) },
    { label: 'Perpendicular through here…', hint: 'Then click a line', run: () => startTool('perpendicular', [o.id]) },
    { label: 'Parallel through here…', run: () => startTool('parallel', [o.id]) },
    {
      label: 'Move to the origin',
      run: () =>
        s().updateObject(o.id, (d) => {
          if (d.type === 'point' && d.def.kind === 'free') d.def.p = [0, 0, 0]
        }),
      hint: isFree(o) ? undefined : 'Only free points can be moved'
    }
  ].filter((i) => i.label !== 'Move to the origin' || (isFree(o) && len(c.p) > 1e-9))
}

function vectorItems(o: SceneObject, c: Extract<Computed, { type: 'vector' }>): MenuItem[] {
  const comps = o.type === 'vector' && o.showComponents
  const named = { name: o.name, v: c.comp }
  return [
    {
      label: comps ? 'Hide components' : 'Show components',
      checked: !!comps,
      hint: 'Draws Ax and Ay with the angle',
      run: () => s().updateObject(o.id, (d) => void (d.type === 'vector' && (d.showComponents = !comps)))
    },
    {
      label: 'Resolve into components (steps)',
      run: () => s().showSolution(VS.solveComponents(o.name, len(c.comp), toDeg(heading(c.comp))))
    },
    { label: 'Magnitude & direction (steps)', run: () => s().showSolution(VS.solveMagnitudeDirection(named)) },
    { label: 'Unit vector', run: () => makeVector(normalize(c.comp), c.tail, `${o.name}̂`) },
    { label: 'Reverse (−' + o.name + ')', run: () => makeVector(neg(c.comp), c.tail) },
    {
      label: 'Move tail to the origin',
      run: () =>
        s().updateObject(o.id, (d) => {
          if (d.type === 'vector' && d.def.kind === 'free') d.def.tail = [0, 0, 0]
        })
    },
    {
      label: 'Add to the Vector Calculator',
      run: () => {
        addVectorFromScene(o.id, o.name)
        focusPanel('vectorcalc')
      }
    }
  ]
}

function makeVector(comp: V3, tail: V3, name?: string) {
  const b = new Builder()
  b.vector({ kind: 'free', tail, comp }, name ? { name } : {})
  b.commit()
}

function lineItems(o: SceneObject, c: Extract<Computed, { type: 'segment' | 'ray' | 'line' }>): MenuItem[] {
  const items: MenuItem[] = [{ label: 'Length, slope and equation', run: () => (s().select([o.id]), focusPanel('measure')) }]
  if (o.type === 'segment') {
    items.push(
      { label: 'Midpoint', run: () => build((b) => b.point({ kind: 'midpoint', a: o.a, b: o.b })) },
      { label: 'Perpendicular bisector', run: () => build((b) => b.line({ kind: 'perpBisector', a: o.a, b: o.b }, { color: '#ffa94d' })) },
      { label: 'Extend to a full line', run: () => build((b) => b.line({ kind: 'twoPoints', a: o.a, b: o.b })) }
    )
  }
  items.push(
    { label: 'Perpendicular through a point…', run: () => startTool('perpendicular', [o.id]) },
    { label: 'Parallel through a point…', run: () => startTool('parallel', [o.id]) },
    { label: 'Intersect with…', run: () => startTool('intersect', [o.id]) }
  )
  void c
  return items
}

function polygonItems(o: SceneObject): MenuItem[] {
  if (o.type !== 'polygon') return []
  const items: MenuItem[] = [
    { label: 'Area with the formula', run: () => (s().select([o.id]), focusPanel('measure')) },
    {
      label: o.decomposed ? 'Undo decompose' : 'Decompose into simple shapes',
      checked: !!o.decomposed,
      run: () => (s().updateObject(o.id, (d) => void (d.type === 'polygon' && (d.decomposed = !o.decomposed))), focusPanel('measure'))
    }
  ]
  if (o.decomposed) {
    items.push({
      label: 'Split it another way',
      run: () => s().updateObject(o.id, (d) => void (d.type === 'polygon' && (d.decomposeIndex = (d.decomposeIndex ?? 0) + 1)))
    })
  }
  items.push({
    label: o.showAngles ? 'Hide angles' : 'Show angles',
    checked: !!o.showAngles,
    run: () => s().updateObject(o.id, (d) => void (d.type === 'polygon' && (d.showAngles = !o.showAngles)))
  })
  return items
}

function graphItems(o: SceneObject): MenuItem[] {
  if (o.type !== 'graph') return []
  return [
    {
      label: o.showRoots === false ? 'Show roots' : 'Hide roots',
      checked: o.showRoots !== false,
      run: () => s().updateObject(o.id, (d) => void (d.type === 'graph' && (d.showRoots = o.showRoots === false)))
    },
    {
      label: o.showExtrema === false ? 'Show turning points' : 'Hide turning points',
      checked: o.showExtrema !== false,
      run: () => s().updateObject(o.id, (d) => void (d.type === 'graph' && (d.showExtrema = o.showExtrema === false)))
    },
    { label: 'Key points and values', run: () => (s().select([o.id]), focusPanel('measure')) }
  ]
}

function build(fn: (b: Builder) => void) {
  const b = new Builder()
  fn(b)
  b.commit()
}

/** Menu for one object. */
export function menuForObject(id: ObjId): MenuGroup[] {
  const st = s()
  const o = st.objects[id]
  const c = st.ev.values.get(id)
  if (!o) return []
  let specific: MenuItem[] = []
  if (c?.type === 'point') specific = pointItems(o, c)
  else if (c?.type === 'vector') specific = vectorItems(o, c)
  else if (c?.type === 'segment' || c?.type === 'ray' || c?.type === 'line') specific = lineItems(o, c)
  else if (c?.type === 'polygon') specific = polygonItems(o)
  else if (o.type === 'graph') specific = graphItems(o)
  else if (c?.type === 'circle') specific = [{ label: 'Area & circumference', run: () => (st.select([id]), focusPanel('measure')) }]
  const groups: MenuGroup[] = []
  if (specific.length) groups.push({ title: `${o.name} · ${o.type}`, items: specific })
  groups.push({ title: specific.length ? undefined : o.name, items: commonItems(o) })
  return groups
}

/** The sentence shown where the command is offered but no drawing is open (the Sandbox, the GPU Lab). */
export const NO_DRAWING_TO_CLEAR = 'No drawing is open here. Go to Vectors, Geometry, Graphing or Lab Data: each has a drawing of its own.'

/** Asks before clearing the drawing. Undo brings everything back, but a whole drawing is worth a question. */
export function confirmClearDrawing(): void {
  // The palette offers the command everywhere; with no drawing active there is nothing to ask
  // about, and the store refuses anyway. Say so rather than do nothing.
  if (!s().activeSpace) {
    alert(NO_DRAWING_TO_CLEAR)
    return
  }
  if (!confirm('Delete every object on this drawing? Undo brings them back.')) return
  s().clearDrawing()
}

/** Menu for empty space. */
export function menuForBackground(world: V3 | null): MenuGroup[] {
  const st = s()
  const items: MenuItem[] = []
  if (world) {
    items.push({
      label: 'Add a point here',
      run: () => build((b) => b.point([Math.round(world[0] * 1000) / 1000, Math.round(world[1] * 1000) / 1000, 0]))
    })
  }
  items.push(
    { label: 'Fit everything in view', run: () => fitCamera() },
    { label: 'Reset the view', shortcut: 'Home', run: () => resetCamera() },
    { label: 'Select everything', shortcut: 'Ctrl+A', run: () => st.select(visibleOrder(st.order, st.objects, st.activeSpace)) },
    { label: 'Delete everything on this drawing…', hint: 'Only this drawing; Undo brings it back', danger: true, run: () => confirmClearDrawing() }
  )
  const labels = st.settings.labelShow
  const { showGrid, gridStyle, showAxes } = st.settings
  return [
    { items },
    {
      title: 'Labels on the drawing',
      items: [
        { label: 'Always', checked: labels === 'always', run: () => st.setSettings({ labelShow: 'always' }) },
        { label: 'On hover', checked: labels === 'hover', run: () => st.setSettings({ labelShow: 'hover' }) },
        { label: 'Hidden', checked: labels === 'never', run: () => st.setSettings({ labelShow: 'never' }) },
        { label: 'Angle marks', hint: ANGLE_MARKS_HELP, checked: st.settings.showAngleMarks, run: () => st.setSettings({ showAngleMarks: !st.settings.showAngleMarks }) }
      ]
    },
    {
      title: 'Grid',
      items: [
        ...GRID_STYLES.map((g): MenuItem => ({ label: g.label, hint: g.hint, checked: showGrid && gridStyle === g.id, run: () => st.setSettings({ showGrid: true, gridStyle: g.id }) })),
        { label: 'Off', checked: !showGrid, run: () => st.setSettings({ showGrid: false }) },
        // Not a style: the grid can be off with the axes on, or the other way round.
        { label: 'Axes', hint: 'The axes with their numbers', checked: showAxes, run: () => st.setSettings({ showAxes: !showAxes }) }
      ]
    },
    {
      items: [
        { label: 'Snapping', checked: st.settings.snap, run: () => st.setSettings({ snap: !st.settings.snap }) },
        { label: 'Search everything…', shortcut: 'Ctrl+K', run: () => useApp.getState().setSearchOpen(true) }
      ]
    }
  ]
}
