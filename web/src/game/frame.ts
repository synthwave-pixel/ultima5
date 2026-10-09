/**
 * frame.ts
 *
 * One frame of the DOS game (ULTIMA_5910_UpdateFrame) and what is drawn
 * around the map: the stats window (ULTIMA_2900), the moons and sun on
 * the top border (ULTIMA_4a84), the winds on the bottom border
 * (ULTIMA_2e96), and the actors', tiles', moongates' and lighthouse
 * beams' animation.
 */

import { Colour } from '../ui/colours.ts';
import { Ctl } from '../ui/text.ts';
import { revealView } from './fog.ts';
import { Game } from './game.ts';
import { isCaster, restedMp } from './rest.ts';
import { earnedLevel, type Member, Status } from './save.ts';
import { T } from './tiles.ts';
import { animateParty, buildLightMap, buildView, drawView, overlayActors, tileAt, tileCell, viewAt } from './world.ts';

export const Win = { screen: 0, stats: 1, messages: 2 } as const;

// --- Actor and tile animation ---------------------------------------------------

/**
 * ULTIMA_4552_AnimateActors: each actor steps through its animation script, then the tiles animate - the tiles alone
 * where `figures` is false (a pass of the key-wait loop the figures sit out, input.ts), the figures alone where `tiles`
 * is (a frame of the title's scenes the water sits out, intro.ts).
 */
export function animateActors(g: Game, figures = true, tiles = true): void {
  const scripts = g.data.animScripts();
  for (const a of figures ? g.s.actors : []) {
    if (a.tile === 0) continue;
    let delay = a.b6 & 0xf;
    let pos = a.b6 >> 4;
    const base = a.tile & 0xfc;
    if (delay === 0xf) continue;
    if (delay !== 0) {
      delay--;
      a.b6 = (a.b6 & 0xf0) + delay;
      continue;
    }
    if (a.anim === 0 || a.anim === 0x1d || a.anim === 0x1e) continue;
    if (base <= 0x33 || base === 0xe8 || base === 0xb4) continue;
    if (base !== 0x5c && base !== 0xa8 && g.random(0, 0xff) < 0x80) continue;
    const script = scripts[((base - 0x34) >> 2) + 0xb0] * 0x10;
    let done = false;
    do {
      const op = scripts[script + pos];
      switch (op) {
        case 1:
        case 2:
        case 3:
        case 4:
          a.anim = base + op - 1;
          pos++;
          done = true;
          break;
        case 5:
          if (g.random(0, 0xff) < 0x40) {
            a.anim = a.tile;
            if (base === 0x5c) pos++;
            else delay = 6;
            done = true;
          } else {
            pos++;
          }
          break;
        case 6:
          if (g.random(0, 0xff) >= 0xc0) pos++;
          else pos = 0;
          break;
        case 0:
          pos = 0;
          break;
        case 7:
          pos = 2;
          break;
        default:
          delay = op + 0x80;
          pos++;
          done = true;
          break;
      }
      a.b6 = (pos * 0x10 + delay) & 0xff;
    } while (!done);
  }
  if (tiles) animateTiles(g);
}

/** ULTIMA_44b8 and ULTIMA_6fd6: the tile cycles and the driver's tileset effects. */
export function animateTiles(g: Game): void {
  g.cycles.step();
  g.p.animateTiles();
}

// --- Moongates and moonstones ---------------------------------------------------

/** ULTIMA_4702: moonstone `i` is buried in the map in memory. */
function moonstoneHere(g: Game, i: number): boolean {
  const s = g.s;
  if (s.moonstoneHeld[i] !== s.mapId || s.moonstoneZ[i] !== s.level) return false;
  if (s.mapId !== 0) return true;
  return ((s.moonstoneX[i] - s.chunkX) & 0xff) < 0x20 && ((s.moonstoneY[i] - s.chunkY) & 0xff) < 0x20;
}

/** ULTIMA_475a: moongates rise over buried moonstones at night and sink by day. */
export function moongates(g: Game): void {
  const s = g.s;
  let tile: number = T.Moongate;
  if (s.hour >= 0x14 || s.hour < 5) {
    s.moongateHeight = Math.min(s.moongateHeight + 1, 0x10);
  } else {
    s.moongateHeight = Math.max(s.moongateHeight - 1, 0);
    if (s.moongateHeight === 0) tile = T.Grass;
  }
  for (let i = 0; i < 8; i++) {
    if (!moonstoneHere(g, i)) continue;
    const [b, at] = tileCell(g, s.moonstoneX[i], s.moonstoneY[i]);
    const changed = b[at] !== tile;
    b[at] = tile;
    g.viewDirty |= 2;
    if (changed) buildLightMap(g);
  }
}

