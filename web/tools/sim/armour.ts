/**
 * armour.ts (a balance simulation, run by hand)
 *
 * How hard the game's fights are under each of the rules (Story, Modern, Classic): fights played to the end, headless, for a party at four
 * stages of a game - its size, levels, gear, and the spells it has mixed - against creatures from rats to dragons,
 * under Story, Normal and Hard, each matchup over many seeds. For each: how much of the party's hit points the fight
 * cost, how many fell, and how often the party lost. The party plays as a player would (tactics.ts): heals, Negate
 * Magic, Protection and attack spells where they are called for, auto combat's blows and shots the rest of the time.
 *
 *   node --import ./tools/node-ts.mjs tools/sim/armour.ts [-- fights=40] [stage=Mid] [rules=modern] [tactics=off] [log] [storyArmour=6]
 *     [monster names...]
 *
 * With tactics=off the party casts nothing, auto combat alone.
 */

import { freeActor } from '../../src/game/actors.ts';
import { autoKey } from '../../src/game/autocombat.ts';
import { arenaFight } from '../../src/game/combat.ts';
import type { Game } from '../../src/game/game.ts';
import { K } from '../../src/game/io.ts';
import { restedMp } from '../../src/game/rest.ts';
import { journeyOnward } from '../../src/game/run.ts';
import { Status } from '../../src/game/save.ts';
import { ARMOUR_BONUS, RULES, type Rules } from '../../src/game/settings.ts';
import { newGame } from '../../tests/helpers.ts';
import { SP, tacticKey } from './tactics.ts';

/** Items by name (DATA.OVL's table, game/zstats.ts). */
const I = {
  leatherHelm: 0x00, chainCoif: 0x01, ironHelm: 0x02, spikedHelm: 0x03,
  smallShield: 0x04, largeShield: 0x05, spikedShield: 0x06, magicShield: 0x07, jewelShield: 0x08,
  cloth: 0x09, leather: 0x0a, ringMail: 0x0b, scale: 0x0c, chain: 0x0d, plate: 0x0e, mystic: 0x0f,
  dagger: 0x10, sling: 0x11, mainGauche: 0x14, shortSword: 0x17, mace: 0x18, arrows: 0x1b, crossbow: 0x1c,
  quarrels: 0x1d, longSword: 0x1e, magicBow: 0x24, silverSword: 0x25, magicAxe: 0x26, mysticSword: 0x29,
  ringOfProtection: 0x2b, ringOfRegeneration: 0x2c, amuletOfTurning: 0x2d, spikedCollar: 0x2e, ankh: 0x2f,
} as const; // prettier-ignore
const NONE = 0xff;

/**
 * A member, by their place in the roster (INIT.GAM: the Avatar, Shamino, Iolo, Mariah, Geoffrey, Jaana): stats, and
 * what is worn - helm, armour, two hands, ring, amulet (save.ts equips). Unset, as the game begins them.
 */
interface Kit {
  str?: number;
  dex?: number;
  int?: number;
  equips?: number[];
}

/** The party at four stages of a game: its members and level, and the spells it has mixed (each, how many). */
interface Stage {
  name: string;
  level: number | null; // null: the game's own starting levels and hit points
  party: Kit[];
  mixed: Partial<Record<keyof typeof SP, number>>;
}

