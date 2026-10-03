// Which tool a letter key picks. A pure function so the rule can be tested without a keyboard.

import type { ToolId } from '../core/types'
import { TOOLS } from '../render/tools'

/**
 * The tool a letter key picks, or null. Only a tool on the open mode's shelf counts: the GPU Lab
 * and Lab Data show Move alone, and a hidden Point tool there placed points that then turned up in
 * every drawing. `shelf` is the mode's `tools` list, the one the top bar draws.
 */
export function toolForKey(key: string, shelf: readonly (ToolId | '|')[]): ToolId | null {
  const t = TOOLS.find((x) => x.key && x.key.toLowerCase() === key.toLowerCase())
  return t && shelf.includes(t.id) ? t.id : null
}
