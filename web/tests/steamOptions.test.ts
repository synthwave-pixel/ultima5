import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOptions, writeOptions } from '../../desktop/steamOptions.cjs';

/** The Steam options kept per machine (desktop/steamOptions.cjs). */
describe('the Steam options', () => {
  const OFF = { playLine: false, compatTool: false, macPlay: false, cloud: {}, results: {}, lineOnAt: 0 };
  const withDir = (run: (dir: string, file: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-options-'));
    try {
      run(dir, join(dir, 'steam-options.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('are all off with no file', () => withDir((_dir, file) => expect(readOptions(file)).toEqual(OFF)));

  it('are all off after a corrupt file, or one of the wrong shape', () =>
    withDir((_dir, file) => {
      for (const text of ['{"playLine": tr', '', '[1]', 'null', '7']) {
        writeFileSync(file, text);
        expect(readOptions(file)).toEqual(OFF);
      }
    }));

  it('survive a write, each field as written', () =>
    withDir((dir, file) => {
      const o = {
        playLine: true,
        compatTool: false,
        macPlay: true,
        cloud: { '12345': true },
        results: { playLine: 'on' },
        lineOnAt: 1_700_000_000_000,
      };
      writeOptions(file, o);
      expect(readOptions(file)).toEqual(o);
      expect(readdirSync(dir)).toEqual(['steam-options.json']);
    }));

  it('take a field only when it is as it should be', () =>
    withDir((_dir, file) => {
      writeFileSync(
        file,
        JSON.stringify({
          playLine: 'yes',
          compatTool: true,
          macPlay: 1,
          cloud: { a: true, b: 'on', c: false },
          results: { x: 'ok', y: 3 },
          lineOnAt: 'soon',
        }),
      );
      expect(readOptions(file)).toEqual({ ...OFF, compatTool: true, cloud: { a: true }, results: { x: 'ok' } });
    }));

  it('are not fatal to fail to write', () => expect(() => writeOptions('/dev/null/steam-options.json', { ...OFF })).not.toThrow());
});
