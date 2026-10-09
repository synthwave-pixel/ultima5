/**
 * showcase.ts
 *
 * Saved games to import (Settings, Import saved game) at the game's interesting places, each with a party of the
 * level, gear and quest progress a player would have there: for screenshots, trailers and testing. Built from INIT.GAM
 * with the developer's own DOS files (gamedata/), as the tests are, and written as exported games into
 * screenshots/saves/ (not kept in the repository).
 *
 *   npm run saves
 *
 * Every one is the same Avatar, "Showcase", so each import offers to replace the last (kept among its earlier saves)
 * rather than filling the eight places for characters. The settings are the game's defaults (controller play).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { actorTileAt, canEnter } from '../../src/game/actors.ts';
import type { Game } from '../../src/game/game.ts';
import { unstashWorldActors } from '../../src/game/outdoors.ts';
import { journeyOnward } from '../../src/game/run.ts';
import { DEFAULTS } from '../../src/game/settings.ts';
import { enterTown, loadLevel } from '../../src/game/town.ts';
import { tileAt } from '../../src/game/world.ts';
import { exportText } from '../../src/game/transfer.ts';
import { newGame } from '../../tests/helpers.ts';

const OUT = fileURLToPath(new URL('../../../screenshots/saves/', import.meta.url));

/** Companions to join the party (INIT.GAM's records, waiting to be met). */
type Companion = 'Mariah' | 'Geoffrey' | 'Jaana' | 'Julia' | 'Dupre' | 'Katrina' | 'Gwenno' | 'Johne';

/** Readied gear, [helm, armour, left hand, right hand, ring, amulet] (0xff none), by stage and class. */
type Kit = [number, number, number, number, number, number];
type Stage = 'early' | 'mid' | 'late' | 'end';
const N = 0xff;
const KITS: Record<Stage, Record<'A' | 'F' | 'B' | 'M', Kit>> = {
  // Leather and short swords; the bard's bow, the mage's dagger.
  early: { A: [1, 0xb, 0x17, 4, N, 0x2f], F: [0, 0xa, 0x17, 4, N, N], B: [0, 0xa, 0x1a, N, N, N], M: [N, 9, 0x10, N, N, N] },
  // Chain and long swords; a crossbow.
  mid: { A: [2, 0xd, 0x1e, 5, N, 0x2f], F: [2, 0xd, 0x1e, 5, N, N], B: [1, 0xc, 0x1c, N, N, N], M: [0, 0xa, 0x10, 4, N, N] },
  // Plate and magic arms; rings of protection.
  late: { A: [3, 0xe, 0x25, 7, 0x2b, 0x2f], F: [3, 0xe, 0x26, 6, 0x2b, N], B: [2, 0xd, 0x24, N, 0x2b, N], M: [1, 0xc, 0x10, 7, 0x2b, N] },
  // Mystic arms and armour; jewel shields; regeneration.
  end: { A: [3, 0xf, 0x29, 8, 0x2c, 0x2f], F: [3, 0xf, 0x29, 8, 0x2b, N], B: [3, 0xe, 0x24, N, 0x2b, 0x2d], M: [2, 0xf, 0x29, 8, 0x2c, N] },
};
/** Ammunition for the bows readied (arrows, quarrels). */
const AMMO: Record<number, number> = { 0x1a: 0x1b, 0x1c: 0x1d, 0x24: 0x1b };

interface Party {
  stage: Stage;
  /** The members' level (the Avatar's; the others one less, but never below 1). */
  level: number;
  /** Companions who have joined, after Shamino and Iolo. */
  join?: Companion[];
  gold: number;
  food: number;
}

/** A member at `level`: its hit points, experience, a little more of each attribute, and full magic. */
function raise(g: Game, i: number, level: number): void {
  const m = g.s.members[i];
  m.level = level;
  m.maxHp = m.hp = level * 30;
  m.exp = level === 1 ? 50 : (100 << (level - 2)) + 25;
  const more = Math.max(0, level - 2) * 2;
  m.str = Math.min(30, m.str + more);
  m.dex = Math.min(30, m.dex + more);
  m.int = Math.min(30, m.int + more);
  m.mp = m.cls === 0x42 ? m.int >> 1 : m.cls === 0x41 || m.cls === 0x4d ? m.int : 0;
  m.status = 0x47;
}

