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

## Drawing from the tape (SB16)

What it does: while a recording is shown ('replay' or 'fine') the Sandbox draws the TAPE, never the engine. Bodies,
ropes, springs, arrows, labels and trails show the moment the playhead is on — replayed, reversed, slowed or
fine-replayed — and the panels (the Selected box, the ledger, the cards) show it too. The engine is neither stepped nor
read meanwhile, so Back to live carries on from the end bit for bit as if nothing had been replayed.

Files: `render/sandbox/playback.ts` (pure but for `replayFrame`, which reads the tape store), `render/SandboxView.tsx`
(the frame loop, the readout switch, the panels, the recorder's start, no drag in replay), `render/sandbox/Trails.tsx`,
`sim/stepping.ts` (`stepOneFrame` in replay). Test: `tests/playback.test.ts` (real engine and recorder in Node).

- **The recorder starts once, where the engine is made** (`startRecorder(w)` right after `engine.world = w` in
  SandboxView's first mount). A remount picks the running world up and does not start it again; nothing ever stops it
  (its stop frees the tape). A source test holds this.
- **The readout (I-6).** Live, `readoutRef.current` is the world (`liveOf`, one object for the one engine). Replay and
  fine: `replayFrame(realDt, bodies)` moves the playhead while `useTape.playing` (`advancePlayhead`: realDt × speed ×
  rate steps, either way; an end stops it; a loop A–B goes round, a playhead outside the loop starts at A, or at B
  playing backwards) and returns `tapeReadout(shownTape(), playhead)`:
  - `state(id)` is the record at ⌊playhead⌋, exactly the engine's numbers at that step (velocities and spins included;
    the mass is the definition's, as the engine's is; `asleep` is false — the tape does not record sleep);
  - `drawn(id)` and `transforms` are `blendRecord` between ⌊playhead⌋ and ⌈playhead⌉ (positions and speeds in a straight
    line, the turn the short way round and unit length);
  - `linkPath`: a rope through its links' blended records (the layout's rope order), a pulley rope over `pulleyRim` of
    the wheel at its recorded place, anything else end to end;
  - `time` is `timeOf(playhead)`, fractional.
