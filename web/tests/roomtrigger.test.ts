import { expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { newGame } from './helpers.ts';
import { command, fly, Landed } from './pilot.ts';

/**
 * Deceit's bottom room, entered from the Underworld: the party is set down by the ladder in a chamber walled off
 * from the rest; the walls carrying the room's triggers open when pushed (CMDS_137c), which the port had left out.
 */
it('opens a secret way in a dungeon room by pushing the wall that carries its trigger', async () => {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  const { stashWorldActors } = await import('../src/game/outdoors.ts');
  stashWorldActors(g);
  const loc = g.data.locations[32];
  Object.assign(s, { mapId: 0, level: 0xff, x: loc.x, y: loc.y, facing: 0 });
  s.d58d0[0] = 0x80;
  g.autoKill = true; // whatever waits in the room falls; it is the walls that are tested
  let phase = 0;
  const wallBefore = (): number => g.combatMap[5 * 32 + 5];
  let before = -1;
  fly(
    g,
    p,
    [
      command('Enter'),
      (game) => {
        if (phase === 3) return undefined;
        if (game.commandPrompt !== 'combat') return Pad.A;
        if (game.menuShown) return Pad.B;
        // The party is set down by the ladder: the one at (4, 8) goes south, then west to (3, 9), and pushes west.
        const me = game.combat[game.s.combatTurn];
        if (phase === 0 && me.x === 4 && me.y === 8) {
          phase = 1;
          return K.Down;
        }
        if (phase === 1 && me.x === 4 && me.y === 9) {
          phase = 2;
          return K.Left;
        }
        if (phase === 2 && me.x === 3 && me.y === 9) {
          phase = 3;
          before = wallBefore();
          return Pad.A; // the command menu
        }
        return Pad.B; // pass
      },
      (game) => {
        const m = game.menuShown;
        if (!m || m.title !== 'Commands') return undefined;
        const i = m.labels.indexOf('Push');
        return m.at === i ? Pad.A : m.at < i ? K.Down : K.Up;
      },
      (game) => {
        if (/Which way\?\s*$/.test(p.log)) return K.Left; // Push-West
        if (game.commandPrompt === 'combat' && !game.menuShown) throw new Landed();
        return undefined;
      },
      (game) => (game.commandPrompt === 'combat' && !game.menuShown ? undefined : Pad.B),
    ],
    400,
  );
  try {
    await runGame(g);
  } catch (e) {
    if (!(e instanceof Landed)) throw e;
  }
  expect(before).toBe(0xff); // the alcove at (5, 5) was rock
  expect(g.combatMap[5 * 32 + 5]).toBe(0x44); // and is floor: the way north is open
  expect(g.combatMap[6 * 32 + 5]).toBe(0x44);
  expect(p.log).not.toMatch(/Won't budge/);
  // The fight's own "Push-", once: not again from the Push command it runs.
  expect(p.log).not.toMatch(/Push-\s*Push-/);
});

it("prints a fight's Ready once, not the fight's and the command's own", async () => {
  const { g, p } = newGame();
  journeyOnward(g);
  const { readyCommand } = await import('../src/game/zstats.ts');
  p.next = () => Pad.B;
  g.say(0x6e2e); // COMBAT's "Ready..."
  await readyCommand(g, true);
  expect(p.log.match(/Ready\.\.\./g)).toHaveLength(1);
});

/** Deceit's bottom room, as above: the member at (4, 8) walked to (3, 9), beside the wall that carries the trigger. */
async function besideTheWall(then: (game: import('../src/game/game.ts').Game) => number | undefined) {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  const { stashWorldActors } = await import('../src/game/outdoors.ts');
  stashWorldActors(g);
  const loc = g.data.locations[32];
  Object.assign(s, { mapId: 0, level: 0xff, x: loc.x, y: loc.y, facing: 0 });
  s.d58d0[0] = 0x80;
  g.autoKill = true;
  let phase = 0;
  fly(
    g,
    p,
    [
      command('Enter'),
      (game) => {
        if (game.commandPrompt !== 'combat') return Pad.A;
        if (game.menuShown) return Pad.B;
        const me = game.combat[game.s.combatTurn];
        if (phase === 0 && me.x === 4 && me.y === 8) {
          phase = 1;
          return K.Down;
        }
        if (phase === 1 && me.x === 4 && me.y === 9) {
          phase = 2;
          return K.Left;
        }
        if (phase === 2 && me.x === 3 && me.y === 9) return then(game);
        return Pad.B; // pass
      },
      (game) => (game.commandPrompt === 'combat' && !game.menuShown ? undefined : Pad.B),
    ],
    400,
  );
  try {
    await runGame(g);
  } catch (e) {
    if (!(e instanceof Landed)) throw e;
  }
  return { g, p };
}

it("offers Push at the head of a won room's menu beside a wall that carries a trigger", async () => {
  const { contextual } = await import('../src/game/menu.ts');
  let labels: string[] = [];
  await besideTheWall((game) => {
    labels = contextual(game).map((it) => it.label);
    throw new Landed();
  });
  expect(labels[0]).toBe('Push');
});

it('pushes the wall that carries a trigger when a member walks into it, rather than saying Blocked', async () => {
  let walked = false;
  const { g, p } = await besideTheWall((game) => {
    if (walked) throw new Landed();
    walked = true;
    game.options.input = 'controller';
    return K.Left; // into the wall at (2, 9)
  });
  expect(g.combatMap[5 * 32 + 5]).toBe(0x44); // the way north is open
  expect(p.log).not.toMatch(/Blocked!/);
});
