import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingNames } from '../../desktop/scan.cjs';

/** How many required names a folder lacks, matched as readCopy matches (any case, one folder down). */
describe('missingNames', () => {
  it('counts what is absent, any case, in the folder or one down', () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-missing-'));
    try {
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'data.ovl'), 'x');
      writeFileSync(join(dir, 'sub', 'BRIT.DAT'), 'x');
      expect(missingNames(dir, ['DATA.OVL', 'BRIT.DAT', 'TOWNE.DAT'])).toBe(1);
      expect(missingNames(dir, ['DATA.OVL'])).toBe(0);
      expect(missingNames(join(dir, 'nope'), ['DATA.OVL'])).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
