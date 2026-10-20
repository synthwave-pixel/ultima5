import { describe, expect, it } from 'vitest';
import { readBritannia, readUnderworld } from '../src/data/maps.ts';
import { K, Pad } from '../src/game/io.ts';
import { journalTop, type JournalLine } from '../src/game/journal.ts';
import { journalScreen } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { focusOf, marksFor } from '../src/ui/mapMarks.ts';
import { newGame } from './helpers.ts';

/** A part of the journal's top whose line begins `name`, and the lines it opens. */
const page = (lines: JournalLine[], name: string): JournalLine[] => lines.find((l) => l.label.startsWith(name))!.open!.lines;

/**
 * X on a line of the journal that names a place - a shrine, a dungeon, a towne, castle, keep, lighthouse or hut - opens
 * the map on it (menu.ts, mapView.ts showMap's focus); not on one still a mystery.
 */
describe("the journal's View", () => {
  it('is offered for every shrine, and for a dungeon or a place once it is no mystery', () => {
    const { g } = newGame();
    journeyOnward(g);
    const top = journalTop(g);
    expect(page(top, 'Shrines').map((l) => l.view)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((v) => `shrine:${v}`));
    const doom = page(top, 'Dungeons')[7];
    expect(doom.label.startsWith('Mystery')).toBe(true);
    expect(doom.view).toBeUndefined();
    g.fog.named.add('place:40'); // Doom, named
    expect(page(journalTop(g), 'Dungeons')[7].view).toBe('place:40');
    // The places, by their kinds: each a mystery at first, with no View; named, each its own.
    const places = (): JournalLine[] => page(journalTop(g), 'Places').flatMap((k) => k.open?.lines ?? []);
    const mysteries = places().filter((l) => l.label.startsWith('Mystery'));
    expect(mysteries.length).toBeGreaterThan(0);
    expect(mysteries.every((l) => l.view === undefined)).toBe(true);
    for (let id = 1; id <= 32; id++) g.fog.named.add(`place:${id}`);
    const views = places().map((l) => l.view);
    expect(views.every((v) => v !== undefined && /^place:\d+$/.test(v))).toBe(true);
    expect(new Set(views).size).toBe(views.length);
  });

  it('opens the map on the place the bar is on, and comes back to the journal on the same line', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const asked: (string | undefined)[] = [];
    g.hooks.showMap = (_under, focus) => {
      asked.push(focus);
      return Promise.resolve();
    };
    const seen: string[] = [];
    let step = 0;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      seen.push(`${m.title}:${m.at}`);
      step++;
      if (m.title === 'Journal') return step === 1 ? Pad.A : Pad.B; // Shrines, then out
      if (m.title === 'Shrines') {
        if (m.at === 0 && asked.length === 0) return K.Down; // to Compassion
        if (asked.length === 0) return Pad.X; // View
        return Pad.B;
      }
      return Pad.B;
    };
    await journalScreen(g);
    expect(asked).toEqual(['shrine:1']);
    // Back on the shrines, the bar where it was.
    const after = seen[seen.indexOf('Shrines:1') + 1];
    expect(after).toBe('Shrines:1');
  });

  it('opens a dungeon on the world its entrance is on: Doom in the Underworld, a shrine on Britannia', () => {
    const { g } = newGame();
    const marks = {
      brit: marksFor(g.data.ovl, g.s, readBritannia(g.data.files, g.data.ovl).tiles, false, g.fog),
      under: marksFor(g.data.ovl, g.s, readUnderworld(g.data.files).tiles, true, g.fog),
    };
    expect(focusOf(marks, 'place:40')?.world).toBe('under');
    expect(focusOf(marks, 'place:33')?.world).toBe('brit'); // Deceit
    const shrine = focusOf(marks, 'shrine:0')!;
    expect(shrine.world).toBe('brit');
    expect(marks.brit[shrine.at].key).toBe('shrine:0');
    expect(focusOf(marks, 'place:200')).toBeNull();
    expect(focusOf(marks, '')).toBeNull();
  });
});
