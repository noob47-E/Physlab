// KaTeX display renderer for formula cards (SB18): wraps symbols in \\htmlData{q=<QKey>}{...},
// colouring each quantity through its theme token (--q-pos, --q-vel ...). Tapping or pressing
// Enter on a symbol toggles the highlight in cardLink, causing matching arrows and graph series
// to glow and the symbol to show a ring. Letters are always retained so nothing is told by
// colour alone.

import React, { memo, useEffect, useMemo, useRef } from 'react'
import katex from 'katex'
import { useCardLink } from '../../sim/cardLink'
import type { QKey } from '../../sim/cards/types'

interface KatexTrustContext {
  command: string
  attributes?: Record<string, string>
  key?: string
}

/** KaTeX trust function: strictly permits \\htmlData only when its attribute is data-q (or key is q). */
export function cardTexTrust(context: KatexTrustContext): boolean {
  if (context.command !== '\\htmlData') return false
  if (context.attributes) {
    const keys = Object.keys(context.attributes)
    return keys.length === 1 && keys[0] === 'data-q'
  }
  return context.key === 'q'
}

const CARD_TEX_STYLES = `
.card-tex-root [data-q] {
  cursor: pointer;
  border-radius: 2px;
  padding: 0 1px;
  display: inline-block;
}
.card-tex-root [data-q]:hover {
  filter: brightness(1.2);
}
.card-tex-root [data-q]:focus-visible {
  outline: 2px dashed currentColor;
  outline-offset: 2px;
}
.card-tex-root [data-q="pos"] { color: var(--q-pos); }
.card-tex-root [data-q="vel"] { color: var(--q-vel); }
.card-tex-root [data-q="acc"] { color: var(--q-acc); }
.card-tex-root [data-q="force"] { color: var(--q-force); }
.card-tex-root [data-q="weight"] { color: var(--q-weight); }
.card-tex-root [data-q="normal"] { color: var(--q-normal); }
.card-tex-root [data-q="friction"] { color: var(--q-friction); }
.card-tex-root [data-q="tension"] { color: var(--q-tension); }
.card-tex-root [data-q="spring"] { color: var(--q-spring); }
.card-tex-root [data-q="mom"] { color: var(--q-mom); }
.card-tex-root [data-q="heat"] { color: var(--q-heat); }
.card-tex-root [data-q="work"] { color: var(--q-work); }
.card-tex-root [data-q].card-q-active {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
`

interface CardTexProps {
  tex: string
  className?: string
  display?: boolean
}

export const CardTex = memo(function CardTex({ tex, className = '', display = false }: CardTexProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const highlighted = useCardLink((s) => s.highlighted)

  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
        trust: cardTexTrust,
        output: 'html'
      })
    } catch {
      return tex
    }
  }, [tex, display])

  // Enhance rendered [data-q] elements with focusable attributes and active highlight classes
  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const symbols = root.querySelectorAll<HTMLElement>('[data-q]')
    for (const el of symbols) {
      const q = el.getAttribute('data-q')
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0')
        el.setAttribute('role', 'button')
        el.setAttribute('aria-label', `Quantity ${q}`)
      }
      if (q && q === highlighted) {
        el.classList.add('card-q-active')
      } else {
        el.classList.remove('card-q-active')
      }
    }
  }, [html, highlighted])

  const handleClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null
    if (!target) return
    const q = target.getAttribute('data-q') as QKey | null
    if (q) {
      e.stopPropagation()
      useCardLink.getState().toggleHighlight(q)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null
      if (!target) return
      const q = target.getAttribute('data-q') as QKey | null
      if (q) {
        e.preventDefault()
        e.stopPropagation()
        useCardLink.getState().toggleHighlight(q)
      }
    }
  }

  return (
    <span
      ref={containerRef}
      className={`card-tex-root ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <style>{CARD_TEX_STYLES}</style>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
})
