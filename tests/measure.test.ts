import { expect, test } from 'vitest'
import {
  crossings,
  periodic,
  flight,
  peaks,
  stopDistance,
  pathLength,
  centralAcceleration,
  bounces,
  ruler,
  angleAt
} from '../src/renderer/src/sim/measure'

test('exports are defined', () => {
  expect(crossings).toBeDefined()
  expect(periodic).toBeDefined()
  expect(flight).toBeDefined()
  expect(peaks).toBeDefined()
  expect(stopDistance).toBeDefined()
  expect(pathLength).toBeDefined()
  expect(centralAcceleration).toBeDefined()
  expect(bounces).toBeDefined()
  expect(ruler).toBeDefined()
  expect(angleAt).toBeDefined()
})

test('periodic', () => {
  // x = 0.3 sin(2πt / 1.2345) sampled 60 times a second for 10 s
  const t: number[] = []
  const x: number[] = []
  for (let i = 0; i <= 600; i++) {
    const time = i / 60
    t.push(time)
    x.push(0.3 * Math.sin((2 * Math.PI * time) / 1.2345))
  }

  const result = periodic(t, x)
  expect(result).not.toBeNull()
  if (result) {
    // period 1.2345 s within 0.1 %
    expect(Math.abs(result.period - 1.2345) / 1.2345).toBeLessThanOrEqual(0.001)
    // amplitude 0.3 within 0.5 %
    expect(Math.abs(result.amplitude - 0.3) / 0.3).toBeLessThanOrEqual(0.005)
  }
})

test('flight', () => {
  // vacuum flight of 14 m/s at 30° from (0, 0), sampled every 1/240 s
  // x = 14 cos30° t, y = 14 sin30° t − 0.5 * 9.81 t²
  const t: number[] = []
  const x: number[] = []
  const y: number[] = []

  const cos30 = Math.cos(Math.PI / 6)
  const sin30 = Math.sin(Math.PI / 6)

  // simulate until a bit past the landing
  for (let i = 0; i < 400; i++) {
    const time = i / 240
    t.push(time)
    x.push(14 * cos30 * time)
    y.push(14 * sin30 * time - 0.5 * 9.81 * time * time)
  }

  const result = flight(t, x, y, 0)
  expect(result).not.toBeNull()

  if (result) {
    // range 17.303 m within 1 cm
    expect(Math.abs(result.range - 17.303)).toBeLessThanOrEqual(0.01)
    // maxHeight 2.4975 m within 2 mm
    expect(Math.abs(result.maxHeight - 2.4975)).toBeLessThanOrEqual(0.002)
    // flightTime 1.4271 s within 1/240 s
    expect(Math.abs(result.flightTime - 1.4271)).toBeLessThanOrEqual(1 / 240)
  }
})

test('peaks', () => {
  // bouncing ball dropped from 3 m with e = 0.8
  // build y piecewise from the parabolas between bounces, g = 9.81
  const t: number[] = []
  const y: number[] = []
  const g = 9.81
  const e = 0.8
  const dt = 1 / 60

  const maxBounces = 3

  // precalculate bounce times analytically for precision? No, just run the simulation.
  // Actually, wait, exact formula requested:
  // "build y piecewise from the parabolas between bounces"
  const bouncesData = []
  const h = 3
  const dropTime = Math.sqrt((2 * h) / g)
  let tStart = 0
  let tEnd = dropTime
  bouncesData.push({ tStart, tEnd, v0: 0, h0: 3 })

  let currentV = Math.sqrt(2 * g * h) * e // upward speed after first bounce
  tStart = dropTime

  for (let i = 0; i < maxBounces; i++) {
    const tFlight = (2 * currentV) / g
    tEnd = tStart + tFlight
    bouncesData.push({ tStart, tEnd, v0: currentV, h0: 0 })

    currentV = currentV * e
    tStart = tEnd
  }

  for (let i = 0; i < tEnd * 60 + 5; i++) {
    const time = i * dt
    t.push(time)
    
    let bounce = bouncesData[0]
    for (const b of bouncesData) {
      if (time >= b.tStart && time <= b.tEnd) {
        bounce = b
        break
      }
    }
    const tLocal = time - bounce.tStart
    const yVal = bounce.h0 + bounce.v0 * tLocal - 0.5 * g * tLocal * tLocal
    y.push(Math.max(0, yVal))
  }

  const result = peaks(t, y)
  // tops 1.92, 1.2288, 0.7864 m within 1 mm
  
  // Actually, we expect the peaks to match the bounce peaks:
  // The first peak is the start point but `peaks` only finds local maxima (needs points on both sides)
  const foundTops = result.map(p => p.y).filter(yVal => yVal > 0.1) // filter out small noise

  // Check the first 3 bounce peaks
  expect(Math.abs(foundTops[0] - 1.92)).toBeLessThanOrEqual(0.001)
  expect(Math.abs(foundTops[1] - 1.2288)).toBeLessThanOrEqual(0.001)
  expect(Math.abs(foundTops[2] - 0.7864)).toBeLessThanOrEqual(0.001)
})

