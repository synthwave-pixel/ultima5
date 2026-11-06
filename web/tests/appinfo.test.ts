// web/tests/appinfo.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appEntry, isMacPatched, macPatch, readAppinfo, writeAppinfo, type KvNode } from '../../desktop/appinfo.cjs';

const MAP = 0;
const STR = 1;
const INT32 = 2;
const ULTIMA = 3067520;
const OTHER = 22320;
const LAUNCHER = 'Ultima V SP.app';

const str = (key: string, value: string): KvNode => [STR, key, value];
const map = (key: string, value: KvNode[]): KvNode => [MAP, key, value];

/** Ultima V's entry as Steam has it: one DOSBox launch with no OS of its own, and two save rules for Windows. */
function ultimaKv(): KvNode[] {
  const rule = (pattern: string): KvNode[] => [
    str('root', 'gameinstall'),
    str('path', ''),
    str('pattern', pattern),
    map('platforms', [str('1', 'Windows')]),
    [INT32, 'recursive', 1],
  ];
  return [
    map('appinfo', [
      [INT32, 'appid', ULTIMA],
      map('common', [str('name', 'Ultima V: Warriors of Destiny'), str('oslist', 'windows')]),
      map('config', [
        str('installdir', 'Ultima V'),
        map('launch', [map('0', [str('executable', 'DOSBOX\\Ultima V.exe'), str('workingdir', 'DOSBOX')])]),
      ]),
      map('ufs', [
        str('quota', '10000000000'),
        [INT32, 'maxnumfiles', 10000],
        map('savefiles', [map('0', rule('SAVED.GAM')), map('1', rule('PARTY.SAV'))]),
      ]),
    ]),
  ];
}

function otherKv(): KvNode[] {
  return [map('appinfo', [[INT32, 'appid', OTHER], map('common', [str('name', 'Other'), str('oslist', 'windows,macos')])])];
}

/** Writes a KV block the way Steam does; in v29 a key is an index into the string table. */
function encode(kv: KvNode[], strings: string[] | null): Buffer {
  const out: number[] = [];
  const key = (k: string): void => {
    if (strings) {
      let i = strings.indexOf(k);
      if (i < 0) i = strings.push(k) - 1;
      out.push(...new Uint8Array(new Uint32Array([i]).buffer));
    } else out.push(...Buffer.from(`${k}\0`));
  };
  const walk = (nodes: KvNode[]): void => {
    for (const [type, k, v] of nodes) {
      out.push(type);
      key(k);
      if (type === MAP) {
        walk(v as KvNode[]);
        out.push(8);
      } else if (type === STR) out.push(...Buffer.from(`${v as string}\0`));
      else out.push(...new Uint8Array(new Int32Array([v as number]).buffer));
    }
  };
  walk(kv);
  out.push(8);
  return Buffer.from(out);
}

function entry(appid: number, kv: KvNode[], strings: string[] | null): Buffer {
  const block = encode(kv, strings);
  const header = Buffer.alloc(60, appid & 0xff);
  createHash('sha1').update(block).digest().copy(header, 40);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(appid, 0);
  size.writeUInt32LE(header.length + block.length, 4);
  return Buffer.concat([size, header, block]);
}

/** A whole appinfo.vdf of the two apps, v29 (keys in a string table at the end) or v28 (keys inline). */
function file(version: 28 | 29): { bytes: Buffer; ultima: Buffer; other: Buffer } {
  const strings: string[] | null = version === 29 ? [] : null;
  const ultima = entry(ULTIMA, ultimaKv(), strings);
  const other = entry(OTHER, otherKv(), strings);
  const head = Buffer.alloc(version === 29 ? 16 : 8);
  head.writeUInt32LE(version === 29 ? 0x07564429 : 0x07564428, 0);
  head.writeUInt32LE(1, 4);
  const body = Buffer.concat([ultima, other, Buffer.alloc(4)]);
  if (!strings) return { bytes: Buffer.concat([head, body]), ultima, other };
  head.writeBigInt64LE(BigInt(head.length + body.length), 8);
  const table = Buffer.concat([Buffer.from(new Uint32Array([strings.length]).buffer), ...strings.map((s) => Buffer.from(`${s}\0`))]);
  return { bytes: Buffer.concat([head, body, table]), ultima, other };
}

const find = (nodes: KvNode[], key: string): KvNode => nodes.find((n) => n[1] === key) as KvNode;
const kids = (nodes: KvNode[], ...path: string[]): KvNode[] => path.reduce((at, k) => find(at, k)[2] as KvNode[], nodes);

