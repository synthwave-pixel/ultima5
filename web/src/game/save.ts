/**
 * save.ts
 *
 * The game's state as the DOS game kept it: the 0x1060-byte block it
 * wrote to SAVED.GAM (data segment 0x55a6-0x6606, u5d vars.h), and the
 * actor lists of Britannia and the Underworld it kept in BRIT.OOL and
 * UNDER.OOL. A new game is INIT.GAM and INIT.OOL.
 *
 * Fields are named after what u5d knows of them; those it does not are
 * named after their data-segment address (`d5882` is D_5882). Offsets in
 * the comments are into the block (address - 0x55a6).
 */

export const SAVE_SIZE = 0x1060;
const BASE = 0x55a6;
/** Block offset of a data-segment address from u5d. */
export const at = (address: number): number => address - BASE;

export const MEMBER_SIZE = 32;
export const MAX_MEMBERS = 16;

/** A member's status letter (D_55a8_party[].status). */
export const Status = { Good: 0x47, Poisoned: 0x50, Sleeping: 0x53, Dead: 0x44 } as const;

/**
 * The level a member's experience has earned (OUTSUBS_0658, the camp's apparition, which grants it): level 2 at 100
 * experience, and one more each time it doubles. Ahead of the member's own level, a level is due.
 */
export function earnedLevel(exp: number): number {
  let level = 1;
  for (let e = Math.trunc(exp / 100); e > 0; e >>= 1) level++;
  return level;
}

/** One party record (S_55a8, 32 bytes). */
export class Member {
  constructor(readonly b: Uint8Array) {}
  get name(): string {
    let s = '';
    for (let i = 0; i < 9 && this.b[i] !== 0; i++) s += String.fromCharCode(this.b[i]);
    return s;
  }
  set name(v: string) {
    for (let i = 0; i < 9; i++) this.b[i] = i < v.length && i < 8 ? v.charCodeAt(i) : 0;
  }
  /** 0x0b male, 0x0c female. */
  get gender(): number {
    return this.b[9];
  }
  set gender(v: number) {
    this.b[9] = v;
  }
  /** 'A'vatar, 'F'ighter, 'B'ard, 'M'age. */
  get cls(): number {
    return this.b[10];
  }
  set cls(v: number) {
    this.b[10] = v;
  }
  get status(): number {
    return this.b[11];
  }
  set status(v: number) {
    this.b[11] = v;
  }
  get str(): number {
    return this.b[12];
  }
  set str(v: number) {
    this.b[12] = v;
  }
  get dex(): number {
    return this.b[13];
  }
  set dex(v: number) {
    this.b[13] = v;
  }
  get int(): number {
    return this.b[14];
  }
  set int(v: number) {
    this.b[14] = v;
  }
  get mp(): number {
    return this.b[15];
  }
  set mp(v: number) {
    this.b[15] = v;
  }
  get hp(): number {
    return s16(this.b, 0x10);
  }
  set hp(v: number) {
    w16(this.b, 0x10, v);
  }
  get maxHp(): number {
    return s16(this.b, 0x12);
  }
  set maxHp(v: number) {
    w16(this.b, 0x12, v);
  }
  get exp(): number {
    return s16(this.b, 0x14);
  }
  set exp(v: number) {
    w16(this.b, 0x14, v);
  }
  get level(): number {
    return this.b[0x16];
  }
  set level(v: number) {
    this.b[0x16] = v;
  }
  /** Offset 0x17, unknown. */
  get x17(): number {
    return this.b[0x17];
  }
  set x17(v: number) {
    this.b[0x17] = v;
  }
  /** Offset 0x18: months in the inn when not in the party. */
  get x18(): number {
    return this.b[0x18];
  }
  set x18(v: number) {
    this.b[0x18] = v;
  }
  /** Worn and readied items: helm, armour, weapon (two hands), ring, amulet; 0xff for none. */
  get equips(): Uint8Array {
    return this.b.subarray(0x19, 0x1f);
  }
  /** Where a member not in the party waits (a settlement's map id), or 0. */
  get mapId(): number {
    return this.b[0x1f];
  }
  set mapId(v: number) {
    this.b[0x1f] = v;
  }
}

