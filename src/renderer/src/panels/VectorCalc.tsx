// Vector Calculator: vectors typed in natural textbook math, one-click operations,
// big answers with optional steps, and "Draw on graph" with full measurements.
//
// The panel is kept calm on purpose: the answer sits straight under the vector cards, six
// everyday operations are visible and the rest wait behind "More", and k and q only appear
// beside the operations that use them. Fifteen buttons plus two fields plus an expression box
// used to push the answer below the fold of a 430 px panel.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, Plus, Sigma, Trash2 } from 'lucide-react'
import { useScene } from '../core/store'
import { isDrawnAnswer, type DrawStyle } from '../core/visualize'
import { len, type V3 } from '../math/vec'
import { useView } from '../render/viewState'
import { partsLatex, partsOf } from './vectorParts'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { Tex } from '../ui/Tex'
import { VectorTryOne3D } from './VectorTryOne3D'
import { graphCardPrompt, answerHint, answerOnGraph, canDraw, drawAnswer, isCalcAnswer, resultOnlyOn, setResultOnly, addVectorFromScene, cardForSelection, explainVectorError, exprSolution, cardLineTex, cardValues, ijkLatex, droppedUnits, droppedUnitsSentence, isBlankCard, linkCardToScene, newCardName, nextCardId, nextStepHint, OPERATIONS, peekCardId, pickArrow, removeCard, renameCard, runOperation, setEntry, staleSentence, startCardSync, tooBigToDraw, useVC, type Card, type Entry, type VectorOperation } from './vectorCalcStore'

/** An operation's button: the store's table entry (what it reads, is called, shows and works out) with its id. */
interface Op extends VectorOperation {
  id: string
}

const op = (id: string): Op => ({ id, ...OPERATIONS[id] })

/** The six operations a student reaches for most, always visible. */
const COMMON_OPS: Op[] = ['sum', 'sub', 'dot', 'cross', 'mag', 'resolve'].map(op)

/** The rest, behind "More". */
const MORE_OPS: Op[] = ['scale', 'unit', 'angle', 'proj', 'equil', 'torque', 'work', 'lorentz', 'relvel'].map(op)

/**
 * The operation buttons, in as many columns as keep every label whole (V2). Three fixed columns left
 * "Components" (the longest word) wider than its 69 px track at the 960 px minimum window at 120 %
 * text: the button grew past its track and the whole panel scrolled sideways, and once it could
 * shrink the word still stuck out of the button, because a word cannot wrap. Each track is now at
 * least a label wide, so a panel of the minimum width gets two columns and a wide one three.
 */
const OP_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 px-2'

const STYLES: [DrawStyle | null, string][] = [
  [null, 'Auto'],
  ['head-to-tail', 'Head-to-tail'],
  ['parallelogram', 'Parallelogram'],
  ['common-tail', 'From origin']
]

