/**
 * look.ts
 *
 * Look and View (u5d lookobj.c): what the party sees on a square, read
 * from LOOK2.DAT; signs from SIGNS.DAT, in runes; the well that grants a
 * wish, the fountain, clocks, the night sky through the telescope, and
 * the gem's map of the surroundings.
 */

import { actorTileAt, freeActor, setActor } from './actors.ts';
import { drawVitals, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { getChar, selectDirection, selectMember, whoActs, yesNo } from './input.ts';
import { addressedAsLady, customisable, LADY } from './appearance.ts';
import { askWord, choose, restoreView } from './menu.ts';
import { WISHES } from './words.ts';
import { Status } from './save.ts';
import { damageMember, firstActive } from './time.ts';
import { T } from './tiles.ts';
import { tileAt } from './world.ts';
import { u16 } from '../data/files.ts';
import { Colour } from '../ui/colours.ts';

/** A NUL-terminated string at a byte offset of a file. */
function fileString(data: Uint8Array, at: number): string {
  let s = '';
  for (let i = at; i < data.length && data[i] !== 0 && i < at + 0x80; i++) s += String.fromCharCode(data[i]);
  return s;
}

/** LOOKOBJ_0000: a map tile's description. */
function describeTile(g: Game, tile: number): void {
  const look = g.data.files.get('LOOK2.DAT');
  g.print(fileString(look, u16(look, tile * 2)));
}

/** LOOKOBJ_06a4: an actor's description. */
function describeActor(g: Game, tile: number): void {
  const look = g.data.files.get('LOOK2.DAT');
  g.print(fileString(look, u16(look, tile * 2 + 0x200)));
  if (g.text.win.x !== 0) g.printChar('\n');
}

/** ULTIMA_6f1e: the typed wish (upper case, as typed) begins with the whole word. */
function wishIs(word: string, typed: string): boolean {
  const w = (word.length >= 9 ? word.slice(0, 8) : word).toUpperCase();
  return typed.slice(0, w.length) === w;
}

/** The two wells a wish is granted at: the one in Paws, and the one at Empath Abbey. */
const grants = (g: Game): boolean => g.s.mapId === 0x16 || g.s.mapId === 0x1f;

/** LOOKOBJ_0042: a well: drop a coin and wish (for a horse, say, in the right places). */
async function well(g: Game, x: number, y: number, z: number): Promise<void> {
  const s = g.s;
  g.say(0x720c); // "a well.\n\nDrop a coin?"
  if (!(await yesNo(g))) {
    g.say(0x7222); // "No\n"
    return;
  }
  g.say(0x7226); // "Yes\n"
  if (s.gold === 0) return;
  g.say(0x722c); // "\nThy wish?\n"
  s.gold--;
  // Only what the player has heard wished for is offered, and only at a well that could grant it - as a
  // townsman is asked only what that townsman answers. The five jokes nobody in Britannia ever says.
  const words = WISHES.map((a) => g.t(a)); // Corvette ... Horse
  const wish = (await askWord(g, 0xc, 'Wish', grants(g) ? words : [])).toUpperCase();
  if (wish.length === 0) {
    g.say(0x7238); // "Nothing\n"
    return;
  }
  if (words.some((w) => wishIs(w, wish))) {
    if (!grants(g)) {
      g.say(0x7274); // "\nNo effect...\n"
    } else {
      g.say(0x7284); // "\nPoof!\n"
      if (!g.soundOff) await g.sound.noise(10, 3000, 2000);
      setActor(g, freeActor(g), 0x10, 0x10, x + 1, y, z, 0);
    }
  } else {
    g.say(0x728c); // "\nNo effect...\n"
  }
}

/** LOOKOBJ_0162: a fountain. */
async function fountain(g: Game): Promise<void> {
  g.say(0x729c); // "a gurgling fountain!\n\n"
  g.say(0x72b4); // "Who will drink?\n"
  const who = await selectMember(g);
  if (who === -1) {
    g.say(0x72c6); // "None!\n"
    return;
  }
  const st = g.s.members[who].status;
  if (st === Status.Dead || st === Status.Sleeping)
    g.say(0x72ce); // "Incapacitated!\n\n"
  else g.say(0x72e0); // "Refreshing...\n"
}

/** LOOKOBJ_01ac: a moon in the telescope. */
function drawMoon(g: Game, x: number, y: number): void {
  const d = g.draw;
  d.pen = Colour.brightWhite;
  d.plot(x * 8 + 6, y * 8 + 8);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (x * 8 + c <= 0xb0) d.plot(x * 8 + c + 7, y * 8 + r + 7);
  if (x * 8 <= 0xad) d.plot(x * 8 + 10, y * 8 + 8);
}

/** LOOKOBJ_024c: a Shadowlord's red mark by its moon (the towne it haunts). */
function drawMark(g: Game, x: number, y: number): void {
  const d = g.draw;
  const px = x * 8;
  const py = y * 8;
  d.pen = Colour.red;
  const col = (dx: number, y1: number, y2: number, ok: boolean): void => {
    if (ok) d.line(px + dx, py + y1, px + dx, py + y2);
  };
  col(5, 10, 0xc, px > 2);
  col(6, 10, 0xc, px > 2);
  col(7, 8, 0xc, px > 2);
  col(8, 8, 0xc, px <= 0xaf);
  col(9, 6, 10, px <= 0xae);
  col(10, 6, 10, px <= 0xad);
  col(0xb, 5, 8, px <= 0xac);
  col(0xc, 5, 7, px <= 0xab);
}

/** LOOKOBJ_0366: the telescope: by day the sun (and a burn), by night the eight moons of the planets and their Shadowlords. */
export async function nightSky(g: Game): Promise<void> {
  const s = g.s;
  if (s.hour >= 6 && s.hour < 0x12) {
    g.say(0x72f0); // "the sun!\n"
    if (s.activeMember === 0xff && firstActive(g) === 0) s.activeMember = s.dx;
    await damageMember(g, s.activeMember, 1);
    drawVitals(g);
    return;
  }
  g.viewDirty = 1;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) g.view[y * 32 + x] = 0xff;
  g.view[10 * 32 + 5] = 0x59;
  const { drawView } = await import('./world.ts');
  drawView(g);
  g.draw.pen = Colour.blue + 8;
  for (let i = 0; i < 0x50; i++) g.draw.plot(g.random(9, 0xb6), g.random(9, 0xac));
  const start = g.data.bytes(0x3750, 8);
  const rows = g.data.bytes(0x3758, 8);
  const orbits = g.data.bytes(0x3760, 0xb0);
  for (let m = 0; m < 8; m++) {
    let year = s.year % 100;
    let month = s.month;
    let day = s.day;
    let pos = start[m];
    while (year > 0x27 || (year === 0x27 && month > 4) || (year === 0x27 && month === 4 && day > 5)) {
      day--;
      if (day === 0) {
        day = 0x1c;
        month--;
      }
      if (month === 0) {
        month = 0xd;
        year--;
      }
      do {
        pos--;
        if (pos < 0) pos = 0x15;
      } while (orbits[m * 0x16 + pos] === 0);
    }
    drawMoon(g, pos + 1, rows[m]);
    for (let k = 0; k < 3; k++) if (s.shadowlords[k] === m + 1) drawMark(g, pos, rows[m]);
  }
  g.say(0x72fa); // "the night sky! "
  await g.p.waitKey(() => undefined);
}