/** An actor ("object", ActorFmt, 8 bytes): anything drawn over the map. */
export class Actor {
  constructor(readonly b: Uint8Array) {}
  /** The base tile, 0 for none. */
  get tile(): number {
    return this.b[0];
  }
  set tile(v: number) {
    this.b[0] = v;
  }
  /** The tile drawn now (the animation frame). */
  get anim(): number {
    return this.b[1];
  }
  set anim(v: number) {
    this.b[1] = v;
  }
  get x(): number {
    return this.b[2];
  }
  set x(v: number) {
    this.b[2] = v;
  }
  get y(): number {
    return this.b[3];
  }
  set y(v: number) {
    this.b[3] = v;
  }
  get z(): number {
    return this.b[4];
  }
  set z(v: number) {
    this.b[4] = v;
  }
  /** Byte 5: a ship's hull; other uses by kind. */
  get b5(): number {
    return this.b[5];
  }
  set b5(v: number) {
    this.b[5] = v;
  }
  /** Byte 6: the animation script's position (high nibble) and delay (low nibble). */
  get b6(): number {
    return this.b[6];
  }
  set b6(v: number) {
    this.b[6] = v;
  }
  /** Byte 7: a ship's skiffs; other uses by kind. */
  get b7(): number {
    return this.b[7];
  }
  set b7(v: number) {
    this.b[7] = v;
  }
  clear(): void {
    this.b.fill(0);
  }
}

/** An NPC's schedule (NpcScheduleFmt, 16 bytes): three places and four times. */
export class Schedule {
  constructor(readonly b: Uint8Array) {}
  type(i: number): number {
    return this.b[i];
  }
  x(i: number): number {
    return this.b[3 + i];
  }
  y(i: number): number {
    return this.b[6 + i];
  }
  /** The level as stored (compare with the party's level byte). */
  z(i: number): number {
    return this.b[9 + i];
  }
  /** The level as a signed byte (-1 is a basement). */
  zs(i: number): number {
    return (this.b[9 + i] << 24) >> 24;
  }
  setType(i: number, v: number): void {
    this.b[i] = v;
  }
  setPlace(i: number, x: number, y: number, z: number): void {
    this.b[3 + i] = x;
    this.b[6 + i] = y;
    this.b[9 + i] = z & 0xff;
  }
  setTime(i: number, v: number): void {
    this.b[12 + i] = v;
  }
  time(i: number): number {
    return this.b[12 + i];
  }
}

/** An NPC's state in the current settlement (NpcFmt, 16 bytes of u16 fields). */
export class NpcState {
  constructor(readonly b: Uint8Array) {}
  private get16(o: number): number {
    return this.b[o] | (this.b[o + 1] << 8);
  }
  private set16(o: number, v: number): void {
    this.b[o] = v & 0xff;
    this.b[o + 1] = (v >> 8) & 0xff;
  }
  get f0(): number {
    return this.get16(0);
  }
  set f0(v: number) {
    this.set16(0, v);
  }
  /** Destination (signed). */
  get x(): number {
    return (this.get16(2) << 16) >> 16;
  }
  set x(v: number) {
    this.set16(2, v);
  }
  get y(): number {
    return (this.get16(4) << 16) >> 16;
  }
  set y(v: number) {
    this.set16(4, v);
  }
  get z(): number {
    return this.get16(6);
  }
  set z(v: number) {
    this.set16(6, v);
  }
  get f8(): number {
    return this.get16(8);
  }
  set f8(v: number) {
    this.set16(8, v);
  }
  /** Talk/behaviour state (0xfe/0xfd set by the town's air of...). */
  get fa(): number {
    return this.get16(0xa);
  }
  set fa(v: number) {
    this.set16(0xa, v);
  }
  /** The NPC's actor index. */
  get actor(): number {
    return this.get16(0xc);
  }
  set actor(v: number) {
    this.set16(0xc, v);
  }
  get fe(): number {
    return this.get16(0xe);
  }
  set fe(v: number) {
    this.set16(0xe, v);
  }
}

function s16(b: Uint8Array, o: number): number {
  return ((b[o] | (b[o + 1] << 8)) << 16) >> 16;
}
function w16(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
}

