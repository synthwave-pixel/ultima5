/**
 * dungeon.ts
 *
 * Dungeons (u5d dungeon.c, dnglook.c, and the dungeon parts of sjog.c
 * and 3000.c): the first-person view drawn from the DNGn.16 wall
 * pictures, ITEMS.16 and the MONn.16 creatures; moving and turning;
 * traps, fields and fountains; the wandering creature (actor 1, its
 * last square in actor 2) and the corridor fight when it reaches the
 * party; rooms from DUNGEON.CBT behind the heavy doors; Look, Search,
 * View, Klimb, Attack and camping below ground.
 *
 * The level map is the save's `dungeon` (8 levels of 8x8 cells, one
 * byte each: the high nibble the feature, bit 3 a hole in the ceiling,
 * the low bits a trap or a room number). `facing` is D_6603 (0 north,
 * 1 east, 2 south, 3 west), `d6602` how the party last moved (4 up a
 * level, 5 down), `dungeonLook` D_6604 (1 stalactites, 2 caved-in
 * passages, 3 skeletons).
 */

import { loadResource } from '../data/images.ts';
import { combatLoop, newSpawns, placeCombatant, placeParty, specialMap } from './combat.ts';
import { sleepTicks, TICK_MS } from './effects.ts';
import { borderTitle, clearBorderTitle, commandPrompt, drawBottomLine, drawVitals, invertMember, leftArrow, rightArrow } from './frame.ts';
import { byCompass, drawDungeonMap, kindOf, smallView } from './dungeonMap.ts';
import { signAhead, signIndex } from './targets.ts';
import { inTheDark, revealCells } from './fog.ts';
import { Game } from './game.ts';
import { getChar, getCharYN, getCommandKey, queueKeys, upOrDown, whoActs } from './input.ts';
import { K } from './io.ts';
import { musicForMap } from './music.ts';
import { Status } from './save.ts';
import { damageMember, damageParty, endTurn, firstActive, passTime } from './time.ts';
import { Colour } from '../ui/colours.ts';
import { cue } from './cues.ts';
import { animateParty } from './world.ts';

/** GetDungeonMap: a cell's index in the save's dungeon block. */
const cellIndex = (x: number, y: number, level: number): number => level * 0x40 + (y & 7) * 8 + (x & 7);

/** The corridor step each facing makes (D_24d6, D_24de). */
const stepX = (g: Game): ArrayLike<number> => g.data.swords(0x24d6, 4);
const stepY = (g: Game): ArrayLike<number> => g.data.swords(0x24de, 4);

/** State the original keeps in globals while in a dungeon. */
const state = {
  /** D_52c4: lines and points are clipped to the doorway (0x28,0x2a)-(0x98,0xb7). */
  clip: false,
  /** D_a9fb, D_24e7: the footsteps' fading noise. */
  footstep: 0,
  footTick: 0,
  /** D_2f26: the fountain's sparkle frame. */
  sparkle: -1,
  /** The Standard look's view drawn in the dark: only what gives a light of its own is left (drawDungeon). */
  dark: false,
  images: new Map<string, Uint8Array>(),
};

/** A picture file by name (decompressed once). */
function resource(g: Game, name: string): Uint8Array {
  let r = state.images.get(name);
  if (!r) {
    r = loadResource(g.data.files, g.data.ovl, name);
    state.images.set(name, r);
  }
  return r;
}

/** D_25ea: the resource names: ITEMS.16 at 4, DNG1-3.16 at 5-7, MON0-7.16 at 8-15. */
const resourceName = (g: Game, i: number): string => g.data.ovl.strings(0x25ea, 30)[i];
const wallsRes = (g: Game): Uint8Array => resource(g, resourceName(g, 4 + g.s.dungeonLook));
const itemsRes = (g: Game): Uint8Array => resource(g, resourceName(g, 4));
const monsterRes = (g: Game): Uint8Array => resource(g, resourceName(g, g.s.actors[1].tile + 8));

// --- Clipped drawing (ULTIMA_0c64, 0c9c, 0cf2) --------------------------------------------------------

const CLIP = { x1: 0x28, y1: 0x2a, x2: 0x98, y2: 0xb7 };

function pset(g: Game, x: number, y: number): void {
  if (state.clip && (x < CLIP.x1 || x > CLIP.x2 || y < CLIP.y1 || y > CLIP.y2)) return;
  g.draw.plot(x, y);
}

function hline(g: Game, x1: number, y: number, x2: number): void {
  if (state.clip) {
    const hi = Math.max(x1, x2);
    const lo = Math.min(x1, x2);
    if (!(hi >= CLIP.x1 && lo <= CLIP.x2 && hi >= 0 && hi <= 319 && lo <= 319)) return;
  }
  g.draw.line(x1, y, x2, y);
}

function vline(g: Game, x: number, y1: number, y2: number): void {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  if (state.clip && !(CLIP.y1 <= lo && hi <= CLIP.y2 && lo >= 0 && hi < 200)) return;
  g.draw.line(x, lo, x, hi);
}

// --- The first-person view --------------------------------------------------------------------------------

/** DUNGEON_10dc: a cell (the hole bit dropped from open cells). */
function cellAt(g: Game, x: number, y: number): number {
  const c = g.s.dungeon[cellIndex(x, y, g.s.level)];
  return c < 0x90 ? c & 0xf7 : c;
}

/** DUNGEON_134a: wall piece `n` (from DNGn.16) or item `n` (from ITEMS.16, by depth), `mirror` for the right side. */
function piece(g: Game, n: number, ceiling: number, mirror: number): void {
  const fx = g.p.fx;
  if (n < 0x1f) {
    const xs = g.data.swords(0x2e62, 8);
    let x = xs[mirror * 4 + (n & 3)];
    if (mirror !== 0 && ((n & 0xf8) === 8 || (n & 0xfc) === 0x18)) x = 0x60;
    fx.image(wallsRes(g), n, x, 0xe, mirror ? 2 : 0, 'dungeon');
  } else {
    const i = ((n + 1) >> 1) - 0x10;
    const depth = ((n + 1) & 6) >> 1;
    const x = mirror !== 0 ? 0x60 : g.data.swords(0x2e72, 4)[depth];
    const ys = g.data.swords(0x2e7a, 8);
    const y = i < 8 ? (ceiling ? ys[4 + depth] : 0x60) : ys[ceiling * 4 + depth];
    fx.image(itemsRes(g), i, x, y, ceiling | (mirror ? 2 : 0), 'thing');
  }
}

/** DUNGEON_111e: the creature at `depth`, its halves by its animation (D_1744 bits). */
function drawMonster(g: Game, depth: number): void {
  const s = g.s;
  const a = s.actors[1];
  if (s.icon === 0x54) a.b6 = g.data.bytes(0x1744, 8)[a.tile];
  const ceiling = a.b7 === 0xff ? 1 : 0;
  const mirrorMode = a.b6 & 0x90;
  const kind = a.b6 & 0x60;
  let frame = a.b6 & 0xf;
  let left: number;
  let right: number;
  if (s.icon === 0x54) {
    left = right = 1;
  } else {
    left = g.random(0, 100) < 0x32 ? 1 : 0;
    right = g.random(0, 100) < 0x32 ? 1 : 0;
    if (kind === 0x20) {
      left = right = frame = frame === 0 ? 1 : 0;
    } else if (kind === 0x60) {
      frame--;
      if (frame < 0) frame = 3;
      const f = g.data.bytes(0x2e26, 4)[frame];
      left = f >> 1;
      right = f & 1;
    }
  }
  if (mirrorMode !== 0) right = (mirrorMode === 0x90 ? 1 : 0) ^ left;
  const ys = g.data.swords(0x2e32, 8);
  const res = monsterRes(g);
  // 1988's own picture in both looks: the Standard look restyles it as it does the corridor (standardPictures.ts), the
  // maps drawing the creature's figure instead (dungeonMap.ts).
  g.p.fx.image(res, left * 3 + depth - 1, g.data.swords(0x2e2a, 4)[depth], ys[ceiling * 4 + depth], ceiling, 'creature');
  g.p.fx.image(res, right * 3 + depth - 1, 0x60, ys[ceiling * 4 + depth], ceiling | 2, 'creature');
  a.b6 = kind + mirrorMode + frame;
}

/** DUNGEON_127e: an energy field's crackle at `depth`, coloured by kind. */
function field(g: Game, depth: number, kind: number): void {
  const was = state.clip;
  state.clip = false;
  g.draw.pen = [Colour.magenta, Colour.green, Colour.red, Colour.blue][kind] + 8;
  const count = g.data.swords(0x2e52, 4)[depth];
  const lo = g.data.swords(0x2e42, 4)[depth];
  const hi = g.data.swords(0x2e4a, 4)[depth];
  const len = g.data.swords(0x2e5a, 4)[depth];
  for (let i = 0; i < count; i++) {
    const x = g.random(lo, hi - len);
    hline(g, x, g.random(lo, hi), len + x);
  }
  state.clip = was;
}

/** DUNGEON_145c: a stalactite's drip, falling in steps (0 none); the last makes a plink. */
function drip(g: Game, x: number, y: number, step: number, depth: number): number {
  if (step === 5) {
    if (!g.soundOff && !state.dark) void g.sound.sweep(0xc80, 0xdac, 1, -(depth * 8 - 0x14));
    return 0;
  }
  g.draw.pen = step === 4 ? 0xb : Colour.blue;
  hline(g, x - 1, y, x + 1);
  vline(g, x, y - 1, y + 1);
  if (step < 4) {
    g.draw.pen = Colour.blue + 8;
    pset(g, x, y);
  }
  if (step !== 0 || g.random(0, 0x40) < 4) step++;
  return step;
}

/** The sign in wall cell `c` (0xb1 up): its text, and the text column and row 1988 prints it from; null for none. */
function signText(g: Game, c: number): [string, number, number] | null {
  const i = (c & 0xf) === 0 ? -1 : signIndex(g, c & 0xf);
  if (i < 0) return null;
  return [g.data.table(0x2e10, 11)[i], g.data.bytes(0x2df8, 12)[i], g.data.bytes(0x2e04, 12)[i]];
}

/** Where a sign is seen from: the party's place and the way it faces (Framebuffer.readSign's key, Game.signRead). */
const signPlace = (g: Game): string => `${g.s.mapId}.${g.s.level}.${g.s.x}.${g.s.y}.${g.s.facing}`;