// --- Lighthouses ----------------------------------------------------------------

/** ULTIMA_7040: light (or unlight) one step of a lighthouse's beam in the light map. */
function beam(g: Game, step: number, on: boolean, x: number, y: number): void {
  const pts = g.data.sbytes(0x1f7e + (step % 0x10) * 0x20, 0x20);
  for (let i = 0; i < 16; i++) {
    const at = (pts[i * 2 + 1] + y) * 0x20 + pts[i * 2] + x;
    if (at >= 0 && at < 0x400) g.combatMap[at] = on ? 0xff : 0;
  }
}

/** ULTIMA_70a6: the lighthouse beams sweep round at night. */
export function sweepLighthouses(g: Game): void {
  const l = g.lighthouse;
  if (g.s.light >= 0x32 || l.x1 === -1) {
    l.step = 0xff;
    return;
  }
  g.viewDirty = 1;
  if (l.step === 0xff) {
    l.step = 0;
    for (const n of [0, 1, 2]) {
      beam(g, n, true, l.x1, l.y1);
      if (l.x2 !== -1) beam(g, n, true, l.x2, l.y2);
    }
  } else {
    beam(g, l.step, false, l.x1, l.y1);
    if (l.x2 !== -1) beam(g, l.step, false, l.x2, l.y2);
    l.step++;
    beam(g, l.step + 2, true, l.x1, l.y1);
    if (l.x2 !== -1) beam(g, l.step + 2, true, l.x2, l.y2);
  }
  if (l.step > 0xf) l.step = 0;
}

// --- Wind -----------------------------------------------------------------------

/** ULTIMA_2e96_SetWindDirection: set the wind (unless -1) and show it on the bottom border. */
export function setWind(g: Game, dir: number): void {
  const s = g.s;
  if (dir !== -1) {
    s.wind = dir;
    s.sailTurns = 0;
  }
  // The Standard look shows the wind with the date, and only at sea (drawBottomLine).
  if (g.options.tileSet === 'standard') return drawBottomLine(g);
  if (s.mapId >= 0x21 || s.mapId === 0x19) return;
  if (s.level < 0x80) {
    const t = g.text;
    const was = t.current;
    t.select(Win.screen);
    t.moveTo(6, 0x17);
    leftArrow(g);
    // "Calm ", "North", "South", "East ", "West ", then " Winds"
    g.say([0x555c, 0x5562, 0x5568, 0x556e, 0x5574][s.wind] ?? 0x555c);
    g.say(0x557a);
    rightArrow(g);
    void was;
    t.select(Win.messages);
  } else {
    g.draw.pen = Colour.brightWhite;
    g.draw.line(0x30, 0xb8, 0x98, 0xb8);
    g.draw.pen = Colour.blue;
    g.draw.fill(0x30, 0xb9, 0x98, 0xbf);
  }
}

/** ULTIMA_2f62: now and then the wind changes, calm less often than not. */
export function shiftWind(g: Game): void {
  if (g.random(0, 0x3f) !== 0) return;
  let dir: number;
  while ((dir = g.random(0, 4)) === 0 && g.random(0, 0xff) < 0xc0);
  setWind(g, dir);
}

// --- Border decorations ---------------------------------------------------------

/**
 * The command prompt at the head of a turn: the arrow, on a line of its own. The 1988 game began it with a newline
 * wherever the cursor stood, so every turn left an empty line under it; here a new line only where the last did not
 * end with one (the port's). The turn before it becomes the one the next may fold into (text.ts endTurn).
 */
export function commandPrompt(g: Game): void {
  const t = g.text;
  t.select(Win.messages);
  if (t.win.x !== 0) g.printChar('\n');
  t.endTurn();
  leftArrow(g);
}

/** ULTIMA_4c2a: the border's left-pointing cap before a label. */
export function leftArrow(g: Game): void {
  capArrow(g, 2);
}

/** ULTIMA_4cce: the cap after it. */
export function rightArrow(g: Game): void {
  capArrow(g, 1);
}

/** A cap in the border's blue, its white joining lines drawn by the screen with it (text.ts printCap). */
function capArrow(g: Game, side: number): void {
  const w = g.text.win;
  const fg = w.fg;
  const bg = w.bg;
  w.fg = Colour.blue;
  w.bg = 0;
  g.text.printCap(side);
  w.fg = fg;
  w.bg = bg;
}

