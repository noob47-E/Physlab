// Natural textbook-math input (MathLive): fractions, roots, powers, vectors and angles look like a book.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import 'mathlive/fonts.css'

// Fonts come from the bundled CSS; no sounds, fully offline.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- React's own JSX types live in a namespace, and a custom element is declared by adding to it
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

/**
 * MathLive's placeholder commands are its Tab key: with no box left in that direction it leaves
 * the field for the next control on the page. The ▶ key of the popup keypad ran into that — the
 * caret went to the Keypad button and the next digit typed switched the drawing tool.
 */
const keepFocus = (mf: MathfieldElement): void => {
  if (!mf.hasFocus()) mf.focus()
}

export interface MathInputHandle {
  insert: (latex: string) => void
  command: (cmd: string) => void
  /** Jump to the next empty box (wrapping around); moves the cursor when there are no boxes. */
  nextBox: (dir: 1 | -1) => void
  focus: () => void
  getLatex: () => string
  setLatex: (latex: string) => void
}

interface Props {
  value: string
  onChange?: (latex: string) => void
  onEnter?: () => void
  placeholder?: string
  className?: string
  /** Visual size variant. */
  size?: 'sm' | 'md' | 'lg'
  autoFocus?: boolean
}

export const MathInput = forwardRef<MathInputHandle, Props>(function MathInput({ value, onChange, onEnter, placeholder, className = '', size = 'md', autoFocus }, ref) {
  const el = useRef<MathfieldElement | null>(null)
  const cbs = useRef({ onChange, onEnter })
  cbs.current = { onChange, onEnter }
  // The LaTeX this field last handed to onChange. When the value prop comes back equal to it,
  // the change was the student's own typing and the field already shows it: serialising the
  // whole expression again to find that out was a second getValue on every keystroke.
  const lastEmitted = useRef<string | null>(null)

  useEffect(() => {
    const mf = el.current
    if (!mf) return
    // Some options can only be set once the element is attached (panels in hidden tabs mount later).
    const configure = () => {
      try {
        mf.smartFence = true
        mf.smartSuperscript = true
        mf.mathVirtualKeyboardPolicy = 'manual'
        mf.popoverPolicy = 'off'
        mf.menuItems = []
        if (placeholder) mf.placeholder = `\\text{${placeholder.replace(/[{}\\]/g, '')}}`
        // Keyboard shortcuts that feel like a calculator.
        mf.inlineShortcuts = { ...mf.inlineShortcuts, ang: '\\angle', deg: '^{\\circ}', vec: '\\vec{#?}', ihat: '\\hat{i}', jhat: '\\hat{j}', khat: '\\hat{k}' }
        if (mf.getValue('latex-unstyled') !== value) mf.setValue(value, { silenceNotifications: true })
        return true
      } catch {
        return false
      }
    }
    if (!configure()) mf.addEventListener('mount', configure, { once: true })
    const onInput = () => {
      const latex = mf.getValue('latex-unstyled')
      lastEmitted.current = latex
      cbs.current.onChange?.(latex)
    }
    /**
     * Only a plain Enter is taken. Everything else must reach MathLive.
     *
     * This used to call stopPropagation() on every key. MathLive does its real keyboard work on an
     * element inside its own shadow root, also in the capture phase, so stopping the event on the
     * host killed it before MathLive ever saw it: Backspace, Delete, the arrow keys, Home and End
     * all did nothing, and only plain typing survived — through a native fallback, by luck.
     *
     * Nothing else needs the blanket stop either: the global shortcut handler already stands down
     * for a MATH-FIELD target (app/keyTargets.ts), and events from the shadow root are retargeted
     * to the host before they reach window.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      // A field nobody is listening to should not swallow the key either.
      if (!cbs.current.onEnter) return
      e.preventDefault() // MathLive would otherwise start a new line
      e.stopPropagation() // and the tour would treat it as "next step"
      cbs.current.onEnter()
    }
    mf.addEventListener('input', onInput)
    mf.addEventListener('keydown', onKey, { capture: true })
    if (autoFocus) setTimeout(() => mf.focus(), 0)
    return () => {
      mf.removeEventListener('input', onInput)
      mf.removeEventListener('keydown', onKey, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount: the listeners read the latest callbacks through `cbs`, `value` and `placeholder` have their own effects below, and autoFocus is a first-render decision
  }, [])

  useEffect(() => {
    const mf = el.current
    if (value === lastEmitted.current) return
    // A value set from outside (history, a recalled entry) is now what the field shows too, so
    // the same value arriving again later is not mistaken for a fresh change.
    lastEmitted.current = value
    try {
      if (mf && mf.getValue('latex-unstyled') !== value) mf.setValue(value, { silenceNotifications: true })
    } catch {
      /* not mounted yet: applied on mount */
    }
  }, [value])

  // The Calculator changes its hint with the mode (CMPLX shows a complex example), and a hint set
  // only on mount stayed on the old mode's words.
  useEffect(() => {
    const mf = el.current
    try {
      if (mf && placeholder) mf.placeholder = `\\text{${placeholder.replace(/[{}\\]/g, '')}}`
    } catch {
      /* not mounted yet: applied on mount */
    }
  }, [placeholder])

  useImperativeHandle(ref, () => ({
    insert: (latex) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      mf.executeCommand(['insert', latex, { focus: true, feedback: false, selectionMode: 'placeholder' }])
      const next = mf.getValue('latex-unstyled')
      lastEmitted.current = next
      cbs.current.onChange?.(next)
    },
    command: (cmd) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      mf.executeCommand(cmd as never)
      keepFocus(mf)
      const next = mf.getValue('latex-unstyled')
      lastEmitted.current = next
      cbs.current.onChange?.(next)
    },
    nextBox: (dir) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      const before = mf.position
      const hasBoxes = mf.getValue('latex-unstyled').includes('placeholder')
      const moved = (cmd: string): boolean => {
        mf.executeCommand(cmd as never)
        keepFocus(mf)
        return mf.position !== before
      }
      if (hasBoxes) {
        if (moved(dir > 0 ? 'moveToNextPlaceholder' : 'moveToPreviousPlaceholder')) return
        if (moved(dir > 0 ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder')) return
      }
      moved(dir > 0 ? 'moveToNextChar' : 'moveToPreviousChar')
    },
    focus: () => el.current?.focus(),
    getLatex: () => el.current?.getValue('latex-unstyled') ?? '',
    setLatex: (latex) => {
      el.current?.setValue(latex, { silenceNotifications: true })
      lastEmitted.current = latex
      cbs.current.onChange?.(latex)
    }
  }))

  return (
    <math-field
      ref={(node: HTMLElement | null) => {
        el.current = node as MathfieldElement | null
      }}
      className={`math-input math-input-${size} ${className}`}
    />
  )
})