/**
 * Read sign (the port's, from the command menu, or a sign bumped into): the sign on the wall ahead printed in the
 * log, in its runes - and on the wall, the Standard look's runes giving way to their English from now.
 */
export function readSignAhead(g: Game): void {
  const i = signAhead(g);
  if (i < 0) return;
  // A new reading, from its runes - but not over one from here already under way or done (a key held against it).
  if (!g.signRead?.startsWith(`${signPlace(g)}#`)) g.signRead = `${signPlace(g)}#${++g.signReads}`;
  const t = g.text;
  g.say(0x7542); // "You see:\n"
  t.font = 1;
  for (const line of g.data.table(0x2e10, 11)[i].split(/[\n\r]+/)) if (line.trim()) g.print(`${line.trim()}\n`);
  t.font = 0;
}

/** DUNGEON_104c: a sign's runes, shown over the wall ahead. */
function sign(g: Game, n: number): void {
  const i = signIndex(g, n);
  if (i < 0) return;
  // Drawn again with every frame of the view: the Standard look reads its runes once it has been bumped into or read
  // (readSignAhead), as far as it has got since then; until then, its runes.
  const read = g.signRead?.startsWith(`${signPlace(g)}#`) ?? false;
  const key = read && g.signRead ? g.signRead : signPlace(g);
  const [left, top, text] = [g.data.bytes(0x2df8, 12)[i], g.data.bytes(0x2e04, 12)[i], g.data.table(0x2e10, 11)[i]];
  // The Standard look carves it into the wall itself, larger, laid out to fit (framebuffer.ts carveSign).
  if (g.p.fx.carveSign?.(text, left, top, key, read)) return;
  const t = g.text;
  t.setWindow(0, left, top, 0x27, 0x18);
  t.select(0);
  t.font = 1;
  t.moveTo(0, 0);
  g.p.fx.readSign?.(key, read);
  // 1988's sign is its runes in inverse, dark on a white plate; the Standard look paints them on the wall itself, in
  // the plate's white (framebuffer.ts glyph).
  const plate = g.options.tileSet !== 'standard';
  if (plate) g.printChar(0xfd); // inverse
  g.print(text);
  if (plate) g.printChar(0xfd);
  g.p.fx.readSign?.(null);
  t.font = 0;
  t.select(2);
  t.setWindow(0, 0, 0, 0x27, 0x18);
}

/** DUNGEON_150a: the wall ahead at `depth`; true if the view goes on past it. */
function wallAhead(g: Game, x: number, y: number, depth: number): boolean {
  const s = g.s;
  const c = cellAt(g, x, y);
  if (c < 0xa0) return true;
  let n = g.data.bytes(0x2e8a, 6)[(c >> 4) - 0xa] + depth;
  if (depth === 0) n = 0xc;
  piece(g, n, 0, 0);
  piece(g, n, 0, 1);
  if ((depth === 1 || depth === 2) && s.dungeonLook === 1 && (c & 0xf0) === 0xc0) {
    const i = cellIndex(x, y, s.level);
    const step = drip(g, 0x5f, g.data.bytes(0x2e90, 10)[(c & 7) + (depth - 1) * 5] + 0xe, c & 7, depth);
    s.dungeon[i] = (s.dungeon[i] & 0xf8) + step;
  }
  // The Standard look's sign two squares ahead: smaller, in its runes, too far to read (the port's; 1988 shows a sign
  // only on the wall right ahead).
  if (depth === 2 && (c & 0xf0) === 0xb0 && g.options.tileSet === 'standard') {
    const at = signText(g, c);
    if (at) g.p.fx.farSign?.(...at);
  }
  if (depth === 1) {
    if ((c & 0xf0) === 0xb0 && (c & 0xf) !== 0) {
      sign(g, c & 0xf);
    } else if (s.dungeonLook === 3 && (c & 0xf0) === 0xc0 && g.random(0, 0x40) < 4) {
      // The skeleton's eyes: a light of their own, seen in the dark.
      g.p.fx.emit?.(true);
      g.draw.pen = Colour.red + 8;
      hline(g, 0x5c, 0x57, 0x5d);
      hline(g, 0x5b, 0x58, 0x5d);
      hline(g, 0x61, 0x57, 0x62);
      hline(g, 0x61, 0x58, 99);
      g.p.fx.emit?.(false);
    }
  }
  if ((c & 0xf0) === 0xe0 && depth === 0) {
    state.clip = true;
    return true;
  }
  return false;
}

/** DUNGEON_1682: the side wall (or opening) at `depth` on one side. */
function sideWall(g: Game, x: number, y: number, side: number, depth: number): void {
  const s = g.s;
  const c = cellAt(g, x, y);
  if (c < 0xa0) {
    piece(g, depth + 0x10, 0, side);
    return;
  }
  switch (c & 0xf0) {
    case 0xc0: {
      piece(g, depth + 0x14, 0, side);
      if (depth >= 2 || s.dungeonLook !== 1) break;
      let dx = depth !== 0 ? 0x43 : 0x21;
      if (side !== 0) dx = 0xbe - dx;
      const i = cellIndex(x, y, s.level);
      const step = drip(g, dx, g.data.bytes(0x2e9a, 10)[(c & 7) + depth * 5] + 0xe, c & 7, depth);
      s.dungeon[i] = (s.dungeon[i] & 0xf8) + step;
      break;
    }
    case 0xa0:
    case 0xe0:
    case 0xf0:
      piece(g, depth + 4, 0, side);
      break;
    default:
      piece(g, depth, 0, side);
      // The Standard look's sign on a wall beside the party or beside the square ahead: in its runes, seen along the
      // passage (the port's; 1988 shows a sign only on the wall right ahead).
      if ((c & 0xf0) === 0xb0 && depth <= 1 && g.options.tileSet === 'standard') {
        const at = signText(g, c);
        if (at) g.p.fx.sideSign?.(...at, side, depth);
      }
  }
}

/** DUNGEON_1786: a fountain's sparkles at `depth`, frame `f`. */
function fountain(g: Game, depth: number, f: number): void {
  const pairs = (addr: number, n: number): [number, number][] => {
    const b = g.data.bytes(addr, n * 2);
    return Array.from({ length: n }, (_, i) => [b[i * 2], b[i * 2 + 1]]);
  };
  g.draw.pen = Colour.blue;
  switch (depth) {
    case 0: {
      g.draw.pen = Colour.blue + 8;
      for (const [x, y] of pairs(0x2ea4 + f * 16, 8)) {
        pset(g, x, y);
        pset(g, 0xbe - x, y);
      }
      const [x, y] = pairs(0x2f10 + f * 2, 1)[0];
      pset(g, x, y);
      pset(g, 0xbe - x, y);
      break;
    }
    case 1:
      for (const [x, y] of pairs(0x2ed4 + f * 10, 5)) {
        pset(g, x + 0x48, y + 0x60);
        pset(g, 0x76 - x, y + 0x60);
      }
      break;
    case 2:
      for (const [x, y] of pairs(0x2ef2 + f * 8, 4)) {
        pset(g, x + 0x50, y + 0x60);
        pset(g, 0x6e - x, y + 0x60);
      }
      break;
    case 3: {
      const [x, y] = pairs(0x2f0a + f * 2, 1)[0];
      pset(g, x + 0x58, y + 0x60);
      pset(g, 0x66 - x, y + 0x60);
      break;
    }
  }
}

/** DUNGEON_1952: what stands in a cell at `depth`: ladders, chests, fountains, pits, fields, a hole above, the creature. */
function contents(g: Game, x: number, y: number, depth: number): void {
  const s = g.s;
  const c = cellAt(g, x, y);
  const kind = c >> 4;
  if (kind > 0 && kind < 8 && (kind !== 6 || (c & 7) === 0)) {
    const ceiling = g.data.bytes(0x2f16, 8)[kind];
    const floor = g.data.bytes(0x2f1e, 8)[kind];
    if (ceiling !== 0) {
      piece(g, ceiling + depth * 2, 1, 0);
      piece(g, ceiling + depth * 2, 1, 1);
    }
    if (floor !== 0) {
      piece(g, floor + depth * 2, 0, 0);
      piece(g, floor + depth * 2, 0, 1);
    }
    if (kind === 5) fountain(g, depth, state.sparkle);
  } else if (kind === 8) {
    // A field's crackle is a light of its own.
    g.p.fx.emit?.(true);
    field(g, depth, c & 7);
    g.p.fx.emit?.(false);
  }
  if (kind < 9 && (s.dungeon[cellIndex(x, y, s.level)] & 8) !== 0) {
    const hole = g.data.bytes(0x2f1e, 8)[6];
    piece(g, hole + depth * 2, 1, 0);
    piece(g, hole + depth * 2, 1, 1);
  }
  const a = s.actors[1];
  if (depth !== 0 && (x & 7) === a.x && (y & 7) === a.y) drawMonster(g, depth);
  if (depth === 0 && ++state.sparkle > 2) state.sparkle = 0;
}

/** DUNGEON_1a90: the view ahead drawn on page 1: walls out to three cells, then what is in them, far to near. */
function drawDungeon(g: Game, sides: boolean): void {
  const s = g.s;
  const d = g.draw;
  if (state.sparkle < 0) state.sparkle = g.data.bytes(0x2f26, 1)[0];
  g.d545e = 0xff;
  g.p.fx.page(1);
  d.pen = 0;
  // 1988 clears the view's right half alone, its left always drawn over whole. The Standard look's walls, drawn at
  // twice the grain, leave a pixel or two of the page's edge rows as they were - what else page 1 last held, white
  // dots along the top and bottom of the view - so it clears the whole of it.
  d.fill(g.options.tileSet === 'standard' ? 0x10 : 0x60, 0xe, 0xaf, 0xb2);
  state.clip = false;
  // The Standard look's dark: what gives a light of its own - a skeleton's eyes, a field - is seen without
  // the party's; the view drawn as if lit, and all but that put out (framebuffer.ts darkenUnlit).
  state.dark = s.d58a6 === 0 && s.d58a7 === 0 && g.options.tileSet === 'standard' && !!g.p.fx.darkenUnlit;
  if (s.d58a6 !== 0 || s.d58a7 !== 0 || state.dark) {
    let x = s.x;
    let y = s.y;
    const dx = stepX(g)[s.facing];
    const dy = stepY(g)[s.facing];
    const sx = g.data.sbytes(0x2f28, 4)[s.facing] & 0xff;
    const sy = g.data.sbytes(0x2f2c, 4)[s.facing] & 0xff;
    let depth = 0;
    for (; depth < 4; depth++) {
      if (!wallAhead(g, x, y, depth)) break;
      if (depth !== 0 || (cellAt(g, s.x, s.y) !== 0xe0 && sides)) {
        sideWall(g, (sx + x) & 0xff, (sy + y) & 0xff, 0, depth);
        sideWall(g, (x - sx) & 0xff, (y - sy) & 0xff, 1, depth);
      }
      x += dx;
      y += dy;
    }
    for (--depth; depth >= 0; depth--) {
      x -= dx;
      y -= dy;
      contents(g, x, y, depth);
    }
    if (state.dark) g.p.fx.darkenUnlit?.(0x10, 0xe, 0xaf, 0xb2);
  } else {
    d.fill(8, 8, 0xb7, 0xb7);
  }
  g.p.fx.page(0);
  state.clip = false;
}

