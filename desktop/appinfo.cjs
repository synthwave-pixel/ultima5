// Steam's app cache (appcache/appinfo.vdf) read and written, so that Ultima V can be given a Mac launch entry.
// Steam has no macOS launch for the game, and without one Play says "Invalid platform". The cache is a binary file:
// a short head, then each app's entry (app id, size, a 60-byte header, its KeyValues block), then a zero app id. In
// version 29 (magic 0x07564429) a key in a block is an index into a table of strings kept after the entries; in
// version 28 a key is written out in place. Entries we do not edit keep their bytes exactly, and the string table is
// only ever added to, so every other app's indexes stay right. Nothing here touches a file: callers hand in a buffer
// and get one back, and edit the cache only while Steam is not running.
const { createHash } = require('node:crypto');

const V28 = 0x07564428;
const V29 = 0x07564429;

// KeyValues types.
const MAP = 0;
const STR = 1;
const INT32 = 2;
const FLOAT32 = 3;
const PTR = 4;
const WSTR = 5;
const COLOR = 6;
const UINT64 = 7;
const END = 8;
const INT64 = 10;

// An entry's header after its app id and size: state, last updated, token, SHA-1, change number, then the binary
// SHA-1 (header bytes 40 to 60) that is the SHA-1 of the KeyValues block.
const HEADER = 4 + 4 + 8 + 20 + 4 + 20;
const SHA1_AT = 40;

/** Reads the head of the file, the string table (version 29) and where each app's entry lies. */
function readAppinfo(buf) {
  if (buf.length < 8) throw new Error('not an appinfo file: too short');
  const magic = buf.readUInt32LE(0);
  if (magic !== V28 && magic !== V29) throw new Error(`not an appinfo file: unsupported magic 0x${magic.toString(16)}`);
  const universe = buf.readUInt32LE(4);
  let pos = 8;
  let end = buf.length;
  const strings = [];
  if (magic === V29) {
    const table = Number(buf.readBigInt64LE(8));
    if (table < 16 || table + 4 > buf.length) throw new Error('appinfo string table lies outside the file');
    pos = 16;
    end = table;
    const count = buf.readUInt32LE(table);
    let at = table + 4;
    for (let i = 0; i < count; i++) {
      const stop = buf.indexOf(0, at);
      if (stop < 0) throw new Error('appinfo string table is cut short');
      strings.push(buf.toString('utf8', at, stop));
      at = stop + 1;
    }
  }
  const entries = [];
  while (pos + 8 <= end) {
    const appid = buf.readUInt32LE(pos);
    if (appid === 0) break;
    const stop = pos + 8 + buf.readUInt32LE(pos + 4);
    if (stop > end) throw new Error(`appinfo entry for app ${appid} runs past the end of the file`);
    entries.push({ appid, start: pos, stop });
    pos = stop;
  }
  return { magic, universe, data: buf, strings, entries };
}

/** A KeyValues block as a list of [type, key, value] nodes; a map's value is a list of nodes. */
function parseKv(info, from, to) {
  const buf = info.data;
  let p = from;
  const cstr = () => {
    const stop = buf.indexOf(0, p);
    if (stop < 0 || stop >= to) throw new Error('appinfo string is not ended');
    const s = buf.toString('utf8', p, stop);
    p = stop + 1;
    return s;
  };
  const key = () => {
    if (info.magic !== V29) return cstr();
    const s = info.strings[buf.readUInt32LE(p)];
    if (s === undefined) throw new Error('appinfo key is not in the string table');
    p += 4;
    return s;
  };
  const nodes = () => {
    const out = [];
    for (;;) {
      if (p >= to) throw new Error('appinfo block is not ended');
      const type = buf[p++];
      if (type === END) return out;
      const k = key();
      let v;
      if (type === MAP) v = nodes();
      else if (type === STR || type === WSTR) v = cstr();
      else if (type === INT32 || type === COLOR || type === PTR) {
        v = buf.readInt32LE(p);
        p += 4;
      } else if (type === FLOAT32) {
        v = buf.readFloatLE(p);
        p += 4;
      } else if (type === UINT64) {
        v = buf.readBigUInt64LE(p);
        p += 8;
      } else if (type === INT64) {
        v = buf.readBigInt64LE(p);
        p += 8;
      } else throw new Error(`unknown KeyValues type ${type} at ${p - 1}`);
      out.push([type, k, v]);
    }
  };
  const kv = nodes();
  if (p !== to) throw new Error(`appinfo block for the app ends at ${p}, its entry at ${to}`);
  return kv;
}

/** One app's header and KeyValues, or null when the cache does not have it. */
function appEntry(info, appid) {
  const found = info.entries.find((e) => e.appid === appid);
  if (!found) return null;
  const header = Buffer.from(info.data.subarray(found.start + 8, found.start + 8 + HEADER));
  return { header, kv: parseKv(info, found.start + 8 + HEADER, found.stop) };
}