- **Playing backwards** (J), the readout's velocities and spins are reversed while it plays: what is seen moves the
  other way, so a fall played backwards rises at the same speeds (Idea #39 F18). Paused, a moment is shown as recorded.
- **Smooth slow motion.** Every frame's playhead is its own picture: `framePlan(0.1, 60, 240)` and
  `framePlan(0.01, 60, 240)` are 60 pictures a second, as ×1 is (four records a frame, none shown twice); shown whole,
  ×0.1 would land on a new record in only 24 frames of 60. While the recording plays the frame loop keeps asking for
  frames; a scrub, a step, Play, Pause or Back to live asks for one through a `useTape` subscription (live steps and a
  recording that plays on ask for their own).
- **The view's frame** is `replayViewFrame(view, dt, bodies, now)` (SandboxView keeps one `newReplayView()`): a frame
  that starts the recording playing, or follows a scrub, a step or a turn round, moves it no time, so that moment is
  shown first (a demand-drawn canvas's first `dt` is the time since it last drew: Play would jump); the frame after a
  pause settles a playhead left between two steps on the nearer one, so a paused picture is a recorded moment and the
  picture, the numbers and both clocks agree (a moment the store put there itself, Fine replay's chosen one, stays).
- **The panels follow the playhead.** `live` and `engineTime` are the record at ⌊playhead⌋ and THAT record's time (the
  numbers and the clock of one moment). `panelsDue`: never the same moment twice; at most ten times a second while it
  plays on by itself; at once when paused, scrubbed, stepped, turned round, wrapped round a loop or on another tape.
  Back to live publishes the world once, where the run waits.
- **Step** (`stepOneFrame`) in replay and fine pauses the recording and moves the playhead one whole step on (stopping
  at the last); in live it steps the engine as before.
- **No drag in replay (D5).** A press on an object still chooses it, holds the view still, and once the pointer moves
  more than 4 px says the replay sentence (`refuseEdit()`: the strip's note, four seconds); the cursor over an object is
  `not-allowed`; a Connect pick is refused the same way, and no Connect line follows the cursor. A drag in progress when a
  recording comes on screen (a step back by key while the button is held) lets go with no throw and writes nothing, on
  the next move or on the release.
- **Trails** are the shown tape's positions from `trailStart` (its first step, or the first step at or after the moment
  "Clear trails" was pressed, kept as a time so it holds on the fine tape too) up to the playhead: a point every
  `trailStride` steps (the smallest power of two keeping at most 600 segments, one of them the piece to the drawn body),
  so the line does not shimmer as it grows. `fillTrail` reads only the points the trail grows past and fills the buffer
  again only when the tape, the start, the stride or `tapes.parent` (a branch) changes; rewinding draws fewer. Reset and
  a new scene clear it with the tape; a mid-run rebuild (a body added, a link made) starts a new tape and so a new trail.

Traps:
- **Never step or read the world while a recording is shown**, not even `step(0)`: that is what makes Back to live
  bit-identical (tested from a keyframe).
- **The playhead's frame time is the frame's own, clamped to 0.1 s**, and 0 on the frame the recording starts playing
  or was scrubbed, stepped or turned round.
- **A replayed mass is the definition's.** That is right because a change of mass (or size, shape, material, motion)
  rebuilds the body and so starts a new tape: no tape holds two masses for one body (tested).
- **`replayFrame` writes the playhead straight into the store**, not through `scrubTo`: `scrubTo`'s "an end stops" would
  also stop a loop whose B is the last step.
- **`Tape.record(step)` takes a whole step** (a fraction makes a typed-array view on an odd byte offset); blend between
  two records instead.

## The strip (SB17)

The strip is the video editor's bar under the Sandbox drawing: transport buttons, speeds, a scrub bar over the recording, Fine replay,
Branch from here and Back to live. Files: `render/sandbox/TapeStrip.tsx` (the strip, and `stripModel`, the pure part that says where
everything sits), `render/sandbox/tapeStripMath.ts` (steps to pixels, ticks, hit tests, the time sentence), `sim/transportActions.ts`
(what every button and key does). Tests: `tests/tapeStrip.test.ts`, `tests/transportActions.test.ts` (with the real recorder and engine at its end), `tests/replayLock.test.ts` (D5), the Sandbox rows at the end of
`tests/shortcutKeys.test.ts`.

**When it shows.** From the first step of a run (the shown tape has two records), and then always, in live, replay and fine. Before
that it renders nothing (the HUD layer ignores the pointer, so nothing is in the way). The Timeline dock panel shows the same strip in
its own page flow (`<TapeStrip inline />`): if that panel is open there are two strips, and both go through the same actions.

**One place for "what does Play do".** Three modes (the tape store, I-5): LIVE (the engine runs, or waits at the end of the
recording), REPLAY (the recording is shown, the engine waits) and FINE (a 1/600 s re-run of one second). The panel's Transport row,
the strip and the keys all call `sim/transportActions.ts`:

| Action | Live | Replay and fine |
|---|---|---|
| `togglePlay` / `play` / `pause` | the engine (`useScene.playing`) | the recording (`useTape.playing`); `play` after J turns the direction round first; at the end the store starts again from the start |
| `stepBack` | enters replay one step before the end (the store pauses the engine) | one step back; nothing at the first step |
| `stepForward` | one engine step (`stepOneFrame`), recorded as a played step is | one step on; stops at the last step (Back to live is the way on) |
| `playBackwards` | enters replay, reversed, playing | plays reversed from here; nothing at the first step |
| `toStart` / `toEnd` | start enters replay at the first step; end is greyed (live is at the end) | start / end of the shown tape |
| `scrubTo(step)` | enters replay at that step | the playhead goes there, kept on the recording |
| `branchFromHere` | refused with a reason (go to a moment first) | branches the run at the playhead; from a fine moment it branches the live run at that time |
| `fineReplay` | refused with a reason | re-runs the second around the playhead at 1/600 s; refused in fine and on a recording that already steps at 1/600 s |

Every refusal is a sentence in the button's title (`transportFlags` in `transportActions.ts` is the pure rule, tested).

**Speeds.** ×1 · ½ · ¼ · 1/10 · 1/100. In live they are the Sandbox's slow motion (`world.timeScale`, the same as World > Slow motion);
in replay and fine they are the recording's own `speed`. Entering replay from live copies a slow motion that is one of the five onto the
recording's speed (so J at ×0.1 runs backwards at ×0.1); Back to live leaves the slow motion as it was. A slow motion that is not one
of the five (the preset's 0.3, say) marks no button and is left alone.

**The bar.** Its axis is the recording's first to last step, at least five seconds long (`MIN_SPAN_SECONDS`), so the first seconds of a
run do not rescale at every step; the fast re-run is shown whole. Drawn: ticks on a 1-2-5 series (60 px apart at least), the recorded
part (`--tape-fill` over `--tape-track`), keyframe diamonds (`--tape-key`), bounce marks (`--tape-mark`), bookmarks (flags in
`--tape-key`), the branch point (`--tape-branch`, from `tapes.parent.step`), the loop A to B and the playhead (`--tape-head`).
Bookmarks, the loop and the branch point belong to the live recording, so the fast re-run (another axis) does not draw them.
A click lands on a mark or bookmark within 8 px of it (snapping), else on the nearest step; a drag never snaps; nothing goes past
the last recorded step. The bar is a `role="slider"` you can Tab to: arrows step, Shift and arrows jump a second, Page Up and Page
Down go to the previous and next mark or bookmark, Home and End to the ends (the bar stops those keys reaching the window shortcuts).

**Keys** (`sandboxTransportKey` in `app/shortcuts.ts`; Sandbox only, never while a text box has the focus, no Ctrl or Alt):
J play backwards, K pause, L play, comma step back, full stop step on, B branch from here, M bookmark, [ and ] the loop's start and
end, Space plays and pauses (on the key-up, so a held Space can pan; `shortcutKeyUp`). Holding comma or full stop repeats; the others
do not. Space on a focused button is that button's click.

**The panel's Transport row** keeps its shape in replay: the clock shows the playhead's time and "· replay" (or "· fine replay"), and
Undo and Redo are greyed with the replay sentence (`replayRefusal()`).

**Replay is read-only (the owner's D5).** While a recording is shown (replay or fine) nothing in the Sandbox can be edited until
Branch from here or Back to live. Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and Edit > Undo/Redo in the Sandbox are refused in `app/undoRoute.ts`
(`refuseEdit()` in `sim/transportActions.ts`): the key is taken, nothing is undone, and the recorder's sentence (`replayRefusal()`)
shows in the strip's note line for four seconds (`useEditRefusal`). The Sandbox panel's edit controls sit in a `ReplayLock`
(`panels/sandbox/ReplayLock.tsx`), a disabled `<fieldset>`: Add and Connect, Pushes, the selected object's rows and Put back, World
(gravity, air, wind, slow motion), every fold's contents (the fold's arrow stays live), and the list's Delete. A `ReplayBanner` under the
Transport row shows the sentence, two lines tall so nothing moves as the time runs. Not locked, on purpose: choosing an object, the
Side/3D view, fold arrows, Send to Lab Data and the experiment list (loading an experiment starts a new run, as Reset does). A new
edit control in the panel goes inside a `ReplayLock` (or reads `useReplayLocked()`); `tests/replayLock.test.ts` is the rule.

**Traps.**
- Nothing may change width as the numbers grow (Fix 22): the time sits in a grid cell with an invisible copy of the widest text
  (`WIDEST_TIME_TEXT`), the note is one line that is always there (`min-h-[18px]`, truncated), and a speed or transport button keeps
  its label.
- A new key goes into `shortcutKeyDown` and gets a row in `tests/shortcutKeys.test.ts`; never a second window listener. The slider's
  `onKeyDown` is on its own element.
- A loop is never a single step: `[` at the last step and `]` at the first do nothing (`nextLoop`). A loop with one end missing takes
  the recording's own end.
- The strip's numbers go through `fmtLabel` (`timeText`), never `toFixed`; colours are the tape tokens, never hex.