/** DUNGEON_1020: every other call, the footsteps' noise, fading. */
function footsteps(g: Game): void {
  state.footTick ^= 1;
  if (state.footTick !== 0 && state.footstep !== 0) {
    if (!g.soundOff) void g.sound.noise(1, state.footstep, 20000);
    state.footstep = Math.max(0, state.footstep - 4);
  }
}

/** DUNGEON_01d2: the level on the top border, the facing on the bottom. */
function printWalkDir(g: Game): void {
  const t = g.text;
  const was = t.current;
  t.select(0);
  t.moveTo(0xc, 0);
  g.printNumber(g.s.level + 1, 1, ' ');
  // The Standard look: the facing with the date, and no "Dir:" before it (frame.ts drawBottomLine).
  if (g.options.tileSet === 'standard') drawBottomLine(g);
  else {
    t.moveTo(0xc, 0x17);
    g.say([0x2c7c, 0x2c82, 0x2c88, 0x2c8e][g.s.facing] ?? 0x2c94); // "North" " East" "South" " West"
  }
  t.select(was);
}

/**
 * The view built on page 1 shown on the screen: `whole`, or only its middle, where the creature, the fields and the
 * drips move. The Standard look grows it to the square the map fills, out to the frame (1988's view is smaller, a black
 * margin round it), each pixel the average of those it covers; the EGA look shows it where 1988 did.
 */
function showView(g: Game, whole: boolean): void {
  const fx = g.p.fx;
  const [from, to] = whole ? [0x10, 0xaf] : [0x28, 0x96];
  if (g.options.tileSet === 'standard' && fx.transferScaled) {
    // The square's columns that come from the middle alone: those whose every pixel is drawn from it.
    const k = SQUARE / (0xaf - 0x10 + 1);
    const [c1, c2] = whole ? [8, 8 + SQUARE - 1] : [Math.ceil(8 + (from - 0x10) * k), Math.floor(8 + (to + 1 - 0x10) * k) - 1];
    fx.transferScaled(1, 0, 0x10, 0xe, 0xaf, 0xb2, 8, 8, SQUARE, SQUARE, c1, c2);
    fx.page(0);
    return;
  }
  fx.transfer(1, 0, from, 0xe, to, 0xb2);
  fx.page(0);
}

/** The map's square on the screen, in EGA pixels a side, from (8, 8): where the Standard look shows the dungeon's view. */
const SQUARE = 0xb0;

/** DUNGEON_1be0: redraw everything: vitals, the view, the borders. */
export function refresh(g: Game): void {
  revealCells(g);
  g.p.fx.dungeonTint?.(g.s.mapId > 0x20 && g.s.mapId < 0x80 ? g.s.mapId - 0x20 : 0);
  drawVitals(g);
  drawDungeon(g, true);
  showView(g, true); // the view was built on page 1; the map goes over what the player sees
  drawDungeonMap(g);
  footsteps(g);
  printWalkDir(g);
}

/** DUNGEON_0332: the borders' labels, "L" for the level and "Dir:". */
function borders(g: Game): void {
  const d = g.draw;
  const t = g.text;
  const was = t.current;
  d.pen = Colour.blue;
  d.fill(0x28, 0, 0x98, 7);
  d.fill(0x30, 0xb9, 0x98, 0xbf);
  d.pen = Colour.brightWhite;
  d.line(0x28, 7, 0x98, 7);
  d.line(0x30, 0xb8, 0x98, 0xb8);
  t.select(0);
  t.moveTo(10, 0);
  leftArrow(g);
  g.say(0x2c9a); // "L "
  rightArrow(g);
  if (g.options.tileSet !== 'standard') {
    t.moveTo(6, 0x17);
    leftArrow(g);
    g.say(0x2c9d); // "Dir:      "
    rightArrow(g);
  }
  t.select(was);
}

// --- The wandering creature ------------------------------------------------------------------------------

/** DUNGEON_0252: the creature to a random open cell off the party's row and column; false if none found. */
function placeMonster(g: Game): boolean {
  const s = g.s;
  const a = s.actors[1];
  const b = s.actors[2];
  for (let n = 0; n < 8; n++) {
    const i = g.random(0, 0x3f);
    const c = s.dungeon[s.level * 0x40 + i] & 0xf0;
    if (c < 0x60 || c === 0x70) {
      const y = Math.trunc(i / 8);
      const x = i % 8;
      if (x !== s.x && y !== s.y) {
        a.x = b.x = x;
        a.y = b.y = y;
        if ((a.b5 === 0x16 || a.b5 === 0x18) && g.random(0, 99) > 0x30) a.b7 = 0xff;
        return true;
      }
    }
  }
  a.x = b.x = a.y = b.y = 0xff;
  return false;
}

/** DUNGEON_0134: a new creature on the level (its picture, kind and ways by D_1744/D_173c), or none. */
function newMonster(g: Game, fresh: boolean): void {
  const s = g.s;
  const a = s.actors[1];
  if (!fresh) return;
  const t = g.random(0, 7);
  a.tile = a.anim = t;
  a.b7 = 0;
  a.b6 = g.data.bytes(0x1744, 8)[t];
  a.b5 = g.data.bytes(0x173c, 8)[t];
  a.z = s.level;
  if (!placeMonster(g)) {
    a.tile = a.anim = 0;
    a.b5 = 0xff;
  }
}

/** DUNGEON_07e2: the creature wanders a step (not into pits, fields or walls, seldom back); true if it reached the party. */
function monsterStep(g: Game): boolean {
  const s = g.s;
  const a = s.actors[1];
  const b = s.actors[2];
  if (a.b5 === 0xff) return false;
  if (a.b5 !== 0x1b) {
    let moved = false;
    let x = 0;
    let y = 0;
    for (let n = 0; n < 8; n++) {
      const dir = g.random(0, 3);
      x = stepX(g)[dir] + a.x;
      if (x > 7) x = 0;
      if (x < 0) x = 7;
      y = stepY(g)[dir] + a.y;
      if (y > 7) y = 0;
      if (y < 0) y = 7;
      const c = s.dungeon[cellIndex(x, y, s.level)] & 0xf0;
      if (c !== 0x60 && c !== 0x80 && c < 0xa0 && (x !== b.x || y !== b.y || g.random(0, 7) === 1)) {
        moved = true;
        break;
      }
    }
    if (moved) {
      b.x = a.x;
      b.y = a.y;
      a.x = x;
      a.y = y;
    }
  }
  if (a.x === s.x && a.y === s.y) {
    a.x = b.x;
    a.y = b.y;
    return true;
  }
  return false;
}

// --- Fights ------------------------------------------------------------------------------------------------

/** DNGLOOK_097e: an open side of the corridor fight's map; a doorway gets its door. */
function openSide(g: Game, cell: number, side: number): void {
  const m = g.combatMap;
  let [x, y, dx, dy] = [0, 0, 0, 0];
  if (side === 0) dx = 1;
  else if (side === 1) {
    dy = 1;
    x = 10;
  } else if (side === 2) {
    dx = 1;
    y = 10;
  } else dy = 1;
  for (let i = 0; i < 0xb; i++) {
    m[y * 32 + x] = 0xff;
    x += dx;
    y += dy;
  }
  if (side === 0 && cell === 0xe0) m[2 * 32 + 5] = m[8 * 32 + 5] = g.bb14;
  if (side === 3 && cell === 0xe0) m[5 * 32 + 2] = m[5 * 32 + 8] = g.bb14;
}

/** DNGLOOK_0a48, DNGLOOK_0aee: floor laid along one side (5 squares for a wall, 7 for an opening). */
function floorSide(g: Game, side: number, long: boolean): void {
  const m = g.combatMap;
  let [x, y, dx, dy] = long ? [0, 0, 0, 0] : [3, 3, 0, 0];
  if (long) {
    [x, y] = [
      [2, 1],
      [9, 2],
      [2, 9],
      [1, 2],
    ][side];
    if (side === 0 || side === 2) dx = 1;
    else dy = 1;
  } else if (side === 0) {
    dx = 1;
    y = 1;
  } else if (side === 1) {
    dy = 1;
    x = 9;
  } else if (side === 2) {
    dx = 1;
    y = 9;
  } else {
    dy = 1;
    x = 1;
  }
  for (let i = 0; i < (long ? 7 : 5); i++) {
    m[y * 32 + x] = g.bb15;
    x += dx;
    y += dy;
  }
}

/** DNGLOOK_0b9e: one side of the corridor fight by the cell beyond it. */
function corridorSide(g: Game, side: number): void {
  const s = g.s;
  let x = s.x;
  let y = s.y;
  if (side === 0) y--;
  else if (side === 1) x++;
  else if (side === 2) y++;
  else x--;
  const c = s.dungeon[cellIndex(x, y, s.level)] & 0xf0;
  if (c < 0xa0) floorSide(g, side, true);
  if (c === 0xb0 || c === 0xc0 || c === 0xd0) openSide(g, s.dungeon[cellIndex(s.x, s.y, s.level)] & 0xf0, side);
  else floorSide(g, side, false);
}

