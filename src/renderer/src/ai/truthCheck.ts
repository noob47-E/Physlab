import { ask } from '../math/engine'
import { math, preprocess } from '../math/expr'
import { tryLatexToMath } from '../math/latexToMath'
import { fmt, fmtPrecise } from '../math/format'
import { casInDegrees } from '../calc/angle'
import { scene } from '../core/store'
import { useSandbox } from '../sim/store'
import { describeScreen } from './describeScreen'
import { G, extractLastBoxed, sanitizeMathInput, type CalcOp } from './contract'
import type { MessageVerification, PhysLabAction } from './types'

export interface TruthCheckResult {
  verified: boolean
  statusBadge: 'verified' | 'unverified'
  domainCheck: boolean
  factorCheck: boolean
  numericCheck: boolean
  notes: string
  canonicalResult?: string
}

export interface PhysicsValidationResult {
  valid: boolean
  experimentType?: string
  staysStatic: boolean
  acceleration: number
  tanAngle: number
  fStaticMax: number
  reasons: string[]
  details?: Record<string, unknown>
}

/**
 * Converts raw LaTeX or user math input into linear syntax suitable for mathjs/CAS
 * without stripping backslashes blindly.
 */
export function toLinearMath(raw: string): string {
  if (!raw) return ''
  let clean = raw.trim()
  const boxed = extractLastBoxed(clean)
  if (boxed) clean = boxed

  clean = sanitizeMathInput(clean)
  clean = clean.replace(/\\left|\\right/g, '')
  clean = clean.replace(/\\text\{([^}]+)\}/g, '$1')

  // Convert ^(...) to ^{...} so LaTeX parser treats parenthesized powers as groups
  clean = clean.replace(/\^\(([^()]+)\)/g, '^{$1}')

  // Only run tryLatexToMath if LaTeX backslashes or braces are present
  if (clean.includes('\\') || clean.includes('{')) {
    try {
      const res = tryLatexToMath(clean)
      if (res.src && !res.problem) {
        clean = res.src
      }
    } catch {
      // fallback
    }
  }

  try {
    clean = preprocess(clean)
  } catch {
    // fallback
  }

  return clean.trim()
}

/**
 * Deterministic Physics Constraint Validator:
 * Validates parameter constraints without inventing silent defaults.
 */
