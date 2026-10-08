import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { K, Pad } from '../src/game/io.ts';
import { Relocate } from '../src/game/cheats.ts';
import type { Game } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Save } from '../src/game/save.ts';
import {
  autosave,
  EARLIER,
  fromBase64,
  localSave,
  parseSave,
  SAVE_KEY,
  saveCommand,
  saveKeys,
  unpackSave,
  savedWhen,
  savedWhere,
  serialize,
  type SaveData,
} from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

/**
 * The saved games (storage.ts): each written, read back and only then said done; the last save never lost to a new
 * one that fails; and the nine before it kept, newest first, to go back to - from All is lost and the Pause menu.
 */

/** The browser's local storage, in memory: `room` characters of it, and a `fault` to throw or spoil a write. */
const store = new Map<string, string>();
let room = Infinity;
let fault: ((key: string, value: string) => string | undefined) | null = null;
beforeEach(() => {
  store.clear();
  chooseCharacter(null); // no character of an earlier test's in play
  room = Infinity;
  fault = null;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const kept = fault?.(k, v) ?? v;
      let used = k.length + kept.length;
      for (const [key, value] of store) if (key !== k) used += key.length + value.length;
      if (used > room) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      store.set(k, kept);
    },
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  vi.useRealTimers();
});

/** A game in play, out in Britannia with `gold` (each save a game of its own). */
function game(gold = 100): { g: Game; p: ReturnType<typeof newGame>['p'] } {
  const made = newGame();
  journeyOnward(made.g);
  made.g.s.mapId = 0;
  made.g.s.gold = gold;
  return made;
}

/** Where the character in play's last save is kept, and the index of those before it. */
const lastKey = (): string => saveKeys()!.last;
/** The saves before the last, as their index has them. */
const earlierKeys = (): string[] => (JSON.parse(store.get(saveKeys()!.index) ?? '{"keys":[]}') as { keys: string[] }).keys;
/** The gold of a save, as text or taken up: each save here a game of its own by it. */
const goldOf = (d: string | SaveData | null | undefined): number =>
  new Save(fromBase64((typeof d === 'string' ? parseSave(unpackSave(d)) : d!).save)).gold;

describe('a save', () => {
  it('is said done only once it is read back whole', async () => {
    const { g, p } = game();
    await saveCommand(g, true);
    expect(p.log).toContain('Done.');
    expect(p.log).not.toContain('Not saved!');
    expect(parseSave(unpackSave(store.get(lastKey())!)).save).toBe(serialize(g).save);
    expect(store.get(lastKey())!.startsWith('z1:')).toBe(true); // kept packed
  });

  it('that cannot be written says "Not saved!" - by hand and at a door - and the saves before are as they were', async () => {
    const { g, p } = game(100);
    expect(localSave.write(g)).toBe(true);
    g.s.gold = 200;
    expect(localSave.write(g)).toBe(true);
    const before = new Map(store);
    const evicted = localSave.evicted;
    fault = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    g.s.gold = 300;
    const from = p.log.length;
    await saveCommand(g, true);
    expect(p.log.slice(from)).toContain('Not saved!');
    expect(p.log.slice(from)).not.toContain('Done.');
    expect(autosave(g)).toBe(false);
    expect(p.log.slice(from)).not.toContain('(saved)');
    expect(store).toEqual(before);
    expect(localSave.evicted).toBe(evicted); // not for want of room: nothing kept is let go for it
  });

  it('read back other than it was written is no save, and the last is put back from its copy', () => {
    const { g } = game(100);
    localSave.write(g);
    const key = lastKey();
    const last = store.get(key);
    let spoiled = 0;
    fault = (k, v) => (k === key && spoiled++ === 0 ? v.slice(0, v.length >> 1) : undefined); // cut short, once
    g.s.gold = 500;
    expect(localSave.write(g)).toBe(false);
    expect(store.get(lastKey())).toBe(last);
    expect(earlierKeys()).toEqual([]); // the copy gone again: the last is where it was
    // Every write to the slot spoiled, the last's own put back too: its copy stands for it.
    fault = (k, v) => (k === key ? v.slice(0, v.length >> 1) : undefined);
    expect(localSave.write(g)).toBe(false);
    expect(goldOf(localSave.read())).toBe(100);
    fault = null;
    expect(localSave.write(g)).toBe(true);
    expect(goldOf(store.get(lastKey()))).toBe(500);
    expect(goldOf(store.get(earlierKeys()[0]))).toBe(100);
  });

  it('where the storage is full, lets the oldest earlier saves go to make room, and fails only with none left', () => {
    const { g } = game(1);
    for (let gold = 1; gold <= 5; gold++) {
      g.s.gold = gold;
      expect(localSave.write(g)).toBe(true);
    }
    expect(earlierKeys()).toHaveLength(4);
    const one = store.get(lastKey())!.length + lastKey().length + 3;
    // Room for the last, its copy and two more: the oldest go.
    room = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0) - 2 * one;
    const evicted = localSave.evicted;
    g.s.gold = 6;
    expect(localSave.write(g)).toBe(true);
    expect(localSave.evicted - evicted).toBeGreaterThan(0);
    expect(goldOf(store.get(lastKey()))).toBe(6);
    expect(goldOf(store.get(earlierKeys()[0]))).toBe(5);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([6, 5, ...[4, 3].slice(0, earlierKeys().length - 1)]);
    // No room even for the copy: nothing written, nothing lost.
    room = 10;
    const before = new Map(store);
    g.s.gold = 7;
    expect(localSave.write(g)).toBe(false);
    expect(store.get(lastKey())).toBe(before.get(lastKey()));
    expect(goldOf(store.get(lastKey()))).toBe(6);
  });

  it('of the very game last saved is not kept twice', () => {
    const { g } = game();
    localSave.write(g);
    localSave.write(g);
    expect(earlierKeys()).toEqual([]);
    g.s.gold++;
    localSave.write(g);
    expect(earlierKeys()).toHaveLength(1);
  });
});