/** DNGLOOK_0c6c: the corridor fight's walls, and a ladder or the like where the party stands. */
function corridorWalls(g: Game): void {
  const s = g.s;
  const m = g.combatMap;
  m.fill(g.bb14, 1 * 32, 1 * 32 + 0xb);
  m.fill(g.bb14, 9 * 32, 9 * 32 + 0xb);
  for (let i = 0; i < 0xb; i++) m[i * 32 + 1] = m[i * 32 + 9] = g.bb14;
  m[0] = m[10] = m[10 * 32] = m[10 * 32 + 10] = 0xff;
  let c = s.dungeon[cellIndex(s.x, s.y, s.level)] & 0xf0;
  if (c !== 0 && c < 0x80) {
    c >>= 4;
    const t = g.data.bytes(0x244a, 8)[c];
    if (t !== 0) m[5 * 32 + 5] = t;
    g.bb16 = c === 3 ? 1 : 0;
  }
  for (let side = 0; side < 4; side++) corridorSide(g, side);
}

/** DNGLOOK_0d3e: the map for a fight in the corridor (or a camp): walls, the party's and the monsters' places, the monsters. */
function corridorMap(g: Game): void {
  const s = g.s;
  const m = g.combatMap;
  const camp = (s.combatFlags & 4) !== 0;
  for (let r = 0; r < 0xb; r++) m.fill(g.bb15, r * 32, r * 32 + 0xb);
  if (camp) m[5 * 32 + 5] = 0xb3;
  corridorWalls(g);
  for (let i = 0; i < 8; i++) m[8 * 32 + 11 + i] = m[8 * 32 + 19 + i] = 0xff;
  const t = (a: number, n: number): Uint8Array => g.data.bytes(a, n);
  const rows = { south: 3, west: 2, north: 4, east: 1 };
  for (let i = 0; i < 6; i++) {
    if (camp) {
      for (const r of Object.values(rows)) m[r * 32 + 11 + i] = t(0x2452, 6)[i];
    } else {
      m[rows.south * 32 + 11 + i] = t(0x2470, 6)[i];
      m[rows.west * 32 + 11 + i] = t(0x246a, 6)[i];
      m[rows.north * 32 + 11 + i] = t(0x245e, 6)[i];
      m[rows.east * 32 + 11 + i] = t(0x2464, 6)[i];
    }
  }
  for (let i = 0; i < 6; i++) {
    if (camp) {
      for (const r of Object.values(rows)) m[r * 32 + 17 + i] = t(0x2458, 6)[i];
    } else {
      m[rows.south * 32 + 17 + i] = t(0x2464, 6)[i];
      m[rows.west * 32 + 17 + i] = t(0x245e, 6)[i];
      m[rows.north * 32 + 17 + i] = t(0x246a, 6)[i];
      m[rows.east * 32 + 17 + i] = t(0x2470, 6)[i];
    }
  }
  const a = t(0x2476, 16);
  const b = t(0x2486, 16);
  const c = t(0x2496, 16);
  const d = t(0x24a6, 16);
  for (let i = 0; i < 0x10; i++) {
    let mx: number;
    let my: number;
    if (camp) {
      mx = t(0x24b6, 16)[i];
      my = t(0x24c6, 16)[i];
    } else {
      [mx, my] = [
        [a[i], c[i]],
        [b[i], d[i]],
        [d[i], b[i]],
        [c[i], a[i]],
      ][s.facing] ?? [a[i], c[i]];
    }
    m[6 * 32 + 11 + i] = mx;
    m[7 * 32 + 11 + i] = my;
  }
  const order = Array.from({ length: 16 }, (_, i) => i);
  for (let i = 0; i < 0x10; i++) {
    const j = g.random(0, 0xf);
    [order[i], order[j]] = [order[j], order[i]];
    m[5 * 32 + 11 + i] = 0;
  }
  const kind = camp ? t(0x173c, 8)[g.random(0, 7)] : s.actors[1].b5;
  const most = g.data.bytes(0x13bc + kind * 8 + 6, 1)[0];
  let n = g.random(1, most);
  if (most === 8 || most === 0x10) n = most;
  for (let i = 0; i < n; i++) m[5 * 32 + 11 + order[i]] = kind * 4 + 0x40;
}

/** DNGLOOK_117e: the party onto the room's or corridor's map by its facing (not in `how` 1), then the monsters and things (`how` 1 or 2, or 3 for a room not yet cleared). */
/**
 * The row of a room's DUNGEON.CBT map that holds where the party stands, entering it facing `facing` (each side the
 * room is entered from has its own; a side it has no way in from, none - every member on 0, 0).
 */
export const entryRow = (facing: number): number => ({ 0: 3, 5: 3, 1: 2, 3: 1 })[facing] ?? 4;

async function placeRoom(g: Game, cell: number, how: number): Promise<void> {
  const s = g.s;
  const m = g.combatMap;
  if (how !== 1) {
    const row = entryRow(s.facing);
    await placeParty(g);
    for (let i = 0; i < s.partySize; i++) {
      // With a member dead the party fills one record fewer, and the original sets the empty one down on its
      // square all the same; once a monster is given the actor it would have had, that square blocks everyone
      // for the whole fight (COMBAT_0000: a record whose actor is elsewhere, flags 0) - a phantom on a ladder,
      // in Doom. An empty record is left where placeParty cleared it.
      if (g.combat[i].flags === 0) continue;
      g.combat[i].x = s.actors[i].x = m[row * 32 + 11 + i];
      g.combat[i].y = s.actors[i].y = m[row * 32 + 17 + i];
    }
  }
  if (how > 0 && ((cell > 0xef && how === 3) || how < 3)) {
    const kinds = Array.from({ length: 4 }, () => g.data.bytes(0x385e, 8)[g.random(0, 7)]);
    for (let i = 0; i < 0x10; i++) {
      const t = m[5 * 32 + 11 + i];
      if (t === 0) continue;
      let plain: 0 | 2 = 0;
      let what: number;
      if (t < 0x40 || (t & 0xfc) === 0xb4 || (t & 0xfc) === 0xe8) {
        plain = 2;
        what = t;
      } else {
        what = (t - 0x40) >> 2;
      }
      if ((t & 0xfc) === 0xec) what = kinds[t & 3];
      const a = placeCombatant(g, what, plain, m[6 * 32 + 11 + i], m[7 * 32 + 11 + i], s.level);
      if (plain === 2 && a >= 0) {
        if (what === 1) s.actors[a].b5 = s.level * 3 + 7;
        else if (what === 2) s.actors[a].b5 = g.random(1, s.level * 10 + 10);
        else if (what < 0x10 && what >= 3) {
          s.actors[a].b5 = g.data.bytes(0x3850, 0xd)[what - 3] + g.random(0, g.data.bytes(0x3842, 0xd)[what - 3] - 1);
        }
      }
    }
  }
}

/** DNGLOOK_0fda: after a fight, the party leaves by the side it walked off (or up or down, or out of the dungeon). */
function leaveFight(g: Game): void {
  const s = g.s;
  switch (s.exitDir) {
    case K.Up:
      s.y = s.y === 0 ? 7 : s.y - 1;
      s.d6602 = s.facing = 0;
      break;
    case K.Right:
      s.x = s.x >= 7 ? 0 : s.x + 1;
      s.d6602 = s.facing = 1;
      break;
    case K.Down:
      s.y = s.y >= 7 ? 0 : s.y + 1;
      s.d6602 = s.facing = 2;
      break;
    case K.Left:
      s.x = s.x === 0 ? 7 : s.x - 1;
      s.d6602 = s.facing = 3;
      break;
    case 5:
      if (s.level === 0) {
        dungeonExitNow(g);
        s.mapId = 0;
      } else {
        s.level--;
        s.d6602 = 4;
      }
      break;
    case 6:
      if (s.level === 7) {
        dungeonExitNow(g);
        s.mapId = 0;
      } else {
        s.level++;
        s.d6602 = 5;
      }
      break;
  }
}

/** DNGLOOK_0844: a room won is marked cleared (unless it is one that fills again). */
function markCleared(g: Game, room: number): void {
  const s = g.s;
  const again = g.data.bytes(0x383a, 6);
  const n = g.data.bytes(0x3840, 1)[0];
  for (let i = 0; i < n; i++) if (again[i] === (s.mapId & 0xf) * 0x10 + room) return;
  let d = s.mapId - 0x21;
  if (d >= 1) d--;
  const bit = room + d * 0x10;
  s.d58e0[bit >> 3] |= 1 << (bit & 7);
}

/** DNGLOOK_093a: rooms cleared before lose their foes (their doors become plain heavy doors). */
function clearedRooms(g: Game): void {
  const s = g.s;
  let d = s.mapId - 0x21;
  if (d >= 1) d--;
  for (let i = 0; i < 0x200; i++) {
    if ((s.dungeon[i] & 0xf0) !== 0xf0) continue;
    const bit = d * 0x10 + (s.dungeon[i] & 0xf);
    if (s.d58e0[bit >> 3] & (1 << (bit & 7))) s.dungeon[i] &= 0xaf;
  }
}

/** DNGLOOK_109e: the view cleared, the creature gone if `fresh`. */
function resetView(g: Game, fresh: boolean): void {
  const s = g.s;
  if (s.mapId === 0) return;
  if (fresh) {
    const a = s.actors[1];
    a.tile = a.anim = 0;
    a.b5 = a.x = a.y = 0xff;
  }
  g.draw.pen = 0;
  g.draw.fill(8, 8, 0xb7, 0xb7);
  g.p.fx.page(1);
  g.draw.fill(8, 8, 0xb7, 0xb7);
  g.p.fx.page(0);
}

