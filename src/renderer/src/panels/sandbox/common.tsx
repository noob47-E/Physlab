// The Sandbox panel’s shared pieces: numbers, rows, sliders and the folding sections (moved from panels/Sandbox.tsx, SB2).

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useScene } from '../../core/store'
import { type BodyDef } from '../../sim/types'
import { FOLD_TITLES, readFold, sizeFields, writeFold, type FoldId, type FoldStore } from '../../sim/inspector'
import type { SceneSettings } from '../../core/types'
import { NumField } from '../../ui/fields'
import { formatMeasure } from '../../math/format'

type V = [number, number, number]

/** Every number on this panel goes through the student's precision setting (rule 4). */
export const useNum = () => {
  const settings = useScene((s) => s.settings)
  return (v: number, unit = '') => `${formatMeasure(v, 'number', settings)}${unit ? ` ${unit}` : ''}`
}

export function Vec3Row({ label, value, unit, live, onChange }: { label: string; value: V; unit?: string; live?: V | null; onChange: (v: V) => void }) {
  const num = useNum()
  return (
    <div className="prop-row">
      <label>
        {label} {unit && <span className="text-[color:var(--text-faint)]">{unit}</span>}
      </label>
      {live ? (
        // While the run plays these are what the engine says, not what was typed: the typed
        // values are the start of the run and come back with Reset.
        // As tall as the .field boxes it replaces (styles.css): a row of plain text is 4.5 px
        // shorter, and Position and Velocity shrinking on Play moved the panel below (Fix 22).
        <div className="flex h-[24px] items-center gap-1 tabular-nums text-[color:var(--text)]" title="Live value; pause to edit the starting value">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <span key={axis} className="min-w-0 flex-1 truncate">
              <span className="text-fine italic text-[color:var(--text-faint)]">{axis} </span>
              {num(live[i])}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex gap-1">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="text-fine italic text-[color:var(--text-faint)]">{axis}</span>
              <NumField
                value={value[i]}
                onChange={(n) => {
                  const next: V = [...value]
                  next[i] = n
                  onChange(next)
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Only the dimensions the shape actually uses, named for what they do (sim/inspector.ts sizeFields). */
export function SizeRow({ sel, onChange }: { sel: BodyDef; onChange: (size: V) => void }) {
  const fields = sizeFields(sel.shape, sel.size)
  return (
    <div className="prop-row">
      <label>
        Size <span className="text-[color:var(--text-faint)]">m</span>
      </label>
      <div className="flex gap-1">
        {fields.map((f) => (
          <label key={f.label} className="flex min-w-0 flex-1 items-center gap-1" title={f.label}>
            <span className="text-fine text-[color:var(--text-faint)]">{f.letter}</span>
            <NumField value={f.value} onChange={(v) => onChange(f.set(Math.max(0.01, v)))} />
          </label>
        ))}
      </div>
    </div>
  )
}

export function Slider({ label, title, value, min, max, step, onChange, digits = 2 }: { label: string; title?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; digits?: number }) {
  const settings = useScene((s) => s.settings)
  const shown = formatMeasure(value, 'number', { ...settings, decimals: Math.max(settings.decimals, digits), precisionMode: 'dp' } as SceneSettings)
  return (
    <div className="prop-row">
      <label title={title}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="w-12 text-right tabular-nums text-[color:var(--text-dim)]">{shown}</span>
      </div>
    </div>
  )
}

const foldStore = (): FoldStore | null => (typeof localStorage === 'undefined' ? null : localStorage)

/**
 * A section a student can fold away. Whether it is open is remembered between sessions, so a
 * student who always wants the launcher never has to open it twice. `force` holds it open and
 * lit, for the moment it is the thing they need (Connections, once two objects are chosen).
 */
export function Fold({ id, title, open: fallback = false, force = false, children }: { id: FoldId; title?: string; open?: boolean; force?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => readFold(id, fallback, foldStore()))
  const shown = force || open
  return (
    <>
      <button
        className={`section-title mt-1 w-full text-left ${force ? 'text-[color:var(--accent)]' : ''}`}
        onClick={() => {
          // While it is held open a click changes nothing on screen, so it must not change what
          // is remembered either: the section would otherwise reappear folded, or unfolded,
          // against what the student last chose.
          if (force) return
          setOpen(!open)
          writeFold(id, !open, foldStore())
        }}
      >
        {shown ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {title ?? FOLD_TITLES[id]}
      </button>
      {shown && children}
    </>
  )
}