/** LOOKOBJ_0502: a map tile: conveyor belts are followed; telescope, well, fountain; else its description (the time for a clock). */
async function lookAtTile(g: Game, tile: number, x: number, y: number): Promise<void> {
  const s = g.s;
  while (tile === T.E0 || tile === T.E1 || tile === T.E2) {
    if (tile === T.E0) y--;
    else if (tile === T.E1) x++;
    else x--;
    tile = tileAt(g, x, y);
  }
  if (tile === T.T59) {
    await nightSky(g);
    return;
  }
  if (tile === T.Well) {
    await well(g, s.x, s.y, s.level);
    return;
  }
  if ((tile & 0xfc) === T.Fountain) {
    await fountain(g);
    return;
  }
  describeTile(g, tile);
  if ((tile & 0xfe) === T.Clock) {
    let h = s.hour % 0xc;
    if (h === 0) h = 0xc;
    g.printNumber(h);
    g.printChar(':');
    g.printNumber(s.minute, 2, '0');
    g.say(s.hour > 0xb ? 0x730a : 0x7310); // " PM.\n" : " AM.\n"
  } else if (tile === T.DE) {
    const name: Record<number, number> = { 0x1e: 0x7316, 0x1f: 0x731e, 0x20: 0x7324 }; // Truth, Love, Courage
    if (name[s.mapId]) g.say(name[s.mapId]);
  } else if (tile === T.DF) {
    const name: Record<number, number> = {
      0xf0: 0x732e,
      0x5b: 0x7336,
      0x48: 0x7340,
      0x7e: 0x734a,
      0x9c: 0x7352,
      0x3a: 0x735c,
      0xef: 0x7364,
      0x80: 0x736e,
    };
    if (name[x & 0xff]) g.say(name[x & 0xff]); // Deceit ... Doom
  } else if (g.text.win.x !== 0) {
    g.printChar('\n');
  }
}

