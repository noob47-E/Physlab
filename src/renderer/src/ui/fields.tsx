import { useEffect, useState } from 'react'
import { math, preprocess } from '../math/expr'
import { fmt } from '../math/format'
import { SWATCHES } from './swatches'

/**
 * The number a NumField commits, or null for nothing to commit: only text the student has EDITED
 * is read. The box shows the value rounded to the screen's decimals (P-FIX-BROWSER F6), so
 * committing the shown text on every blur wrote the rounding back — tabbing through a point's x
 * moved 1.2345 to 1.23, and through Magnitude or Angle rescaled or turned the vector.
 */
export function committedValue(text: string, edited: boolean): number | null {
  if (!edited) return null
  const v = Number(math.evaluate(preprocess(text)))
  return Number.isFinite(v) ? v : null
}

/** Number input that accepts expressions (e.g. "sqrt(2)", "10cos(30)") and commits on Enter/blur. */
export function NumField({ value, onChange, decimals = 4, className = '' }: { value: number; onChange: (v: number) => void; decimals?: number; className?: string }) {
  const [text, setText] = useState(fmt(value, decimals).replace('−', '-'))
  const [focused, setFocused] = useState(false)
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmt(value, decimals).replace('−', '-').replace('×10^', 'e'))
  }, [value, focused, decimals])
  const commit = () => {
    try {
      const v = committedValue(text, edited)
      if (v !== null) onChange(v)
    } catch {
      setText(fmt(value, decimals))
    }
    setEdited(false)
  }
  return (
    <input
      className={`field num ${className}`}
      value={text}
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onChange={(e) => {
        setText(e.target.value)
        setEdited(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
        e.stopPropagation()
      }}
    />
  )
}

export function TextField({ value, onCommit, className = '', mono = false }: { value: string; onCommit: (v: string) => void; className?: string; mono?: boolean }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      className={`field ${mono ? 'font-mono' : ''} ${className}`}
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setText(value)
        e.stopPropagation()
      }}
    />
  )
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export { SWATCHES } from './swatches'

export function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SWATCHES.map((c) => (
        <button key={c} onClick={() => onChange(c)} className="h-4 w-4 rounded-sm" style={{ background: c, outline: value === c ? '2px solid var(--text-strong)' : 'none', outlineOffset: 1 }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
    </div>
  )
}
