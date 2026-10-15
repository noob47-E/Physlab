// The keys of a keypad, shared by the Calculator's popover and Graphing's docked keypad: a grid of
// keys with a long press (or the chevron) for a key's relatives. What a key inserts is the caller's.

import { memo, useRef } from 'react'
import type { FieldMode } from '../calc/calcStore'
import type { KeyDef, KeyGroup } from '../calc/keys'

export const KeyGrid = memo(function KeyGrid({ group, mode, onKey, moreOf, onMore }: { group: KeyGroup; mode: FieldMode; onKey: (k: KeyDef) => void; moreOf: string | null; onMore: (id: string | null) => void }) {
  const keys = group.keys.filter((k) => !k.modes || k.modes.includes(mode))
  return (
    <div className={`keys keys-${group.id}`} style={{ gridTemplateColumns: `repeat(${group.cols}, minmax(0, 1fr))` }}>
      {keys.map((k) => (
        <Key key={k.id} k={k} onKey={onKey} moreOpen={moreOf === k.id} onMore={onMore} />
      ))}
    </div>
  )
})

const LONG_PRESS_MS = 450

const Key = memo(function Key({ k, onKey, moreOpen, onMore }: { k: KeyDef; onKey: (k: KeyDef) => void; moreOpen: boolean; onMore: (id: string | null) => void }) {
  const timer = useRef<number | null>(null)
  // A long press opened the relatives; the click that ends it must not also insert the key.
  const held = useRef(false)
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <div className={`key-cell ${k.wide ? 'wide' : ''}`}>
      <button
        className={`key ${k.primary ? 'primary' : ''} ${moreOpen ? 'open' : ''}`}
        title={k.hint}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={() => {
          if (!k.more) return
          held.current = false
          clear()
          timer.current = window.setTimeout(() => {
            held.current = true
            onMore(k.id)
          }, LONG_PRESS_MS)
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onClick={() => {
          if (held.current) {
            held.current = false
            return
          }
          onKey(k)
        }}
      >
        {k.label}
        {k.more && (
          <span
            className="key-more"
            title={`More: ${k.more.map((m) => m.label).join(', ')}`}
            onClick={(e) => {
              e.stopPropagation()
              onMore(k.id)
            }}
          >
            ▾
          </span>
        )}
      </button>
      {moreOpen && k.more && (
        <div className="key-variants">
          {k.more.map((v) => (
            <button key={v.id} className="key" title={v.hint} onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(v)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