/** LOOKOBJ_06f8: print a sign's text from the scratch copy of SIGNS.DAT (-1: the Eight Laws). */
export async function printSign(g: Game, buf: Uint8Array, at: number): Promise<void> {
  const t = g.text;
  if (at === -1) {
    t.font = 1;
    g.say(0x742a);
    g.say(0x745e);
    t.font = 0;
    return;
  }
  for (at += 4; buf[at] === 0x0a; at += 6);
  const runes = g.data.table(0x3810, 9);
  do {
    const c = buf[at];
    t.font = c & 0x80 ? 0 : 1;
    if (c === 0x26 || c === 0x27) {
      g.printChar(0x6c);
    } else if (c >= 0x29 && c <= 0x31) {
      t.font = 1;
      for (const ch of runes[c - 0x29]) g.printChar(ch.charCodeAt(0));
    } else if (c === 0x0d) {
      t.font = 0;
      await getChar(g);
    } else {
      g.printChar(c & 0x7f);
    }
  } while (buf[++at] !== 0);
  t.font = 0;
  if (t.win.x !== 0) g.printChar('\n');
}

/** LOOKOBJ_07e4: the sign at (x, y) on this level; in Britain's jail, the party's wanted poster. */
export async function readSign(g: Game, z: number, x: number, y: number): Promise<void> {
  const s = g.s;
  const t = g.text;
  if (s.mapId === 4 && z === 0 && x === 0x11 && y === 0x15) {
    t.font = 1;
    g.say(0x7492);
    t.font = 0;
    g.say(0x74a8); // "Wanted:   "
    t.font = 1;
    g.say(0x74b4);
    t.moveTo(0xe, t.win.y);
    g.say(0x74b8);
    for (let i = 0; i < 3; i++) {
      if (i < s.partySize) {
        t.font = 0;
        const name = s.members[i].name;
        t.moveTo(7 - Math.trunc(name.length / 2), t.win.y);
        g.print(name);
        t.font = 1;
      }
      t.moveTo(0xe, t.win.y);
      g.say(0x74bc);
    }
    t.moveTo(0xe, t.win.y);
    g.say(0x74c0);
    t.font = 0;
    g.say(0x74c4); // "Dead or Alive"
    t.font = 1;
    g.say(0x74d2);
    t.font = 0;
    return;
  }
  const signs = g.data.files.get('SIGNS.DAT');
  const start = u16(signs, s.mapId * 2);
  if (start === 0) {
    await printSign(g, new Uint8Array(0), -1);
    return;
  }
  const buf = new Uint8Array(3000).fill(0xff);
  buf.set(signs.subarray(start, start + 3000));
  let at = 0;
  for (;;) {
    if (buf[at + 1] === z && buf[at + 2] === (x & 0xff) && buf[at + 3] === (y & 0xff)) {
      await printSign(g, buf, at);
      return;
    }
    at += 4;
    while (at < 3000 && buf[at++] !== 0);
    if (at >= 3000) {
      await printSign(g, buf, -1);
      return;
    }
  }
}