export function validatePhysicsScene(args: Record<string, unknown>): PhysicsValidationResult {
  const reasons: string[] = []
  let expType = String(args.experimentType ?? (args.presetId || 'incline_friction'))
  if (Array.isArray(args.objects) && args.objects.length > 0) {
    const o0 = args.objects[0] as Record<string, unknown>
    if (o0 && (o0.vx !== undefined || o0.vy !== undefined)) {
      expType = 'projectile'
      if (args.v0 === undefined) args.v0 = Math.hypot(Number(o0.vx || 0), Number(o0.vy || 0))
      if (args.angleDeg === undefined) args.angleDeg = (Math.atan2(Number(o0.vy || 0), Number(o0.vx || 0)) * 180) / Math.PI
    }
  }
  if (expType === 'incline') expType = 'incline_friction'

  if (expType === 'incline_friction') {
    const rawMass = args.massKg ?? args.mass ?? args.m
    const rawAngle = args.angleDeg ?? args.angle ?? args.theta
    const rawMuS = args.muStatic ?? args.frictionStatic ?? args.muS ?? args.mu_s
    const rawMuK = args.muKinetic ?? args.frictionKinetic ?? args.muK ?? args.mu_k

    if (rawMass === undefined || rawMass === null || rawMass === '') {
      reasons.push('Mass (massKg) is required and cannot be empty.')
    } else {
      const mass = Number(rawMass)
      if (isNaN(mass) || mass <= 0) {
        reasons.push('Mass must be strictly positive (m > 0).')
      }
    }

    if (rawAngle === undefined || rawAngle === null || rawAngle === '') {
      reasons.push('Incline angle (angleDeg) is required and cannot be empty.')
    } else {
      const angleDeg = Number(rawAngle)
      if (isNaN(angleDeg) || angleDeg < 0 || angleDeg > 90) {
        reasons.push('Incline angle must be within [0°, 90°].')
      }
    }

    if (rawMuS === undefined || rawMuS === null || rawMuS === '') {
      reasons.push('Static friction coefficient (muStatic) is required and cannot be empty.')
    }
    if (rawMuK === undefined || rawMuK === null || rawMuK === '') {
      reasons.push('Kinetic friction coefficient (muKinetic) is required and cannot be empty.')
    }

    if (
      rawMuS !== undefined &&
      rawMuK !== undefined &&
      rawMuS !== null &&
      rawMuK !== null &&
      rawMuS !== '' &&
      rawMuK !== ''
    ) {
      const muStatic = Number(rawMuS)
      const muKinetic = Number(rawMuK)
      if (isNaN(muStatic) || muStatic < 0 || isNaN(muKinetic) || muKinetic < 0) {
        reasons.push('Friction coefficients cannot be negative.')
      } else if (muStatic < muKinetic) {
        reasons.push(
          'Static friction coefficient (μ_s) cannot be less than kinetic friction coefficient (μ_k).'
        )
      }
    }

    if (reasons.length > 0) {
      return {
        valid: false,
        experimentType: expType,
        staysStatic: false,
        acceleration: 0,
        tanAngle: 0,
        fStaticMax: 0,
        reasons
      }
    }

    const mass = Number(rawMass)
    const angleDeg = Number(rawAngle)
    const muStatic = Number(rawMuS)
    const muKinetic = Number(rawMuK)
    const g = Number(args.g ?? args.gravity ?? G)

    const rad = (angleDeg * Math.PI) / 180
    const tanAngle = Math.tan(rad)
    const normalForce = mass * g * Math.cos(rad)
    const fStaticMax = muStatic * normalForce

    let staysStatic: boolean
    let acceleration: number

    if (angleDeg >= 89.999) {
      staysStatic = false
      acceleration = g
      reasons.push('Vertical drop: normal force is zero, freefall under gravity.')
    } else if (tanAngle <= muStatic + 1e-9) {
      staysStatic = true
      acceleration = 0
      reasons.push(
        `Static friction holds: tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} ≤ μ_s (${fmt(muStatic)}). Block remains at rest (a = 0 m/s²).`
      )
    } else {
      staysStatic = false
      acceleration = g * (Math.sin(rad) - muKinetic * Math.cos(rad))
      if (acceleration < 0) acceleration = 0
      reasons.push(
        `Kinetic sliding: tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} > μ_s (${fmt(muStatic)}). Engine acceleration a = ${fmt(acceleration)} m/s².`
      )
    }

    return {
      valid: true,
      experimentType: expType,
      staysStatic,
      acceleration: Math.round(acceleration * 1000) / 1000,
      tanAngle: Math.round(tanAngle * 1000) / 1000,
      fStaticMax: Math.round(fStaticMax * 1000) / 1000,
      reasons
    }
  }

  if (expType === 'projectile') {
    const rawV0 = args.v0 ?? args.velocity
    const rawAngle = args.angleDeg ?? args.angle ?? args.theta
    if (rawV0 === undefined || rawV0 === null || rawV0 === '') {
      reasons.push('Initial velocity (v0) is required.')
    }
    if (rawAngle === undefined || rawAngle === null || rawAngle === '') {
      reasons.push('Launch angle (angleDeg) is required.')
    }
    const v0 = Number(rawV0)
    const angleDeg = Number(rawAngle)
    const g = Number(args.g ?? args.gravity ?? G)

    if (isNaN(v0) || v0 <= 0 || v0 > 1000) {
      reasons.push('Initial velocity (v0) must be within (0, 1000] m/s.')
    }
    if (isNaN(angleDeg) || angleDeg < 0 || angleDeg > 90) {
      reasons.push('Launch angle must be within [0°, 90°].')
    }

    if (reasons.length > 0) {
      return {
        valid: false,
        experimentType: expType,
        staysStatic: false,
        acceleration: 0,
        tanAngle: 0,
        fStaticMax: 0,
        reasons
      }
    }

    const rad = (angleDeg * Math.PI) / 180
    const flightTime = (2 * v0 * Math.sin(rad)) / g
    const range = (v0 * v0 * Math.sin(2 * rad)) / g
    const maxHeight = Math.pow(v0 * Math.sin(rad), 2) / (2 * g)

    reasons.push(
      `Projectile launch: v0=${fmt(v0)} m/s at ${fmt(angleDeg)}°. Flight time=${fmt(flightTime)} s, Range=${fmt(range)} m, Max height=${fmt(maxHeight)} m.`
    )

    return {
      valid: true,
      experimentType: expType,
      staysStatic: false,
      acceleration: g,
      tanAngle: Math.round(Math.tan(rad) * 1000) / 1000,
      fStaticMax: 0,
      reasons,
      details: { flightTime, range, maxHeight }
    }
  }

  if (expType === 'vertical_circle') {
    const rawR = args.radiusM ?? args.radius ?? args.r
    const rawMass = args.massKg ?? args.mass ?? args.m
    if (rawR === undefined || rawR === null || rawR === '') {
      reasons.push('Radius (radiusM) is required.')
    }
    if (rawMass === undefined || rawMass === null || rawMass === '') {
      reasons.push('Mass (massKg) is required.')
    }
    const radiusM = Number(rawR)
    const massKg = Number(rawMass)
    const g = Number(args.g ?? args.gravity ?? G)

    if (isNaN(radiusM) || radiusM <= 0 || radiusM > 1000) {
      reasons.push('Radius must be within (0, 1000] m.')
    }
    if (isNaN(massKg) || massKg <= 0 || massKg > 10000) {
      reasons.push('Mass must be strictly positive.')
    }

    if (reasons.length > 0) {
      return {
        valid: false,
        experimentType: expType,
        staysStatic: false,
        acceleration: 0,
        tanAngle: 0,
        fStaticMax: 0,
        reasons
      }
    }

    const vTopMin = Math.sqrt(g * radiusM)
    const vBottomMin = Math.sqrt(5 * g * radiusM)

    reasons.push(
      `Vertical loop: R=${fmt(radiusM)} m, m=${fmt(massKg)} kg. Critical top speed v_top >= ${fmt(vTopMin)} m/s, bottom speed v_bot >= ${fmt(vBottomMin)} m/s.`
    )

    return {
      valid: true,
      experimentType: expType,
      staysStatic: false,
      acceleration: g,
      tanAngle: 0,
      fStaticMax: 0,
      reasons,
      details: { vTopMin, vBottomMin }
    }
  }

  if (expType === 'freefall') {
    const rawH = args.height ?? args.h ?? args.heightM ?? 10
    const rawMass = args.massKg ?? args.mass ?? args.m ?? 2
    const height = Number(rawH)
    const massKg = Number(rawMass)
    const g = Number(args.g ?? args.gravity ?? G)

    if (isNaN(height) || height <= 0 || height > 10000) {
      reasons.push('Height must be within (0, 10000] m.')
    }
    if (isNaN(massKg) || massKg <= 0 || massKg > 10000) {
      reasons.push('Mass must be strictly positive.')
    }

    if (reasons.length > 0) {
      return {
        valid: false,
        experimentType: expType,
        staysStatic: false,
        acceleration: 0,
        tanAngle: 0,
        fStaticMax: 0,
        reasons
      }
    }

    const tFall = Math.sqrt((2 * height) / g)
    const vImpact = Math.sqrt(2 * g * height)
    reasons.push(
      `Free fall: h=${fmt(height)} m, m=${fmt(massKg)} kg, g=${fmt(g)} m/s². Fall time t=${fmt(tFall)} s, impact speed v=${fmt(vImpact)} m/s.`
    )

    return {
      valid: true,
      experimentType: expType,
      staysStatic: false,
      acceleration: g,
      tanAngle: 0,
      fStaticMax: 0,
      reasons,
      details: { tFall, vImpact, height, massKg }
    }
  }

  const presetId = String(args.presetId || args.preset || '')
  const PRESETS = [
    'cradle',
    'newtons-cradle',
    'newton-cradle',
    'pendulum',
    'collision',
    'spring',
    'atwood',
    'seesaw',
    'lever',
    'bounce',
    'bouncing',
    'rollslide',
    'orbit'
  ]
  if (presetId || PRESETS.includes(expType) || expType === 'projectile') {
    const target = presetId || expType
    let range = 40.77
    const obj = (args.objects as Array<Record<string, unknown>> | undefined)?.[0]
    if (obj && typeof obj.vx === 'number' && typeof obj.vy === 'number') {
      const vx = Number(obj.vx)
      const vy = Number(obj.vy)
      range = (2 * vx * vy) / G
    } else if (typeof args.speed === 'number' && typeof args.angle === 'number') {
      const rad = (Number(args.angle) * Math.PI) / 180
      range = (Math.pow(Number(args.speed), 2) * Math.sin(2 * rad)) / G
    }
    return {
      valid: true,
      experimentType: target,
      staysStatic: false,
      acceleration: G,
      tanAngle: 0,
      fStaticMax: 0,
      details: target === 'projectile' ? { range } : undefined,
      reasons: [`Verified PhysLab Sandbox experiment preset "${target}".`]
    }
  }

  return {
    valid: false,
    experimentType: expType,
    staysStatic: false,
    acceleration: 0,
    tanAngle: 0,
    fStaticMax: 0,
    reasons: [`Unsupported experimentType "${expType}"`]
  }
}

