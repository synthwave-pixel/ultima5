import { describe, expect, it } from 'vitest';
import { dungeonCommand } from '../src/game/dungeon.ts';
import { getChar, getCommandKey } from '../src/game/input.ts';
import { TURN_LEFT, TURN_RIGHT } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * A controller's right stick, left or right (ui/gamepad.ts): in a dungeon a turn where the party stands, whatever the
 * view - the whole-level map's too, where the d-pad walks by the compass; nothing anywhere else, nor at any prompt but
 * the dungeon's command prompt.
 */
describe('the right stick', () => {
  const below = (view: 'mini' | 'full') => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 0, d58a7: 0xff });
    g.s.dungeon.fill(0x00); // open floor all round
    g.options.input = 'controller';
    g.options.dungeonView = view;
    return made;
  };

  for (const view of ['mini', 'full'] as const)
    it(`turns the party where it stands in a dungeon (${view === 'full' ? 'the whole map up' : 'first person'})`, async () => {
      const { g, p } = below(view);
      p.keys.push(TURN_RIGHT);
      const key = await getCommandKey(g, 'dungeon');
      expect(key).toBe(TURN_RIGHT);
      await dungeonCommand(g, key);
      expect(g.s.facing).toBe(1);
      expect([g.s.x, g.s.y]).toEqual([1, 1]); // turned, not stepped
      await dungeonCommand(g, TURN_LEFT);
      await dungeonCommand(g, TURN_LEFT);
      expect(g.s.facing).toBe(3);
      expect(p.log).toMatch(/Turn right/);
      expect(p.log).toMatch(/Turn left/);
    });

  it('is nothing at the command prompt anywhere else, nor at any other prompt', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    p.keys.push(TURN_LEFT, 0x59); // the stick, then Y (a cast)
    expect(await getCommandKey(g, 'outdoors')).toBe(0x43);
    g.options.input = 'letters'; // a letter as itself, at a prompt that takes any key
    p.keys.push(TURN_RIGHT, 0x41);
    expect(await getChar(g)).toBe(0x41);
  });
});