/** ULTIMA_4a84: the sun and the two moons along the top border, by the hour; sets today's phases. */
export function drawMoons(g: Game): void {
  const s = g.s;
  if (s.mapId >= 0x21) return;
  const row = Array<number>(12).fill(0x20);
  let i = 17 - s.hour;
  if (i < 12 && i >= 0) row[i] = 0x2a;
  const phases = g.data.moonPhases();
  s.trammel = phases[(s.day - 1) * 2];
  i = 8 - s.hour;
  if (i < -12) i += 24;
  if (i < 12 && i >= 0) row[i] = s.trammel;
  s.felucca = phases[(s.day - 1) * 2 + 1];
  i = 2 - s.hour;
  if (i < -12) i += 24;
  if (i < 12 && i >= 0) row[i] = s.felucca;
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  t.font = 1;
  t.moveTo(6, 0);
  if (s.mapId !== 0x19 && s.level < 0x80) {
    const fg = t.win.fg;
    for (const c of row) {
      t.win.fg = c === 0x2a ? Colour.brightYellow : Colour.lightGray;
      g.printChar(c);
    }
    t.win.fg = fg;
  } else {
    g.draw.pen = Colour.blue;
    g.draw.fill(0x28, 0, 0x98, 6);
    g.draw.pen = Colour.brightWhite;
    g.draw.line(0x28, 7, 0x98, 7);
  }
  t.select(was);
  t.font = 0;
}

/**
 * The map's top border's middle: the cells the place's name and the sky take (drawMapName, drawMoons, 5 to 18) - a
 * dungeon's level among them - which "Auto" is given whole (autoTitle).
 */
const SKY_CELLS = [5, 18];

/**
 * "Auto" centred on the map's top border while auto combat plays a turn (the port's): the border's middle made plain
 * chrome under it - the sky a fight out of doors shows there (whose redrawing each round waits meanwhile, combat.ts),
 * or a dungeon's level - and "Auto" in its caps in the middle. Taken down (`on` false), what was there is drawn again:
 * the place's name line and its sun and moons, or the dungeon's level.
 */
export function autoTitle(g: Game, on: boolean): void {
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  const [c1, c2] = SKY_CELLS;
  t.clearArea(c1, 0, c2, 0);
  const d = g.draw;
  d.pen = Colour.blue;
  d.fill(c1 * 8, 0, c2 * 8 + 7, 6);
  d.pen = Colour.brightWhite;
  d.line(c1 * 8, 7, c2 * 8 + 7, 7);
  const s = g.s;
  if (on) {
    t.moveTo(9, 0);
    leftArrow(g);
    g.print('Auto');
    rightArrow(g);
  } else {
    // Where the fight is fought - the place it was entered from - or, the fight over, where the party is.
    const place = s.mapId === 0xff ? s.savedMapId : s.mapId;
    if (place < 0x21) {
      const map = s.mapId;
      s.mapId = place;
      drawMapName(g);
      drawMoons(g);
      s.mapId = map;
    } else if (place < 0x29) {
      // A dungeon's level, as its view puts it on the border (dungeon.ts borders, printWalkDir).
      t.moveTo(10, 0);
      leftArrow(g);
      g.print(`L${s.level + 1}`);
      rightArrow(g);
    }
  }
  t.select(was);
}

/** ULTIMA_4be8: the map's name on the top border. */
export function drawMapName(g: Game): void {
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  if (g.s.mapId !== 0x19 && g.s.level < 0x80) {
    t.moveTo(5, 0);
    leftArrow(g);
    g.print(g.mapName);
    rightArrow(g);
  }
  t.select(was);
}

/** ULTIMA_4e50: a title centred on the stats window's top border, e.g. "Select:". */
export function borderTitle(g: Game, title: string): void {
  const left = -(Math.trunc(title.length / 2) - 30);
  const right = title.length + left + 2;
  const d = g.draw;
  d.pen = Colour.blue;
  d.fill(192, 0, left * 8, 6);
  d.fill(right * 8, 0, 311, 6);
  d.pen = Colour.brightWhite;
  d.line(192, 7, left * 8, 7);
  d.line(right * 8, 7, 311, 7);
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  t.moveTo(left, 0);
  leftArrow(g);
  g.print(title);
  rightArrow(g);
  t.select(was);
}

/** ULTIMA_4e20: clear that title - to the regalia worn, in the Standard look, where the party box's top border names it. */
export function clearBorderTitle(g: Game): void {
  g.text.clearArea(24, 0, 38, 0); // the last title's letters forgotten, then the border painted over them
  g.draw.pen = Colour.blue;
  g.draw.fill(0xc0, 0, 0x137, 6);
  g.draw.pen = Colour.brightWhite;
  g.draw.line(0xc0, 7, 0x137, 7);
  const title = partyTitle(g);
  g.partyTitle = title;
  if (title) borderTitle(g, title);
}

/**
 * What the party box's top border names (the Standard look): a name set over all else (Game.panelTitle - the member
 * Ready's list is for), or the numbers the panel shows beside the names when they are not hit points - Mana (the
 * command menu's bar on Cast or Mix, a spell list open) or XP (on Ztats) - else the regalia worn. The EGA look names
 * nothing there.
 */
