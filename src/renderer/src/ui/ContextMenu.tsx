// Right-click menu: a list of actions for whatever was clicked.

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

export interface MenuItem {
  label: string
  hint?: string
  shortcut?: string
  run: () => void
  danger?: boolean
  checked?: boolean
}

export interface MenuGroup {
  title?: string
  items: MenuItem[]
}

interface MenuState {
  at: { x: number; y: number } | null
  groups: MenuGroup[]
  open: (x: number, y: number, groups: MenuGroup[]) => void
  close: () => void
}

export const useContextMenu = create<MenuState>((set) => ({
  at: null,
  groups: [],
  open: (x, y, groups) => set({ at: groups.length ? { x, y } : null, groups }),
  close: () => set({ at: null, groups: [] })
}))

/** Opens the menu at a mouse position (clamped to the window when it is rendered). */
export const showContextMenu = (e: { clientX: number; clientY: number }, groups: MenuGroup[]) =>
  useContextMenu.getState().open(e.clientX, e.clientY, groups)

export function ContextMenuHost() {
  const { at, groups, close } = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const flat = groups.flatMap((g) => g.items)

  useEffect(() => setActive(0), [at])

  useEffect(() => {
    if (!at) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[active]
        close()
        item?.run()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  }, [at, close, flat, active])

  // Keep the whole menu on screen.
  useEffect(() => {
    const el = ref.current
    if (!el || !at) return
    const r = el.getBoundingClientRect()
    const x = Math.min(at.x, window.innerWidth - r.width - 8)
    const y = Math.min(at.y, window.innerHeight - r.height - 8)
    el.style.left = `${Math.max(4, x)}px`
    el.style.top = `${Math.max(4, y)}px`
  }, [at, groups])

  if (!at) return null
  let index = -1
  return (
    <div ref={ref} className="context-menu" style={{ left: at.x, top: at.y }} onContextMenu={(e) => e.preventDefault()}>
      {groups.map((g, gi) => (
        <div key={gi} className={gi ? 'border-t border-line-2 pt-1 mt-1' : ''}>
          {g.title && <div className="px-3 pb-0.5 pt-1 text-fine uppercase tracking-wide text-ink-faint">{g.title}</div>}
          {g.items.map((item) => {
            index++
            const i = index
            return (
              <button
                key={item.label}
                className={`menu-item ${i === active ? 'is-active' : ''} ${item.danger ? 'is-danger' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  close()
                  item.run()
                }}
                title={item.hint}
              >
                <span className="w-3 text-fine text-accent">{item.checked ? '✓' : ''}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && <span className="ml-4 text-fine text-ink-faint">{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
