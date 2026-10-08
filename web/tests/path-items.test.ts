import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { enterTown, loadLevel, townLoop } from '../src/game/town.ts';
import { tileAt } from '../src/game/world.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/** A step of a script: a key, a word typed whole, or a function giving keys until it gives undefined. */
type Step = number | string | ((g: Game) => number | undefined);

class Done extends Error {}

/**
 * Play `script` by its letters, as the original is played. The waits a townsman makes while talking (a pause, "press
 * a key") are answered with Enter; everything else waits for the script, and when it is spent the game is stopped.
 */
async function play(g: Game, p: FakePlatform, script: Step[], loop: () => Promise<void>): Promise<void> {
  const typed: number[] = [];
  let at = 0;
  p.next = () => {
    for (;;) {
      if (typed.length) return typed.shift();
      if (g.recording !== null && !/:\s*$/.test(p.log)) return K.Enter;
      if (at >= script.length) throw new Done();
      const step = script[at];
      if (typeof step === 'number') {
        at++;
        return step;
      }
      if (typeof step === 'string') {
        at++;
        typed.push(...[...step].map((c) => c.charCodeAt(0)));
        continue;
      }
      const k = step(g);
      if (k !== undefined) return k;
      at++;
    }
  };
  try {
    await loop();
  } catch (e) {
    if (!(e instanceof Done)) throw e;
  }
}

/** Into settlement `mapId` at `hour`, then to (x, y) on `level`, its people where the hour puts them. */
async function visit(mapId: number, hour: number, level: number, x: number, y: number): Promise<{ g: Game; p: FakePlatform }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  stashWorldActors(g);
  Object.assign(s, { mapId, level: 0, x: 15, y: 30, hour });
  await enterTown(g, true);
  Object.assign(s, { level, x, y });
  loadLevel(g, true);
  s.activeMember = 0; // no "Player:" to answer
  return { g, p };
}

/** Out in Britannia (level 0) or the Underworld (0xff) at (x, y). */
function outside(level: number, x: number, y: number): { g: Game; p: FakePlatform } {
  const { g, p } = newGame();
  journeyOnward(g);
  stashWorldActors(g);
  Object.assign(g.s, { mapId: 0, level, x, y, activeMember: 0 });
  return { g, p };
}

/** The line of the list on show (the Use list, say) whose label matches: the bar steered to it, and Enter. */
function choose(label: RegExp): Step {
  let chosen = false;
  return (g) => {
    if (chosen) return undefined;
    const m = g.menuShown;
    if (!m) throw new Error('no list on show');
    const want = m.labels.findIndex((l) => label.test(l));
    if (want < 0) throw new Error(`no ${String(label)} in ${m.labels.join(' | ')}`);
    if (m.at === want) {
      chosen = true;
      return K.Enter;
    }
    return m.at < want ? K.Down : K.Up;
  };
}

/** The NPC of the settlement's table whose script is `talk`, or whose tile is `type` (a thing kept there). */
const npcOf = (g: Game, want: { talk?: number; type?: number }): number =>
  [...Array(32).keys()].find((i) => (want.talk ? g.s.npcs[i].fa === want.talk : g.s.npcTypes[i] === want.type))!;

/** Everything printed, its line breaks (where the narrow message column wrapped) made spaces. */
const heard = (p: FakePlatform): string => p.log.replace(/\s+/g, ' ');

const [GET, SEARCH, TALK, USE] = [0x47, 0x53, 0x54, 0x55];

/**
 * The artifacts on the game's critical path, each obtained the way a player does it - talked for, searched out,
 * picked up, played for - from where the game's own data puts it: the settlements' tables of people and things
 * (*.NPC), the hidden things of the world (DATA.OVL D_3e78..), and the Underworld's treasures (OUTSUBS_0566).
 */
