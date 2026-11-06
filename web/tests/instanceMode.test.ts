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
  const other = (file: string, steam: boolean) => writeFileSync(file, JSON.stringify({ steam, pid: process.pid + 1 }));
  const alive = () => true;

  it('is no clash for the same mode, and each message for the other', () =>
    withDir((file) => {
      other(file, false);
      expect(clashMessage(file, false, alive)).toBeNull();
      expect(clashMessage(file, true, alive)).toBe(OUTSIDE);
      other(file, true);
      expect(clashMessage(file, true, alive)).toBeNull();
      expect(clashMessage(file, false, alive)).toBe(THROUGH);
    }));

  it('is no clash with nothing noted, or a note that cannot be read', () =>
    withDir((file) => {
      expect(clashMessage(file, true, alive)).toBeNull();
      writeFileSync(file, '{not json');
      expect(clashMessage(file, true, alive)).toBeNull();
      writeFileSync(file, JSON.stringify({ steam: 'yes' }));
      expect(clashMessage(file, true, alive)).toBeNull();
    }));

  it('is no clash when the copy noted is gone, as after a crash', () =>
    withDir((file) => {
      other(file, false);
      expect(clashMessage(file, true, () => false)).toBeNull();
    }));

  it('is written as JSON that is read back, with this process’s id', () =>
    withDir((file) => {
      noteMode(file, true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ steam: true, pid: process.pid });
      // Its own note is never a clash with itself; a note of the other mode from a live process is.
      expect(clashMessage(file, false)).toBeNull();
      writeFileSync(file, JSON.stringify({ steam: true, pid: process.ppid }));
      expect(clashMessage(file, false)).toBe(THROUGH); // the parent process is running
    }));
});