function partyTitle(g: Game): string {
  if (g.options.tileSet !== 'standard') return '';
  if (g.panelTitle) return g.panelTitle;
  if (g.panelMana) return 'Mana';
  if (g.panelXp) return 'XP';
  return REGALIA[g.regalia] ?? '';
}

/** The regalia by the slot's code (Game.regalia), as the party box's top border names them. */
const REGALIA: Record<number, string> = { 0x0e: 'Amulet', 0x1c: 'Crown', 0x1d: 'Black Badge' };

/** A lasting spell by its letter (Save icon), as the band under the party names it in the Standard look. */
const EFFECTS: Record<number, string> = {
  0x50: 'Protection',
  0x51: 'Quickness',
  0x43: 'Confusion',
  0x4e: 'Negate Magic',
  0x54: 'Time Stop',
};

// --- The Standard look's panel (the port's) ------------------------------------------------------------

/**
 * The Standard look's party panel at its own height: the party, then food and gold straight under it; the lasting
 * spell named on the band beneath, with its turns; the regalia worn on the party box's top border; the date - and at
 * sea the wind - on the map's bottom border. The log gains the rows the 1988 panel's second box took. While a screen
 * that needs all nine rows is up (Ztats, a list of arms or items), the panel is its 1988 height again (layout.ts).
 */
export const compactPanel = (g: Game): boolean => g.options.tileSet === 'standard' && g.panelFull === 0;

/** The right-hand column's frame, at the panel's height: the party box, the band under it, the log's top edge. */
export function drawColumn(g: Game): void {
  const d = g.draw;
  const compact = compactPanel(g);
  const band = compact ? 64 : 80; // the band's top: the party box's bottom, or the 1988 second box's
  d.pen = Colour.black;
  d.fill(192, 8, 319, 87);
  d.pen = Colour.blue;
  d.fill(313, 0, 319, band + 7);
  d.fill(192, band, 312, band + 7);
  if (!compact) d.fill(192, 0x39, 312, 63);
  d.pen = Colour.brightWhite;
  d.line(191, 191, 191, band + 7);
  d.line(191, band + 7, 319, band + 7);
  const bottom = compact ? 64 : 56;
  d.line(191, 7, 312, 7);
  d.line(312, 7, 312, bottom);
  d.line(312, bottom, 191, bottom);
  d.line(191, bottom, 191, 7);
  if (!compact) {
    d.line(191, 63, 312, 63);
    d.line(312, 63, 312, 80);
    d.line(312, 80, 191, 80);
    d.line(191, 80, 191, 63);
  }
}

/**
 * The party panel's and the log's text windows: the panel's at its height; the log's from row 9 in the Standard look
 * - where the full-height panel lies over its top rows as an overlay, the window unmoved (layout.ts) - and 11 in 1988's.
 */
export function panelWindows(g: Game): void {
  g.text.setWindow(Win.stats, 0x18, 1, 0x27, compactPanel(g) ? 7 : 9);
  g.text.setWindow(Win.messages, 0x18, g.options.tileSet === 'standard' ? 9 : 0xb, 0x27, 0x17);
}

/** The band under the party (Standard): the lasting spell in force, by name, and the turns it has left. */
function drawBand(g: Game): void {
  const s = g.s;
  const d = g.draw;
  g.text.clearArea(24, 8, 39, 8); // the last label's letters forgotten, then the band painted over them
  d.pen = Colour.blue;
  d.fill(192, 65, 319, 70);
  d.pen = Colour.brightWhite;
  d.line(191, 64, 312, 64);
  d.line(191, 71, 319, 71);
  const name = EFFECTS[s.icon];
  if (!name) return;
  const label = s.protection !== 0 && s.protection !== 0xff ? `${name} ${s.protection}` : name;
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  t.win.fg = Colour.brightWhite;
  // Capped as the borders' labels are, where it fits; Negate Magic's teens go without the caps.
  if (label.length <= 14) {
    t.moveTo(24 + ((16 - label.length - 2) >> 1), 8);
    leftArrow(g);
    g.print(label);
    rightArrow(g);
  } else {
    t.moveTo(24 + ((16 - label.length) >> 1), 8);
    g.print(label);
  }
  t.select(was);
}

/** The wind's way, as an arrow (the font's): a north wind blows toward the south. */
const WIND_ARROWS = [0, 0x19, 0x18, 0x1b, 0x1a];

/**
 * The map's bottom border (Standard): the date; at sea in a frigate the wind too ("Wind:" and the way it blows, or
 * Calm); in a dungeon the way the party faces. A fight's is left as it is.
 */
