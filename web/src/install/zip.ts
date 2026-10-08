/**
 * zip.ts
 *
 * Reads the files out of a .zip (the Internet Archive's copies of the game
 * come zipped): the central directory, then each entry stored or deflated.
 * Deflate uses the platform's DecompressionStream; nothing is bundled.
 * Each entry's CRC-32 is checked, so a damaged download is told of.
 */

import { u16, u32 } from '../data/files.ts';
import { crc32 } from './crc32.ts';

export interface ZipEntry {
  path: string;
  data: Uint8Array;
  /** What came out is not what went in: the archive's own check failed, or it would not inflate. */
  damaged?: boolean;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every file entry in the archive (directories skipped). */
export async function readZip(zip: Uint8Array): Promise<ZipEntry[]> {
  // The end-of-central-directory record, searched for from the end (it may be followed by a comment).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(zip, p) !== 0x02014b50) throw new Error('Damaged zip directory');
    const method = u16(zip, p + 10);
    const crc = u32(zip, p + 16);
    const compressed = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const local = u32(zip, p + 42);
    const path = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    const raw = zip.subarray(start, start + compressed);
    let data: Uint8Array | null = null;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw).catch(() => new Uint8Array(0));
    if (data) entries.push({ path, data, damaged: crc32(data) !== crc });
    // Other methods (none in the known copies) are skipped; the file then shows as missing.
  }
  return entries;
}
