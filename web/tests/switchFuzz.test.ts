import { expect, it } from 'vitest';
import { journeyOnward } from '../src/game/run.ts';
import { handsOf, planSwitch, rememberArms, switchWeapon } from '../src/game/switchWeapon.ts';
import { readyFromPack, unequip } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

const ITEMS = [
  0x04, 0x05, 0x06, 0x07, 0x08, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23,
  0x24, 0x25, 0x26, 0x27, 0x28, 0x29,
];
const IGNORED = [0x23, 0x27, 0x28, 0x08];

/**
 * Switch Weapon over many random kits, packs, strengths and memories, under each of the rules: no armament lost or
 * made, never two hands' worth beside a two-handed weapon, never too heavy, never the glass, Chaos or jewelled sword
 * nor the jewel shield, and a switch refused changing nothing.
 */
it('Switch Weapon never loses, duplicates or overloads, over many random kits', async () => {
  let r = 12345;
  const rnd = (n: number) => (r = (r * 1103515245 + 12345) & 0x7fffffff) % n;
  const problems: string[] = [];
  for (let trial = 0; trial < 600; trial++) {
    const { g } = newGame(trial + 1);
    journeyOnward(g);
    g.options.rules = (['story', 'modern', 'classic'] as const)[trial % 3];
    const s = g.s;
    s.equipment.fill(0);
    for (const i of ITEMS) if (rnd(3) === 0) s.equipment[i] = 1 + rnd(3);
    s.equipment[0x1b] = rnd(2) ? 0 : 1 + rnd(20);
    s.equipment[0x1d] = rnd(2) ? 0 : 1 + rnd(20);
    const m = rnd(3);
    s.members[m].str = 5 + rnd(30);
    s.members[m].equips[2] = s.members[m].equips[3] = 0xff;
    const weight = g.data.bytes(0x1aae, 0x30);
    const kind = g.data.bytes(0x1a7e, 0x30);
    const total = (i: number) =>
      s.equipment[i] + s.members.slice(0, 16).reduce((n, p) => n + [...p.equips].filter((e) => e === i).length, 0);
    for (let step = 0; step < 12; step++) {
      const before = ITEMS.map(total);
      const handsBefore = handsOf(g, m).join(',');
      const action = rnd(4);
      try {
        if (action === 0) {
          const pick = ITEMS[rnd(ITEMS.length)];
          if (s.equipment[pick] > 0) await readyFromPack(g, m, pick, () => {});
          rememberArms(g, m, true);
        } else if (action === 1 && handsOf(g, m).length) {
          const off = handsOf(g, m)[rnd(handsOf(g, m).length)];
          unequip(g, m, off);
          if (rnd(2))
            s.equipment[off]++; // put away - or lost (thrown, shattered)
          else before[ITEMS.indexOf(off)]--;
        } else if (action === 2) {
          s.equipment[0x1b] = rnd(2) ? 0 : 5;
        } else {
          const plan = planSwitch(g, m);
          const { done } = switchWeapon(g, m);
          const hands = handsOf(g, m);
          if (!done && hands.join(',') !== handsBefore)
            problems.push(`trial ${trial}: refused yet changed ${handsBefore} -> ${hands.join(',')}`);
          if (done) {
            if (typeof plan === 'string') problems.push(`trial ${trial}: plan refused but done`);
            else if ([...plan.items].sort().join(',') !== [...hands].sort().join(','))
              problems.push(`trial ${trial}: plan ${plan.items.join(',')} vs hands ${hands.join(',')}`);
            if (hands.some((i) => IGNORED.includes(i))) problems.push(`trial ${trial}: took up ignored ${hands.join(',')}`);
            const e = s.members[m].equips;
            const worn =
              [0, 1, 4, 5].reduce((n, k) => n + (e[k] !== 0xff ? weight[e[k]] : 0), 0) + hands.reduce((n, i) => n + weight[i], 0);
            if (worn > s.members[m].str) problems.push(`trial ${trial}: overloaded ${worn} > ${s.members[m].str}`);
          }
        }
      } catch (e) {
        problems.push(`trial ${trial} step ${step} action ${action}: threw ${(e as Error).message}`);
      }
      const hands = handsOf(g, m);
      if (hands.length > 2) problems.push(`trial ${trial}: three in hand ${hands.join(',')}`);
      if (hands.some((i) => kind[i] === 0x30) && hands.length > 1)
        problems.push(`trial ${trial}: two-hander with another ${hands.join(',')}`);
      const e = s.members[m].equips;
      if (e[3] !== 0xff && e[2] !== 0xff && kind[e[2]] === 0x30) problems.push(`trial ${trial}: slot 3 beside a two-hander`);
      const after = ITEMS.map(total);
      ITEMS.forEach((it, k) => {
        if (after[k] !== before[k])
          problems.push(`trial ${trial} step ${step} action ${action}: item ${it.toString(16)} ${before[k]} -> ${after[k]}`);
      });
      if (ITEMS.some((i) => s.equipment[i] > 200)) problems.push(`trial ${trial}: count wrapped`);
    }
  }
  expect(problems.slice(0, 10)).toEqual([]);
});