describe('the earlier saves', () => {
  it('are the seven before the last - eight saves in all - newest first, each with when and where it was made', () => {
    expect(EARLIER + 1).toBe(8);
    vi.useFakeTimers({ toFake: ['Date'] });
    const { g } = game();
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(new Date(2026, 9, 1, 16, 35 + i));
      g.s.gold = 100 + i;
      expect(localSave.write(g)).toBe(true);
    }
    const kept = localSave.all();
    expect(kept).toHaveLength(EARLIER + 1);
    expect(kept.map((k) => goldOf(k.data))).toEqual([111, 110, 109, 108, 107, 106, 105, 104]);
    expect(kept.map((k) => k.data.written)).toEqual([...kept.map((k) => k.data.written)].sort((a, b) => b - a));
    // The oldest let go from the storage, not only the index.
    expect([...store.keys()].filter((k) => k.startsWith(`${lastKey()}.`))).toHaveLength(EARLIER);
    expect(savedWhen(kept[7].data.written, Date.now())).toBe('Oct 1, 4:39 PM');
    expect(savedWhere(g, kept[7].data)).toBe('Britannia');
  });

  it('say when by the clock, the year only where it is not this one', () => {
    const now = new Date(2026, 9, 1, 12).getTime();
    expect(savedWhen(new Date(2026, 9, 1, 16, 35).getTime(), now)).toBe('Oct 1, 4:35 PM');
    expect(savedWhen(new Date(2026, 0, 9, 0, 5).getTime(), now)).toBe('Jan 9, 12:05 AM');
    expect(savedWhen(new Date(2025, 11, 31, 12, 0).getTime(), now)).toBe('Dec 31 2025, 12:00 PM');
  });

  it("say where by the game's own names", () => {
    const { g } = game();
    const s = g.s;
    const where = (): string => savedWhere(g, serialize(g));
    const yew = g.data.locations.findIndex((l) => l.name === 'YEW');
    [s.mapId, s.level, s.x, s.y] = [0, 0, g.data.locations[yew].x, g.data.locations[yew].y];
    expect(where()).toBe('Yew'); // at its door, where the game saves itself
    [s.x, s.y] = [g.data.locations[yew].x + 1, g.data.locations[yew].y];
    expect(where()).toBe('Britannia');
    s.level = 0xff;
    expect(where()).toBe('the Underworld');
    [s.mapId, s.level] = [yew + 1, 0];
    expect(where()).toBe('Yew');
    [s.mapId, s.level] = [17, 0];
    expect(where()).toBe("Lord British's Castle");
    [s.mapId, s.level] = [0x24, 2];
    expect(where()).toBe('Wrong, level 3');
  });

  it('take the place of a last save that will not read', () => {
    const { g } = game(100);
    localSave.write(g);
    g.s.gold = 200;
    localSave.write(g);
    store.set(lastKey(), '{"game":"ultima5","version":1,"save":"AAA'); // cut short
    expect(goldOf(localSave.read())).toBe(100);
    expect(localSave.all()).toHaveLength(1);
    // Written again: the damaged slot is not kept among the earlier saves.
    g.s.gold = 300;
    expect(localSave.write(g)).toBe(true);
    expect(earlierKeys()).toHaveLength(1);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([300, 100]);
  });

  it('begin with the one save of a game from before them (from before characters, too), which loads as it did', () => {
    const old = JSON.stringify(serialize(game(42).g));
    store.set(SAVE_KEY, old);
    expect(localSave.read()?.save).toBe(parseSave(old).save);
    expect(localSave.all()).toHaveLength(1);
    const { g } = game(43);
    expect(localSave.write(g)).toBe(true);
    expect(unpackSave(store.get(earlierKeys()[0])!)).toBe(old);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([43, 42]);
  });
});

