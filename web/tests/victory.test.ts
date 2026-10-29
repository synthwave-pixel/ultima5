import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Tune } from '../src/game/music.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/**
 * A fight won (combat.ts victoryTune): the fanfare, and the field's tune turned to the theme - in the suites after the
 * fanfare has sounded, which the music changing under it hid; with the Upgrade's sounds as 1988 had it, at once.
 */
describe('the victory', () => {
  /** What the sound is asked for from "VICTORY!" on, a fight with the giant rats won with Sound `choice`. */
  const won = async (choice: 'classical' | 'upgrade'): Promise<string[]> => {
    const { g, p } = newGame(6);
    journeyOnward(g);
    g.options.soundChoice = choice;
    const s = g.s;
    const { attackCombat } = await import('../src/game/combat.ts');
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    g.musicFollowsMap = true; // as the main loop has it (run.ts)
    const heard: string[] = [];
    const after = (what: string): void => void (/VICTORY/.test(p.log) && heard.push(what));
    const pulse = p.sound.pulse.bind(p.sound);
    p.sound.pulse = async (...a) => {
      after(`pulse ${a[0]}`);
      return pulse(...a);
    };
    (p as { sleep: (ms: number) => Promise<void> }).sleep = async (ms) => after(`wait ${ms}`);
    p.sound.music = (tune: number) => after(`music ${tune}`);
    p.log = '';
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
    g.autoKill = true;
    fly(g, p, [() => (/VICTORY/.test(p.log) ? undefined : Pad.B)], 400);
    try {
      await attackCombat(g, 1);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    return heard;
  };

  it('lets the fanfare sound before the theme in the suites, and has them together with the Upgrade (2001)', async () => {
    const suite = await won('classical');
    const theme = suite.indexOf(`music ${Tune.Theme}`);
    expect(suite.slice(0, theme)).toEqual(['pulse 4600', 'pulse 4600', 'pulse 4600', 'pulse 6100', 'wait 1200']);
    const upgrade = await won('upgrade');
    expect(upgrade[0]).toBe(`music ${Tune.Theme}`);
    expect(upgrade).not.toContain('wait 1200');
  });
});
