import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

// The 2-D grid mounts its two bright axis lines from `setAxes`, which it calls inside `useFrame`
// (the extent comes from the camera, which is only known in a frame). React commits that state
// after the frame has been drawn, and the canvas draws on demand, so unless something asks for
// one more frame the axis lines never reach the screen: after 2-D -> 3-D -> 2-D a student saw the
// grid and its numbers without the axes, in about one switch in five, until a click or a pan.
// Whether a frame is asked for is a React effect, which no DOM-free test can run, so this reads
// the component as text (as contracts.test.ts does for the Python worker) and checks the join:
// something that depends on `axes` calls `invalidate()`.

const GRID = readSource('src/renderer/src/render/Grid.tsx')

/** The text of one exported component, up to the next top-level export. */
function component(source: string, name: string): string {
  const from = source.indexOf(`export function ${name}(`)
  expect(from, `${name} is in Grid.tsx`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport ', from + 1)
  return source.slice(from, next < 0 ? undefined : next)
}

/** The dependency lists of every `useEffect` in `body` whose callback calls `invalidate()`. */
function invalidatingEffects(body: string): string[][] {
  const out: string[][] = []
  for (const m of body.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\)/g)) {
    if (/\binvalidate\(\)/.test(m[1])) out.push(m[2].split(',').map((d) => d.trim()))
  }
  return out
}

/** Whether the state a frame sets is followed by a frame request when it lands. */
function axesAskForAFrame(body: string): boolean {
  return invalidatingEffects(body).some((deps) => deps.includes('axes'))
}

describe('Grid2D: the axis lines mounted from inside a frame get a frame of their own', () => {
  const grid2D = component(GRID, 'Grid2D')

  it('still mounts the axes from state set inside useFrame (the reason a frame must be asked for)', () => {
    const frame = grid2D.slice(grid2D.indexOf('useFrame('))
    expect(frame).toMatch(/setAxes\(/)
    expect(grid2D).toMatch(/\{showAxes && axes\.x\.length > 0 && \(/)
  })

  it('calls invalidate() from an effect that depends on the axes', () => {
    expect(axesAskForAFrame(grid2D)).toBe(true)
  })

  it('gets invalidate from the canvas, not from somewhere that would not reach this root', () => {
    expect(grid2D).toMatch(/const \{[^}]*\binvalidate\b[^}]*\} = useThree\(\)/)
  })

  it('the check itself tells the fixed component from the one that lost the frame', () => {
    const before = `export function Grid2D() {
  const [axes, setAxes] = useState({ x: [], y: [] })
  useFrame(() => { setAxes({ x: [1], y: [2] }) })
  return null
}`
    const after = `export function Grid2D() {
  const { invalidate } = useThree()
  const [axes, setAxes] = useState({ x: [], y: [] })
  useEffect(() => {
    invalidate()
  }, [axes, showAxes, invalidate])
  useFrame(() => { setAxes({ x: [1], y: [2] }) })
  return null
}`
    expect(axesAskForAFrame(before)).toBe(false)
    expect(axesAskForAFrame(after)).toBe(true)
    // An effect that asks for a frame but does not depend on the axes is not the join.
    expect(axesAskForAFrame(after.replace('[axes, showAxes, invalidate]', '[showAxes, invalidate]'))).toBe(false)
  })
})
