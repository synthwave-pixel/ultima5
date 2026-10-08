import { describe, expect, it } from 'vitest';
import type { Candidate } from '../src/install/gameFiles.ts';
import { scanOutcome, type FoundCopy } from '../src/install/scan.ts';
import { gameFiles } from './helpers.ts';

/** The checked-in copy as a scan would find it, at `where`; `change` edits its candidates first. */
const copy = (where: string, change: (c: Candidate[]) => Candidate[] = (c) => c): FoundCopy => {
  const files = gameFiles();
  return { where, files: change(files.names().map((n) => ({ path: n, data: files.get(n) }))) };
};
const edited = (c: Candidate[]): Candidate[] =>
  c.map((f) => (f.path === 'TEXT.16' || f.path === 'DATA.OVL' ? { ...f, data: f.data.map((b, i) => (i === 100 ? b ^ 1 : b)) } : f));
const editedOne = (c: Candidate[]): Candidate[] =>
  c.map((f) => (f.path === 'TEXT.16' ? { ...f, data: f.data.map((b, i) => (i === 100 ? b ^ 1 : b)) } : f));
const without = (c: Candidate[]): Candidate[] => c.filter((f) => f.path !== 'TILES.16');

describe('a scan', () => {
  it('installs the first verified copy it found', () => {
    const got = scanOutcome([copy('~/u5'), copy('/Applications/Ultima V™.app')], 'none');
    expect(got.kind).toBe('install');
    expect(got.kind === 'install' && got.where).toBe('~/u5');
  });

  it('passes over a modified or incomplete copy for a verified one after it', () => {
    const got = scanOutcome([copy('~/u5', edited), copy('~/U5b', without), copy('C:\\GOG Games\\Ultima 5')], 'none');
    expect(got.kind === 'install' && got.where).toBe('C:\\GOG Games\\Ultima 5');
  });

  it('installs no modified or incomplete copy, and says what it found and what to do', () => {
    const got = scanOutcome([copy('~/u5', edited), copy('~/old', without)], 'none');
    expect(got.kind).toBe('report');
    const text = got.kind === 'report' ? got.text : '';
    expect(text).toContain('~/u5');
    expect(text).toMatch(/modified \(2 files\)/);
    expect(text).toMatch(/drop it or choose it/);
    expect(text).toContain('~/old');
    expect(text).toMatch(/incomplete/);
  });

  it('says one modified file in the singular', () => {
    const got = scanOutcome([copy('~/u5', editedOne)], 'none');
    expect(got.kind === 'report' && got.text).toMatch(/modified \(1 file\):/);
  });

  it('says `nothing` where there is nothing', () => {
    expect(scanOutcome([], 'No game files found.')).toEqual({ kind: 'report', text: 'No game files found.' });
  });
});
