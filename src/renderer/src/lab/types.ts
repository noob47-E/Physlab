// A table of readings from an experiment: what a student writes in their practical notebook.

/** One column of the table. */
export interface LabColumn {
  id: string
  /** Short name, used in formulas and on the graph axes, e.g. "t". */
  name: string
  /** Written after the name on the header and carried into the gradient, e.g. "s". */
  unit: string
  /** When set, the column is worked out from the others rather than typed, e.g. "t^2". */
  formula?: string
  /** When set, this column holds the ± uncertainty of the column with that id. */
  uncertaintyFor?: string
}

/** The shapes a set of readings can be fitted with. They map to the calculator's RegressionType. */
export type FitShape = 'linear' | 'quadratic' | 'log' | 'exp' | 'power' | 'inverse'

export const FIT_LABELS: Record<FitShape, string> = {
  linear: 'Straight line   y = a + bx',
  quadratic: 'Curve   y = a + bx + cx²',
  log: 'Logarithm   y = a + b ln x',
  exp: 'Exponential   y = a e^(bx)',
  power: 'Power   y = a x^b',
  inverse: 'Inverse   y = a + b/x'
}

export interface LabTable {
  id: string
  /** What the experiment was, e.g. "Free fall". */
  title: string
  columns: LabColumn[]
  /** One entry per column, in column order. null is an empty cell. */
  rows: (number | null)[][]
  /** Which columns are drawn against each other, and the shape fitted through them. */
  plot: { x: string; y: string; fit: FitShape }
}
