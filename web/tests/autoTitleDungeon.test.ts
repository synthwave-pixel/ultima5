import { describe, expect, it } from 'vitest';
import { autoTitle } from '../src/game/frame.ts';
import { getChar } from '../src/game/input.ts';
import { newGame } from './helpers.ts';

/**
 * Issue #44: after a fight in a dungeon room with auto combat, "Auto" stayed on the top border, and the dungeon wrote
 * only its level's digit over it as the party walked: "Au5o". "Auto" is taken down there as it is out of doors and in
 * a towne, the border's "L5" drawn again.
 */
describe('"Auto" taken down in a dungeon', () => {
  it('draws the level again where "Auto" stood, once the fight is over', async () => {
    const { g, p } = newGame();
    const s = g.s;
    s.mapId = 0x21;
    s.level = 4;
    autoTitle(g, true);
    g.autoShown = true;
    const top = (): string => p.rows[0].slice(5, 19).join('');
    expect(top()).toContain('Auto');
    p.keys.push(0x20);
    await getChar(g);
    expect(g.autoShown).toBe(false);
    expect(top()).not.toContain('Auto');
    expect(top()).toContain('L5');
  });
});