describe('All is lost', () => {
  /** A party lying dead in Britannia, with the saves of `golds` behind it, newest last. */
  async function wiped(input: 'controller' | 'letters', golds: number[]) {
    const { g, p } = game(golds[0]);
    for (const gold of golds) {
      g.s.gold = gold;
      localSave.write(g);
    }
    g.options.input = input;
    g.inPlay = true;
    g.s.gold = 9999;
    for (const m of g.s.members.slice(0, g.s.partySize)) m.hp = 0;
    const { death } = await import('../src/game/story.ts');
    return { g, p, death };
  }

  it('offers the last save, an earlier one from a list of when and where, and Lord British; B in the list is back to the three', async () => {
    const { g, p, death } = await wiped('controller', [10, 20, 30]);
    const seen: { title: string; labels: string[]; enabled: boolean[]; at: number }[] = [];
    // B (no answer); down to the earlier saves, into their list, B back out; in again, down past the first to the
    // second, chosen.
    const script = [Pad.B, K.Down, Pad.A, Pad.B, Pad.A, K.Down, Pad.A];
    p.next = () => {
      const m = g.menuShown;
      if (m) seen.push({ title: m.title, labels: m.labels, enabled: m.enabled, at: m.at });
      return script.shift() ?? Pad.A;
    };
    await expect(death(g)).rejects.toBeInstanceOf(Relocate);
    expect(seen[0]).toEqual({
      title: 'All is lost',
      labels: ['Load the last save', 'Load an earlier save', "Lord British's aid"],
      enabled: [true, true, true],
      at: 0,
    });
    expect(seen[1].title).toBe('All is lost'); // B: no answer
    const list = seen.find((m) => m.title === 'Earlier saves')!;
    expect(list.labels).toHaveLength(4); // two saves before the last, each on two lines
    expect(list.labels[1]).toBe('Britannia');
    expect(list.enabled).toEqual([true, false, true, false]);
    // B from the list: the three again, the bar where it was.
    const back = seen[seen.indexOf(list) + 1];
    expect(back).toMatchObject({ title: 'All is lost', at: 1 });
    // The second of the earlier saves chosen: the oldest, of 10 gold.
    expect(g.s.gold).toBe(10);
    expect(g.s.members[0].hp).toBeGreaterThan(0);
  });

  it('takes the last save up again with A at once, as before', async () => {
    const { g, p, death } = await wiped('controller', [10, 20]);
    p.next = () => Pad.A;
    await expect(death(g)).rejects.toBeInstanceOf(Relocate);
    expect(g.s.gold).toBe(20);
  });

  it('on the keyboard, is the same menu: Escape no answer, Enter on Lord British his aid', async () => {
    const { g, p, death } = await wiped('letters', [10, 20]);
    const seen: string[][] = [];
    const script = [K.Escape, K.Down, K.Down, K.Enter];
    p.next = () => {
      if (g.menuShown?.title === 'All is lost') seen.push(g.menuShown.labels);
      return script.shift() ?? K.Enter;
    };
    await death(g);
    expect(seen[0]).toEqual(['Load the last save', 'Load an earlier save', "Lord British's aid"]);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(g.s.mapId).toBe(0x11); // in his castle
    expect(g.s.gold).toBe(9999); // all carried kept
  });
});

describe('the Pause menu', () => {
  it('loads a save chosen from the last and those before it, once asked', async () => {
    const { g, p } = game(10);
    localSave.write(g);
    g.s.gold = 20;
    localSave.write(g);
    g.s.gold = 9999;
    g.options.input = 'controller';
    g.inPlay = true;
    const { pauseMenu } = await import('../src/game/menu.ts');
    let list: string[] = [];
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Paused') return m.labels[m.at] === 'Load a save' ? Pad.A : K.Down;
      if (m.title === 'Load a save') {
        list = m.labels;
        return m.at === 2 ? Pad.A : K.Down;
      }
      if (m.title === 'Are you sure?') return m.labels[m.at] === 'Yes' ? Pad.A : K.Down;
      return Pad.A;
    };
    await expect(pauseMenu(g)).rejects.toBeInstanceOf(Relocate);
    expect(list).toHaveLength(4); // the last and the one before it
    expect(g.s.gold).toBe(10);
    expect(g.paused).toBe(false);
  });
});
