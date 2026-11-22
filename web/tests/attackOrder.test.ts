import { describe, expect, it } from 'vitest';
import { attackCommand, placeCombatant } from '../src/game/combat.ts';
import { K, Pad } from '../src/game/io.ts';
import { Status } from '../src/game/save.ts';
import { setView } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

const HELM = 0x03; // a spiked helm: a blow at arm's length
const CROSSBOW = 0x1c;
const MAGIC_AXE = 0x26;

/**
 * Issue #45: in a dungeon room cleared of foes, a crossbow or a magic axe is aimed at a square across the room - a
 * trigger a shot lands on. With a spiked helm on, the helm was asked first: its aim went no further than the next
 * square, and backing out of it ended the Attack before the crossbow was raised. The helm and the hands are taken the
 * furthest reach first.
 */
describe('Attack takes the furthest reach first', () => {
  const room = (weapon: number) => {
    const { g, p } = newGame();
    const s = g.s;
    s.mapId = 0xff;
    s.partySize = 1;
    g.combatMap.fill(0x44);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x44);
    for (const a of s.actors) a.tile = a.anim = 0;
    for (const c of g.combat) Object.assign(c, { flags: 0, x: 0x63, y: 0x63 });
    const m = s.members[0];
    Object.assign(m, { status: Status.Good, hp: 50 });
    m.equips.fill(0xff);
    m.equips[0] = HELM;
    m.equips[2] = weapon;
    s.equipment[0x1d] = 20; // quarrels
    s.equipment[weapon] = 1;
    const i = placeCombatant(g, 0, 1, 2, 5, 0);
    s.actors[g.combat[i].actor].tile = 0x48;
    s.combatTurn = i;
    g.options.input = 'controller';
    g.commandPrompt = 'combat';
    p.next = () => {
      throw new Error('asked');
    };
    return { g, p, s, i };
  };

  for (const [name, weapon] of [
    ['crossbow', CROSSBOW],
    ['magic axe', MAGIC_AXE],
  ] as const) {
    it(`aims the ${name} across the room before the spiked helm, no foe in it`, async () => {
      const { g, p, s, i } = room(weapon);
      p.keys.push(K.Right, K.Right, K.Right, K.Right, K.Right, Pad.A, Pad.B);
      await attackCommand(g, i, 1).catch(() => undefined);
      expect(p.log).not.toMatch(/^Spiked Helm/);
      expect(p.log).toMatch(weapon === CROSSBOW ? /^Crossbow/ : /^Magic Axe/);
      expect(s.crossX).toBe(7); // five squares off: the shot's own reach, not the helm's one
    });
  }
});
