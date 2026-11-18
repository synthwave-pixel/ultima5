import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The core every game on this engine shares (gameCore.ts) must load without any game's rules: its imports, other than
 * types (erased when compiled), may be only these. A game without Ultima V's files (the Ultima IV port) builds its
 * game on it.
 */
const ALLOWED = new Set(['./io.ts', './rng.ts', './settings.ts', './appearance.ts']);

describe('GameCore', () => {
  it('imports no game rules', () => {
    const src = readFileSync(new URL('../src/game/gameCore.ts', import.meta.url), 'utf8');
    const values = [...src.matchAll(/^import\s+(?!type\b)([^;]*?)from\s+'([^']+)';/gms)]
      .filter(([, what]) => !/^\{\s*(type\s+\w+\s*,?\s*)+\}\s*$/.test(what.trim()))
      .map(([, , from]) => from);
    expect(values.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});

/**
 * The title's menu and the screens it opens (Journey Onward's character picker, Manage Saves, Steam (beta), the cloud
 * switch, export and import) and a new character's questions (characterQuestions.ts) are every game's: they take a GameCore, and reach a game's saves through its SaveCodec
 * (saveCodec.ts), never Ultima V's Game or Ultima V's saves (ultima5Saves.ts) directly.
 */
const TITLE_SCREENS = ['titleMenu.ts', 'characterMenu.ts', 'steamMenu.ts', 'cloudSwitch.ts', 'transfer.ts', 'characterQuestions.ts'];

describe('The title and its screens', () => {
  for (const file of TITLE_SCREENS)
    it(`${file} imports neither Ultima V's Game nor its saves`, () => {
      const src = readFileSync(new URL(`../src/game/${file}`, import.meta.url), 'utf8');
      const from = [...src.matchAll(/(?:^import\s[^;]*?from\s+|import\()'([^']+)'/gms)].map(([, f]) => f);
      expect(from.filter((f) => f === './game.ts' || f === './ultima5Saves.ts')).toEqual([]);
    });
});
