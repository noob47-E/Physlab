// Calculator/solver → scene bridge: re-export barrel for visualizer submodules
// (visualize/roots, visualize/curves, visualize/regions).
// Pure moves from core/visualize.ts (CW10f).

export {
  type DrawSpec,
  type NamedGraphs,
  NO_REAL_X,
  type XComplex,
  type XSolved,
  drawability,
  inXAlone,
  plainParseError,
  solutionsInX
} from './visualize/roots'

export {
  type DrawStyle,
  frameGraphs,
  graphBox,
  isDrawnAnswer,
  visualizeCurves,
  visualizeGraph,
  visualizePiecewise,
  visualizePoint,
  visualizeReadings,
  visualizeSolution,
  visualizeTangent,
  visualizeTangentAt,
  visualizeVector
} from './visualize/curves'

export {
  NORMAL_STRETCH,
  visualizeArea,
  visualizeBetween,
  visualizeDots,
  visualizeNormal,
  visualizeNumberLine
} from './visualize/regions'
