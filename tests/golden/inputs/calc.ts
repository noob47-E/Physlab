// The `calc` sweep's inputs (CLEANUP-PLAN.md §2): what a student types on the Calculator's Maths
// screen, as the maths field hands it over (LaTeX) or as typed in linear form. Fixed: a line may be
// added at the end (and the golden file regenerated in its own commit), never edited or reordered.

/** The 20 lines of the speed bench (09\speed\bench.test.ts), COMP mode. */
export const BENCH: string[] = [
  '2+3\\times4', '\\frac{1}{3}+\\frac{1}{6}', '\\sqrt{50}', '\\sin\\left(30\\right)', '\\cos\\left(60\\right)^{2}',
  '1.6\\times10^{-19}\\times6.02\\times10^{23}', '25.37\\div20', '2^{10}', '\\ln\\left(e^{3}\\right)', '\\log\\left(1000\\right)',
  '5!', '\\frac{\\sqrt{3}}{2}', '\\left(2+\\sqrt{3}\\right)\\left(2-\\sqrt{3}\\right)', '\\pi\\times3^{2}', '\\tan\\left(45\\right)',
  '\\frac{9.8\\times2.5^{2}}{2}', '\\sqrt[3]{27}', '1\\div2\\times10^{3}', '\\frac{1}{\\sqrt{3}+1}', '0.35\\times3'
]

/** Lines from the polish wave's fixes and browser checks: each answered wrongly once. */
export const FIXED_ONCE: string[] = [
  '\\sum_{n=1}^{5}n^{2}=55', '\\sum_{n=1}^{5}n^{2}=56', 'sigma(x,1,100000)=5', 'x+sigma(x,1,100)=5100', '2x=4', 'x^2=4',
  'x^2+x+1=0', '\\sin\\;30', '\\log_{2}\\;8', '\\left(-8\\right)^{\\frac{1}{3}}', '\\sqrt[3]{-8}', '\\frac{2}{3}+\\sqrt{2}',
  '1e-20+1', '10^{100}', '\\frac{1}{0}', '0\\div0', 'x^100000', '\\int_{0}^{\\pi}\\sin x\\,dx', '\\frac{d}{dx}x^{2}',
  'integral(1.6e-19*x,0,1)=1e-19', '5=5', 'A+B=7', '\\sin^{-1}\\left(0.5\\right)', '\\sin^{2}30', '3\\times10^{8}\\times2'
]

/** The comma corpus: the owner's rule is that only Lab Data cells read a decimal comma; these must not change. */
export const COMMAS: string[] = ['3,5', '1,000', '2,5+1', 'f(1,2)', '\\left(1,2\\right)']

/** Engineering and the angle unit, on a few lines. */
export const ANGLE_LINES: string[] = ['\\sin\\left(1\\right)', '\\cos\\left(\\pi\\right)', '\\tan\\left(60\\right)', '\\sin^{-1}\\left(1\\right)']

/** Complex numbers (CMPLX) and bases (BASE-N). */
export const CMPLX: string[] = ['\\left(2+3i\\right)\\left(1-i\\right)', '\\sqrt{-4}', 'i^{2}', '\\frac{1}{1+i}', '\\left|3+4i\\right|']
export const BASE_N: string[] = ['FF+1', '1010', '7\\times8', 'FF\\div3']