/** LOOKOBJ_099c: Look. */
export async function lookCommand(g: Game): Promise<number> {
  const s = g.s;
  if (!(await selectDirection(g))) return 1;
  const x = s.x + s.dx;
  const y = s.y + s.dy;
  const tile = tileAt(g, x, y);
  const actor = actorTileAt(g, x, y, s.level);
  if (tile === T.T29) {
    const who = await whoActs(g);
    if (who === -1) return 1;
    if (s.members[who].int <= g.random(1, 0x1e)) {
      g.say(0x74fa); // "Death vision!\n"
      await damageMember(g, who, 1);
      drawVitals(g);
      return 1;
    }
    g.say(0x750a); // "Strange vision!\n"
    await viewGem(g, s.x, s.y);
    return 1;
  }
  g.say(0x751c); // "\nThou dost see\n"
  if (actor !== 0) {
    describeActor(g, actor);
    return 1;
  }
  switch (tile) {
    case T.T89:
    case T.T8A:
    case T.A0:
    case T.A4:
    case T.SignF8:
      g.say(0x752c); // "\n"
      await readSign(g, s.level, x, y);
      break;
    default:
      await lookAtTile(g, tile, x, y);
      // A mirror, out of a fight, in the tiles that draw the Avatar as the player made it: the Appearance screen - for
      // whoever of the party the player chooses to see in it, where there is more than the Avatar (a companion's
      // colours, companions.ts) - its Done or B leaving them as they were.
      // (The map itself never holds the reflecting mirror, 0x9e - it is only ever the view's, over a 0x9d with someone
      // below it - so tileAt gives the plain one; the reflecting one is kept here for a map given it, as the tests do.)
      if ((tile === T.Mirror || tile === T.Mirror9E) && s.mapId < 0x80 && customisable(g)) {
        const { chooseAppearance } = await import('./appearanceMenu.ts');
        const party = Array.from({ length: s.partySize }, (_, m) => ({ label: s.members[m].name }));
        const m = party.length > 1 ? await choose(g, 'Whose reflection?', party, 0, true) : 0;
        if (m === 0) {
          const look = await chooseAppearance(g, g.appearance);
          if (look) {
            g.appearance = look;
            g.draw.avatar?.(look, addressedAsLady(g));
          }
        } else if (m > 0) {
          const { companionLook, figureOf } = await import('./companions.ts');
          const who = { name: s.members[m].name, base: figureOf(g, m), lady: s.members[m].gender === LADY };
          const look = await chooseAppearance(g, companionLook(g, m), who);
          if (look) g.companionLooks.set(who.name, look);
        }
        // The Appearance screen drew over the whole screen: the map and the stats drawn again.
        await restoreView(g);
      }
  }
  return 1;
}

// --- The gem's view ------------------------------------------------------------------

