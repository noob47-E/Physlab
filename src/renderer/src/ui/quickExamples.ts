// The handful of things worth trying first, shown wherever the app has nothing to show yet: the
// Outliner's empty state, the search palette, the help. One list, so the two cannot drift apart.
//
// The order matters. Each line must work in an empty drawing after the ones above it: "R = A + B"
// used to be offered on its own, and the student's second click produced an error about a vector
// that did not exist.

export interface QuickExample {
  /** What goes into the command bar. */
  insert: string
  /** What it makes, in plain words. */
  desc: string
  /** Whether it puts something on the drawing, which is what an empty Outliner is waiting for. */
  draws: boolean
}

export const QUICK_EXAMPLES: QuickExample[] = [
  { insert: 'A = <3, 4>', desc: 'A vector', draws: true },
  { insert: 'B = <2, -1>', desc: 'Another vector', draws: true },
  { insert: 'R = A + B', desc: 'Adds A and B', draws: true },
  { insert: 'A × B', desc: 'Cross product, with steps', draws: false },
  { insert: 'Triangle((0,0), (4,0), (0,3))', desc: 'A triangle', draws: true },
  { insert: 'y = sin(x)', desc: 'A graph', draws: true },
  { insert: 'solve(x^2 = 4)', desc: 'Solves an equation', draws: false }
]

/** The name an example defines, so a test can check every example's inputs are defined above it. */
export function definedName(insert: string): string | undefined {
  return /^([A-Za-z]\w*)\s*=/.exec(insert)?.[1]
}

/** The single-letter names an example refers to (A, B, R…), which must already exist. */
export function referencedNames(insert: string): string[] {
  const body = insert.replace(/^[A-Za-z]\w*\s*=/, '')
  return [...body.matchAll(/\b([A-Z])\b/g)].map((m) => m[1])
}