const STAGES: Stage[] = [
  {
    // The party the game begins with: the Avatar, Shamino and Iolo, as INIT.GAM has them, whole.
    name: 'Start (L2)',
    level: null,
    party: [{}, {}, {}],
    mixed: { heal: 3, missile: 3 },
  },
  {
    name: 'Mid (L4)',
    level: 4,
    party: [
      { str: 18, dex: 18, int: 20, equips: [I.ironHelm, I.chain, I.longSword, I.smallShield, NONE, I.ankh] },
      { str: 22, dex: 24, int: 16, equips: [I.ironHelm, I.chain, I.longSword, I.smallShield, NONE, NONE] },
      { str: 20, dex: 23, int: 18, equips: [I.leatherHelm, I.leather, I.crossbow, NONE, NONE, NONE] },
      { str: 25, dex: 21, int: 16, equips: [I.spikedHelm, I.scale, I.mace, I.spikedShield, NONE, NONE] },
    ],
    mixed: { heal: 8, missile: 8, fireBolt: 4, protection: 2 },
  },
  {
    name: 'Late (L6)',
    level: 6,
    party: [
      { str: 24, dex: 24, int: 25, equips: [I.ironHelm, I.plate, I.silverSword, I.magicShield, I.ringOfProtection, I.ankh] },
      { str: 26, dex: 27, int: 17, equips: [I.ironHelm, I.plate, I.magicAxe, I.largeShield, NONE, NONE] },
      { str: 22, dex: 26, int: 20, equips: [I.chainCoif, I.chain, I.magicBow, NONE, NONE, NONE] },
      { str: 14, dex: 22, int: 26, equips: [NONE, I.leather, I.dagger, NONE, I.ringOfProtection, NONE] },
      { str: 28, dex: 23, int: 16, equips: [I.spikedHelm, I.plate, I.magicAxe, I.largeShield, NONE, NONE] },
      { str: 16, dex: 20, int: 25, equips: [NONE, I.leather, I.sling, NONE, NONE, NONE] },
    ],
    mixed: { heal: 10, greatHeal: 6, missile: 10, fireBolt: 10, negateMagic: 3, protection: 4 },
  },
  {
    name: 'End (L8)',
    level: 8,
    party: [
      { str: 30, dex: 30, int: 30, equips: [I.spikedHelm, I.mystic, I.mysticSword, I.jewelShield, I.ringOfRegeneration, I.amuletOfTurning] },
      { str: 30, dex: 30, int: 18, equips: [I.spikedHelm, I.plate, I.magicAxe, I.jewelShield, I.ringOfProtection, I.spikedCollar] },
      { str: 25, dex: 30, int: 22, equips: [I.ironHelm, I.plate, I.magicBow, NONE, I.ringOfProtection, NONE] },
      { str: 16, dex: 25, int: 30, equips: [I.chainCoif, I.chain, I.magicBow, NONE, I.ringOfProtection, NONE] },
      { str: 30, dex: 26, int: 18, equips: [I.spikedHelm, I.plate, I.magicAxe, I.magicShield, I.ringOfProtection, I.spikedCollar] },
      { str: 18, dex: 24, int: 30, equips: [I.chainCoif, I.chain, I.magicBow, NONE, I.ringOfProtection, NONE] },
    ],
    mixed: { heal: 10, greatHeal: 10, fireBolt: 10, deathBolt: 10, fireStorm: 6, negateMagic: 6, protection: 4 },
  },
]; // prettier-ignore

/** The creatures fought, by their names in the game's table (DATA.OVL 0x18b6). */
const MONSTERS = ['GIANT RATS', 'SLIME', 'ORCS', 'SKELETONS', 'TROLLS', 'GARGOYLE', 'DAEMONS', 'DRAGONS'];

/** What a fight cost the party, and whether it was won. */
interface Result {
  won: boolean;
  lost: number; // fraction of the party's hit points the fight cost (the fallen all of theirs)
  fell: number; // members dead at the end
  mp: number; // fraction of the party's mana spent
  mixed: Record<string, number>; // mixtures cast, by spell (each a mixing's reagents gone)
  ammo: number; // arrows and quarrels loosed
}

const SPELL_NAMES = Object.fromEntries(Object.entries(SP).map(([name, sp]) => [sp, name]));

/** The party set to `stage`: whole, rested, its spells mixed, no potions. */
function equip(g: Game, stage: Stage): void {
  const s = g.s;
  s.partySize = stage.party.length;
  s.mixtures.fill(0);
  s.potions.fill(0);
  for (const [name, n] of Object.entries(stage.mixed)) s.mixtures[SP[name as keyof typeof SP]] = n;
  stage.party.forEach((kit, i) => {
    const m = s.members[i];
    if (kit.str !== undefined) Object.assign(m, { str: kit.str, dex: kit.dex, int: kit.int });
    if (stage.level !== null) {
      m.level = stage.level;
      m.maxHp = stage.level * 30;
    }
    m.hp = m.maxHp;
    m.status = Status.Good;
    if (kit.equips) m.equips.set(kit.equips);
    m.mp = restedMp(g, i);
  });
  s.equipment[I.arrows] = 99;
  s.equipment[I.quarrels] = 99;
  // Past the game's first month: a band of creatures is rolled once for its number, not twice (combat.ts
  // prepareCombat; time.ts clears it at the month's end).
  if (stage.level !== null) s.d5959 = 0;
}