/** LOOKOBJ_0f7e and its helpers: one tile of the map drawn as a 4x4 symbol at (px, py). */
function viewSymbol(g: Game, tile: number, px: number, py: number): void {
  const d = g.draw;
  const green = Colour.green + 8;
  const blue = Colour.blue + 8;
  const white = Colour.brightWhite;
  const x = px;
  const y = py;
  const dots = (c: number, pts: number[][]): void => {
    d.pen = c;
    for (const [a, b] of pts) d.plot(x + a, y + b);
  };
  const lines = (c: number, ls: number[][]): void => {
    d.pen = c;
    for (const [a, b, e, f] of ls) d.line(x + a, y + b, x + e, y + f);
  };
  const box = (c: number): void => {
    d.pen = c;
    d.fill(x, y, x + 3, y + 3);
  };
  const shrub = (): void =>
    dots(green, [
      [1, 0],
      [1, 2],
      [3, 1],
      [3, 3],
    ]);
  switch (g.data.bytes(0x1d1a, 0x100)[tile]) {
    case 1:
      shrub();
      break;
    case 2:
      box(green);
      break;
    case 3:
      box(Colour.red);
      break;
    case 4:
      lines(white, [
        [0, 0, 3, 0],
        [0, 3, 3, 3],
      ]);
      break;
    case 5:
      lines(white, [
        [1, 1, 2, 1],
        [1, 2, 2, 2],
      ]);
      break;
    case 6:
      lines(white, [
        [0, 0, 3, 0],
        [0, 3, 3, 3],
        [0, 1, 0, 2],
        [3, 1, 3, 2],
      ]);
      break;
    case 7:
    case 90:
      box(white);
      break;
    case 8:
      lines(Colour.brightYellow, [
        [0, 0, 1, 0],
        [0, 1, 1, 1],
        [2, 2, 3, 2],
        [2, 3, 3, 3],
      ]);
      break;
    case 9:
      lines(green, [
        [0, 0, 3, 0],
        [0, 2, 3, 2],
      ]);
      dots(green, [
        [2, 1],
        [0, 3],
      ]);
      break;
    case 10: {
      const shore = g.data.bytes(0x3822, 16);
      const c = [0, 0, 0, 0];
      let bit = 8;
      for (let i = 0; i < 4; i++) {
        c[i] = (tile & 0xf0) === 0x60 && (shore[tile & 0xf] & bit) === 0 ? green : blue;
        bit >>= 1;
      }
      dots(c[0], [[1, 0]]);
      dots(c[1], [[3, 1]]);
      dots(c[2], [[1, 2]]);
      dots(c[3], [[3, 3]]);
      break;
    }
    case 11:
      dots(blue, [
        [0, 0],
        [2, 2],
      ]);
      break;
    case 12:
      dots(blue, [[2, 2]]);
      break;
    case 13:
      dots(green, [
        [1, 0],
        [3, 1],
      ]);
      dots(blue, [
        [0, 2],
        [2, 3],
      ]);
      break;
    case 14:
      lines(white, [
        [1, 0, 1, 3],
        [2, 0, 2, 3],
      ]);
      break;
    case 15:
      box(blue);
      break;
    case 16: {
      shrub();
      d.pen = Colour.red;
      d.fill(x + 1, y + 1, x + 2, y + 2);
      const walls = g.data.bytes(0x3832, 8)[tile - 0x20];
      if (walls & 8) d.line(x + 1, y, x + 2, y);
      if (walls & 4) d.line(x + 3, y + 1, x + 3, y + 2);
      if (walls & 2) d.line(x + 1, y + 3, x + 2, y + 3);
      if (walls & 1) d.line(x, y + 1, x, y + 2);
      d.pen = 0;
      const hole: Record<number, [number, number]> = { 0x22: [1, 2], 0x23: [1, 1], 0x24: [2, 1], 0x25: [2, 2] };
      if (hole[tile]) d.plot(x + hole[tile][0], y + hole[tile][1]);
      break;
    }
  }
}

/** LOOKOBJ_10fc_ViewCmd: the 32x32 squares around the party drawn small; the party's square flashes until a key. */
export async function viewGem(g: Game, x: number, y: number): Promise<void> {
  const s = g.s;
  x = (x - s.chunkX) & 0xff;
  y = (y - s.chunkY) & 0xff;
  g.draw.pen = 0;
  g.draw.fill(8, 8, 0xb7, 0xb7);
  for (let r = 0; r < 0x20; r++) {
    for (let c = 0; c < 0x20; c++) viewSymbol(g, tileAt(g, s.chunkX + c, s.chunkY + r), c * 4 + 0x20, r * 4 + 0x20);
  }
  const px = x * 4 + 0x20;
  const py = y * 4 + 0x20;
  let n = 0;
  await g.p.waitKey(() => {
    if (++n === 4) {
      n = 0;
      g.draw.invert(px, py, px + 3, py + 3);
    }
  });
  updateFrame(g);
}