export function drawBottomLine(g: Game): void {
  const s = g.s;
  if (g.options.tileSet !== 'standard' || s.mapId > 0x7f) return;
  const d = g.draw;
  d.pen = Colour.blue;
  d.fill(8, 185, 183, 191);
  d.pen = Colour.brightWhite;
  d.line(7, 184, 184, 184);
  const date = `${s.month}-${s.day}-${String(s.year).padStart(3, '0')}`;
  const codes = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));
  let line: number[];
  if (s.mapId > 0x20) line = codes(`${g.t([0x2c7c, 0x2c82, 0x2c88, 0x2c8e][s.facing] ?? 0x2c7c).trim()} ${date}`);
  else if (s.mapId === 0 && s.level < 0x80 && (s.partyTile & 0xf8) === 0x20)
    line = s.wind === 0 ? codes(`Calm ${date}`) : [...codes('Wind:'), WIND_ARROWS[s.wind], 0x20, ...codes(date)];
  else line = codes(date);
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  t.win.fg = Colour.brightWhite;
  t.moveTo(12 - Math.ceil((line.length + 2) / 2), 0x17);
  leftArrow(g);
  for (const c of line) g.printChar(c);
  rightArrow(g);
  t.select(was);
}

/** ULTIMA_4dea: one character in a capped box at column 30, row 10 (the prompt border). */
export function borderChar(g: Game, c: number): void {
  const t = g.text;
  const was = t.current;
  t.select(Win.screen);
  t.moveTo(0x1e, 10);
  leftArrow(g);
  g.printChar(c);
  rightArrow(g);
  t.select(was);
}

/** ULTIMA_4daa: clear it. */
export function clearBorderChar(g: Game): void {
  g.draw.pen = Colour.blue;
  g.draw.fill(0xf0, 0x51, 0x107, 0x56);
  g.draw.pen = Colour.brightWhite;
  g.draw.line(0xf0, 0x50, 0x107, 0x50);
  g.draw.line(0xf0, 0x57, 0x107, 0x57);
}

// --- The stats window -----------------------------------------------------------

/** ULTIMA_2726: member `i`'s line: name, active marker, hit points, status. */
/** Standard's colour for a member's name by state (Good keeps the text's own). */
/**
 * The Standard look's colour for a member's state, as the ultima3 port's: green poisoned, lavender asleep, grey dead
 * (the whole line), blue when a level is due (the camp's apparition would grant it).
 */
const STATE_COLOUR: Record<number, number> = {
  [Status.Poisoned]: Colour.brightGreen,
  [Status.Sleeping]: Colour.lavender,
  [Status.Dead]: Colour.lightGray,
};

/** A member's state colour in the Standard look, or undefined for plain lettering. */
export function stateColour(m: Member): number | undefined {
  const c = STATE_COLOUR[m.status];
  if (c !== undefined) return c;
  return earnedLevel(m.exp) > m.level ? Colour.levelBlue : undefined;
}

function memberLine(g: Game, i: number, marking = true): void {
  if (g.options.tileSet === 'standard') standardLine(g, i, marking);
  else egaLine(g, i, marking);
}

/** The top level; its members' experience has no next level to show. */
const TOP_LEVEL = 8;

/** Experience as the party panel has room for it: under a thousand whole, past it in thousands to a tenth ("3.2k"). */
function thousands(n: number, tenths = true): string {
  if (n < 1000) return String(n);
  if (n >= 10000 || !tenths) return `${Math.floor(n / 1000)}k`;
  return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
}

/**
 * A member's experience and the next level's, for a line with `room` letters after the name: "350/400", "1.7k/3.2k".
 * Where both will not go beside a long name, the current loses its k ("1.7/3.2k") and then its tenths ("1/3.2k"),
 * and a line with no room for a space meets its name. The top level shows MAX.
 */
function xpNumbers(m: Member, room: number, dead: boolean): [string, string, number] {
  const colour = dead ? Colour.lightGray : earnedLevel(m.exp) > m.level ? Colour.levelBlue : Colour.brightWhite;
  if (m.level >= TOP_LEVEL) return [thousands(m.exp), ' MAX', colour];
  const next = `/${thousands(100 << (m.level - 1))}`;
  for (const now of [thousands(m.exp), thousands(m.exp).replace('k', ''), thousands(m.exp, false).replace('k', '')])
    if (now.length + next.length <= room) return [now, next, colour];
  return [thousands(m.exp, false).replace('k', ''), next, colour];
}

/**
 * The colour marking member `i`'s turn, in the Standard look: their state's (charmed, poisoned, asleep, dead, a level
 * due), else their hit points' (yellow low, red nearly gone), else `plain` - the party panel's bar for the turn and
 * the outline round them on the combat map alike.
 */