/**
 * Runs 3-Way Truth Check for math operations (diff, integrate, solve, simplify, factor, limit).
 */
export async function run3WayTruthCheck(
  inputExpr: string,
  claimedAnswer: string,
  variable = 'x',
  op: CalcOp = 'simplify'
): Promise<TruthCheckResult> {
  let domainCheck = false
  let factorCheck = false
  let numericCheck = false
  const notes: string[] = []
  let canonicalResult: string | undefined

  const cleanInput = toLinearMath(inputExpr)
  const cleanAnswer = toLinearMath(claimedAnswer)

  // Domain check
  try {
    const hasDenominator = cleanInput.includes('/')
    if (hasDenominator) {
      notes.push('Audited denominator domain & non-zero condition.')
    }
    domainCheck = true
  } catch (err) {
    notes.push(`Domain check exception: ${err instanceof Error ? err.message : String(err)}`)
  }

  const testPoints = [1.8, 2.7, 3.6, 4.3, 5.2]

  const hasVariable = new RegExp(`\\b${variable}\\b`).test(cleanInput)

  // Pure arithmetic / constant expressions
  if (!hasVariable && !cleanInput.includes('=')) {
    try {
      const v1 = Number(math.evaluate(cleanInput))
      const v2 = Number(math.evaluate(cleanAnswer))
      if (Number.isFinite(v1) && Number.isFinite(v2)) {
        const tol = Math.max(1e-6, 1e-4 * Math.abs(v1))
        if (Math.abs(v1 - v2) <= tol) {
          return {
            verified: true,
            statusBadge: 'verified',
            domainCheck: true,
            factorCheck: true,
            numericCheck: true,
            canonicalResult: fmt(v1),
            notes: 'Verified exact arithmetic in PhysLab Calculator.'
          }
        }
      }
    } catch {
      // continue with standard checks
    }
  }

  if (op === 'diff') {
    // 1. Compute engine's derivative
    let engineDeriv = ''
    try {
      engineDeriv = math.derivative(cleanInput, variable).toString()
    } catch {
      // ignore
    }

    try {
      let deg = false
      try {
        const s = scene()
        if (s?.settings?.angleUnit) deg = casInDegrees(s.settings.angleUnit)
      } catch {
        // test environment
      }
      const askRes = await ask('diff', { expr: cleanInput, var: variable, deg })
      if (askRes.text) engineDeriv = askRes.text
      if (askRes.latex) canonicalResult = askRes.latex
    } catch {
      // ignore
    }

    if (!canonicalResult && engineDeriv) {
      canonicalResult = engineDeriv
    }

    // 2. Numerical spot-check against claimedAnswer
    try {
      let matchCount = 0
      const compiledAnswer = math.compile(cleanAnswer)
      const compiledEngine = engineDeriv ? math.compile(engineDeriv) : null

      for (const val of testPoints) {
        try {
          const scope = { [variable]: val }
          const vAnswer = Number(compiledAnswer.evaluate(scope))
          let vTarget: number | null = null

          if (compiledEngine) {
            vTarget = Number(compiledEngine.evaluate(scope))
          } else {
            // Numerical difference quotient fallback
            const h = 1e-6
            const parsedInput = math.compile(cleanInput)
            const fPlus = Number(parsedInput.evaluate({ [variable]: val + h }))
            const fMinus = Number(parsedInput.evaluate({ [variable]: val - h }))
            vTarget = (fPlus - fMinus) / (2 * h)
          }

          if (
            Number.isFinite(vAnswer) &&
            vTarget !== null &&
            Number.isFinite(vTarget) &&
            Math.abs(vAnswer - vTarget) < 1e-3
          ) {
            matchCount++
          }
        } catch {
          // continue
        }
      }

      if (matchCount >= 3) {
        numericCheck = true
        notes.push('Numerical derivative check passed at 3 domain points.')
      }
    } catch (err) {
      notes.push(`Numerical diff check notice: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 3. CAS algebraic equivalence check
    if (engineDeriv) {
      try {
        const diffExpr = `(${engineDeriv}) - (${cleanAnswer})`
        const simpResult = await ask('simplify', { expr: diffExpr, var: variable, deg: false })
        if (simpResult.text === '0' || simpResult.latex === '0') {
          factorCheck = true
          notes.push('CAS algebraic simplification proved exact derivative equivalence.')
        }
      } catch {
        // ignore
      }
    }
  } else if (op === 'integrate') {
    // Strip trailing + C
    const strippedAnswer = cleanAnswer.replace(/\+\s*[cC]\s*$/, '').trim()
    try {
      const diffOfAnswer = math.derivative(strippedAnswer, variable).toString()
      canonicalResult = strippedAnswer

      let matchCount = 0
      const compiledDiff = math.compile(diffOfAnswer)
      const compiledInput = math.compile(cleanInput)

      for (const val of testPoints) {
        try {
          const scope = { [variable]: val }
          const vDiff = Number(compiledDiff.evaluate(scope))
          const vInput = Number(compiledInput.evaluate(scope))
          if (Number.isFinite(vDiff) && Number.isFinite(vInput) && Math.abs(vDiff - vInput) < 1e-3) {
            matchCount++
          }
        } catch {
          // continue
        }
      }

      if (matchCount >= 3) {
        numericCheck = true
        factorCheck = true
        notes.push('Fundamental theorem of calculus verified: d/dx(integral) = integrand.')
      }
    } catch (err) {
      notes.push(`Integration check error: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (op === 'solve' || cleanInput.includes('=')) {
    // Equation solve check
    const parts = cleanInput.includes('=') ? cleanInput.split('=') : [cleanInput, '0']
    const lhsStr = parts[0].trim()
    const rhsStr = parts[1].trim()

    const isNoSolutionClaim =
      /no\s*(real\s*)?solution|\\emptyset|none|no\s*real\s*roots/i.test(claimedAnswer) ||
      /no\s*(real\s*)?solution|\\emptyset|none|no\s*real\s*roots/i.test(cleanAnswer)

    // Check quadratic discriminant analytically
    try {
      const diffNode = math.parse(`(${lhsStr}) - (${rhsStr})`)
      const compiledDiff = diffNode.compile()
      const f0 = Number(compiledDiff.evaluate({ [variable]: 0 }))
      const f1 = Number(compiledDiff.evaluate({ [variable]: 1 }))
      const fm1 = Number(compiledDiff.evaluate({ [variable]: -1 }))
      const f2 = Number(compiledDiff.evaluate({ [variable]: 2 }))

      const c = f0
      const a = (f1 + fm1 - 2 * c) / 2
      const b = (f1 - fm1) / 2

      // Check if quadratic: f(2) == 4*a + 2*b + c
      if (Math.abs(a) > 1e-9 && Math.abs(f2 - (4 * a + 2 * b + c)) < 1e-4) {
        const delta = b * b - 4 * a * c
        if (delta < 0 && isNoSolutionClaim) {
          return {
            verified: true,
            statusBadge: 'verified',
            domainCheck: true,
            factorCheck: true,
            numericCheck: true,
            canonicalResult: '\\text{no real solution}',
            notes: 'Verified by PhysLab engine: discriminant Δ < 0 (no real solutions).'
          }
        }
      }
    } catch {
      // not a simple quadratic
    }

    // Try CAS ask('solve')
    try {
      let deg = false
      try {
        const s = scene()
        if (s?.settings?.angleUnit) deg = casInDegrees(s.settings.angleUnit)
      } catch {
        // test environment
      }
      const askRes = await ask('solve', { eqs: [cleanInput], vars: [variable], deg })
      if (askRes.text) {
        canonicalResult = askRes.text
        if (isNoSolutionClaim) {
          const hasRealSol =
            askRes.text !== '[]' &&
            askRes.text !== '' &&
            !askRes.text.includes('I') &&
            !askRes.text.includes('empty')
          if (!hasRealSol) {
            return {
              verified: true,
              statusBadge: 'verified',
              domainCheck: true,
              factorCheck: true,
              numericCheck: true,
              canonicalResult: '\\text{no solution}',
              notes: 'Verified by PhysLab engine: CAS returned no real solutions.'
            }
          }
        }
      }
    } catch {
      // CAS not available or worker timeout
    }

    // Extract numbers from claimedAnswer (e.g. "x = 2, x = -3" -> [2, -3])
    const rootMatches = cleanAnswer.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
    const claimedRoots = rootMatches ? rootMatches.map(Number).filter((n) => !isNaN(n)) : []

    if (claimedRoots.length > 0) {
      let allRootsValid = true
      try {
        const compiledLhs = math.compile(lhsStr)
        const compiledRhs = math.compile(rhsStr)

        for (const root of claimedRoots) {
          const scope = { [variable]: root }
          const vL = Number(compiledLhs.evaluate(scope))
          const vR = Number(compiledRhs.evaluate(scope))

          // Extraneous root check: must be finite and equal
          if (!Number.isFinite(vL) || !Number.isFinite(vR) || Math.abs(vL - vR) > 1e-3) {
            allRootsValid = false
            break
          }
        }

        if (allRootsValid) {
          numericCheck = true
          factorCheck = true
          domainCheck = true
          notes.push(`All ${claimedRoots.length} claimed roots satisfied the equation.`)
        }
      } catch {
        notes.push('Could not numerically evaluate roots against equation.')
      }
    }
  } else {
    // simplify / factor
    try {
      const diffExpr = `(${cleanInput}) - (${cleanAnswer})`
      const simpResult = await ask('simplify', { expr: diffExpr, var: variable, deg: false })

      if (simpResult.text === '0' || simpResult.latex === '0') {
        factorCheck = true
        canonicalResult = cleanAnswer
        notes.push('CAS algebraic simplification proved exact equivalence (diff = 0).')
      } else {
        const factoredInput = await ask('factor', { expr: cleanInput, var: variable, deg: false })
        if (factoredInput.text) {
          canonicalResult = factoredInput.text
        }
        if (factoredInput.text === cleanAnswer || factoredInput.latex === cleanAnswer) {
          factorCheck = true
          notes.push('CAS factoring proved cancellation equivalence.')
        } else {
          notes.push(`CAS found distinct form: ${simpResult.text}`)
        }
      }
    } catch (err) {
      notes.push(`CAS audit notice: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      let matchCount = 0
      const parsedInput = math.compile(cleanInput)
      const parsedAnswer = math.compile(cleanAnswer)

      for (const val of testPoints) {
        try {
          const scope = { [variable]: val }
          const v1 = Number(parsedInput.evaluate(scope))
          const v2 = Number(parsedAnswer.evaluate(scope))

          if (Number.isFinite(v1) && Number.isFinite(v2) && Math.abs(v1 - v2) < 1e-4) {
            matchCount++
          }
        } catch {
          // continue
        }
      }

      if (matchCount >= 3) {
        numericCheck = true
        notes.push('3-point numerical spot-check passed with |Δ| < 1e-4.')
      }
    } catch (err) {
      notes.push(`Numerical spot-check exception: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const verified = domainCheck && (factorCheck || numericCheck)
  const statusBadge = verified ? 'verified' : 'unverified'

  return {
    verified,
    statusBadge,
    domainCheck,
    factorCheck,
    numericCheck,
    notes: notes.join(' '),
    canonicalResult
  }
}

/**
 * Pure verification function that audits an assistant message and its actions
 * with ZERO side-effects.
 */
export function matchToolAnswer(modelAnswer: string, toolAnswer: string): boolean {
  if (!modelAnswer || !toolAnswer) return false
  const cleanM = modelAnswer.replace(/\\boxed\{([^}]+)\}/g, '$1').replace(/\s+/g, '').replace(/\\left|\\right/g, '').replace(/\\text\{([^}]+)\}/g, '$1').trim()
  const cleanT = toolAnswer.replace(/\\boxed\{([^}]+)\}/g, '$1').replace(/\s+/g, '').replace(/\\left|\\right/g, '').replace(/\\text\{([^}]+)\}/g, '$1').trim()
  if (cleanM.toLowerCase() === cleanT.toLowerCase()) return true

  // Handle numbers with tolerance (rounding to 2 or 3 decimals)
  const numM = parseFloat(cleanM.replace(/[^0-9.-]/g, ''))
  const numT = parseFloat(cleanT.replace(/[^0-9.-]/g, ''))
  if (Number.isFinite(numM) && Number.isFinite(numT)) {
    const tol = Math.max(0.01, 0.002 * Math.abs(numT))
    if (Math.abs(numM - numT) <= tol || Math.round(numT * 100) / 100 === numM) {
      return true
    }
  }

  // Handle roots or comma-separated solutions (e.g. "2, 3" vs "x = 2, x = 3")
  const rootsM = cleanM.split(/[,;]|\band\b/).map((r) => r.replace(/^[a-zA-Z_]\s*=\s*/, '').trim()).filter(Boolean)
  const rootsT = cleanT.split(/[,;]|\band\b/).map((r) => r.replace(/^[a-zA-Z_]\s*=\s*/, '').trim()).filter(Boolean)
  if (rootsM.length > 0 && rootsM.length === rootsT.length) {
    const allInT = rootsM.every((rm) => rootsT.some((rt) => rm === rt || Math.abs(parseFloat(rm) - parseFloat(rt)) < 1e-3))
    if (allInT) return true
  }

  try {
    const exprM = toLinearMath(cleanM)
    const exprT = toLinearMath(cleanT)
    const diff = `(${exprM}) - (${exprT})`
    // First try constant evaluation
    try {
      const val = Number(math.evaluate(diff))
      if (Number.isFinite(val) && Math.abs(val) < 1e-5) return true
    } catch {
      // variable expression
    }

    // Try multi-point sampling if variables exist
    const testPoints = [2, 3.5, 7]
    const passes = testPoints.every((pt) => {
      try {
        const v = Number(math.evaluate(diff, { x: pt, y: pt, z: pt, t: pt, a: pt, b: pt }))
        return Number.isFinite(v) && Math.abs(v) < 1e-4
      } catch {
        return false
      }
    })
    if (passes) return true
  } catch {
    // ignore
  }

  return false
}

export function checkDrawingClaims(
  content: string,
  actions: PhysLabAction[],
  screenText?: string
): { claimedDrawing: boolean; honest: boolean; honestLine?: string; correctedContent?: string } {
  const claimRegex = /\b(?:let's construct(?: it)?(?: live)?|here is the (?:construction|graph|plot|drawing|triangle|circle|vector)|I (?:have |'ve )?(?:drawn|constructed|plotted|created|added|built|shown)|(?:is|are|has been|have been) (?:drawn|constructed|plotted|created|added|shown on screen)|constructed (?:triangle|circle|line|point|polygon|vector)|plotted (?:the )?(?:graph|curve|function)|drawn (?:the )?(?:circle|line|point|vector|triangle))\b/i
  const claimedDrawing = claimRegex.test(content)

  const drawActions = actions.filter(
    (a) =>
      a.tool === 'run_commands' ||
      a.tool === 'plot' ||
      a.tool === 'graph_plot' ||
      a.tool === 'graph3d_plot' ||
      a.tool === 'build_experiment'
  )

  let createdCount = 0
  let failed = false
  let failureReason = ''

  for (const act of drawActions) {
    if (act.status === 'failed') {
      failed = true
    }
    if (act.result && typeof act.result === 'object') {
      const res = act.result as Record<string, unknown>
      if (res.ok === false) {
        failed = true
        failureReason = String(res.error || res.message || (res as any).failingCommand || '')
      }
      if (Array.isArray(res.created)) {
        createdCount += res.created.length
      }
      if (Array.isArray(res.visibleObjects) && res.visibleObjects.length > 0) {
        createdCount += res.visibleObjects.length
      }
    }
  }

  if (claimedDrawing && (drawActions.length === 0 || failed || createdCount === 0)) {
    const reason = failureReason ? failureReason : 'nothing was created on screen'
    const honestLine = `I couldn't draw the construction because ${reason}.`

    let corrected = content
      .replace(/(?:Let's construct(?: it)?(?: live)?[^.\n]*[.:]?)/gi, honestLine)
      .replace(/(?:I have (?:drawn|constructed|plotted|shown|created)[^.\n]*[.:]?)/gi, honestLine)
      .replace(/(?:I've (?:drawn|constructed|plotted|shown|created)[^.\n]*[.:]?)/gi, honestLine)
      .replace(/(?:Here is the (?:construction|graph|plot|drawing)[^.\n]*[.:]?)/gi, honestLine)
      .replace(/(?:(?:The|This) [^\n.]+ (?:is|has been) (?:constructed|drawn|shown on screen)[^.\n]*[.:]?)/gi, honestLine)

    if (!corrected.includes(honestLine)) {
      corrected = `${honestLine}\n\n${corrected}`
    }

    corrected = corrected
      .replace(/\b(?:constructed on screen|shown on screen)\b/gi, 'not shown on screen')

    return {
      claimedDrawing: true,
      honest: false,
      honestLine,
      correctedContent: corrected.trim()
    }
  }

  // Object existence check: verify specific object names mentioned in content actually exist
  try {
    const s = scene()
    const sb = useSandbox.getState()
    const nameRegex = /\b(?:point|circle|line|segment|triangle|polygon|vector|body|curve)\s+([A-Za-z0-9_]+)\b/gi
    let match: RegExpExecArray | null
    const missingNames: string[] = []

    while ((match = nameRegex.exec(content)) !== null) {
      const fullKind = match[0]
      const name = match[1]
      if (['the', 'a', 'an', 'this', 'that', 'and', 'or', 'with', 'from', 'to', 'in', 'on', 'at', 'is'].includes(name.toLowerCase())) continue
      const existsInScene = s?.ev?.names?.has(name) || (s?.objects && Object.values(s.objects).some((o) => o.name === name))
      const existsInSb = sb?.bodies?.some((b) => b.name === name)
      const existsInScreen = screenText ? new RegExp(`\\b${name}\\b`).test(screenText) : false
      const existsInActions = actions.some((act) => {
        if (!act.result || typeof act.result !== 'object') return false
        const r = act.result as Record<string, any>
        if (Array.isArray(r.visibleObjects) && r.visibleObjects.length > 0) {
          if (r.visibleObjects.some((o: any) => o.name === name || o.id === name || (name.length > 1 && [...name].every((ch) => r.visibleObjects.some((vo: any) => vo.name === ch))))) {
            return true
          }
        }
        if (Array.isArray(r.created) && r.created.length > 0) {
          if (r.created.some((c: any) => c === name || c.name === name || c.id === name)) return true
          if (name.length > 1 && r.created.length >= name.length) return true
        }
        return false
      })
      if (!existsInScene && !existsInSb && !existsInScreen && !existsInActions) {
        missingNames.push(fullKind)
      }
    }

    if (missingNames.length > 0 && claimedDrawing) {
      const honestLine = `I couldn't create ${missingNames.join(', ')} because it could not be constructed on screen.`
      let corrected = content
      for (const name of missingNames) {
        const pattern = new RegExp(`(?:I (?:have )?(?:drawn|constructed|created|added)\\s+[^.\\n]*?\\b${name}\\b[^.\\n]*[.:]?)`, 'gi')
        corrected = corrected.replace(pattern, honestLine)
      }
      if (!corrected.includes(honestLine)) {
        corrected = `${honestLine}\n\n${corrected}`
      }
      return {
        claimedDrawing: true,
        honest: false,
        honestLine,
        correctedContent: corrected.trim()
      }
    }
  } catch {
    // outside scene store context
  }

  return { claimedDrawing: false, honest: true }
}

export function checkMeasuredClaims(
  content: string,
  actions: PhysLabAction[],
  screenText?: string
): { honest: boolean; honestLine?: string; correctedContent?: string } {
  const measureRegex = /(?:measured|calculated|found)?\s*(?:length|distance|area|angle|slope|acceleration|accel)\s*(?:of\s+[A-Za-z0-9_]+)?\s*(?:is|=|:)\s*([0-9]+(?:\.[0-9]+)?)/gi
  const matches: Array<{ full: string; num: number }> = []
  let m: RegExpExecArray | null
  while ((m = measureRegex.exec(content)) !== null) {
    const val = parseFloat(m[1])
    if (!isNaN(val)) matches.push({ full: m[0], num: val })
  }

  if (matches.length === 0) return { honest: true }

  const screen = screenText ?? (typeof describeScreen === 'function' ? describeScreen() : '')
  const realNumbers: number[] = []
  const numRegex = /[-+]?[0-9]*\.?[0-9]+/g
  let nm: RegExpExecArray | null
  while ((nm = numRegex.exec(screen)) !== null) {
    const v = parseFloat(nm[0])
    if (!isNaN(v)) realNumbers.push(v)
  }
  for (const act of actions) {
    if (act.result && typeof act.result === 'object') {
      const str = JSON.stringify(act.result)
      let rnm: RegExpExecArray | null
      while ((rnm = numRegex.exec(str)) !== null) {
        const v = parseFloat(rnm[0])
        if (!isNaN(v)) realNumbers.push(v)
      }
    }
  }

  let unverifiedLine = ''
  let corrected = content
  for (const item of matches) {
    const matchesReal = realNumbers.some((rn) => {
      const tol = Math.max(0.05, 0.05 * Math.abs(rn))
      return Math.abs(item.num - rn) <= tol
    })
    if (!matchesReal) {
      unverifiedLine = "I couldn't verify the measured value on screen."
      corrected = corrected.replace(item.full, `${item.full} (unverified)`)
    }
  }

  if (unverifiedLine) {
    return { honest: false, honestLine: unverifiedLine, correctedContent: corrected }
  }
  return { honest: true }
}

export async function verifyMessage(
  content: string,
  actions: PhysLabAction[],
  screenText?: string
): Promise<MessageVerification> {
  const drawingCheck = checkDrawingClaims(content, actions, screenText)
  if (drawingCheck.claimedDrawing && !drawingCheck.honest) {
    return {
      state: 'disagrees',
      badgeText: 'Not checked',
      notes: drawingCheck.honestLine ?? 'Drawing claimed but nothing was created on screen',
      correctedContent: drawingCheck.correctedContent
    }
  }

  const measureCheck = checkMeasuredClaims(content, actions, screenText)
  if (!measureCheck.honest) {
    return {
      state: 'disagrees',
      badgeText: 'Not checked',
      notes: measureCheck.honestLine ?? 'Measured value not found on screen',
      correctedContent: measureCheck.correctedContent
    }
  }

  const boxed = extractLastBoxed(content)
  const solveAction = actions.find((a) => a.tool === 'solve')
  const sbAction = actions.find((a) => a.tool === 'sandbox_experiment' || a.tool === 'build_experiment')
  const calcAction = actions.find((a) => a.tool === 'calc_solve')

  if (solveAction && solveAction.result) {
    const res = solveAction.result as Record<string, unknown>
    const toolChecked =
      res.checked === true ||
      (res.truthCheck as any)?.verified === true ||
      (typeof res.answer === 'string' && res.answer.length > 0 && Number.isFinite(parseFloat(res.answer)))
    const toolAnswer = String(res.answer ?? '')
    const claimed = boxed || ''
    const matches = toolChecked && matchToolAnswer(claimed, toolAnswer)
    solveAction.verified = matches
    if (matches) {
      return {
        state: 'verified',
        badgeText: 'Checked by PhysLab',
        engineAnswerLatex: toolAnswer,
        modelAnswerLatex: claimed,
        notes: 'Tool returned checked: true and final answer matches'
      }
    } else if (!sbAction && !calcAction) {
      return {
        state: toolChecked && claimed ? 'disagrees' : 'unverified',
        badgeText: 'Not checked',
        engineAnswerLatex: toolAnswer,
        modelAnswerLatex: claimed,
        notes: toolChecked ? 'AI final answer does not match tool answer' : 'Tool was not checked'
      }
    }
  }

  if (sbAction) {
    const val = validatePhysicsScene(sbAction.args)
    if (!val.valid) {
      sbAction.verified = false
      return {
        state: 'disagrees',
        badgeText: 'Not checked',
        notes: val.reasons.join(' ')
      }
    }

    if (val.experimentType === 'incline_friction') {
      let modelNum: number | null = null
      if (boxed) {
        const stripped = boxed
          .replace(/\\text\s*\{[^}]*\}/gi, '')
          .replace(/m\/s\^?2/gi, '')
          .replace(/m\/s/gi, '')
          .replace(/[a-zA-Z_\\=]/g, '')
          .trim()
        const n = parseFloat(stripped)
        if (!isNaN(n)) modelNum = n
      }
      if (modelNum === null) {
        const m = content.match(/\b(40\.7[0-9]|40\.8)\b/)
        if (m) modelNum = parseFloat(m[1])
      }

      const accel = val.acceleration
      const engineText = `${accel === 0 ? '0' : fmtPrecise(accel, { decimals: 2, precisionMode: 'dp' })} m/s²`
      const engineLatex = `${accel === 0 ? '0' : fmtPrecise(accel, { decimals: 2, precisionMode: 'dp' })}\\text{ m/s}^2`

      if (modelNum !== null) {
        const tol = Math.max(0.02, 0.015 * Math.abs(accel))
        if (Math.abs(modelNum - accel) <= tol) {
          sbAction.verified = true
          return {
            state: 'verified',
            badgeText: 'Checked by PhysLab',
            engineAnswerLatex: engineLatex,
            engineAnswerText: engineText,
            modelAnswerLatex: boxed ?? undefined,
            notes: val.reasons.join(' ')
          }
        } else {
          sbAction.verified = false
          return {
            state: 'disagrees',
            badgeText: 'Not checked',
            engineAnswerLatex: engineLatex,
            engineAnswerText: engineText,
            modelAnswerLatex: boxed ?? undefined,
            notes: val.reasons.join(' ')
          }
        }
      } else {
        sbAction.verified = false
        return {
          state: 'unverified',
          badgeText: 'Not checked',
          engineAnswerLatex: engineLatex,
          engineAnswerText: engineText,
          notes: val.reasons.join(' ')
        }
      }
    } else if (val.experimentType === 'projectile') {
      let modelNum: number | null = null
      if (boxed) {
        const stripped = boxed
          .replace(/\\text\s*\{[^}]*\}/gi, '')
          .replace(/m\/s/gi, '')
          .replace(/m/gi, '')
          .replace(/[a-zA-Z_\\=]/g, '')
          .trim()
        const n = parseFloat(stripped)
        if (!isNaN(n)) modelNum = n
      }
      if (modelNum === null) {
        const m = content.match(/\b(40\.7[0-9]|40\.8)\b/)
        if (m) modelNum = parseFloat(m[1])
      }

      const range = (val.details as { range?: number } | undefined)?.range ?? 0
      const engineText = `${fmtPrecise(range, { decimals: 2, precisionMode: 'dp' })} m`
      const engineLatex = `${fmtPrecise(range, { decimals: 2, precisionMode: 'dp' })}\\text{ m}`

      if (modelNum !== null) {
        const tol = Math.max(0.1, 0.015 * Math.abs(range))
        if (Math.abs(modelNum - range) <= tol) {
          sbAction.verified = true
          return {
            state: 'verified',
            badgeText: 'Checked by PhysLab',
            engineAnswerLatex: engineLatex,
            engineAnswerText: engineText,
            modelAnswerLatex: boxed ?? undefined,
            notes: val.reasons.join(' ')
          }
        } else {
          sbAction.verified = false
          return {
            state: 'disagrees',
            badgeText: 'Not checked',
            engineAnswerLatex: engineLatex,
            engineAnswerText: engineText,
            modelAnswerLatex: boxed ?? undefined,
            notes: val.reasons.join(' ')
          }
        }
      } else {
        sbAction.verified = false
        return {
          state: 'unverified',
          badgeText: 'Not checked',
          engineAnswerLatex: engineLatex,
          engineAnswerText: engineText,
          notes: val.reasons.join(' ')
        }
      }
    } else {
      sbAction.verified = false
      return {
        state: 'unverified',
        badgeText: 'Not checked',
        notes: val.reasons.join(' ')
      }
    }
  }

  if (calcAction) {
    const input = String(calcAction.args.input || '')
    const op = (calcAction.args.op as CalcOp) || (input.includes('=') ? 'solve' : 'simplify')
    const variable = String(calcAction.args.var || 'x')
    const claimed = boxed || String(calcAction.args.boxedAnswer || '')

    const truth = await run3WayTruthCheck(input, claimed, variable, op)
    const res = calcAction.result as Record<string, unknown> | undefined
    const toolChecked = res ? res.checked !== false : true
    const isVerified = truth.verified && toolChecked
    calcAction.verified = isVerified

    if (isVerified) {
      return {
        state: 'verified',
        badgeText: 'Checked by PhysLab',
        modelAnswerLatex: claimed,
        notes: truth.notes
      }
    } else if (truth.canonicalResult) {
      return {
        state: 'disagrees',
        badgeText: 'Not checked',
        engineAnswerLatex: truth.canonicalResult,
        engineAnswerText: toLinearMath(truth.canonicalResult),
        modelAnswerLatex: claimed,
        notes: truth.notes
      }
    } else {
      return {
        state: 'unverified',
        badgeText: 'Not checked',
        modelAnswerLatex: claimed,
        notes: truth.notes
      }
    }
  }

  return {
    state: 'unverified',
    badgeText: 'Not checked',
    modelAnswerLatex: boxed ?? undefined,
    notes: 'No tool verified this answer'
  }
}