/** DUNGEON_0000: through a heavy door into a room from DUNGEON.CBT, fought out; a room won is marked cleared. */
async function enterRoom(g: Game, cell: number): Promise<void> {
  const s = g.s;
  g.say(0x2c58); // "Entering room...\n"
  s.facing = g.data.bytes(0x2c76, 6)[s.d6602];
  g.p.flushKeys();
  const room = cell & 0xf;
  const active = s.activeMember;
  s.combatTurn = s.activeMember = 0xff;
  let d = s.mapId - 0x21;
  if (d >= 1) d--;
  g.combatMap.fill(0, 0, 0x160);
  const at = 0x1600 * d + room * 0x160;
  g.combatMap.set(g.data.files.get('DUNGEON.CBT').subarray(at, at + 0x160));
  s.savedMapId = s.mapId;
  const [x, y] = [s.x, s.y];
  const a1 = s.actors[1].b.slice();
  const a2 = s.actors[2].b.slice();
  s.mapId = 0xff;
  s.exitDir = 0;
  await placeRoom(g, cell, 3);
  const { updateFrame } = await import('./frame.ts');
  updateFrame(g);
  s.combatFlags = 0x82;
  newSpawns(g);
  if (!(await combatLoop(g))) {
    if (s.exitDir === 0x4d) {
      const { endgame } = await import('./story.ts');
      await endgame(g);
    }
    s.mapId = s.savedMapId;
    markCleared(g, room);
    s.dungeon[cellIndex(x, y, s.level)] &= 0xaf;
  }
  s.y = y;
  s.x = x;
  s.mapId = s.savedMapId;
  leaveFight(g);
  s.actors[1].b.set(a1);
  s.actors[2].b.set(a2);
  s.activeMember = active;
}

/** DUNGEON_0b7e: the creature attacks from where it came; a fight in the corridor. */
async function attacked(g: Game): Promise<void> {
  const s = g.s;
  const b = s.actors[2];
  g.say(0x2d92); // "Attacked"
  if (((b.x - 1) & 7) === s.x) s.d6602 = 1;
  else if (((b.x + 1) & 7) === s.x) s.d6602 = 3;
  else if (((b.y - 1) & 7) === s.y) s.d6602 = 2;
  else s.d6602 = 0;
  if (s.d6602 !== s.facing) {
    g.say(0x2d9b); // " from the "
    g.say([0x2da6, 0x2dac, 0x2db1, 0x2db7][s.d6602]); // "north" "east" "south" "west"
    s.facing = s.d6602;
  }
  g.say(0x2dbc); // "!\n"
  refresh(g);
  g.p.flushKeys();
  await g.p.sleep(TICK_MS * 2);
  s.exitDir = 0;
  s.combatFlags = 2;
  corridorMap(g);
  await specialMap(g, 2, s.actors[1].b5, 0);
  leaveFight(g);
  resetView(g, true);
  newMonster(g, true);
  if (s.mapId !== 0) refresh(g);
}

/** Room and corridor fights for the combat entry (ULTIMA_5f86's dungeon branch). */
export async function dungeonRoomCombat(g: Game, _kind: number): Promise<void> {
  await placeRoom(g, 0, 2);
}

/** The camp's placing (CMDS_0000): the party by its facing, or on an ambush the monsters. */
export async function dungeonRoomCombatSetup(g: Game, ambush: boolean): Promise<void> {
  const s = g.s;
  await placeRoom(g, s.dungeon[cellIndex(s.x, s.y, s.level)], ambush ? 1 : 0);
}

/** ULTIMA_3c9a's dungeon branch: camping in the corridor. */
export async function campInDungeon(g: Game, guard: number, hours: number): Promise<void> {
  const s = g.s;
  s.combatFlags = 6;
  corridorMap(g);
  const a1 = s.actors[1].b.slice();
  await specialMap(g, 6, guard, hours);
  resetView(g, false);
  s.actors[1].b.set(a1);
  newMonster(g, false);
}

// --- Moving -------------------------------------------------------------------------------------------------

/** DUNGEON_0470: an electric field throws the party back. */
async function electricField(g: Game, dir: number): Promise<void> {
  const s = g.s;
  refresh(g);
  g.say(0x2ca8); // "Ouch!\n"
  g.say(0x2caf); // "Electric field!\n"
  void cue(g, 'ForceField');
  g.draw.pen = Colour.brightWhite;
  g.draw.invert(8, 8, 0xb7, 0xb7);
  await g.p.sleep(TICK_MS);
  g.draw.invert(8, 8, 0xb7, 0xb7);
  if (!g.soundOff) await g.sound.noise(1, 500, 20000);
  if (dir > 0) {
    s.x -= stepX(g)[s.facing];
    s.y -= stepY(g)[s.facing];
  } else {
    s.x += stepX(g)[s.facing];
    s.y += stepY(g)[s.facing];
  }
  await damageParty(g);
  refresh(g);
}

/** DUNGEON_0502: a move key: advance, back up, turn (not in a doorway), or turn around. Returns 1 when the move took the turn. */
async function move(g: Game, key: number, here: number): Promise<number> {
  const s = g.s;
  let dir = 0;
  let took = 0;
  g.text.moving = true; // a move: said again, it folds with a count (text.ts)
  switch (key) {
    case K.Up:
      g.say(0x2cc0); // "Advance\n"
      dir = 1;
      break;
    case K.Right:
      if ((here & 0xf0) === 0xe0)
        g.say(0x2cc9); // "Not in doorway!\n"
      else {
        g.say(0x2cda); // "Turn right\n"
        s.facing = (s.facing + 1) & 3;
      }
      break;
    case K.Down:
      g.say(0x2ce6); // "Back up\n"
      dir = -1;
      break;
    case K.Left:
      if ((here & 0xf0) === 0xe0)
        g.say(0x2cef); // "Not in doorway!\n"
      else {
        g.say(0x2d00); // "Turn left\n"
        s.facing = (s.facing + 3) & 3;
      }
      break;
    default:
      g.say(0x2d0b); // "Turn around.\n"
      s.facing = (s.facing + 2) & 3;
  }
  s.d6602 = s.facing;
  if (dir !== 0) {
    took = 1;
    let x = stepX(g)[s.facing] * dir + s.x;
    if (x < 0) x = 7;
    if (x > 7) x = 0;
    let y = stepY(g)[s.facing] * dir + s.y;
    if (y < 0) y = 7;
    if (y > 7) y = 0;
    let c = s.dungeon[cellIndex(x, y, s.level)];
    const sign = (c & 0xf0) === 0xb0 && signIndex(g, c & 0xf) >= 0;
    if (c === 0x83) {
      s.x = x;
      s.y = y;
      await electricField(g, dir);
      x = s.x;
      y = s.y;
    }
    c &= 0xf0;
    if (dir === 1 && sign && (s.d58a6 !== 0 || s.d58a7 !== 0)) {
      // Bump to act (the port's): advancing into a sign reads it, as Read sign does - printed in the log, and on the
      // wall its runes giving way to their English.
      readSignAhead(g);
      took = 0;
    } else if (dir === 1 && (c === 0xb0 || c === 0xc0 || c === 0xd0) && (s.d58a6 !== 0 || s.d58a7 !== 0)) {
      // Bump to act (the port's, as games walked by a pad have it): advancing into a wall - a hidden door among them - a
      // skeleton, a stalactite or a caved in passage searches it, by the active member or the first who can, as
      // Search, Ahead, would.
      const able = (m: number): boolean => s.members[m].status === Status.Good || s.members[m].status === Status.Poisoned;
      g.bumpWho = s.activeMember !== 0xff ? s.activeMember : ([...Array(s.partySize).keys()].find(able) ?? -1);
      g.searchAhead = true;
      queueKeys(0x53);
      took = 0;
    } else if ((c > 0xa0 && c < 0xe0) || (dir === -1 && (c === 0xa0 || c === 0xf0))) {
      g.say(0x2d19); // "Blocked!\n"
    } else if (x === s.actors[1].x && y === s.actors[1].y && dir === 1) {
      // Bump to act (the port's): advancing into the creature attacks it.
      queueKeys(0x41);
      took = 0;
    } else if (x === s.actors[1].x && y === s.actors[1].y) {
      g.say(0x2d23); // "Blocked!\n"
    } else {
      state.footstep = 0xf;
      state.footTick = 0;
      footsteps(g);
      state.footTick = 0;
      s.x = x & 7;
      s.y = y & 7;
      g.signRead = null; // a sign read is left behind, its runes runes again
    }
  }
  refresh(g);
  return took;
}

/**
 * Whether the cell at (x, y) holds something the party would act on, or be acted on by, stepping into it - as the
 * map shows it, a hidden trap being the passage it looks: the creature, a ladder, a fountain, a chest or its treasure,
 * a pit, a field, a room's door; and the rock or rubble a step with a light searches (move).
 */
function worthALook(g: Game, x: number, y: number): boolean {
  const s = g.s;
  if (x === s.actors[1].x && y === s.actors[1].y) return true;
  const kind = kindOf(s.dungeon[cellIndex(x, y, s.level)]);
  if (kind === 'rock' || kind === 'rubble') return !inTheDark(g);
  return kind !== 'floor' && kind !== 'door';
}

/**
 * A step by the compass (the port's, as the ultima3 port walks its dungeons with the whole map up): the party faces
 * the way pressed and steps, as one turn - turning costs none - the opposite way turning it about. Blocked, it has
 * still turned. Where the step would meet something (worthALook) it only turns, to face it, and the next press acts,
 * so nothing is done that the party has not first looked at. In a doorway it goes only along the door's way, and the
 * opposite way backs out without turning.
 */
async function compassStep(g: Game, key: number, here: number): Promise<number> {
  const s = g.s;
  const heading = ([K.Up, K.Right, K.Down, K.Left] as number[]).indexOf(key);
  if (heading === s.facing) return move(g, K.Up, here);
  if ((here & 0xf0) === 0xe0) {
    if (heading === ((s.facing + 2) & 3)) return move(g, K.Down, here);
    g.say(0x2cc9); // "Not in doorway!\n"
    return 0;
  }
  if (worthALook(g, (s.x + stepX(g)[heading]) & 7, (s.y + stepY(g)[heading]) & 7)) {
    // Turned only, as the first-person view's own keys turn: right, left, or about (move's other keys).
    const turn = (heading - s.facing) & 3;
    return move(g, turn === 1 ? K.Right : turn === 3 ? K.Left : 0, here);
  }
  s.facing = heading;
  return move(g, K.Up, here);
}

