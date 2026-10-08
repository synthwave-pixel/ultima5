import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { complete, fingerprint, identify, REQUIRED, type Candidate } from '../src/install/gameFiles.ts';
import { warnings } from '../src/install/installer.ts';
import { KNOWN } from '../src/install/known.ts';
import { readZip } from '../src/install/zip.ts';

const ZIP = fileURLToPath(new URL('../../gamedata/Ultima_V_-_Warriors_of_Destiny_1988.zip', import.meta.url));
const GAME = fileURLToPath(new URL('../../gamedata/ultima5/', import.meta.url));

/** The checked-in copy, as loose files; `edit` may change one. */
function copy(edit?: (name: string, data: Uint8Array) => Uint8Array): Candidate[] {
  return REQUIRED.map((name) => {
    const data = new Uint8Array(readFileSync(GAME + name));
    return { path: `ultima5/${name}`, data: edit ? edit(name, data) : data };
  });
}

describe('installer', () => {
  it('finds every required file in the Internet Archive zip, preferring the base game over upgrade/', async () => {
    const entries = await readZip(new Uint8Array(readFileSync(ZIP)));
    const id = identify(entries);
    expect(id.missing).toEqual([]);
    expect(complete(id)).toBe(true);
    // The Upgrade's music is kept.
    expect(id.files.has('U5THEME.XMI')).toBe(true);
  });

  it('names what is missing and what is the wrong version', () => {
    const id = identify([
      { path: 'u5/data.ovl', data: new Uint8Array(100) },
      { path: 'u5/TILES.16', data: new Uint8Array(10) },
    ]);
    expect(id.wrong).toEqual(['DATA.OVL']);
    expect(id.missing.length).toBe(REQUIRED.length - 2);
  });

  it('knows the copy: every file the engine reads, as known.ts has it (npm run known writes it again)', () => {
    for (const name of REQUIRED) expect(KNOWN[name], name).toContain(fingerprint(new Uint8Array(readFileSync(GAME + name))));
    const id = identify(copy());
    expect(id.changed).toEqual([]);
    expect(id.damaged).toEqual([]);
    expect(warnings(id)).toEqual([]);
  });

  it("knows the Upgrade's own DATA.OVL, three bytes from the game's", () => {
    const upgrade = new Uint8Array(readFileSync(`${GAME}upgrade/DATA.OVL`));
    expect(identify(copy((n, d) => (n === 'DATA.OVL' ? upgrade : d))).changed).toEqual([]);
  });

  it('names a file with a byte changed, or cut short, and still installs it if the player says so', () => {
    const id = identify(
      copy((n, d) => {
        if (n === 'TILES.16') d[1000] ^= 0xff;
        return n === 'TOWNE.TLK' ? d.subarray(0, d.length - 10) : d;
      }),
    );
    expect(id.changed).toEqual(['TOWNE.TLK', 'TILES.16']);
    expect(complete(id)).toBe(true);
    expect(warnings(id).join('\n')).toMatch(/edited, or damaged: TOWNE.TLK, TILES.16\./);
  });

  it("says a file is damaged in its zip where the archive's own check fails", async () => {
    const zip = new Uint8Array(readFileSync(ZIP));
    // The central directory's CRC-32 for ultima5/TILES.16, changed: the file no longer matches it.
    const name = new TextEncoder().encode('ultima5/TILES.16');
    let p = zip.length - 22;
    while (!(zip[p] === 0x50 && zip[p + 1] === 0x4b && zip[p + 2] === 5 && zip[p + 3] === 6)) p--;
    p = zip[p + 16] | (zip[p + 17] << 8) | (zip[p + 18] << 16) | (zip[p + 19] << 24);
    for (;;) {
      const len = zip[p + 28] | (zip[p + 29] << 8);
      if (len === name.length && name.every((c, i) => zip[p + 46 + i] === c)) break;
      p += 46 + len + (zip[p + 30] | (zip[p + 31] << 8)) + (zip[p + 32] | (zip[p + 33] << 8));
    }
    zip[p + 16] ^= 0xff;
    const id = identify(await readZip(zip));
    expect(id.damaged).toEqual(['TILES.16']);
    expect(id.changed).toEqual([]);
    expect(warnings(id)[0]).toBe('Damaged in the .zip (its own check fails): TILES.16.');
  });
});
