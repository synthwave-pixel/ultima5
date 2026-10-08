import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFiles } from '../src/data/files.ts';
import { crc32 } from '../src/install/crc32.ts';
import { complete, fingerprint, identify, REQUIRED, unknownFiles, type Candidate } from '../src/install/gameFiles.ts';
import { warnings } from '../src/install/installer.ts';
import { verified } from '../src/install/scan.ts';
import { clearInstalled, loadInstalled, saveInstalled } from '../src/install/store.ts';
import { readZip } from '../src/install/zip.ts';

const GAME = fileURLToPath(new URL('../../gamedata/ultima5/', import.meta.url));
const PRINTS = '#prints';

/** An IndexedDB in memory, as far as the store uses it: a transaction is kept whole or not at all. */
class FakeRequest {
  result: unknown;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeStore {
  constructor(private readonly work: Map<string, unknown>) {}
  clear(): void {
    this.work.clear();
  }
  put(value: unknown, key: string): void {
    this.work.set(key, structuredClone(value));
  }
  private reply(result: unknown): FakeRequest {
    const req = new FakeRequest();
    req.result = result;
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }
  getAllKeys(): FakeRequest {
    return this.reply([...this.work.keys()].sort());
  }
  getAll(): FakeRequest {
    return this.reply([...this.work.keys()].sort().map((k) => structuredClone(this.work.get(k))));
  }
}

class FakeTx {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private readonly work: Map<string, unknown>;
  constructor(
    private readonly idb: FakeIDB,
    private readonly write: boolean,
  ) {
    this.work = new Map(idb.data);
    setTimeout(() => this.commit());
  }
  objectStore(): FakeStore {
    return new FakeStore(this.work);
  }
  private commit(): void {
    if (this.write && this.idb.abortNextWrite) {
      this.error = this.idb.abortNextWrite;
      this.idb.abortNextWrite = null;
      this.onabort?.();
      return;
    }
    if (this.write) this.idb.data = this.work;
    this.oncomplete?.();
  }
}

class FakeDB {
  constructor(private readonly idb: FakeIDB) {
    idb.connections++;
  }
  createObjectStore(): void {}
  transaction(_store: string, mode: string): FakeTx {
    return new FakeTx(this.idb, mode === 'readwrite');
  }
  close(): void {
    this.idb.connections--;
  }
}

class FakeIDB {
  data = new Map<string, unknown>();
  connections = 0;
  /** The next write transaction aborts (the disk is full), changing nothing. */
  abortNextWrite: Error | null = null;
  /** IndexedDB is not to be had (a private window, a blocked site). */
  unavailable = false;
  open(): FakeRequest {
    const req = new FakeRequest();
    setTimeout(() => {
      if (this.unavailable) {
        req.error = new Error('blocked');
        req.onerror?.();
        return;
      }
      req.result = new FakeDB(this);
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  }
}

/** A few small files, each different. */
function small(tag = 1): GameFiles {
  const files = new GameFiles();
  for (const [n, name] of ['ONE.DAT', 'TWO.DAT', 'THREE.DAT'].entries())
    files.set(
      name,
      Uint8Array.from({ length: 50 + n }, (_, i) => (i * 7 + n * 31 + tag) & 0xff),
    );
  return files;
}

const same = (a: GameFiles, b: GameFiles): void => {
  expect(a.names().sort()).toEqual(b.names().sort());
  for (const n of b.names()) expect(Array.from(a.get(n)), n).toEqual(Array.from(b.get(n)));
};

describe('the installed game files', () => {
  let idb: FakeIDB;
  beforeEach(() => {
    idb = new FakeIDB();
    vi.stubGlobal('indexedDB', idb);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps each file as a record of its own, and gives them back byte for byte, none damaged', async () => {
    const files = small();
    await saveInstalled(files);
    expect([...idb.data.keys()].sort()).toEqual([PRINTS, 'ONE.DAT', 'THREE.DAT', 'TWO.DAT'].sort());
    const got = await loadInstalled();
    expect(got).not.toBeNull();
    same(got!.files, files);
    expect(got!.damaged).toEqual([]);
    expect(idb.connections).toBe(0);
  });

  it('has nothing installed to begin with, nor where the browser keeps nothing for it', async () => {
    expect(await loadInstalled()).toBeNull();
    idb.unavailable = true;
    await saveInstalled(small()).then(
      () => expect.unreachable('a save with no storage should fail'),
      (e: unknown) => expect(e).toBeInstanceOf(Error),
    );
    expect(await loadInstalled()).toBeNull();
  });

  it('forgets everything on clear, the fingerprints too', async () => {
    await saveInstalled(small());
    await clearInstalled();
    expect(idb.data.size).toBe(0);
    expect(await loadInstalled()).toBeNull();
  });

  it('is nothing installed where only the record of fingerprints is left', async () => {
    await saveInstalled(small());
    for (const k of [...idb.data.keys()]) if (k !== PRINTS) idb.data.delete(k);
    expect(await loadInstalled()).toBeNull();
  });

  it('replaces the copy before it whole: a file the new copy lacks is gone', async () => {
    await saveInstalled(small(1));
    const next = new GameFiles([['TWO.DAT', Uint8Array.of(9, 9, 9)]]);
    await saveInstalled(next);
    const got = await loadInstalled();
    same(got!.files, next);
    expect(got!.files.has('ONE.DAT')).toBe(false);
    expect(got!.damaged).toEqual([]);
  });

  it('keeps the copy before it where an install fails part way', async () => {
    const before = small(1);
    await saveInstalled(before);
    idb.abortNextWrite = new Error('QuotaExceededError');
    await expect(saveInstalled(small(2))).rejects.toThrow('QuotaExceededError');
    expect(idb.connections).toBe(0); // the failed write's connection closed all the same
    const got = await loadInstalled();
    same(got!.files, before);
    expect(got!.damaged).toEqual([]);
  });

  it('names the files that are not as they were installed: changed, or gone, since', async () => {
    await saveInstalled(small());
    const two = new Uint8Array(idb.data.get('TWO.DAT') as Uint8Array);
    two[3] ^= 1;
    idb.data.set('TWO.DAT', two);
    idb.data.delete('THREE.DAT');
    const got = await loadInstalled();
    expect(got!.damaged.sort()).toEqual(['THREE.DAT', 'TWO.DAT']);
    // Cut short is damage too: the size is part of the fingerprint.
    idb.data.set('ONE.DAT', (idb.data.get('ONE.DAT') as Uint8Array).slice(0, 10));
    expect((await loadInstalled())!.damaged.sort()).toEqual(['ONE.DAT', 'THREE.DAT', 'TWO.DAT']);
  });

  it('takes a copy installed before fingerprints were kept as it is, and keeps them from then on', async () => {
    await saveInstalled(small());
    idb.data.delete(PRINTS);
    const first = await loadInstalled();
    expect(first!.damaged).toEqual([]);
    expect(idb.data.has(PRINTS)).toBe(true);
    const one = new Uint8Array(idb.data.get('ONE.DAT') as Uint8Array);
    one[0] ^= 0xff;
    idb.data.set('ONE.DAT', one);
    expect((await loadInstalled())!.damaged).toEqual(['ONE.DAT']);
  });
});

/** The checked-in copy, as loose files. */
function copy(edit?: (name: string, data: Uint8Array) => Uint8Array): Candidate[] {
  return REQUIRED.map((name) => {
    const data = new Uint8Array(readFileSync(GAME + name));
    return { path: `Ultima V/${name}`, data: edit ? edit(name, data) : data };
  });
}

interface Entry {
  name: string;
  data: Uint8Array;
  /** 0 stored (the default), 8 deflated, 99 something this reader does not open. */
  method?: 0 | 8 | 99;
  /** The CRC-32 the archive claims, where it is not the data's. */
  crc?: number;
  /** The bytes as stored, where they are not the data's. */
  raw?: Uint8Array;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A .zip: local headers and data, the central directory, its end record. */
async function zipOf(entries: Entry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const method = e.method ?? 0;
    const stored = e.raw ?? (method === 8 ? await deflate(e.data) : e.data);
    const crc = e.crc ?? crc32(e.data);
    const name = enc.encode(e.name);
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, method, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, stored.length, true);
    h.setUint32(22, e.data.length, true);
    h.setUint16(26, name.length, true);
    head.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const c = new DataView(cen.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, method, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, stored.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, at, true);
    cen.set(name, 46);
    central.push(cen);
    chunks.push(head, stored);
    at += head.length + stored.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, at, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** What the installer does with a .zip it is given: its entries, under the zip's own path. */
async function expandZip(path: string, zip: Uint8Array): Promise<Candidate[]> {
  return (await readZip(zip)).map((e) => ({ path: `${path}/${e.path}`, data: e.data, ...(e.damaged ? { damaged: true } : {}) }));
}

describe('the files an install is made of', () => {
  it('opens a .zip stored or deflated, a folder inside it, and finds the whole game', async () => {
    const files = copy();
    const zip = await zipOf([
      { name: 'Ultima V/', data: new Uint8Array(0) },
      ...files.map((f, i) => ({ name: f.path, data: f.data, method: i % 2 ? (8 as const) : (0 as const) })),
      { name: 'Ultima V/README.TXT', data: Uint8Array.of(1, 2, 3), method: 8 },
    ]);
    const id = identify(await expandZip('game.zip', zip));
    expect(complete(id)).toBe(true);
    expect(verified(id)).toBe(true);
    expect(id.files.has('README.TXT')).toBe(false);
    for (const f of files) expect(Array.from(id.files.get(f.path.slice(9))), f.path).toEqual(Array.from(f.data));
  });

  it('names a file whose CRC-32 fails in its .zip, stored or deflated, and counts it damaged, not changed', async () => {
    const files = copy();
    const zip = await zipOf(
      files.map((f) => {
        if (f.path.endsWith('KARMA.DAT')) return { name: f.path, data: f.data, crc: crc32(f.data) ^ 1 };
        if (f.path.endsWith('SIGNS.DAT')) return { name: f.path, data: f.data, method: 8 as const, crc: 12345 };
        return { name: f.path, data: f.data };
      }),
    );
    const id = identify(await expandZip('game.zip', zip));
    expect(id.damaged.sort()).toEqual(['KARMA.DAT', 'SIGNS.DAT']);
    expect(id.changed).toEqual([]);
    expect(complete(id)).toBe(true);
    expect(verified(id)).toBe(false);
    expect(warnings(id)[0]).toMatch(/^Damaged in the \.zip \(its own check fails\): KARMA\.DAT, SIGNS\.DAT\./);
  });

  it('counts a deflated entry that will not inflate as damaged, empty', async () => {
    const data = Uint8Array.from({ length: 300 }, (_, i) => i & 0xff);
    const [entry] = await readZip(await zipOf([{ name: 'a/KARMA.DAT', data, method: 8, raw: new Uint8Array(40).fill(0xff) }]));
    expect(entry.path).toBe('a/KARMA.DAT');
    expect(entry.data.length).toBe(0);
    expect(entry.damaged).toBe(true);
  });

  it('refuses what is no .zip, or whose directory is damaged, and passes over methods it cannot open', async () => {
    await expect(readZip(new Uint8Array(100))).rejects.toThrow('Not a zip file');
    const zip = await zipOf([{ name: 'KARMA.DAT', data: Uint8Array.of(1) }]);
    const central = new DataView(zip.buffer).getUint32(zip.length - 22 + 16, true);
    zip[central] ^= 0xff;
    await expect(readZip(zip)).rejects.toThrow('Damaged zip directory');
    const odd = await zipOf([
      { name: 'KARMA.DAT', data: Uint8Array.of(1), method: 99 },
      { name: 'SIGNS.DAT', data: Uint8Array.of(2) },
    ]);
    expect((await readZip(odd)).map((e) => e.path)).toEqual(['SIGNS.DAT']);
  });

  it("takes a folder's files as they come: any case, either slash, the shallowest copy, other files left", () => {
    const real = copy();
    const loose: Candidate[] = real.map((f) => ({
      path: f.path.replace('Ultima V/', 'C:\\games\\ULTIMA5\\').toLowerCase(),
      data: f.data,
    }));
    const upgraded = new Uint8Array(real[0].data);
    upgraded[10] ^= 1;
    loose.push(
      { path: 'C:\\games\\ULTIMA5\\upgrade\\DATA.OVL', data: upgraded },
      { path: 'C:\\games\\ULTIMA5\\upgrade\\U5THEME.XMI', data: Uint8Array.of(7) },
      { path: 'C:\\games\\ULTIMA5\\notes.txt', data: Uint8Array.of(8) },
    );
    const id = identify(loose);
    expect(id.missing).toEqual([]);
    expect(id.changed).toEqual([]);
    expect(Array.from(id.files.get('DATA.OVL'))).toEqual(Array.from(real[0].data));
    expect(id.files.has('U5THEME.XMI')).toBe(true);
    expect(id.files.has('NOTES.TXT')).toBe(false);
  });

  it('turns away a DATA.OVL of another size, and the copy is not complete', () => {
    const id = identify(copy((n, d) => (n === 'DATA.OVL' ? d.subarray(0, d.length - 1) : d)));
    expect(id.wrong).toEqual(['DATA.OVL']);
    expect(id.missing).toEqual([]);
    expect(id.files.has('DATA.OVL')).toBe(false);
    expect(complete(id)).toBe(false);
    expect(verified(id)).toBe(false);
  });

  it('knows a hash is unknown by its size as much as its CRC-32', () => {
    const files = identify(copy()).files;
    expect(unknownFiles(files)).toEqual([]);
    const karma = files.get('KARMA.DAT');
    expect(fingerprint(karma)).toMatch(/^761:/);
    files.set('KARMA.DAT', Uint8Array.from([...karma, 0]));
    files.set('SIGNS.DAT', new Uint8Array(files.get('SIGNS.DAT')).fill(0));
    expect(unknownFiles(files)).toEqual(['SIGNS.DAT', 'KARMA.DAT'].sort((a, b) => REQUIRED.indexOf(a) - REQUIRED.indexOf(b)));
  });

  it('says a long list of changed files by a few names and a count', () => {
    const id = identify(copy((n, d) => (n.endsWith('.16') ? d.map((b) => b ^ 1) : d)));
    const said = warnings(id);
    expect(id.changed.length).toBeGreaterThan(8);
    expect(said[0]).toContain(`and ${id.changed.length - 8} more`);
    expect(said.at(-1)).toBe('The game may not play as it should. A modded copy is fine to install.');
  });
});

describe('an install, from the files given to the files kept', () => {
  let idb: FakeIDB;
  beforeEach(() => {
    idb = new FakeIDB();
    vi.stubGlobal('indexedDB', idb);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores what a .zip held, and what comes back is the known copy, unharmed', async () => {
    const zip = await zipOf(copy().map((f) => ({ name: f.path, data: f.data, method: 8 as const })));
    const found = identify(await expandZip('game.zip', zip));
    await saveInstalled(found.files);
    const got = await loadInstalled();
    expect(got!.damaged).toEqual([]);
    same(got!.files, found.files);
    expect(unknownFiles(got!.files)).toEqual([]);
  });

  it('keeps a modded copy as it is given: unlike the known copies, but not damaged in keeping', async () => {
    const found = identify(copy((n, d) => (n === 'TILES.16' ? d.map((b) => b ^ 0x55) : d)));
    expect(found.changed).toEqual(['TILES.16']);
    await saveInstalled(found.files);
    const got = await loadInstalled();
    expect(got!.damaged).toEqual([]);
    expect(got!.files.get('TILES.16')[0]).toBe(found.files.get('TILES.16')[0]);
    expect(unknownFiles(got!.files)).toEqual(['TILES.16']);
  });

  it('keeps the copy before it when the one given is refused or its keeping fails', async () => {
    const good = identify(copy());
    await saveInstalled(good.files);
    // Refused: wrong DATA.OVL, so the installer never gets as far as saving it.
    const bad = identify(copy((n, d) => (n === 'DATA.OVL' ? d.subarray(1) : d)));
    expect(complete(bad)).toBe(false);
    // Failed: the browser aborts the write.
    idb.abortNextWrite = new Error('disk full');
    await expect(saveInstalled(identify(copy((n, d) => (n === 'KARMA.DAT' ? d.map((b) => b ^ 1) : d))).files)).rejects.toThrow('disk full');
    const got = await loadInstalled();
    same(got!.files, good.files);
    expect(got!.damaged).toEqual([]);
    expect(unknownFiles(got!.files)).toEqual([]);
  });
});
