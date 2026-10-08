import { describe, expect, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import { arenaFight } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { careful, newGame } from './helpers.ts';

/** The creatures that charm and put to sleep, and one that does neither (combat.ts EF, the strike of 0x1c). */
const FOES = { gazers: 0x1c, wisps: 0x25, daemons: 0x26, rats: 0x14 } as const;

interface Tally {
  ended: number;
  broken: string[];
  charms: number;
  shakes: number;
  dozes: number;
}

/** What can never be true mid-fight: a sleeper not asleep, a charm with no charmer, hit points out of their bounds. */
function wrong(g: Game): string | null {
  const s = g.s;
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (!c.flags || c.flags & CF.Dead) continue;
    if (c.flags & CF.Charmed && !g.charmedBy.has(i)) return `combatant ${i} charmed by nobody`;
    if (!(c.flags & CF.Player)) continue;
    const m = s.members[c.who];
    if (m.hp < 0 || m.hp > m.maxHp) return `${m.name} at ${m.hp} of ${m.maxHp}`;
    if (((c.flags & CF.Asleep) !== 0) !== (m.status === Status.Sleeping))
      return `${m.name} asleep ${!!(c.flags & CF.Asleep)}, status ${m.status}`;
    if (m.status === Status.Dead) return `${m.name} dead and fighting`;
  }
  return null;
}

/** `n` fights of the party against `kind` on the grass, played by `player` (or auto combat), under `effects`. */
async function fights(kind: number, effects: 'modern' | 'classic', n: number, auto = false): Promise<Tally> {
  const t: Tally = { ended: 0, broken: [], charms: 0, shakes: 0, dozes: 0 };
  for (let k = 1; k <= n; k++) {
    const { g, p } = newGame(k * 7919 + kind);
    journeyOnward(g);
    Object.assign(g.options, { rules: effects, input: 'letters', autoCombat: auto });
    const s = g.s;
    Object.assign(s, { mapId: 0, level: 0, x: 86, y: 110 });
    const foe = freeActor(g);
    Object.assign(s.actors[foe], { tile: 0x40 + kind * 4, anim: 0x40 + kind * 4, x: 86, y: 109, z: 0, b5: 0 });
    const play = careful(g);
    let presses = 0;
    p.next = () => {
      const bad = wrong(g);
      if (bad) throw new Error(bad);
      if (auto) {
        if (++presses > 5000) throw new Error('the fight never ended');
        // Won, with treasure lying there, which auto combat leaves to the player: the field left. Else handed back
        // (autocombat.ts), and taken up again.
        if (s.battleWon) return K.Escape;
        g.options.autoCombat = true;
        return K.Space;
      }
      return play();
    };
    try {
      await arenaFight(g, 0, foe);
      t.ended++;
    } catch (e) {
      t.broken.push(`${effects} ${k}: ${(e as Error).message}`);
    }
    const log = p.log.replace(/\s+/g, ' ');
    t.charms += (log.match(/possessed!/g) ?? []).length;
    t.shakes += (log.match(/shakes off the charm!/g) ?? []).length;
    t.dozes += (log.match(/Zzzzz/g) ?? []).length;
  }
  return t;
}

/** Fights against the creatures that charm and sleep, played to the end by both Effects settings (combat.ts). */
describe('fights to the end', () => {
  for (const [name, kind] of Object.entries(FOES))
    for (const effects of ['classic', 'modern'] as const)
      it(`against ${name}, ${effects}: every fight ends, nothing ever out of order`, async () => {
        const t = await fights(kind, effects, 20);
        expect(t.broken).toEqual([]);
        expect(t.ended).toBe(20);
        if (effects === 'classic') expect(t.shakes).toBe(0); // as in 1988: nobody shakes a charm off
      });

  it('frees the charmed and wakes the sleepers sooner with Modern than with Classic', async () => {
    const classic = await fights(FOES.gazers, 'classic', 20);
    const modern = await fights(FOES.gazers, 'modern', 20);
    expect(modern.charms).toBeGreaterThan(5);
    expect(modern.shakes).toBeGreaterThan(modern.charms / 2);
    expect(modern.dozes).toBeLessThan(classic.dozes);
  });

  for (const [name, kind] of Object.entries(FOES))
    for (const effects of ['classic', 'modern'] as const)
      it(`against ${name}, ${effects}, auto combat plays every fight to its end`, async () => {
        const t = await fights(kind, effects, 10, true);
        expect(t.broken).toEqual([]);
        expect(t.ended).toBe(10);
      });
});
