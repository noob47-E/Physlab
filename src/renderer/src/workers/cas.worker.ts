/// <reference lib="webworker" />
// Symbolic algebra engine: Pyodide + SymPy, fully offline (files served from /pyodide/).

type Py = {
  loadPackage: (names: string[]) => Promise<void>
  runPython: (code: string) => unknown
  globals: { get: (name: string) => (...args: unknown[]) => string }
}

const PRELUDE = String.raw`
import json
import sympy as sp
from sympy.parsing.sympy_parser import (parse_expr, standard_transformations,
    implicit_multiplication_application, convert_xor, function_exponentiation)

TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor, function_exponentiation)
x, y, z, t, a, b, c, k, n, m = sp.symbols('x y z t a b c k n m')
theta = sp.Symbol('theta')

def _names(deg):
    d = {
        'x': x, 'y': y, 'z': z, 't': t, 'a': a, 'b': b, 'c': c, 'k': k, 'n': n, 'm': m, 'theta': theta,
        'pi': sp.pi, 'e': sp.E, 'E': sp.E, 'i': sp.I, 'oo': sp.oo, 'inf': sp.oo,
        'ln': sp.log, 'log': lambda v, base=None: sp.log(v, 10) if base is None else sp.log(base, v),
        'sqrt': sp.sqrt, 'cbrt': lambda v: sp.root(v, 3), 'abs': sp.Abs, 'Abs': sp.Abs,
        'nPr': lambda p, q: sp.factorial(p) / sp.factorial(p - q), 'nCr': sp.binomial,
    }
    if deg:
        r = sp.pi / 180
        d.update({
            'sin': lambda v: sp.sin(v * r), 'cos': lambda v: sp.cos(v * r), 'tan': lambda v: sp.tan(v * r),
            'asin': lambda v: sp.asin(v) / r, 'acos': lambda v: sp.acos(v) / r, 'atan': lambda v: sp.atan(v) / r,
        })
    return d

def P(s, deg=False):
    s = s.replace('π', 'pi').replace('√', 'sqrt').replace('×', '*').replace('÷', '/').replace('−', '-')
    return parse_expr(s, local_dict=_names(deg), transformations=TRANSFORMS, evaluate=True)

def _num(v):
    try:
        c = complex(sp.N(v, 15))
        if abs(c.imag) < 1e-13:
            return {'re': c.real}
        return {'re': c.real, 'im': c.imag}
    except Exception:
        return None

def _out(v, **extra):
    d = {'latex': sp.latex(v), 'text': sp.sstr(v), 'numeric': _num(v)}
    d.update(extra)
    return d

def _eq(s, deg):
    if '=' in s:
        l, r = s.split('=', 1)
        return sp.Eq(P(l, deg), P(r, deg))
    return sp.Eq(P(s, deg), 0)

def cas_run(op, payload_json):
    p = json.loads(payload_json)
    deg = bool(p.get('deg', False))
    try:
        if op == 'exact':
            v = sp.nsimplify(P(p['expr'], deg), [sp.pi, sp.E], rational=False)
            return json.dumps(_out(sp.simplify(v)))
        if op == 'eval':
            return json.dumps(_out(sp.simplify(P(p['expr'], deg))))
        if op == 'simplify':
            return json.dumps(_out(sp.simplify(P(p['expr'], deg))))
        if op == 'expand':
            return json.dumps(_out(sp.expand(P(p['expr'], deg))))
        if op == 'factor':
            return json.dumps(_out(sp.factor(P(p['expr'], deg))))
        if op == 'apart':
            # Partial fractions. Used as the fallback when the step engine cannot split a
            # denominator itself; simplify would hand back the same fraction it was given.
            return json.dumps(_out(sp.apart(P(p['expr'], deg))))
        if op == 'diff':
            var = sp.Symbol(p.get('var', 'x'))
            f = P(p['expr'], deg)
            d = sp.diff(f, var, int(p.get('order', 1)))
            res = sp.simplify(d)
            extra = {}
            if p.get('at') is not None:
                extra['value'] = _out(res.subs(var, P(str(p['at']))))
            return json.dumps(_out(res, **extra))
        if op == 'integrate':
            var = sp.Symbol(p.get('var', 'x'))
            f = P(p['expr'], deg)
            if p.get('lower') is not None and p.get('upper') is not None:
                res = sp.integrate(f, (var, P(str(p['lower'])), P(str(p['upper']))))
            else:
                res = sp.integrate(f, var)
            return json.dumps(_out(sp.simplify(res)))
        if op == 'limit':
            var = sp.Symbol(p.get('var', 'x'))
            res = sp.limit(P(p['expr'], deg), var, P(str(p['to'])), p.get('dir', '+-'))
            return json.dumps(_out(res))
        if op == 'series':
            var = sp.Symbol(p.get('var', 'x'))
            res = sp.series(P(p['expr'], deg), var, P(str(p.get('at', 0))), int(p.get('n', 6))).removeO()
            return json.dumps(_out(res))
        if op == 'solve':
            eqs = [_eq(s.strip(), deg) for s in p['eqs'] if s.strip()]
            syms = sorted(set().union(*[e.free_symbols for e in eqs]), key=lambda s: s.name)
            if p.get('vars'):
                syms = [sp.Symbol(v) for v in p['vars']]
            sol = sp.solve(eqs, syms, dict=True)
            rows = []
            for s in sol:
                rows.append({str(k2): _out(v2) for k2, v2 in s.items()})
            return json.dumps({'solutions': rows, 'vars': [str(s) for s in syms]})
        return json.dumps({'error': 'unknown operation ' + op})
    except Exception as ex:
        return json.dumps({'error': str(ex)})
`

let py: Py | null = null
let loading: Promise<Py> | null = null

async function boot(): Promise<Py> {
  const base = new URL('/pyodide/', self.location.href).href
  const mod = (await import(/* @vite-ignore */ `${base}pyodide.mjs`)) as { loadPyodide: (o: object) => Promise<Py> }
  const instance = await mod.loadPyodide({ indexURL: base })
  await instance.loadPackage(['mpmath', 'sympy'])
  instance.runPython(PRELUDE)
  return instance
}

self.onmessage = async (e: MessageEvent<{ id: number; op: string; payload: object }>) => {
  const { id, op, payload } = e.data
  try {
    if (!py) {
      loading ??= boot()
      postMessage({ status: 'loading' })
      try {
        py = await loading
      } catch (err) {
        // Forget the failed attempt, or every later request replays the same rejection.
        loading = null
        throw err
      }
      postMessage({ status: 'ready' })
    }
    if (op === 'warmup') {
      postMessage({ id, result: { ok: true } })
      return
    }
    const run = py.globals.get('cas_run')
    const json = run(op, JSON.stringify(payload))
    postMessage({ id, result: JSON.parse(json) })
  } catch (err) {
    postMessage({ status: 'error', message: String(err) })
    postMessage({ id, result: { error: String(err) } })
  }
}
