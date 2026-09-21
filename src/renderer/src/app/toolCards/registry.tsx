// Every tool card the app can show, by key: `tool:point`, `add:pulley`, `link:rope`.
//
// The three groups live in their own files (anims/tools.ts, anims/add.ts, anims/links.ts) so that
// three authors can fill them in at once without editing the same file; this one only joins them.
// A button asks for its card with useToolCard('tool:point') (ui/useToolCard.ts) and ToolCardHost
// (ui/ToolCard.tsx) draws whichever one is due.

import { ADD_GROUP } from './anims/add'
import { LINK_GROUP } from './anims/links'
import { TOOL_GROUP } from './anims/tools'
import type { ToolCardDef, ToolCardKey } from './types'

export type { ToolCardDef, ToolCardKey } from './types'

export const TOOL_CARDS: Record<ToolCardKey, ToolCardDef> = { ...TOOL_GROUP, ...ADD_GROUP, ...LINK_GROUP }

/** The card for a key, or nothing when a caller asks for one that has no card (never, if the tests hold). */
export const toolCard = (key: string): ToolCardDef | undefined => (TOOL_CARDS as Record<string, ToolCardDef | undefined>)[key]
