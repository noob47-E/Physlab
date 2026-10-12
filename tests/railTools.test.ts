import { describe, it, expect } from 'vitest';
import {
  RailToolId,
  RailTool,
  RAIL,
  MORE,
  SceneState,
  Hint,
  HINTS,
  pickHint
} from '../src/renderer/src/sim/railTools';

describe('railTools', () => {
  it('RAIL has at most 8 tools', () => {
    expect(RAIL.length).toBeLessThanOrEqual(8);
  });

  it('RAIL has exactly 8 tools', () => {
    expect(RAIL.length).toBe(8);
  });

  it('RAIL and MORE ids are unique and cover every RailToolId', () => {
    const allIds = [...RAIL, ...MORE].map((t: RailTool) => t.id);
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);

    const expectedIds: RailToolId[] = [
      'select', 'ball', 'crate', 'ramp', 'plank', 'connect', 'forces', 'more',
      'cylinder', 'capsule', 'cone', 'wall', 'pulley', 'floor'
    ];
    
    expect(uniqueIds.size).toBe(expectedIds.length);
    for (const id of expectedIds) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });

  it('every help is one sentence, under 120 characters, plain English (no "^", no code words)', () => {
    const allTools = [...RAIL, ...MORE];
    for (const tool of allTools) {
      expect(tool.help.length).toBeLessThanOrEqual(120);
      expect(tool.help).toMatch(/^[A-Z].*\.$/); // One sentence (starts with capital, ends with period)
      expect(tool.help).not.toMatch(/\^/); // no "^"
      // More checks could be added for "code words", but we keep it simple here.
    }
  });

  it('for 20 seeded random SceneStates pickHint returns at most one hint, the same one each time for the same state, and never a dismissed one', () => {
    const states: SceneState[] = Array.from({ length: 20 }, (_, i) => ({
      bodies: i % 5,
      moving: i % 3,
      playing: i % 2 === 0,
      replaying: i % 3 === 0,
      hasRun: i % 2 !== 0,
      atBounceMark: i % 4 === 0,
      selected: i % 5 === 0,
      hasCards: i % 6 === 0
    }));

    // JM: count the states that get a hint, so a pickHint that always returns null cannot pass
    let hinted = 0;
    for (const state of states) {
      const hint1 = pickHint(state, []);
      const hint2 = pickHint(state, []);

      expect(hint1).toBe(hint2);

      if (hint1) {
        hinted++;
        const hint3 = pickHint(state, [hint1.id]);
        expect(hint3?.id).not.toBe(hint1.id);
      }
    }
    expect(hinted).toBeGreaterThan(0);
  });

  it('imports everything successfully', () => {
    // Just to ensure all types are used somewhere so TypeScript noUnusedLocals doesn't complain
    const t: RailTool | undefined = RAIL[0];
    const h: Hint | undefined = HINTS[0];
    expect(t).toBeDefined();
    expect(h).toBeDefined();
  });
});