type Kind = 'u8' | 's8' | 'u16' | 's16';
/** Scalar fields: name, data-segment address, kind. */
const FIELDS: [string, number, Kind][] = [
  ['d55a6', 0x55a6, 'u16'],
  ['food', 0x57a8, 's16'],
  ['gold', 0x57aa, 's16'],
  ['keys', 0x57ac, 'u8'],
  ['gems', 0x57ad, 'u8'],
  ['torches', 0x57ae, 'u8'],
  ['grapple', 0x57af, 'u8'],
  ['carpets', 0x57b0, 'u8'],
  ['skullKeys', 0x57b1, 'u8'],
  ['skullKeyDay', 0x57b2, 'u8'],
  ['amulet', 0x57b3, 'u8'],
  ['crown', 0x57b4, 'u8'],
  ['sceptre', 0x57b5, 'u8'],
  ['spyglasses', 0x57ba, 'u8'],
  ['hmsCapePlans', 0x57bb, 'u8'],
  ['sextants', 0x57bc, 'u8'],
  ['pocketWatch', 0x57bd, 'u8'],
  ['blackBadge', 0x57be, 'u8'],
  ['sandalwoodBox', 0x57bf, 'u8'],
  ['partySize', 0x585b, 'u8'],
  ['year', 0x5874, 'u16'],
  ['dx', 0x5876, 's16'],
  ['dy', 0x5878, 's16'],
  ['icon', 0x587a, 'u8'],
  ['activeMember', 0x587b, 'u8'],
  ['partyTile', 0x587c, 'u8'],
  ['month', 0x587d, 'u8'],
  ['day', 0x587e, 'u8'],
  ['hour', 0x587f, 'u8'],
  ['lastHour', 0x5880, 'u8'],
  ['minute', 0x5881, 'u8'],
  ['d5882', 0x5882, 'u8'],
  ['sailTurns', 0x5883, 'u8'],
  ['d5884', 0x5884, 'u8'],
  ['trammel', 0x5885, 'u8'],
  ['felucca', 0x5886, 'u8'],
  ['moongateHeight', 0x5887, 'u8'],
  ['karma', 0x5888, 'u8'],
  ['d5889', 0x5889, 'u8'],
  ['d588a', 0x588a, 'u8'],
  ['turn', 0x588b, 'u8'],
  ['d588c', 0x588c, 'u8'],
  ['d588d', 0x588d, 'u8'],
  ['protection', 0x588e, 'u8'],
  ['d588f', 0x588f, 'u8'],
  ['d5890', 0x5890, 'u8'],
  ['animate', 0x5891, 'u8'],
  ['wind', 0x5892, 'u8'],
  ['mapId', 0x5893, 'u8'],
  ['savedMapId', 0x5894, 'u8'],
  ['level', 0x5895, 'u8'],
  ['x', 0x5896, 'u8'],
  ['y', 0x5897, 'u8'],
  ['crosshair', 0x5898, 'u8'],
  ['crossX', 0x5899, 'u8'],
  ['crossY', 0x589a, 'u8'],
  ['chunkX', 0x589b, 'u8'],
  ['chunkY', 0x589c, 'u8'],
  ['weapon', 0x589d, 'u8'],
  ['combatTurn', 0x589e, 'u8'],
  ['blink', 0x589f, 'u8'],
  ['exitDir', 0x58a0, 'u8'],
  ['combatFlags', 0x58a1, 'u8'],
  ['d58a2', 0x58a2, 'u8'],
  ['battleWon', 0x58a3, 'u8'],
  ['drawMap', 0x58a4, 'u8'],
  ['light', 0x58a5, 'u8'],
  ['d58a6', 0x58a6, 'u8'],
  ['d58a7', 0x58a7, 'u8'],
  ['d58cb', 0x58cb, 'u8'],
  ['questActive', 0x58cc, 'u16'],
  ['questDone', 0x58ce, 'u16'],
  ['doorCount', 0x594e, 'u8'],
  ['openDoor', 0x594f, 'u8'],
  ['doorX', 0x5950, 'u8'],
  ['doorY', 0x5951, 'u8'],
  ['doorTurns', 0x5952, 'u8'],
  ['shipX', 0x5953, 'u8'],
  ['shipY', 0x5954, 'u8'],
  ['sailing', 0x5955, 'u8'],
  ['newline', 0x5956, 'u8'],
  ['drunk', 0x5957, 'u8'],
  ['townAir', 0x5958, 'u8'],
  ['d5959', 0x5959, 'u8'],
  ['d5d5a', 0x5d5a, 'u16'],
  ['d5d5c', 0x5d5c, 'u16'],
  ['d65be', 0x65be, 'u8'],
  ['d65bf', 0x65bf, 'u8'],
  ['d65c0', 0x65c0, 'u16'],
  ['d6602', 0x6602, 'u8'],
  ['facing', 0x6603, 'u8'],
  ['dungeonLook', 0x6604, 'u8'],
  ['boughtShip', 0x6605, 'u8'],
];

