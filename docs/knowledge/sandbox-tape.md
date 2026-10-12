# Sandbox tape — the recorder, Branch from here, Fine replay, the tape store (SB12)

What the area does: every engine step of a Sandbox run goes on a tape, so the run can be replayed like a video
(rewind, scrub, step both ways, slow motion), re-run finer (Fine replay at 1/600 s), and branched (go back to a
moment and carry on from there with a change). The tape is session memory: it is never written to a `.phys` file.
The engine underneath is `sandbox-engine.md` (the clock, keyframes, the after-step hook).

## Files
| File | One line |
|---|---|
| `src/renderer/src/sim/tape.ts` | The data (SB5): records in one-second chunks, work, events, keyframes, the cap's chunk drop. Pure. |
| `src/renderer/src/sim/recorder.ts` | `startRecorder`, `tapes`, `branchAt`, `fineReplayAt`, `marksOf`, `replayRefusal`, `touchesAt`, `rerunRecord`. |
| `src/renderer/src/sim/tapeStore.ts` | `useTape` (modes, playhead, speed, marks, bookmarks, loop, note) and `shownTape`. |
| `src/renderer/src/sim/world.ts` | What the recorder needs: `onBeforeStep`, `onAfterStep`, keyframes, `definitions`, the serials. |

## What a tape holds
- One record per engine step: REC_FLOATS (13) float32 numbers for each body of the tape's `layout` (the bodies, then
  each rope's links): position, rotation quaternion, velocity, spin, read with `readRecord` after the step.
- The step's work by PhysLab's own forces (WORK_FLOATS: drag, rolling, push, hand, damper).
- Its events: each collision as the engine's `ContactEvent` object, and all its touches in ONE pack (`TouchPack`,
  TOUCH_FLOATS = 9 numbers a touch: the two bodies' places in `layout.bodies`, the normal, the point, new or carried
  on). `touchesAt(tape, step)` gives them back as `Touch` objects, the engine's float32 numbers unchanged. Twenty
  bodies resting on a floor and on each other touch about thirty times a step; as objects that was some 7000 heap
  objects a second for the collector to walk.
- Record 0 of a run is its untouched start, read in the world's before-step hook just before the first step (no work,
  no events). Reset rebuilds the world inside a React effect the recorder cannot see, and the after-step hook comes
  one step too late, which is why `onBeforeStep` exists.

## When a tape starts again
Just before each step (`onBeforeStep`), the live tape must still match the world: the same `rebuildSerial`, the
same step rate, and its last step the world's `stepIndex`. Anything else starts a new tape from the world as it is
then, with the old tape's keyframes freed and its memory emptied:
- Reset and a new scene (and, at once, `clearTapes` from the tape store on `useSandbox.runNonce`);
- a rebuild part-way: a body added or removed, a link made, sleeping or 2D switched, a spring a new rate moves
  between PhysLab's force and the engine's (a new tape from the step it happened at, with the new layout);
- a new step rate (taken up on the clock's grid: at once from 240 to 600 on a whole 1/240 s, otherwise after the
  steps the old rate needs to reach the new grid, as `sandbox-engine.md` says);
- a world put back or stepped behind the recorder's back (a restore it did not make).
A rename, a recolour or a new bounce is an edit in place: a keyframe, not a new tape.

## Keyframes
- One at the tape's first step, one every second of the tape (every `rate` steps from its start: the start of each
  one-second chunk, so the cap's drop always leaves a keyframe at the new first step), and one after the FIRST step
  that follows any change of `inputSerial` (a grab, a drag move, an edit, a push, a placed body). The change happened
  before that step, so from that keyframe on a re-run meets no change; nothing records the inputs themselves.
- The steps of the keyframes taken after a change are kept (Fine replay stops before the next one).
- Each keyframe is an engine object (about 5.5 KB for 20 bodies, 0.07 ms to save): a long drag takes one every frame.
  They are not counted against the cap; the cap's drop, a branch's truncation and a new tape free them.

## The cap
64 MiB (owner decision D6). The size judged is the tape's own count (`Tape.bytes`: records and work exactly, 64
bytes a event) plus the touch packs' numbers. Checked once a second, when a new chunk has just begun; whole seconds
are dropped from the front until it fits, never the chunk being written. The note: "The recording keeps the last
4 min 29 s; older parts were dropped." (`durationWords`, numbers through the app's writer). `bytesPerSecond(20, 240)`
is 249 600 bytes of records alone: 4.5 minutes in 64 MiB for bodies in flight. Measured (21 bodies piled on a floor,
240 a second): about 593 000 bytes a second with their touches, so nearer two minutes.

## Marks
`marksOf(tape)`: the steps of collisions closing faster than 0.05 m/s with a moving body, one per step. The live tape's
are kept as it records (the tape store shows them); Bouncing ball at 240 marks 0.783, 2.033, 3.033 and 3.833 s.

## Branch from here (`branchAt`)
1. The world is put back to the step: the keyframe at or before it is restored and the world stepped on to it, with
   the recorder standing aside (`rerunning()` is true meanwhile: a listener of the after-step hook that must not count
   those steps asks it). The world's record there is compared with the tape's; if they differ the note says "a fresh
   run from this moment (not bit-identical to the recording)". In all six of SB9's scenes they are equal.
2. The old run from that step on is copied (no keyframes) into `tapes.parent` (`{ tape, step }`) for the ghost; before
   that step the parent is the live tape itself. There is one parent at a time (a second branch replaces it), and it is
   not counted against the cap: at most a second tape's worth of memory.
3. The live tape loses everything after the step, with its keyframes; the next steps record on from there.
4. The Sandbox store follows the world: a restored keyframe puts back the bodies' definitions (bounce, friction,
   damping), the pushes and the settings as they were then (`definitions`, `getWorldSettings`), so the store takes
   those, its readings and collision list are cut at that moment, and its live values and clock are the world's. The
   view's next sync then changes nothing (the same definition objects).