export function turnColour(g: Game, i: number, plain: number = Colour.brightWhite): number {
  const m = g.s.members[i];
  const state = charmedNow(g, i) ? Colour.charmed : stateColour(m);
  if (state !== undefined) return state;
  if (m.status === Status.Dead) return Colour.lightGray;
  return m.hp * 10 < m.maxHp ? Colour.brightRed : m.hp * 4 < m.maxHp ? Colour.brightYellow : plain;
}

/** Whether member `i` is charmed in the fight going on (the combatant's flags, as the state's letter C). */
function charmedNow(g: Game, i: number): boolean {
  if (g.s.mapId <= 0x7f) return false;
  const e = g.combat[i];
  return (e.flags & 0xe1) === 0x81 && e.who === i;
}

/**
 * A member's line in the Standard look: the name in the colour of their state, and their hit points as current over
 * maximum at the line's end - the current yellow when low and red when nearly gone, the maximum grey; dead, the
 * whole line grey. The active player's arrow is on the frame to the left of the line, and the state's letter, where
 * Settings asks for it, on the frame to the right (Draw.mark), so the line is the name and the numbers alone: an
 * eight-letter name with both numbers in the hundreds meets its numbers without a space, and still fits.
 */
function standardLine(g: Game, i: number, marking: boolean): void {
  const s = g.s;
  const t = g.text;
  const row = t.win.top + i;
  t.moveTo(0, i);
  if (s.partySize <= i) {
    g.print(' '.repeat(15));
    g.draw.mark?.(row, 'left', 0, 0, '');
    g.draw.mark?.(row, 'right', 0, 0, '');
    return;
  }
  const m = s.members[i];
  const c = g.combat[s.combatTurn];
  const marked = (marking && s.mapId > 0x7f && s.combatTurn !== 0xff && (c.flags & 0x80) !== 0 && c.who === i) || g.picked === i;
  const fg = t.win.fg;
  const charmed = charmedNow(g, i);
  const state = charmed ? Colour.charmed : stateColour(m);
  const dead = m.status === Status.Dead;
  const low = m.hp * 10 < m.maxHp ? Colour.brightRed : m.hp * 4 < m.maxHp ? Colour.brightYellow : fg;
  const caster = isCaster(g, i);
  // The numbers: hit points; in the mana view (magicPanel.ts) the mana, a caster's over what a rest gives them; in
  // the experience view (Ztats) the experience over the next level's, gold - blue where it is reached, a level due.
  const room = 15 - m.name.length;
  const [now, max, nowColour] = g.panelMana
    ? caster
      ? [String(m.mp), `/${restedMp(g, i)}`, dead ? Colour.lightGray : fg]
      : ['-', '', Colour.darkGray]
    : g.panelXp
      ? xpNumbers(m, room, dead)
      : [String(m.hp), `/${m.maxHp}`, dead ? Colour.lightGray : low];
  const numbers = now + max;
  const gap = numbers.length < room ? room - numbers.length : 0;
  // One bar for the member whose turn it is, or a choice rests on: the state's colour, else the numbers', else plain.
  const bar = marked ? (g.panelMana ? (caster ? (state ?? fg) : Colour.darkGray) : turnColour(g, i, fg)) : undefined;
  if (marked) g.print(Ctl.inverse);
  t.win.fg = bar ?? (g.panelMana && !caster ? Colour.darkGray : (state ?? fg));
  g.print(m.name);
  g.print(' '.repeat(gap));
  t.win.fg = bar ?? nowColour;
  g.print(now);
  t.win.fg = bar ?? (dead || (g.panelMana && !caster) ? nowColour : Colour.lightGray);
  g.print(max);
  t.win.fg = fg;
  if (marked) g.print(Ctl.inverse);
  // The marks on the frame, beside this line as it now reads.
  const line = `${m.name}${' '.repeat(gap)}${numbers}`.padEnd(15);
  if (i === s.activeMember && (m.status === Status.Dead || m.status === Status.Sleeping)) s.activeMember = 0xff;
  g.draw.mark?.(row, 'left', i === s.activeMember ? 0x1a : 0, Colour.brightWhite, line);
  const letter = charmed ? 0x43 : m.status;
  g.draw.mark?.(row, 'right', g.options.statusLetters && letter !== Status.Good ? letter : 0, Colour.brightWhite, line);
}

