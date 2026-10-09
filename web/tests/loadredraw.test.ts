import { describe, expect, it } from 'vitest';
import { Relocate } from '../src/game/cheats.ts';
import { journeyOnward } from '../src/game/run.ts';
import { serialize, takeUp } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

/**
 * A save taken up (storage.ts takeUp - the Pause menu's Load a save, All is lost's loads): the screen drawn anew, the
 * party's panel with it. drawFrame blacks the whole screen out, the panel's letters with it; the panel was left empty
 * until something else drew it (the Pause menu closing).
 */
describe('a save taken up', () => {
  it('draws the party panel again, with the screen', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const saved = serialize(g);
    const panel = (): string => p.rows.map((r) => r.join('')).join('\n');
    const name = g.s.members[0].name;
    expect(panel()).toContain(name);
    // The screen blacked out, as drawFrame's fill leaves it on the page (the tests' text keeps its letters otherwise).
    for (const row of p.rows) row.fill(' ');
    await expect(takeUp(g, saved)).rejects.toBeInstanceOf(Relocate);
    expect(panel()).toContain(name);
  });
});

/**
 * The look changed in the middle of a game (layout.ts relayout): the screen lets go of the lettering it drew (screen.ts
 * theme), so the log, still in the text's record, must be drawn again - the PC (1988) look showed its prompts alone
 * (a border glyph, drawn as pixels), the words beside them gone.
 */
describe('the look changed mid-game', () => {
  it('draws the log again as its record reads', async () => {
    const { relayout } = await import('../src/game/layout.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    g.text.select(2);
    g.print('Logged line\n');
    const log = (): string => p.rows.map((r) => r.slice(24).join('')).join('\n');
    expect(log()).toContain('Logged line');
    // The letters let go, as the screen does on a change of look (the tests' text keeps its letters otherwise).
    for (const row of p.rows.slice(11)) row.fill(' ', 24);
    g.options.tileSet = 'original';
    await relayout(g);
    expect(log()).toContain('Logged line');
  });
});

describe('the look changed in a dungeon', () => {
  it("draws the map's top border's words again (the level's L), its blank cells left alone", async () => {
    const { relayout } = await import('../src/game/layout.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    g.text.select(0);
    g.text.moveTo(11, 0);
    g.print('L1');
    const top = (): string => p.rows[0].slice(0, 24).join('');
    expect(top()).toContain('L1');
    p.rows[0].fill(' '); // the letters let go, as the screen does on a change of look
    p.rows[0][3] = '#'; // the border's own, where the record is blank: not painted over
    g.options.tileSet = 'original';
    await relayout(g);
    expect(top()).toContain('L1');
    expect(p.rows[0][3]).toBe('#');
  });
});
