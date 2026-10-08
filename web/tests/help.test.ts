import { describe, expect, it } from 'vitest';
import { helpPages } from '../src/game/help.ts';
import { gameplayLines, PAGE_LINES, PAGE_WIDTH, settingLines, wrap } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/** The Help pages (help.ts) and the Settings notes: every line within the panel, every page within its rows. */
describe('the Help pages and the Settings notes', () => {
  it('fit the panel for each input, each look, and with the status letters on or off', () => {
    const { g } = newGame();
    for (const input of ['controller', 'letters'] as const)
      for (const tileSet of ['standard', 'original'] as const)
        for (const statusLetters of [false, true]) {
          Object.assign(g.options, { input, tileSet, statusLetters });
          const pages = helpPages(g);
          for (const [i, p] of pages.entries()) {
            // The title, with the page's number of the pages (menu.ts showPages), along the panel's top.
            expect(`${p.title} ${i + 1}/${pages.length}`.length, p.title).toBeLessThanOrEqual(PAGE_WIDTH);
            expect(p.lines.length, `${input} ${tileSet} ${p.title}`).toBeLessThanOrEqual(PAGE_LINES);
            for (const l of p.lines) expect(l.length, `${p.title}: "${l}"`).toBeLessThanOrEqual(PAGE_WIDTH);
          }
        }
  });

  it("says each setting's note in the four rows at the foot of the list", () => {
    const { g } = newGame();
    g.lastSource = 'keyboard'; // the Input line with it
    for (const tileSet of ['standard', 'original'] as const) {
      g.options.tileSet = tileSet;
      for (const s of [...settingLines(g, true), ...gameplayLines(g)])
        expect(wrap(s.note ?? '').length, `${tileSet} ${s.label}`).toBeLessThanOrEqual(4);
    }
  });

  it('has Auto Pause, off unless turned on', async () => {
    const { DEFAULTS } = await import('../src/game/settings.ts');
    expect(DEFAULTS.autoPause).toBe(false);
    const { g } = newGame();
    const line = (): ReturnType<typeof gameplayLines>[number] => gameplayLines(g).find((s) => s.label.startsWith('Auto Pause'))!;
    expect(line().label).toBe('Auto Pause: Off');
    await line().act?.();
    expect(g.options.autoPause).toBe(true);
    expect(line().label).toBe('Auto Pause: On');
  });
});

describe('the Tips', () => {
  it('are listed by topic, each opening to its paragraphs, every line within the panel', async () => {
    const { TIPS, topicLines } = await import('../src/game/tips.ts');
    expect(TIPS.map((t) => t.topic)).toEqual([
      'First steps',
      'Food',
      'Reagents',
      'Healing',
      'Camping',
      'Poison',
      'Magic',
      'Leveling',
      'Talking',
      'Day and night',
      'Dungeons',
      'Doors',
      'Virtue',
      'Travel',
      'The Quest',
    ]);
    for (const t of TIPS) for (const l of topicLines(t)) expect(l.length, `${t.topic}: "${l}"`).toBeLessThanOrEqual(PAGE_WIDTH);
    const first = topicLines(TIPS[0]);
    expect(first[0]).toMatch(/^You wake in Iolo/);
    expect(first).toContain(''); // the paragraphs parted
    expect(first.join(' ')).toContain('Go here first.');
  });
});

describe('the pointer to the Tips', () => {
  it("is given on a new game's first turn, once, and never to a game saved before it", async () => {
    const { journeyOnward } = await import('../src/game/run.ts');
    const { restore, serialize } = await import('../src/game/storage.ts');
    const { g, p } = newGame();
    g.tipsNudged = false; // as a new character leaves it (intro.ts createCharacter)
    journeyOnward(g);
    expect(p.log.replace(/\s+/g, '')).toContain('SeeTips,inthepausemenu'); // as the log wraps it
    const saved = serialize(g);
    expect(saved.tipsNudged).toBe(true);
    const again = newGame();
    restore(again.g, saved);
    journeyOnward(again.g);
    expect(again.p.log.replace(/\s+/g, '')).not.toContain('SeeTips');
    // A save from before the pointer: begun, so none.
    const old = newGame();
    const before = serialize(old.g);
    delete before.tipsNudged;
    old.g.tipsNudged = false;
    restore(old.g, before);
    journeyOnward(old.g);
    expect(old.p.log.replace(/\s+/g, '')).not.toContain('SeeTips');
  });
});

describe("the Help's controller", () => {
  it('opens the Help for a controller with its picture: the face buttons in their places, what each does under it', async () => {
    const { showPages } = await import('../src/game/menu.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    const pages = helpPages(g);
    expect(pages[0].title).toBe('The controller');
    let shown: string[] = [];
    fly(g, p, [
      () => {
        shown = p.rows.map((r) => r.join(''));
        return Pad.B;
      },
    ]);
    await showPages(g, pages).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    const text = shown.join('\n');
    // Y over X and B, A under them: the face buttons as a controller has them.
    const yRow = shown.findIndex((r) => /\bY\s*$/.test(r.slice(0, 18)));
    expect(shown[yRow + 1].slice(0, 18)).toMatch(/X B\s*$/);
    expect(shown[yRow + 2].slice(0, 18)).toMatch(/A\s*$/);
    // The d-pad and Start over the picture; under it the face buttons as the eye reads them: Y, X, B, A.
    const row = (start: string): number => shown.findIndex((r) => r.slice(1).startsWith(start));
    for (const start of ['D-pad:', 'Start / Select:', 'Y: Cast', 'X: Attack', 'B: Back', 'A: Open'])
      expect(row(start), start).toBeGreaterThan(0);
    expect(row('D-pad:')).toBeLessThan(row('Start / Select:'));
    expect(row('Start / Select:')).toBeLessThan(yRow);
    expect(yRow).toBeLessThan(row('Y: Cast'));
    expect([row('Y: Cast'), row('X: Attack'), row('B: Back'), row('A: Open')]).toEqual(
      [...[row('Y: Cast'), row('X: Attack'), row('B: Back'), row('A: Open')]].sort((a, b) => a - b),
    );
    for (const line of [
      'D-pad: Move / Menus',
      'A: Open / Activate',
      'B: Back / Pass Turn',
      'X: Attack',
      'Y: Cast / Hint /',
      'Center Map',
      'Start / Select: Pause',
    ])
      expect(text).toContain(line);
  });

  it('is not shown for the letters of 1988', () => {
    const { g } = newGame();
    g.options.input = 'letters';
    expect(helpPages(g).map((p) => p.title)).not.toContain('The controller');
  });
});