/** The block's byte arrays: name, address, length. */
const ARRAYS: [string, number, number][] = [
  ['shards', 0x57b6, 4],
  ['equipment', 0x57c0, 0x30],
  ['mixtures', 0x57f0, 0x30],
  ['scrolls', 0x5820, 8],
  ['potions', 0x5828, 8],
  ['moonstoneX', 0x5830, 8],
  ['moonstoneY', 0x5838, 8],
  ['moonstoneHeld', 0x5840, 8],
  ['moonstoneZ', 0x5848, 8],
  ['reagents', 0x5850, 8],
  ['harvestDays', 0x5858, 3],
  ['d585c', 0x585c, 0x18],
  ['d58a8', 0x58a8, 0x20],
  ['shadowlords', 0x58c8, 3],
  ['d58d0', 0x58d0, 8],
  ['d58d8', 0x58d8, 8],
  ['d58e0', 0x58e0, 0xe],
  ['doorXs', 0x58ee, 0x20],
  ['doorYs', 0x590e, 0x20],
  ['doorTiles', 0x592e, 0x20],
  ['dungeon', 0x595a, 0x200],
  ['npcKilled', 0x5b5a, 0x80],
  ['npcMet', 0x5bda, 0x80],
  ['npcTypes', 0x659e, 0x20],
];

/** SAVED.GAM, with a named property for every field above. */
export class Save {
  // The fields' accessors are defined on the prototype below, from FIELDS and ARRAYS.
  declare d55a6: number;
  declare food: number;
  declare gold: number;
  declare keys: number;
  declare gems: number;
  declare torches: number;
  declare grapple: number;
  declare carpets: number;
  declare skullKeys: number;
  declare skullKeyDay: number;
  declare amulet: number;
  declare crown: number;
  declare sceptre: number;
  declare spyglasses: number;
  declare hmsCapePlans: number;
  declare sextants: number;
  declare pocketWatch: number;
  declare blackBadge: number;
  declare sandalwoodBox: number;
  declare partySize: number;
  declare year: number;
  declare dx: number;
  declare dy: number;
  declare icon: number;
  declare activeMember: number;
  declare partyTile: number;
  declare month: number;
  declare day: number;
  declare hour: number;
  declare lastHour: number;
  declare minute: number;
  declare d5882: number;
  declare sailTurns: number;
  declare d5884: number;
  declare trammel: number;
  declare felucca: number;
  declare moongateHeight: number;
  declare karma: number;
  declare d5889: number;
  declare d588a: number;
  declare turn: number;
  declare d588c: number;
  declare d588d: number;
  declare protection: number;
  declare d588f: number;
  declare d5890: number;
  declare animate: number;
  declare wind: number;
  declare mapId: number;
  declare savedMapId: number;
  declare level: number;
  declare x: number;
  declare y: number;
  declare crosshair: number;
  declare crossX: number;
  declare crossY: number;
  declare chunkX: number;
  declare chunkY: number;
  declare weapon: number;
  declare combatTurn: number;
  declare blink: number;
  declare exitDir: number;
  declare combatFlags: number;
  declare d58a2: number;
  declare battleWon: number;
  declare drawMap: number;
  declare light: number;
  declare d58a6: number;
  declare d58a7: number;
  declare d58cb: number;
  declare questActive: number;
  declare questDone: number;
  declare doorCount: number;
  declare openDoor: number;
  declare doorX: number;
  declare doorY: number;
  declare doorTurns: number;
  declare shipX: number;
  declare shipY: number;
  declare sailing: number;
  declare newline: number;
  declare drunk: number;
  declare townAir: number;
  declare d5959: number;
  declare d5d5a: number;
  declare d5d5c: number;
  declare d65be: number;
  declare d65bf: number;
  declare d65c0: number;
  declare d6602: number;
  declare facing: number;
  declare dungeonLook: number;
  declare boughtShip: number;
  declare shards: Uint8Array;
  declare equipment: Uint8Array;
  declare mixtures: Uint8Array;
  declare scrolls: Uint8Array;
  declare potions: Uint8Array;
  declare moonstoneX: Uint8Array;
  declare moonstoneY: Uint8Array;
  declare moonstoneHeld: Uint8Array;
  declare moonstoneZ: Uint8Array;
  declare reagents: Uint8Array;
  declare harvestDays: Uint8Array;
  declare d585c: Uint8Array;
  declare d58a8: Uint8Array;
  declare shadowlords: Uint8Array;
  declare d58d0: Uint8Array;
  declare d58d8: Uint8Array;
  declare d58e0: Uint8Array;
  declare doorXs: Uint8Array;
  declare doorYs: Uint8Array;
  declare doorTiles: Uint8Array;
  declare dungeon: Uint8Array;
  declare npcKilled: Uint8Array;
  declare npcMet: Uint8Array;
  declare npcTypes: Uint8Array;