/** The party: companions joined (their records moved up into the party's places), levels, gear, gold and food. */
function party(g: Game, p: Party): void {
  const s = g.s;
  for (const [n, name] of (p.join ?? []).entries()) {
    const at = 3 + n;
    const from = s.members.findIndex((m) => m.name === name);
    if (from < at) throw new Error(`${name} is not waiting to join`);
    const a = s.members[at].b;
    const b = s.members[from].b;
    const keep = a.slice();
    a.set(b);
    b.set(keep);
    s.members[at].mapId = 0;
  }
  s.partySize = 3 + (p.join?.length ?? 0);
  s.equipment.fill(0);
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    raise(g, i, i === 0 ? p.level : Math.max(1, p.level - 1));
    const kit = KITS[p.stage][String.fromCharCode(m.cls) as 'A' | 'F' | 'B' | 'M'];
    m.equips.set(kit);
    for (const item of kit) if (item !== N) s.equipment[item]++;
    const ammo = AMMO[kit[2]];
    if (ammo !== undefined) s.equipment[ammo] += 60;
  }
  s.equipment[0x13] += 4; // flaming oil
  s.gold = p.gold;
  s.food = p.food;
  s.keys = { early: 2, mid: 6, late: 10, end: 15 }[p.stage];
  s.gems = { early: 1, mid: 5, late: 10, end: 20 }[p.stage];
  s.torches = { early: 3, mid: 8, late: 12, end: 20 }[p.stage];
  const reagents = { early: 2, mid: 10, late: 25, end: 40 }[p.stage];
  s.reagents.fill(reagents);
  // Spells mixed: the first circles from mid-game on, every one by the end.
  const mixed = { early: 0, mid: 12, late: 24, end: 0x30 }[p.stage];
  for (let i = 0; i < mixed; i++) s.mixtures[i] = p.stage === 'end' ? 9 : 4;
  s.potions.fill({ early: 0, mid: 1, late: 2, end: 3 }[p.stage]);
  s.scrolls.fill({ early: 0, mid: 0, late: 1, end: 2 }[p.stage]);
  if (p.stage !== 'early') s.grapple = 1;
  if (p.stage === 'late' || p.stage === 'end') {
    s.spyglasses = s.sextants = s.pocketWatch = 0xff;
    s.skullKeys = 3;
    s.karma = 90;
  }
  if (p.stage === 'end') {
    for (let i = 0; i < 3; i++) s.shards[i] = 0xff;
    s.crown = s.sceptre = s.amulet = s.sandalwoodBox = s.blackBadge = 0xff;
    s.carpets = 1;
    s.skullKeys = 8;
    s.karma = 99;
  }
}

/** Into settlement `mapId` (1-32) on `level`, at (x, y); by default at the middle of its south edge, as arrived. */
async function town(g: Game, mapId: number, hour: number, at?: { x: number; y: number; level: number }): Promise<void> {
  const s = g.s;
  // From Iolo's hut, where a new game begins: the world's actors are in their files already (not stashed again).
  Object.assign(s, { mapId, level: 0, x: 15, y: 30, hour, minute: 0 });
  await enterTown(g, true);
  if (at) {
    Object.assign(s, at);
    loadLevel(g, true);
    return;
  }
  // A few steps in from the edge, up the way the party came in, while the way is open.
  for (let i = 0; i < 8 && canEnter(g, s.partyTile, tileAt(g, s.x, s.y - 1)) && !actorTileAt(g, s.x, s.y - 1, 0); i++) s.y--;
}

/** Out in Britannia, or the Underworld (`under`), at (x, y): the world's actors brought back from its file. */
function outdoors(g: Game, x: number, y: number, hour: number, under = false): void {
  const s = g.s;
  Object.assign(s, { mapId: 0, level: under ? 0xff : 0, x, y, hour, minute: 0 });
  unstashWorldActors(g);
}

/** A light spell cast (In Lor, as magic.ts gives it), for the dark below: the dungeons and the Underworld. */
function lit(g: Game): void {
  g.s.d58a6 = 0xf0;
  g.s.light = 0x12;
}

/** At the top of dungeon `mapId` (0x21-0x28), as the cheats' Go to puts the party there: its Word of Power spoken. */
function dungeon(g: Game, mapId: number): void {
  const s = g.s;
  const i = mapId - 0x21;
  s.d58d0[i] = 1;
  s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(i * 0x200, i * 0x200 + 0x200));
  Object.assign(s, { mapId, level: 0, x: 1, y: 1, facing: 1, d6602: 5 });
  lit(g);
}

interface Showcase {
  file: string;
  what: string;
  make(g: Game): Promise<void> | void;
}