/** A member's line as 1988 drew it (the EGA look): name, the active player's arrow, hit points, the state's letter. */
function egaLine(g: Game, i: number, marking: boolean): void {
  const s = g.s;
  const t = g.text;
  t.moveTo(0, i);
  if (s.partySize <= i) {
    g.print(' '.repeat(15));
    return;
  }
  const m = s.members[i];
  const c = g.combat[s.combatTurn];
  // The turn's member in a fight, or the one a choice of member rests on: the line inverted.
  const marked = (marking && s.mapId > 0x7f && s.combatTurn !== 0xff && (c.flags & 0x80) !== 0 && c.who === i) || g.picked === i;
  if (marked) g.print(Ctl.inverse);
  const fg = t.win.fg;
  const caster = isCaster(g, i);
  if (g.panelMana && !caster) t.win.fg = Colour.darkGray;
  g.print(m.name);
  t.win.fg = fg;
  g.print(' '.repeat(Math.max(0, 9 - m.name.length)));
  if (i === s.activeMember) {
    if (m.status !== Status.Dead && m.status !== Status.Sleeping) {
      g.printChar(0x1a);
    } else {
      g.printChar(' ');
      s.activeMember = 0xff;
    }
  } else {
    g.printChar(' ');
  }
  if (g.panelMana) {
    // Mana where the hit points are, while a spell is chosen (magicPanel.ts): one who casts nothing, a dash.
    t.win.fg = caster ? Colour.mana : Colour.darkGray;
    g.print(`M:${caster ? String(m.mp).padStart(3) : '  -'}`);
    t.win.fg = fg;
    if (marked) g.print(Ctl.inverse);
    return;
  }
  g.printNumber(m.hp, 4, ' ');
  g.printChar(charmedNow(g, i) ? 0x43 : m.status); // C, charmed
  if (marked) g.print(Ctl.inverse);
}

/** ULTIMA_2884: gold, right of the food. */
export function drawGold(g: Game): void {
  const s = g.s;
  const t = g.text;
  const was = t.current;
  t.select(Win.stats);
  t.moveTo(8, compactPanel(g) ? 6 : 7);
  if (s.gold < 1000) g.printChar(' ');
  if (s.gold < 100) g.printChar(' ');
  if (s.gold < 10) g.printChar(' ');
  g.say(0x54b6); // " G:"
  g.printNumber(s.gold);
  while (t.win.x < 0xf) g.printChar(' ');
  t.select(was);
}

/** ULTIMA_2900_UpdateVitalsDisplay: the party, food and gold (or the ship's hull), and the date. */
export function drawVitals(g: Game, marking = true): void {
  const s = g.s;
  const t = g.text;
  const compact = compactPanel(g);
  // The Standard look: the border names what the panel shows (partyTitle), drawn again when that changes; and while
  // it is mana or experience - a spell's card among them - the food and gold are left off, the panel about the one.
  const standard = g.options.tileSet === 'standard';
  if (standard && partyTitle(g) !== g.partyTitle) clearBorderTitle(g);
  const quiet = standard && (g.panelMana || g.panelXp || g.panelTitle !== '');
  t.select(Win.stats);
  for (let i = 0; i < 6; i++) memberLine(g, i, marking);
  t.moveTo(0, compact ? 6 : 7); // food and gold: straight under the party (Standard), or under the 1988 divider
  if (quiet) g.print(' '.repeat(15));
  else {
    g.say(0x54ba); // "F:"
    g.printNumber(s.food);
    while (t.win.x < 8) g.printChar(' ');
    if (s.mapId < 0x80 && (s.partyTile & 0xf8) === 0x20) {
      g.say(0x54bd); // "Ship:"
      g.printNumber(s.actors[0].b5);
      if (s.actors[0].b5 < 10) g.printChar(' ');
    } else {
      drawGold(g);
    }
  }
  if (compact) {
    while (t.win.x < 0xf) g.printChar(' ');
    drawBand(g);
    drawBottomLine(g);
    t.select(Win.messages);
    return;
  }
  g.say(0x54c3); // "\n   "
  if (s.month < 10 && s.day < 10) g.printChar(' ');
  g.printNumber(s.month);
  g.printChar('-');
  g.printNumber(s.day);
  g.printChar('-');
  g.printNumber(s.year, 3, '0');
  while (t.win.x < 0xf) g.printChar(' ');
  // The one letter slot of 1988: the lasting spell's letter, or else the regalia worn.
  t.moveTo(6, 6);
  const icon = s.icon || g.regalia;
  if (icon !== 0) {
    leftArrow(g);
    g.printChar(icon);
    rightArrow(g);
  } else {
    clearSpellBar(g);
  }
  drawBottomLine(g);
  t.select(Win.messages);
}

/** ULTIMA_4f3c: the border between the party and the food line, when no spell is in effect. */
export function clearSpellBar(g: Game): void {
  g.draw.pen = Colour.blue;
  g.draw.fill(0xbf, 0x39, 0x138, 0x3e);
  g.draw.pen = Colour.brightWhite;
  g.draw.line(0xc0, 0x38, 0x137, 0x38);
  g.draw.line(0xc0, 0x3f, 0x137, 0x3f);
}