describe('the artifacts on the path', () => {
  it("is given the grapple by Lord Michael of Empath Abbey, as Bidney of Buccaneer's Den says", async () => {
    // The clue: Bidney (at noon at the Den's south edge) gave his grapple to Lord Michael - his answer to "pirate",
    // once "grapple" has had him tell of his climbing.
    {
      const { g, p } = await visit(24, 12, 0, 12, 29);
      const bidney = g.s.npcs[npcOf(g, { talk: 0x24 })];
      expect([bidney.x, bidney.y]).toEqual([12, 30]);
      await play(g, p, [TALK, K.Down, 'GRAP\r', 'Y\r', 'PIRA\r'], () => townLoop(g));
      expect(heard(p)).toMatch(/Lord Michael/);
    }
    // Lord Michael asks nothing first (no question of whether he knows the Avatar): "grapple", and yes.
    const { g, p } = await visit(31, 12, 1, 25, 8);
    const michael = g.s.npcs[npcOf(g, { talk: 0x10 })];
    expect([michael.x, michael.y, michael.z]).toEqual([25, 7, 1]);
    expect(g.s.grapple).toBe(0);
    await play(g, p, [TALK, K.Up, 'GRAP\r', 'Y\r'], () => townLoop(g));
    expect(heard(p)).toMatch(/Use it well/);
    expect(g.s.grapple).not.toBe(0);
  });

  it("takes the magic carpet from Lord British's study, its door opened with a skull key", async () => {
    // Castle Britannia's second floor at night: the study's door (15, 19) is magically locked (0x97), the carpet the
    // castle's table keeps (a thing, 0x1b) lies just inside it at (15, 18).
    const { g, p } = await visit(17, 22, 2, 15, 20);
    const s = g.s;
    s.skullKeys = 1; // from Minoc's tree (below)
    expect(tileAt(g, 15, 19)).toBe(0x97);
    const carpet = s.npcs[npcOf(g, { type: 0x1b })];
    expect([carpet.x, carpet.y, carpet.z]).toEqual([15, 18, 2]);
    // Use the skull key northward, walk into the door (it opens) and through it, and get what lies to the north.
    await play(g, p, [USE, choose(/skull/i), K.Up, K.Up, K.Up, GET, K.Up], () => townLoop(g));
    expect(heard(p)).toMatch(/A magic carpet!/);
    expect(s.carpets).toBe(1);
    expect(s.skullKeys).toBe(0);
  });

  it("finds five skull keys a day in the tree Minoc's armourer visits at noon", async () => {
    // Shenstone (an armourer, a merchant with no script) stands at (3, 3) from 11 to 13; the tree is at (2, 2), and
    // the hidden things' table (item 0xe) keeps five odd keys there (0x85), again each day.
    const { g, p } = await visit(5, 12, 0, 2, 3);
    const s = g.s;
    expect(tileAt(g, 2, 2)).toBe(0x2e);
    const shenstone = s.npcs[[...Array(32).keys()].find((i) => s.npcTypes[i] === 0x54 && s.npcs[i].fa === 0x81)!];
    expect([shenstone.x, shenstone.y]).toEqual([3, 3]);
    await play(g, p, [SEARCH, K.Up, GET, K.Up, SEARCH, K.Up], () => townLoop(g));
    expect(heard(p)).toMatch(/5 odd keys!/);
    expect(s.skullKeys).toBe(5);
    expect(heard(p)).toMatch(/nothing of note/i); // not twice in a day
    // The next day the tree has five more.
    s.day = (s.day % 28) + 1;
    p.log = '';
    await play(g, p, [SEARCH, K.Up, GET, K.Up], () => townLoop(g));
    expect(s.skullKeys).toBe(10);
  });

  it("buys five skull keys from Kristi, the cook of Serpent's Hold, for 100 gold", async () => {
    // Another source of them (and the clue to the tree): in the morning Kristi is in her kitchen at (23, 7) upstairs.
    const { g, p } = await visit(32, 10, 1, 23, 8);
    const s = g.s;
    s.gold = 500;
    const kristi = s.npcs[npcOf(g, { talk: 0x18 })];
    expect([kristi.x, kristi.y, kristi.z]).toEqual([23, 7, 1]);
    await play(g, p, [TALK, K.Up, 'SKULL\r', 'Y\r'], () => townLoop(g));
    expect(heard(p)).toMatch(/magically ?locked ?doors/);
    expect(s.skullKeys).toBe(5);
    expect(s.gold).toBe(400);
  });

  it('opens the panel with the tune at the harpsichord, and takes the Sandalwood Box behind it', async () => {
    // In the study, on the stool north of the harpsichord (17, 18); the notes are typed as digits.
    const { g, p } = await visit(17, 22, 2, 17, 17);
    const s = g.s;
    const tune = '6789878767653';
    expect([...g.data.bytes(0x275a, 0xd)].join('')).toBe(tune);
    expect(tileAt(g, 17, 18)).toBe(0x8d);
    expect(tileAt(g, 17, 13)).toBe(0x4f); // the wall the tune opens
    const box = s.npcs[npcOf(g, { type: 0x0e })];
    expect([box.x, box.y, box.z]).toEqual([18, 12, 2]);
    // Play; then north through the opened panel to (17, 12), and get the box to the east.
    await play(g, p, [tune, K.Up, K.Up, K.Up, K.Up, K.Up, GET, K.Right], () => townLoop(g));
    expect([s.x, s.y]).toEqual([17, 12]);
    expect(heard(p)).toMatch(/A sandalwood box!/);
    expect(s.sandalwoodBox).not.toBe(0);
    // Taken for good: the castle entered again has no box in it.
    await enterTown(g, true);
    expect(s.actors.some((a) => a.tile === 0x0e)).toBe(false);
  });

  it('is given the Black Badge by Elistaria of Windemere for the password IMPERA', async () => {
    // At noon Elistaria stands at (22, 22); the party is north of her.
    const { g, p } = await visit(28, 12, 0, 22, 21);
    const s = g.s;
    const elistaria = s.npcs[npcOf(g, { talk: 9 })];
    expect([elistaria.x, elistaria.y]).toEqual([22, 22]);
    await play(g, p, [TALK, K.Down, 'IMPERA\r'], () => townLoop(g));
    expect(heard(p)).toMatch(/wear this ?badge/);
    expect(s.blackBadge).not.toBe(0);
  });

  it("picks up the Crown of Lord British on the top floor of Blackthorn's palace", async () => {
    // The Crown is one of the palace's table of people (npc 1, a thing, 0xb5) at (15, 13) on the fourth floor.
    const { g, p } = await visit(18, 12, 3, 15, 14);
    const s = g.s;
    const crown = s.npcs[npcOf(g, { type: 0xb5 })];
    expect([crown.x, crown.y, crown.z]).toEqual([15, 13, 3]);
    await play(g, p, [GET, K.Up], () => townLoop(g));
    expect(heard(p)).toMatch(/The Crown of Lord British!/);
    expect(s.crown).not.toBe(0);
    // Taken for good: the palace entered again has no Crown in it.
    await enterTown(g, true);
    expect(s.actors.some((a) => a.tile === 0xb5)).toBe(false);
  });

  it('flies over the trapdoors round the Sceptre in Stonegate on the magic carpet, and picks it up', async () => {
    // Stonegate stands in mountains only the grapple climbs (Klimb, outdoors); inside, past its magically locked door
    // (15, 27) and its daemon Balinor, who fights whatever the answer to his riddle, is the room where the Sceptre
    // (npc 9, 0xb6) lies at (15, 15), ringed by trapdoors ("a loose brick", 0x8c) that drop the party into lava, and
    // those by pillars but for a gap at (15, 13). The party is in that room, north of the gap, with the carpet from
    // Lord British's study: on it the trapdoors are flown over (TOWN_0f02).
    const { g, p } = await visit(29, 12, 0, 15, 12);
    const s = g.s;
    Object.assign(s, { grapple: 1, carpets: 1 });
    const sceptre = s.npcs[npcOf(g, { type: 0xb6 })];
    expect([sceptre.x, sceptre.y, sceptre.z]).toEqual([15, 15, 0]);
    expect([tileAt(g, 15, 13), tileAt(g, 15, 14)]).toEqual([0x44, 0x8c]);
    await play(g, p, [USE, choose(/carpet|crpt/i), K.Down, K.Down, GET, K.Down], () => townLoop(g));
    expect(heard(p)).not.toMatch(/TRAPDOOR/);
    expect([s.x, s.y]).toEqual([15, 14]);
    expect(heard(p)).toMatch(/The Sceptre of Lord British!/);
    expect(s.sceptre).not.toBe(0);
    await enterTown(g, true);
    expect(s.actors.some((a) => a.tile === 0xb6)).toBe(false);
  });

  it("picks up Lord British's Amulet where it lies in the Underworld", async () => {
    // Not in Destard's rooms (no dungeon holds it) but the Underworld's own treasure: OUTSUBS_0566 lays it, while
    // the party has none, as actor 28 at (0x69, 0xe1). The party stands south of it.
    const { g, p } = outside(0xff, 0x69, 0xe2);
    await play(g, p, [GET, K.Up], () => runGame(g));
    expect(heard(p)).toMatch(/The Amulet of Lord British!/);
    expect(g.s.amulet).not.toBe(0);
  });

  it("searches out a glass sword in the Serpent's Spine, one while the party has none", async () => {
    // The hidden things' item 0xf: a glass sword (arms 0x27) on the grass at (64, 80), ringed by rocks; the party
    // has klimbed onto the rock south of it with the grapple.
    const { g, p } = outside(0, 64, 81);
    const s = g.s;
    s.grapple = 1;
    expect(g.data.table(0x17f6, 0x30)[0x27]).toMatch(/Glass Sword/i);
    await play(g, p, [SEARCH, K.Up, GET, K.Up, SEARCH, K.Up], () => runGame(g));
    expect(tileAt(g, 64, 81)).toBe(0xc);
    expect(heard(p)).toMatch(/Glass Sword!/i);
    expect(s.equipment[0x27]).toBe(1);
    expect(heard(p)).toMatch(/nothing of note/i); // not a second while the party has one
  });

  it('takes the shards of Falsehood, Hatred and Cowardice from the Underworld', async () => {
    // Where OUTSUBS_0566 lays them (D_3a06.., while their Shadowlords live): Falsehood on an islet in a lake, Hatred
    // ringed by mountains, Cowardice in the open. A dungeon's bottom lets out at the dungeon's own place in the
    // Underworld (DUNGEON_1d08), not beside a shard: the party gets there across the Underworld, and stands south.
    const { g } = newGame();
    const [xs, ys] = [[...g.data.bytes(0x3a06, 3)], [...g.data.bytes(0x3a0a, 3)]];
    expect([xs, ys]).toEqual([
      [192, 130, 176],
      [80, 65, 184],
    ]);
    const names = [/Falsehood/, /Hatred/, /Cowardice/];
    for (let i = 0; i < 3; i++) {
      const { g, p } = outside(0xff, xs[i], ys[i] + 1);
      await play(g, p, [GET, K.Up], () => runGame(g));
      expect(heard(p)).toMatch(/The Shard of/);
      expect(heard(p)).toMatch(names[i]);
      expect([...g.s.shards].map((n) => n !== 0)).toEqual([0, 1, 2, 3].map((k) => k === i));
    }
  });
});
