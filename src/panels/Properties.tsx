import { ListOrdered, Trash2 } from 'lucide-react'
import { useScene, scene } from '../core/store'
import { exprRefs, isFree } from '../core/evaluate'
import { isValidName } from '../core/naming'
import type { SceneObject } from '../core/types'
import { heading, len, toDeg, toRad, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'
import { Check, ColorField, NumField, TextField } from '../ui/fields'
import { runCommand } from '../lang/commands'

function renameObject(obj: SceneObject, next: string) {
  const s = scene()
  if (!isValidName(next) || s.ev.names.has(next)) {
    s.pushLog({ input: `rename ${obj.name}`, kind: 'error', text: `"${next}" is not available as a name.` })
    return
  }
  const re = new RegExp(`(?<![\\w'])${obj.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w'])`, 'g')
  const changed: SceneObject[] = [{ ...obj, name: next }]
  for (const o of Object.values(s.objects)) {
    if (o.id === obj.id || !exprRefs(o).some((e) => re.test(e))) continue
    re.lastIndex = 0
    const copy = JSON.parse(JSON.stringify(o)) as SceneObject
    if (copy.type === 'point' && copy.def.kind === 'expr') copy.def.expr = copy.def.expr.replace(re, next)
    if (copy.type === 'vector' && copy.def.kind === 'expr') copy.def.expr = copy.def.expr.replace(re, next)
    if (copy.type === 'circle' && copy.def.kind === 'centerRadius') copy.def.r = copy.def.r.replace(re, next)
    if (copy.type === 'number') copy.expr = copy.expr.replace(re, next)
    if (copy.type === 'graph') {
      copy.exprs = copy.exprs.map((e) => e.replace(re, next))
      // The source is what the Outliner shows and what editing starts from, so it renames too.
      re.lastIndex = 0
      copy.source = copy.source.replace(re, next)
    }
    changed.push(copy)
  }
  s.addObjects(changed)
}

function V3Fields({ v, onChange }: { v: V3; onChange: (v: V3) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['x', 'y', 'z'] as const).map((ax, i) => (
        <div key={ax} className="relative">
          <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] text-zinc-500">{ax}</span>
          <NumField value={v[i]} onChange={(n) => onChange(v.map((c, j) => (j === i ? n : c)) as V3)} />
        </div>
      ))}
    </div>
  )
}