/** Writes KeyValues as a block. A new key in version 29 is added to the end of `strings`. */
function encodeKv(kv, magic, strings) {
  const index = new Map(strings.map((s, i) => [s, i]));
  const parts = [];
  const key = (k) => {
    if (magic !== V29) return parts.push(Buffer.from(`${k}\0`));
    let i = index.get(k);
    if (i === undefined) {
      i = strings.push(k) - 1;
      index.set(k, i);
    }
    const b = Buffer.alloc(4);
    b.writeUInt32LE(i);
    parts.push(b);
  };
  const num = (size, write) => {
    const b = Buffer.alloc(size);
    write(b);
    parts.push(b);
  };
  const walk = (nodes) => {
    for (const [type, k, v] of nodes) {
      parts.push(Buffer.from([type]));
      key(k);
      if (type === MAP) {
        walk(v);
        parts.push(Buffer.from([END]));
      } else if (type === STR || type === WSTR) parts.push(Buffer.from(`${v}\0`));
      else if (type === INT32 || type === COLOR || type === PTR) num(4, (b) => b.writeInt32LE(v));
      else if (type === FLOAT32) num(4, (b) => b.writeFloatLE(v));
      else if (type === UINT64) num(8, (b) => b.writeBigUInt64LE(v));
      else if (type === INT64) num(8, (b) => b.writeBigInt64LE(v));
      else throw new Error(`unknown KeyValues type ${type}`);
    }
  };
  walk(kv);
  parts.push(Buffer.from([END]));
  return Buffer.concat(parts);
}

/**
 * The whole file with one app's entry replaced by `header` and `kv`. The header's binary SHA-1 is made the SHA-1 of
 * the new block, as Steam checks it. Every other entry is copied as it was, and `info` itself is left as it was.
 */
function writeAppinfo(info, appid, header, kv) {
  if (!info.entries.some((e) => e.appid === appid)) throw new Error(`app ${appid} is not in the cache`);
  const strings = [...info.strings];
  const block = encodeKv(kv, info.magic, strings);
  const newHeader = Buffer.from(header);
  createHash('sha1').update(block).digest().copy(newHeader, SHA1_AT);
  const payload = Buffer.concat([newHeader, block]);
  const body = [];
  for (const e of info.entries) {
    if (e.appid === appid) {
      const head = Buffer.alloc(8);
      head.writeUInt32LE(appid, 0);
      head.writeUInt32LE(payload.length, 4);
      body.push(head, payload);
    } else body.push(info.data.subarray(e.start, e.stop));
  }
  body.push(Buffer.alloc(4));
  const entries = Buffer.concat(body);
  const head = Buffer.alloc(info.magic === V29 ? 16 : 8);
  head.writeUInt32LE(info.magic, 0);
  head.writeUInt32LE(info.universe, 4);
  if (info.magic !== V29) return Buffer.concat([head, entries]);
  head.writeBigInt64LE(BigInt(head.length + entries.length), 8);
  const table = Buffer.concat([
    Buffer.from(new Uint32Array([strings.length]).buffer),
    ...strings.map((s) => Buffer.from(`${s}\0`)),
  ]);
  return Buffer.concat([head, entries, table]);
}

const find = (nodes, name) => nodes.find((n) => n[1].toLowerCase() === name.toLowerCase());
const str = (key, value) => [STR, key, value];
const map = (key, value) => [MAP, key, value];

/** The map at appinfo/<path>, which Ultima V's entry must have; anything else is not an entry we know how to edit. */
function mapAt(kv, ...path) {
  let nodes = kv;
  for (const name of path) {
    const node = find(nodes, name);
    if (!node || node[0] !== MAP) throw new Error(`the app's entry has no ${path.join('/')}`);
    nodes = node[2];
  }
  return nodes;
}

const nextKey = (nodes) => String(nodes.reduce((top, n) => (/^\d+$/.test(n[1]) ? Math.max(top, Number(n[1]) + 1) : top), 0));

/**
 * Ultima V's entry given a Mac launch, on a copy (the entry given is left as it was). What it changes:
 *   - macos is added to common/oslist;
 *   - a launch entry with no config of its own is Windows' alone (DOSBox), so it gets the config oslist windows;
 *   - our launcher is added as the macOS launch entry, unless an entry running it is there already;
 *   - MacOS is added to the platforms of each cloud save rule.
 * `changed` is false when there was nothing to do, which is how doing it twice stays harmless.
 */
function macPatch(kv, launcherName) {
  const out = structuredClone(kv);
  let changed = false;

  const common = mapAt(out, 'appinfo', 'common');
  const oslist = find(common, 'oslist');
  if (oslist) {
    const systems = String(oslist[2]).split(',');
    if (!systems.some((s) => s.trim().toLowerCase() === 'macos')) {
      oslist[2] = [...systems, 'macos'].join(',');
      changed = true;
    }
  } else {
    common.push(str('oslist', 'macos'));
    changed = true;
  }

  const launch = mapAt(out, 'appinfo', 'config', 'launch');
  for (const entry of launch) {
    if (entry[0] === MAP && !find(entry[2], 'config')) {
      entry[2].push(map('config', [str('oslist', 'windows')]));
      changed = true;
    }
  }
  const ours = launch.some((n) => n[0] === MAP && find(n[2], 'executable')?.[2] === launcherName);
  if (!ours) {
    launch.push(
      map(nextKey(launch), [
        str('description', 'Ultima V SP'),
        str('executable', launcherName),
        str('type', 'default'),
        map('config', [str('oslist', 'macos')]),
      ]),
    );
    changed = true;
  }

  for (const rule of mapAt(out, 'appinfo', 'ufs', 'savefiles')) {
    const platforms = rule[0] === MAP ? find(rule[2], 'platforms') : undefined;
    if (platforms && !platforms[2].some((p) => p[2] === 'MacOS')) {
      platforms[2].push(str(nextKey(platforms[2]), 'MacOS'));
      changed = true;
    }
  }
  return { kv: out, changed };
}

/** Whether the entry already has everything macPatch would add. */
function isMacPatched(kv, launcherName) {
  return !macPatch(kv, launcherName).changed;
}

module.exports = { readAppinfo, appEntry, writeAppinfo, macPatch, isMacPatched };
