// Part X7: Solver and Vector Calculator merged into one unified vector panel.
// Re-exports VectorCalc so dockview and lazy imports resolve to the unified panel.
import { VectorCalc } from './VectorCalc'

export function Solver() {
  return <VectorCalc />
}
