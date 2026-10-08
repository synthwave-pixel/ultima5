import { expect, it } from 'vitest';
import { contextual } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown } from '../src/game/town.ts';
import { T } from '../src/game/tiles.ts';
import { tileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** In Iolo's hut, a square of floor beside a chair (furniture that moves, cmds.ts pushable), nobody on either. */
async function hut() {
  const { g } = newGame(5);
  journeyOnward(g);
  await enterTown(g, true);
  g.options.input = 'controller';
  g.commandPrompt = 'town';
  return g;
}

const CHAIRS = [0x90, 0x91, 0x92, 0x93];
/** Everything that moves (targets.ts PUSHABLE). */
const MOVES = [T.T5B, ...CHAIRS, T.Desk, T.Barrel, T.Vanity, T.A9, T.Dresser, T.AE, T.Trunk, 0xb4, 0xb5, 0xb6, 0xb7];
const free = (g: Awaited<ReturnType<typeof hut>>, x: number, y: number): boolean =>
  tileAt(g, x, y) === 0x44 && !g.s.actors.some((a, i) => i > 0 && a.tile && a.x === x && a.y === y && a.z === g.s.level);

it('offers Push among the things the moment calls for, beside furniture that moves', async () => {
  const g = await hut();
  const s = g.s;
  let found = false;
  for (let y = 1; y < 31 && !found; y++)
    for (let x = 1; x < 31 && !found; x++) {
      if (!CHAIRS.includes(tileAt(g, x, y))) continue;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ])
        if (!found && free(g, x + dx, y + dy)) {
          [s.x, s.y] = [x + dx, y + dy];
          found = true;
        }
    }
  expect(found).toBe(true);
  expect(contextual(g).map((it) => it.label)).toContain('Push');
});

it('does not offer Push where nothing beside the party moves', async () => {
  const g = await hut();
  const s = g.s;
  const near = (x: number, y: number): boolean =>
    [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ].some(([dx, dy]) => MOVES.includes(tileAt(g, x + dx, y + dy)));
  let placed = false;
  for (let y = 1; y < 31 && !placed; y++)
    for (let x = 1; x < 31 && !placed; x++)
      if (free(g, x, y) && !near(x, y)) {
        [s.x, s.y] = [x, y];
        placed = true;
      }
  expect(placed).toBe(true);
  expect(contextual(g).map((it) => it.label)).not.toContain('Push');
});