describe.each([28, 29] as const)('appinfo v%i', (version) => {
  const { bytes, other } = file(version);
  const original = (): { kv: KvNode[]; header: Buffer } => appEntry(readAppinfo(bytes), ULTIMA)!;

  it('reads an app and reports one that is not in the cache', () => {
    const info = readAppinfo(bytes);
    expect(appEntry(info, 1)).toBeNull();
    expect(appEntry(info, ULTIMA)!.kv).toEqual(ultimaKv());
    expect(appEntry(info, OTHER)!.kv).toEqual(otherKv());
  });

  it('writes an unchanged entry back to the very same bytes', () => {
    const info = readAppinfo(bytes);
    const { header, kv } = appEntry(info, ULTIMA)!;
    expect(writeAppinfo(info, ULTIMA, header, kv).equals(bytes)).toBe(true);
  });

  it('gives Ultima V a Mac launch, and keeps the other app and its place', () => {
    const info = readAppinfo(bytes);
    const { header, kv } = original();
    const patched = macPatch(kv, LAUNCHER);
    expect(patched.changed).toBe(true);
    const out = writeAppinfo(info, ULTIMA, header, patched.kv);

    const again = readAppinfo(out);
    const back = appEntry(again, ULTIMA)!;
    expect(kids(back.kv, 'appinfo', 'common').find((n) => n[1] === 'oslist')![2]).toBe('windows,macos');
    const launch = kids(back.kv, 'appinfo', 'config', 'launch');
    expect(launch).toHaveLength(2);
    expect(kids(launch, '0', 'config')).toEqual([str('oslist', 'windows')]);
    const mine = launch.filter((n) => (n[2] as KvNode[]).some((c) => c[1] === 'executable' && c[2] === LAUNCHER));
    expect(mine).toHaveLength(1);
    expect(mine[0][2]).toEqual([
      str('description', 'Ultima V SP'),
      str('executable', LAUNCHER),
      str('type', 'default'),
      map('config', [str('oslist', 'macos')]),
    ]);
    for (const rule of kids(back.kv, 'appinfo', 'ufs', 'savefiles')) {
      expect(kids(rule[2] as KvNode[], 'platforms')).toEqual([str('1', 'Windows'), str('2', 'MacOS')]);
    }

    // Steam checks the entry against its second SHA-1, the binary SHA-1 in the header (bytes 40-60).
    const block = entryBlock(out, ULTIMA);
    expect(back.header.subarray(40, 60).equals(createHash('sha1').update(block).digest())).toBe(true);
    expect(back.header.subarray(0, 40).equals(header.subarray(0, 40))).toBe(true);

    expect(out.includes(other)).toBe(true);
    expect(appEntry(again, OTHER)!.kv).toEqual(otherKv());
  });

  it('adds a string table entry for a new key without moving the old ones', () => {
    if (version !== 29) return;
    const { header, kv } = original();
    const out = writeAppinfo(readAppinfo(bytes), ULTIMA, header, macPatch(kv, LAUNCHER).kv);
    const table = Number(out.readBigInt64LE(8));
    const oldTable = Number(bytes.readBigInt64LE(8));
    const names = (b: Buffer, at: number): string[] =>
      b
        .subarray(at + 4)
        .toString()
        .split('\0')
        .slice(0, b.readUInt32LE(at));
    const before = names(bytes, oldTable);
    expect(names(out, table).slice(0, before.length)).toEqual(before);
    expect(names(out, table)).toContain('description');
  });

  it('leaves a patched entry alone when patched again', () => {
    const info = readAppinfo(bytes);
    const { header, kv } = original();
    const once = macPatch(kv, LAUNCHER);
    const out = writeAppinfo(info, ULTIMA, header, once.kv);
    const twice = macPatch(appEntry(readAppinfo(out), ULTIMA)!.kv, LAUNCHER);
    expect(twice.changed).toBe(false);
    const entryAgain = appEntry(readAppinfo(out), ULTIMA)!;
    expect(writeAppinfo(readAppinfo(out), ULTIMA, entryAgain.header, twice.kv).equals(out)).toBe(true);
  });

  it('says whether the Mac edit is in', () => {
    const { kv } = original();
    expect(isMacPatched(kv, LAUNCHER)).toBe(false);
    expect(isMacPatched(macPatch(kv, LAUNCHER).kv, LAUNCHER)).toBe(true);
    expect(isMacPatched(macPatch(kv, LAUNCHER).kv, 'Other.app')).toBe(false);
  });

  it('does not change the entry it is given', () => {
    const { kv } = original();
    macPatch(kv, LAUNCHER);
    expect(kv).toEqual(ultimaKv());
  });
});

/** The KV block of one app's entry in a file: what follows the 8-byte entry head and the 60-byte header. */
function entryBlock(bytes: Buffer, appid: number): Buffer {
  const v29 = bytes.readUInt32LE(0) === 0x07564429;
  let pos = v29 ? 16 : 8;
  for (;;) {
    const id = bytes.readUInt32LE(pos);
    const size = bytes.readUInt32LE(pos + 4);
    if (id === appid) return bytes.subarray(pos + 68, pos + 8 + size);
    pos += 8 + size;
  }
}

describe('appinfo rejects what it cannot read', () => {
  it('a file that is not an app cache', () => {
    expect(() => readAppinfo(Buffer.from('not a cache at all'))).toThrow(/appinfo/);
  });
});
