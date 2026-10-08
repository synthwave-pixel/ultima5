import { describe, expect, it } from 'vitest';
import { attackCombat, hitFlash } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { castEffect } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { fighter, keys, newGame } from './helpers.ts';

/**
 * The Standard look's hits and spells, the ultima3 port's: a burst over the one hit, growing over three frames - red
 * for a blow or a missile, blue for magic - and a spell's pulse on the square of the member it falls on, or the view.
 */
describe('hits and spells, as the Standard look shows them', () => {
  const recording = (g: ReturnType<typeof newGame>['g']) => {
    const bursts: [number, number, number, boolean][] = [];
    const pulses: ([number, number] | null)[] = [];
    g.options.tileSet = 'standard';
    g.draw.burst = (x, y, frame, magic) => void bursts.push([x, y, frame, magic]);
    g.draw.pulse = (sq) => void pulses.push(sq);
    g.draw.unpulse = () => {};
    return { bursts, pulses };
  };

  it('bursts over the one hit in three frames, then takes the burst away', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const { bursts } = recording(g);
    g.s.mapId = 0xff;
    const c = g.combat[6];
    c.flags = CF.Monster;
    c.actor = 7;
    [g.s.actors[7].x, g.s.actors[7].y] = [4, 3];
    await hitFlash(g, 6);
    expect(bursts).toEqual([
      [4, 3, 1, false],
      [4, 3, 2, false],
      [4, 3, 3, false],
      [4, 3, 0, false],
    ]);
    bursts.length = 0;
    await hitFlash(g, 6, true);
    expect(bursts.every((b) => b[3])).toBe(true); // magic: blue
  });

  it('pulses the square of the member a spell falls on, and the view for the rest', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const { pulses } = recording(g);
    g.s.mapId = 0;
    g.spellOn = 1;
    await castEffect(g, 1);
    g.spellOn = -1;
    await castEffect(g, 2);
    expect(pulses).toEqual([[5, 5], null]);
  });

  it('is red for a blow and blue for a spell, in a fight', async () => {
    const { g, p } = newGame(7);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const { bursts } = recording(g);
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const spell = 0x2d; // In Flam Hur, a wave of fire
    const words = g.data.table(0x1c30, 0x30)[spell];
    for (const m of s.members.slice(0, s.partySize)) {
      m.level = 8;
      m.mp = 50;
    }
    s.mixtures[spell] = 10;
    const fight = fighter(g);
    let cast = false;
    p.next = () => {
      if (!cast && !s.crosshair) {
        cast = true;
        p.keys.push(...keys(words, K.Enter, K.Up));
        return 'C'.charCodeAt(0);
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(bursts.some((b) => b[2] === 1 && b[3])).toBe(true); // the fire: blue
    expect(bursts.some((b) => b[2] === 1 && !b[3])).toBe(true); // a blow: red
  });
});
