#!/usr/bin/env node
// Converts Rubi's integration test suite (the Mathematica Syntax Test Suite, MIT licence) into PhysLab's format.
//
//   node scripts/rubi/convert-tests.mjs <suite-folder> [--section "1 Algebraic functions"] [--out <folder>]
//
// <suite-folder> is the folder that holds the section folders (MathematicaSyntaxTestSuite-master). The suite is read as
// data only: nothing in it is run, and nothing from it is written or copied. Without --out the output goes to
// tests/engine/integration/ in this repository.
//
// Each .m file holds lines {integrand, variable, steps, antiderivative}. Text inside (* ... *) comments is not a test
// and is skipped. Every other line is classified exactly once:
//   kept         converted, and its antiderivative differentiates back to the integrand at 40 digits (section1.json)
//   unsupported  uses a function mathjs cannot express; the function is named (section1-unsupported.json)
//   rejected     anything else, with the reason (section1-rejected.json)
// Nothing is dropped silently: an exception while converting or verifying a line is recorded as a rejection.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { create, all } from 'mathjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const math = create(all);
math.config({ number: 'BigNumber', precision: 40 });

/**
 * Verification points: under each constant set, the variable takes the first five values of this grid at which both
 * sides are real and finite (points inside the domain). Fewer than three such values rejects the constant set.
 */
const GRID = ['0.25', '0.5', '0.75', '0.9', '1.1', '1.4', '1.7', '2.2', '2.7', '3.3', '4.1', '5',
  '-0.25', '-0.5', '-0.9', '-1.4', '-2.2', '-3.3'];
const POINTS_WANTED = 5;
/** Values for the symbols of an integrand (in name order). The second set has negative values, so that expressions such
 *  as Sqrt[-a] are real for some items; an item is kept under the first set that gives it enough real points. */
const CONSTANT_SETS = [
  ['1.3', '0.7', '2.1', '1.6', '0.9', '1.15', '0.55', '2.6', '1.45', '0.35'],
  ['-1.3', '0.7', '-2.1', '1.6', '-0.9', '1.15', '-0.55', '2.6', '-1.45', '0.35'],
];
/** Relative agreement at 40 significant digits. The symbolic derivative has no truncation error, so only rounding
 *  remains (about 1e-38 relative per operation); 1e-30 leaves many orders of magnitude of margin. */
const TOLERANCE = '1e-30';
const MIN_VALID_POINTS = 3;

/** Mathematica functions of one argument that mathjs expresses, with their mathjs names. */
const FUNCTIONS = {
  Sqrt: 'sqrt', Log: 'log', Exp: 'exp', Abs: 'abs',
  Sin: 'sin', Cos: 'cos', Tan: 'tan', Cot: 'cot', Sec: 'sec', Csc: 'csc',
  Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh', Coth: 'coth', Sech: 'sech', Csch: 'csch',
  ArcSin: 'asin', ArcCos: 'acos', ArcTan: 'atan', ArcCot: 'acot', ArcSec: 'asec', ArcCsc: 'acsc',
  ArcSinh: 'asinh', ArcCosh: 'acosh', ArcTanh: 'atanh', ArcCoth: 'acoth', ArcSech: 'asech', ArcCsch: 'acsch',
};

/** Mathematica constants, and the names a symbol must not keep because mathjs already uses them. */
const CONSTANTS = { E: 'e', I: 'i', Pi: 'pi' };
const RESERVED = new Set(['mod', 'to', 'in', 'and', 'or', 'xor', 'not', 'end']);

// ---- reading the files ---------------------------------------------------------------------------------------------

/** The text with every (* ... *) comment, nested ones included, replaced by spaces (newlines kept). */
export function maskComments(text) {
  const out = text.split('');
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('(*', i)) {
      depth++;
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
    } else if (depth > 0 && text.startsWith('*)', i)) {
      depth--;
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
    } else {
      if (depth > 0 && text[i] !== '\n') out[i] = ' ';
      i++;
    }
  }
  return out.join('');
}

/** The top-level {...} groups of masked text, as [start, end] index pairs; end is -1 for an unclosed group. */
export function findGroups(masked) {
  const groups = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        groups.push([start, i]);
        start = -1;
      }
    }
  }
  if (depth !== 0) groups.push([start, -1]);
  return groups;
}

