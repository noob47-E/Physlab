# Helping with PhysLab

PhysLab is built for students who cannot rely on having an internet connection, an account, or
money. Anything that would break one of those is not a feature here, however good it is otherwise.

## The rules that do not bend

1. **No AI in the product.** No API keys, no cloud calls, no model of any kind. Everything runs
   offline, on the machine in front of the student.
2. **It must feel like a calculator, not a programming language.** Natural maths, buttons, a
   command bar of one-liners. Never syntax that looks like code.
3. **Answers are required; working is a bonus.** Every feature produces the result. Steps, hints
   and pictures are welcome on top, never instead.
4. **Everything shown carries units and the user's precision**, through `formatMeasure` /
   `fmtPrecise` — never a raw `toFixed`.
5. **Features are modes, not grade levels.** No beginner/advanced gates.

[AGENTS.md](AGENTS.md) has the architecture, the traps that have already cost a day each, and how
to check your work. Read it before changing anything.

## The most useful thing you can do

Not code — **use it, and say what broke**. A bug report that says what you did, what happened and
what you expected is worth more than a patch. The black viewport was reported twice by a student
before anyone found the cause.

If you teach, the most valuable report of all is: *my students got stuck here.*

## If you do write code

```bash
npm install
npm run dev        # Electron with hot reload
npm test           # ~780 tests, pure logic, no DOM
npm run typecheck  # must be clean
npm run lint       # must report 0 errors; a suppression says why, after `--`
```

The test suite covers the maths, not the interface. Put any decision worth trusting into a pure
function in `math/`, `lab/` or `sim/` and test that, rather than testing through React.

Comments explain **why**, never what. Plain English in anything a student reads: "Right size, wrong
sign", not "sign error detected".

## Licence

GPL-3.0. By contributing you agree your work is released under it, which is what keeps PhysLab free
for the next student.