  readonly b: Uint8Array;
  readonly members: Member[];
  readonly actors: Actor[];
  readonly schedules: Schedule[];
  readonly npcs: NpcState[];
  /** D_615e: each NPC's 32-byte movement list. */
  readonly moves: Uint8Array[];

  constructor(bytes?: Uint8Array) {
    this.b = new Uint8Array(SAVE_SIZE);
    if (bytes) this.b.set(bytes.subarray(0, SAVE_SIZE));
    const sub = (addr: number, len: number) => this.b.subarray(at(addr), at(addr) + len);
    this.members = Array.from({ length: MAX_MEMBERS }, (_, i) => new Member(sub(0x55a8 + i * MEMBER_SIZE, MEMBER_SIZE)));
    this.actors = Array.from({ length: 32 }, (_, i) => new Actor(sub(0x5c5a + i * 8, 8)));
    this.schedules = Array.from({ length: 32 }, (_, i) => new Schedule(sub(0x5d5e + i * 16, 16)));
    this.npcs = Array.from({ length: 32 }, (_, i) => new NpcState(sub(0x5f5e + i * 16, 16)));
    this.moves = Array.from({ length: 32 }, (_, i) => sub(0x615e + i * 32, 32));
    for (const [name, addr, len] of ARRAYS) Object.defineProperty(this, name, { value: sub(addr, len), enumerable: true });
  }

  /** D_655e: each NPC's position in its movement list (signed words). */
  movePtr(i: number): number {
    return s16(this.b, at(0x655e) + i * 2);
  }
  setMovePtr(i: number, v: number): void {
    w16(this.b, at(0x655e) + i * 2, v);
  }
  /** D_65c2: signed words, one per NPC. */
  d65c2(i: number): number {
    return s16(this.b, at(0x65c2) + i * 2);
  }
  setD65c2(i: number, v: number): void {
    w16(this.b, at(0x65c2) + i * 2, v);
  }
}

for (const [name, addr, kind] of FIELDS) {
  const o = at(addr);
  Object.defineProperty(Save.prototype, name, {
    get(this: Save): number {
      const b = this.b;
      switch (kind) {
        case 'u8':
          return b[o];
        case 's8':
          return (b[o] << 24) >> 24;
        case 'u16':
          return b[o] | (b[o + 1] << 8);
        case 's16':
          return s16(b, o);
      }
    },
    set(this: Save, v: number) {
      if (kind === 'u8' || kind === 's8') this.b[o] = v & 0xff;
      else w16(this.b, o, v);
    },
  });
}