/** Splits text at its top-level commas: commas inside (), [] or {} do not count. */
export function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const c of body) {
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current.trim());
  return parts;
}

// ---- Mathematica text to mathjs text -------------------------------------------------------------------------------

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    let m = /^\d+(?:\.\d+)?/.exec(rest);
    if (m) {
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    m = /^[A-Za-z][A-Za-z0-9]*/.exec(rest);
    if (m) {
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if ('+-*/^'.includes(c)) toks.push({ t: 'op', v: c });
    else if (c === '(') toks.push({ t: 'lp' });
    else if (c === ')') toks.push({ t: 'rp' });
    else if (c === '[') toks.push({ t: 'lb' });
    else if (c === ']') toks.push({ t: 'rb' });
    else if (c === ',') toks.push({ t: 'comma' });
    else throw new Error(`unexpected character ${JSON.stringify(c)} at ${i}`);
    i++;
  }
  return toks;
}

/**
 * Converts one Mathematica expression to mathjs text. Returns the text and the functions mathjs cannot express, by
 * name ("Name/n" when the call has n arguments and the name is one that mathjs knows only with one). Implicit products
 * ("2x", "a b") are written with "*": mathjs binds implicit products tighter than "/", Mathematica does not.
 */
export function convertExpression(src) {
  const toks = tokenize(src);
  const isCallName = new Array(toks.length).fill(false);
  const arity = new Array(toks.length).fill(-1);
  const stack = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'rp' || t.t === 'rb') {
      const top = stack.pop();
      if (!top) throw new Error('closing bracket without an opening one');
      if ((t.t === 'rp') !== (top.kind === 'paren')) throw new Error('mismatched brackets');
      if (top.kind === 'call') arity[top.nameIndex] = top.empty ? 0 : top.commas + 1;
      if (stack.length) stack[stack.length - 1].empty = false;
    } else if (t.t === 'lp' || t.t === 'lb') {
      if (stack.length) stack[stack.length - 1].empty = false;
      if (t.t === 'lp') {
        stack.push({ kind: 'paren', empty: true, commas: 0 });
      } else {
        const prev = toks[k - 1];
        if (!prev || prev.t !== 'id') throw new Error('[ must follow a function name');
        isCallName[k - 1] = true;
        stack.push({ kind: 'call', nameIndex: k - 1, empty: true, commas: 0 });
      }
    } else if (t.t === 'comma') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error('comma outside brackets');
      top.commas++;
      top.empty = false;
    } else if (stack.length) {
      stack[stack.length - 1].empty = false;
    }
  }
  if (stack.length) throw new Error('unclosed bracket');

  const unsupported = [];
  let out = '';
  let prevEnds = false;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const startsOperand = t.t === 'num' || t.t === 'id' || t.t === 'lp';
    const endsOperand = t.t === 'num' || (t.t === 'id' && !isCallName[k]) || t.t === 'rp' || t.t === 'rb';
    if (startsOperand && prevEnds) out += '*';
    let piece;
    if (t.t === 'id' && isCallName[k]) {
      const n = arity[k];
      if (FUNCTIONS[t.v] !== undefined && n === 1) {
        piece = FUNCTIONS[t.v];
      } else {
        unsupported.push(FUNCTIONS[t.v] !== undefined ? `${t.v}/${n}` : t.v);
        piece = t.v;
      }
    } else if (t.t === 'id') {
      piece = symbolName(t.v);
    } else if (t.t === 'num' || t.t === 'op') {
      piece = t.v;
    } else {
      piece = { lp: '(', rp: ')', lb: '(', rb: ')', comma: ',' }[t.t];
    }
    out += piece;
    prevEnds = endsOperand;
  }
  return { text: out, unsupported: [...new Set(unsupported)] };
}

function symbolName(v) {
  if (CONSTANTS[v] !== undefined) return CONSTANTS[v];
  if (RESERVED.has(v) || math[v] !== undefined) return `${v}_s`;
  return v;
}

// ---- verification ---------------------------------------------------------------------------------------------------

const isRealFinite = (v) => math.typeOf(v) === 'BigNumber' && v.isFinite();

