// P-TOUR TB1 (crew-built, reviewed): the six missions' shape and words. What makes each mission
// tick — through the real routes, and never for something the student did not do — is in
// tests/tour.test.ts.

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MISSIONS } from '../src/renderer/src/app/tour/steps'

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('Option B missions: shape and wording', () => {
  it('every mission anchor is a data-tour name in the source (a literal or the tool shelf\'s tool-<id>)', () => {
    const contents = filesUnder(join(__dirname, '../src/renderer/src'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    for (const m of MISSIONS) {
      if (/^tool-/.test(m.anchor)) expect(contents).toContain('data-tour={`tool-${id}`}')
      else expect(contents).toContain(`data-tour="${m.anchor}"`)
    }
  })

  it('every hint is plain English with no LaTeX and no code', () => {
    for (const m of MISSIONS) {
      expect(m.hint).toBe(m.hint.trim())
      expect(m.hint).toMatch(/\.$/)
      expect(m.hint).not.toMatch(/\\|\$|\{|}|=>|className=/)
    }
  })
})