export function VectorCalc() {
  const st = useVC()
  const settings = useScene((s) => s.settings)
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const selection = useScene((s) => s.selection)
  // 3D-1: in the 3-D view a card is typed or entered as x, y and z; size ∠ angle is a way of writing a plane vector.
  const is3D = useScene((s) => s.viewMode === '3d')
  // The drawing's width in pixels, subscribed to: the size limit in "Too big to draw…" is a number of
  // grid squares across it, and read from the store at render time it stayed that of the last render
  // after a window or panel resize, until a retype (G4b).
  const widthPx = useView((s) => s.widthPx)
  const [error, setError] = useState('')
  /** Why a card's new name was refused, beside that card. */
  const [nameProblem, setNameProblem] = useState<{ id: number; text: string }>({ id: 0, text: '' })
  const exprRef = useRef<MathInputHandle>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const set = useVC.setState

  // One pass from the top (cardValues): working each card out on its own redid every card above it.
  const values = useMemo(() => cardValues(st.cards, ev), [st.cards, ev])
  // Said only of a line that reads: under a line that is refused ("k A", "3 m\hat{i}") the note
  // named a unit (kA, mi) that nobody typed, beside an error saying the line could not be read.
  const exprUnits = useMemo(() => {
    const units = droppedUnits(st.expr, st.cards.map((c) => c.name))
    if (!units) return null
    try {
      exprSolution(st.expr, st.cards.map((c, i) => ({ name: c.name, v: values[i] })), settings)
      return units
    } catch {
      return null
    }
  }, [st.expr, st.cards, values, settings])
  // Helpers are not offered: a force arrow drawn to a stand-in length would read as the wrong vector.
  const sceneVectors = Object.values(objects).filter((o) => o.type === 'vector' && !o.auxiliary)

  // "Resultant only" is offered while the drawn answer is on the graph.
  const drawnHere = answerOnGraph(objects)
  // Read from the drawing, so undo, redo and the Outliner's eye buttons keep the button right.
  const onlyR = resultOnlyOn(objects)
  // An arrow another card already stands for is not offered twice.
  const offered = (card: Card) => sceneVectors.filter((o) => o.id === card.sceneId || !st.cards.some((c) => c.sceneId === o.id))
  // The cards the operations can read, in order: the hints name them as the operations will.
  const readable = st.cards.filter((_, i) => typeof values[i] !== 'string').map((c) => c.name)

  // Every readable card is an arrow on the drawing and each follows the other (vectorCalcStore);
  // the arrows are drawn from the moment the panel is first opened.
  useEffect(() => startCardSync(), [])

  // A vector drawn with the Vector tool arrives selected, and the panel answers by showing it: a
  // card that reads it is added if none does (a blank card waiting since "Add vector" is used
  // first), and that card is ringed and scrolled into view. Only the selection is watched, so a
  // card the student removes stays removed until the vector is selected again; Remove deselects
  // the vector for that reason, since a click on something already selected does not re-select.
  useEffect(() => {
    const match = cardForSelection(useVC.getState().cards, selection, useScene.getState().objects, (id) => isDrawnAnswer(id) || isCalcAnswer(id))
    if (match.kind === 'none') set({ highlight: 0 })
    else if (match.kind === 'card') set({ highlight: match.cardId })
    else if (match.kind === 'link') set({ highlight: linkCardToScene(match.cardId, match.sceneId, match.name) })
    else set({ highlight: addVectorFromScene(match.sceneId, match.name) })
  }, [selection, set])
  useEffect(() => {
    if (st.highlight) highlightRef.current?.scrollIntoView({ block: 'nearest' })
  }, [st.highlight])

  const updateCard = (id: number, patch: Partial<Card>) => set({ cards: st.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  /** The x, y, z boxes (3D-1): filled from the card's vector as it is now, so switching keeps the value. */
  const toBoxes = (card: Card, v: V3 | string) => {
    // A line that cannot be read is not swapped for an older vector: it says what is wrong and stays. A blank card (or
    // a graph card with nothing picked) opens empty boxes.
    const blank = isBlankCard(card) || (card.entry === 'scene' && !card.sceneId)
    if (typeof v === 'string' && !blank) {
      setError(`Put ${card.name} right first, then it can be split into x, y and z: ${v}`)
      return
    }
    setError('')
    if (card.entry !== 'comp') setEntry(card.id, 'comp')
    const parts: [string, string, string] = typeof v === 'string' ? ['', '', ''] : partsOf(v)
    const now = useVC.getState().cards
    set({ cards: now.map((c) => (c.id === card.id ? { ...c, entry: 'comp', parts, latex: partsLatex(parts) } : c)) })
  }
  /** Back to one typed line: the vector written with i, j and k. */
  const toTyped = (card: Card, v: V3 | string) => {
    if (card.entry === 'comp' && card.parts) updateCard(card.id, { parts: undefined, latex: typeof v === 'string' ? card.latex : ijkLatex(v, true) })
    else setEntry(card.id, 'comp')
  }
  const setPart = (card: Card, i: number, text: string) => {
    const parts = [...(card.parts ?? ['', '', ''])] as [string, string, string]
    parts[i] = text
    updateCard(card.id, { parts, latex: partsLatex(parts) })
  }

  /** An operation button: the store works it out and says why when it cannot (H9). */
  const run = (opId: string) => setError(runOperation(opId) ?? '')

  /** Free expression: A + 2B − C, A × B, |A|… */
  const runExpr = () => {
    setError('')
    try {
      const expr = st.expr
      const { sol, used } = exprSolution(expr, st.cards.map((c, i) => ({ name: c.name, v: values[i] })), settings)
      const cards = st.cards.filter((c) => used.includes(c.name)).map((c) => ({ id: c.id, name: c.name }))
      set({ result: { sol, label: 'Expression', from: { cards, solve: (named, now) => exprSolution(expr, named, now).sol } } })
    } catch (e) {
      setError(explainVectorError(e))
    }
  }

  const addCard = () => {
    // A letter the drawing already uses (a point A) would give the card's arrow the name A1.
    const taken = Object.values(useScene.getState().objects).map((o) => ({ name: o.name }) as Card)
    const name = newCardName([...st.cards, ...taken], peekCardId())
    set({ cards: [...st.cards, { id: nextCardId(), name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '' }] })
  }

  // The buttons shrink to their track and wrap a two-word label inside the button (V2); the track
  // itself (OP_GRID) is never narrower than a whole label.
  const opButton = (op: Op) => (
    <button key={op.id} className="btn h-auto min-h-[44px] min-w-0 flex-col items-start gap-0 whitespace-normal px-1.5 py-1 text-left" title={op.help} onClick={() => run(op.id)}>
      <span className="break-words text-small text-[color:var(--text-strong)]">{op.label}</span>
      <span className="text-fine text-[color:var(--text-dim)]">
        <Tex tex={is3D && op.id === 'resolve' ? String.raw`A_x,\ A_y,\ A_z` : op.tex} />
      </span>
    </button>
  )

  return (
    <div className="panel pb-8">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Sigma size={16} className="text-[color:var(--accent)]" />
        <div className="font-semibold text-[color:var(--text-strong)]">Vector Calculator</div>
        <div className="flex-1" />
        <span className="text-fine text-[color:var(--text-faint)]">{is3D ? 'Type like a textbook: 3i + 4j + 5k, (3, 4, 5)' : 'Type like a textbook: 3i + 4j, 10∠30°, ½A'}</span>
      </div>

      {is3D && <VectorTryOne3D onProblem={setError} />}

      {st.cards.length === 0 && <div className="px-3 py-2 text-[color:var(--text-dim)]">Add a vector, or draw one on the graph.</div>}

      {st.cards.map((card, idx) => {
        const v = values[idx]
        const ok = typeof v !== 'string'
        // A card nobody has typed in yet, or a graph card with nothing picked, is waiting, not
        // wrong: "Add vector" used to answer with a red border and a red sentence before the
        // student had done anything. Red is kept for a vector that cannot be read, and an
        // operation that reaches an empty card says so in its own error line.
        // A waiting card's prompt says what to do and what follows, not only "pick" (Fix 24).
        const waiting = !ok && (isBlankCard(card) || (card.entry === 'scene' && !card.sceneId))
        const lit = st.highlight === card.id
        // A typed vector is plain numbers; only one read off the drawing carries the drawing's unit.
        const sizeKind = card.entry === 'scene' ? 'length' : 'number'
        // An arrow longer than the camera can zoom out to is drawn as nothing: say so, under the card.
        const tooBig = ok ? tooBigToDraw(len(v as V3), settings, widthPx) : null
        return (
          <div key={card.id} ref={lit ? highlightRef : undefined} className={`card p-2 ${ok || waiting ? '' : 'border-[color:var(--bad)]'} ${lit ? 'ring-2 ring-[color:var(--accent)]' : ''}`}>
            {/* The row wraps and the switch may shrink: at the 960 px minimum window the three
                labels once pushed the Remove button out of the card, with no way to remove it. */}
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <input
                className="field text-center text-lead font-math font-semibold italic"
                // As wide as the name: F_1 or v_A read whole (a fixed 2.75 rem showed "F_.").
                style={{ width: `${Math.max(2.75, card.name.length * 0.8 + 1.2)}rem` }}
                value={card.name}
                title="Letters and digits, not i, j or k (those are the unit vectors)"
                // The card and its arrow share one name; the drawing refuses a name it already uses.
                onChange={(e) => setNameProblem({ id: card.id, text: renameCard(card.id, e.target.value) ?? '' })}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {/* One way in: the maths field, which takes 3i + 4j and 10∠30° alike. Size and angle
                  as two boxes stay a chip away for a student whose book writes vectors that way. */}
              {/* flex-wrap, not overflow-x-auto: at the 960 px minimum window and 120 % text the switch
                  scrolled inside itself and "graph" was out of sight; now it wraps to a second line. */}
              <div className="seg min-w-0 shrink flex-wrap">
                {(
                  (is3D
                    ? [
                        ['comp', 'typed', 'Type it, like 3i + 4j + 5k or (3, 4, 5)'],
                        ['xyz', 'x, y, z', 'Its x, y and z parts in three boxes'],
                        // A card already in size ∠ angle keeps its switch: a plane vector's way of writing.
                        ...(card.entry === 'polar' ? [['polar', 'size ∠ angle', 'Size and angle in two boxes (a vector in the x-y plane)']] : []),
                        ['scene', 'graph', 'Read it off a vector on the graph']
                      ]
                    : [
                        ['comp', 'typed', 'Type it, like 3i + 4j or 10∠30°'],
                        ['polar', 'size ∠ angle', 'Size and angle in two boxes'],
                        ['scene', 'graph', 'Read it off a vector on the graph']
                      ]) as [Entry | 'xyz', string, string][]
                ).map(([k, l, tip]) => {
                  const boxes = card.entry === 'comp' && !!card.parts && is3D
                  const on = k === 'xyz' ? boxes : k === 'comp' ? card.entry === 'comp' && !boxes : card.entry === k
                  const pick = () => (k === 'xyz' ? toBoxes(card, v) : k === 'comp' ? toTyped(card, v) : setEntry(card.id, k))
                  return (
                    <button key={k} className={`min-h-[44px] ${on ? 'on' : ''}`} title={tip} onClick={pick}>
                      {l}
                    </button>
                  )
                })}
              </div>
              {/* ml-auto rather than a spacer: a zero-width spacer stays on the first line when
                  the button alone wraps, which left the wrapped button hanging at the left. */}
              <button
                className="ml-auto min-h-[44px] min-w-[44px] rounded text-[color:var(--text-faint)] hover:text-[color:var(--bad)]"
                title="Remove this vector"
                // The card and its arrow go together, as one undo step (Fix 25).
                onClick={() => removeCard(card.id)}
              >
                <Trash2 size={14} className="mx-auto" />
              </button>
            </div>
            {card.entry === 'comp' && !(is3D && card.parts) && <MathInput value={card.latex} onChange={(l) => updateCard(card.id, { latex: l, parts: undefined })} onEnter={() => run('sum')} placeholder={is3D ? '3i + 4j + 5k  or  (3, 4, 5)' : '3i + 4j  or  10∠30°'} />}
            {card.entry === 'comp' && is3D && card.parts && (
              // 3D-1: three boxes; each track may shrink (minmax(0, 1fr)) so a long number scrolls in its own box.
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                {(['x', 'y', 'z'] as const).map((axis, i) => (
                  <span key={axis} className="contents">
                    <span className="font-math italic text-[color:var(--text-dim)]">{axis}</span>
                    <MathInput size="sm" value={card.parts![i]} onChange={(l) => setPart(card, i, l)} onEnter={() => run('sum')} placeholder="0" />
                  </span>
                ))}
              </div>
            )}
            {card.entry === 'polar' && (
              // minmax(0, 1fr), not a bare 1fr: a bare 1fr track cannot be narrower than what its field
              // holds, so a long size or angle widened the row past the panel's edge. Now each field
              // keeps its track's width and scrolls its own digits.
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5">
                <MathInput size="sm" value={card.mag} onChange={(l) => updateCard(card.id, { mag: l })} placeholder="size" />
                <span className="text-title text-[color:var(--text-dim)]">∠</span>
                <MathInput size="sm" value={card.angle} onChange={(l) => updateCard(card.id, { angle: l })} placeholder="angle" />
                <span className="text-[color:var(--text-dim)]">°</span>
              </div>
            )}
            {card.entry === 'scene' && (
              <select
                className="field min-h-[44px]"
                value={card.sceneId}
                onChange={(e) => pickArrow(card.id, e.target.value)}
              >
                <option value="">— choose an arrow from the graph —</option>
                {offered(card).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-1 min-h-5 pl-1 text-body">
              {ok ? (
                // The whole line is KaTeX, so the vector, its size and its angle share one number form.
                <span className="text-[color:var(--text)]">
                  <Tex tex={cardLineTex(card.name, v as V3, sizeKind, settings)} />
                </span>
              ) : waiting ? (
                <span className="text-[color:var(--text-dim)]">{card.entry === 'scene' ? graphCardPrompt(sceneVectors.length, offered(card).length, v as string) :'Type a vector above, like 3i + 4j or 10∠30°. It is drawn on the graph as you type.'}</span>
              ) : (
                <span className="text-[color:var(--bad)]">{v as string}</span>
              )}
            </div>
            {ok && (() => { const gone = droppedUnits(card.entry === 'comp' ? card.latex : card.entry === 'polar' ? card.mag : '', st.cards.map((c) => c.name)); return gone ? <div className="pl-1 text-fine text-[color:var(--text-dim)]">{droppedUnitsSentence(gone)}</div> : null })()}
            {ok && tooBig && <div className="pl-1 text-small text-[color:var(--warn)]">{tooBig}</div>}
            {nameProblem.id === card.id && nameProblem.text && <div className="pl-1 text-small text-[color:var(--bad)]">{nameProblem.text}</div>}
            {ok && readable.includes(card.name) && <div className="pl-1 text-fine text-[color:var(--text-dim)]">{nextStepHint(readable, readable.indexOf(card.name))}</div>}
          </div>
        )
      })}

      <div className="flex items-center gap-2 px-2">
        <button className="btn min-h-[44px] px-4" onClick={addCard}>
          <Plus size={15} /> Add vector
        </button>
      </div>

      {error && <div className="mx-3 mt-2 rounded px-2 py-1 text-[color:var(--bad)]" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>{error}</div>}

      {st.result && (
        <div className="card mt-2 border-[color:var(--warn)]" data-vc-result style={{ background: 'color-mix(in srgb, var(--warn) 6%, transparent)' }}>
          <div className="flex items-center gap-2 border-b border-[color:var(--warn)] px-2 py-1.5">
            <span className="flex-1 font-semibold text-[color:var(--warn)]">{st.result.sol.title}</span>
          </div>
          <div className="px-3 py-2">
            {st.result.sol.answers.map((a) => (
              <div key={a.label} className="flex items-baseline gap-3 py-0.5">
                <span className="w-24 shrink-0 text-[color:var(--text-dim)]">{a.label}</span>
                <Tex tex={a.tex} className="text-title text-[color:var(--text-strong)]" />
              </div>
            ))}
            {st.result.stale && <div className="pt-1 text-small text-[color:var(--warn)]">{staleSentence(st.result)}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--warn)] px-2 py-1.5">
            {canDraw(st.result) && (
              // The cards' own arrows are laid out and only the answer is added: the scene
              // bridge's copies put A1 on top of A (Fix 2).
              <button className="btn primary min-h-[44px]" onClick={() => drawAnswer(st.result!.sol, st.style)}>
                <Eye size={13} /> Draw on graph
              </button>
            )}
            {drawnHere && (
              <button className={`btn min-h-[44px] ${onlyR ? 'on' : ''}`} aria-pressed={onlyR} title="Hide the vectors it was worked from, or show them again" onClick={() => setResultOnly(!onlyR)}>
                Resultant only
              </button>
            )}
            <div className="flex-1" />
            <button className="btn ghost min-h-[44px]" onClick={() => set({ showSteps: !st.showSteps })}>
              {st.showSteps ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Steps
            </button>
            {canDraw(st.result) && (
              // Its own row: beside the button the layout names wrapped mid-word in a narrow panel.
              // A two-by-two grid, not one nowrap row: .seg clips what overflows, and at the
              // panel's default width the fourth choice read "From origi" with no way to see the rest.
              <div className="seg grid basis-full grid-cols-2">
                {STYLES.map(([k, l]) => (
                  <button
                    key={l}
                    className={`min-h-[44px] justify-center whitespace-nowrap ${st.style === k ? 'on' : ''}`}
                    title={k ? '' : "The solution's own picture"}
                    onClick={() => {
                      set({ style: k })
                      // A picture already on the graph is redrawn in the chosen layout at once.
                      if (drawnHere) drawAnswer(st.result!.sol, k)
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-1.5 text-fine text-[color:var(--text-dim)]">{answerHint(canDraw(st.result))}</div>
          {st.showSteps && (
            <ol className="steps space-y-1 px-2 pb-2">
              {st.result.sol.steps.map((s, i) => (
                <li key={i} className="rounded bg-[var(--bg-3)] px-2 py-1.5">
                  <span className="mr-2 text-fine text-[color:var(--text-faint)]">{i + 1}.</span>
                  {s.text && <span className="text-[color:var(--text)]">{s.text}</span>}
                  {s.tex && <Tex tex={s.tex} display />}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className={`mt-2 ${OP_GRID}`}>{COMMON_OPS.map(opButton)}</div>

      <button className="btn ghost mx-2 mt-1 min-h-[44px]" onClick={() => set({ showMore: !st.showMore })}>
        {st.showMore ? <ChevronDown size={13} /> : <ChevronRight size={13} />} More {st.showMore ? '' : `(${MORE_OPS.length})`}
      </button>
      {st.showMore && (
        <div className={OP_GRID}>
          {MORE_OPS.map((op) =>
            op.field ? (
              // The field's track may shrink (as in the size ∠ angle row); the button's keeps its text.
              <div key={op.id} className="col-span-full grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-1.5">
                {opButton(op)}
                <span className="text-[color:var(--text-dim)]">{op.field} =</span>
                <MathInput size="sm" value={st[op.field]} onChange={(l) => (op.field === 'k' ? set({ k: l }) : set({ q: l }))} />
              </div>
            ) : (
              opButton(op)
            )
          )}
        </div>
      )}

      <div className="card mt-2 p-2">
        <div className="mb-1 text-fine uppercase tracking-wide text-[color:var(--text-faint)]">Or type any vector expression</div>
        <div className="flex items-center gap-1.5">
          {/* min-w-0: a flex item is never narrower than its content unless told so, and the "=" button
              was pushed off the panel by a long expression. */}
          <div className="min-w-0 flex-1">
            <MathInput ref={exprRef} value={st.expr} onChange={(l) => set({ expr: l })} onEnter={runExpr} />
            {exprUnits && <div className="pl-1 pt-1 text-fine text-[color:var(--text-dim)]">{droppedUnitsSentence(exprUnits)}</div>}
          </div>
          <button className="btn primary min-h-[44px] min-w-[44px]" onClick={runExpr}>
            =
          </button>
        </div>
      </div>
    </div>
  )
}