/**
 * Differentiates the antiderivative symbolically (mathjs, simplify off) and compares the result with the integrand at
 * five points, under each constant set in turn. A point where either side is not a finite real number is skipped; a
 * point where both are real and differ is a rejection, whichever set it is under. An item is kept under the first set
 * that gives at least three valid points. Every failure is returned with a category and a reason; nothing is thrown.
 */
export function verify(integrandText, antiderivativeText, variable) {
  const fail = (category, reason) => ({ ok: false, category, reason });
  let f;
  let F;
  try {
    f = math.parse(integrandText);
    F = math.parse(antiderivativeText);
  } catch (e) {
    return fail('parse', `mathjs cannot read the converted text: ${e.message}`);
  }
  let dF;
  try {
    dF = math.derivative(F, variable, { simplify: false });
  } catch (e) {
    return fail('differentiate', `mathjs cannot differentiate the antiderivative: ${e.message}`);
  }
  const deps = new Set();
  for (const node of [f, F]) {
    node.traverse((n) => {
      if (n.type === 'SymbolNode' && n.name !== variable && math[n.name] === undefined) deps.add(n.name);
    });
  }
  const names = [...deps].sort();
  let cf;
  let cdF;
  try {
    cf = f.compile();
    cdF = dF.compile();
  } catch (e) {
    return fail('evaluate', `could not compile: ${e.message}`);
  }
  const tol = math.bignumber(TOLERANCE);
  let best = 0;
  for (let set = 0; set < CONSTANT_SETS.length; set++) {
    const scope = {};
    names.forEach((name, k) => {
      scope[name] = math.bignumber(CONSTANT_SETS[set][k % CONSTANT_SETS[set].length]);
    });
    let valid = 0;
    for (const p of GRID) {
      if (valid === POINTS_WANTED) break;
      const s = { ...scope, [variable]: math.bignumber(p) };
      let a;
      let b;
      try {
        a = cf.evaluate(s);
        b = cdF.evaluate(s);
      } catch (e) {
        return fail('evaluate', `evaluation failed at ${variable} = ${p}: ${e.message}`);
      }
      if (!isRealFinite(a) || !isRealFinite(b)) continue;
      const scale = math.max(math.bignumber(1), math.abs(a), math.abs(b));
      if (math.larger(math.abs(math.subtract(a, b)), math.multiply(tol, scale))) {
        return fail('mismatch', `the derivative of the antiderivative differs from the integrand at ${variable} = ${p} (constant set ${set + 1})`);
      }
      valid++;
    }
    if (valid >= MIN_VALID_POINTS) return { ok: true, validPoints: valid, constantSet: set + 1 };
    best = Math.max(best, valid);
  }
  return fail('few-valid-points', `only ${best} real points inside the domain under each constant set (need ${MIN_VALID_POINTS} of ${POINTS_WANTED})`);
}

// ---- classifying one line -------------------------------------------------------------------------------------------

/** Classifies one test line, given its four fields. */
export function classify(fields) {
  if (fields.length === 5) {
    return { kind: 'rejected', category: 'split', reason: 'the line has five fields: its antiderivative is two expressions, not one (not converted)' };
  }
  if (fields.length !== 4) return { kind: 'rejected', category: 'malformed', reason: `not a test line: ${fields.length} fields` };
  const [integrandM, variable, stepsText, antiM] = fields;
  if (!/^-?\d+$/.test(stepsText)) return { kind: 'rejected', category: 'malformed', reason: `steps is not a whole number: ${stepsText}` };
  const steps = Number(stepsText);
  if (variable !== 'x') return { kind: 'rejected', category: 'variable', reason: `the variable is ${variable}, not x` };
  // Every function name is read from the raw text first, so that a name mathjs lacks is reported by name even when the
  // rest of the text (such as the condition in If[$VersionNumber>=8, ...]) is outside what the converter reads.
  const unknownNames = [];
  for (const m of `${integrandM} ${antiM}`.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*\[/g)) {
    if (FUNCTIONS[m[1]] === undefined && !unknownNames.includes(m[1])) unknownNames.push(m[1]);
  }
  if (unknownNames.length > 0) return { kind: 'unsupported', functions: unknownNames, steps, integrandM, antiM };
  let fi;
  let fa;
  try {
    fi = convertExpression(integrandM);
    fa = convertExpression(antiM);
  } catch (e) {
    return { kind: 'rejected', category: 'convert', reason: `could not read the Mathematica text: ${e.message}` };
  }
  const functions = [...new Set([...fi.unsupported, ...fa.unsupported])];
  if (functions.length > 0) return { kind: 'unsupported', functions, steps, integrandM, antiM };
  if (steps === 0 && antiM === '0') {
    return { kind: 'rejected', category: 'placeholder', reason: 'placeholder line: steps 0 and antiderivative 0, so no optimal antiderivative is given' };
  }
  const result = verify(fi.text, fa.text, 'x');
  if (!result.ok) return { kind: 'rejected', category: result.category, reason: result.reason };
  return { kind: 'kept', integrand: fi.text, antiderivative: fa.text, steps, validPoints: result.validPoints, constantSet: result.constantSet };
}

