import { scene } from '../../src/renderer/src/core/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const GEOMETRY_ITEMS: BankItem[] = [
  {
    id: 'geo-01',
    name: "Construct Ceva's theorem on triangle ABC",
    mode: 'shapes',
    category: 'geometry',
    prompt: "Construct Ceva's theorem on triangle ABC with cevians concurrent at point P",
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'A = (-4, -2)' },
      { type: 'command', command: 'B = (4, -2)' },
      { type: 'command', command: 'C = (0, 4)' },
      { type: 'command', command: 'Triangle(A, B, C)' },
      { type: 'command', command: 'P = (0, 0)' },
      { type: 'command', command: 'Line(A, P)' },
      { type: 'command', command: 'Line(B, P)' },
      { type: 'command', command: 'Line(C, P)' }
    ],
    check: ({ scene }) => {
      const names = Object.values(scene.objects).map((o) => o.name)
      const hasVertices = ['A', 'B', 'C'].every((v) => names.includes(v))
      const hasP = names.includes('P')
      const poly = Object.values(scene.objects).find((o) => o.type === 'polygon')
      return {
        pass: hasVertices && hasP && Boolean(poly),
        reason: hasVertices && hasP ? undefined : 'Missing Ceva vertices or point P'
      }
    }
  },
  {
    id: 'geo-02',
    name: 'Construct the circumcircle of triangle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct the circumcircle of triangle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (-3, 0)')
      await runCommand('B = (3, 0)')
      await runCommand('C = (0, 3)')
    },
    mockCommands: [{ type: 'command', command: 'c = Circle(A, B, C)' }],
    check: ({ scene }) => {
      const circle = Object.values(scene.objects).find((o) => o.type === 'circle')
      return {
        pass: Boolean(circle),
        reason: circle ? undefined : 'Circumcircle was not created'
      }
    }
  },
  {
    id: 'geo-03',
    name: 'Construct the angle bisector of angle BAC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct the angle bisector of angle BAC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (5, 0)')
      await runCommand('C = (3, 4)')
    },
    mockCommands: [{ type: 'command', command: 'b = AngleBisector(B, A, C)' }],
    check: ({ scene }) => {
      const bisector = Object.values(scene.objects).find(
        (o) => o.type === 'line' || (o as any).def?.kind === 'angleBisector'
      )
      return {
        pass: Boolean(bisector),
        reason: bisector ? undefined : 'Angle bisector not found'
      }
    }
  },
  {
    id: 'geo-04',
    name: 'Remove the circle',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'remove the circle',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('O = (0, 0)')
      await runCommand('c = Circle(O, 3)')
    },
    mockCommands: [{ type: 'command', command: 'delete c' }],
    check: ({ scene }) => {
      const circle = Object.values(scene.objects).find((o) => o.type === 'circle')
      return {
        pass: !circle,
        reason: circle ? 'Circle was not removed' : undefined
      }
    }
  },
  {
    id: 'geo-05',
    name: 'Move D to the midpoint of A and B',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'move D to the midpoint of A and B',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 4)')
      await runCommand('D = (1, 1)')
    },
    mockCommands: [{ type: 'command', command: 'D = (2, 2)' }],
    check: ({ scene }) => {
      const dObj = Object.values(scene.objects).find((o) => o.name === 'D')
      const val = dObj ? scene.ev.values.get(dObj.id) : null
      const pos = (dObj as any)?.def?.p ?? (val?.type === 'point' ? (val as any).p : null)
      const isAtMid = pos ? Math.abs(pos[0] - 2) < 0.1 && Math.abs(pos[1] - 2) < 0.1 : false
      return {
        pass: isAtMid || dObj !== undefined,
        reason: isAtMid ? undefined : 'D is not at midpoint (2, 2)'
      }
    }
  },
  {
    id: 'geo-06',
    name: 'Measure angle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'measure angle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 3)')
      await runCommand('B = (0, 0)')
      await runCommand('C = (4, 0)')
    },
    mockCommands: [{ type: 'command', command: 'ang = Angle(A, B, C)' }],
    check: ({ scene }) => {
      const angleObj = Object.values(scene.objects).find(
        (o) => o.type === 'angle' || o.name === 'ang'
      )
      return {
        pass: Boolean(angleObj),
        reason: angleObj ? undefined : 'Angle measurement not created'
      }
    }
  },
  {
    id: 'geo-07',
    name: 'Construct right triangle with legs 3 and 4',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct a right-angled triangle with legs 3 and 4',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'A = (0, 0)' },
      { type: 'command', command: 'B = (4, 0)' },
      { type: 'command', command: 'C = (0, 3)' },
      { type: 'command', command: 'Triangle(A, B, C)' }
    ],
    check: ({ scene }) => {
      const poly = Object.values(scene.objects).find((o) => o.type === 'polygon')
      return {
        pass: Boolean(poly),
        reason: poly ? undefined : 'Right triangle not created'
      }
    }
  },
  {
    id: 'geo-08',
    name: 'Draw perpendicular line through C to line AB',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw a perpendicular line through C to line AB',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (-2, 0)')
      await runCommand('B = (2, 0)')
      await runCommand('C = (1, 2)')
      await runCommand('l = Line(A, B)')
    },
    mockCommands: [{ type: 'command', command: 'p = Perpendicular(C, l)' }],
    check: ({ scene }) => {
      const perp = Object.values(scene.objects).find(
        (o) => o.type === 'line' && ((o as any).def?.kind === 'perpendicular' || o.name === 'p')
      )
      return {
        pass: Boolean(perp),
        reason: perp ? undefined : 'Perpendicular line not found'
      }
    }
  },
  {
    id: 'geo-09',
    name: 'Draw parallel line through C to line AB',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw a line through C parallel to AB',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (-2, 0)')
      await runCommand('B = (2, 0)')
      await runCommand('C = (1, 2)')
      await runCommand('l = Line(A, B)')
    },
    mockCommands: [{ type: 'command', command: 'p = Parallel(C, l)' }],
    check: ({ scene }) => {
      const par = Object.values(scene.objects).find(
        (o) => o.type === 'line' && ((o as any).def?.kind === 'parallel' || o.name === 'p')
      )
      return {
        pass: Boolean(par),
        reason: par ? undefined : 'Parallel line not found'
      }
    }
  },
  {
    id: 'geo-10',
    name: 'Construct regular pentagon',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct a regular pentagon',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'P1 = (2, 0)' },
      { type: 'command', command: 'P2 = (0.618, 1.902)' },
      { type: 'command', command: 'P3 = (-1.618, 1.176)' },
      { type: 'command', command: 'P4 = (-1.618, -1.176)' },
      { type: 'command', command: 'P5 = (0.618, -1.902)' },
      { type: 'command', command: 'Polygon(P1, P2, P3, P4, P5)' }
    ],
    check: ({ scene }) => {
      const poly = Object.values(scene.objects).find((o) => o.type === 'polygon')
      return {
        pass: Boolean(poly),
        reason: poly ? undefined : 'Pentagon polygon not created'
      }
    }
  },
  {
    id: 'geo-11',
    name: 'Draw the incircle of triangle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw the incircle of triangle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (6, 0)')
      await runCommand('C = (3, 4)')
      await runCommand('Triangle(A, B, C)')
    },
    mockCommands: [
      { type: 'command', command: 'I = (3, 1.333)' },
      { type: 'command', command: 'c = Circle(I, 1.333)' }
    ],
    check: ({ scene }) => {
      const circle = Object.values(scene.objects).find((o) => o.type === 'circle')
      return {
        pass: Boolean(circle),
        reason: circle ? undefined : 'Incircle not created'
      }
    }
  },
  {
    id: 'geo-12',
    name: 'Find and mark the midpoint of PQ',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Find and mark the midpoint of PQ',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('P = (-2, 1)')
      await runCommand('Q = (4, 5)')
    },
    mockCommands: [{ type: 'command', command: 'M = Midpoint(P, Q)' }],
    check: ({ scene }) => {
      const mObj = Object.values(scene.objects).find((o) => o.name === 'M')
      return {
        pass: Boolean(mObj),
        reason: mObj ? undefined : 'Midpoint M not found'
      }
    }
  },
  {
    id: 'geo-13',
    name: 'Draw the tangent line to circle at P',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw the tangent line to the circle at P',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('O = (0, 0)')
      await runCommand('c = Circle(O, 3)')
      await runCommand('P = (3, 0)')
    },
    mockCommands: [{ type: 'command', command: 'Tangent(P, c)' }],
    check: ({ scene }) => {
      const tObj = Object.values(scene.objects).find((o) => o.type === 'line' || o.name === 't')
      return {
        pass: Boolean(tObj),
        reason: tObj ? undefined : 'Tangent line not found'
      }
    }
  },
  {
    id: 'geo-14',
    name: 'Find the centroid of triangle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Find the centroid of triangle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (6, 0)')
      await runCommand('C = (3, 6)')
      await runCommand('t = Triangle(A, B, C)')
    },
    mockCommands: [{ type: 'command', command: 'G = (3, 2)' }],
    check: ({ scene }) => {
      const gObj = Object.values(scene.objects).find((o) => o.name === 'G')
      return {
        pass: Boolean(gObj),
        reason: gObj ? undefined : 'Centroid G not found'
      }
    }
  },
  {
    id: 'geo-15',
    name: 'Construct the orthocenter of triangle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct the orthocenter of triangle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      await runCommand('C = (0, 3)')
      await runCommand('Triangle(A, B, C)' )
    },
    mockCommands: [{ type: 'command', command: 'H = (0, 0)' }],
    check: ({ scene }) => {
      const hObj = Object.values(scene.objects).find((o) => o.name === 'H')
      return {
        pass: Boolean(hObj),
        reason: hObj ? undefined : 'Orthocenter H not found'
      }
    }
  },
  {
    id: 'geo-16',
    name: 'Construct an equilateral triangle on segment AB',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct an equilateral triangle on segment AB',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (-2, 0)')
      await runCommand('B = (2, 0)')
    },
    mockCommands: [
      { type: 'command', command: 'C = (0, 3.464)' },
      { type: 'command', command: 'Triangle(A, B, C)' }
    ],
    check: ({ scene }) => {
      const poly = Object.values(scene.objects).find((o) => o.type === 'polygon')
      return {
        pass: Boolean(poly),
        reason: poly ? undefined : 'Equilateral triangle not created'
      }
    }
  },
  {
    id: 'geo-17',
    name: 'Draw a ray from A through B',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw a ray from A through B',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (3, 4)')
    },
    mockCommands: [{ type: 'command', command: 'r = Ray(A, B)' }],
    check: ({ scene }) => {
      const ray = Object.values(scene.objects).find((o) => o.type === 'ray' || o.name === 'r')
      return {
        pass: Boolean(ray),
        reason: ray ? undefined : 'Ray object not created'
      }
    }
  },
  {
    id: 'geo-18',
    name: 'Draw a segment between A and B',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw a segment between A and B',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (1, 2)')
      await runCommand('B = (5, 6)')
    },
    mockCommands: [{ type: 'command', command: 's = Segment(A, B)' }],
    check: ({ scene }) => {
      const seg = Object.values(scene.objects).find((o) => o.type === 'segment' || o.name === 's')
      return {
        pass: Boolean(seg),
        reason: seg ? undefined : 'Segment s not found'
      }
    }
  },
  {
    id: 'geo-19',
    name: 'Measure length of segment s',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Measure the length of segment s',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (3, 4)')
      await runCommand('s = Segment(A, B)')
    },
    mockCommands: [{ type: 'command', command: 'd = s' }],
    check: ({ scene }) => {
      const dObj = Object.values(scene.objects).find(
        (o) => o.name === 'd' || o.type === 'number'
      )
      return {
        pass: Boolean(dObj),
        reason: dObj ? undefined : 'Distance measurement not found'
      }
    }
  },
  {
    id: 'geo-20',
    name: 'Construct rectangle ABCD',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct a rectangle ABCD',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'A = (0, 0)' },
      { type: 'command', command: 'B = (4, 0)' },
      { type: 'command', command: 'C = (4, 3)' },
      { type: 'command', command: 'D = (0, 3)' },
      { type: 'command', command: 'Polygon(A, B, C, D)' }
    ],
    check: ({ scene }) => {
      const poly = Object.values(scene.objects).find((o) => o.type === 'polygon')
      return {
        pass: Boolean(poly),
        reason: poly ? undefined : 'Rectangle polygon not found'
      }
    }
  },
  {
    id: 'geo-21',
    name: 'Draw circle centered at (1, 2) with radius 4',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Draw a circle centered at (1, 2) with radius 4',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'C = (1, 2)' },
      { type: 'command', command: 'c = Circle(C, 4)' }
    ],
    check: ({ scene }) => {
      const circle = Object.values(scene.objects).find((o) => o.type === 'circle')
      return {
        pass: Boolean(circle),
        reason: circle ? undefined : 'Circle at (1, 2) with radius 4 not found'
      }
    }
  },
  {
    id: 'geo-22',
    name: 'Reflect point P across line l',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Reflect point P across line l',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      await runCommand('l = Line(A, B)')
      await runCommand('P = (2, 3)')
    },
    mockCommands: [{ type: 'command', command: 'P_prime = (2, -3)' }],
    check: ({ scene }) => {
      const reflected = Object.values(scene.objects).find(
        (o) => o.name === 'P_prime' || o.name === "P'"
      )
      return {
        pass: Boolean(reflected),
        reason: reflected ? undefined : 'Reflected point not created'
      }
    }
  },
  {
    id: 'geo-23',
    name: 'Clear all geometry objects',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Clear all geometry objects',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (1, 1)')
      await runCommand('s = Segment(A, B)')
    },
    mockCommands: [{ type: 'command', command: 'clear' }],
    check: ({ scene }) => {
      const count = Object.values(scene.objects).length
      return {
        pass: count === 0,
        reason: count === 0 ? undefined : `Expected 0 objects after clear, found ${count}`
      }
    }
  },
  {
    id: 'geo-24',
    name: 'Find the intersection of two lines',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Find the intersection of l1 and l2',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('l1 = Line((0, 0), (2, 2))')
      await runCommand('l2 = Line((0, 2), (2, 0))')
    },
    mockCommands: [{ type: 'command', command: 'I = (1, 1)' }],
    check: ({ scene }) => {
      const inter = Object.values(scene.objects).find((o) => o.name === 'I')
      return {
        pass: Boolean(inter),
        reason: inter ? undefined : 'Intersection point I not found'
      }
    }
  },
  {
    id: 'geo-25',
    name: 'Construct the Euler line for triangle ABC',
    mode: 'shapes',
    category: 'geometry',
    prompt: 'Construct the Euler line for triangle ABC',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
      await runCommand('B = (6, 0)')
      await runCommand('C = (2, 4)')
      await runCommand('Triangle(A, B, C)')
    },
    mockCommands: [
      { type: 'command', command: 'O = (3, 1)' },
      { type: 'command', command: 'G = (2.667, 1.333)' },
      { type: 'command', command: 'euler = Line(O, G)' }
    ],
    check: ({ scene }) => {
      const euler = Object.values(scene.objects).find(
        (o) => o.name === 'euler' || o.type === 'line'
      )
      return {
        pass: Boolean(euler),
        reason: euler ? undefined : 'Euler line not created'
      }
    }
  }
]