export function Properties() {
  const selection = useScene((s) => s.selection)
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const update = useScene((s) => s.updateObject)
  const remove = useScene((s) => s.removeObjects)
  const showSolution = useScene((s) => s.showSolution)
  const angleUnit = useScene((s) => s.settings.angleUnit)

  if (selection.length === 0) return <div className="panel p-4 text-zinc-500">Select an object to edit it.</div>
  if (selection.length > 1) {
    return (
      <div className="panel p-4 text-zinc-400">
        {selection.length} objects selected. See the <b>Measure</b> tab for relationships between them.
        <div className="mt-3">
          <button className="btn" onClick={() => remove(selection)}>
            <Trash2 size={13} /> Delete all
          </button>
        </div>
      </div>
    )
  }
  const o = objects[selection[0]]
  if (!o) return null
  const c = ev.values.get(o.id)
  const err = ev.errors.get(o.id)
  const set = (fn: (d: SceneObject) => void) => update(o.id, fn as never)

  return (
    <div className="panel pb-6">
      <div className="section-title">
        {o.type} {isFree(o) ? '· free' : '· dependent'}
      </div>
      {err && <div className="mx-3 mb-2 rounded bg-red-500/10 px-2 py-1 text-red-300">{err}</div>}
      <div className="prop-row">
        <label>Name</label>
        <TextField value={o.name} onCommit={(n) => renameObject(o, n.trim())} />
      </div>
      <div className="prop-row">
        <label>Colour</label>
        <ColorField value={o.color} onChange={(col) => set((d) => void (d.color = col))} />
      </div>
      <div className="prop-row">
        <label>Show</label>
        <div className="flex flex-wrap gap-3">
          <Check checked={o.visible} onChange={(v) => set((d) => void (d.visible = v))} label="Object" />
          <Check checked={o.showLabel} onChange={(v) => set((d) => void (d.showLabel = v))} label="Label" />
        </div>
      </div>
      {o.type !== 'text' && o.type !== 'number' && (
        <div className="prop-row">
          <label>On drawing</label>
          <select
            className="field"
            value={o.labelPin ?? 'auto'}
            title="Pin the label so it always shows, or hide it even when pointed at"
            onChange={(e) => set((d) => void (d.labelPin = e.target.value === 'auto' ? undefined : (e.target.value as 'always')))}
          >
            <option value="auto">Follow the label setting</option>
            <option value="always">Always show (pinned)</option>
            <option value="never">Never show</option>
          </select>
        </div>
      )}
      {o.type !== 'text' && (
        <div className="prop-row">
          <label>Label shows</label>
          <select className="field" value={o.labelMode ?? (o.type === 'angle' ? 'value' : 'name')} onChange={(e) => set((d) => void (d.labelMode = e.target.value as 'name'))}>
            <option value="name">Name</option>
            <option value="value">Value</option>
            <option value="nameValue">Name = value</option>
          </select>
        </div>
      )}

      <div className="section-title mt-2">Definition</div>

      {o.type === 'point' && o.def.kind === 'free' && (
        <div className="prop-row">
          <label>Position</label>
          <V3Fields v={o.def.p} onChange={(p) => set((d) => d.type === 'point' && d.def.kind === 'free' && void (d.def.p = p))} />
        </div>
      )}
      {o.type === 'point' && o.def.kind === 'expr' && (
        <div className="prop-row">
          <label>Formula</label>
          <TextField mono value={o.def.expr} onCommit={(v) => set((d) => d.type === 'point' && d.def.kind === 'expr' && void (d.def.expr = v))} />
        </div>
      )}

      {o.type === 'point' && o.def.kind === 'onObject' && (
        <div className="prop-row">
          <label>On {objects[o.def.on]?.name ?? '?'}</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              className="w-full"
              min={0}
              max={1}
              step={0.001}
              value={o.def.t}
              onChange={(e) => set((d) => d.type === 'point' && d.def.kind === 'onObject' && void (d.def.t = Number(e.target.value)))}
            />
            <span className="w-12 text-right tabular-nums text-zinc-400">{o.def.t.toFixed(2)}</span>
          </div>
        </div>
      )}

      {o.type === 'vector' && c?.type === 'vector' && (
        <>
          {o.def.kind === 'free' ? (
            <>
              <div className="prop-row">
                <label>Components</label>
                <V3Fields v={o.def.comp} onChange={(v) => set((d) => d.type === 'vector' && d.def.kind === 'free' && void (d.def.comp = v))} />
              </div>
              <div className="prop-row">
                <label>Magnitude</label>
                <NumField
                  value={len(c.comp)}
                  onChange={(m) =>
                    set((d) => {
                      if (d.type !== 'vector' || d.def.kind !== 'free') return
                      const l = len(d.def.comp)
                      d.def.comp = l < 1e-12 ? [m, 0, 0] : (d.def.comp.map((x) => (x * m) / l) as V3)
                    })
                  }
                />
              </div>
              {Math.abs(c.comp[2]) < 1e-12 && (
                <div className="prop-row">
                  <label>Angle θ ({angleUnit === 'deg' ? '°' : 'rad'})</label>
                  <NumField
                    value={angleUnit === 'deg' ? toDeg(heading(c.comp)) : heading(c.comp)}
                    onChange={(a) =>
                      set((d) => {
                        if (d.type !== 'vector' || d.def.kind !== 'free') return
                        const r = angleUnit === 'deg' ? toRad(a) : a
                        const l = len(d.def.comp)
                        d.def.comp = [l * Math.cos(r), l * Math.sin(r), 0]
                      })
                    }
                  />
                </div>
              )}
              <div className="prop-row">
                <label>Tail at</label>
                <V3Fields v={o.def.tail} onChange={(v) => set((d) => d.type === 'vector' && d.def.kind === 'free' && void (d.def.tail = v))} />
              </div>
            </>
          ) : o.def.kind === 'expr' ? (
            <div className="prop-row">
              <label>Formula</label>
              <TextField mono value={o.def.expr} onCommit={(v) => set((d) => d.type === 'vector' && d.def.kind === 'expr' && void (d.def.expr = v))} />
            </div>
          ) : (
            <div className="px-3 text-zinc-500">Defined by other objects ({o.def.kind}). Drag its parents to change it.</div>
          )}
          <div className="prop-row">
            <label>Unit</label>
            <TextField value={o.unit ?? ''} onCommit={(v) => set((d) => d.type === 'vector' && void (d.unit = v || undefined))} />
          </div>
          <div className="prop-row">
            <label>Display</label>
            <Check checked={!!o.showComponents} onChange={(v) => set((d) => d.type === 'vector' && void (d.showComponents = v))} label="Always show components & θ" />
          </div>
          <div className="px-3 pt-2">
            <button className="btn" onClick={() => showSolution(VS.solveMagnitudeDirection({ name: o.name, v: c.comp }))}>
              <ListOrdered size={13} /> Steps: magnitude & direction
            </button>
          </div>
        </>
      )}

      {o.type === 'number' && (
        <>
          <div className="prop-row">
            <label>Value / formula</label>
            <TextField mono value={o.expr} onCommit={(v) => set((d) => d.type === 'number' && void (d.expr = v))} />
          </div>
          {o.slider && (
            <>
              <div className="prop-row">
                <label>Min / Max / Step</label>
                <div className="grid grid-cols-3 gap-1">
                  <NumField value={o.slider.min} onChange={(v) => set((d) => d.type === 'number' && d.slider && void (d.slider.min = v))} />
                  <NumField value={o.slider.max} onChange={(v) => set((d) => d.type === 'number' && d.slider && void (d.slider.max = v))} />
                  <NumField value={o.slider.step} onChange={(v) => set((d) => d.type === 'number' && d.slider && void (d.slider.step = v))} />
                </div>
              </div>
              <div className="prop-row">
                <label>Animate</label>
                <Check checked={!!o.animate} onChange={(v) => set((d) => d.type === 'number' && void (d.animate = v))} label="Sweep when the timeline plays" />
              </div>
            </>
          )}
        </>
      )}

      {o.type === 'circle' && (
        <>
          {o.def.kind === 'centerRadius' && (
            <div className="prop-row">
              <label>Radius</label>
              <TextField mono value={o.def.r} onCommit={(v) => set((d) => d.type === 'circle' && d.def.kind === 'centerRadius' && void (d.def.r = v))} />
            </div>
          )}
          <div className="prop-row">
            <label>Fill</label>
            <Check checked={!!o.fill} onChange={(v) => set((d) => d.type === 'circle' && void (d.fill = v))} label="Shade inside" />
          </div>
        </>
      )}

      {o.type === 'polygon' && (
        <div className="prop-row">
          <label>Display</label>
          <div className="flex flex-col gap-1">
            <Check checked={o.fill} onChange={(v) => set((d) => d.type === 'polygon' && void (d.fill = v))} label="Fill" />
            <Check checked={!!o.showAngles} onChange={(v) => set((d) => d.type === 'polygon' && void (d.showAngles = v))} label="Always show angles" />
          </div>
        </div>
      )}

      {o.type === 'angle' && (
        <div className="prop-row">
          <label>Type</label>
          <Check checked={o.oriented} onChange={(v) => set((d) => d.type === 'angle' && void (d.oriented = v))} label="Measure counter-clockwise (0–360°)" />
        </div>
      )}

      {o.type === 'graph' && (
        <>
          <div className="prop-row">
            <label>Equation</label>
            <TextField
              mono
              value={o.source}
              onCommit={(v) => {
                remove([o.id])
                runCommand(v)
              }}
            />
          </div>
          <div className="prop-row">
            <label>Line width</label>
            <NumField value={o.width ?? 2.4} onChange={(v) => set((d) => d.type === 'graph' && void (d.width = Math.max(0.5, v)))} />
          </div>
          {o.kind === 'explicit' && (
            <div className="prop-row">
              <label>Mark</label>
              <div className="flex gap-3">
                <Check checked={!!o.showRoots} onChange={(v) => set((d) => d.type === 'graph' && void (d.showRoots = v))} label="Roots" />
                <Check checked={!!o.showExtrema} onChange={(v) => set((d) => d.type === 'graph' && void (d.showExtrema = v))} label="Max / min" />
              </div>
            </div>
          )}
          {(o.kind === 'parametric' || o.kind === 'polar') && (
            <div className="prop-row">
              <label>t from / to</label>
              <div className="grid grid-cols-2 gap-1">
                <NumField value={o.tMin ?? 0} onChange={(v) => set((d) => d.type === 'graph' && void (d.tMin = v))} />
                <NumField value={o.tMax ?? 2 * Math.PI} onChange={(v) => set((d) => d.type === 'graph' && void (d.tMax = v))} />
              </div>
            </div>
          )}
        </>
      )}

      {o.type === 'text' && (
        <div className="prop-row">
          <label>Text</label>
          <TextField value={o.text} onCommit={(v) => set((d) => d.type === 'text' && void (d.text = v))} />
        </div>
      )}

      <div className="px-3 pt-4">
        <button className="btn" onClick={() => remove([o.id])}>
          <Trash2 size={13} /> Delete {o.name}
        </button>
      </div>
    </div>
  )
}