/** DUNGEON_03d6: wait for a key while the view (and its creature, fields and drips) animates. */
async function dungeonKey(g: Game): Promise<number> {
  if (g.vitalsDirty !== 0) {
    drawVitals(g);
    g.vitalsDirty = 0;
  }
  commandPrompt(g);
  let first = true;
  let pass = 0;
  return getCommandKey(g, 'dungeon', () => {
    // The tile art's clock goes on below ground too (a look that draws the creature as its figure animates it by this);
    // and the tiles' cycles, for the fountains on the Standard look's map, at the pace they keep above (input.ts rawKey).
    g.p.animateTiles();
    if (g.options.tileSet !== 'standard' || (pass++ & 1) === 0) {
      g.cycles.step();
      animateParty(); // the leader's walk, for the Standard look's map
    }
    // With the whole-level map up the view is shown small, all of it copied at every tick (dungeonMap.ts): its near
    // walls drawn every time too, which the view in its own place draws only at first, never animating.
    drawDungeon(g, first || byCompass(g));
    // The whole view at first, then the middle of it, where the creature, the fields and the drips move.
    showView(g, first);
    // What is in sight kept as soon as there is light to see it by - a torch lit, a spell cast - not only at a step.
    revealCells(g);
    drawDungeonMap(g); // the view is redrawn every tick; the map goes back over it
    if (g.s.dungeonLook !== 1) first = false;
    footsteps(g);
  });
}

/** DUNGEON_0948. */
async function sleepSpell(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x2d53); // "Sleep spell!\n"
  for (let i = 0; i < s.partySize; i++) {
    const p = s.members[i];
    if (p.dex <= g.random(1, 0x1e) && p.status !== Status.Dead) {
      p.status = Status.Sleeping;
      invertMember(g, i);
      if (!g.soundOff) await g.sound.noise(1, 0x32, 0xdac);
      g.vitalsDirty = 1;
    }
  }
  s.dungeon[cellIndex(s.x, s.y, s.level)] &= 8;
}

/** DUNGEON_09e6. */
async function poisonField(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x2d61); // "Poison!\n"
  for (let i = 0; i < s.partySize; i++) {
    const p = s.members[i];
    if (p.dex <= g.random(1, 0x1e) && p.status !== Status.Dead) {
      p.status = Status.Poisoned;
      if (!g.soundOff) await g.sound.noise(1, 0x32, 0xdac);
    }
  }
}

/** How long the Standard look takes to show the party falling through a pit, in milliseconds. */
const FALL_MS = 500;
/** The frames it is shown in. */
const FALL_FRAMES = 30;

/**
 * The party falling through a pit (the Standard look's; 1988 goes from one level to the next at once): the view
 * slides up out of its square over half a second, faster as it goes, black rising behind it - the next level then
 * drawn in its place. With the whole-level map up, the view as it shows it small beside it, inside its frame.
 */
async function fall(g: Game): Promise<void> {
  const fx = g.p.fx;
  if (g.options.tileSet !== 'standard' || !fx.viewSlide) return;
  let box: [number, number, number, number] = [8, 8, 8 + SQUARE - 1, 8 + SQUARE - 1];
  if (g.options.dungeonView === 'full') {
    const small = smallView(g);
    if (!small) return;
    box = [small[0] + 1, small[1] + 1, small[2] - 1, small[3] - 1];
  }
  // As far as the clock says, or the frames shown, whichever is further: half a second, however slowly frames come.
  const start = performance.now();
  for (let i = 0; ; i++) {
    const t = Math.min(1, Math.max(i / FALL_FRAMES, (performance.now() - start) / FALL_MS));
    fx.viewSlide(...box, t * t);
    if (t >= 1) break;
    await g.p.sleep(FALL_MS / FALL_FRAMES);
  }
  fx.viewSlide(...box, null);
}

/** DUNGEON_0a4c: a pit trap: down a level (and on while the next is one too); out of the dungeon from the bottom. */
export async function pitTrap(g: Game, cell: number): Promise<void> {
  const s = g.s;
  s.d6602 = 5;
  while ((cell === 0x61 || cell === 0x69) && s.level < 8) {
    g.say(0x2d6a); // "Pit Trap!\n"
    g.say(0x2d75); // "Falling...\n"
    await fall(g);
    s.dungeon[cellIndex(s.x, s.y, s.level)] &= 0xf8;
    s.level++;
    cell = s.level < 8 ? s.dungeon[cellIndex(s.x, s.y, s.level)] : 0;
    if (cell < 0x90 && s.level < 8) {
      cell |= 8;
      s.dungeon[cellIndex(s.x, s.y, s.level)] = cell;
    }
    if (s.level < 8) refresh(g);
    g.say(0x2d81); // "      ...splat!\n"
    await damageParty(g);
  }
  if (s.level === 8) s.mapId = 0;
  if (s.mapId !== 0) {
    const c = s.dungeon[cellIndex(s.x, s.y, s.level)] & 0xf0;
    if (c === 0xa0 || c === 0xf0) {
      await enterRoom(g, s.dungeon[cellIndex(s.x, s.y, s.level)]);
      if (s.mapId === 0) return;
      resetView(g, true);
    }
    newMonster(g, true);
  }
}

/** DUNGEON_0c76: after a move: sleepers may wake, the creature moves (and may attack), then the square's door, field or trap; the turn ends. */
async function afterMove(g: Game, cell: number, creatureMoves: boolean): Promise<void> {
  const s = g.s;
  let woke = 0;
  for (let i = 0; i < s.partySize; i++) {
    if (s.members[i].status === Status.Sleeping && g.random(0, 0x3f) < 4) {
      s.members[i].status = Status.Good;
      woke++;
    }
  }
  if (woke !== 0) drawVitals(g);
  let kind = cell & 0xf0;
  if (creatureMoves && monsterStep(g)) {
    await attacked(g);
    cell = s.dungeon[cellIndex(s.x, s.y, s.level)];
    kind = cell & 0xf0;
  }
  if (s.mapId === 0) return;
  if (kind === 0xf0 || kind === 0xa0) {
    while ((kind === 0xf0 || kind === 0xa0) && firstActive(g) > -1) {
      await enterRoom(g, cell);
      if (s.mapId === 0) break;
      cell = s.dungeon[cellIndex(s.x, s.y, s.level)];
      kind = cell & 0xf0;
    }
    resetView(g, true);
    if (s.mapId > 0x20) refresh(g);
  } else {
    switch (cell) {
      case 0x80:
      case 0x88:
        await sleepSpell(g);
        break;
      case 0x81:
      case 0x89:
        await poisonField(g);
        break;
      case 0x82:
      case 0x8a:
        g.say(0x2dbf); // "Fire!!\n"
        await damageParty(g);
        break;
      case 0x62:
      case 0x6a:
        g.say(0x2dc7); // "Bomb Trap!\n"
        g.say(0x2dd3); // "KABOOM!!\n"
        s.dungeon[cellIndex(s.x, s.y, s.level)] &= 8;
        await damageParty(g);
        break;
      case 0x61:
      case 0x69:
        await pitTrap(g, cell);
        break;
    }
    drawVitals(g);
  }
  await endTurn(g);
}

/** DUNGEON_06c4: a key in the dungeon: moves here, the rest to the common commands. Returns whether the turn passed. */
export async function dungeonCommand(g: Game, key: number): Promise<number> {
  const s = g.s;
  switch (key) {
    case 0x0b: // Ctrl-K: karma
      g.printNumber(s.karma, 1, ' ');
      g.printChar('\n');
      return 1;
    case K.Left:
    case K.Right:
    case K.Up:
    case K.Down:
      // The Standard look's whole-level map up: the d-pad walks by the compass, as out in the world.
      if (byCompass(g)) return compassStep(g, key, s.dungeon[cellIndex(s.x, s.y, s.level)]);
      return move(g, key, s.dungeon[cellIndex(s.x, s.y, s.level)]);
    case K.Enter:
    case 0x2e:
      return move(g, key, s.dungeon[cellIndex(s.x, s.y, s.level)]);
    case K.CtrlS:
      g.say(0x2d43); // "Sound "
      g.say(g.soundOff ? 0x2d4a : 0x2d4f); // "Off\n" : "On\n"
      g.soundOff = !g.soundOff;
      return 1;
  }
  if (key >= 0x30 && key <= 0x39) {
    const { setActivePlayer } = await import('./commands.ts');
    await setActivePlayer(g, key);
    return 0;
  }
  const { processCommand } = await import('./commands.ts');
  return processCommand(g, key);
}

/** DUNGEON_0e2e_MainLoop: the dungeon until the party leaves it (or dies). */
export async function dungeonLoop(g: Game, fromOutside: boolean): Promise<void> {
  const s = g.s;
  let slow = 0;
  let lastActive = 0;
  clearedRooms(g);
  const kind = s.dungeon[cellIndex(s.x, s.y, s.level)] & 0xf0;
  borders(g);
  printWalkDir(g);
  const n = s.mapId - 0x20;
  if (n === 1 || n === 4 || n === 5) {
    g.bb14 = 0x4f;
    g.bb15 = 0x45;
    s.dungeonLook = 3;
  } else {
    g.bb14 = 0x4d;
    g.bb15 = 5;
    s.dungeonLook = n === 6 || n === 7 ? 2 : 1;
  }
  if (kind === 0xa0 || kind === 0xf0) await enterRoom(g, s.dungeon[cellIndex(s.x, s.y, s.level)]);
  if (s.mapId > 0x20) {
    resetView(g, fromOutside);
    newMonster(g, fromOutside);
    refresh(g);
  }
  musicForMap(g);
  while (s.mapId > 0x20) {
    let took = 1;
    lastActive = firstActive(g);
    if (lastActive === 1) {
      commandPrompt(g);
      g.say(0x2ddd); // "Zzzzzz...\n"
      await g.p.sleep(TICK_MS * 4);
    }
    if (lastActive < 0) break;
    if (lastActive === 0) {
      if (s.icon !== 0x54 && s.icon !== 0x51) {
        slow = 1;
        passTime(g, 1);
      } else if (s.icon === 0x51) {
        slow ^= 1;
        if (slow !== 0) passTime(g, 1);
      } else {
        slow = 0;
      }
      const key = await dungeonKey(g);
      if (key > -1) took = await dungeonCommand(g, key);
    }
    if (s.mapId < 0x21) break;
    const cell = s.dungeon[cellIndex(s.x, s.y, s.level)];
    // With everyone asleep the original's loop only printed; here the creature and the waking go on meanwhile.
    if (took !== 0) await afterMove(g, cell, slow !== 0);
  }
  if (lastActive < 0) {
    const { death } = await import('./story.ts');
    await death(g);
  }
}

// --- Commands ------------------------------------------------------------------------------------------------

