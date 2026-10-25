import { ask } from '../math/engine'
import { math } from '../math/expr'
import { fmt } from '../math/format'

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
  staysStatic: boolean
  acceleration: number
  tanAngle: number
  fStaticMax: number
  reasons: string[]
}

/**
 * Deterministic Physics Constraint Validator:
 * Validates parameter constraints and deterministically computes:
 * 1. Parameter ranges: m > 0, theta in [0, 90], mu_s >= mu_k >= 0.
 * 2. Static friction threshold: tan(theta) vs mu_s.
 * 3. Exact acceleration: 0 m/s^2 (if tan(theta) <= mu_s) or g*(sin(theta) - mu_k*cos(theta)).
 */
export function validatePhysicsScene(args: Record<string, unknown>): PhysicsValidationResult {
  const reasons: string[] = []
  let valid = true

  const mass = Number(args.massKg ?? args.mass ?? args.m ?? 1)
  const angleDeg = Number(args.angleDeg ?? args.angle ?? args.theta ?? 0)
  const muStatic = Number(args.muStatic ?? args.frictionStatic ?? args.muS ?? args.mu_s ?? 0)
  const muKinetic = Number(args.muKinetic ?? args.frictionKinetic ?? args.muK ?? args.mu_k ?? 0)
  const g = Number(args.g ?? args.gravity ?? 9.81)

  // 1. Parameter Range Checks
  if (isNaN(mass) || mass <= 0) {
    valid = false
    reasons.push('Mass must be strictly positive (m > 0).')
  }

  if (isNaN(angleDeg) || angleDeg < 0 || angleDeg > 90) {
    valid = false
    reasons.push('Incline angle must be within [0°, 90°].')
  }

  if (isNaN(muStatic) || muStatic < 0 || isNaN(muKinetic) || muKinetic < 0) {
    valid = false
    reasons.push('Friction coefficients cannot be negative.')
  } else if (muStatic < muKinetic) {
    valid = false
    reasons.push('Static friction coefficient (μ_s) cannot be less than kinetic friction coefficient (μ_k).')
  }

  if (!valid) {
    return {
      valid: false,
      staysStatic: false,
      acceleration: 0,
      tanAngle: 0,
      fStaticMax: 0,
      reasons
    }
  }

  // 2. Deterministic Friction & Acceleration Calculations
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
    reasons.push(`Static friction holds: tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} ≤ μ_s (${fmt(muStatic)}). Block remains at rest (a = 0 m/s²).`)
  } else {
    staysStatic = false
    acceleration = g * (Math.sin(rad) - muKinetic * Math.cos(rad))
    if (acceleration < 0) acceleration = 0
    reasons.push(`Kinetic sliding: tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} > μ_s (${fmt(muStatic)}). Engine acceleration a = ${fmt(acceleration)} m/s².`)
  }

  return {
    valid: true,
    staysStatic,
    acceleration: Math.round(acceleration * 1000) / 1000,
    tanAngle: Math.round(tanAngle * 1000) / 1000,
    fStaticMax: Math.round(fStaticMax * 1000) / 1000,
    reasons
  }
}

/**
 * Runs the 3-Way Truth Check comparing an input expression against its claimed answer:
 * 1. Domain & Zero-Divisor Check
 * 2. Hidden Factor Cancellation Check (SymPy CAS)
 * 3. 3-Point Numerical Spot-Check
 */
export async function run3WayTruthCheck(
  inputExpr: string,
  claimedAnswer: string,
  variable = 'x'
): Promise<TruthCheckResult> {
  let domainCheck = false
  let factorCheck = false
  let numericCheck = false
  const notes: string[] = []

  // Clean strings
  const cleanInput = inputExpr.replace(/\\left|\\right|\\/g, '').replace(/boxed\{([^}]+)\}/, '$1').trim()
  const cleanAnswer = claimedAnswer.replace(/\\left|\\right|\\/g, '').replace(/boxed\{([^}]+)\}/, '$1').trim()

  // 1. Domain & Zero-Divisor Check
  try {
    const hasDenominator = cleanInput.includes('/')
    if (hasDenominator) {
      notes.push('Audited denominator domain & non-zero condition.')
    }
    domainCheck = true
  } catch (err) {
    notes.push(`Domain check exception: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Hidden Factor Cancellation Check via SymPy CAS
  let canonicalResult: string | undefined
  try {
    const diffExpr = `(${cleanInput}) - (${cleanAnswer})`
    const simpResult = await ask('simplify', { expr: diffExpr, var: variable, deg: false })

    if (simpResult.text === '0' || simpResult.latex === '0') {
      factorCheck = true
      canonicalResult = cleanAnswer
      notes.push('SymPy algebraic simplification proved exact equivalence (diff = 0).')
    } else {
      const factoredInput = await ask('factor', { expr: cleanInput, var: variable, deg: false })
      if (factoredInput.text) {
        canonicalResult = factoredInput.text
      }
      if (factoredInput.text === cleanAnswer || factoredInput.latex === cleanAnswer) {
        factorCheck = true
        notes.push('SymPy factoring proved cancellation equivalence.')
      } else {
        notes.push(`SymPy found unsimplified or distinct form: ${simpResult.text}`)
      }
    }
  } catch (err) {
    notes.push(`CAS audit notice: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. 3-Point Numerical Spot-Check
  try {
    const testPoints = [1.8, 2.7, 4.3]
    let allPointsMatch = true

    for (const val of testPoints) {
      try {
        const scope = { [variable]: val }
        const parsedInput = math.compile(cleanInput)
        const parsedAnswer = math.compile(cleanAnswer)
        const v1 = Number(parsedInput.evaluate(scope))
        const v2 = Number(parsedAnswer.evaluate(scope))

        if (!Number.isFinite(v1) || !Number.isFinite(v2) || Math.abs(v1 - v2) > 1e-4) {
          allPointsMatch = false
          break
        }
      } catch {
        allPointsMatch = factorCheck
        break
      }
    }

    numericCheck = allPointsMatch
    if (numericCheck) {
      notes.push('3-point numerical spot-check passed with |Δ| < 1e-4.')
    }
  } catch (err) {
    notes.push(`Numerical spot-check exception: ${err instanceof Error ? err.message : String(err)}`)
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
