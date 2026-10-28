// Unified Command Registry for PhysLab AI Full Control
import type { ModeId } from '../../app/modes'
import type { CommandEntry, RegistryResult } from './types'

export class CommandRegistry {
  private entries = new Map<string, CommandEntry>()
  private aliasMap = new Map<string, string>()

  register(entry: CommandEntry): void {
    const key = entry.name.toLowerCase()
    this.entries.set(key, entry)
    if (entry.aliases) {
      for (const a of entry.aliases) {
        this.aliasMap.set(a.toLowerCase(), key)
      }
    }
  }

  get(name: string): CommandEntry | undefined {
    const key = name.toLowerCase()
    const target = this.aliasMap.get(key) ?? key
    return this.entries.get(target)
  }

  list(): CommandEntry[] {
    return Array.from(this.entries.values())
  }

  forMode(mode: ModeId): CommandEntry[] {
    return this.list().filter((e) => e.modes === 'all' || e.modes.includes(mode))
  }

  async dispatch(raw: string): Promise<RegistryResult | null> {
    const trimmed = raw.trim()
    if (!trimmed) return null

    // 1. Try commands with custom parse methods
    for (const entry of this.entries.values()) {
      if (entry.parse) {
        const parsed = entry.parse(trimmed)
        if (parsed !== null) {
          try {
            return await entry.run(parsed, trimmed)
          } catch (err) {
            return {
              ok: false,
              created: [],
              removed: [],
              changed: [],
              message: err instanceof Error ? err.message : String(err)
            }
          }
        }
      }
    }

    // 2. Try leading word match: "command [args...]"
    const match = trimmed.match(/^([A-Za-z0-9_-]+)(?:\s+(.*))?$/s)
    if (match) {
      const verb = match[1].toLowerCase()
      const rest = match[2]?.trim() ?? ''
      const entry = this.get(verb)
      if (entry) {
        try {
          const args = entry.parse ? entry.parse(trimmed) ?? { rawArgs: rest } : { rawArgs: rest }
          return await entry.run(args, trimmed)
        } catch (err) {
          return {
            ok: false,
            created: [],
            removed: [],
            changed: [],
            message: err instanceof Error ? err.message : String(err)
          }
        }
      }
    }

    return null
  }
}

export const registry = new CommandRegistry()