/** SJOG_002a: the cell one step in `dir` from (x, y), in (dx, dy). */
function stepFrom(g: Game, dir: number, x: number, y: number): void {
  const s = g.s;
  s.dx = x;
  s.dy = y;
  if (dir === 0) s.dy--;
  else if (dir === 1) s.dx++;
  else if (dir === 2) s.dy++;
  else s.dx--;
}

/** SJOG_006c: ahead, here, right or left of the facing; the cell in (dx, dy). False for Pass. */
async function lookDirection(g: Game, given: 'here' | 'ahead' | null = null): Promise<boolean> {
  const s = g.s;
  g.say(0x84e6); // "Dir-"
  // The way given already (the port's: Drink from the command menu, a Search bumped into), answered as if chosen.
  if (given === 'here') {
    g.say(0x84fa); // "Here\n"
    s.dx = s.x;
    s.dy = s.y;
    return true;
  }
  if (given === 'ahead') {
    g.say(0x84f2); // "Ahead\n"
    stepFrom(g, s.facing, s.x, s.y);
    return true;
  }
  // The port's: B backs out as the space bar passes, and a controller's player is told on the border what is asked.
  // With the whole-level map up the d-pad points by the compass, as it walks, and A is Here.
  const compass = byCompass(g);
  const hint = g.options.input === 'controller';
  if (hint) borderTitle(g, 'Which way?');
  let k: number;
  const ways: number[] = [K.Space, K.Escape, K.Up, K.Down, K.Right, K.Left, ...(compass ? [K.Enter] : [])];
  while (!ways.includes((k = await getChar(g))));
  if (hint) clearBorderTitle(g);
  if (compass && k !== K.Space && k !== K.Escape) {
    if (k === K.Enter) {
      g.say(0x84fa); // "Here\n"
      s.dx = s.x;
      s.dy = s.y;
      return true;
    }
    const heading = ([K.Up, K.Right, K.Down, K.Left] as number[]).indexOf(k);
    g.say([0xa2a6, 0xa2bc, 0xa2ae, 0xa2b6][heading]); // "North\n" "East\n" "South\n" "West\n"
    stepFrom(g, heading, s.x, s.y);
    return true;
  }
  switch (k) {
    case K.Space:
    case K.Escape:
      g.say(0x84ec); // "Pass\n"
      g.cancelled = true;
      return false;
    case K.Up:
      g.say(0x84f2); // "Ahead\n"
      stepFrom(g, s.facing, s.x, s.y);
      break;
    case K.Down:
      g.say(0x84fa); // "Here\n"
      s.dx = s.x;
      s.dy = s.y;
      break;
    case K.Right:
      g.say(0x8500); // "Right\n"
      stepFrom(g, (s.facing + 1) % 4, s.x, s.y);
      break;
    case K.Left:
      g.say(0x8508); // "Left\n"
      stepFrom(g, (s.facing + 3) % 4, s.x, s.y);
      break;
  }
  return true;
}

/** What Look calls each kind of cell (its high nibble), where it has no words of its own below. */
const SEEN = [
  0x7618, 0x7624, 0x7634, 0x7644, 0x7650, 0x7662, 0x7670, 0x7678, 0x7688, 0x769a, 0x76ac, 0x76bc, 0x76c6, 0x76d6, 0x76e0, 0x76f0,
];

/**
 * What Look says of cell `c` (DNGLOOK_0000), after "You see:": the message's address. `look` is the dungeon's kind of
 * rubble (Save.dungeonLook's low bits: 1 stalactites, 2 caved in passages, else remains), `pirate` the one roll in 255
 * that makes those remains a software pirate's.
 */
export function dungeonSight(c: number, look: number, pirate = false): number {
  if (c === 0x61) c = 0;
  if ((c & 0xf0) === 0x80) return { 0x80: 0x754c, 0x81: 0x755c, 0x82: 0x7572, 0x83: 0x7584 }[c] ?? 0x7598;
  if ((c & 0xf0) === 0xc0) {
    if (look === 1) return 0x75aa; // "a dripping stalactite.\n"
    if (look === 2) return 0x75c2; // "a caved in passage.\n"
    return pirate ? 0x75d8 : 0x75fa; // "an unfortunate software pirate.\n" "a less fortunate adventurer.\n"
  }
  return SEEN[c >> 4];
}

/** DNGLOOK_0000_LookCmdInDungeon: Look in a direction; a fountain may be drunk from. */
export async function lookInDungeon(g: Game): Promise<number> {
  const s = g.s;
  const drink = g.drinkPreset; // Drink, from the command menu (below)
  g.drinkPreset = null;
  const who = await whoActs(g);
  if (who === -1) return 1;
  if (s.d58a7 === 0 && s.d58a6 === 0) {
    g.say(0x752e); // "You see:\ndarkness.\n"
    return 1;
  }
  // Drink, from the command menu: the fountain's way given, as Look's answer would be, and the drink not asked.
  if (!(await lookDirection(g, drink))) return 1;
  const c = s.dungeon[cellIndex(s.dx, s.dy, s.level)];
  g.say(0x7542); // "You see:\n"
  const look = s.dungeonLook & 0xf;
  // The roll only for remains, as the original made it.
  const pirate = (c & 0xf0) === 0xc0 && look !== 1 && look !== 2 && g.random(1, 0xff) === 0xff;
  g.say(dungeonSight(c, look, pirate));
  if ((c & 0xf0) === 0x80 || (c & 0xf0) === 0xc0) return 1;
  if ((c & 0xf0) === 0x50) {
    g.say(0x7700); // "Will you drink?\n"
    let k = drink ? 0x59 : 0;
    while (k !== 0x59 && k !== 0x4e) k = await getCharYN(g);
    if (k === 0x4e) {
      g.say(0x7712); // "No.\n"
    } else {
      g.say(0x7718); // "Yes.  Gulp!\n"
      const p = s.members[who];
      if (c === 0x50) {
        g.say(0x7726); // "Cured!\n"
        p.status = Status.Good;
      } else if (c === 0x51) {
        g.say(0x772e); // "Healed!\n"
        p.hp = p.maxHp;
      } else if (c === 0x52) {
        g.say(0x7738); // "Poisoned!\n"
        p.status = Status.Poisoned;
      } else {
        g.say(0x7744); // "Bad taste.\n"
        await damageMember(g, who, g.random(0, 7));
      }
      drawVitals(g);
    }
  }
  return 1;
}

/**
 * How long what a search turns up - a skeleton crumbled, a hidden door - takes to dissolve into the view, in
 * milliseconds: quicker than the intro's pace the dissolve otherwise keeps (some three seconds for the view).
 */
const SEARCH_REVEAL_MS = 1000;

/** SJOG_0646_SearchInDungeon: Search a direction: traps found by dexterity, hidden doors and pits revealed. */
export async function searchInDungeon(g: Game): Promise<void> {
  const s = g.s;
  const bumped = g.searchAhead; // walked into what stands in the way (move, below): searched, the way not asked
  g.searchAhead = false;
  let who = await whoActs(g);
  if (++who === 0) return;
  if (s.d58a7 === 0 && s.d58a6 === 0) {
    g.say(0x86de); // "\nYou find:\ndarkness.\n"
    return;
  }
  if (!(await lookDirection(g, bumped ? 'ahead' : null))) return;
  const i = cellIndex(s.dx, s.dy, s.level);
  const c = s.dungeon[i];
  // The original reads the next member's dexterity (its index counted from 1); past the last it reads the one after.
  const dex = s.members[Math.min(who, 5)].dex;
  const odds = (s.level * 2 - dex + 0x1e) >> 1;
  g.say(0x86f4); // "You find:\n"
  const reveal = async (): Promise<void> => {
    const fx = g.p.fx;
    // The view dissolves into the new one, as 1988's does. With the whole-level map up in the view's place, the map
    // does, over the same square and so in the same time - only what changed (the cell searched) changing - and the
    // small view beside it in step: the screen drawn anew and put on page 1, the old put back, and the new dissolved in.
    if (byCompass(g)) {
      const old = fx.keepScreen?.();
      refresh(g);
      if (!old) return;
      fx.transfer(0, 1, 0, 0, 319, 199);
      old();
      await fx.reveal(8, 8, 0xb7, 0xb7, smallView(g) ?? undefined, SEARCH_REVEAL_MS);
      return;
    }
    drawDungeon(g, true);
    if (g.options.tileSet === 'standard' && fx.transferScaled) {
      // The Standard look's view is grown to the map's square: grown so on page 1 itself, where the dissolve takes
      // it from.
      fx.transferScaled(1, 1, 0x10, 0xe, 0xaf, 0xb2, 8, 8, SQUARE, SQUARE);
    }
    await fx.reveal(8, 8, 0xb7, 0xb7, undefined, SEARCH_REVEAL_MS);
    fx.page(0);
  };
  switch (c & 0xf0) {
    case 0x00:
      g.say(0x8700); // "Nothing of note.\n"
      break;
    case 0x10:
    case 0x20:
    case 0x30:
      g.say(0x8712); // "Nothing hidden on the ladder.\n"
      break;
    case 0x40: {
      let t: number;
      if (g.random(1, 0x1e) > odds) {
        if (c === 0x40) {
          g.say(0x8732); // "No trap\n"
          break;
        }
        t = s.level;
      } else {
        t = g.random(1, 8);
      }
      g.say(t < 4 ? 0x873c : t >= 7 ? 0x874c : 0x875c); // "A simple trap\n" "A complex trap\n" "A trap\n"
      break;
    }
    case 0x50:
      g.say(0x8764); // "Nothing hidden on the fountain.\n"
      break;
    case 0x60:
      if (c === 0x60)
        g.say(0x8786); // "Nothing hidden\nin the pit.\n"
      else if (c === 0x61) {
        g.say(0x87a2); // "A pit!\n"
        s.dungeon[i] = (c & 8) + 0x60;
        if (s.level < 7) s.dungeon[cellIndex(s.dx, s.dy, s.level + 1)] |= 8;
        await reveal();
      } else if (c === 0x62) {
        if (odds < g.random(1, 0x1e)) {
          g.say(0x87aa); // "A bomb trap!\n"
          s.dungeon[i] &= 8;
        } else {
          g.say(0x87b8); // "Nothing of note.\n"
        }
      }
      break;
    case 0x70:
      g.say(0x87ca); // "Treasure!\n"
      break;
    case 0x80:
      g.say({ 0x80: 0x87d6, 0x81: 0x87e6, 0x82: 0x87fc, 0x83: 0x880e }[c] ?? 0x8822);
      break;
    case 0x90:
      g.say(0x8834); // "This tile is impossible.\n"
      break;
    case 0xa0:
      g.say(0x884e); // "Nothing hidden on the door.\n"
      break;
    case 0xb0:
      g.say(0x886c); // "Nothing hidden on the wall.\n"
      break;
    case 0xc0:
      switch (s.dungeonLook & 0xf) {
        case 2:
          g.say(0x888a); // "Nothing in the caved in passage.\n"
          break;
        case 1:
          g.say(0x88ac); // "Nothing on the stalactite.\n"
          break;
        default:
          g.say(0x88c8); // "Nothing hidden on the skeleton.\n"
          g.say(0x88ea); // "It crumbles away.\n"
          s.dungeon[i] = ((c & 8) - 0x50) & 0xff;
          await reveal();
      }
      break;
    case 0xd0:
      g.say(0x88fe); // "A hidden door!\n"
      s.dungeon[i] = ((c & 8) - 0x20) & 0xff;
      await reveal();
      break;
    case 0xe0:
    case 0xf0:
      g.say(0x890e); // "Nothing hidden on the door.\n"
      break;
  }
}

