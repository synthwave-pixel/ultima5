import { describe, expect, it } from 'vitest';
import { Intro } from '../src/game/intro.ts';
import { K } from '../src/game/io.ts';
import { fixLabel, fixNote, syncFixable, syncNote, syncProblem, syncText } from '../src/game/macSync.ts';
import { wrap } from '../src/game/menu.ts';
import type { SyncState } from '../src/install/sources.ts';
import { newGame } from './helpers.ts';

/** macOS Sync's words (game/macSync.ts): when there is something to say, when it can be fixed here, and how it is said. */
describe('macOS Sync', () => {
  const SYNC = (over: Partial<SyncState> = {}): SyncState => ({
    system: 'linux',
    flatpak: false,
    deck: false,
    launch: false,
    on: true,
    rules: 'ready',
    why: null,
    ruleList: [],
    stuck: 0,
    canFix: true,
    steamRunning: false,
    ...over,
  });

  it('has something to say only while on and Cloud saves made here (on a Mac, elsewhere) miss a Mac', () => {
    expect(syncProblem(SYNC())).toBe(false);
    expect(syncProblem(SYNC({ rules: 'needed' }))).toBe(true);
    expect(syncProblem(SYNC({ rules: 'unreadable' }))).toBe(true);
    expect(syncProblem(SYNC({ stuck: 1 }))).toBe(true);
    expect(syncProblem(SYNC({ rules: 'needed', on: false }))).toBe(false);
    expect(syncProblem(SYNC({ system: 'mac', rules: 'needed' }))).toBe(false);
    expect(syncProblem(SYNC({ system: 'mac', stuck: 2 }))).toBe(true);
    expect(syncProblem(null)).toBe(false);
  });

  it('fixes the rules only where Steam may be closed, saves anywhere, and nothing on a Mac or unread', () => {
    expect(syncFixable(SYNC({ rules: 'needed' }))).toBe(true);
    expect(syncFixable(SYNC({ rules: 'needed', canFix: false }))).toBe(false);
    expect(syncFixable(SYNC({ stuck: 3, canFix: false, launch: true }))).toBe(true);
    expect(syncFixable(SYNC({ rules: 'unreadable', stuck: 3 }))).toBe(false);
    expect(syncFixable(SYNC({ system: 'mac', stuck: 3 }))).toBe(false);
    expect(fixLabel(SYNC({ rules: 'needed', steamRunning: true }))).toBe('Fix now (restarts Steam)');
    expect(fixLabel(SYNC({ stuck: 3, steamRunning: true }))).toBe('Fix now');
  });

  it('says where to fix it when not here: Desktop Mode on a Deck, the AppImage for the Flatpak', () => {
    expect(syncText(SYNC({ rules: 'needed', canFix: false, deck: true }))).toContain('Desktop Mode');
    expect(syncText(SYNC({ rules: 'needed', canFix: false, flatpak: true }))).toContain('AppImage');
    expect(syncText(SYNC({ rules: 'needed' }))).not.toContain('To fix it');
  });

  it("keeps every menu note within the menu's four rows, in the game's 7-bit letters", () => {
    const states = [
      SYNC(),
      SYNC({ rules: 'needed', steamRunning: true }),
      SYNC({ rules: 'needed', canFix: false, deck: true }),
      SYNC({ rules: 'needed', canFix: false, flatpak: true }),
      SYNC({ rules: 'needed', canFix: false }),
      SYNC({ rules: 'unreadable', why: 'odd' }),
      SYNC({ stuck: 1234 }),
      SYNC({ on: false }),
      SYNC({ rules: 'not-owned' }),
      SYNC({ system: 'mac', stuck: 1234 }),
      SYNC({ system: 'mac' }),
    ];
    const notes = [...states.flatMap((s) => [syncNote(s, true), syncNote(s, false), fixNote(s)]), syncNote(null, true)];
    for (const note of notes) {
      expect(wrap(note).length, note).toBeLessThanOrEqual(4);
      expect(note.match(/[^\x20-\x7e]/g) ?? [], note).toEqual([]);
    }
    for (const s of states) expect(syncText(s).match(/[^\x20-\x7e]/g) ?? []).toEqual([]);
  });
});

/** The title's note with a choice beside OK (game/intro.ts newsBox): Fix now on the bar first, what came of it said. */
describe("the title's note with Fix now", () => {
  it('runs the fix when chosen and says what came of it; OK leaves it alone', async () => {
    const box = (choose: number[]) => {
      const { g, p } = newGame();
      let ran = 0;
      g.hooks.note = () => ({
        text: "Cloud saves made here don't reach a Mac.",
        seen: () => undefined,
        action: { label: 'Fix now', run: async () => (ran++, 'Done: sent again.') },
      });
      p.keys.push(...choose);
      return { g, p, ran: () => ran, intro: new Intro(g) as unknown as { newsBox(): Promise<boolean> } };
    };
    const fix = box([K.Enter, K.Enter]);
    expect(await fix.intro.newsBox()).toBe(true);
    expect(fix.ran()).toBe(1);
    expect(fix.p.log.replace(/\s+/g, '')).toContain('Done:sentagain.');
    const ok = box([K.Down, K.Enter]);
    expect(await ok.intro.newsBox()).toBe(true);
    expect(ok.ran()).toBe(0);
  });
});
