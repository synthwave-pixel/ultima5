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
