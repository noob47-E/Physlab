// The PhysLab command bar: calculator-style one-liners that create live objects.
//   A = (3, 4)      B = 10 N ∠ 30°     R = A + B      A × B      |R|
//   Triangle((0,0), (4,0), (0,3))      Circle(P, 3)   y = sin(x)  solve(x^2 - 5x + 6 = 0)

export { describeComputed } from './commands/common'
export { runCommand } from './commands/route'
export { HELP, solveRowsTex } from './commands/solve'
