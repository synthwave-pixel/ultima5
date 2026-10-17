import { describe, expect, it } from 'vitest';
import { journalTop } from '../src/game/journal.ts';
import { heardLines, placeClues } from '../src/game/placeClues.ts';
import { newGame } from './helpers.ts';

type G = ReturnType<typeof newGame>['g'];

/** A journal line's name, without the count or the state set against its right edge. */
const thing = (label: string): string =>
  label
    .replace(/\s{2,}\S+$/, '')
    .replace(/\s+\d+(\/\d+)?$/, '')
    .trimEnd();
const part = (g: G, name: string) => journalTop(g).find((l) => thing(l.label) === name)!;
const kind = (g: G, name: string) => part(g, 'Places').open!.lines.find((l) => thing(l.label) === name)!;
/** Britain's line, under Townes. */
const britain = (g: G) => kind(g, 'Townes').open!.lines[1];

/**
 * The journal's Places (the port's, after the ultima3 port's Towns): every settlement by kind, a mystery till found or
 * named, then its clues heard of all - the clues read from its townsfolk's talk (placeClues.ts).
 */
describe("the journal's places", () => {
  it('finds the clues each settlement holds in its own talk, each a line that bears on the quest', () => {
    const { g } = newGame();
    const all = placeClues(g);
    expect([...all.keys()]).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    const here = all.get(2)!; // Britain
    expect(here.length).toBeGreaterThan(3);
    expect(here.some((c) => c.who === 'Greyson' && /Mantra of Compassion/i.test(c.text))).toBe(true);
    expect(here.some((c) => c.who === 'Annon' && /Word/.test(c.text))).toBe(true);
    // A question asks, and is not counted: only what is told.
    for (const c of [...all.values()].flat()) expect(c.text).not.toMatch(/\?$/);
  });

  it('keeps a place a mystery till it is seen or named, then names it, then counts its clues once been in', () => {
    const { g } = newGame();
    expect(part(g, 'Places').label).toBe('Places           0/32');
    expect(britain(g).label).toBe('Mystery...           ');
    const at = g.data.locations[1];
    g.fog.mark(false, at.x, at.y); // seen, not named: as the map calls it
    expect(britain(g).label).toBe('Towne?           seen');
    g.fog.named.add('place:2'); // named in someone's hearing
    expect(britain(g).label).toBe('Britain          seen');
    g.fog.place(2, 0); // been in
    const all = placeClues(g).get(2)!.length;
    expect(britain(g).label).toBe(`Britain${`0/${all}`.padStart(14)}`);
    expect(britain(g).about).toBe(`Entered. 0 of its ${all} clues heard.`);
    expect(britain(g).hint).toMatch(/^A towne, .* of /);
  });

  it('counts a clue heard when its line is spoken, and a clue noted before they were kept, by its words', () => {
    const { g } = newGame();
    g.fog.named.add('place:2');
    g.fog.place(2, 0);
    g.s.mapId = 2;
    const clues = placeClues(g).get(2)!;
    const [file, talk] = clues[0].id.split('@')[0].split(':');
    heardLines(g, `${file}:${talk}:`, [clues[0].start]);
    expect(britain(g).label).toMatch(new RegExp(`1/${clues.length}$`));
    // An older save's clue: its words kept in the journal there, nothing more.
    const greyson = clues.find((c) => c.who === 'Greyson' && /Mantra of Compassion/i.test(c.text))!;
    g.notes.push({ who: 'Greyson', where: 'Britain', text: greyson.text, date: '4-5-139' });
    expect(britain(g).label).toMatch(new RegExp(`2/${clues.length}$`));
    expect(britain(g).read?.some((r) => r.text === greyson.text)).toBe(true);
    expect(britain(g).read?.at(-1)?.text).toBe(`${clues.length - 2} more to hear.`);
  });

  it('fits every line in the width, named or not', () => {
    const { g } = newGame();
    for (let id = 1; id <= 32; id++) {
      g.fog.named.add(`place:${id}`);
      g.fog.place(id, 0);
    }
    for (const k of part(g, 'Places').open!.lines) {
      expect(k.label.length).toBe(21);
      for (const l of k.open!.lines) {
        expect(l.label.length, l.label).toBe(21);
        expect(l.label).toMatch(/\S\s+\S+$/); // the name and its count apart
        expect(l.hint.length).toBeGreaterThan(10);
      }
    }
  });

  it('keeps a dungeon a mystery till found, named or its Word heard', () => {
    const { g } = newGame();
    const dungeon = () => part(g, 'Dungeons unsealed').open!.lines[1]; // Despise
    expect(dungeon().label).toBe('Mystery...           ');
    g.fog.named.add('place:34');
    expect(dungeon().label).toBe('Despise              ');
  });
});

describe("the journal's cards' titles", () => {
  it('fit the panel border, every place and every piece of equipment', async () => {
    const { cardTitle } = await import('../src/game/menu.ts');
    expect(cardTitle('Shrines')).toBe('Shrines:');
    expect(cardTitle("Buccaneer's Den")).toBe("Buccaneer's:");
    expect(cardTitle('Sandalwood box')).toBe('Sandalwood:');
    const { g } = newGame();
    for (let id = 1; id <= 32; id++) {
      g.fog.named.add(`place:${id}`);
      g.fog.place(id, 0);
    }
    const lines = journalTop(g).flatMap((l) => [l, ...(l.open?.lines ?? []).flatMap((k) => [k, ...(k.open?.lines ?? [])])]);
    for (const l of lines) {
      const title = cardTitle(l.card ?? l.open?.title ?? thing(l.label));
      expect(title.length, l.label).toBeLessThanOrEqual(13);
    }
  });
});