/** DNGLOOK_0340: one square of the level's map (the view spreads from the party); true to spread on from it. */
function mapSquare(g: Game, seen: Uint8Array, x: number, y: number): boolean {
  const s = g.s;
  const t = g.text;
  const d = g.draw;
  if (x < 0 || x > 0x15 || y < 0 || y > 0x15) return false;
  if (seen[y * 0x20 + x] === 0) return false;
  seen[y * 0x20 + x] = 0;
  let spread = true;
  const cx = (x + s.x - 0xb) & 7;
  const cy = (y + s.y - 0xb) & 7;
  const c = s.dungeon[cellIndex(cx, cy, s.level)];
  t.moveTo(x + 1, y + 1);
  const px = x * 8 + 8;
  const py = y * 8 + 8;
  d.pen = Colour.brightWhite;
  const glyph = (font: number, fg: number, ch: number, bg = 0): void => {
    t.font = font;
    t.win.fg = fg;
    t.win.bg = bg;
    g.printChar(ch);
    t.win.bg = 0;
  };
  switch (c >> 4) {
    case 0:
      if (c & 8) glyph(0, Colour.lightGray, 0x18);
      break;
    case 1:
      glyph(1, Colour.lightGray, 0x2e);
      break;
    case 2:
      glyph(1, Colour.lightGray, 0x2d);
      break;
    case 3:
      glyph(1, Colour.lightGray, 0x2f);
      break;
    case 4:
      glyph(1, Colour.brightYellow, 0x70);
      break;
    case 5:
      d.line(px + 1, py + 4, px + 6, py + 4);
      d.line(px + 2, py + 5, px + 5, py + 5);
      d.line(px + 1, py + 6, px + 2, py + 6);
      d.line(px + 5, py + 6, px + 6, py + 6);
      d.pen = Colour.blue + 8;
      d.plot(px + 1, py + 2);
      d.plot(px + 2, py + 1);
      d.line(px + 3, py + 2, px + 4, py + 2);
      d.line(px + 3, py + 3, px + 4, py + 3);
      d.plot(px + 5, py + 1);
      d.plot(px + 6, py + 2);
      break;
    case 6:
      if (c === 96) glyph(0, Colour.lightGray, 0x19);
      else if (c === 97 || c === 105) glyph(1, Colour.lightGray, 0x71);
      else if (c === 104) glyph(0, Colour.lightGray, 0x12);
      else glyph(1, Colour.red + 8, 0x72);
      break;
    case 8: {
      const rows = [Colour.magenta, Colour.red, Colour.blue, Colour.green];
      for (let r = 0; r < 8; r++) {
        d.pen = rows[r >> 1] + 8;
        d.line(px + 1, py + r, px + 6, py + r);
      }
      break;
    }
    case 10:
    case 0xf:
      glyph(1, Colour.brightYellow, 0x73);
      break;
    case 0xb:
      if (c === 0xb0) glyph(0, Colour.brightWhite, 0x7f);
      else glyph(1, Colour.brightWhite, 0x74);
      spread = false;
      break;
    case 0xc:
      glyph(1, Colour.brightWhite, 0x75, Colour.blue);
      spread = false;
      break;
    case 0xd:
      glyph(1, Colour.brightWhite, 0x76, Colour.blue);
      spread = false;
      break;
    case 0xe:
      glyph(1, Colour.brightYellow, 0x77);
      break;
  }
  t.win.fg = Colour.brightWhite;
  t.font = 0;
  return spread;
}

/** DNGLOOK_06a8_ViewCmd: the level's map as far as passages lead, drawn in symbols around the party until a key. */
export async function dungeonView(g: Game): Promise<void> {
  const t = g.text;
  g.draw.pen = 0;
  g.draw.fill(8, 8, 0xb7, 0xb7);
  const seen = new Uint8Array(0x2e0).fill(0xff);
  seen[0x16b] = 0;
  t.select(0);
  t.moveTo(0xc, 0xc);
  t.font = 1;
  t.win.fg = Colour.green + 8;
  g.printChar(0x60);
  t.win.fg = Colour.brightWhite;
  t.font = 0;
  const queue: [number, number][] = [[0xb, 0xb]];
  const around = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  for (let q = 0; q < queue.length && q < 0x2000; q++) {
    const [x, y] = queue[q];
    for (const [dx, dy] of around) if (mapSquare(g, seen, x + dx, y + dy)) queue.push([x + dx, y + dy]);
  }
  t.select(2);
  await g.p.waitKey(() => {});
  g.draw.pen = 0;
  g.draw.fill(8, 8, 0xb7, 0xb7);
  refresh(g);
}

/** DUNGEON_1c0c: may the party go to `level` (by magic not into walls and doors; the original's test lets only open floor through). */
function canKlimbTo(g: Game, level: number, magic: boolean): boolean {
  const c = g.s.dungeon[cellIndex(g.s.x, g.s.y, level)] & 0xf0;
  return !(magic && c !== 0);
}

/** DUNGEON_1c6a_Klimb: up (-1) or down (1) a level (by ladder, or by magic); true when that leads out of the dungeon. */
export async function dungeonKlimb(g: Game, dir: number, magic: boolean): Promise<boolean> {
  const s = g.s;
  g.say(dir > 0 ? 0x6c6c : 0x6c74); // "Down!\n" : "Up!\n"
  if ((dir > 0 && s.level === 7) || (dir < 0 && s.level === 0)) return true;
  if (canKlimbTo(g, dir + s.level, magic)) {
    s.level += dir;
    s.d6602 = dir > 0 ? 5 : 4;
    newMonster(g, true);
    refresh(g);
  } else {
    g.say(0x6c7a); // "Failed!\n"
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
  }
  return false;
}

/** DUNGEON_1d08_Exit: out to Britannia (from the top) or the Underworld (from the bottom), at the dungeon's entrance. */
function dungeonExitNow(g: Game): void {
  const s = g.s;
  const loc = g.data.locations[s.mapId - 1];
  s.x = loc.x;
  s.y = loc.y;
  g.say(0x6c84); // "\nExit to "
  if (s.level !== 0) {
    s.level = 0xff;
    g.say(0x6c8e); // "Underworld!\n\n"
  } else {
    s.level = 0;
    g.say(0x6c9c); // "Britannia!\n\n"
  }
  s.mapId = 0;
}

export async function dungeonExit(g: Game): Promise<void> {
  dungeonExitNow(g);
  await Promise.resolve();
}

/** DUNGEON_1d4a_AttackCmd: attack the creature before the party: a fight in the corridor. */
export async function attackInDungeon(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x6caa); // "Attack\n"
  const x = (stepX(g)[s.facing] + s.x) & 7;
  const y = (stepY(g)[s.facing] + s.y) & 7;
  if (x !== s.actors[1].x || y !== s.actors[1].y) {
    g.say(0x6cb2); // "What?\n"
    return 0;
  }
  s.combatFlags = 2;
  corridorWalls(g);
  corridorMap(g);
  await specialMap(g, 2, s.actors[1].b5, 0);
  if (s.exitDir === 5) {
    if (s.level !== 0) s.level--;
    else dungeonExitNow(g);
  } else if (s.exitDir === 6) {
    if (s.level < 7) s.level++;
    else dungeonExitNow(g);
  }
  resetView(g, true);
  if (s.mapId !== 0) {
    newMonster(g, true);
    refresh(g);
  }
  return 0;
}

/** DUNGEON_1e10_KlimbCmd: up or down a ladder (a rope and hook up through a hole). */
export async function klimbInDungeon(g: Game): Promise<number> {
  const s = g.s;
  const c = cellAt(g, s.x, s.y) & 0xf0;
  const hole = s.dungeon[cellIndex(s.x, s.y, s.level)] & 8;
  let up = c === 0x10 || c === 0x30 || (hole !== 0 && s.grapple !== 0);
  let down = c === 0x20 || c === 0x30 || c === 0x60;
  if (up && down) {
    g.say(0x6cba); // "Klimb-U/D-"
    while (up && down) {
      switch (await upOrDown(g)) {
        case K.Up:
        case 0x55:
          down = false;
          break;
        case K.Down:
        case 0x44:
          up = false;
          break;
        case K.Space:
          g.say(0x6cc6); // "Pass\n\n"
          up = down = false;
          g.cancelled = true; // neither way (B): no turn spent, as a direction passed spends none
          break;
      }
    }
  } else if (up || down) {
    g.say(0x6cce); // "Klimb-"
  } else if (hole !== 0) {
    g.say(0x6cd6); // "Klimb-\nWith What?\n"
    return 0;
  } else {
    g.say(0x6cea); // "Klimb-what?\n"
    return 0;
  }
  if (up || down) void cue(g, up ? 'Upwards' : 'Downwards');
  if ((up && (await dungeonKlimb(g, -1, false))) || (down && (await dungeonKlimb(g, 1, false)))) dungeonExitNow(g);
  return 1;
}

/** The wait for a moment (ULTIMA_20fa) and the frames (ULTIMA_3ae6) the dungeon uses. */
export { sleepTicks };