test('stopDistance', () => {
  // block sliding from 6 m/s with a = −0.4 × 9.81 m/s²
  const t: number[] = []
  const x: number[] = []
  const v: number[] = []
  const v0 = 6
  const a = -0.4 * 9.81
  const exactStopTime = -v0 / a

  // use a finer time step (0.001) or 0.005 to meet the 1e-3 time tolerance requirement of the exact stop time
  for (let i = 0; i < 2000; i++) {
    const time = i * 0.005
    t.push(time)
    if (time <= exactStopTime) {
      x.push(v0 * time + 0.5 * a * time * time)
      v.push(v0 + a * time)
    } else {
      x.push(v0 * exactStopTime + 0.5 * a * exactStopTime * exactStopTime)
      v.push(0)
    }
  }

  const result = stopDistance(t, x, v) 
  expect(result).not.toBeNull()

  if (result) {
    // stopDistance gives 4.587 m within 1 cm
    expect(Math.abs(result.distance - 4.587)).toBeLessThanOrEqual(0.01)
    
    // The stopDistance test asserts result.time against the exact stop time it already computes, within 1e-3 s
    expect(Math.abs(result.time - exactStopTime)).toBeLessThanOrEqual(1e-3)
  }

  // SECOND TRY specific test
  // stopDistance([5, 6], [0, 1], [1, 0]) gives a time of 1 s (not 6)
  const result2 = stopDistance([5, 6], [0, 1], [1, 0], 0) // zero tolerance for this exact hit
  expect(result2?.time).toBe(1)
  expect(result2?.distance).toBe(1)
})

test('crossings', () => {
  // crossings of y = t² − 1 at level 0, direction 'up', sampled every 0.01 s from t = 0 to 2: [1] within 10⁻⁹
  const t: number[] = []
  const y: number[] = []
  for (let i = 0; i <= 200; i++) {
    const time = i * 0.01
    t.push(time)
    y.push(time * time - 1)
  }

  const result = crossings(t, y, 0, 'up')
  expect(result.length).toBe(1)
  expect(Math.abs(result[0] - 1)).toBeLessThanOrEqual(1e-9)
})

test('centralAcceleration', () => {
  // centralAcceleration of v = 9.81 t is 9.81 within 10⁻⁹
  const t: number[] = []
  const v: number[] = []
  for (let i = 0; i < 10; i++) {
    t.push(i)
    v.push(9.81 * i)
  }
  
  const result = centralAcceleration(t, v, 5)
  expect(result).not.toBeNull()
  if (result !== null) {
    expect(Math.abs(result - 9.81)).toBeLessThanOrEqual(1e-9)
  }
})

test('bounces', () => {
  // bounces on a synthetic vy series with e = 0.8 gives e = 0.8 within 10⁻⁹
  const t = [0, 1, 2]
  const vy = [-10, 8, 8] // vIn = 10, vOut = 8
  const result = bounces(t, vy)
  
  expect(result.length).toBe(1)
  expect(Math.abs(result[0].e - 0.8)).toBeLessThanOrEqual(1e-9)
})

test('ruler', () => {
  // ruler from (0,0,0) to (3,4,0) is 5
  expect(ruler([0, 0, 0], [3, 4, 0])).toBe(5)
})

test('angleAt', () => {
  // angleAt of (1,0,0), (0,0,0), (0,1,0) is 90
  expect(angleAt([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBe(90)
})

test('pathLength', () => {
  // pathLength is tested with a multi-point path too: pathLength([0, 3], [0, 4]) equals 5
  expect(pathLength([0, 3], [0, 4])).toBe(5)
  
  // multi-point path
  expect(pathLength([0, 3, 3], [0, 4, 4])).toBe(5)
})

test('empty and single sample inputs', () => {
  // empty and one-sample inputs return null or [] without throwing
  expect(crossings([], [], 0, 'any')).toEqual([])
  expect(crossings([1], [1], 0, 'any')).toEqual([])
  
  expect(periodic([], [])).toBeNull()
  expect(periodic([1], [1])).toBeNull()
  
  expect(flight([], [], [], 0)).toBeNull()
  expect(flight([1], [1], [1], 0)).toBeNull()
  
  expect(peaks([], [])).toEqual([])
  expect(peaks([1], [1])).toEqual([])
  
  expect(stopDistance([], [], [])).toBeNull()
  // stopDistance with one item that's stopped
  expect(stopDistance([1], [1], [0])).toEqual({ distance: 0, time: 0 })
  // stopDistance with one item not stopped -> null because it doesn't fall below vStop
  expect(stopDistance([1], [1], [1])).toBeNull()
  
  expect(pathLength([], [])).toBe(0)
  expect(pathLength([1], [1])).toBe(0)
  
  expect(centralAcceleration([], [], 0)).toBeNull()
  expect(centralAcceleration([1], [1], 0)).toBeNull()
  
  expect(bounces([], [])).toEqual([])
  expect(bounces([1], [1])).toEqual([])
})