/** One fight of `stage` against creature `kind`, under `rules`, from seed `seed`. */
async function fight(stage: Stage, kind: number, rules: Rules, tactics: boolean, seed: number): Promise<Result> {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  Object.assign(g.options, { input: 'letters', autoCombat: 'off', rules, autoAim: true });
  const s = g.s;
  Object.assign(s, { mapId: 0, level: 0, x: 86, y: 110 });
  equip(g, stage);
  const start = stage.party.map((_, i) => s.members[i].hp);
  const startMp = stage.party.map((_, i) => s.members[i].mp);
  const startMixed = [...s.mixtures];
  const startAmmo = s.equipment[I.arrows] + s.equipment[I.quarrels];
  const foe = freeActor(g);
  Object.assign(s.actors[foe], { tile: 0x40 + kind * 4, anim: 0x40 + kind * 4, x: 86, y: 109, z: 0, b5: 0 });
  let presses = 0;
  const fallen = (): boolean => stage.party.every((_, i) => s.members[i].status === Status.Dead);
  // The player: a spell where one is called for, else auto combat's key (it is never turned on, so it never hands
  // the fight back), else the turn passed.
  p.next = async () => {
    if (fallen()) throw new Error('fallen');
    if (++presses > 40000) {
      if (showLog)
        console.log(
          p.log
            .slice(-3000)
            .replace(/[^\n\x20-\x7e]/g, '')
            .replace(/[ \t]+/g, ' '),
        );
      throw new Error('never ended');
    }
    if (s.battleWon) return K.Escape; // won: leave the field (the treasure left to the player)
    const tactic = tactics ? tacticKey(g, p.keys, negate) : 0;
    if (tactic) return tactic;
    return (await autoKey(g)) || K.Space;
  };
  let won = false;
  try {
    await arenaFight(g, 0, foe);
    won = !fallen();
  } catch (e) {
    if ((e as Error).message !== 'fallen') throw e;
  }
  let lost = 0;
  let fell = 0;
  stage.party.forEach((_, i) => {
    const m = s.members[i];
    if (m.status === Status.Dead) fell++;
    lost += m.status === Status.Dead ? start[i] : Math.max(0, start[i] - m.hp);
  });
  if (showLog) console.log(p.log.replace(/[^\n\x20-\x7e]/g, '').replace(/[ \t]+/g, ' '));
  const pool = startMp.reduce((a, b) => a + b, 0);
  const spent = stage.party.reduce((n, _, i) => n + Math.max(0, startMp[i] - s.members[i].mp), 0);
  const mixed: Record<string, number> = {};
  startMixed.forEach((n, sp) => {
    if (n > s.mixtures[sp]) mixed[SPELL_NAMES[sp] ?? `spell${sp}`] = n - s.mixtures[sp];
  });
  return {
    won,
    lost: lost / start.reduce((a, b) => a + b, 0),
    fell,
    mp: pool ? spent / pool : 0,
    mixed,
    ammo: startAmmo - s.equipment[I.arrows] - s.equipment[I.quarrels],
  };
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const fights = Number(args.find((a) => a.startsWith('fights='))?.slice(7) ?? 40);
const only = args.filter((a) => !a.includes('=') && a !== 'log');
const stageOnly = args.find((a) => a.startsWith('stage='))?.slice(6);
const rulesOnly = args.find((a) => a.startsWith('rules='))?.slice(6);
const tactics = !args.includes('tactics=off');
const negate = !args.includes('negate=off'); // with it off, the party never casts Negate Magic
const showLog = args.includes('log'); // each fight's log, to see it played
// Story's armour bonus tried at another value (storyArmour=6), to weigh a change to it
const storyArmour = args.find((a) => a.startsWith('storyArmour='));
if (storyArmour) ARMOUR_BONUS.story = Number(storyArmour.slice(12));
const { g } = newGame();
const names = g.data.table(0x18b6, 0x30);
const kinds = MONSTERS.filter((m) => !only.length || only.includes(m)).map((m) => [m, names.indexOf(m)] as const);
for (const [monster, kind] of kinds)
  for (const stage of STAGES.filter((st) => !stageOnly || st.name.startsWith(stageOnly)))
    for (const rules of RULES.filter((r) => !rulesOnly || r === rulesOnly)) {
      const won: Result[] = [];
      let all = 0;
      let broken = 0;
      for (let k = 0; k < fights; k++) {
        try {
          const r = await fight(stage, kind, rules, tactics, 1000 + k * 7919 + kind);
          all++;
          if (r.won) won.push(r);
        } catch (e) {
          // A fight that never ended is counted; anything else is a fault in the game, and said.
          if ((e as Error).message !== 'never ended') console.error(`${monster} ${stage.name} ${rules}: ${(e as Error).stack}`);
          else if (showLog) console.log(String(e));
          broken++;
        }
      }
      // What a won fight cost, on average: hit points, the fallen, mana, mixtures by spell, arrows and quarrels.
      const mean = (f: (r: Result) => number) => (won.length ? won.reduce((n, r) => n + f(r), 0) / won.length : null);
      const mixed: Record<string, number> = {};
      for (const r of won) for (const [sp, n] of Object.entries(r.mixed)) mixed[sp] = (mixed[sp] ?? 0) + n / won.length;
      console.log(
        JSON.stringify({
          monster,
          stage: stage.name,
          rules,
          tactics,
          fights: all,
          broken,
          winRate: all ? won.length / all : null,
          hpLost: mean((r) => r.lost),
          fell: mean((r) => r.fell),
          mpSpent: mean((r) => r.mp),
          mixtures: mean((r) => Object.values(r.mixed).reduce((a, b) => a + b, 0)),
          ammo: mean((r) => r.ammo),
          mixed,
        }),
      );
    }