/** COMP lines from the Calculator's tests (harvested from tests/*.test.ts). */
export const TESTED_COMP: string[] = [
  '4000×√(2)',
  '1350×√(3)',
  '1000×√(2)+0.5',
  '1000×π+0.5',
  '22/7',
  '0.1+0.2',
  '2/3+1/7',
  '10^22',
  'AU_len',
  '2u',
  '\\int_{-8}^{0}x^{\\frac{1}{3}}\\,dx',
  '\\int_{-8}^{8}x^{\\frac{1}{3}}\\,dx',
  '\\int_{-8}^{8}x^{\\frac{2}{3}}\\,dx',
  '\\int_{-1}^{1}\\sqrt{x}\\,dx',
  '\\int_{0}^{1}A\\cdot x\\,dx',
  '\\int_{0}^{\\frac{1}{0}}x\\,dx',
  '\\int_{0}^{1}\\ln\\left(x\\right)\\,dx',
  '\\int_{0}^{1}x^{2}\\,dx',
  '\\sum_{x=1}^{100}x',
  '\\prod_{x=1}^{5}x',
  'A=5',
  'f(t)=t^2',
  'x=5',
  '\\sum_{x=1}^{3}x=5',
  'sin(30)',
  '2×3÷4',
  '√(16)+3²',
  'nCr(5,2)',
  '30°30\'',
  'ddx(x^3, 2)',
  'integral(x^2, 0, 3)',
  'sigma(x, 1, 100)',
  'Ans + 1',
  'x^2 = 2',
  'Pol(3, 4)',
  'Pol(max(1,3), 4)',
  'Pol(3*cos(0), 4)',
  'Rec(√(4), 60)',
  'Rec(max(1,2), 60)',
  'ddx(sin(x), 30)',
  'integral(sin(x), 0, 90)',
  'integral(sin(x), 0, pi)',
  'h_P',
  'hP',
  '2*mp',
  'AUlen',
  'ddx(x^(1/3), -8)',
  'sigma(x^(1/3), -8, -1)',
  '25.37÷20',
  'sigma(b2bterm(x), 1, 100000) = 5',
  'product(b2bterm(1), 1, 100000) + 0*x = 5',
  'integral(b2bterm(x)^2, 0, x)^2 = -1',
  'sigma(1/x^2, 1, 100) = 2',
  'A = 5',
  'speed = 5',
  'f(t) = t^2',
  '2A + 1',
  'sin(1)',
  '1',
  'sigma(x^2,1,5)=55',
  'sigma(x^2,1,100000)=333338333350000',
  'sigma(x^2,1,100000)=333338333000000',
  'sigma(1/x^2,1,100000)=1.6449240668982262',
  'sigma(1e-20*x,1,3)=5e-20',
  'sigma(1e-20*x,1,3)=6e-20',
  'sigma(0*x,1,3)=0',
  '\\frac{1}{2}+\\sqrt{9}',
  '\\sqrt{2}',
  '\\frac{\\pi}{3}',
  '\\sqrt{2}+\\frac{1}{3}',
  '3+4',
  '\\placeholder{}',
  '2+',
  '2 \\pm 3',
  '2k+1',
  '5\\div0',
  '\\frac{0}{0}',
  '\\ln\\left(0\\right)',
  'x^{2}=2',
  '\\sin\\left(x\\right)=2',
  '12345',
  '12345\\times678',
  'x^{3}-1=0',
  '\\sqrt{9}',
  '\\left(-8\\right)^{\\frac{1}{2}}',
  'x^{2}+6x+9=0',
  'x^{3}-3x+2=0',
  '\\sqrt{-4}+1',
  '\\sqrt{-4}\\times\\sqrt{-4}',
  'x^{\\frac{1}{3}}',
  'x^{2}-\\sin\\left(30\\right)=0',
  '\\left(x+\\sin\\left(30\\right)\\right)^{2}=0',
  'arg(-1)',
  'A(B+1)',
  'Abs(-3)'
]

/** CMPLX lines from the Calculator's tests (harvested from tests/*.test.ts). */
export const TESTED_CMPLX: string[] = [
  '\\operatorname{re}\\left(3+4i\\right)',
  'x^{2}=-4',
  '\\operatorname{nCr}\\left(2+3i,2\\right)',
  '(3+4i)(1-2i)',
  '\\operatorname{arg}\\left(-2i\\right)',
  '2\\times e^{i\\times\\frac{90\\times\\pi}{180}}',
  '3+4i',
  '\\left(-8\\right)^{\\frac{2}{3}}',
  '1+i',
  '2+3i'
]

/** BASE-N lines from the Calculator's tests (harvested from tests/*.test.ts). */
export const TESTED_BASE_N: string[] = [
  '   ',
  'FF + 1',
  '5/0',
  '12',
  'FG',
  '18',
  '1A',
  '1010 and 0110',
  '1 +',
  'FF'
]

