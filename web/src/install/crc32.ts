/**
 * crc32.ts
 *
 * CRC-32 (the zip format's, polynomial 0xedb88320): the check each zip
 * entry carries, and the fingerprint of a game file (gameFiles.ts). Its
 * own, not the browser's digest, which a page served over plain http - a
 * phone on the local network - is not given.
 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
