import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdownWithMath } from '../src/renderer/src/panels/ai/MarkdownView'

describe('Fix 1: AI Maths Markdown Delimiters (\\( ... \\) and \\[ ... \\])', () => {
  // Fixture: exact student-facing AI reply from 09/sandbox/screenshots/14-ai-wow-projectile.png
  const FIXTURE_14_AI_WOW_PROJECTILE = `Idea: For a projectile launched and landing at the same height, the horizontal range comes from combining the horizontal speed with the total time of flight.

Why it works:
Gravity acts downward, so the horizontal motion stays uniform while the vertical motion determines how long the projectile stays in the air. Using the projectile range law,

$$R = \\frac{v^2 \\sin(2\\theta)}{g}$$

and PhysLab checked the value for \\(v=20\\,\\text{m/s}\\), \\(\\theta=45^\\circ\\), \\(g=9.81\\,\\text{m/s}^2\\).

Method:

$$R = \\frac{20^2 \\sin(90^\\circ)}{9.81}$$

Since \\(\\sin 90^\\circ = 1\\),

$$R = \\frac{400}{9.81}$$

So PhysLab gives

$$R = \\boxed{40.77}\\text{ m}$$`

  it('renders exact fixture from 14-ai-wow-projectile.png with KaTeX and no raw \\( or \\)', () => {
    const nodes = renderMarkdownWithMath(FIXTURE_14_AI_WOW_PROJECTILE)
    expect(nodes.length).toBeGreaterThan(0)

    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))
    expect(html).toContain('class="katex"')

    // All inline \( ... \) must be converted to KaTeX math, leaving no raw \( or \) in prose
    expect(html).not.toContain('\\(v=20')
    expect(html).not.toContain('\\(\\theta=45')
    expect(html).not.toContain('\\(g=9.81')
    expect(html).not.toContain('\\(\\sin 90')
  })

  it('renders inline math with \\( ... \\)', () => {
    const text = 'Here is velocity \\(v = 20\\text{ m/s}\\) and angle \\(\\theta = 45^\\circ\\).'
    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('class="katex"')
    expect(html).not.toContain('\\(v')
    expect(html).not.toContain('\\(\\theta')
  })

  it('renders single-line display math with \\[ ... \\]', () => {
    const text = '\\[ R = \\frac{v^2 \\sin(2\\theta)}{g} \\]'
    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('class="katex"')
    expect(html).not.toContain('\\[')
    expect(html).not.toContain('\\]')
  })

  it('renders multi-line display math with \\[ ... \\]', () => {
    const text = `The formula is:
\\[
R = \\frac{v^2 \\sin(2\\theta)}{g}
\\]
which completes the derivation.`

    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('class="katex"')
    expect(html).not.toContain('\\[')
    expect(html).not.toContain('\\]')
    expect(html).toContain('The formula is:')
    expect(html).toContain('which completes the derivation.')
  })

  it('renders mixed $...$ and \\(...\\) seamlessly', () => {
    const text = 'Given $v = 20\\text{ m/s}$ and \\(\\theta = 45^\\circ\\), the range is $R = 40.77\\text{ m}$.'
    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('class="katex"')
    expect(html).not.toContain('\\(')
    expect(html).not.toContain('\\)')
    expect(html).not.toContain('$v')
    expect(html).not.toContain('$R')
  })

  it('handles streaming half-delimiter without flashing raw code or breaking KaTeX', () => {
    // Streaming chunk that ends midway through an inline delimiter: no closing \)
    const streamingText = 'The speed is \\(v = 20\\text{ m/s}'
    const nodes = renderMarkdownWithMath(streamingText)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    // Should render as safe plain text, not breaking or throwing
    expect(html).toContain('The speed is \\(v = 20\\text{ m/s}')
  })

  it('leaves code blocks (```) completely untouched', () => {
    const codeBlockText = `Here is Python code:

\`\`\`python
# This should NOT be KaTeX
price = "$5"
formula = "\\(x + y\\)"
display = "\\[z = 10\\]"
\`\`\`

End of code.`

    const nodes = renderMarkdownWithMath(codeBlockText)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    // Code block preserved in <pre><code>
    expect(html).toContain('<pre')
    expect(html).toContain('<code')
    expect(html).toContain('price = &quot;$5&quot;')
    expect(html).toContain('formula = &quot;\\(x + y\\)&quot;')
    expect(html).toContain('display = &quot;\\[z = 10\\]&quot;')
  })

  it('leaves inline code (`) completely untouched', () => {
    const text = 'Run `calc(\\(x\\) + $5)` in console.'
    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('<code')
    expect(html).toContain('calc(\\(x\\) + $5)')
  })

  it('never breaks real $ prices such as "$5"', () => {
    const text = 'The ticket costs $5.'
    const nodes = renderMarkdownWithMath(text)
    const html = renderToStaticMarkup(React.createElement('div', null, ...nodes))

    expect(html).toContain('$5')
    expect(html).not.toContain('class="katex"')

    // Two prices in one sentence
    const twoPrices = 'An apple is $5 and a melon is $10.'
    const nodes2 = renderMarkdownWithMath(twoPrices)
    const html2 = renderToStaticMarkup(React.createElement('div', null, ...nodes2))

    expect(html2).toContain('$5')
    expect(html2).toContain('$10')
    expect(html2).not.toContain('class="katex"')
  })
})
