import { describe, it, expect } from 'vitest'
import {
  stripPlanningNotesAndDuplicates,
  renderMarkdownWithMath
} from '../src/renderer/src/panels/ai/MarkdownView'

describe('Fix A: AI Planning Notes & Duplicate Paragraphs Guard', () => {
  // Exact fixture from c-projectile.png
  const C_PROJECTILE_FIXTURE = `Tool returned range 40.77471967 verified. Need answer with format: idea, why works, method, boxed final result, exam tip, self-check. Use only tool number. Student asked one question. Must answer in English.

Idea: For a projectile launched and landing at the same height, the horizontal range comes from combining constant horizontal velocity with the time of flight.

Why it works: Gravity acts only vertically, so the horizontal speed stays constant while the vertical motion determines how long the ball stays in the air. Using projectile motion,

$$R = \\frac{v^2 \\sin(2\\theta)}{g}$$

Method:
Given:
• $v = 20\\text{ m/s}$
• $\\theta = 45^\\circ$
• $g = 9.81\\text{ m/s}^2$

Substitute:
$$R = \\frac{20^2 \\sin(2 \\times 45^\\circ)}{9.81}$$

Since $\\sin(90^\\circ) = 1$,
$$R = \\boxed{40.77}\\text{ m}$$`

  // Exact fixture from g-heavier.png
  const G_HEAVIER_FIXTURE = `No calculation is needed. The question is conceptual and clear. I should explain using cause → effect, mention the law, and avoid unverified numbers beyond standard concepts.

Idea in one sentence:
A heavier ball does feel a bigger gravitational force, but it also has proportionally more inertia, so the two effects cancel and the acceleration stays the same.

Why it works:
By Newton's second law, acceleration comes from

$$a = \\frac{F}{m}$$

and the gravitational force on a body is $F = mg$.`

  it('strips planning notes from c-projectile.png fixture and preserves the rest', () => {
    const cleaned = stripPlanningNotesAndDuplicates(C_PROJECTILE_FIXTURE)

    // The leaked planning self-talk must be stripped
    expect(cleaned).not.toContain('Tool returned range')
    expect(cleaned).not.toContain('Need answer with format')
    expect(cleaned).not.toContain('Use only tool number')
    expect(cleaned).not.toContain('Student asked one question')
    expect(cleaned).not.toContain('Must answer in English')

    // The rest of the legitimate answer must be fully kept
    expect(cleaned).toContain('Idea: For a projectile launched and landing at the same height')
    expect(cleaned).toContain('Why it works: Gravity acts only vertically')
    expect(cleaned).toContain('$$R = \\frac{v^2 \\sin(2\\theta)}{g}$$')
    expect(cleaned).toContain('Method:')
    expect(cleaned).toContain('$$R = \\boxed{40.77}\\text{ m}$$')
  })

  it('strips planning notes from g-heavier.png fixture and preserves the rest', () => {
    const cleaned = stripPlanningNotesAndDuplicates(G_HEAVIER_FIXTURE)

    // The leaked planning self-talk must be stripped
    expect(cleaned).not.toContain('No calculation is needed')
    expect(cleaned).not.toContain('The question is conceptual and clear')
    expect(cleaned).not.toContain('I should explain using cause')

    // The rest of the legitimate answer must be fully kept
    expect(cleaned).toContain('Idea in one sentence:')
    expect(cleaned).toContain('A heavier ball does feel a bigger gravitational force')
    expect(cleaned).toContain('Why it works:')
    expect(cleaned).toContain('$$a = \\frac{F}{m}$$')
    expect(cleaned).toContain('$F = mg$')
  })

  it('keeps normal answer starting with "Idea: …" untouched', () => {
    const normal = `Idea: For a projectile launched and landing at the same height, the horizontal range comes from combining constant horizontal velocity with the time of flight.

Why it works: Gravity acts only vertically.`

    const cleaned = stripPlanningNotesAndDuplicates(normal)
    expect(cleaned).toBe(normal)
  })

  it('keeps answer legitimately saying "the student should…" once untouched', () => {
    const normal = `In this experiment, the student should observe how increasing the mass affects acceleration.

Why it works: Newton's second law states $F = ma$, so acceleration depends inversely on mass for a given net force.`

    const cleaned = stripPlanningNotesAndDuplicates(normal)
    expect(cleaned).toBe(normal)
  })

  it('drops exact duplicate paragraphs appearing twice in a row', () => {
    const textWithDup = `The circle has been drawn on screen.

The circle has been drawn on screen.

You can now adjust its radius.`

    const cleaned = stripPlanningNotesAndDuplicates(textWithDup)
    expect(cleaned).toBe(`The circle has been drawn on screen.

You can now adjust its radius.`)
  })

  it('works seamlessly inside renderMarkdownWithMath', () => {
    const nodes = renderMarkdownWithMath(C_PROJECTILE_FIXTURE)
    expect(nodes.length).toBeGreaterThan(0)

    // Text elements rendered must not contain self-talk
    const serialized = JSON.stringify(nodes)
    expect(serialized).not.toContain('Tool returned range')
    expect(serialized).not.toContain('Need answer with format')
    expect(serialized).toContain('Idea: For a projectile launched')
  })
})
