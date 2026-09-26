# Authoring a tool card animation

A tool card is what a student sees when the mouse rests on a tool button for half a second: the
tool's name, its key, a small looping picture of the tool at work, and one sentence. This folder
holds the pictures. `Point.tsx` (one click) and `Rope.tsx` (two clicks) are the pattern; copy the
one that fits and change the numbers.

## Where a card lives

The registry (`../registry.tsx`) joins three files in this folder, and each author works in one:

| File | Keys | The buttons it describes |
|---|---|---|
| `tools.ts` | `tool:point` … | the drawing tools on the tool shelf (`render/tools.ts` `TOOLS`) |
| `add.ts` | `add:sphere` … | the Sandbox ADD buttons (`panels/Sandbox.tsx` `ADD`) |
| `links.ts` | `link:rope` … | the ways two Sandbox objects can be joined (`sim/links.ts` `LINK_KINDS`) |

Every key already has a card. A key that is new, or a card being redrawn, starts from `Placeholder`
(a pulsing dot): add `Name.tsx` beside this file, import it in the group file and put it in place
of `Placeholder`. Do not add keys, do not touch the other two group files, and never leave a key
out: the registry is typed against the button lists, and `tests/toolCards.test.ts` fails on a
missing or a stray card.
(The `add:` keys are typed from `ShapeKind` in `sim/types.ts` less the ground, while the test reads
the Sandbox panel's `ADD` list; the two agree today, and if a shape is ever added to one and not the
other, the Sandbox list is the one the cards follow — a card is for a button.)

## How the card behaves (nothing to author, but worth knowing)

The card opens half a second after the pointer rests on the button and goes on leave, press, Esc,
a resize or any scroll. It takes no clicks and no focus. It draws above the command bar's example
list (which is up whenever the bar is focused), but it never opens while a menu or a right-click
menu is on screen, so a card never covers one. The hovered button carries `aria-describedby`
pointing at the card while it shows, so a screen reader gets the sentence.

## The card entry

```ts
'tool:point': { title: 'Point', shortcut: 'P', sentence: 'Click anywhere to place a point.', Animation: Point }
```

- `title` is the button's own label; for a tool it must equal `TOOLS[].label` and `shortcut` must
  equal `TOOLS[].key` (omit it when the key is empty). The test checks both.
- `sentence` is one plain sentence of at most 120 characters, ending with a full stop — one, not
  two: a full stop before the end fails the test, so join with a comma or a semicolon ("Click an
  object to remove it; Undo brings it back."). Plain words, no maths notation, no `\`, no `_{`,
  no code. Say what the tool does, not what the app checks: "put the wheel above both ends", not
  "the wheel must sit above both ends", unless the app really refuses otherwise.
- `Animation` is a component that takes no props and returns a `<Scene>`.

## The picture

Every animation is a 160×100 SVG (`viewBox="0 0 160 100"`, wider than tall, like the card). Draw
with the three parts in `parts.tsx` and your own shapes:

```tsx
import { Click, Cursor, Scene } from './parts'
import type { Pt } from '../animMath'

const AT: Pt = [84, 54]

export function Point() {
  return (
    <Scene>
      <Click at={AT} />                                    {/* the ripple where the click lands */}
      <g className="tc-appear">                            {/* what the click makes */}
        <circle cx={AT[0]} cy={AT[1]} r="4" fill="var(--good)" />
      </g>
      <Cursor clicks={[AT]} />                             {/* last, so it draws on top */}
    </Scene>
  )
}
```

- `<Scene>` is the SVG with a faint dot grid; `grid={false}` turns the grid off.
- `<Cursor clicks={[b]} />` glides from the top-left corner to `b` and clicks. `clicks={[b, c]}`
  clicks `b`, then `c`. `home={[x, y]}` changes where it starts.
- `<Click at={b} />` is the ripple at the first click; `<Click at={c} second />` the one at the
  second.
- Give whatever the click makes the class `tc-appear`. For something that appears after the
  second click use `tc-appear tc-late`. Anything without a class is scenery and is there from the
  start (the beam and the ball in `Rope.tsx`).
- Give whatever the first click takes away the class `tc-vanish`: the object in `Delete.tsx`, the
  point in `Move.tsx` before it is dragged. Scenery that should go but stays reads as selected, or
  as copied, on the still frame.

## The loop and the four keyframes

Every card runs the same 2.5 s loop; the keyframes live in the "Tool cards" section of
`styles.css` and you never write your own:

| Time | `tc-cursor` | `tc-ripple` | `tc-appear` | `tc-vanish` |
|---|---|---|---|---|
| 0 – 8 % | fades in at home | | | fades in |
| 8 – 30 % | glides to the first click | | | |
| 30 % | | first ripple | | |
| 30 – 36 % | | | first result fades in | fades out |
| 40 – 62 % | glides to the second click (if any) | | | |
| 62 % | | second ripple (`tc-late`) | | |
| 62 – 66 % | | | `tc-late` result fades in | |
| 90 – 100 % | fades out | | fades out | |

The cursor's stops travel as custom properties (`--tc-a` home, `--tc-b` first click, `--tc-c`
second) that `<Cursor>` sets from `cursorStops()` in `../animMath.ts`; the keyframes read them, so
a card needs no CSS of its own. Under the OS setting "reduce motion" every card is frozen at 84 %:
the result showing, the cursor at rest. Make sure that frame tells the story on its own.

## Colours

Only these three, and only as `var(...)` in `fill` and `stroke`:

| Token | Use it for |
|---|---|
| `var(--accent)` | the cursor and its ripple (set for you) |
| `var(--text-dim)` | scenery the student already had: a beam, a ball, a line |
| `var(--good)` | what the click made: the new point, the new rope |

Vary `opacity` for a lighter shade. No hex, no `rgb()`, no other token: the card must read in Dark,
Light and Moonlight, and the test scans every `.tsx` here for exactly these values. Text is best
avoided (labels would need a font size, and they never read at this size anyway); if a letter is
truly needed, draw it as a path.

## What the test checks (`tests/toolCards.test.ts`)

- Every `TOOLS` id, every Sandbox `ADD` shape and every `LINK_KINDS` entry has a card, and there is
  no card for anything else; a tool card's title and shortcut match `TOOLS`.
- Every sentence is one sentence of at most 120 characters, ends with a full stop, and has no `\`,
  `_{`, `^{`, braces, angle brackets or `=>`.
- Every `.tsx` in this folder uses only `none` and the three tokens above wherever a colour is
  written — `fill`/`stroke` attributes, `style={{ stroke: … }}`, `stopColor`, `color` — and no
  hex, `rgb()`, `currentColor` or other `var(--…)` anywhere.
- `Point.tsx` and `Rope.tsx` each have a `<Scene>`, a `<Cursor>`, a `<Click>` and a `tc-appear`;
  `Rope.tsx` clicks twice. Add your own file to that list if you want the same guard on it.
- `styles.css` declares the four keyframes once, on a 2.5 s loop, and freezes them under
  `prefers-reduced-motion: reduce`; `Delete.tsx` and `Move.tsx` carry `tc-vanish`.

Run `npm test`, `npm run typecheck` and `npm run lint` before committing, then hover the button in
the app (`npm run web`) in all three themes.
