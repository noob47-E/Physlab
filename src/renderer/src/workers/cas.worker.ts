/// <reference lib="webworker" />
// Symbolic algebra engine: Pyodide + SymPy, fully offline (files served from /pyodide/).

type Py = {
  loadPackage: (names: string[]) => Promise<void>
  runPython: (code: string) => unknown
  globals: { get: (name: string) => (...args: unknown[]) => string }
}

const PRELUDE = String.raw`
import json
import math as _math
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

# ---- Calculus steps (integral_steps, diff_steps) ---------------------------------------------
# The step engine sends back a tree; math/pure/calculusSteps.ts turns it into textbook working.
# The expressions in it are printed the way a textbook prints them — sin x, ln|x − 1|, ½ ln x —
# because the TypeScript side only arranges them and never re-prints SymPy's maths.
import dataclasses as _dc
from sympy.printing.latex import LatexPrinter as _LatexPrinter
from sympy.integrals.manualintegrate import integral_steps as _integral_steps, Rule as _Rule

class _BookLatex(_LatexPrinter):
    def _print_Function(self, expr, exp=None):
        # sin x and sin 3x lose their brackets as in a book; sin(x²) keeps them, because "sin x²"
        # is read as (sin x)² by half the class.
        a = expr.args
        fold = len(a) == 1 and (a[0].is_Symbol or (a[0].is_Mul and len(a[0].args) == 2 and a[0].args[0].is_Number
                                                   and a[0].args[0] > 0 and a[0].args[1].is_Symbol))
        old = self._settings['fold_func_brackets']
        self._settings['fold_func_brackets'] = fold
        try:
            return super()._print_Function(expr, exp)
        finally:
            self._settings['fold_func_brackets'] = old

    def _print_log(self, expr, exp=None):
        u = expr.args[0]
        if isinstance(u, sp.Abs):
            s = r'\ln\left|%s\right|' % self._print(u.args[0])
        elif u.is_Symbol or (u.is_Integer and u > 0):
            s = r'\ln %s' % self._print(u)
        else:
            s = r'\ln\left(%s\right)' % self._print(u)
        return s if exp is None else r'\left(%s\right)^{%s}' % (s, exp)

    def _print_Mul(self, expr):
        # ½ ln|x − 1|, not ln|x − 1| over 2: a fraction bar over a function reads as a fraction
        # of its argument.
        # The same for a half of a sum of fractions: ½(1/(x − 1) − 1/(x + 1)), never a fraction
        # whose top is itself two fractions.
        c, rest = expr.as_coeff_Mul()
        if c.is_Rational and not c.is_Integer:
            half_sum = rest.is_Add and (rest.atoms(sp.Function) or any(q.exp.is_negative for q in rest.atoms(sp.Pow)))
            if half_sum or (not rest.is_Add and rest.atoms(sp.Function)):
                # −½ ln|2x + 2|, not −ln|2x + 2| over 2: the sign goes in front of the same form.
                if c < 0:
                    return '- ' + self._print(-expr)
                if half_sum:
                    return r'\frac{%d}{%d} \left(%s\right)' % (c.p, c.q, self._print(rest))
                return r'\frac{%d}{%d} %s' % (c.p, c.q, self._print(rest))
        return super()._print_Mul(expr)

    def _print_Add(self, expr, order=None):
        # A sum that would open with a minus sign opens with its first positive term instead:
        # 1/(x − 1) − 1/(x + 1), not −1/(x + 1) + 1/(x − 1).
        terms = list(self._as_ordered_terms(expr, order=order))
        if terms and terms[0].could_extract_minus_sign():
            pos = [u for u in terms if not u.could_extract_minus_sign()]
            if pos:
                neg = [u for u in terms if u.could_extract_minus_sign()]
                return super()._print_Add(sp.Add(*(pos + neg), evaluate=False), order='none')
        return super()._print_Add(expr, order=order)

_BOOK = dict(ln_notation=True, inv_trig_style='power', fold_frac_powers=True)
_RENAME = {}

def _tex(e, keep_order=False):
    s = dict(_BOOK)
    if keep_order:
        s['order'] = 'none'
    return _BookLatex(s).doprint(e)

def _ex(e, keep_order=False):
    e = sp.sympify(e).xreplace(_RENAME) if _RENAME else sp.sympify(e)
    return {'latex': _tex(e, keep_order), 'text': sp.sstr(e, order='none' if keep_order else None)}

def _real(e):
    return e.xreplace({s: sp.Symbol(s.name, real=True) for s in e.free_symbols if isinstance(s, sp.Symbol)})

def _abslog(res, keep):
    # ∫du/u is ln|u| in a book: a log that integration made gets its bars unless its argument is
    # positive for every real x; a log the student wrote (∫ln x dx) stays as they wrote it.
    had = set(sp.sympify(keep).atoms(sp.log)) if keep is not None else set()
    def fix(u):
        L = sp.log(u)
        if L in had or isinstance(u, sp.Abs) or _real(u).is_positive:
            return L
        return sp.log(sp.Abs(u))
    return sp.sympify(res).replace(sp.log, fix)

def _pick_letters(f, rules):
    # SymPy names its substitution variable with a dummy _u; the student sees u, or the first
    # letter their own expression does not already use.
    used = {s.name for s in f.free_symbols}
    dummies = []
    parts = []
    def walk(r):
        if _dc.is_dataclass(r):
            if type(r).__name__ in ('PartsRule', 'CyclicPartsRule'):
                parts.append(r)
            for fl in _dc.fields(r):
                walk(getattr(r, fl.name))
        elif isinstance(r, (list, tuple)):
            for q in r:
                walk(q)
        elif isinstance(r, sp.Dummy) and r not in dummies:
            dummies.append(r)
    walk(rules)
    # Integration by parts has its own u and v; a substitution in the same working must not be
    # called u too, or the student reads "u = u" and "du = du".
    if parts:
        used |= {'u', 'v'}
    free = [L for L in ('u', 'w', 'v', 's', 'p', 'q') if L not in used]
    out = {}
    for d in dummies:
        if d.name in ('theta',):
            out[d] = sp.Symbol('theta')
        elif free:
            out[d] = sp.Symbol(free.pop(0))
    return out

def _ser(v):
    if _dc.is_dataclass(v) and isinstance(v, _Rule):
        return _rule_json(v)
    if isinstance(v, (list, tuple)):
        return [_ser(q) for q in v]
    if isinstance(v, sp.Basic):
        return _ex(v)
    if isinstance(v, int) and not isinstance(v, bool):
        # SymPy stores some constants (the −1 of a minus sign) as plain ints; one shape for every
        # expression keeps the TypeScript reader simple.
        return _ex(sp.Integer(v))
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)

def _rule_json(r):
    # Generic over the dataclass fields, so a rule SymPy adds later still arrives whole; the
    # TypeScript side decides which rules it can explain.
    d = {'rule': type(r).__name__}
    for fl in _dc.fields(r):
        d[fl.name] = _ser(getattr(r, fl.name))
    var = getattr(r, 'variable', None)
    try:
        d['result'] = _ex(_linfold(_abslog(r.eval(), r.integrand), var))
    except Exception:
        pass
    # The few things a book writes that the rule does not hold: du for a substitution or for
    # integration by parts, and the sum a cyclic parts rule builds before it solves for I.
    try:
        if type(r).__name__ == 'URule':
            d['du'] = _ex(sp.diff(r.u_func, var))
            if r.integrand.has(r.u_var):
                # For a quadratic under a fraction (1/(x² + 2x + 5)) SymPy hands back the URule
                # with its integrand already in u, half-rewritten: 1/(2u + (u − 1)² + 3). The
                # student's own integrand goes back in, and the completed square is sent so the
                # working can say x² + 2x + 5 = (x + 1)² + 4 before it substitutes.
                d['integrand'] = _ex(sp.cancel(r.integrand.subs(r.u_var, r.u_func)))
                sub = r.substep
                if type(sub).__name__ == 'RewriteRule' and sub.rewritten.has(r.u_var ** 2):
                    d['square'] = _ex(sub.rewritten.subs(r.u_var, r.u_func))
                    d['substep'] = _rule_json(sub.substep)
        if type(r).__name__ == 'PartsRule' and var is not None:
            d['du'] = _ex(sp.diff(r.u, var))
        if type(r).__name__ == 'CyclicPartsRule':
            acc, sign = [], 1
            for pr in r.parts_rules:
                acc.append(sign * pr.u * pr.v_step.eval())
                sign = -sign
            d['terms'] = _ex(sp.Add(*acc))
            d['du'] = [_ex(sp.diff(pr.u, r.variable)) for pr in r.parts_rules]
        if type(r).__name__ in ('RewriteRule', 'CompleteSquareRule'):
            rational = r.integrand.is_rational_function(var) and not r.integrand.is_polynomial(var)
            d['kind'] = 'complete_square' if type(r).__name__ == 'CompleteSquareRule' else (
                'partial' if rational and isinstance(sp.expand(r.rewritten), sp.Add) else 'rewrite')
            if d['kind'] == 'partial':
                d['rewritten'] = _ex(sp.apart(r.integrand, var))
    except Exception:
        pass
    return d

def _linfold(e, var):
    # tan⁻¹((x + 1)/2), not tan⁻¹(x/2 + 1/2): a book keeps a linear inside over one denominator.
    # Only for fractional coefficients — sin(3x + 6) must not become sin(3(x + 2)).
    def fix(fn):
        a = fn.args[0]
        try:
            if a.is_polynomial(var) and sp.degree(a, var) == 1 and any(not q.is_Integer for q in sp.Poly(a, var).coeffs()):
                return fn.func(sp.factor(a))
        except Exception:
            pass
        return fn
    return e.replace(lambda q: isinstance(q, sp.Function) and len(q.args) == 1 and q.args[0].is_Add, fix)

def integral_steps_op(p):
    var = sp.Symbol(p.get('var', 'x'))
    # Worked in radians always: in degrees every line of calculus drags a π/180 along (decision 2).
    f = P(p['expr'], False)
    tree = None
    try:
        tree = _integral_steps(f, var)
    except Exception:
        tree = None
    unsupported = tree is None or tree.contains_dont_know()
    F = None
    if not unsupported:
        try:
            F = tree.eval()
        except Exception:
            unsupported = True
    if unsupported:
        F = sp.integrate(f, var)
    closed = not F.has(sp.Integral)
    _RENAME.clear()
    if tree is not None and not unsupported:
        _RENAME.update(_pick_letters(f, tree))
    shown = _linfold(_abslog(F, f), var)
    tidy = sp.simplify(shown) if closed else shown
    if not closed or sp.count_ops(tidy) >= sp.count_ops(shown):
        tidy = shown
    tidy = _linfold(tidy, var)
    checked = bool(closed and sp.simplify(sp.diff(F, var) - f) == 0)
    out = {'var': str(var), 'integrand': _ex(f), 'unsupported': unsupported, 'closed': closed,
           'raw_latex': _tex(shown), 'raw_text': sp.sstr(shown),
           'answer_latex': _tex(tidy), 'answer_text': sp.sstr(tidy), 'checked': checked,
           'deg_ignored': bool(p.get('deg', False))}
    if not unsupported:
        out['tree'] = _rule_json(tree)
    if p.get('lower') is not None and p.get('upper') is not None:
        lo, hi = P(str(p['lower'])), P(str(p['upper']))
        exact = sp.simplify(sp.integrate(f, (var, lo, hi)))
        # json.dumps would write an infinite value as Infinity, which JSON.parse refuses.
        # Every exact value gets its decimal, whether SymPy knows it is finite (erf 1) or not (Si 1,
        # whose is_finite is None). No closed form (∫₀¹ xˣ dx): the integral itself is evaluated.
        numeric = _num(sp.Integral(f, (var, lo, hi)).evalf() if exact.has(sp.Integral) else exact)
        if numeric is not None and not all(_math.isfinite(q) for q in numeric.values()):
            numeric = None
        d = {'lower': _ex(lo), 'upper': _ex(hi), 'value': _ex(exact), 'numeric': numeric,
             # nan (∫₋₁¹ 1/x dx) and zoo: no value at all; ±oo: an infinite area.
             'diverges': bool(exact.has(sp.nan) or exact.has(sp.zoo)),
             'infinite': bool(exact in (sp.oo, -sp.oo))}
        if closed:
            Fa, Fb = sp.simplify(shown.subs(var, lo)), sp.simplify(shown.subs(var, hi))
            # F(b) − F(a) holds only when the function has no break between the limits: for
            # 1/x² from −1 to 1 it gives −2 while the area is infinite.
            # A finite decimal stands in for is_finite, which is None for values such as Si(1).
            agrees = (exact.is_finite or numeric is not None) and sp.simplify(Fb - Fa - exact) == 0
            d.update({'F_lower': _ex(Fa), 'F_upper': _ex(Fb), 'agrees': bool(agrees)})
        out['definite'] = d
    _RENAME.clear()
    return out

_OUTER = {
    sp.sin: lambda u: sp.cos(u), sp.cos: lambda u: -sp.sin(u), sp.tan: lambda u: sp.sec(u) ** 2,
    sp.sec: lambda u: sp.sec(u) * sp.tan(u), sp.csc: lambda u: -sp.csc(u) * sp.cot(u), sp.cot: lambda u: -sp.csc(u) ** 2,
    sp.asin: lambda u: 1 / sp.sqrt(1 - u ** 2), sp.acos: lambda u: -1 / sp.sqrt(1 - u ** 2),
    sp.atan: lambda u: 1 / (1 + u ** 2), sp.acot: lambda u: -1 / (1 + u ** 2),
    sp.sinh: lambda u: sp.cosh(u), sp.cosh: lambda u: sp.sinh(u), sp.tanh: lambda u: sp.sech(u) ** 2,
    sp.exp: lambda u: sp.exp(u), sp.log: lambda u: 1 / u,
}

class _NoSteps(Exception):
    pass

def _dnode(f, v, U):
    # One node per rule a textbook names. Returns (json, derivative); the derivative is kept as
    # SymPy's own expression so the parent's line is computed, never re-parsed from text.
    # U holds the free letters and the letter each chain rule's inside has been given.
    def node(rule, res, shown=None, **kw):
        d = {'rule': rule, 'expr': _ex(f), 'result': _ex(res if shown is None else shown, keep_order=shown is not None)}
        d.update(kw)
        return d, res
    if not f.has(v):
        return node('constant', sp.S.Zero)
    if f == v:
        return node('x', sp.S.One)
    if isinstance(f, sp.Add):
        kids = [_dnode(t, v, U) for t in f.as_ordered_terms()]
        res = sp.Add(*[k[1] for k in kids])
        # Term by term in the order they were written; a constant's 0 is dropped, as a book does.
        live = [k[1] for k in kids if k[1] != 0]
        if len(live) < 2:
            return node('sum', res, substeps=[k[0] for k in kids])
        shown = sp.Add(*live, evaluate=False)
        # When no two terms combine, the answer keeps the order they were written in. When they
        # do — (1 + ln x) − 1, or 2 sin x cos x − 2 sin x cos x — the term-by-term sum is only a
        # middle side and the answer is the sum worked out (ln x, 0), simplified when shorter.
        flat = [q for t in live for q in sp.Add.make_args(t)]
        if set(sp.Add.make_args(res)) == set(flat) and len(sp.Add.make_args(res)) == len(flat):
            return node('sum', res, sp.Add(*flat, evaluate=False), substeps=[k[0] for k in kids])
        tidy = sp.simplify(res)
        if sp.count_ops(tidy) >= sp.count_ops(res):
            tidy = res
        j, _ = node('sum', tidy, substeps=[k[0] for k in kids])
        j['shown'] = _ex(shown, keep_order=True)
        return j, tidy
    if isinstance(f, sp.Mul):
        c, rest = f.as_independent(v, as_Add=False)
        if c != 1:
            j, r = _dnode(rest, v, U)
            return node('constant_multiple', c * r, constant=_ex(c), other=_ex(rest), substeps=[j])
        num, den = sp.fraction(f, exact=True)
        if den.has(v) and num.has(v):
            jn, dn = _dnode(num, v, U)
            jd, dd = _dnode(den, v, U)
            top = sp.factor(sp.expand(den * dn - num * dd))
            return node('quotient', top / den ** 2, numerator=_ex(num), denominator=_ex(den),
                        expanded=_ex(sp.expand(den * dn - num * dd)), top=_ex(top), substeps=[jn, jd])
        if den.has(v):
            j, r = _dnode(sp.Pow(den, -1), v, U)
            return j, r
        fs = f.as_ordered_factors()
        a, b = fs[0], sp.Mul(*fs[1:])
        ja, da = _dnode(a, v, U)
        jb, db = _dnode(b, v, U)
        res = da * b + a * db
        shown = sp.Add(da * b, a * db, evaluate=False)
        return node('product', res, shown, substeps=[ja, jb])
    outer, inner = None, None
    if isinstance(f, sp.Pow):
        base, ex_ = f.args
        if base.has(v) and ex_.has(v):
            raise _NoSteps()
        if not ex_.has(v):
            outer, inner = (lambda u: u ** ex_), base
            d_outer = lambda u: ex_ * u ** (ex_ - 1)
            name = 'power'
        else:
            outer, inner = (lambda u: base ** u), ex_
            d_outer = lambda u: base ** u * sp.log(base)
            name = 'exp_base'
    elif isinstance(f, sp.Function) and type(f) in _OUTER and len(f.args) == 1:
        outer, inner, name = type(f), f.args[0], type(f).__name__
        d_outer = _OUTER[type(f)]
    else:
        raise _NoSteps()
    if inner == v:
        res = d_outer(v)
        kw = {'exp': _ex(f.args[1])} if name == 'power' else ({'base': _ex(f.args[0])} if name == 'exp_base' else {})
        return node(name, res, **kw)
    j, di = _dnode(inner, v, U)
    # Each inside gets its own letter, so u never changes its meaning halfway down the working:
    # sin(cos x²) names x² u and cos x² w. The letters are handed out after the inside's own
    # nodes (post-order), which is the order the working explains them in. The same inside met
    # again keeps its letter.
    if inner not in U['by']:
        U['by'][inner] = sp.Symbol(U['free'][len(U['by']) % len(U['free'])])
    L = U['by'][inner]
    at = d_outer(inner)
    res = at * di
    return node('chain', res, outer=name, u=_ex(inner), letter=str(L), outer_expr=_ex(outer(L)),
                outer_derivative=_ex(d_outer(L)), outer_at_inner=_ex(at), substeps=[j])

def diff_steps_op(p):
    var = sp.Symbol(p.get('var', 'x'))
    f = P(p['expr'], False)
    used = {s.name for s in f.free_symbols}
    letters = [L for L in ('u', 'w', 'v', 's', 'p', 'q', 'r') if L not in used]
    U = {'free': letters, 'by': {}}
    truth = sp.diff(f, var)
    out = {'var': str(var), 'expr': _ex(f), 'u': letters[0], 'letters': letters, 'deg_ignored': bool(p.get('deg', False))}
    try:
        tree, res = _dnode(f, var, U)
        out.update({'tree': tree, 'unsupported': False, 'answer_latex': tree['result']['latex'],
                    'answer_text': tree['result']['text'],
                    'checked': bool(sp.simplify(res - truth) == 0)})
    except (_NoSteps, RecursionError):
        res = sp.simplify(truth)
        out.update({'unsupported': True, 'answer_latex': _tex(res), 'answer_text': sp.sstr(res), 'checked': True})
    return out

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
        if op == 'factor_complex':
            # Over the complex numbers, for "Factorise with i". Plain factor() stops at x**2 + 4.
            return json.dumps(_out(sp.factor(P(p['expr'], deg), extension=[sp.I])))
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
        if op == 'integral_steps':
            return json.dumps(integral_steps_op(p))
        if op == 'diff_steps':
            return json.dumps(diff_steps_op(p))
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

self.onmessage = async (e: MessageEvent<{ id?: number; op: string; payload: object }>) => {
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
    // A message with no id is a warm-up: nothing is waiting for an answer, so none is sent. (The
    // client's `cas()` always gives an id; only `warmupCas` leaves it out.)
    if (id === undefined || op === 'warmup') {
      if (id !== undefined) postMessage({ id, result: { ok: true } })
      return
    }
    const run = py.globals.get('cas_run')
    const json = run(op, JSON.stringify(payload))
    postMessage({ id, result: JSON.parse(json) })
  } catch (err) {
    postMessage({ status: 'error', message: String(err) })
    if (id !== undefined) postMessage({ id, result: { error: String(err) } })
  }
}
