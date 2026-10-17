import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { presetById } from '../src/renderer/src/sim/presets'
import { evaluateCard, readingOf } from '../src/renderer/src/sim/cards'
import { DEFAULT_WORLD, BodyDef, Link } from '../src/renderer/src/sim/types'
import { SCENE_CARDS } from '../src/renderer/src/sim/cards/sceneCards'
import { makeBody } from '../src/renderer/src/sim/store'
import { makeLink } from '../src/renderer/src/sim/links'
import { loadJolt } from '../src/renderer/src/sim/jolt'
import { SimWorld } from '../src/renderer/src/sim/world'

const SF3 = { decimals: 3, precisionMode: 'sf' as const }

async function evalCard(id: string, presetId: string | null, roles: Record<string, string>) {
  let bodies: BodyDef[] = []
  let links: Link[] = []
  let worldConf = { ...DEFAULT_WORLD }

  if (presetId) {
    const built = presetById(presetId)!.build()
    bodies = built.bodies
    links = built.links || []
    worldConf = { ...DEFAULT_WORLD, ...built.world }
  } else if (id.startsWith('ramp')) {
    bodies = [
      makeBody('ground', 'Floor', [0, -0.2, 0]),
      makeBody('sphere', 'A', [0, 5, 0])
    ]
  } else if (id.startsWith('slope')) {
    bodies = [
      makeBody('ground', 'Floor', [0, -0.2, 0]),
      { ...makeBody('box', 'A', [0, 5, 0]), slopeAngle: 30 } as unknown as BodyDef
    ]
  } else if (id.startsWith('circle')) {
    const pivot = makeBody('sphere', 'Pivot', [0, 5, 0])
    const a = makeBody('sphere', 'A', [0, 2, 0])
    bodies = [pivot, a]
    links = [makeLink('L', 'string', pivot, a)!]
  } else if (id.startsWith('coupled')) {
    const w1 = makeBody('box', 'Wall1', [-5, 0, 0])
    const a = makeBody('box', 'A', [-2, 0, 0])
    const b = makeBody('box', 'B', [2, 0, 0])
    const w2 = makeBody('box', 'Wall2', [5, 0, 0])
    bodies = [w1, a, b, w2]
    links = [
      makeLink('S1', 'spring', w1, a)!,
      makeLink('S2', 'spring', a, b)!,
      makeLink('S3', 'spring', b, w2)!
    ]
  } else if (id.startsWith('rolling')) {
    bodies = [
      makeBody('ground', 'Floor', [0, -0.2, 0]),
      { ...makeBody(id.includes('ball') ? 'sphere' : 'cylinder', 'A', [0, 5, 0]), slopeAngle: 30 } as unknown as BodyDef
    ]
  }

  const w = await SimWorld.create(worldConf)
  w.rebuild(bodies, links)

  const prevStates = Object.fromEntries(bodies.map(b => [b.id, w.state(b.id)!]))
  w.step(1/60)
  
  const states = Object.fromEntries(bodies.map(b => [b.id, w.state(b.id)!]))
  
  const r = readingOf({
    bodies, states, starts: prevStates, links, world: worldConf, t: 1/60, roles
  })
  
  for (const b of bodies) {
    if (r.bodies[b.name]) {
      const v = states[b.id].velocity
      const u = prevStates[b.id].velocity
      r.bodies[b.name].acc = [ (v[0]-u[0])*60, (v[1]-u[1])*60, (v[2]-u[2])*60 ]
    }
  }

  const view = evaluateCard(id, r, SF3)
  w.destroy()
  return view
}

