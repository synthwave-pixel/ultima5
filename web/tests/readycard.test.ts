import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { cardLines } from '../src/game/readyCard.ts';
import { journeyOnward } from '../src/game/run.ts';
import { readyCommand } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/** An armament's card on the party panel while the controller's Ready list is open (readyCard.ts). */
describe('the Ready card', () => {
  const armed = () => {
    const made = newGame();
    journeyOnward(made.g);
    const s = made.g.s;
    s.members[0].str = 30;
    s.members[0].equips.fill(0xff);
    s.equipment.fill(0);
    return made;
  };

  it('marks a two-handed axe against the sword and shield it would pack away', () => {
    const { g } = armed();
    const e = g.s.members[0].equips;
    e[2] = 0x1e; // long sword
    e[3] = 0x05; // large shield
    g.s.equipment[0x20] = 1;
    const { top, foot } = cardLines(g, 0, 0x20);
    expect(top).toEqual(['    2H Axe', 'Attack     20 +', 'Defence     0 -', 'Range       1  ', 'Weight     15 -', 'Two hands']);
    expect(foot).toEqual([]);
  });

  it('marks a ring against nothing where a finger is free, and says what it does', () => {
    const { g } = armed();
    g.s.equipment[0x2b] = 1;
    const { top, foot } = cardLines(g, 0, 0x2b);
    expect(top.slice(1)).toEqual(['Defence     2 +', 'Weight      0  ', 'Ring']);
    expect(foot).toEqual(['Adds defence']);
    expect(cardLines(g, 0, 0x2d).foot).toEqual(['Turns magic 1/2']);
    expect(cardLines(g, 0, 0x2f).foot).toEqual(['Holds no power']);
  });

  it('counts the arrows a bow wants, and says when it is too heavy', () => {
    const { g } = armed();
    g.s.equipment[0x1a] = 1;
    g.s.equipment[0x1b] = 24;
    expect(cardLines(g, 0, 0x1a).top).toContain('Range       7 +');
    expect(cardLines(g, 0, 0x1a).foot).toEqual(['Arrows 24']);
    g.s.equipment[0x1b] = 0;
    g.s.members[0].str = 5;
    expect(cardLines(g, 0, 0x1a).foot).toEqual(['Too heavy', 'No arrows']);
  });

  it('says what is thrown, and puts no marks on what the member has on', () => {
    const { g } = armed();
    g.s.equipment[0x13] = 3;
    expect(cardLines(g, 0, 0x13).foot).toEqual(['Thrown, used up']);
    expect(cardLines(g, 0, 0x26).foot).toEqual(['Thrown, returns', 'Full vs undead']);
    g.s.members[0].equips[2] = 0x17; // short sword
    const { top } = cardLines(g, 0, 0x17);
    expect(top.slice(1)).toEqual(['Attack     12  ', 'Range       1  ', 'Weight      5  ', 'In hand']);
  });

  it('greys what cannot be readied now and lists it below the rest, the bar still resting on it', async () => {
    const { g, p } = armed();
    const s = g.s;
    s.members[0].str = 10;
    s.equipment[0x20] = 1; // 2H Axe: 15, too heavy
    s.equipment[0x1b] = 12; // arrows: not held
    s.equipment[0x17] = 1; // short sword
    s.equipment[0x1a] = 1; // bow: 8
    let shown: { labels: string[]; dim: boolean[] } | null = null;
    const cards: string[] = [];
    let moves = 0;
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return Pad.A;
          if (m.title !== 'Ready') return Pad.B;
          shown ??= { labels: [...m.labels], dim: [...(m.dim ?? [])] };
          cards.push(p.rows[1].slice(24, 39).join('').trim());
          return moves++ < 3 ? K.Down : Pad.B;
        },
      ],
      60,
    );
    await readyCommand(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(shown!.labels.map((l) => l.replace(/ x\d+$/, ''))).toEqual(['Short Sword', 'Bow', 'Arrows', '2H Axe']);
    expect(shown!.dim).toEqual([false, false, true, true]);
    expect(cards.slice(0, 4)).toEqual(['Short Sword', 'Bow', 'Arrows', '2H Axe']); // the bar rests on the grey too
  });

  it("names the member on the party box's border and shows the card for the line under the bar", async () => {
    const { g, p } = armed();
    const s = g.s;
    s.equipment[0x17] = 1;
    s.equipment[0x2b] = 1;
    const row = (r: number): string => p.rows[r + 1].slice(24, 39).join('');
    const seen: string[][] = [];
    let border = '';
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return Pad.A; // the first member
          if (m.title !== 'Ready') return Pad.B;
          border = p.rows[0].join('');
          seen.push([row(0), row(1)]);
          return seen.length === 1 ? K.Down : Pad.B;
        },
      ],
      60,
    );
    await readyCommand(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(border).toContain(s.members[0].name);
    expect(seen[0][0].trim()).toBe('Short Sword');
    expect(seen[0][1]).toBe('Attack     12 +');
    expect(seen[1][1]).toBe('Defence     2 +'); // the ring's
    expect(p.rows[0].join('')).not.toContain(s.members[0].name); // the border's title gone with the list
  });
});
