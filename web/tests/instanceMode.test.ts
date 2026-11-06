import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clashMessage, noteMode } from '../../desktop/instanceMode.cjs';

/** Which way the running copy was started (desktop/instanceMode.cjs). */
describe('the running copy’s mode', () => {
  const OUTSIDE = 'Ultima V is already open outside Steam. Close it, then press Play in Steam again.';
  const THROUGH = 'Ultima V is already open through Steam. Close it there first.';
  const withDir = (run: (file: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-instance-'));
    try {
      run(join(dir, 'instance.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const note = (file: string, steam: boolean) => writeFileSync(file, JSON.stringify({ steam }));

  it('is no clash for the same mode, and each message for the other', () =>
    withDir((file) => {
      note(file, false);
      expect(clashMessage(file, false)).toBeNull();
      expect(clashMessage(file, true)).toBe(OUTSIDE);
      note(file, true);
      expect(clashMessage(file, true)).toBeNull();
      expect(clashMessage(file, false)).toBe(THROUGH);
    }));

  it('is no clash with nothing noted, or a note that cannot be read', () =>
    withDir((file) => {
      expect(clashMessage(file, true)).toBeNull();
      writeFileSync(file, '{not json');
      expect(clashMessage(file, true)).toBeNull();
      writeFileSync(file, JSON.stringify({ steam: 'yes' }));
      expect(clashMessage(file, true)).toBeNull();
    }));

  it('is written as JSON that is read back', () =>
    withDir((file) => {
      noteMode(file, true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ steam: true });
      expect(clashMessage(file, false)).toBe(THROUGH);
      expect(clashMessage(file, true)).toBeNull();
    }));

  it('is written even where its folder is not made yet', () =>
    withDir((file) => {
      const deep = join(file, '..', 'not', 'yet', 'instance.json');
      expect(() => noteMode(deep, false)).not.toThrow();
      expect(clashMessage(deep, true)).toBe(OUTSIDE);
    }));
});