5. Mode 'live', the note "Branched at t = 0.783 s. The old run is shown as a ghost." Edits are allowed again.
Branching at the end of the run changes nothing ("Carrying on from the end of the run …").

## Fine replay (`fineReplayAt`)
- The live state is saved as a keyframe; the keyframe before the window is restored; the world is set to 600 steps a
  second and run; each 1/600 s state in the window goes on `tapes.fine`; then the live state is restored, rate and all,
  so the run goes on exactly as if nothing had been re-run (tested bit for bit), and no keyframe is taken for the
  re-run's own change of rate.
- The window is one second from the chosen moment, moved back to fit before the end of the run (the chosen moment
  stays in it), never reaching back past the last change before it; a change after it cuts it short with "Fine replay
  stops here: something was changed at t = 1 s."
- 240 steps a second puts a change's keyframe on an odd tick of the clock (5 ticks of 1/1200 s a step) that 600 cannot
  stand on; the world takes one more 1/240 s step, as the run did, to reach 600's grid, so that fine tape starts 1/240 s
  after the chosen moment, and the note says so ("It starts at t = 0.425 s, the first 1/600 s step after the change made
  at t = 0.421 s."). Branch from there acts on the moment shown.
- Refused: at 600 already; with a spring the engine works at the run's rate (at 600 it may become PhysLab's own, and
  that rebuild would free every keyframe, the end of the run with them); with nothing to re-run.
- The note: "A re-run at 1/600 s. Its difference from the 1/240 s run is the step error." Bouncing ball: the first
  contact within 1/600 s of 0.7821 s (the engine finds it in the step before the touch, stamped 0.7817 s; at 240 it is in
  the step that holds the touch, 0.7833 s). Each mark is the step the ball's velocity turned in, by the tape's own records.

## The tape store (`useTape`, I-5)
- 'live': the engine runs, or is paused at the tape's end; the playhead is the end and follows it.
- Stepping back (`stepBy` with a negative count), `scrubTo`, `toStart` and `reverse` enter 'replay' and pause the
  engine (`useScene.setPlaying(false)`). In replay `play` plays the TAPE (the view's frame loop moves the playhead with
  `scrubTo`); playing into an end stops there; at an end, play starts from the far end again. `backToLive` returns to
  the end. `stepBy` moves whole steps from a fractional playhead. In 'live', `play` and `pause` drive the engine and
  `playing` (the tape's) stays false; stepping forward in live is the engine's business, not the store's.
- 'fine': the fine tape is shown (`shownTape`), with its own marks; Branch from here and a bookmark go to the live
  step at the same time (`stepAtOrBefore`, in the clock's ticks).
- Bookmarks are live-tape steps with a label ("t = 0.417 s" unless named); the loop is `{ a, b }` on the shown tape.
  A branch drops the ones past it; the cap drops the ones before the new start.
- `revision` rises whenever the shown tape changes. The store hears the recorder through `onTapeChange` (the recorder
  never imports the store); `replayRefusal` reads the store's mode through `bindReplayView`.
- Reset and a new scene (`runNonce`) clear the tapes and the store; the replay speed stays the student's.

## Traps
- **Start the recorder once, with the engine, not with each mount of the view.** Its stop frees the tape. `startRecorder`
  for the same world again keeps the tape and listens afresh (`SimWorld.create` drops every listener).
- **Compare a tape's times in ticks.** Tape.timeOf is start + steps/rate; for a tape that starts part-way (0.5 + 169/600)
  it can differ from the engine's clock (938/1200) in the last digit of a double. stepAtOrBefore floors in the clock's
  ticks, taking a time within a part in 10⁹ of a tick as that tick: rounding put a moment half a tick before a step onto
  that step.
- **A dropped tape is emptied** (its keyframes freed, its chunks let go): hold `tapes.live`, not an old tape object.
- **Re-runs fire the after-step hook.** A branch, Fine replay and `rerunRecord` step the world; anything else listening
  to `onAfterStep` sees those steps unless it checks `rerunning()`.
- **The step's own error shows in a bounce's height.** At 240 a second the engine turns a ball round up to one step of
  its fall above the floor (it meets the floor part-way through a step), so tops sit about a centimetre high: Bouncing
  ball branched at 2 s with e = 0.5 tops at 0.493 m (0.48 by e²), the old run at 1.238 m (1.229); at 600, 0.488 and
  1.235. That is the step, the same on both runs, not the branch.
- **Reset forgets who touched whom** (`clear` empties `touching`): kept, the first step after Reset gave a spinning ball
  in mid-air one step of rolling torque from the floor it had rolled on.
- `rerunRecord`, Fine replay and a refused restore keep a change made at the end of the run waiting for its keyframe;
  only a branch (which leaves that end) forgets it.

## Measured (Node, 21 bodies, 240 a second)
A step 0.29 ms with or without the recorder; a re-run of 239 steps 56 ms; Fine replay of a second 150 ms; about 593 000
bytes a second of tape with the bodies' touches.

## Tests
`tests/recorder.test.ts` (the world's part: Reset and `touching`, the before-step hook, `definitions`; live = tape for
5 s; keyframes; seek = tape at 20 seeded steps in SB9's six scenes; Branch at the first mark and at 2.0 s with e = 0.5;
the store synced; Fine replay of [0.5 s, 1.5 s], its stop at a change, the odd tick, refusals; the cap; new tapes;
marks; costs), `tests/tapeStore.test.ts` (modes, replay, play, reverse, Back to live, bookmarks, loop, Branch and Fine
replay through the store, the cap's note, a new tape, Reset).
