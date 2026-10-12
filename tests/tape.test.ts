import { describe, it, expect, vi } from 'vitest'
import { Tape, REC_FLOATS, WORK_FLOATS, blendRecord, bytesPerSecond, RecordLayout, TapeKeyframe } from '../src/renderer/src/sim/tape'

describe('Tape', () => {
  // Use exports to avoid dead code warnings
  it('exports types correctly', () => {
    const l: RecordLayout = { bodies: [], ropes: [] }
    expect(l).toBeDefined()
    const k: TapeKeyframe<number> = { step: 0, key: 0 }
    expect(k).toBeDefined()
  })

  const layout = {
    bodies: ['b1', 'b2'],
    ropes: []
  }

  it('push 3 seconds at rate 240 for 2 bodies', () => {
    const tape = new Tape(layout, 240, 0, 0)
    expect(tape.bodyCount).toBe(2)
    
    // push 3 seconds: 720 frames
    const rec = new Float32Array(REC_FLOATS * 2)
    for (let step = 0; step < 720; step++) {
      rec[0] = step // store step in pos.x of body 1 to check later
      tape.push(step, rec)
    }
    
    expect(tape.first).toBe(0)
    expect(tape.last).toBe(719)
    expect(tape.timeOf(24)).toBeCloseTo(0.1, 6)
    expect(tape.timeOf(720)).toBe(3)
    
    const view24 = tape.record(24)
    expect(view24).not.toBeNull()
    expect(view24![0]).toBe(24)
    
    const viewLast = tape.record(719)
    expect(viewLast).not.toBeNull()
    expect(viewLast![0]).toBe(719)
    
    // out of bounds
    expect(tape.record(720)).toBeNull()
    expect(tape.record(-1)).toBeNull()
  })

  it('record() returns views', () => {
    const tape = new Tape(layout, 10, 0, 0)
    const rec = new Float32Array(REC_FLOATS * 2)
    rec[0] = 42
    tape.push(0, rec)
    
    // view shares the chunk buffer
    const view = tape.record(0)
    expect(view![0]).toBe(42)
    
    // changing source array does not change tape
    rec[0] = 99
    expect(view![0]).toBe(42)
  })

  it('throws on gap or repeated step', () => {
    const tape = new Tape(layout, 10, 0, 0)
    const rec = new Float32Array(REC_FLOATS * 2)
    
    tape.push(10, rec) // first push can be any step
    
    // repeat
    expect(() => tape.push(10, rec)).toThrow(/consecutive/)
    
    // gap
    expect(() => tape.push(12, rec)).toThrow(/consecutive/)
  })

  it('throws on wrong rec or work length', () => {
    const tape = new Tape(layout, 10, 0, 0)
    const wrongRec = new Float32Array(REC_FLOATS * 2 - 1)
    expect(() => tape.push(0, wrongRec)).toThrow(/length/)
    
    const rightRec = new Float32Array(REC_FLOATS * 2)
    const wrongWork = new Float32Array(WORK_FLOATS + 1)
    expect(() => tape.push(0, rightRec, wrongWork)).toThrow(/length/)
  })

  it('drops chunks on capBytes exceeded', () => {
    // 1 chunk (240 steps, 2 bodies): 240 * (13 * 2 * 4 + 5 * 4) bytes = 240 * (104 + 20) = 29760 bytes per chunk
    // 2 chunks max => cap around 60000 so 2 chunks (59520) fit, but 3 (89280) exceed.
    const tape = new Tape<{ id: string }>(layout, 240, 0, 0, 60000)
    
    const free = vi.fn()
    const rec = new Float32Array(REC_FLOATS * 2)
    
    // Add keyframes
    tape.addKeyframe(10, { id: 'k10' })
    tape.addKeyframe(300, { id: 'k300' }) // will stay
    
    for (let step = 0; step < 720; step++) {
      tape.push(step, rec)
      if (tape.bytes > tape.capBytes) {
        tape.dropOldestChunk(free)
      }
    }
    
    expect(tape.trimmedSeconds()).toBe(1)
    expect(tape.first).toBe(240)
    expect(tape.last).toBe(719)
    
    expect(free).toHaveBeenCalledTimes(1)
    expect(free).toHaveBeenCalledWith({ id: 'k10' })
  })

  it('keyframes: exact, between, before first', () => {
    const tape = new Tape<string>(layout, 10, 0, 0)
    tape.addKeyframe(5, 'k5')
    tape.addKeyframe(10, 'k10')
    tape.addKeyframe(15, 'k15')
    
    expect(tape.keyframeAtOrBefore(10)).toEqual({ step: 10, key: 'k10' })
    expect(tape.keyframeAtOrBefore(12)).toEqual({ step: 10, key: 'k10' })
    expect(tape.keyframeAtOrBefore(4)).toBeNull()
    expect(tape.keyframeSteps()).toEqual([5, 10, 15])
  })

  it('truncateAfter frees later keyframes and sets tape to continue', () => {
    const tape = new Tape<string>(layout, 10, 0, 0)
    const rec = new Float32Array(REC_FLOATS * 2)
    
    for (let step = 0; step < 20; step++) {
      tape.push(step, rec)
    }
    
    tape.addKeyframe(5, 'k5')
    tape.addKeyframe(15, 'k15')
    
    const free = vi.fn()
    tape.truncateAfter(10, free)
    
    expect(free).toHaveBeenCalledTimes(1)
    expect(free).toHaveBeenCalledWith('k15')
    
    expect(tape.last).toBe(10)
    expect(tape.keyframeSteps()).toEqual([5])
    
    // push should continue at step 11
    tape.push(11, rec)
    expect(tape.last).toBe(11)
  })

  it('events and eventsIn', () => {
    const tape = new Tape<unknown, string>(layout, 10, 0, 0)
    const rec = new Float32Array(REC_FLOATS * 2)
    
    tape.push(0, rec, undefined, ['e0'])
    tape.push(1, rec)
    tape.push(2, rec, undefined, ['e2a', 'e2b'])
    
    expect(tape.events(0)).toEqual(['e0'])
    expect(tape.events(1)).toEqual([])
    expect(tape.events(2)).toEqual(['e2a', 'e2b'])
    
    const inRange = tape.eventsIn(0, 1)
    expect(inRange).toEqual([{ step: 0, e: 'e0' }])
  })

  it('workSum over a range', () => {
    const tape = new Tape(layout, 10, 0, 0)
    const rec = new Float32Array(REC_FLOATS * 2)
    const w1 = new Float32Array(WORK_FLOATS)
    w1[0] = 10; w1[1] = 20
    const w2 = new Float32Array(WORK_FLOATS)
    w2[0] = 5; w2[2] = 10
    
    tape.push(0, rec, w1)
    tape.push(1, rec) // no work (zeros)
    tape.push(2, rec, w2)
    
    const sum = tape.workSum(0, 2)
    expect(sum[0]).toBe(15)
    expect(sum[1]).toBe(20)
    expect(sum[2]).toBe(10)
    expect(sum[3]).toBe(0)
    expect(sum[4]).toBe(0)
  })

  it('blendRecord at 0, 1 and 0.5', () => {
    const a = new Float32Array(REC_FLOATS)
    a[0] = 10 // pos x
    a[3] = 1; a[4] = 0; a[5] = 0; a[6] = 0 // quat
    
    const b = new Float32Array(REC_FLOATS)
    b[0] = 20 // pos x
    b[3] = -1; b[4] = 0; b[5] = 0; b[6] = 0 // quat (negative dot product)
    
    const out = new Float32Array(REC_FLOATS)
    
    blendRecord(a, b, 0, out)
    expect(out[0]).toBe(10)
    expect(out[3]).toBe(1)
    
    blendRecord(a, b, 1, out)
    expect(out[0]).toBe(20)
    expect(out[3]).toBe(-1)
    
    blendRecord(a, b, 0.5, out)
    expect(out[0]).toBe(15) // halfway
    // quat should be correctly blended short way and normalized
    expect(out[3]).toBe(1) // a is (1,0,0,0), b is (-1,0,0,0). dot < 0 => b is flipped to (1,0,0,0). blend of (1,0,0,0) and (1,0,0,0) is (1,0,0,0)
    
    // test length is 1 for non-trivial
    const a2 = new Float32Array(REC_FLOATS)
    a2[3] = 1; a2[4] = 0; a2[5] = 0; a2[6] = 0
    const b2 = new Float32Array(REC_FLOATS)
    b2[3] = 0; b2[4] = 1; b2[5] = 0; b2[6] = 0
    blendRecord(a2, b2, 0.5, out)
    const len = Math.sqrt(out[3]**2 + out[4]**2 + out[5]**2 + out[6]**2)
    expect(len).toBeCloseTo(1)
  })

  it('bytesPerSecond is correct', () => {
    expect(bytesPerSecond(20, 240)).toBe(249600)
    expect(bytesPerSecond(20, 60)).toBe(62400)
  })
})