// ---- driver ---------------------------------------------------------------------------------------------------------

function walkMFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMFiles(p, out);
    else if (entry.name.endsWith('.m')) out.push(p);
  }
  return out;
}

/** Converts every test line of one section folder. Pure: writes nothing. */
export function convertSection(suiteDir, section) {
  const files = walkMFiles(path.join(suiteDir, section)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const kept = [];
  const unsupported = [];
  const rejected = [];
  let lines = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const masked = maskComments(text);
    const source = path.relative(suiteDir, file).split(path.sep).join('/');
    for (const [start, end] of findGroups(masked)) {
      const lineNo = text.slice(0, start).split('\n').length;
      const id = `${source}:${lineNo}`;
      lines++;
      if (end < 0) {
        rejected.push({ id, category: 'malformed', reason: 'unclosed brace', source });
        continue;
      }
      const fields = splitTopLevel(text.slice(start + 1, end));
      let verdict;
      try {
        verdict = classify(fields);
      } catch (e) {
        verdict = { kind: 'rejected', category: 'threw', reason: `threw: ${e.message}` };
      }
      if (verdict.kind === 'kept') {
        kept.push({ id, integrand: verdict.integrand, variable: 'x', antiderivative: verdict.antiderivative, rubiSteps: verdict.steps, source, validPoints: verdict.validPoints, constantSet: verdict.constantSet });
      } else if (verdict.kind === 'unsupported') {
        unsupported.push({ id, function: verdict.functions[0], functions: verdict.functions, rubiSteps: verdict.steps, integrandMathematica: verdict.integrandM, antiderivativeMathematica: verdict.antiM, source });
      } else {
        rejected.push({ id, category: verdict.category, reason: verdict.reason, integrandMathematica: fields[0] ?? '', antiderivativeMathematica: fields[3] ?? '', source });
      }
    }
  }
  return { kept, unsupported, rejected, files: files.length, lines };
}

function parseArgs(argv) {
  const args = { suite: null, section: '1 Algebraic functions', out: path.join(REPO_ROOT, 'tests', 'engine', 'integration') };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--section') args.section = argv[++k];
    else if (a === '--out') args.out = path.resolve(argv[++k]);
    else if (!args.suite) args.suite = path.resolve(a);
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!args.suite) throw new Error('usage: node scripts/rubi/convert-tests.mjs <suite-folder> [--section NAME] [--out FOLDER]');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = convertSection(args.suite, args.section);
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'section1.json'), `${JSON.stringify(result.kept, null, 1)}\n`);
  fs.writeFileSync(path.join(args.out, 'section1-unsupported.json'), `${JSON.stringify(result.unsupported, null, 1)}\n`);
  fs.writeFileSync(path.join(args.out, 'section1-rejected.json'), `${JSON.stringify(result.rejected, null, 1)}\n`);
  const count = (list, key) => list.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
  console.log(`files ${result.files}, test lines ${result.lines}`);
  console.log(`kept ${result.kept.length}, unsupported ${result.unsupported.length}, rejected ${result.rejected.length}`);
  console.log(`rejected by category ${JSON.stringify(count(result.rejected, 'category'))}`);
  console.log(`unsupported by first function ${JSON.stringify(count(result.unsupported, 'function'))}`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) main();
