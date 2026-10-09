// The `lab` sweep's inputs: typed cells, pasted CSV texts, and fixed tables for fits.

/** 40 typed cells including decimal commas, units, blanks, and typographic minuses. */
export const TYPED_CELLS: string[] = [
  "1.23", " 4.56 ", "-7.89", "−1.2", "1e-3", "2.5E4", "0.00", "123.", ".45", "+3",
  "3,5", "1,000", "2,5+1", "1,2e3",
  "1.2 m", "3.4 s", "5 kg", "10 m/s",
  "2+3", "1/2", "sin(30)", "pi",
  "", "   ", "abc", "1.2.3", "1e", "e3",
  "1,2,3", "1;2", "1\t2",
  "1.2e-3", "1.2e+3", "1.2e3",
  "1.2", "1.20", "1.200",
  "−8", "–9", "—10"
]

/** 10 pasted CSV texts with various separators and formats. */
export const PASTED_CSV: string[] = [
  "1,2\n3,4",
  "t / s, x / m\n1, 2\n3, 4",
  "1.2, 3.4\n5.6, 7.8",
  "1;2\n3;4",
  "1\t2\n3\t4",
  "1,2; 3,4\n5,6; 7,8",
  "1,2\t3,4\n5,6\t7,8",
  '"a,b",c\n1,2',
  "1\n2\n3",
  "1,2,3\n4,5,6"
]

/** 10 fixed tables for testing fits (linear, quadratic, power, etc.). */
export const FIT_TABLES: { name: string; xs: number[]; ys: number[] }[] = [
  { name: 'Linear perfect', xs: [1, 2, 3], ys: [2, 4, 6] },
  { name: 'Linear noisy', xs: [1, 2, 3, 4, 5], ys: [2.1, 3.9, 6.2, 7.8, 10.1] },
  { name: 'Quadratic perfect', xs: [1, 2, 3, 4], ys: [1, 4, 9, 16] },
  { name: 'Quadratic noisy', xs: [1, 2, 3, 4], ys: [1.1, 3.8, 9.2, 15.9] },
  { name: 'Power perfect', xs: [1, 2, 3, 4], ys: [1, 8, 27, 64] },
  { name: 'Power noisy', xs: [1, 2, 3, 4], ys: [1.1, 7.8, 27.2, 63.9] },
  { name: 'Flat line', xs: [1, 2, 3, 4], ys: [5, 5, 5, 5] },
  { name: 'Inverse perfect', xs: [1, 2, 4, 8], ys: [8, 4, 2, 1] },
  { name: 'Exponential perfect', xs: [1, 2, 3, 4], ys: [2, 4, 8, 16] },
  { name: 'Logarithmic perfect', xs: [1, 10, 100], ys: [0, 1, 2] }
]
