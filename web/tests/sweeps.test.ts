import { describe, expect, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import { arenaFight } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { castCommand, SPELL_EFFECTS } from '../src/game/magic.ts';
import { unstashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { careful, newGame } from './helpers.ts';

/** What can never be: hit points or mana out of bounds, a count below nothing or past the most, gold from nowhere. */
function wrong(g: Game, gold0: number): string | null {
  const s = g.s;
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.hp < 0 || m.hp > m.maxHp) return `${m.name} at ${m.hp} of ${m.maxHp}`;
    if (m.mp < 0 || m.mp > 99) return `${m.name} with ${m.mp} mana`;
  }
  if (s.gold < 0 || s.gold > 9999 || s.gold > gold0 + 9999) return `gold ${s.gold}`;
  if (s.food < 0 || s.food > 9999) return `food ${s.food}`;
  for (const [name, list] of [
    ['mixtures', s.mixtures],
    ['equipment', s.equipment],
    ['reagents', s.reagents],
  ] as const)
    if ([...list].some((n) => n < 0 || n > 99)) return `${name} ${[...list].join(',')}`;
  return null;
}

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

/** The Avatar able to cast anything: every circle, all the mana there is, five of every mixture. */
function mage(g: Game): void {
  const m = g.s.members[0];
  Object.assign(m, { level: 8, mp: 99, int: 30 });
  g.s.mixtures.fill(5);
}

const PLACES: [string, (g: Game) => void][] = [
  ['Britain', (g) => Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 20 })],
  [
    'Britannia',
    (g) => {
      Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 112, partyTile: 0x1c });
      unstashWorldActors(g);
    },
  ],
  [
    'a dungeon',
    (g) => {
      g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(0, 0x200));
      Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 1, d58a7: 0xff });
    },
  ],
];

/** Every spell, and every shop, worked through with a controller: nothing breaks, and nothing is ever out of order. */
describe('the sweeps', () => {
  it('casts every spell in a town, out in Britannia and in a dungeon, whatever it then asks answered', async () => {
    const failed: string[] = [];
    for (let spell = 0; spell < 48; spell++)
      for (const [where, put] of PLACES) {
        const { g, p } = newGame(spell * 17 + where.length);
        journeyOnward(g);
        g.options.input = 'controller';
        put(g);
        mage(g);
        const gold0 = g.s.gold;
        let presses = 0;
        p.next = () => {
          const bad = wrong(g, gold0);
          if (bad) throw new Error(bad);
          if (++presses > 300) throw new Error('never done');
          if (g.menuShown) return presses % 7 === 0 ? Pad.B : Pad.A;
          return [K.Up, K.Right, Pad.A, K.Down, Pad.A, K.Left, Pad.A][presses % 7];
        };
        g.castPreset = { caster: 0, spell };
        try {
          await castCommand(g);
          const bad = wrong(g, gold0);
          if (bad) throw new Error(bad);
        } catch (e) {
          failed.push(`${SPELL_EFFECTS[spell]} in ${where}: ${(e as Error).message}`);
        }
      }
    expect(failed).toEqual([]);
  });

  it('casts every spell in a fight, at the first turn, and the fight still ends', async () => {
    const failed: string[] = [];
    for (let spell = 0; spell < 48; spell++) {
      const { g, p } = newGame(spell * 31 + 5);
      journeyOnward(g);
      g.options.input = 'letters';
      mage(g);
      const s = g.s;
      Object.assign(s, { mapId: 0, level: 0, x: 86, y: 110 });
      const foe = freeActor(g);
      Object.assign(s.actors[foe], { tile: 0x90, anim: 0x90, x: 86, y: 109, z: 0, b5: 0 }); // giant rats
      const gold0 = s.gold;
      const play = careful(g);
      let cast = false;
      p.next = () => {
        const bad = wrong(g, gold0);
        if (bad) throw new Error(bad);
        const me = g.combat[s.combatTurn];
        if (!cast && me.flags & CF.Player && me.who === 0 && !s.crosshair) {
          cast = true;
          g.castPreset = { caster: 0, spell };
          return 'C'.charCodeAt(0);
        }
        return g.menuShown ? K.Enter : play();
      };
      try {
        await arenaFight(g, 0, foe);
      } catch (e) {
        failed.push(`${SPELL_EFFECTS[spell]}: ${(e as Error).message}`);
      }
    }
    expect(failed).toEqual([]);
  });

  it('serves every shop in every town to random presses, and lets the party go at B', async () => {
    const failed: string[] = [];
    let changed = 0;
    for (let k = 0; k < 8; k++) {
      const maps = new Set([...newGame().g.data.bytes(0x23ca + k * 16, 16)].filter((m) => m > 0 && m <= 0x20));
      for (const map of maps)
        for (let run = 0; run < 8; run++) {
          const seed = k * 1000 + map * 10 + run;
          const { g, p } = newGame(seed);
          journeyOnward(g);
          g.options.input = 'controller';
          Object.assign(g.s, { mapId: map, level: 0, x: 15, y: 20, townAir: run % 3 ? 0xff : 0, gold: [0, 30, 400, 9999][run % 4] });
          const gold0 = g.s.gold;
          const r = seeded(seed);
          let left = 400;
          p.next = () => {
            const bad = wrong(g, gold0);
            if (bad) throw new Error(bad);
            // Out of presses: B alone from here, and the shop must let the party go.
            if (left-- <= 0) {
              if (left < -60) throw new Error('kept in the shop');
              return Pad.B;
            }
            const x = r();
            if (g.menuShown)
              return x < 0.55 ? Pad.A : x < 0.88 ? (r() < 0.5 ? K.Down : K.Up) : x < 0.97 ? (r() < 0.5 ? K.Left : K.Right) : Pad.B;
            return x < 0.85 ? Pad.A : x < 0.9 ? Pad.B : [K.Up, K.Down, K.Left, K.Right][Math.floor(r() * 4)];
          };
          try {
            await merchant(g, 0x81 + k);
            if (g.s.gold !== gold0) changed++;
          } catch (e) {
            failed.push(`shop ${k} in map ${map}, seed ${seed}: ${(e as Error).message}`);
          }
        }
    }
    expect(failed).toEqual([]);
    expect(changed).toBeGreaterThan(100); // the shops did business, not only said good day
  });
});