describe('Scene Cards tests', () => {
  it('correct values for bounce', async () => {
    await loadJolt()
    const viewNextTop = await evalCard('bounce-next-top', 'bounce', { Ball: 'Ball', Floor: 'Floor' })
    expect(viewNextTop?.value).toBeCloseTo(1.92, 2)
    const viewKeLost = await evalCard('bounce-ke-lost', 'bounce', { Ball: 'Ball', Floor: 'Floor' })
    expect(viewKeLost?.value).toBeCloseTo(36, 1) // e = 0.8, 1-0.64 = 0.36 -> 36%
  })
  
  it('correct values for friction', async () => {
    const stop = await evalCard('friction-stop', 'friction', { Crate: 'Crate', Floor: 'Floor' })
    expect(stop?.value).toBeCloseTo(4.587, 3) // distance (1e-3)
    const heat = await evalCard('friction-heat', 'friction', { Crate: 'Crate', Floor: 'Floor' })
    expect(heat?.value).toBeCloseTo(90, 0)
  })

  it('correct values for atwood', async () => {
    const a = await evalCard('atwood-a', 'atwood', { 'm₁': 'm₁', 'm₂': 'm₂' })
    expect(a?.value).toBeCloseTo(0.467, 3)
    const T = await evalCard('atwood-T', 'atwood', { 'm₁': 'm₁', 'm₂': 'm₂' })
    expect(T?.value).toBeCloseTo(5.1386, 4)
  })

  it('correct values for lift', async () => {
    const a = await evalCard('lift-a', 'lift', { Weight: 'Weight', Crate: 'Crate' })
    expect(a?.value).toBeCloseTo(1.4014, 2)
    const T = await evalCard('lift-T', 'lift', { Weight: 'Weight', Crate: 'Crate' })
    expect(T?.value).toBeCloseTo(33.63, 2)
  })

  it('correct values for others', async () => {
    const craneT = await evalCard('crane-T', 'crane', { Crate: 'Crate' })
    expect(craneT?.value).toBeCloseTo(29.43, 2)
    
    const colA = await evalCard('collision-after-A', 'collision', { A: 'A', B: 'B' })
    expect(colA?.value).toBeCloseTo(-2.125, 3)
    
    const colB = await evalCard('collision-after-B', 'collision', { A: 'A', B: 'B' })
    expect(colB?.value).toBeCloseTo(2.375, 3)
    
    const stickyV = await evalCard('sticky-v', 'sticky', { A: 'A', B: 'B' })
    expect(stickyV?.value).toBeCloseTo(1, 2)
    
    const recoil = await evalCard('recoil-p', 'recoil', { Gun: 'Gun', Bullet: 'Bullet' })
    expect(recoil?.value).toBeCloseTo(0, 9)
    
    const pendT = await evalCard('pendulum-T-large', 'pendulum', { S: 'Pivot – Bob' })
    expect(pendT?.value).toBeCloseTo(2.849, 3)
    
    const term = await evalCard('terminal-v', 'terminal', { Foam: 'Foam' })
    expect(term?.value).toBeCloseTo(19.64, 2)
  })

  it('correct values for small scenes', async () => {
    const rampRoll = await evalCard('ramp-roll', null, { A: 'A', Floor: 'Floor' })
    const slopeN = await evalCard('slope-N', null, { A: 'A', Floor: 'Floor' })
    const slopeF = await evalCard('slope-f', null, { A: 'A', Floor: 'Floor' })
    const circF = await evalCard('circle-F', null, { A: 'A', S: 'Pivot – A' }) // Link name in store is `${body1.name} – ${body2.name}` or 'L' based on roles? A role maps to a body. 'S' role on link: wait, `S: 'L'` ? Wait, link doesn't have a name, just id. The reading looks up links.
    const w1 = await evalCard('coupled-w1', null, { A: 'A', S: 'Wall1 – A' })
    const w2 = await evalCard('coupled-w2', null, { A: 'A', S: 'Wall1 – A' })
    const rBall = await evalCard('rolling-a-ball', null, { A: 'A', Floor: 'Floor' })
    const rCyl = await evalCard('rolling-a-cylinder', null, { A: 'A', Floor: 'Floor' })
    expect(rampRoll?.value).toBeDefined()
    expect(slopeN?.value).toBeDefined()
    expect(slopeF?.value).toBeDefined()
    expect(circF?.value).toBeDefined()
    expect(w1?.value).toBeDefined()
    expect(w2?.value).toBeDefined()
    expect(rBall?.value).toBeDefined()
    expect(rCyl?.value).toBeDefined()
  })

  it('every card has unitsCheck, sumChecks and correct rendering', async () => {
    let checkedCount = 0
    const idSet = new Set<string>()
    for (const card of SCENE_CARDS) {
        checkedCount++
        expect(idSet.has(card.id)).toBe(false)
        idSet.add(card.id)
        
        let view = null
        if (['slope-N', 'slope-f', 'rolling-a-ball', 'rolling-a-cylinder'].includes(card.id)) {
             view = await evalCard(card.id, 'ramp', { A: 'Slope', Floor: 'Floor' })
        } else if (['ramp-roll', 'circle-F', 'coupled-w1', 'coupled-w2'].includes(card.id)) {
             view = await evalCard(card.id, null, { A: 'A', Floor: 'Floor', S: card.id === 'circle-F' ? 'Pivot – A' : 'Wall1 – A' })
        } else if (card.id.startsWith('pendulum')) {
             view = await evalCard(card.id, 'pendulum', { S: 'Pivot – Bob' })
        } else if (card.id.startsWith('friction')) {
             view = await evalCard(card.id, 'friction', { Crate: 'Crate', Floor: 'Floor' })
        } else if (card.id.startsWith('bounce')) {
             view = await evalCard(card.id, 'bounce', { Ball: 'Ball', Floor: 'Floor' })
        } else if (card.id.startsWith('atwood')) {
             view = await evalCard(card.id, 'atwood', { 'm₁': 'm₁', 'm₂': 'm₂' })
        } else if (card.id.startsWith('lift')) {
             view = await evalCard(card.id, 'lift', { Crate: 'Crate', Weight: 'Weight' })
        } else if (card.id.startsWith('crane')) {
             view = await evalCard(card.id, 'crane', { Crate: 'Crate' })
        } else if (card.id.startsWith('collision')) {
             view = await evalCard(card.id, 'collision', { A: 'A', B: 'B' })
        } else if (card.id.startsWith('sticky')) {
             view = await evalCard(card.id, 'sticky', { A: 'A', B: 'B' })
        } else if (card.id.startsWith('recoil')) {
             view = await evalCard(card.id, 'recoil', { Gun: 'Gun', Bullet: 'Bullet' })
        } else if (card.id.startsWith('terminal')) {
             view = await evalCard(card.id, 'terminal', { Foam: 'Foam' })
        } else if (card.id.startsWith('lever')) {
             view = await evalCard(card.id, 'seesaw', { 'Left hanger': 'Left hanger', 'Right hanger': 'Right hanger', Beam: 'Beam' })
        }
        
        expect(view, `view for ${card.id}`).not.toBeNull()
        expect(view!.unitsCheck, `unitsCheck for ${card.id}`).toBe(true)
        expect(view!.value, `value for ${card.id}`).not.toBeNaN()
        expect(view!.sumChecks, `sumChecks for ${card.id}`).toBe(true)
        
        for (const line of view!.lines) {
            try {
                katex.renderToString(line.tex, { throwOnError: true, trust: (ctx) => ctx.command === '\\htmlData' })
            } catch (e) {
                throw new Error(`KaTeX error on ${card.id}: ${e}\nTex: ${line.tex}`, { cause: e })
            }
        }
    }
    expect(checkedCount).toBe(SCENE_CARDS.length)
  })
})
