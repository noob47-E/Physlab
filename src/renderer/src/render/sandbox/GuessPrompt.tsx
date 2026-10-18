// GF-SANDBOX: "Guess first" dialog for the Sandbox.
// When pressing Play on an experiment, first prompts the student for a prediction,
// with a "Just play" escape option.

import { useEffect, useRef, useState } from 'react'
import { useGuessStore, type PredictionTarget } from '../../sim/guessStore'
import { play } from '../../sim/transportActions'
import { CardTex } from './CardTex'

export function GuessPrompt() {
  const promptOpen = useGuessStore((s) => s.promptOpen)
  const target = useGuessStore((s) => s.target)

  if (!promptOpen || !target) return null

  return <GuessPromptDialog key={target.key} target={target} />
}

function GuessPromptDialog({ target }: { target: PredictionTarget }) {
  const submit = useGuessStore((s) => s.submit)
  const skip = useGuessStore((s) => s.skip)

  const [inputText, setInputText] = useState('')
  const [selectedChoice, setSelectedChoice] = useState(() => target.choices?.[0] ?? '')
  const [showFormula, setShowFormula] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!target.choices) {
      inputRef.current?.focus()
    }
  }, [target.choices])

  const handlePredictAndPlay = () => {
    const val = target.choices ? selectedChoice : inputText
    submit(val)
    play({ force: true })
  }

  const handleJustPlay = () => {
    skip()
    play({ force: true })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePredictAndPlay()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleJustPlay()
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm pointer-events-auto select-none"
      onClick={handleJustPlay}
      onKeyDown={handleKeyDown}
      data-testid="guess-prompt-modal"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-line bg-surface-1/95 p-5 shadow-2xl backdrop-blur text-body flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guess-prompt-title"
      >
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 id="guess-prompt-title" className="text-lead font-semibold text-ink flex items-center gap-2">
            <span>Predict before you play</span>
          </h2>
          <button
            type="button"
            onClick={handleJustPlay}
            className="text-fine text-ink-dim hover:text-ink px-1.5 py-0.5 rounded border border-transparent hover:border-line"
            title="Just play without predicting (Esc)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="text-small text-ink-dim">
          <span>What will be the </span>
          <strong className="text-ink font-semibold">{target.label}</strong>
          {target.unit ? <span> in <strong>{target.unit}</strong>?</span> : <span>?</span>}
        </div>

        {target.formula && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setShowFormula((prev) => !prev)}
              className="text-fine text-accent hover:underline self-start flex items-center gap-1 cursor-pointer"
              data-testid="toggle-formula-btn"
            >
              <span>{showFormula ? 'Hide the formula' : 'Show the formula'}</span>
            </button>
            {showFormula && (
              <div
                className="rounded bg-surface-2/60 px-3 py-1.5 text-center font-math text-small text-ink border border-line/50"
                data-testid="guess-formula-box"
              >
                <CardTex tex={target.formula} />
              </div>
            )}
          </div>
        )}

        {target.choices && target.choices.length > 0 ? (
          <div className="flex flex-col gap-2 my-1" role="radiogroup" aria-label="Prediction options">
            {target.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setSelectedChoice(choice)}
                data-testid="guess-choice-btn"
                className={`w-full text-left px-3 py-2 rounded border text-small transition flex items-center justify-between ${
                  selectedChoice === choice
                    ? 'border-accent bg-accent/10 text-ink font-medium shadow-sm'
                    : 'border-line bg-surface-2/40 text-ink-dim hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span>{choice}</span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedChoice === choice ? 'border-accent bg-accent' : 'border-line'
                  }`}
                >
                  {selectedChoice === choice && <span className="w-1.5 h-1.5 rounded-full bg-on-accent" />}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 my-1">
            <label htmlFor="guess-input" className="text-fine text-ink-dim">
              Your prediction {target.unit ? `(${target.unit})` : ''}:
            </label>
            <div className="relative flex items-center">
              <input
                id="guess-input"
                ref={inputRef}
                type="text"
                autoFocus
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={target.unit ? `e.g. 2.5 ${target.unit}` : 'Type your prediction'}
                data-testid="guess-input"
                className="w-full h-10 px-3 rounded border border-line bg-surface-2/60 text-body text-ink placeholder:text-ink-dim/50 focus:border-accent focus:outline-none"
              />
              {target.unit && (
                <span className="absolute right-3 text-small text-ink-dim pointer-events-none font-mono">
                  {target.unit}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line mt-1">
          <button
            type="button"
            onClick={handleJustPlay}
            data-testid="just-play-btn"
            className="btn ghost min-h-[38px] px-3 text-small text-ink-dim hover:text-ink"
            title="Just play without predicting (Esc)"
          >
            Just play
          </button>
          <button
            type="button"
            onClick={handlePredictAndPlay}
            data-testid="predict-play-btn"
            className="btn primary min-h-[38px] px-4 text-small font-medium"
          >
            Predict &amp; Play
          </button>
        </div>
      </div>
    </div>
  )
}