const SHOWCASES: Showcase[] = [
  {
    file: '01-new-game',
    what: "A new game at Iolo's hut, as INIT.GAM has it.",
    make: () => undefined,
  },
  {
    file: '02-britain-market',
    what: 'Britain at noon: the early party arrives with gold for the shops.',
    async make(g) {
      party(g, { stage: 'early', level: 2, gold: 400, food: 150 });
      await town(g, 0x02, 12);
    },
  },
  {
    file: '03-buccaneers-den',
    what: "Buccaneer's Den, the pirates' town, Dupre along: gold for the guild and the shipwrights.",
    async make(g) {
      party(g, { stage: 'early', level: 3, join: ['Dupre'], gold: 1500, food: 200 });
      await town(g, 0x18, 14);
    },
  },
  {
    file: '04-harpsichord',
    what: "Lord British's study, on the stool at his harpsichord, Lord Kenneth's lesson in the journal: walk south.",
    async make(g) {
      party(g, { stage: 'early', level: 3, join: ['Dupre'], gold: 600, food: 200 });
      await town(g, 0x11, 12, { x: 17, y: 17, level: 2 });
      if (tileAt(g, 17, 17) !== 0x92 || tileAt(g, 17, 18) !== 0x8d) throw new Error('not on the harpsichord stool');
      g.notes.push({ who: 'Lord Kenneth', where: 'Greyhaven', text: 'The first phrase goes 678 987 8767653.', date: '' });
    },
  },
  {
    file: '05-lycaeum',
    what: "The Lycaeum, the mages' hall, Mariah along: reagents and spells mixed.",
    async make(g) {
      party(g, { stage: 'mid', level: 4, join: ['Dupre', 'Mariah'], gold: 900, food: 250 });
      await town(g, 0x1e, 10);
    },
  },
  {
    file: '06-shrine',
    what: 'Beside a Shrine of Virtue in the south-west, on open grass, in the morning.',
    make(g) {
      party(g, { stage: 'mid', level: 4, join: ['Dupre', 'Mariah'], gold: 900, food: 250 });
      outdoors(g, 35, 229, 10);
    },
  },
  {
    file: '07-magic-carpet',
    what: "Flying the magic carpet by Lord British's castle.",
    make(g) {
      party(g, { stage: 'mid', level: 5, join: ['Dupre', 'Jaana'], gold: 1200, food: 300 });
      g.s.carpets = 1;
      outdoors(g, 85, 108, 11);
      g.s.partyTile = 0x14;
    },
  },
  {
    file: '08-frigate',
    what: "Aboard a frigate off Buccaneer's Den.",
    make(g) {
      party(g, { stage: 'mid', level: 5, join: ['Dupre', 'Jaana'], gold: 1200, food: 400 });
      outdoors(g, 138, 158, 13);
      g.s.partyTile = 0x20;
      g.s.actors[0].b5 = 99; // the hull, whole
    },
  },
  {
    file: '09-dungeon-deceit',
    what: 'The top of Deceit, a light spell cast: the dungeons in first person.',
    make(g) {
      party(g, { stage: 'mid', level: 5, join: ['Dupre', 'Jaana', 'Geoffrey'], gold: 1500, food: 400 });
      dungeon(g, 0x21);
    },
  },
  {
    file: '10-underworld',
    what: "The Underworld, out of Deceit's depths: a strong party of six.",
    make(g) {
      party(g, { stage: 'late', level: 6, join: ['Dupre', 'Jaana', 'Geoffrey'], gold: 2500, food: 500 });
      g.s.d58d0.fill(1);
      outdoors(g, 240, 75, 12, true);
      lit(g);
    },
  },
  {
    file: '11-stonegate',
    what: "Stonegate, the Shadowlords' keep: the air of their three falsehoods about the party.",
    async make(g) {
      party(g, { stage: 'late', level: 6, join: ['Dupre', 'Jaana', 'Geoffrey'], gold: 2500, food: 500 });
      await town(g, 0x1d, 12);
    },
  },
  {
    file: '12-blackthorns-palace',
    what: "Blackthorn's palace, the Black Badge in hand: the late game.",
    async make(g) {
      party(g, { stage: 'late', level: 7, join: ['Dupre', 'Jaana', 'Geoffrey'], gold: 3500, food: 600 });
      g.s.blackBadge = 0xff;
      await town(g, 0x12, 12);
    },
  },
  {
    file: '13-doom',
    what: "Doom, at the end: its first room's fight begins at once - level 8, mystic arms, the quest's items, every spell.",
    make(g) {
      party(g, { stage: 'end', level: 8, join: ['Dupre', 'Jaana', 'Geoffrey'], gold: 5000, food: 800 });
      g.s.d58d0.fill(1);
      dungeon(g, 0x28);
    },
  },
];

mkdirSync(OUT, { recursive: true });
for (const show of SHOWCASES) {
  const { g } = newGame();
  journeyOnward(g);
  g.s.members[0].name = 'Showcase';
  await show.make(g);
  g.options = { ...DEFAULTS };
  g.inPlay = true;
  const text = exportText(g);
  if (!text) throw new Error(`${show.file}: nothing to export`);
  writeFileSync(`${OUT}${show.file}.json`, text);
  console.log(`${show.file}.json  ${show.what}`);
}