/**
 * The line of the member whose turn it is in a fight, marked (`on`) or not. The EGA game turns its colours over
 * (invertMember), which the Standard look's coloured names would turn to their opposites - a poisoned member's green
 * to magenta - so it draws the line again, marked as one bar or not at all (memberLine).
 */
export function markTurn(g: Game, i: number, on: boolean): void {
  if (g.options.tileSet === 'standard') {
    const was = g.text.current;
    drawVitals(g, on);
    g.text.select(was);
  } else invertMember(g, i);
}

/** ULTIMA_2a28: invert member `i`'s line (a flash, or the selection). */
export function invertMember(g: Game, i: number): void {
  g.draw.invert(0xc0, i * 8 + 8, 0x137, i * 8 + 0xf);
}

// --- Ambient sound --------------------------------------------------------------

/** ULTIMA_4102: the nearest clock ticks, waterfall rushes, fountain splashes or bard plays. */
export function ambientSound(g: Game): void {
  const s = g.s;
  let kind = 0;
  let nearest = 0x33;
  const cx = s.mapId < 0x80 ? s.x : 5;
  const cy = s.mapId < 0x80 ? s.y : 5;
  for (let x = cx - 5, vx = 0; x < cx + 6; x++, vx++) {
    for (let y = cy - 5, vy = 0; y < cy + 6; y++, vy++) {
      let d = (y - cy) * (y - cy) + (x - cx) * (x - cx);
      if (d >= nearest) continue;
      const t = tileAt(g, x, y);
      if ((t & 0xfe) === T.Clock) kind = 1;
      else if ((t & 0xfc) === T.Waterfall) kind = 2;
      else if ((t & 0xfc) === T.Fountain) kind = 3;
      else if (viewAt(g, vx, vy) === 0 && (g.actorMap[vy * 16 + vx] & 0xfc) === 0x5c) kind = 4;
      else d = nearest;
      nearest = d;
    }
  }
  const snd = g.soundOff ? null : g.sound;
  const beat = g.ambientBeat;
  switch (kind) {
    case 1:
      if (s.d5884 !== 0 && (beat === 0 || beat === 4)) void snd?.pulse(0xc2c, 1, 2000, 20000, -10);
      else if (beat === 0) void snd?.tone(3000, 3);
      else if (beat === 4) void snd?.tone(2000, 3);
      break;
    case 2:
      snd?.nearby?.(nearest);
      void snd?.noise(0x14, 0x3c, 10000);
      break;
    case 3:
      snd?.nearby?.(nearest);
      void snd?.noise(10, 0x1e, 25000);
      break;
    case 4: {
      const notes = g.data.bytes(0x6a48, 0x35);
      const freqs = g.data.words(0x6a36, 9);
      const n = notes[g.banjoNote];
      if (n !== 0) void snd?.pulse(freqs[n - 1], 1, 2000, 20000, -10);
      if (++g.banjoNote > 0x34) g.banjoNote = 0;
      break;
    }
  }
  if (s.d5884 !== 0 && (beat === 0 || beat === 4)) s.d5884--;
  if (++g.ambientBeat > 7) g.ambientBeat = 0;
}

// --- The frame ------------------------------------------------------------------

/**
 * ULTIMA_5910_UpdateFrame: animate (unless the last frame asked not to),
 * rebuild or refresh the viewport, put the actors over it and draw it; the
 * figures (the actors, the party's walk) left as they are where `figures`
 * is false.
 */
export function updateFrame(g: Game, figures = true): void {
  const s = g.s;
  g.d545e = 0xff;
  if (s.icon === 0x54) s.animate = 0; // 'T': time stands still
  if (s.drawMap !== 0) {
    if (s.animate !== 0) {
      if (s.animate !== 0xff) {
        animateActors(g, figures);
        if (figures) animateParty();
      }
      shiftWind(g);
      if (s.mapId < 0x80) {
        moongates(g);
        sweepLighthouses(g);
      }
    }
    if (s.mapId < 0x80) {
      if (g.viewDirty !== 0) {
        buildView(g, s.light, s.x - s.chunkX, s.y - s.chunkY);
        g.viewDirty = 0;
      } else {
        for (let y = 0; y < 11; y++) {
          for (let x = 0; x < 11; x++) {
            if (g.view[y * 32 + x] === 0) g.view[y * 32 + x] = tileAt(g, x + s.x - 5, y + s.y - 5);
          }
        }
      }
    } else {
      g.view.set(g.combatMap.subarray(0, 0x160));
    }
    revealView(g);
    overlayActors(g);
    drawView(g);
    if (s.animate !== 0) ambientSound(g);
  }
  s.animate = 1;
}
