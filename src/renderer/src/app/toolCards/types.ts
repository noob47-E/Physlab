// What a tool card is: a title, one plain sentence, an optional shortcut and a looping animation.
//
// The card is what a student sees when the mouse rests on a tool button for half a second. The
// registry (registry.tsx) holds one per tool, per Sandbox shape and per link kind, keyed by
// `tool:point`, `add:pulley`, `link:rope`. The key types are derived from the lists that drive the
// buttons themselves, so adding a tool to TOOLS, a shape to the Sandbox ADD list or a kind to
// LINK_KINDS is a type error here until it has a card; tests/toolCards.test.ts checks the same
// join at run time.

import type { ComponentType } from 'react'
import type { ToolId } from '../../core/types'
import type { LinkKind, ShapeKind } from '../../sim/types'

/** The Sandbox ADD buttons offer every shape but the ground, which every scene already has. */
export type AddShape = Exclude<ShapeKind, 'ground'>

export type ToolCardKey = `tool:${ToolId}` | `add:${AddShape}` | `link:${LinkKind}`

export interface ToolCardDef {
  /** The name on the button, e.g. "Point" or "Rope". */
  title: string
  /** One plain sentence, at most 120 characters, ending with a full stop. No maths notation. */
  sentence: string
  /** The keyboard shortcut, shown as a key cap after the title. */
  shortcut?: string
  /** A 160×100 looping SVG (see anims/AUTHORING.md); rendered with no props. */
  Animation: ComponentType
}
