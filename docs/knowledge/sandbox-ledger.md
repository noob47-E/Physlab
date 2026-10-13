# Sandbox energy ledger — where every joule went (SB10)

What the area does: the Energy section of the Sandbox panel says where all the energy of a run is at the moment shown:
in motion, in height, in springs, put in by a push or the hand, taken out by PhysLab's own forces (the air, rolling, a
spring's damper), or turned into heat inside the engine. With nothing in the scene to lose energy to, the leftover is
the step's own numerical drift, and the card says so. It reads the recorded run (`sandbox-tape.md`), so it works the
same live, in replay and in fine replay.

## Files
| File | One line |
|---|---|
| `src/renderer/src/sim/ledger.ts` | `ledgerAt(tape, step, scene)` → `LedgerReading` (I-9); `ledgerStart(reading)`. Pure over a tape. |
| `src/renderer/src/panels/sandbox/EnergyLedger.tsx` | The card (it was the Energy readout before SB10), and `ledgerText`, the words of its fixed lines. |
| `src/renderer/src/sim/thermal.ts` | Specific heats (SB31) for ΔT = Q / (m c). |

## The sums
- E(step) = kinetic (½mv² + ½Iω², every moving body) + height (mgh above the floor's top) + spring (½kx² of every spring
  link, PhysLab's own and the engine's), from the tape's record at that step. A rope's links are not counted.
- W = the tape's `workSum(first + 1, step)`: drag, rolling, push, hand, damper, each F·dx (rolling τ·ω·Δt) as SB0 adds
  them. The reading gives pushes and the hand as energy IN, and drag, rolling and dampers as energy OUT (positive when
  the air took energy away).
- Edits part-way (a body placed or a position typed while the run is paused) are energy put in by hand: the recorder
  takes a keyframe after the first step that follows any outside change, so every keyframe off the once-a-second grid
  marks one, and the whole energy change of that step goes to `hand` instead of heat or drift. The step's own physics
  goes with it (a stiff engine spring spends most of an edit's ½kx² inside that one step), and while dragging in play
  every frame is such a step.
- Leftover = E₀ + W − E(step), E₀ the energy at the tape's first record.
- If any source the engine handles inside itself has shown up by that step (friction where surfaces slide, a bounce
  with e < 1, a body's linear damping while it moves, the engine's spin damping while it spins, a spring too stiff for
  the step that the engine works itself, a rope), the leftover is `heat` and `drift` is null. Otherwise `heat` is 0 and
  `drift` = −leftover: the step's error (SB30's sentences explain it). Air, rolling and dampers are PhysLab's own work:
  they never make heat, the card lists them on their own line.
- `sources` are listed in a fixed order, from the first step each showed up: replaying a moment reads exactly what the
  live run read then. Air resistance shows up at the first step the air did work (a body at rest in air loses nothing).
- A playhead between two steps reads the step at or before it, the one the tape strip names (`Math.floor(head + 1e-9)`).
- The push's work is what the step really moved the body: 2 N for 1 s at 240 is 2(1 + Δt) J while the kinetic energy is
  2.000 J; the 0.0083 J difference is the step's drift, shown as such. Not a counting error.

## Who gets the heat (ΔT)
Simplified, and the card says so: "all the heat stays in the bodies that rubbed or hit". Each step's heat (the energy
lost that step beyond PhysLab's own work) is split equally over that step's bounces and sliding contacts; between a
moving body and a fixed one the moving body takes the pair's share, between two moving bodies half each. A step with
neither gives it to the bodies the engine damped that step, else to every moving body. The shares are added up per body
and scaled to the heat; ΔT = Q / (m c) with c from `thermal.ts`. A fixed body is never listed.

## Measured (Node, 240 steps a second)
- Spring on ice: the total stays at 13.905 J within 0.095 J (0.68 %) for 10 s; no source; drift at most 0.095 J.
- Mass on a spring: 16.000 J in the spring at the start.
- Sliding to a stop: heat 90.000 J when the crate stops at 1.529 s after 4.575 m; ΔT 0.01059 K, shown "≈ 0.011 K".
- Bouncing ball (e 0.8): 36.1, 35.4, 35.3 and 35.1 % of the kinetic energy turned to heat at the four bounces.
- A 2 N push on 1 kg for 1 s: pushed in 2(1 + Δt) J (+0.42 %, the step), kinetic 2.000 J, heat 0.
- A 0.5 kg ball falling 3 s in air: the drift is the step's free-fall deficit ½g²Δt m t within 0.1 % of E₀.

## The card
One stacked bar (kinetic `--q-vel`, height `--q-pos`, spring `--q-spring`, heat `--q-heat`, taken out by PhysLab's forces
`--q-work`), then fixed lines: KE and PE, the spring (when the scene has one, from the start), total and momentum, "at the
start" and "pushed in", "lost to air · rolling · dampers", and one line that is either "heat 90 J · Crate ΔT ≈ 0.011 K"
or "drift −0.16 J (−0.33 %): the 1/240 s step, not physics". Every line is there before the first step ("heat 0 J ·
nothing lost yet"), so nothing below the card moves on Play (Fix 22). The per-body and per-spring rows are as before.

## Traps
- Nothing in the app starts the recorder before SB16: until it does, there is no tape and the card reads the live values
  with nothing lost. In a browser check, start it by hand from the dev console (`startRecorder(window.__sim)`).
- The book (`ledger.ts`, one per tape) is kept while the tape, its first step, the bodies, the links and gravity stay the
  same objects; a branch that cuts the tape before the book's last step starts it again.
- An edit part-way changes the energy without any work: it is counted as "by hand" only through the recorder's
  keyframe after it. An edit that lands exactly on a once-a-second keyframe step is not told apart and shows as heat or
  drift.
