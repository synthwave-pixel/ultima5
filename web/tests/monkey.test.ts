import { afterEach, beforeEach, describe, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import { arenaFight } from '../src/game/combat.ts';
import { ARENAS, roomsToShow, startRoom } from '../src/game/devStarts.ts';
import type { Game } from '../src/game/game.ts';
import { unstashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { localSave, parseSave, restore, serialize } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

/**
 * A monkey at the controls: the game started in each kind of place and given a few hundred random presses - a
 * controller's buttons, or the 1988 keyboard's letters, digits, Enter and Escape - by a seeded generator, so that a
 * run goes the same way each time. Nothing it presses may break the game: no error thrown, no wait that never ends,
 * nothing the save could never hold. (A longer version of this, run by the thousand, found the push in a fight that
 * threw - pushfight.test.ts.) And now and then the game is saved as text and taken up by another game, which must
 * save the very same: nothing of the game is lost to a save.
 */

class Spent extends Error {}
class Reloaded extends Error {}

/** A seeded generator (mulberry32): the same presses for the same seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A controller: the d-pad, A and B the most, X, Y, Start and Select now and then. */
function pad(r: () => number): number {
  const x = r();
  if (x < 0.45) return 1 + Math.floor(r() * 4);
  if (x < 0.7) return 0x100; // A
  if (x < 0.85) return 0x101; // B
  if (x < 0.9) return 0x102; // X
  if (x < 0.95) return 0x103; // Y
  if (x < 0.98) return 0x104; // Start
  return 0x105; // Select
}

/** The 1988 keyboard: letters, digits, the arrows, Enter, Escape. */
function keyboard(r: () => number): number {
  const x = r();
  if (x < 0.5) return 0x41 + Math.floor(r() * 26);
  if (x < 0.6) return 0x30 + Math.floor(r() * 10);
  if (x < 0.78) return 1 + Math.floor(r() * 4);
  if (x < 0.9) return 0x0d;
  return 0x1b;
}

/** What a save could never hold. */
function wrong(g: Game): string | null {
  const s = g.s;
  if (s.gold < 0 || s.food < 0) return `gold ${s.gold}, food ${s.food}`;
  for (let i = 0; i < s.partySize; i++) if (s.members[i].hp < 0) return `member ${i} hp ${s.members[i].hp}`;
  if (g.inTown && (s.x > 31 || s.y > 31)) return `in a towne at ${s.x},${s.y}`;
  if (g.inDungeon && (s.x > 7 || s.y > 7 || s.level > 7)) return `in a dungeon at ${s.x},${s.y} on level ${s.level}`;
  return null;
}

/** `presses` random presses from where `place` puts the party; the game is played until they are spent. */
async function monkey(seed: number, input: 'controller' | 'letters', place: (g: Game) => Promise<boolean>, presses = 1000): Promise<void> {
  const { g, p } = newGame(seed);
  g.options.input = input;
  journeyOnward(g);
  const r = seeded(seed);
  let left = presses;
  let idle = 0;
  p.next = () => {
    const bad = wrong(g);
    if (bad) throw new Error(`after ${presses - left} presses: ${bad}`);
    // Every so often, saved as text and taken up by another game, which must save the very same.
    if ((presses - left) % 250 === 249) {
      const saved = serialize(g);
      const h = newGame(seed + 1).g;
      restore(h, parseSave(JSON.stringify(saved)));
      const again = serialize(h);
      const differ = Object.keys(saved).filter(
        (k) => k !== 'written' && JSON.stringify(saved[k as keyof typeof saved]) !== JSON.stringify(again[k as keyof typeof again]),
      );
      if (differ.length) throw new Error(`after ${presses - left} presses: a save taken up again differs in ${differ.join(', ')}`);
    }
    if (left-- <= 0) throw new Spent();
    idle = 0;
    return input === 'controller' ? pad(r) : keyboard(r);
  };
  // A wait that never ends reads no key; the player waiting on the game (auto combat, the ending) presses one in the end.
  p.sleep = async () => {
    if (++idle > 100000) throw new Error(`no key read in ${idle} waits, after ${presses - left} presses`);
  };
  p.pollKey = () => (++idle > 2000 && left > 0 ? (left--, (idle = 0), input === 'controller' ? pad(r) : keyboard(r)) : 0);
  try {
    let arrived = await place(g);
    // The game goes on from each reload (Save and quit) as the title's Journey Onward takes up the save.
    for (;;) {
      try {
        await runGame(g, arrived);
      } catch (e) {
        if (!(e instanceof Reloaded)) throw e;
        const saved = localSave.read();
        if (saved) restore(g, saved);
        journeyOnward(g);
        arrived = false;
      }
    }
  } catch (e) {
    if (!(e instanceof Spent)) throw e;
  }
}

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { location?: unknown }).location = {
    search: '',
    reload: () => {
      throw new Reloaded();
    },
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { location?: unknown }).location;
});

/** Out in the world at (x, y): Britannia (level 0) or the Underworld (0xff), on `tile` (the Avatar on foot, a ship...). */
const outside =
  (x: number, y: number, level = 0, tile = 0x1c) =>
  async (g: Game): Promise<boolean> => {
    Object.assign(g.s, { mapId: 0, level, x, y, partyTile: tile });
    unstashWorldActors(g);
    if ((tile & 0xfc) === 0x24) g.s.actors[0].b5 = 50;
    return false;
  };

const PLACES: [string, (g: Game) => Promise<boolean>][] = [
  ['Britannia on foot, by night', async (g) => ((g.s.hour = 23), outside(86, 112)(g))],
  ['Britannia on horseback', outside(86, 112, 0, 0x12)],
  ['at sea aboard ship', outside(70, 112, 0, 0x24)],
  ['the Underworld', outside(0x69, 0xe1, 0xff)],
  ['Britain', async (g) => (Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 30 }), true)],
  ["Lord British's castle", async (g) => (Object.assign(g.s, { mapId: 17, level: 0, x: 15, y: 30 }), true)],
  [
    'a dungeon',
    async (g) => {
      g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(0, 0x200));
      Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 1, d6602: 5, d58a7: 0xff });
      return true;
    },
  ],
  [
    'a dungeon room',
    async (g) => {
      const dat = g.data.files.get('DUNGEON.DAT');
      const r = roomsToShow(dat)[3];
      return startRoom(g, dat, r.dungeon, r.room, r.level);
    },
  ],
  [
    'a fight on the grass',
    async (g) => {
      await outside(86, 112)(g);
      const foe = freeActor(g);
      Object.assign(g.s.actors[foe], { tile: ARENAS[2].foe, anim: ARENAS[2].foe, x: 86, y: 111, z: 0, b5: 0 });
      await arenaFight(g, 2, foe);
      return false;
    },
  ],
];

describe('a monkey at the controls', () => {
  PLACES.forEach(([name, place], i) => {
    it(`breaks nothing in ${name}, with a controller and with the keyboard`, async () => {
      await monkey(100 + i, 'controller', place);
      await monkey(200 + i, 'letters', place);
    });
  });
});
