import { describe, expect, it } from 'vitest';
import { readBritannia, readUnderworld } from '../src/data/maps.ts';
import { canEnter } from '../src/game/actors.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { Status } from '../src/game/save.ts';
import { T } from '../src/game/tiles.ts';
import { fighter, keys, newGame, type FakePlatform } from './helpers.ts';
import { command, fly, Landed, pick } from './pilot.ts';

/** A step of a script: a key, the letters of a word, or a player's move that gives keys until it has none. */
type Step = number | string | ((g: Game) => number | undefined);

/** Play from where the party stands: `steps` in turn, then whatever player was set before (p.next), until both run out. */
async function play(g: Game, p: FakePlatform, ...steps: Step[]): Promise<void> {
  const queue = steps.flatMap((k) => (typeof k === 'string' ? keys(k) : [k]));
  const then = p.next;
  let at = 0;
  p.next = () => {
    for (; at < queue.length; at++) {
      const k = queue[at];
      if (typeof k === 'number') {
        at++;
        return k;
      }
      const got = k(g);
      if (got !== undefined) return got;
    }
    return then?.();
  };
  await runGame(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
}

/** Play by controller (pilot.ts fly) until its steps are spent. */
async function flown(g: Game): Promise<void> {
  await runGame(g).catch((e: Error) => {
    if (!(e instanceof Landed)) throw e;
  });
}

/** In the list `title` (g.menuShown, as a player sees it), move the bar to the line matching `label` and take it. */
function choose(title: string, label: RegExp): (g: Game) => number | undefined {
  let done = false;
  return (g) => {
    if (done) return undefined;
    const m = g.menuShown;
    if (!m || m.title !== title) throw new Error(`expected the ${title} list, found ${m?.title ?? 'none'}`);
    const want = m.labels.findIndex((l) => label.test(l));
    if (want < 0) throw new Error(`no ${String(label)} in ${title}: ${m.labels.join(' | ')}`);
    if (m.at === want) {
      done = true;
      return K.Enter;
    }
    return m.at < want ? K.Down : K.Up;
  };
}

/** The eight dungeons' names, their Words of Power (DATA.OVL 0x4502) and where they open (locations 0x20-0x27). */
const dungeon = (g: Game, i: number): { name: string; word: string; x: number; y: number } => ({
  name: g.data.table(0x1e3a, 0x28)[0x20 + i],
  word: g.data.table(0x4502, 8)[i],
  x: g.data.locations[0x20 + i].x,
  y: g.data.locations[0x20 + i].y,
});

/** A square beside (x, y) the party could stand on, on foot; and the arrow key that walks from it to (x, y). */
function beside(g: Game, map: Uint8Array, x: number, y: number): { x: number; y: number; key: number } {
  const sides: [number, number, number][] = [
    [0, 1, K.Up],
    [-1, 0, K.Right],
    [1, 0, K.Left],
    [0, -1, K.Down],
  ];
  for (const [dx, dy, key] of sides) {
    const t = map[((y + dy) & 0xff) * 256 + ((x + dx) & 0xff)];
    if (canEnter(g, 0x1c, t)) return { x: x + dx, y: y + dy, key };
  }
  throw new Error(`nowhere to stand beside ${x},${y}`);
}

/** A party that will live through a dungeon's traps and fights: every member good, with hit points to spare. */
function hardy(g: Game): void {
  const s = g.s;
  for (let m = 0; m < s.partySize; m++) Object.assign(s.members[m], { status: Status.Good, hp: 500, maxHp: 500 });
  s.food = 500;
  g.autoKill = true; // a fight on the way is over at the party's first turn (the development build's auto kill)
}

/**
 * A player who knows the dungeon's map: at each dungeon prompt the shortest way (by the level map as it is now) to
 * a ladder out - down from the last level, or up from the first - is worked out afresh, and the next step of it
 * taken: advance, back up, turn, or klimb (a pit is walked into and fallen through). Rooms (whose doors lead into
 * fights) and walls are gone round. A creature met on the way is fought (helpers' fighter), and the field left; any
 * other prompt is passed. Once the party is out of the dungeon it has no more keys.
 */
function navigate(g: Game, p: FakePlatform, out: 'down' | 'up', budget = 3000): void {
  const s = g.s;
  let pending: number[] = [];
  const fight = fighter(g);
  p.next = () => {
    if (--budget < 0) throw new Error(`lost in the dungeon at ${s.level},${s.x},${s.y}: ${p.log.slice(-400)}`);
    if (pending.length) return pending.shift();
    if (s.mapId === 0) return undefined;
    if (g.commandPrompt === 'combat' || s.crosshair) return fight();
    if (g.commandPrompt !== 'dungeon') return K.Space;
    const cell = (l: number, x: number, y: number): number => s.dungeon[l * 64 + (y & 7) * 8 + (x & 7)] & 0xf0;
    const downs = (c: number): boolean => c === 0x20 || c === 0x30 || c === 0x60;
    const ups = (c: number): boolean => c === 0x10 || c === 0x30;
    const key = (l: number, x: number, y: number): number => l * 64 + y * 8 + x;
    const first = new Map<number, number[]>(); // square -> the keys of the first step toward it
    const queue: [number, number, number][] = [[s.level, s.x, s.y]];
    first.set(key(s.level, s.x, s.y), []);
    for (let q = 0; q < queue.length; q++) {
      const [l, x, y] = queue[q];
      const c = cell(l, x, y);
      const how = first.get(key(l, x, y))!;
      const klimb = (u: boolean): number[] => (c === 0x30 ? keys('K', u ? 'U' : 'D') : keys('K'));
      if ((out === 'down' && l === 7 && downs(c)) || (out === 'up' && l === 0 && ups(c))) {
        pending = how.length ? how : klimb(out === 'up');
        return pending.shift();
      }
      const next: [number, number, number, number[]][] = [];
      for (let dir = 0; dir < 4; dir++) {
        const nx = (x + [0, 1, 0, -1][dir]) & 7;
        const ny = (y + [-1, 0, 1, 0][dir]) & 7;
        const nc = cell(l, nx, ny);
        if (nc >= 0xa0 && nc < 0xe0) continue; // walls, doors that do not open, and rooms
        if (nc >= 0x70 && nc < 0xa0) continue; // fields and the like: gone round
        if (nc === 0xf0) continue;
        const turn = (dir - s.facing + 4) & 3;
        next.push([l, nx, ny, [[K.Up, K.Right, K.Down, K.Left][turn]]]);
      }
      if (downs(c) && l < 7) next.push([l + 1, x, y, klimb(false)]);
      if (ups(c) && l > 0) next.push([l - 1, x, y, klimb(true)]);
      for (const [nl, nx, ny, k] of next) {
        if (first.has(key(nl, nx, ny))) continue;
        first.set(key(nl, nx, ny), how.length ? how : k);
        queue.push([nl, nx, ny]);
      }
    }
    throw new Error(`no way ${out} from ${s.level},${s.x},${s.y}`);
  };
}

/**
 * The way to the end, as the walkthrough plays it: the sealed dungeons opened by their Words of Power, down
 * through one to the Underworld, across its dark and its mountains, into Doom by the word at its mouth, and on to
 * the Mirror and Lord British. Each step is played at the keyboard from where a player would stand.
 */
describe('the path through the Underworld', () => {
  it('opens each sealed dungeon with its word of power, and no other word opens it', async () => {
    for (let i = 0; i < 7; i++) {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      const d = dungeon(g, i);
      const at = beside(g, readBritannia(g.data.files, g.data.ovl).tiles, d.x, d.y);
      Object.assign(s, { mapId: 0, level: 0, x: at.x, y: at.y, activeMember: 0 });
      // First the wrong words: another dungeon's, which the land hears but this door does not, and a shout.
      const other = dungeon(g, (i + 1) % 7).word;
      await play(g, p, 'Y', other, K.Enter, 'Y', 'OPEN', K.Enter, at.key, 'E');
      expect(p.log, d.name).toMatch(/A word of power\s+is uttered/);
      expect(p.log, d.name).toMatch(/No effect!/);
      expect(s.d58d0[i], d.name).toBe(0);
      expect(s.mapId, d.name).toBe(0);
      // Then its own word, a step into the open mouth, and Enter.
      p.log = '';
      await play(g, p, 'Y', d.word, K.Enter, at.key, 'E');
      expect(s.d58d0[i], d.name).not.toBe(0);
      expect(p.log, d.name).toContain(d.name);
      // Shame's first square is a room: the party is inside, in the fight the room holds.
      expect(s.mapId === 0xff ? s.savedMapId : s.mapId, d.name).toBe(0x21 + i);
      expect(s.level, d.name).toBe(0);
    }
  });

  it('goes down through Despise to the Underworld by its ladders, and climbs back up to Britannia', async () => {
    const { g, p } = newGame(7);
    journeyOnward(g);
    const s = g.s;
    const d = dungeon(g, 1);
    hardy(g);
    s.d58d0[1] = 0x80; // its word yelled (as above)
    Object.assign(s, { mapId: 0, level: 0, x: d.x, y: d.y, activeMember: 0 });
    navigate(g, p, 'down');
    await play(g, p, 'E');
    expect(p.log).toMatch(/Exit to\s+Underworld!/);
    expect([s.mapId, s.level, s.x, s.y]).toEqual([0, 0xff, d.x, d.y]);
    // Back in from below: the party comes in at the foot of the dungeon, and klimbs out at its top.
    p.log = '';
    navigate(g, p, 'up');
    await play(g, p, 'E');
    expect(p.log).toMatch(/Exit to\s+Britannia!/);
    expect([s.mapId, s.level, s.x, s.y]).toEqual([0, 0, d.x, d.y]);
  });

  it("leaves Shame's last level for the Underworld by Des Por, as the walkthrough goes", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const d = dungeon(g, 5);
    // The party on Shame's seventh level, on open floor, as the walk down leaves it (MAINOUT_0790's set-up).
    stashWorldActors(g);
    s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(5 * 0x200, 6 * 0x200));
    Object.assign(s, { mapId: 0x26, level: 7, x: 1, y: 1, facing: 1, d6602: 5, activeMember: 0 });
    expect(s.dungeon[7 * 64 + 1 * 8 + 1] & 0xf0).toBe(0);
    const desPor = 0x16;
    s.mixtures[desPor] = 1;
    Object.assign(s.members[0], { level: 8, mp: 40 });
    await play(g, p, 'C', ...g.data.table(0x1c30, 0x30)[desPor], K.Enter);
    expect(p.log).toMatch(/DES +POR/);
    expect(p.log).toMatch(/Exit to\s+Underworld!/);
    expect([s.mapId, s.level, s.x, s.y]).toEqual([0, 0xff, d.x, d.y]);
    expect(s.mixtures[desPor]).toBe(0);
  });

  it("keeps the party in the Underworld's dark until it wears Lord British's Amulet", async () => {
    // The dark (tile 0xff) is a ring round Doom's mouth at 128,128, inside its mountains; a hidden way (tile 0x8f)
    // winds in to it, and at 122,126 the party stands on it with the dark to the east.
    for (const amulet of [false, true]) {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      const under = readUnderworld(g.data.files).tiles;
      expect([122, 123, 124, 125].map((x) => under[126 * 256 + x])).toEqual([0x8f, 0xff, 0xff, 0xff]);
      stashWorldActors(g);
      Object.assign(s, { mapId: 0, level: 0xff, x: 122, y: 126, activeMember: 0 });
      if (amulet) {
        s.amulet = 0xff; // taken up where it lies (padplay: 'a shard, by controller')
        await play(g, p, 'U', choose('Items', /Amulet/));
        expect(p.log).toMatch(/Wearing the\s+Amulet/);
        expect(g.regalia).toBe(0x0e);
      }
      await play(g, p, K.Right, K.Right, K.Right);
      if (amulet) {
        expect(s.x).toBe(125); // on through the dark, three squares
      } else {
        // In 1988 one step took the party into the dark, where the light went out and a move key only turned it
        // (MAINOUT_0a1a, MAINOUT_0490): no further, nor back, for good. The port keeps it out: Blocked! (darkness.test).
        expect(s.x).toBe(122);
        expect(p.log).toMatch(/Blocked!/);
      }
    }
  });

  it('blinks over a range of mountains in the Underworld', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const under = readUnderworld(g.data.files).tiles;
    // At 108,20 the party stands with four squares of mountains to the north and grass beyond them.
    const walk = (y: number): boolean => canEnter(g, 0x1c, under[y * 256 + 108]);
    expect([20, 19, 18, 17, 16].map(walk)).toEqual([true, false, false, false, false]);
    expect(under[15 * 256 + 108]).toBe(T.Grass);
    stashWorldActors(g);
    Object.assign(s, { mapId: 0, level: 0xff, x: 108, y: 20, activeMember: 0 });
    await play(g, p, K.Up);
    expect(p.log).toMatch(/Blocked!/);
    expect([s.x, s.y]).toEqual([108, 20]);
    const inPor = 0x11;
    s.mixtures[inPor] = 1;
    Object.assign(s.members[0], { level: 8, mp: 40 });
    await play(g, p, 'C', ...g.data.table(0x1c30, 0x30)[inPor], K.Enter, K.Up);
    expect(p.log).toMatch(/IN +POR/);
    // As far north as the grass goes in the loaded map (CAST_05dc): past the mountains, on grass.
    expect(s.x).toBe(108);
    expect(s.y).toBeLessThanOrEqual(15);
    expect(under[s.y * 256 + s.x]).toBe(T.Grass);
    expect(s.level).toBe(0xff);
  });

  it("opens Doom's mouth at 128,128 below with Veramocor, a word only the Codex teaches, and lets in only the Shadowlords' bane", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const doom = dungeon(g, 7);
    expect([doom.name, doom.word, doom.x, doom.y]).toEqual(['DOOM', 'VERAMOCOR', 0x80, 0x80]);
    const under = readUnderworld(g.data.files).tiles;
    // The Codex's square: its tile stands in Britannia, on its isle.
    const codex = readBritannia(g.data.files, g.data.ovl).tiles.indexOf(T.Codex);
    expect(codex).toBeGreaterThanOrEqual(0);
    expect(under[doom.y * 256 + doom.x]).toBe(T.Cave);
    stashWorldActors(g);
    const nearDoom = { mapId: 0, level: 0xff, x: doom.x, y: doom.y - 1 }; // in the dark, north of the mouth
    Object.assign(s, nearDoom);
    g.regalia = 0x0e; // the Amulet worn (as above), else the dark holds the party
    s.protection = 0xff;
    // A player with a controller yells only words heard: before the Codex, Veramocor is not among them.
    let offered: string[] = [];
    const look: Step = (game) => {
      if (offered.length) return undefined;
      offered = game.menuShown?.labels ?? [];
      return Pad.B;
    };
    fly(g, p, [command('Yell'), look]);
    await flown(g);
    expect(offered).not.toContain('Veramocor');
    expect(s.d58d0[7]).toBe(0);

    // The last quest answered at the Codex, the word is read from its page.
    for (let i = 1; i < 32; i++) s.actors[i].tile = s.actors[i].anim = 0;
    Object.assign(s, { mapId: 0, level: 0, x: codex % 256, y: codex >> 8 });
    s.questActive = 0x80;
    s.questDone = 0x7f;
    fly(g, p, [command('Enter'), (game) => (game.commandPrompt === '' ? Pad.A : undefined)], 200);
    await flown(g);
    expect(g.words.knows(doom.word)).toBe(true);

    // Back at Doom, it is yelled: the mouth opens.
    Object.assign(s, nearDoom);
    g.regalia = 0x0e;
    fly(g, p, [command('Yell'), pick('Yell', 'Veramocor'), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    await flown(g);
    expect(p.log).toMatch(/A word of power\s+is uttered/);
    expect(s.d58d0[7]).not.toBe(0);

    // Walked into and entered while a Shadowlord lives: attacked at the entrance, and not let in (MAINOUT_0790).
    g.options.input = 'letters';
    p.next = undefined;
    await play(g, p, K.Down, 'E');
    expect(p.log).toMatch(/Attacked at\s+entrance!/);
    expect(s.mapId).toBe(0xff); // on the field, facing a Shadowlord, not in Doom
    expect(g.combat.some((c) => c.flags && s.actors[c.actor].tile === 0xfc)).toBe(true);
  });

  it('lets the party into Doom once the three Shadowlords are destroyed', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const doom = dungeon(g, 7);
    stashWorldActors(g);
    Object.assign(s, { mapId: 0, level: 0xff, x: doom.x, y: doom.y - 1, activeMember: 0 });
    g.regalia = 0x0e; // the Amulet worn
    s.protection = 0xff;
    for (let k = 0; k < 3; k++) s.shadowlords[k] = 0xff; // each bound to its flame and its shard destroyed
    await play(g, p, 'Y', doom.word, K.Enter, K.Down, 'E');
    expect(p.log).not.toMatch(/Attacked at\s+entrance!/);
    // In at Doom's top, whose first square is a room: the party stands in it, in the fight it holds.
    expect([s.mapId === 0xff ? s.savedMapId : s.mapId, s.level]).toEqual([0x28, 0]);
  });

  /**
   * Doom's last room (the Mirror's, at 5,7 on its eighth level) is walled in on its own level: the way into it is the
   * pit at 5,7 on the level above, reached from the room beside it. The party is set down beside the pit, as that
   * room's east side leaves it, and walks on.
   */
  const toTheMirror = async (box: boolean): Promise<{ g: Game; p: FakePlatform }> => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    hardy(g);
    g.autoKill = false; // the mirror's room is walked, not fought
    stashWorldActors(g);
    s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(7 * 0x200, 8 * 0x200));
    expect(s.dungeon[6 * 64 + 7 * 8 + 5]).toBe(0x61); // the pit
    expect(s.dungeon[7 * 64 + 7 * 8 + 5] & 0xf0).toBe(0xf0); // the room below it
    Object.assign(s, { mapId: 0x28, level: 6, x: 4, y: 7, facing: 1, d6602: 1, activeMember: 0xff });
    for (let k = 0; k < 3; k++) s.shadowlords[k] = 0xff;
    s.sandalwoodBox = box ? 1 : 0;
    s.crown = s.sceptre = s.amulet = 0xff;
    // In the room, the first member still standing walks to the Mirror at the top (x 5, y 2), the rest pass; at the
    // end's questions and pages, Y (yes, and any key).
    let steps = 0;
    p.next = () => {
      if (p.log.includes('Be it known that on') || p.log.includes('I see...') || ++steps > 3000) return undefined;
      if (g.commandPrompt === 'dungeon') return K.Up;
      if (g.commandPrompt === 'combat') {
        const me = g.combat[s.combatTurn];
        const first = g.combat.findIndex((c) => (c.flags & CF.Player) !== 0 && (c.flags & CF.Dead) === 0);
        if ((me.flags & CF.Player) === 0 || s.combatTurn !== first) return K.Space;
        if (me.x !== 5 && me.y > 3) return me.x < 5 ? K.Right : K.Left;
        if (me.y > 2) return K.Up;
        if (me.x !== 5) return me.x < 5 ? K.Right : K.Left;
        return K.Space;
      }
      return 0x59;
    };
    // The bad end goes on for ever, the party and Lord British wandering, with no key asked for: it is watched a
    // while and left.
    let wandering = 0;
    p.sleep = async () => {
      if (p.log.includes('I see...') && ++wandering > 400) throw new Error('ran out of patience with the bad end');
    };
    await play(g, p);
    return { g, p };
  };

  it("falls through Doom's last pit to the Mirror, is absorbed, and Lord British is freed", async () => {
    const { g, p } = await toTheMirror(true);
    expect(p.log).toMatch(/Pit\s+Trap!/);
    expect(p.log).toMatch(/Entering\s+room/);
    expect(p.log).toMatch(/is\s+absorbed!/);
    expect(p.log).toContain('Be it known that on');
    expect(p.log).toContain(g.s.members[0].name);
  });

  it('ends badly without the Sandalwood Box, bars Doom while any Shadowlord lives, and lets no spell skip its levels', async () => {
    // Without the box, "Didst thou bring my box?" has no good answer: Lord British is freed, and the bad end follows
    // (ENDGAME_0648).
    const bad = await toTheMirror(false);
    expect(bad.p.log).toMatch(/is\s+absorbed!/);
    expect(bad.p.log).toContain('I see...');
    expect(bad.p.log).not.toContain('Be it known that on');

    // Two Shadowlords destroyed and one abroad: still attacked at Doom's mouth (MAINOUT_0790 wants all three).
    {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      const doom = dungeon(g, 7);
      stashWorldActors(g);
      Object.assign(s, { mapId: 0, level: 0xff, x: doom.x, y: doom.y, activeMember: 0 });
      s.d58d0[7] = 0x80; // Veramocor yelled
      s.shadowlords[0] = s.shadowlords[1] = 0xff;
      await play(g, p, 'E');
      expect(p.log).toMatch(/Attacked at\s+entrance!/);
      expect(s.mapId).toBe(0xff);
    }

    // In Doom, Des Por and Uus Por fail: its levels are walked (CAST_0dba_CastSpellCmd: map 40).
    for (const spell of [0x15, 0x16]) {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      stashWorldActors(g);
      s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(7 * 0x200, 8 * 0x200));
      Object.assign(s, { mapId: 0x28, level: 7, x: 0, y: 1, facing: 1, d6602: 5, activeMember: 0 });
      expect(s.dungeon[7 * 64 + 1 * 8 + 0]).toBe(0);
      s.mixtures[spell] = 1;
      Object.assign(s.members[0], { level: 8, mp: 40 });
      await play(g, p, 'C', ...g.data.table(0x1c30, 0x30)[spell], K.Enter);
      expect(p.log).toMatch(/Failed!/);
      // Still on Doom's level 7 - or set on there, in a fight a turn's wandering foes began
      expect([s.mapId === 0xff ? s.savedMapId : s.mapId, s.level]).toEqual([0x28, 7]);
    }
  });

  it('is swallowed with its ship by a whirlpool, and comes up in the Underworld', async () => {
    const { g, p } = newGame(3);
    journeyOnward(g);
    const s = g.s;
    const brit = readBritannia(g.data.files, g.data.ovl).tiles;
    // Open sea: a square with deep water all round it for three squares.
    let at = -1;
    for (let i = 0x2000; i < 0xe000 && at < 0; i++) {
      let open = (i & 0xff) > 0x10 && (i & 0xff) < 0xf0;
      for (let dy = -3; dy <= 3 && open; dy++) for (let dx = -3; dx <= 3 && open; dx++) open = brit[i + dy * 256 + dx] === T.Water1;
      if (open) at = i;
    }
    expect(at).toBeGreaterThanOrEqual(0);
    stashWorldActors(g);
    for (let i = 1; i < 32; i++) s.actors[i].tile = s.actors[i].anim = 0;
    Object.assign(s, { mapId: 0, level: 0, x: at % 256, y: at >> 8, partyTile: 0x25 }); // a frigate, sails furled
    s.actors[0].b5 = 99; // its hull
    // A whirlpool (actor tile 0xec, as MAINOUT_0e4e spawns them on deep water) two squares east of the ship.
    const pool = s.actors[1];
    Object.assign(pool, { tile: 0xec, anim: 0xec, x: s.x + 2, y: s.y, z: 0 });
    // Rowed a square east, beside it: the turn spent, the whirlpool reaches the ship before it drifts (MAINOUT_1a60).
    // (Rowing on into it is only blocked, and a blocked move spends no turn, in the original as here: the whirlpool
    // takes the ship on its own turn, not by being sailed into.)
    let rows = 0;
    p.next = () => (s.level === 0 && ++rows <= 1 ? K.Right : undefined);
    await play(g, p);
    expect(rows).toBe(1);
    expect(p.log).toMatch(/WHIRLPOOL!/);
    // MAINOUT_1248: down to 34,18 below, still aboard - in the Underworld's north-west sea, not at Despise's foot
    // (91,67) as the walkthrough has it.
    expect([s.mapId, s.level, s.x, s.y]).toEqual([0, 0xff, 0x22, 0x12]);
    expect(s.partyTile & 0xf8).toBe(0x20);
    expect(readUnderworld(g.data.files).tiles[0x12 * 256 + 0x22]).toBe(T.Water2); // afloat below
  });
});
