// Natural textbook-math input (MathLive): fractions, roots, powers, vectors and angles look like a book.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import 'mathlive/fonts.css'

// Fonts come from the bundled CSS; no sounds, fully offline.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
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
    const onInput = () => cbs.current.onChange?.(mf.getValue('latex-unstyled'))
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        cbs.current.onEnter?.()
      }
    }
    mf.addEventListener('input', onInput)
    mf.addEventListener('keydown', onKey, { capture: true })
    if (autoFocus) setTimeout(() => mf.focus(), 0)
    return () => {
      mf.removeEventListener('input', onInput)
      mf.removeEventListener('keydown', onKey, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const mf = el.current
    try {
      if (mf && mf.getValue('latex-unstyled') !== value) mf.setValue(value, { silenceNotifications: true })
    } catch {
      /* not mounted yet: applied on mount */
    }
  }, [value])

  useImperativeHandle(ref, () => ({
    insert: (latex) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      mf.executeCommand(['insert', latex, { focus: true, feedback: false, selectionMode: 'placeholder' }])
      cbs.current.onChange?.(mf.getValue('latex-unstyled'))
    },
    command: (cmd) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      mf.executeCommand(cmd as never)
      cbs.current.onChange?.(mf.getValue('latex-unstyled'))
    },
    nextBox: (dir) => {
      const mf = el.current
      if (!mf) return
      mf.focus()
      const before = mf.position
      const hasBoxes = mf.getValue('latex-unstyled').includes('placeholder')
      if (hasBoxes) {
        mf.executeCommand(dir > 0 ? 'moveToNextPlaceholder' : 'moveToPreviousPlaceholder')
        if (mf.position === before) mf.executeCommand(dir > 0 ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder')
        if (mf.position !== before) return
      }
      mf.executeCommand(dir > 0 ? 'moveToNextChar' : 'moveToPreviousChar')
    },
    focus: () => el.current?.focus(),
    getLatex: () => el.current?.getValue('latex-unstyled') ?? '',
    setLatex: (latex) => {
      el.current?.setValue(latex, { silenceNotifications: true })
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
