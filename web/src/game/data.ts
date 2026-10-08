/**
 * data.ts
 *
 * Everything the engine reads from the player's game besides the maps:
 * DATA.OVL's tables and strings, addressed as u5d names them (D_xxxx is
 * data-segment address 0xxxxx). The game's text is printed straight from
 * DATA.OVL, so none of it lives in the engine; each use cites the string
 * in a comment.
 */

import { DataOvl } from '../data/dataOvl.ts';
import { GameFiles } from '../data/files.ts';
import { readLocations, type Location } from '../data/maps.ts';

export class GameData {
  readonly ovl: DataOvl;
  readonly locations: Location[];
  private readonly strings = new Map<number, string>();

  constructor(readonly files: GameFiles) {
    this.ovl = new DataOvl(files.get('DATA.OVL'));
    this.locations = readLocations(this.ovl);
  }

  /** The string at a data-segment address (u5d `_TEXT(addr, "...")`). */
  t(address: number): string {
    let s = this.strings.get(address);
    if (s === undefined) {
      s = this.ovl.string(address);
      this.strings.set(address, s);
    }
    return s;
  }

  /** Strings through a table of pointers. */
  table(address: number, count: number): string[] {
    return this.ovl.strings(address, count);
  }

  bytes(address: number, count: number): Uint8Array {
    return this.ovl.bytes(address, count);
  }

  /** Signed bytes. */
  sbytes(address: number, count: number): Int8Array {
    return new Int8Array(this.ovl.bytes(address, count).buffer);
  }

  words(address: number, count: number): number[] {
    return this.ovl.words(address, count);
  }

  swords(address: number, count: number): number[] {
    return this.ovl.words(address, count).map((w) => (w << 16) >> 16);
  }

  // --- Tables used throughout, by u5d name ---------------------------------

  /** D_54d4: one bit per map tile, set where walking is blocked. */
  readonly blocked = (): Uint8Array => this.cached('blocked', () => this.bytes(0x54d4, 32));
  /** D_54f4: how each group of four actor tiles moves (walkability kind). */
  readonly moveKind = (): Uint8Array => this.cached('moveKind', () => this.bytes(0x54f4, 64));
  /** D_5534: which shore tiles a skiff may enter from each direction. */
  readonly skiffShore = (): Uint8Array => this.cached('skiffShore', () => this.bytes(0x5534, 16));
  /** D_5544: the same for the four tiles from 0x34. */
  readonly skiffBridge = (): Uint8Array => this.cached('skiffBridge', () => this.bytes(0x5544, 4));
  /** D_6a86: the 19 tiles that block sight. */
  readonly opaque = (): Uint8Array => this.cached('opaque', () => this.bytes(0x6a86, 0x13));
  /** D_6a9a: the 10 tiles that give light. */
  readonly lightSources = (): Uint8Array => this.cached('lightSources', () => this.bytes(0x6a9a, 10));
  /** D_6aa8: distance from the viewport's centre, 6 by 6 (a quadrant). */
  readonly distance = (): Uint8Array => this.cached('distance', () => this.bytes(0x6aa8, 0x24));
  /** D_6a80: light at dawn and dusk by ten-minute step. */
  readonly twilight = (): Uint8Array => this.cached('twilight', () => this.bytes(0x6a80, 6));
  /** D_1eda: the moons' phases by day of the month, as digits '0'-'7'. */
  readonly moonPhases = (): Uint8Array => this.cached('moonPhases', () => this.bytes(0x1eda, 56));
  /** D_1b18: actor animation scripts (16 bytes each), with the script number per actor tile group at +0xb0. */
  readonly animScripts = (): Uint8Array => this.cached('animScripts', () => this.bytes(0x1b18, 0xe3));

  private readonly cache = new Map<string, Uint8Array>();
  private cached(key: string, make: () => Uint8Array): Uint8Array {
    let v = this.cache.get(key);
    if (!v) {
      v = make();
      this.cache.set(key, v);
    }
    return v;
  }
}
