// Calculator-style function calls in a typed graph line: PhysLab is typed like a calculator (sin 2x, sqrt 3), never
// like a program, but the plain-text reader (mathjs) has no rule for a function without its bracket. "y = sin x" was read
// as a slider named sin times x, and the Expressions box answered "Make a slider first, e.g. sin = 1".
//
// The bracket goes in the way a textbook reads the line: after the name and a space comes one term - a number, then
// letters, each with an optional power - and the term stops at the next space or operator. So sin x is sin(x), sin 2x is
// sin(2x), sin x^2 is sin(x²), sqrt 3 is sqrt(3), 2 sin x cos x is 2·sin(x)·cos(x), sin x + 1 is sin(x) + 1, and a power
// written on the name squares the value: sin^2 x is sin(x)². A name already followed by its bracket, or glued to the next
// letters ("sinx", "sinh"), is left alone, so nothing that was read before is read differently now.

const NAMES = ['arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sqrt', 'ln', 'log', 'exp', 'abs']
const NAME = `(?:${NAMES.join('|')})`
const POWER = String.raw`\^(?:\d+(?:\.\d+)?|[A-Za-zπθ]|\([^()]*\))`
const ATOM = String.raw`(?:pi|π|θ|[A-Za-z])(?:${POWER})?`
const TERM = String.raw`(?:\d+(?:\.\d+)?(?:${POWER})?(?:${ATOM})*|(?:${ATOM})+)`
const BARE = new RegExp(String.raw`(?<![A-Za-z0-9_])(${NAME})(?![A-Za-z0-9_(])(?:\^(\d+))?\s+(${TERM})(?![A-Za-z0-9_(])`, 'g')

export function bracketBareCalls(text: string): string {
  return text.replace(BARE, (_whole, name: string, power: string | undefined, arg: string) => {
    const call = `${name}(${arg})`
    return power ? `${call}^${power}` : call
  })
}
