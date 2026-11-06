// web/tests/steamSaves.test.ts
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAll, removeKey, writable, writeKey } from '../../desktop/steamSaves.cjs';

const asRoot = process.getuid?.() === 0; // root writes where a mode says no: the permission test means nothing

describe("Steam launch's save files", () => {
  const made: string[] = [];
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'u5saves-'));
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const d of made.splice(0)) {
      try {
        chmodSync(d, 0o755);
      } catch {
        /* gone */
      }
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('writes a key as SAVED.GAM in a folder of its own and reads it back', () => {
    const dir = temp();
    expect(writeKey(dir, 'ultima5.char.k3x.last', '{"a":"é"}')).toBe(true);
    expect(readFileSync(join(dir, 'ultima5.char.k3x.last', 'SAVED.GAM'), 'utf8')).toBe('{"a":"é"}');
    expect(loadAll(dir)).toEqual({ 'ultima5.char.k3x.last': '{"a":"é"}' });
  });

  it('replaces a value and leaves no temporary file behind', () => {
    const dir = temp();
    writeKey(dir, 'ultima5.save', 'one');
    writeKey(dir, 'ultima5.save', 'two');
    expect(loadAll(dir)).toEqual({ 'ultima5.save': 'two' });
    expect(readdirSync(join(dir, 'ultima5.save'))).toEqual(['SAVED.GAM']);
  });

  it('makes the folder it is given when it is not there yet', () => {
    const dir = join(temp(), 'ultima5-sp', '1234');
    expect(loadAll(dir)).toEqual({});
    expect(writeKey(dir, 'ultima5.save', 'x')).toBe(true);
    expect(loadAll(dir)).toEqual({ 'ultima5.save': 'x' });
  });

  it('removes the key folder', () => {
    const dir = temp();
    writeKey(dir, 'ultima5.save', 'x');
    writeKey(dir, 'ultima5.saves', 'y');
    expect(removeKey(dir, 'ultima5.save')).toBe(true);
    expect(existsSync(join(dir, 'ultima5.save'))).toBe(false);
    expect(loadAll(dir)).toEqual({ 'ultima5.saves': 'y' });
    expect(removeKey(dir, 'ultima5.nothing')).toBe(true);
  });

  it.skipIf(asRoot)('says why, and does not throw, where it cannot write', () => {
    const dir = temp();
    chmodSync(dir, 0o555);
    expect(writeKey(dir, 'ultima5.save', 'x')).toBe('EACCES');
  });

  it('touches nothing outside the folder it is given, whatever the key', () => {
    const outer = temp();
    const dir = join(outer, 'mine');
    mkdirSync(dir);
    expect(writeKey(dir, '../escape', 'x')).toBe(true);
    expect(writeKey(dir, '..', 'x')).toBe('EINVAL');
    expect(removeKey(dir, '..')).toBe(false);
    expect(readdirSync(outer)).toEqual(['mine']);
    expect(loadAll(dir)).toEqual({ '../escape': 'x' });
    expect(removeKey(dir, '../escape')).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('reads a folder that will not read as none to be had, not as empty', () => {
    const dir = temp();
    const file = join(dir, 'not-a-folder');
    writeFileSync(file, 'x');
    expect(loadAll(file)).toBeNull();
  });

  it.skipIf(asRoot)('reads a folder it may not list as none to be had', () => {
    const dir = temp();
    writeKey(dir, 'ultima5.save', 'x');
    chmodSync(dir, 0o000);
    expect(loadAll(dir)).toBeNull();
  });
});

describe('whether the save folder can be written', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) {
      chmodSync(d, 0o755);
      rmSync(d, { recursive: true, force: true });
    }
  });
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'u5saves-'));
    made.push(dir);
    return dir;
  };

  /** A file system where only the folders in `there` exist, and only those in `open` may be written. */
  const fakeFs = (there: string[], open: string[]) => {
    const asked: string[] = [];
    const fail = (code: string) => Object.assign(new Error(code), { code });
    return {
      asked,
      fs: {
        constants: { W_OK: 2 },
        accessSync: (p: string) => {
          asked.push(p);
          if (!there.includes(p)) throw fail('ENOENT');
          if (!open.includes(p)) throw fail('EACCES');
        },
        statSync: (p: string) => ({ isDirectory: () => there.includes(p) }),
      },
    };
  };

  it('asks of the folder itself where it is there', () => {
    const { fs, asked } = fakeFs(['/', '/g', '/g/ultima5-sp', '/g/ultima5-sp/1'], ['/g/ultima5-sp/1']);
    expect(writable('/g/ultima5-sp/1', fs)).toBe(true);
    expect(asked).toEqual(['/g/ultima5-sp/1']);
  });

  it('asks of the nearest folder above it that is there, where it is not yet', () => {
    expect(writable('/g/ultima5-sp/1', fakeFs(['/', '/g'], ['/g']).fs)).toBe(true);
    const { fs, asked } = fakeFs(['/', '/g'], ['/']);
    expect(writable('/g/ultima5-sp/1', fs)).toBe(false);
    expect(asked).toEqual(['/g/ultima5-sp/1', '/g/ultima5-sp', '/g']);
  });

  it('is false for a folder that may not be written, and makes nothing finding out', () => {
    expect(writable('/g/ultima5-sp/1', fakeFs(['/', '/g', '/g/ultima5-sp', '/g/ultima5-sp/1'], ['/', '/g']).fs)).toBe(false);
    const dir = temp();
    expect(writable(join(dir, 'ultima5-sp', '1'))).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it.skipIf(asRoot)('is false where the game folder is read-only', () => {
    const dir = temp();
    chmodSync(dir, 0o555);
    expect(writable(join(dir, 'ultima5-sp', '1'))).toBe(false);
  });

  it('is false where a file stands in the way', () => {
    const dir = temp();
    writeFileSync(join(dir, 'ultima5-sp'), 'x');
    expect(writable(join(dir, 'ultima5-sp', '1'))).toBe(false);
  });
});
