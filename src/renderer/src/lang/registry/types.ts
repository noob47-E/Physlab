// Command Registry Types for PhysLab AI Full Control
import type { ModeId } from '../../app/modes'
import type { ObjId } from '../../core/types'

export interface CommandArgDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'point' | 'vector' | 'any'
  required?: boolean
  description?: string
  default?: unknown
}

export interface RegistryResult {
  ok: boolean
  created: ObjId[]
  removed: ObjId[]
  changed: ObjId[]
  message: string
}

export interface CommandEntry {
  name: string
  aliases?: string[]
  modes: ModeId[] | 'all'
  args: CommandArgDef[]
  summary: string
  examples: string[]
  run: (args: Record<string, any>, raw?: string) => Promise<RegistryResult> | RegistryResult
  /** Custom parser if the command accepts flexible command bar syntax */
  parse?: (raw: string) => Record<string, any> | null
}
