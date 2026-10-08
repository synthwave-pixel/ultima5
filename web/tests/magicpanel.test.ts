import { describe, expect, it } from 'vitest';
import { drawVitals } from '../src/game/frame.ts';
import { K, Pad } from '../src/game/io.ts';
import { whoActs } from '../src/game/input.ts';
import { holdFullPanel } from '../src/game/layout.ts';
import { castCommand, mixCommand, SPELL_EFFECTS } from '../src/game/magic.ts';
import { isCaster, restedMp } from '../src/game/rest.ts';
import { drawSpellCard, makeable, spellWords } from '../src/game/magicPanel.ts';
import { commandMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Colour } from '../src/ui/colours.ts';
import { newGame } from './helpers.ts';

/** The party panel while magic is chosen (magicPanel.ts): mana for hit points, and a spell's card over the party. */
describe('the magic panel', () => {
  /** A game whose screen keeps each letter's colour; the panel is the stats window, columns 24-38 of rows 1-9. */
  const watched = () => {
    const made = newGame();
    const { g, p } = made;
    journeyOnward(g);
    const colours = new Map<string, number>();
    const out = (p.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
    const glyph = out.glyph.bind(out);
    out.glyph = (font, code, c, r, fg, ...rest) => {
      colours.set(`${r},${c}`, fg);
      glyph(font, code, c, r, fg, ...rest);
    };
    const row = (r: number): string => p.rows[r + 1].slice(24, 39).join('');
    const colour = (r: number, c: number): number | undefined => colours.get(`${r + 1},${24 + c}`);
    const s = g.s;
    s.members[0].mp = 12;
    s.reagents.set([12, 8, 9, 5, 7, 0, 3, 2]);
    s.mixtures.fill(0);
    s.mixtures[4] = 3;
    return { ...made, row, colour };
  };

  it("reads a spell's words whole, the game keeping them cut to ten letters", () => {
    const { g } = newGame();
    expect(spellWords(g, 0)).toBe('In Lor');
    expect(spellWords(g, 4)).toBe('Mani');
    expect(spellWords(g, 30)).toBe('In Vas Por Ylem');
    expect(spellWords(g, 42)).toBe('In Mani Corp');
  });

  it("shows mana for hit points, plain, named Mana on the border, a fighter's line grey with a dash, and no food or gold", () => {
    const { g, p, row, colour } = watched();
    g.panelMana = true;
    drawVitals(g);
    // The Avatar (as the tests name them): mana over what a rest gives; the fighter, a dash, grey from end to end.
    const full = `12/${restedMp(g, 0)}`;
    expect(row(0)).toBe(`Tester${full.padStart(9)}`);
    expect(row(1)).toBe('Shamino       -');
    expect(colour(0, 15 - full.length)).toBe(Colour.brightWhite); // the mana plain
    expect(colour(0, 15 - 1)).toBe(Colour.lightGray); // the maximum grey
    expect(colour(1, 0)).toBe(Colour.darkGray); // the fighter's name
    expect(colour(1, 14)).toBe(Colour.darkGray);
    expect(p.rows[0].join('')).toContain('Mana'); // the party box's top border
    expect(row(6).trim()).toBe(''); // the food and gold left off
    g.panelMana = false;
    drawVitals(g);
    expect(row(0)).toMatch(/^Tester\s+\d+/);
    expect(p.rows[0].join('')).not.toContain('Mana');
    expect(row(6)).toMatch(/^F:/);
  });

  it("shows a spell's card: its words plain, the mixtures and cost, its circle, its reagents with the missing grey", () => {
    const { g, row, colour } = watched();
    drawSpellCard(g, 1, 0); // Magic missile, the Avatar to cast it: no Black Pearl
    expect(row(0).trim()).toBe('Grav Por');
    expect(colour(0, row(0).indexOf('G'))).toBe(Colour.brightWhite);
    expect(row(1)).toBe('Mixed 0    1 MP');
    expect(colour(1, 0)).toBe(Colour.darkGray); // none mixed
    expect(colour(1, 11)).toBe(Colour.brightWhite); // the Avatar has the mana
    expect(row(2).trim()).toBe('Circle 1');
    expect(colour(2, 0)).toBe(Colour.brightWhite); // the Avatar has reached it
    expect(row(3)).toBe('Sulfur Ash   12');
    expect(row(4)).toBe('Blk. Pearl    0');
    expect(colour(4, 0)).toBe(Colour.darkGray);
    // A circle the caster has not reached: grey. Mixing, grey where no one of the party who casts has.
    g.s.members[0].level = 2;
    drawSpellCard(g, 6 * 2, 0); // a third-circle spell
    expect(row(2).trim()).toBe('Circle 3');
    expect(colour(2, 0)).toBe(Colour.darkGray);
    drawSpellCard(g, 6, 0); // the second circle: reached
    expect(colour(2, 0)).toBe(Colour.brightWhite);
    for (let m = 0; m < g.s.partySize; m++) g.s.members[m].level = 1;
    drawSpellCard(g, 6, -1);
    expect(colour(2, 0)).toBe(Colour.darkGray);
    g.s.members[0].level = 2;
    drawSpellCard(g, 6, -1);
    expect(colour(2, 0)).toBe(Colour.brightWhite);
    // A caster without the mana: the cost grey.
    g.s.members[0].mp = 0;
    drawSpellCard(g, 4, 0);
    expect(row(0).trim()).toBe('Mani');
    expect(row(1)).toBe('Mixed 3    1 MP');
    expect(colour(1, 11)).toBe(Colour.darkGray);
  });

  it("gives a fifth reagent the food's row, and a sixth the panel's full height; the food and gold off beside any card", () => {
    const { g, row } = watched();
    const clone = SPELL_EFFECTS.indexOf('Clone');
    drawSpellCard(g, clone, -1); // five reagents: the fifth where the food and gold are
    expect(row(6)).not.toMatch(/^F:/);
    drawSpellCard(g, 4, -1);
    expect(row(6).trim()).toBe(''); // four: the row left empty (the Standard look)
    drawVitals(g);
    expect(row(6)).toMatch(/^F:/); // and back with the party
    // At the panel's 1988 height (the spell list holds it for a recipe of more than four): Clone's five under the
    // mixtures, the cost and the circle, the fourth and fifth under its divider.
    const release = holdFullPanel(g);
    drawSpellCard(g, clone, -1);
    expect(row(1)).toMatch(/^Mixed \d+ +\d MP$/);
    expect(row(2).trim()).toMatch(/^Circle \d$/);
    expect([3, 4, 5, 7, 8].every((r) => row(r).trim() !== '')).toBe(true);
    // Resurrect's six: the circle and cost on one line, the mixtures giving way (the list's label has their count).
    drawSpellCard(g, 42, -1);
    expect(row(1)).toBe('Circle 8   8 MP');
    expect([2, 3, 4, 5, 7, 8].map((r) => row(r).slice(0, 10).trim())).toEqual([
      'Sulfur Ash',
      'Ginseng',
      'Garlic',
      'Sp. Silk',
      'Blood Moss',
      'Mandrake',
    ]);
    release();
    expect(row(6)).toMatch(/^F:/);
  });

  it('shows mana while the command menu bar is on a spell to cast or on Mix, and hit points elsewhere', async () => {
    const { g, p } = watched();
    g.options.input = 'controller';
    g.commandPrompt = 'town';
    const seen: [string, boolean][] = [];
    p.next = () => {
      const m = g.menuShown!;
      seen.push([m.labels[m.at], g.panelMana]);
      if (seen.length > m.labels.length) return Pad.B;
      return K.Down;
    };
    await commandMenu(g);
    const on = (label: string): boolean | undefined => seen.find(([l]) => l === label)?.[1];
    expect(on('Cast')).toBe(true);
    expect(on('Mix reagents')).toBe(true);
    expect(on('Look')).toBe(false);
    expect(g.panelMana).toBe(false);
  });

  it('passes over those who cast nothing when choosing who casts - the active member too', async () => {
    const { g, p } = watched();
    const s = g.s;
    const casters = (m: number): boolean => isCaster(g, m);
    expect(isCaster(g, 1)).toBe(false); // Shamino, a fighter
    const rests: number[] = [];
    p.next = () => {
      rests.push(g.picked);
      return rests.length === 1 ? K.Down : K.Enter;
    };
    g.options.input = 'controller';
    expect(await whoActs(g, casters)).toBe(2); // from the Avatar straight to Iolo
    expect(rests).toEqual([0, 2]);
    // A fighter made active is not taken for a caster: the casters are asked for.
    s.activeMember = 1;
    rests.length = 0;
    expect(await whoActs(g, casters)).toBe(2);
    expect(rests).toEqual([0, 2]);
    // Only one caster able: taken without asking.
    s.members[2].status = 0x44; // dead
    rests.length = 0;
    expect(await whoActs(g, casters)).toBe(0);
    expect(rests).toEqual([]);
  });

  it('mixes on a controller by the spell and how many, no higher than the reagents make', async () => {
    const { g, p } = watched();
    g.options.input = 'controller';
    const s = g.s;
    s.reagents.fill(0);
    s.reagents[1] = 4; // Ginseng
    s.reagents[3] = 6; // Spider Silk: Heal's, four of it
    expect(makeable(g, 4)).toBe(4);
    let spells: { labels: string[]; enabled: boolean[] } | null = null;
    let dial: string[] = [];
    let again = '';
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Spells') {
        // Mixed, the list again, the bar on the spell just mixed; B leaves it.
        if (s.mixtures[4] === 7) return ((again = m.labels[m.at]), Pad.B);
        spells ??= { labels: [...m.labels], enabled: [...m.enabled] };
        return m.labels[m.at].startsWith('Heal') ? Pad.A : K.Down;
      }
      dial = [...m.labels];
      return m.labels[0] === '4' ? Pad.A : K.Up; // up to the most it makes, and no further
    };
    await mixCommand(g);
    const heal = spells!.labels.findIndex((l) => l.startsWith('Heal'));
    expect(spells!.labels[heal]).toBe('Heal x3');
    expect(spells!.enabled[heal]).toBe(true);
    expect(spells!.enabled[0]).toBe(false); // Light: no Sulfurous Ash
    expect(dial).toEqual(['4', 'Can make 4']);
    expect(s.mixtures[4]).toBe(7);
    expect([s.reagents[1], s.reagents[3]]).toEqual([0, 2]);
    expect(p.log.replace(/\s+/g, '')).toContain('Done!');
    expect(again).toBe(''); // nothing left to mix: the list not shown again
  });

  it('lists what can be cast first, then the rest greyed, each by circle', async () => {
    const { g, p } = watched();
    g.options.input = 'controller';
    const s = g.s;
    Object.assign(s.members[0], { level: 8, mp: 30 });
    s.mixtures.fill(0);
    for (const e of ['Heal', 'Great light', 'Cure poison']) s.mixtures[SPELL_EFFECTS.indexOf(e)] = 2;
    let spells: { labels: string[]; enabled: boolean[] } | null = null;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Spells') {
        spells ??= { labels: [...m.labels], enabled: [...m.enabled] };
        return Pad.B;
      }
      return m.at === 0 ? Pad.A : K.Up; // the Avatar casts
    };
    await castCommand(g);
    const { labels, enabled } = spells!;
    const first = enabled.indexOf(false);
    expect(first).toBeGreaterThan(0);
    expect(enabled.slice(first).every((e) => !e)).toBe(true); // the castable, then the rest
    const circle = (l: string): number => Math.trunc(SPELL_EFFECTS.indexOf(l.replace(/ x\d+$/, '')) / 6);
    for (const part of [labels.slice(0, first), labels.slice(first)])
      for (let i = 1; i < part.length; i++) expect(circle(part[i])).toBeGreaterThanOrEqual(circle(part[i - 1]));
    expect(labels.slice(0, first).map((l) => l.replace(/ x\d+$/, ''))).toEqual(['Cure poison', 'Heal', 'Great light']);
  });

  it('comes back to the list after mixing, the bar on the spell just mixed', async () => {
    const { g, p } = watched();
    g.options.input = 'controller';
    const s = g.s;
    s.reagents.fill(9);
    let mixedOnce = false;
    let again = '';
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Spells') {
        if (mixedOnce) return ((again = m.labels[m.at]), Pad.B);
        return m.labels[m.at].startsWith('Heal') ? Pad.A : K.Down;
      }
      mixedOnce = true;
      return Pad.A; // one of it
    };
    await mixCommand(g);
    expect(again).toBe('Heal x4');
    expect(g.cancelled).toBe(false);
  });
});
