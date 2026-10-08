import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { commandPrompt } from '../src/game/frame.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/**
 * A turn that prints what the turn before it printed folds into it with counts, instead of marching down the
 * message window (the port's, from the ultima3 port): "North (x5)" over "Blocked! (x5)". A turn that only begins
 * like the last one is shown whole. And a turn starts on the line after the last, with no empty line between.
 */
describe('repeated turns', () => {
  const ready = (): { g: Game; p: FakePlatform } => {
    const { g, p } = newGame();
    g.text.setWindow(2, 0x18, 0xb, 0x27, 0x17); // the message window, as the game sets it
    g.text.select(2);
    g.text.printChar(0xff);
    return { g, p };
  };
  /** One move: the prompt, then what the move prints (the game marks a move so, as it begins one). */
  const turn = (g: Game, ...lines: string[]): void => {
    commandPrompt(g);
    g.text.moving = true;
    for (const line of lines) g.print(`${line}\n`);
  };
  /** Any other turn: the prompt, then what it prints. */
  const other = (g: Game, ...lines: string[]): void => {
    commandPrompt(g);
    for (const line of lines) g.print(`${line}\n`);
  };
  /** The message window's rows, as shown, without the prompt's arrow. */
  const shown = (p: FakePlatform): string[] =>
    p.rows
      .slice(0xb, 0x18)
      .map((r) => r.slice(0x18).join('').replaceAll('\x02', ' ').trimEnd())
      .filter((r) => r.trim() !== '');

  it('folds a run into one line with a count, and stays where it is', () => {
    const { g, p } = ready();
    turn(g, 'North');
    turn(g, 'North');
    const row = g.text.win.y;
    for (let i = 0; i < 3; i++) turn(g, 'North');
    expect(shown(p)).toEqual([' North (x5)']);
    expect(g.text.win.y).toBe(row);
  });

  it('folds a turn of several lines, each with its count', () => {
    const { g, p } = ready();
    for (let i = 0; i < 3; i++) turn(g, 'West', 'Blocked!');
    expect(shown(p)).toEqual([' West (x3)', 'Blocked! (x3)']);
  });

  it('counts a long message once, on the last line it wraps onto, and leaves the lines before it whole', () => {
    const { g, p } = ready();
    for (let i = 0; i < 3; i++) turn(g, 'Escape-Not yet!', 'Shamino, armed with Flaming Oil:');
    // (The first fills its row, and wraps as a long message does: the count after the last line says it for both.)
    expect(shown(p)).toEqual([' Escape-Not yet!', 'Shamino, armed', 'with Flaming', 'Oil: (x3)']);
  });

  it('shows a turn that only begins like the last one whole, and starts afresh when it changes', () => {
    const { g, p } = ready();
    turn(g, 'North');
    turn(g, 'North');
    turn(g, 'North', 'Blocked!');
    turn(g, 'South');
    turn(g, 'South');
    expect(shown(p)).toEqual([' North (x2)', ' North', 'Blocked!', ' South (x2)']);
  });

  it('leaves no empty line between turns', () => {
    const { g, p } = ready();
    turn(g, 'Pass');
    turn(g, 'Look-North', 'A tree.');
    turn(g, 'Pass');
    const rows = p.rows.slice(0xb, 0x18).map((r) => r.slice(0x18).join('').replaceAll('\x02', ' ').trimEnd());
    expect(rows.slice(0, 4)).toEqual([' Pass', ' Look-North', 'A tree.', ' Pass']);
  });

  it('folds only moves: anything else said again is said again in full', () => {
    const { g, p } = ready();
    other(g, 'Get-North', 'Nothing to get!');
    other(g, 'Get-North', 'Nothing to get!');
    expect(shown(p)).toEqual([' Get-North', 'Nothing to get!', ' Get-North', 'Nothing to get!']);
    // A move after something else starts afresh; a move after a move folds.
    turn(g, 'North', 'Blocked!');
    turn(g, 'North', 'Blocked!');
    expect(shown(p).slice(-2)).toEqual([' North (x2)', 'Blocked! (x2)']);
  });

  it('counts past nine without running off the window', () => {
    const { g, p } = ready();
    for (let i = 0; i < 12; i++) turn(g, 'Slow progress!');
    const [line] = shown(p);
    expect(line.endsWith('(x12)')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(16);
  });

  it('shortens a repeated line at a whole word, where it and its count would not fit', () => {
    const { g, p } = ready();
    turn(g, 'North', 'Slow progress!');
    expect(shown(p)).toEqual([' North', 'Slow progress!']);
    turn(g, 'North', 'Slow progress!');
    expect(shown(p)).toEqual([' North (x2)', 'Slow (x2)']);
    turn(g, 'West', 'Very slow!');
    turn(g, 'West', 'Very slow!');
    expect(shown(p).slice(-2)).toEqual([' West (x2)', 'Very slow! (x2)']); // it fits whole
  });

  it('folds a turn passed again, as a move: Pass (x3)', async () => {
    const { g, p } = ready();
    const { processCommand } = await import('../src/game/commands.ts');
    g.s.mapId = 2; // in a towne, on foot
    for (let i = 0; i < 3; i++) {
      commandPrompt(g);
      await processCommand(g, 0x20); // the space bar, B on a controller: a turn passed
    }
    expect(shown(p).join('|')).toContain('Pass (x3)');
  });
});
