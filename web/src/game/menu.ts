/**
 * menu.ts
 *
 * The modern engine's menus, drawn over the map in the game's own font so
 * they could pass for the original's: the command menu (what the
 * surroundings call for first, the rest after, each with its letter so
 * the keyboard is learned along the way), Settings, the journal and the
 * letter picker that lets a controller type names and words.
 */

import { GAME_NAME } from '../brand.ts';
import type { GameCore } from './gameCore.ts';
import { INPUT_PACE_LABELS, INPUT_PACE_NAMES } from '../ui/holds.ts';
import { cue } from './cues.ts';
import { drawVitals, Win } from './frame.ts';
import { Game } from './game.ts';
import { menuKey, PAUSED } from './input.ts';
import { K, Pad, SAVE_NOW } from './io.ts';
import { setAutoCombat } from './solo.ts';
import { newOrderOffer } from './targets.ts';
import {
  AUTO_COMBAT,
  FONTS,
  type FontChoice,
  RULES,
  LEVELS,
  lookNote,
  looksOffered,
  saveOptions,
  TILES_NAMES,
  type Tiles,
  type TileSet,
  type AutoCombat,
  type DungeonMap,
  type InputMode,
  type Rules,
  SOUND_CHOICES,
  type SoundChoice,
  musicNote,
  settingWords,
  soundNote,
} from './settings.ts';
import { CENTRE, TALK_WIDTH } from './speech.ts';
import { Colour } from '../ui/colours.ts';
import { TITLE_DIALOG, TITLE_WARNING } from './chromeTone.ts';
import { devMode, enableDevMode } from '../devMode.ts';
import { desktopModeWay } from '../ui/updates.ts';

/** The menus' text window: the map's area, a character in from its edge. */
const WIN = 3;
const LEFT = 1;
const TOP = 1;
const WIDTH = 21;
const HEIGHT = 22;
/** At the title, the menus' window's left: the map's square centred on the screen (panel). */
const TITLE_LEFT = 9;
/**
 * Whether the title shows a panel (Settings) - a box then sits in its square as in play, not over the title's
 * picture - until the title is drawn again (titleShown).
 */
let titlePanel = false;

/** While an Are you sure? is asked: its frame at the title in the warning's purple, not the dialogs' blue. */
let warning = false;

/** The tone of a dialog's frame at the title (Standard): the overworld's blue, or a warning's purple. */
const titleTone = () => (warning ? TITLE_WARNING : TITLE_DIALOG);

/** The title drawn again: its dialogs are its own again, not a panel's (intro.ts). */
export function titleShown(): void {
  titlePanel = false;
}

/** At the title, the rows above the menu's box a dialog is kept to, a row clear of its border (box). */
const TITLE_ABOVE = 14;

export interface Item {
  label: string;
  /** The key it stands for (a command's letter), shown before the label. */
  key?: number;
  enabled?: boolean | undefined;
  /**
   * Not to be chosen (`enabled` false), but the bar may rest on it, that its note or card say why (the Use list's
   * grey: useCard.ts): A there does nothing. Else the bar steps over a line that cannot be chosen.
   */
  rest?: boolean;
  /** Drawn in grey but still to be chosen: a word whose answer has been heard already. */
  dim?: boolean | undefined;
  /** Drawn in this colour of the palette (a potion in its own colour). */
  colour?: number | undefined;
  /** What the line is, said at the foot of the list while the bar is on it (a setting's explanation). */
  note?: string;
}

/** The map's square, left and right, in EGA pixels: inside the screen's frame. */
const VIEW_EDGE: [number, number] = [8, 0xb7];

/** The rows at a list's foot kept for the note of the line the bar is on, where its lines have notes. */
const NOTE_ROWS = 4;
/** The most rows a box's notes take, under its lines (choose). */
const BOX_NOTE_ROWS = 3;

/** Wait for a key without the cursor (the menus draw their own highlight). */
export const key = (g: GameCore): Promise<number> => menuKey(g);

/** Put the map back as it was before a menu covered it. */
export async function restoreView(g: GameCore): Promise<void> {
  g.draw.chromeBox?.(null);
  // The map drawn whole, the squares a townsman's box stands over too (they may hold what covered them); the box is
  // drawn again over it below.
  g.covers.delete('menu');
  g.covers.delete('speech');
  // At the title there is no map or party to put back (a game's stats would come up over it): what opened the menu
  // draws the title again itself.
  if (!g.inPlay) return;
  // The play screen drawn again (Ultima V's: the corridor or the map, a townsman's words over it, the stats).
  await g.play.restore?.();
}

/** Text at (x, y) in the menus' window, a character at a time, never wrapping or scrolling it. */
function put(g: GameCore, x: number, y: number, text: string): void {
  const t = g.text;
  const was = t.advance;
  t.advance = false;
  for (let i = 0; i < text.length && x + i < cols; i++) {
    t.moveTo(x + i, y);
    t.printChar(text.charCodeAt(i));
  }
  t.advance = was;
}

/** How wide the window now open is, in characters: the whole panel's, or a box's. */
let cols = WIDTH;

/**
 * A box in the middle of the map, only as big as what it asks: a question
 * with two or three answers should not blot out the whole view (the
 * ultima3 port's placed windows). The text window is left selected.
 */
export function box(g: GameCore, title: string, width: number, rows: number): void {
  const d = g.draw;
  const t = g.text;
  cols = Math.max(6, Math.min(WIDTH, width));
  const head = title ? 2 : 0; // a box with no title is its answers and nothing else
  if (!g.inPlay && !titlePanel) {
    framedBox(g, title, width, rows);
    return;
  }
  // In the map's square (at the title, the one Settings is centred in), as in play.
  const left = (titlePanel && !g.inPlay ? TITLE_LEFT : LEFT) + ((WIDTH - cols) >> 1);
  // Low in the view, so the party at its middle and whoever they face are still to be seen - unless it is too tall.
  const top = Math.max(TOP + ((HEIGHT - rows - 2) >> 1), TOP + HEIGHT - rows - head - 2);
  const [y1, y2] = [top * 8 - 4, (top + rows + head) * 8 + 3];
  // A box as wide as the map's square (a long line in Use or Ready) has no room for its sides half a character out:
  // they would lie on the screen's frame. The frame is its sides, and its top and bottom run from edge to edge.
  const wide = left * 8 - 4 < VIEW_EDGE[0];
  const [x1, x2] = wide ? VIEW_EDGE : [left * 8 - 4, (left + cols) * 8 + 3];
  d.pen = 0;
  d.fill(x1, y1, x2, y2);
  d.pen = Colour.blue;
  d.line(x1, y1, x2, y1);
  d.line(x1, y2, x2, y2);
  if (!wide) {
    d.line(x1, y1, x1, y2);
    d.line(x2, y1, x2, y2);
  }
  if (g.inPlay) d.chromeBox?.([x1, y1, x2, y2]);
  else d.chrome?.(true, 0, [x1, y1, x2, y2], titleTone()); // at the title, its lines in the dialogs' tone
  t.setWindow(WIN, left, top, left + cols - 1, top + rows + head - 1);
  t.select(WIN);
  if (title) put(g, Math.max(0, (cols - title.length) >> 1), 0, title);
}

/**
 * A box as the title has it: across the middle of the screen, in a frame of its own, the picture about it left as it
 * is - above the title menu's box, clear of its border (their copper would run together), where it fits there. The
 * text window is left selected. (box does this at the title; a screen in play that wants the title's arrangement, the
 * Appearance screen, asks for it.)
 */
export function framedBox(g: GameCore, title: string, width: number, rows: number): void {
  const t = g.text;
  cols = Math.max(6, Math.min(WIDTH, width));
  const head = title ? 2 : 0;
  const tall = rows + head + 2;
  const [left, top] = [(40 - cols) >> 1, 1 + (tall <= TITLE_ABOVE ? (TITLE_ABOVE - tall) >> 1 : Math.max(0, (25 - tall) >> 1))];
  framed(g, (left - 1) * 8, (top - 1) * 8, (left + cols + 1) * 8 - 1, (top + rows + head + 1) * 8 - 1);
  t.setWindow(WIN, left, top, left + cols - 1, top + rows + head - 1);
  t.select(WIN);
  if (title) put(g, Math.max(0, (cols - title.length) >> 1), 0, title);
}

/**
 * A dialog's own frame, at the title, where there is no screen's frame for it to sit in: the game frame's own - a
 * band of its blue seven pixels deep, its corners rounded, a white line inside it - round (x1, y1)-(x2, y2) (EGA
 * pixels, inclusive), everything within cleared, and the Standard look's copper made of it and of nothing else on
 * the screen (the title's logo has the blue too).
 */
function framed(g: GameCore, x1: number, y1: number, x2: number, y2: number): void {
  const d = g.draw;
  d.pen = 0;
  d.fill(x1, y1, x2, y2);
  d.pen = Colour.blue;
  d.fill(x1, y1, x2, y1 + 6);
  d.fill(x1, y2 - 6, x2, y2);
  d.fill(x1, y1, x1 + 6, y2);
  d.fill(x2 - 6, y1, x2, y2);
  // The corners rounded as the frame's corner pieces are, a pixel stepped back row by row.
  d.pen = 0;
  CORNER.forEach((n, r) => {
    if (!n) return;
    d.fill(x1, y1 + r, x1 + n - 1, y1 + r);
    d.fill(x2 - n + 1, y1 + r, x2, y1 + r);
    d.fill(x1, y2 - r, x1 + n - 1, y2 - r);
    d.fill(x2 - n + 1, y2 - r, x2, y2 - r);
  });
  d.pen = Colour.brightWhite;
  d.line(x1 + 7, y1 + 7, x2 - 7, y1 + 7);
  d.line(x2 - 7, y1 + 7, x2 - 7, y2 - 7);
  d.line(x2 - 7, y2 - 7, x1 + 7, y2 - 7);
  d.line(x1 + 7, y2 - 7, x1 + 7, y1 + 7);
  d.chrome?.(true, 0, [x1, y1, x2, y2], g.inPlay ? undefined : titleTone());
}

/** How many pixels a frame's corner leaves bare on each of its first rows, from the outside in. */
const CORNER = [5, 3, 2, 1, 1];

/** Where a talk's menu goes (speech.ts talkMenuRows): the text rows it may take, low in the view. */
export interface TalkRows {
  first: number;
  last: number;
}

/**
 * The talk's menu's box: framed as the townsman's words are over it (speech.ts), as wide as its longest line and
 * centred as they are, its foot at the view's, as tall as its lines or the room `rows` leaves; no title. The text
 * window is left selected.
 */
function talkBox(g: GameCore, width: number, lines: number, rows: TalkRows): void {
  const d = g.draw;
  const t = g.text;
  // An even width, so it is centred to the pixel: the view's middle lies between two columns.
  cols = Math.max(6, Math.min(TALK_WIDTH, width + (width & 1)));
  const left = Math.max(2, Math.min(22 - cols, CENTRE - (cols >> 1)));
  const top = rows.last - lines + 1;
  const [x1, y1, x2, y2] = [left * 8 - 4, top * 8 - 4, (left + cols) * 8 + 3, (top + lines) * 8 + 3];
  d.pen = 0;
  d.fill(x1, y1, x2, y2);
  d.pen = Colour.blue;
  d.line(x1, y1, x2, y1);
  d.line(x1, y2, x2, y2);
  d.line(x1, y1, x1, y2);
  d.line(x2, y1, x2, y2);
  d.chromeBox?.([x1, y1, x2, y2]);
  g.covers.set('menu', [x1, y1, x2, y2]); // the map goes on under it (choose)
  t.setWindow(WIN, left, top, left + cols - 1, top + lines - 1);
  t.select(WIN);
}

/** Draw a menu panel's frame and title - the map's square; the text window is left selected. */
function panel(g: GameCore, title: string): void {
  const d = g.draw;
  const t = g.text;
  cols = WIDTH;
  d.pen = 0;
  // In play, the map's square in the screen's frame: the frame is the panel's. At the title, where there is no frame,
  // the same square in the same frame, centred on the screen - Settings as it is in the game.
  const left = g.inPlay ? LEFT : TITLE_LEFT;
  if (!g.inPlay) titlePanel = true;
  if (g.inPlay) d.fill(8, 8, 0xb7, 0xb7);
  else framed(g, (left - 1) * 8, (TOP - 1) * 8, (left - 1) * 8 + 0xbf, (TOP - 1) * 8 + 0xbf);
  t.setWindow(WIN, left, TOP, left + WIDTH - 1, TOP + HEIGHT - 1);
  t.select(WIN);
  // The title's row cleared first: a shorter title over a longer one left the longer's ends in the screen's record.
  put(g, 0, 0, ' '.repeat(WIDTH));
  put(g, Math.max(0, (WIDTH - title.length) >> 1), 0, title);
}

/** One row of a list: its letter (when the list has them), its label, highlighted when chosen, gray when not to be had. */
function row(g: GameCore, y: number, item: Item | undefined, chosen: boolean, lettered = true, width = cols): void {
  const t = g.text;
  const w = t.win;
  const letter = item?.key && item.key > 0x20 && item.key < 0x7f ? String.fromCharCode(item.key) : ' ';
  const text = item ? (lettered ? `${letter} ${item.label}` : item.label) : '';
  const fg = w.fg;
  if (item?.colour !== undefined) w.fg = item.colour;
  if (item && (item.enabled === false || item.dim)) w.fg = 8;
  if (chosen) t.inverse = true;
  // Never past its width: a line too long for a narrow box is cut, not run over its frame.
  put(g, 0, y, text.slice(0, width).padEnd(width));
  t.inverse = false;
  w.fg = fg;
}

/**
 * A question with a few answers, in a box over the map; the view is put
 * back when it is answered. The index chosen, or -1 for B.
 */
export async function ask(g: GameCore, title: string, labels: string[], start = 0): Promise<number> {
  const at = await choose(
    g,
    title,
    labels.map((label) => ({ label })),
    start,
    true,
  );
  await restoreView(g);
  return at;
}

/** Yes or No, in a box; B is No, and Y and N answer it from any keyboard. */
export async function askYesNo(g: GameCore): Promise<boolean> {
  const at = await choose(
    g,
    '',
    [
      { label: 'Yes', key: 0x59 },
      { label: 'No', key: 0x4e },
    ],
    0,
    true,
  );
  await restoreView(g);
  return at === 0;
}

/**
 * A number dialled in a box (the ultima3 port's spinner): up and down by
 * one, right and left by ten, between `low` and `high`; A says it, B says
 * none (-1), as they choose and back out of every menu - so the box shows
 * the number and nothing of the buttons. `title` heads it; `caption`, if
 * given, is a line under the number saying what that number will do
 * (Camp's hours: Rest, or Wait), changing as it is dialled. `shown`, if
 * given, is drawn in the number's place (a level's Off, or 60%), the box as
 * wide as the longest of them; with a label there are no digits to type.
 * `onChange` is told each new number as it is dialled, and the first again
 * when B leaves it, so a level is heard as it turns and is as it was after.
 */
export async function amount(
  g: GameCore,
  low: number,
  high: number,
  start = low,
  {
    title = 'How many?',
    caption,
    shown,
    onChange,
  }: {
    title?: string;
    caption?: ((n: number) => string) | undefined;
    shown?: ((n: number) => string) | undefined;
    onChange?: ((n: number) => void) | undefined;
  } = {},
): Promise<number> {
  // What was said for the Dialog setting's box shown first, a page at a time, as choose has it: the dial drawn after,
  // not under a page still to turn - whose key it would not get, and whose turning drew the map over it.
  if (g.beforeRead) await g.beforeRead();
  const t = g.text;
  const was = t.current;
  let n = Math.max(low, Math.min(high, start));
  const label = (v: number): string => (shown ? shown(v) : String(v));
  const width = shown ? Math.max(...Array.from({ length: high - low + 1 }, (_, i) => shown(low + i).length)) : String(high).length;
  // As wide and as tall as the longest caption it can show (a line to a "\n"), so the box does not change size as the
  // number turns.
  let widest = 0;
  let tallest = 0;
  if (caption)
    for (let i = low; i <= high; i++) {
      const lines = caption(i).split('\n');
      tallest = Math.max(tallest, lines.length);
      for (const l of lines) widest = Math.max(widest, l.length);
    }
  const frame = (): void => box(g, title, Math.max(13, widest + 2), 1 + tallest);
  frame();
  let result = -1;
  for (;;) {
    put(g, 0, 2, `${String.fromCharCode(0x18)}${String.fromCharCode(0x19)} ${label(n).padStart(width)}`.padEnd(cols));
    const said = caption?.(n).split('\n');
    for (let r = 0; r < tallest; r++) put(g, 0, 3 + r, (said?.[r] ?? '').padEnd(cols));
    g.menuShown = { title, labels: [label(n), ...(said ?? [])], enabled: [true], dim: [false], at: 0 };
    const k = await key(g);
    if (k === PAUSED) {
      frame();
      continue;
    }
    const before = n;
    if (k === K.Up) n = Math.min(high, n + 1);
    else if (k === K.Down) n = Math.max(low, n - 1);
    else if (k === K.Right) n = Math.min(high, n + 10);
    else if (k === K.Left) n = Math.max(low, n - 10);
    else if (!shown && k >= 0x30 && k <= 0x39) n = Math.max(low, Math.min(high, (n * 10 + k - 0x30) % 10 ** width));
    else if (k === K.Enter || k === Pad.A) {
      result = n;
      break;
    } else if (k === K.Escape || k === Pad.B || k === K.Space) {
      if (n !== start) onChange?.(start);
      break;
    }
    if (n !== before) onChange?.(n);
  }
  g.menuShown = null;
  t.select(was);
  await restoreView(g);
  return result;
}

/**
 * The arrows at the right of a list too long for its box, on row `up` where there are more lines above and row
 * `down` where there are more below - in grey, as the title menu has them (intro.ts). A talk's are on its first and
 * last lines, beside them; any other list's on the rows above and below its lines, which no line is cut for.
 */
function scrollMarks(g: GameCore, up: number, down: number, above: boolean, below: boolean): void {
  const t = g.text;
  const fg = t.win.fg;
  t.win.fg = Colour.lightGray;
  put(g, cols - 1, up, above ? '\x18' : ' ');
  put(g, cols - 1, down, below ? '\x19' : ' ');
  t.win.fg = fg;
}

/**
 * A list to choose from, over the map. Up and down move (and wrap), left
 * and right a page where the list is longer than it shows (else as up and
 * down), Enter or A chooses, Escape, B or Space goes back; a letter
 * chooses the item it stands for. The index chosen, or -1 (-2: to be drawn anew, Game.choiceSeen).
 */
/**
 * Where a list opened at line `at` starts: there, if the bar may be on it (a line to choose, or one it may rest on);
 * else the next such line after it, round from the top - or `at` still, where there is none (Manage Saves with no
 * character kept: Export greyed, the bar on Import).
 */
function firstChoosable(items: Item[], at: number): number {
  for (let i = 0; i < items.length; i++) {
    const next = (at + i) % items.length;
    if (items[next].enabled !== false || items[next].rest) return next;
  }
  return at;
}

/** What choose returns where the opener's key hook (Game.choiceKey) left the list, to show something over it. */
export const LEFT_FOR_HOOK = -3;

export async function choose(g: GameCore, title: string, items: Item[], start = 0, boxed = false, talkRows?: TalkRows): Promise<number> {
  // What was said for the Dialog setting's box shown first: the box drawn before the menu, not over it - and a list
  // low in the view, as a townsman's talk has it, the merchant's words in sight above it (merchantSpeech.ts).
  if (g.beforeRead) await g.beforeRead();
  const talk = talkRows ?? (!boxed ? g.play.talkRows?.() : undefined);
  const t = g.text;
  const was = t.current;
  // (A talk's menu - low in the view, framed - holds its lines alone: no title, no notes. Its title is still the
  // menu's, for whoever reads which it is.)
  const talking = !boxed && talk !== undefined && g.inPlay;
  const animate = talking ? g.play.animating?.() : undefined;
  const noted = !boxed && !talking && items.some((it) => it.note);
  const rows = boxed
    ? Math.min(items.length, HEIGHT - 6)
    : talking
      ? Math.min(items.length, talk.last - talk.first + 1)
      : HEIGHT - 3 - (noted ? NOTE_ROWS + 1 : 0);
  // A box's notes (the port's): under its lines, after a blank row, as many rows as its longest note wants (three at
  // most), the box as wide as the view's square to hold them.
  const boxNotes = boxed ? Math.min(BOX_NOTE_ROWS, Math.max(0, ...items.map((it) => (it.note ? wrap(it.note).length : 0)))) : 0;
  // A list longer than it shows, but a talk's (which has its arrows beside its lines): its arrows on rows of their own,
  // the row above its lines and the row below them (scrollMarks) - a box given the rows it lacks for them.
  const scrolls = !talking && items.length > rows;
  const lead = scrolls && boxed && !title ? 1 : 0;
  const foot = scrolls && boxed && !boxNotes ? 1 : 0;
  let at = firstChoosable(items, Math.max(0, Math.min(start, items.length - 1)));
  let top = 0;
  // A list with no letters gives its labels the whole width - and a keyboard read as a controller has no
  // letter commands, so the column would promise keys that do nothing.
  const lettered = g.options.input === 'letters' && items.some((it) => it.key);
  const frame = (): void => {
    if (boxed)
      box(
        g,
        title,
        boxNotes ? WIDTH : Math.max(title.length, ...items.map((it) => it.label.length + (lettered ? 2 : 0))) + 1,
        lead + rows + foot + (boxNotes ? boxNotes + 1 : 0),
      );
    // (Two columns more where it scrolls, for the arrows that say there are more lines above or below: drawTalkMarks.)
    else if (talking)
      talkBox(g, Math.max(...items.map((it) => it.label.length + (lettered ? 2 : 0))) + 1 + (items.length > rows ? 2 : 0), rows, talk);
    else panel(g, title);
  };
  frame();
  const draw = (): void => {
    if (at < top) top = at;
    if (at >= top + rows) top = at - rows + 1;
    const head = ((boxed && !title) || talking ? 0 : 2) + lead;
    // (A talk's list that scrolls keeps its last two columns for the arrows: the bar stops short of them.)
    const marked = talking && items.length > rows;
    for (let r = 0; r < rows; r++) row(g, r + head, items[top + r], top + r === at, lettered, marked ? cols - 2 : cols);
    if (marked) scrollMarks(g, 0, rows - 1, top > 0, top + rows < items.length);
    if (scrolls) scrollMarks(g, head - 1, head + rows, top > 0, top + rows < items.length);
    if (boxNotes) {
      const lines = wrap(items[at]?.note ?? '');
      const fg = t.win.fg;
      t.win.fg = Colour.lightGray;
      for (let r = 0; r < boxNotes; r++) put(g, 0, head + rows + 1 + r, (lines[r] ?? '').padEnd(cols));
      t.win.fg = fg;
    }
    if (noted) {
      // The bar's line explained at the foot, grey, under a blank row.
      const lines = wrap(items[at]?.note ?? '');
      const fg = t.win.fg;
      t.win.fg = Colour.lightGray;
      for (let r = 0; r < NOTE_ROWS; r++) put(g, 0, HEIGHT - NOTE_ROWS + r, (lines[r] ?? '').padEnd(WIDTH));
      t.win.fg = fg;
    }
  };
  let result = -1;
  let hooked: boolean | 'leave';
  for (;;) {
    draw();
    if (g.choiceWatch) {
      const here = t.current;
      g.choiceWatch(at, title);
      t.select(here);
    }
    g.menuShown = {
      title,
      labels: items.map((it) => it.label),
      enabled: items.map((it) => it.enabled !== false),
      dim: items.map((it) => it.dim === true),
      at,
    };
    // (A talk's menu leaves the map going on round it: the townsman and the party, the water.)
    const k = await menuKey(g, boxed ? items.flatMap((it) => (it.key ? [it.key] : [])) : [], animate);
    if (k === PAUSED) {
      frame(); // the Pause menu was over it
      continue;
    }
    const seen = g.choiceSeen?.(k, g.lastRaw, title);
    if (seen === 'take') continue;
    if (seen === 'again') {
      result = -2;
      break;
    }
    const letter = k >= 0x61 && k <= 0x7a ? k - 0x20 : k;
    /** The next line the cursor may rest on: a line that cannot be chosen is stepped over, blanks and all. */
    const step = (by: number): number => {
      let next = at;
      for (let i = 0; i < items.length; i++) {
        next = (next + by + items.length) % items.length;
        if (items[next].enabled !== false || items[next].rest) return next;
      }
      return at;
    };
    /**
     * A page on (`by` 1) or back: as many lines as the list shows, onto the nearest that can be chosen, and no further
     * than its end - from the end, round to the other (the port's: left and right in a list too long to show whole).
     */
    const page = (by: number): number => {
      const end = by > 0 ? items.length - 1 : 0;
      if (at === end) return step(by);
      const restable = (i: number): boolean => items[i].enabled !== false || items[i].rest === true;
      let next = Math.max(0, Math.min(items.length - 1, at + by * rows));
      while (!restable(next) && next !== at) next -= by;
      if (next === at) for (next = at + by * rows; next >= 0 && next < items.length && !restable(next); next += by);
      return next >= 0 && next < items.length ? next : at;
    };
    const long = items.length > rows;
    if (k === K.Left && long) {
      at = page(-1);
      menuSound(g, 'move');
    } else if (k === K.Right && long) {
      at = page(1);
      menuSound(g, 'move');
    } else if (k === K.Up || k === K.Left) {
      at = step(-1);
      menuSound(g, 'move');
    } else if (k === K.Down || k === K.Right) {
      at = step(1);
      menuSound(g, 'move');
    } else if (k === 0xd5) {
      at = Math.max(0, at - rows);
      menuSound(g, 'move');
    } else if (k === 0xd6) {
      at = Math.min(items.length - 1, at + rows);
      menuSound(g, 'move');
    } else if (k === K.Enter || k === Pad.A || (k === Pad.Y && g.casting)) {
      // (Y chooses too in a spell's own lists - which spell, and the rest - Y being the button that began the cast.)
      if (items[at].enabled !== false) {
        result = at;
        break;
      }
    } else if (k === K.Escape || k === Pad.B || k === K.Space || k === Pad.Start || k === Pad.Select) {
      menuSound(g, 'back');
      break;
    } else if ((hooked = g.choiceKey?.(k, at, title) ?? false)) {
      // Taken by whoever opened the menu (the journal's hints); the list stays - or, 'leave', is left (choose returns
      // LEFT_FOR_HOOK) for them to show something over it, and open it again.
      if (hooked === 'leave') {
        result = LEFT_FOR_HOOK;
        break;
      }
    } else if (!BUTTONS.has(k)) {
      // An item's own key picks it - a letter, or one of the command menu's private keys, which a controller's
      // buttons share numbers with (0x100 up): X is no Journal, Y no Map, Select no sign read.
      const i = items.findIndex((it) => it.key === letter && it.enabled !== false);
      if (i >= 0) {
        result = i;
        break;
      }
    }
  }
  g.menuShown = null;
  t.select(was);
  return result;
}

/**
 * A short list in two columns, boxed low in the view, so that the scene above it stays in sight (a shrine's altar
 * and the Avatar kneeling at it); its title is the menu's, not drawn. Read across a row: its first line at the left, its second at the right - each
 * column to its own side, so that a long word on one side has the room the other's short one leaves. Up and down go
 * a row (and wrap), left and right across it; A chooses, B goes back. The index chosen, or -1.
 */
export async function chooseTwoColumns(g: GameCore, title: string, items: Item[], start = 0): Promise<number> {
  if (g.beforeRead) await g.beforeRead();
  const t = g.text;
  const was = t.current;
  const rows = Math.ceil(items.length / 2);
  const width = (r: number): number => items[2 * r].label.length + (items[2 * r + 1] ? items[2 * r + 1].label.length + 2 : 0);
  // No title in the box (the menu keeps it, for whoever reads it): the question is the log's, and the box the lower
  // for it, clear of the square above (the kneeling Avatar's, at a shrine).
  const frame = (): void => box(g, '', Math.max(...Array.from({ length: rows }, (_, r) => width(r))), rows);
  frame();
  const cell = (x: number, y: number, i: number, chosen: boolean): void => {
    const fg = t.win.fg;
    if (items[i].enabled === false || items[i].dim) t.win.fg = 8;
    if (chosen) t.inverse = true;
    put(g, x, y, items[i].label);
    t.inverse = false;
    t.win.fg = fg;
  };
  let at = firstChoosable(items, Math.max(0, Math.min(start, items.length - 1)));
  let result = -1;
  for (;;) {
    for (let r = 0; r < rows; r++) {
      put(g, 0, r, ''.padEnd(cols));
      cell(0, r, 2 * r, at === 2 * r);
      const right = items[2 * r + 1];
      if (right) cell(cols - right.label.length, r, 2 * r + 1, at === 2 * r + 1);
    }
    g.menuShown = {
      title,
      labels: items.map((it) => it.label),
      enabled: items.map((it) => it.enabled !== false),
      dim: items.map((it) => it.dim === true),
      at,
      columns: 2,
    };
    const k = await menuKey(g);
    if (k === PAUSED) {
      frame(); // the Pause menu was over it
      continue;
    }
    if (k === K.Up || k === K.Down) {
      // A row up or down in the same column, wrapping (the last row's right may be empty: its left then).
      const by = k === K.Up ? -2 : 2;
      let next = at + by;
      if (next < 0) next = (rows - 1) * 2 + (at & 1);
      if (next >= items.length) next = k === K.Down ? at & 1 : items.length - 1;
      at = next;
      menuSound(g, 'move');
    } else if (k === K.Left || k === K.Right) {
      if ((at ^ 1) < items.length) at ^= 1;
      menuSound(g, 'move');
    } else if (k === K.Enter || k === Pad.A) {
      if (items[at].enabled !== false) {
        result = at;
        break;
      }
    } else if (k === K.Escape || k === Pad.B || k === K.Space || k === Pad.Start || k === Pad.Select) {
      menuSound(g, 'back');
      break;
    }
  }
  g.menuShown = null;
  t.select(was);
  return result;
}

/** A page of text over the map, until a key (which it returns); up and down scroll it. */
/** A page of Help or Tips: its title and up to PAGE_LINES lines of WIDTH letters. */
export interface Page {
  title: string;
  lines: string[];
  /**
   * A picture drawn over the page once its lines are (help.ts's controller): `x0`, `y0` the screen pixel of the
   * panel's top-left letter, `put` a letter or a word in a colour of its own at a letter's place (column, row; row 0
   * the title's).
   */
  picture?: (g: GameCore, at: { x0: number; y0: number; put: (x: number, y: number, text: string, fg?: number) => void }) => void;
}

/** The lines a page holds, under its title. */
export const PAGE_LINES = HEIGHT - 3;
/** How wide a page's line may be. */
export const PAGE_WIDTH = WIDTH;

/**
 * Pages over the map, one at a time (the ultima3 port's Help): A, Enter or right turns to the next, and past the last
 * closes; left goes back; B or Escape closes. The title counts the pages; the keys go unsaid, as a menu's do.
 */
export async function showPages(g: GameCore, pages: Page[]): Promise<void> {
  const t = g.text;
  const was = t.current;
  let i = 0;
  try {
    for (;;) {
      const p = pages[i];
      panel(g, pages.length > 1 ? `${p.title} ${i + 1}/${pages.length}` : p.title);
      for (let r = 0; r < PAGE_LINES; r++) put(g, 0, r + 2, (p.lines[r] ?? '').padEnd(WIDTH));
      p.picture?.(g, {
        x0: (g.inPlay ? LEFT : TITLE_LEFT) * 8,
        y0: TOP * 8,
        put: (x, y, text, fg) => {
          const was = t.win.fg;
          if (fg !== undefined) t.win.fg = fg;
          put(g, x, y, text);
          t.win.fg = was;
        },
      });
      const k = await key(g);
      if (k === K.Enter || k === Pad.A || k === K.Right || k === K.Down) {
        if (++i >= pages.length) return;
      } else if (k === K.Left || k === K.Up) i = Math.max(0, i - 1);
      else if (k === K.Escape || k === Pad.B || k === Pad.Start) return;
    }
  } finally {
    t.select(was);
  }
}

/**
 * Text over the map, scrolled a line at a time by up and down and a page at a time by left and right; any other key
 * closes it and is returned. A line may have a colour of its own (`colours`, by line). Text longer than the panel
 * says at its foot how to move through it.
 */
export async function showText(g: GameCore, title: string, lines: string[], colours: (number | undefined)[] = []): Promise<number> {
  const t = g.text;
  const was = t.current;
  const long = lines.length > HEIGHT - 3;
  const rows = HEIGHT - 3 - (long ? 2 : 0);
  let top = 0;
  panel(g, title);
  for (;;) {
    const fg = t.win.fg;
    for (let r = 0; r < rows; r++) {
      t.win.fg = colours[top + r] ?? fg;
      put(g, 0, r + 2, (lines[top + r] ?? '').padEnd(WIDTH));
    }
    if (long) {
      t.win.fg = Colour.lightGray;
      const where = top + rows >= lines.length ? 'end' : `${Math.round(((top + rows) / lines.length) * 100)}%`;
      // How far down, and for Classic input its keys; a controller is told no buttons (it backs out with B as anywhere).
      put(
        g,
        0,
        HEIGHT - 1,
        `${g.options.input === 'controller' ? '' : 'Arrows Esc close '}${where}`
          .padStart(g.options.input === 'controller' ? WIDTH : 0)
          .padEnd(WIDTH),
      );
    }
    t.win.fg = fg;
    const k = await key(g);
    if (k === PAUSED) {
      panel(g, title); // the Pause menu was over it
      continue;
    }
    const last = Math.max(0, lines.length - rows);
    if (k === K.Up) top = Math.max(0, top - 1);
    else if (k === K.Down) top = Math.min(last, top + 1);
    else if (k === 0xd5 || k === K.Left) top = Math.max(0, top - rows);
    else if (k === 0xd6 || k === K.Right) top = Math.min(last, top + rows);
    else {
      t.select(was);
      return k;
    }
  }
}

/** Text broken into lines of the menus' width. */
export function wrap(text: string, width = WIDTH): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let word of para.split(' ')) {
      // A word longer than a line (a file's name) is broken across lines of its own, after a hyphen where one falls
      // in reach; its last piece goes on as a word.
      if (word.length > width) {
        if (line) out.push(line);
        while (word.length > width) {
          const cut = word.lastIndexOf('-', width - 1) + 1 || width;
          out.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        line = word;
      } else if (line.length + word.length + (line ? 1 : 0) > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  // A no-break space (savedWhen's "8:31 AM" in a sentence) holds its words together, and is shown as a space.
  return out.map((l) => l.replace(/\u00a0/g, ' '));
}

// --- The command menu -------------------------------------------------------------------------------

export const c = (ch: string): number => ch.charCodeAt(0);
/** A controller's buttons, as keys (io.ts Pad). */
const BUTTONS = new Set<number>(Object.values(Pad));
/**
 * What a menu answers a key with (the port's, from the ultima3 port): a
 * step as the cursor moves, and on backing out a very soft tap (the Back
 * cue; the Original's low note of the shop counter, the healer's). A choice is
 * silent - what it opens or does says it, and a sound at every choice was
 * too much. They go through the same effects as the game's own sounds, so
 * each suite voices them its way and Upgrade (2001) as the PC speaker.
 */
export function menuSound(g: GameCore, what: 'move' | 'back'): void {
  if (g.soundOff) return;
  // The game's own effects, by the parameters the original passes for them, so each set voices them its way.
  if (what === 'move')
    void g.sound.noise(1, 0x19, 1000); // a step
  else void cue(g, 'Back', () => g.sound.pulse(2300, 1, 18000, 1, 2)); // the Original's: the low note of the shop counter
}

// --- The pause menu ---------------------------------------------------------------------------------------

/**
 * Start, Select or Escape - or the window losing focus - holds the game:
 * the tiles stop moving, the music and everything sounding stop where
 * they are, and the menu offers what is not part of playing - the
 * journal, the maps, Auto combat, the settings, the help, and the saving
 * and leaving of the game. The game goes on again when it closes.
 */
/** Auto combat's choices as the Pause menu names them, and what each does. */
const AUTO_COMBAT_NAMES: Record<AutoCombat, string> = { off: 'Off', allies: 'Allies', all: 'All' };
const AUTO_COMBAT_NOTES: Record<AutoCombat, string> = {
  off: 'Off: you play every turn of the party.',
  allies: 'Allies: Play the Avatar only. Press Pass twice to cancel.',
  all: 'All: Game plays everyone. Press Pass twice to cancel.',
};

/**
 * The Pause menu. `midCommand`: opened from a prompt or a menu inside a command (Start, Select), where the game is not
 * saved - a command part done is no game to keep - nor the dungeon's view switched under the command's prompt.
 */
export async function pauseMenu(g: Game, midCommand = false): Promise<number> {
  /**
   * A saving line greyed says why, the bar resting on it (Item.rest): in a fight, or inside a command (Start pressed
   * at its prompt). A dungeon is saved in, and left from, as anywhere else: 1988's Q saved there too.
   */
  const noSave = (able: boolean): Partial<Item> => {
    if (able) return {};
    const why = g.s.mapId === 0xff ? 'Not in a fight.' : midCommand ? 'Not in the middle of a command: finish it, then pause.' : 'Not now.';
    return { rest: true, note: why };
  };
  /**
   * A newer version (ui/updates.ts), as the title's menu has it: its release's page opened from here; one installed or
   * come down said only - a restart from play would lose the game since the last save, so the way is Save and quit.
   */
  const updateLine = (): Setting[] => {
    const update = g.hooks.update;
    const offer = update?.offer();
    if (!update || !offer?.version) return [];
    const name = `${GAME_NAME} ${offer.version}`;
    const say = (text: string) => async (): Promise<void> => void (await showText(g, 'Update', wrap(text)));
    return [
      {
        label: `Update (${offer.version})`,
        act:
          offer.kind === 'restart'
            ? say(
                offer.onQuit
                  ? `${name} has downloaded. It installs when the game quits.`
                  : `${name} ${offer.installed ? 'is installed' : 'has downloaded'}. It starts the next time you play: Save and quit, and start the game again, to play it now.`,
              )
            : offer.page === false
              ? say(`${name} is out. ${desktopModeWay(offer)}`)
              : () => update.apply(),
      },
    ];
  };
  /** Party order greyed where it cannot be had, saying why, the bar resting on it: in a fight, inside a command, alone. */
  const partyOrder = (): Partial<Item> => {
    const why =
      g.s.mapId === 0xff
        ? 'Not in a fight.'
        : midCommand
          ? 'Not in the middle of a command: finish it, then pause.'
          : newOrderOffer(g) === 'show'
            ? null
            : 'Needs two companions to swap: the Avatar always leads.';
    return why ? { enabled: false, rest: true, note: why } : {};
  };
  g.pause(true);
  try {
    let at = 0;
    for (;;) {
      const lines: Setting[] = [
        // The journal and the map are the command menu's, where play is (everything below).
        { label: 'Resume' },
        {
          // At hand wherever the next fight may be (the ultima3 port's). A press turns it on through Off, Allies and
          // All. Turned on in the thick of a fight, it takes up the turn when the menu closes; changing it spends no turn.
          label: `Auto combat: ${AUTO_COMBAT_NAMES[g.options.autoCombat]}`,
          note: AUTO_COMBAT_NOTES[g.options.autoCombat],
          act: () => {
            setAutoCombat(g, AUTO_COMBAT[(AUTO_COMBAT.indexOf(g.options.autoCombat) + 1) % AUTO_COMBAT.length]);
          },
        },
        {
          // New order (cmds.ts), the port's Party order: set seldom, so here beside Auto combat rather than among the
          // commands of play. Chosen, the menu closes and the command asks which two to swap, as it always has.
          label: 'Party order',
          ...partyOrder(),
          act: async () => {
            await restoreView(g);
            return c('N');
          },
        },
        audioLine(g),
        gameplayLine(g, true),
        appearanceLine(g),
        {
          label: 'Settings',
          act: () => settingsMenu(g).then(() => undefined),
        },
        {
          label: 'Help',
          key: c('H'),
          act: async () => {
            const { helpPages } = await import('./help.ts');
            await showPages(g, helpPages(g));
          },
        },
        {
          // Small changes to the world to spare the grind (cheats.ts), behind Help's Y in the ultima3 port.
          label: 'Cheats',
          act: () => cheatsMenu(g),
        },
        ...updateLine(),
        {
          // Pointers for a new player (tips.ts): where to go first, and how the game's parts work.
          label: 'Tips',
          act: async () => {
            const { tipsMenu } = await import('./tips.ts');
            await tipsMenu(g);
          },
        },
        {
          label: 'Save game',
          key: SAVE_NOW,
          enabled: g.s.mapId !== 0xff && !midCommand,
          ...noSave(g.s.mapId !== 0xff && !midCommand),
          act: async () => {
            await restoreView(g);
            return SAVE_NOW;
          },
        },
        {
          // The last save or one of the seven before it, taken up again (storage.ts), as All is lost offers them: asked
          // first, all played since being undone. In a fight too - a fight going badly is when it is wanted - but not
          // inside a command.
          label: 'Load a save',
          enabled: !midCommand,
          ...noSave(!midCommand),
          act: async () => {
            const { chooseSave, localSave, savedWhen } = await import('./storage.ts');
            const { takeUp } = await import('./ultima5Saves.ts');
            const kept = localSave.all();
            if (kept.length === 0) {
              await showText(g, 'Load a save', wrap('No game has been saved yet.'));
              return;
            }
            const chosen = await chooseSave(g, 'Load a save', kept);
            if (!chosen) return;
            if (
              !(await confirm(g, `Back to the game saved ${savedWhen(chosen.data.written, Date.now(), true)}? All played since is undone.`))
            )
              return;
            await takeUp(g, chosen.data);
          },
        },
        {
          label: 'Save and quit',
          enabled: g.s.mapId !== 0xff && !midCommand,
          ...noSave(g.s.mapId !== 0xff && !midCommand),
          act: async () => {
            if (!(await confirm(g, 'Save the game and leave off playing?'))) return;
            const { localSave } = await import('./storage.ts');
            // Left only once it is kept: where it could not be, the player is told, and plays on.
            if (!localSave.write(g)) {
              await showText(
                g,
                'Not saved!',
                wrap('The game could not be saved here. It goes on as it was; the saves before are as they were.'),
              );
              return;
            }
            location.reload();
            return 0;
          },
        },
      ];
      at = await chooseListening(g, 'Paused', lines, at);
      if (at < 0 || at === 0) {
        await restoreView(g);
        return 0;
      }
      const done = await lines[at].act?.();
      if (typeof done === 'number') return done;
    }
  } finally {
    g.pause(false);
    g.sound.hearMusic?.(false);
  }
}

// --- Settings ---------------------------------------------------------------------------------------------

const onOff = (b: boolean): string => (b ? 'On' : 'Off');
const MAP_NAMES: Record<DungeonMap, string> = { off: 'Off', small: 'Corner', full: 'Whole view' };
const RULES_NAMES: Record<Rules, string> = { story: 'Story', modern: 'Modern', classic: 'Classic' };
/** What each Rules choice is, under its line: Ultima V's words, a game's own first (settingWords). */
const RULES_NOTES: Record<Rules, string> = {
  story: 'As Modern, never hungry, fights eased more.',
  modern: 'Poison, hunger never kill; XP shared; fights eased; a deeper Path.',
  classic: 'As in 1988, as the Apple II has it: deadly.',
};
const INPUT_NAMES: Record<InputMode, string> = { letters: 'Classic', controller: 'Controller' };
/** The Interface line's note under each interface, the one in use first: Ultima V's words, a game's own first (settingWords). */
const INTERFACE_NOTES: Record<TileSet, string> = {
  standard: "Enhanced: smooth motion, combat aids. Retro: 1988's.",
  original: "Retro: 1988's. Enhanced: smooth motion, combat aids.",
};
/** The Status letters line's note: Ultima V's states' letters, a game's own first (settingWords). */
const STATUS_LETTERS_NOTE = "P, S, D or C on the frame beside a member, as well as their name's colour.";

/** The edition and the app's version as Settings' last lines, greyed: the version where the page has one. */
function editionLines(g: GameCore): Setting[] {
  const version = g.hooks.version?.();
  return [{ label: 'Enhanced Edition', enabled: false }, ...(version ? [{ label: `Version ${version}`, enabled: false }] : [])];
}

/** One line of the Settings menu: what it says, and what choosing it does. */
export interface Setting extends Item {
  /** What choosing it does; a command key returned here leaves the menu with it. */
  act?: () => void | number | Promise<void | number>;
  /** The music heard while the bar is on it (the Music and Music level lines), the menu holding it paused elsewhere. */
  listen?: boolean;
}

/**
 * `choose` over a menu that holds the music (the pause menu, Settings): the music heard while the bar is on a line
 * that `listen`s - and, chosen, while its dial turns - and paused again as the bar leaves it.
 */
async function chooseListening(g: GameCore, title: string, lines: Setting[], at: number): Promise<number> {
  const watch = g.choiceWatch;
  g.choiceWatch = (i, shown) => {
    watch?.(i, shown);
    if (shown === title) g.sound.hearMusic?.(lines[i]?.listen === true);
  };
  try {
    return await choose(g, title, lines, at);
  } finally {
    g.choiceWatch = watch;
  }
}

/** A level as the mixer shows it: Off, or 10% to 100%. */
const percent = (n: number): string => (n === 0 ? 'Off' : `${n * 10}%`);

/**
 * A level dialled (amount) and heard as it turns: `set` puts each value in the options and it is taken up at once
 * (g.hooks.applyOptions), so the music changes under the dial - heard, its line being one that listens; `sample`,
 * where given, is played at each step (a sound effect has nothing to hear otherwise). B puts the level back, and that
 * is heard too.
 */
async function dialLevel(g: GameCore, title: string, start: number, set: (n: number) => void, sample?: () => void): Promise<void> {
  const hear = (n: number): void => {
    set(n);
    g.hooks.applyOptions?.(g.options);
    sample?.();
  };
  const n = await amount(g, 0, LEVELS, start, { title, shown: percent, onChange: hear });
  if (n >= 0) set(n);
}

/** The music's level (Audio). */
function musicLine(g: GameCore): Setting {
  const o = g.options;
  return {
    label: `Music level: ${percent(o.musicLevel)}`,
    note: musicNote() ?? "The Upgrade's music: Off, or 10% to 100%.",
    listen: true,
    act: () => dialLevel(g, 'Music level', o.musicLevel, (n) => void (o.musicLevel = n)),
  };
}

/** Each Sound choice's name on its line (the menu is 21 columns: the year of the 2026 ones is in their note). */
const SOUND_NAMES: Record<SoundChoice, string> = {
  classical: 'Classical',
  electronic: 'Electronic',
  ambient: 'Ambient',
  upgrade: 'Upgrade (2001)',
};
/** What each Sound choice is, under its line: its music, and its effects with it - Ultima V's words, a game's own first (soundNote). */
const SOUND_NOTES: Record<SoundChoice, string> = {
  classical: 'Classical (2026): orchestra, consort, piano; effects to match.',
  electronic: 'Electronic (2026): analog synths and keys; effects to match.',
  ambient: 'Ambient (2026): soft pads, bells, mallets; effects to match.',
  upgrade: "Upgrade (2001): the Upgrade's MIDI and 1988's PC speaker.",
};

/** The Sound: the music and its effects together (Audio). */
function soundLine(g: GameCore): Setting {
  const o = g.options;
  return {
    label: `Sound: ${SOUND_NAMES[o.soundChoice]}`,
    note: soundNote(o.soundChoice) ?? SOUND_NOTES[o.soundChoice],
    listen: true,
    act: () => void (o.soundChoice = SOUND_CHOICES[(SOUND_CHOICES.indexOf(o.soundChoice) + 1) % SOUND_CHOICES.length]),
  };
}

/** The sound effects' level, a step's sound played at each step (Audio). */
function effectsLevelLine(g: GameCore): Setting {
  const o = g.options;
  return {
    label: `Sound FX level: ${percent(o.effectsLevel)}`,
    note: 'The sound effects: Off, or 10% to 100%.',
    act: () =>
      dialLevel(
        g,
        'Sound FX level',
        o.effectsLevel,
        (n) => {
          o.effectsLevel = n;
          g.soundOff = n === 0;
        },
        () => menuSound(g, 'move'),
      ),
  };
}

/**
 * Settings: what is left over - the battery saver - and in play the keeping of the saved game.
 * At the title, with no Pause menu to hold them, Audio and Gameplay too. Each line carries what it does, so lines may
 * be added or moved without any numbering to keep in step.
 */
export function settingLines(g: GameCore, title = false): Setting[] {
  const o = g.options;
  return [
    { label: 'Back', note: '' },
    {
      // The map at rest after a quiet minute, till a press (screen.ts waitKey): for a phone left with the game open.
      label: `Battery saver: ${onOff(o.batterySaver)}`,
      note: 'The map stops moving after a minute with nothing pressed, until the next press.',
      act: () => void (o.batterySaver = !o.batterySaver),
    },
    // At the title, with no Pause menu to hold them, Audio, Gameplay and Appearance too: the same lists as the Pause
    // menu's.
    ...(title ? [audioLine(g), gameplayLine(g), appearanceLine(g)] : []),
    // A game carried in and out (transfer.ts): at the title these are Manage Saves' (characterMenu.ts), with Delete
    // Character and Remove game files.
    ...(title ? [] : transferLines(g)),
    // Which edition this is and its version, for a tester's report: grey, and the bar steps over them - a line each,
    // as the whole name and version are wider than the menu.
    ...editionLines(g),
  ];
}

/** What each look is, as Appearance's Look line says it (three rows at most): Ultima V's words, a game's own first (lookNote). */
const TILES_NOTES: Record<Tiles, string> = {
  'modern-pc': "Remastered: 1988's art redrawn for the Enhanced interface.",
  'pc-ega': "PC EGA: the 1988 PC game's own tiles.",
  'pc-cga': "PC CGA: the 1988 PC game's four-colour tiles.",
  'pc-vga': "Upgrade VGA: the fan-made VGA upgrade's tiles.",
  apple2: "Apple Color: the Apple II's own tiles, in colour.",
  apple2e: "Apple //e: the Apple II's, on a green monitor.",
  apple2c: "Apple //c: the Apple II's, on a white monitor.",
  x68k: "Sharp X68k: the Japanese X68000 release's.",
  c64: "C64: the Commodore 64's own tiles.",
};

/** The fonts' names in Appearance (Options.font), and what each is. */
const FONT_NAMES: Record<FontChoice, string> = { sixtyfour: 'SixtyFour', legible: 'Legible', dyslexic: 'Dyslexic', dos: 'DOS' };
/** Ultima V's words for each font, a game's own first (settingWords). */
const FONT_NOTES: Record<FontChoice, string> = {
  sixtyfour: "SixtyFour: the Modern look's own letters.",
  legible: 'Legible: Atkinson Hyperlegible Mono. Story pages too.',
  dyslexic: 'Dyslexic: OpenDyslexic Mono. Story pages too.',
  dos: "DOS: the 1988 game's own letters, 8 by 8.",
};

/**
 * Appearance: how the game looks - its look (the tiles, the frame and the dungeon), the party's status letters, the
 * font (any font in either interface), where dialog is shown, scanlines, smooth motion and the Retro interface's
 * dungeon map. The Pause menu's, and Settings' at the title.
 */
export function appearanceLines(g: GameCore): Setting[] {
  const o = g.options;
  const pc = o.tileSet !== 'standard';
  return [
    { label: 'Back', note: '' },
    {
      // The look, one set after another - its tiles, its frame and its dungeon (skins.ts): every set the game offers
      // under Enhanced (settings.ts looksOffered), all but Remastered under Retro; one choice for either interface.
      label: `Look: ${TILES_NAMES[o.tiles]}`,
      note: lookNote(o.tiles) ?? TILES_NOTES[o.tiles],
      act: () => {
        const offered = looksOffered(o.tileSet);
        o.tiles = offered[(offered.indexOf(o.tiles) + 1) % offered.length];
      },
    },
    {
      // The state's letter on the frame beside a member (P, S, D, C), as well as their name's colour: the Standard
      // look's, the EGA look showing it in the line as 1988 did.
      label: `Status letters: ${onOff(o.statusLetters)}`,
      note: settingWords().statusLetters ?? STATUS_LETTERS_NOTE,
      enabled: o.tileSet === 'standard',
      act: () => void (o.statusLetters = !o.statusLetters),
    },
    {
      // The lettering's font (screen.ts setFont), whatever the UX: SixtyFour, Legible, Dyslexic or DOS.
      label: `Font: ${FONT_NAMES[o.font]}`,
      note: settingWords().font?.[o.font] ?? FONT_NOTES[o.font],
      act: () => void (o.font = FONTS[(FONTS.indexOf(o.font) + 1) % FONTS.length]),
    },
    {
      // Where a townsman's words are shown (speech.ts): in the play area, or the log as 1988 had it.
      label: `Dialog: ${o.dialog === 'play' ? 'Play' : 'Log'}`,
      note: 'Play: what is said, in the play area. Log: in the message log.',
      act: () => void (o.dialog = o.dialog === 'play' ? 'log' : 'play'),
    },
    {
      // Each look its own: the PC (1988) look's on until turned off.
      label: `Scanlines: ${onOff(pc ? o.pcScanlines : o.scanlines)}`,
      note: 'Dark bands over the picture, as an old monitor had; each interface its own.',
      act: () => void (pc ? (o.pcScanlines = !o.pcScanlines) : (o.scanlines = !o.scanlines)),
    },
    // The Modern look's alone: the PC (1988) look steps from square to square, as 1988 did.
    ...(pc
      ? []
      : [
          {
            label: `Smooth motion: ${onOff(o.smoothMotion)}`,
            note: 'The map slides under the party, and whoever walks glides to the next square.',
            act: () => void (o.smoothMotion = !o.smoothMotion),
          },
        ]),
    // The EGA look's map over the dungeon's view; the Standard look's is switched by the Map command in a dungeon.
    ...(o.tileSet === 'standard'
      ? []
      : [
          {
            label: `Dungeon map: ${MAP_NAMES[o.dungeonMap]}`,
            note: "The level's map over the view: in a corner, over all of it, or none.",
            act: () => void (o.dungeonMap = o.dungeonMap === 'off' ? 'small' : o.dungeonMap === 'small' ? 'full' : 'off'),
          },
        ]),
  ];
}

/** Appearance (appearanceLines). */
export async function appearanceMenu(g: GameCore): Promise<number> {
  return optionsMenu(g, 'Appearance', () => appearanceLines(g));
}

/** The line that opens Appearance: on the Pause menu, below Gameplay, and in Settings at the title. */
function appearanceLine(g: GameCore): Setting {
  return {
    label: 'Appearance',
    note: 'How the game looks: the look, font, dialog, scanlines, smooth motion.',
    act: () => appearanceMenu(g).then(() => undefined),
  };
}

/** Export and Import saved game (transfer.ts): in play, Settings' lines; at the title, Manage Saves'. */
export function transferLines(g: GameCore): Setting[] {
  return [
    {
      label: 'Export saved game',
      key: c('E'),
      note: 'The game as text, to the clipboard or a file, to carry elsewhere.',
      enabled: !!g.hooks.transfer,
      act: async () => {
        const { exportGame } = await import('./transfer.ts');
        await exportGame(g);
      },
    },
    {
      label: 'Import saved game',
      key: c('I'),
      note: 'A game exported elsewhere, from the clipboard or a file.',
      enabled: !!g.hooks.transfer,
      act: async () => {
        const { importGame } = await import('./transfer.ts');
        if (!(await importGame(g))) return;
        // Taken up from the title, as a game loaded is.
        location.reload();
        return 0;
      },
    },
  ];
}

/**
 * Gameplay: how the game plays - the interface, its input, and the rules the port lets the player soften or keep as
 * 1988's.
 */
export function gameplayLines(g: GameCore): Setting[] {
  const o = g.options;
  return [
    { label: 'Back', note: '' },
    {
      // The interface (settings.ts tileSet, its values the looks' old names): the port's screen and conveniences, or
      // 1988's. Remastered is Enhanced's alone: Retro asks first, then takes PC EGA, the set it is drawn from.
      label: `Interface: ${o.tileSet === 'standard' ? 'Enhanced' : 'Retro'}`,
      note: settingWords().interface?.[o.tileSet] ?? INTERFACE_NOTES[o.tileSet],
      act: async () => {
        if (o.tileSet === 'original') {
          o.tileSet = 'standard';
          return;
        }
        if (o.tiles === 'modern-pc') {
          if (!(await confirm(g, 'Retro has no Remastered look: it changes to PC EGA, the look it is drawn from.'))) return;
          o.tiles = 'pc-ega';
        }
        o.tileSet = 'original';
      },
    },
    // Letters want a keyboard: the choice is a keyboard's to make (game.ts lastSource; the ultima3 port's).
    ...(g.lastSource === 'keyboard'
      ? [
          {
            label: `Input: ${INPUT_NAMES[o.input]}`,
            note: "Controller: keys act as a pad's buttons. Classic: a key for each command.",
            act: () => void (o.input = o.input === 'controller' ? 'letters' : 'controller'),
          },
        ]
      : []),
    {
      label: `Auto Pause: ${onOff(o.autoPause)}`,
      note: 'The Pause menu opens when the game loses focus, waiting for a command.',
      act: () => void (o.autoPause = !o.autoPause),
    },
    {
      label: `Rules: ${RULES_NAMES[o.rules]}`,
      note: settingWords().rules?.[o.rules] ?? RULES_NOTES[o.rules],
      act: () => void (o.rules = RULES[(RULES.indexOf(o.rules) + 1) % RULES.length]),
    },
    {
      // Snap attacks (settings.ts autoAim, its name once Auto aim).
      label: `Snap attacks: ${onOff(o.autoAim)}`,
      note: 'X (keyboard Q or C), or walking into a foe, strikes it, no crosshair.',
      act: () => void (o.autoAim = !o.autoAim),
    },
    {
      // The foe a snap attack would strike, marked in a fight (combat.ts snapMark): Snap attacks' own.
      label: `Snap targets: ${onOff(o.snapTargets)}`,
      note: 'In a fight, small arrows round the foe X would strike. LB/RB or [ ] pick another.',
      enabled: o.autoAim,
      act: () => void (o.snapTargets = !o.snapTargets),
    },
    {
      label: `Max input: ${INPUT_PACE_LABELS[o.maxInput]}`,
      note: 'How fast a held key, button or direction repeats.',
      act: () => void (o.maxInput = INPUT_PACE_NAMES[(INPUT_PACE_NAMES.indexOf(o.maxInput) + 1) % INPUT_PACE_NAMES.length]),
    },
  ];
}

/** How many lists of settings are open, one over another (optionsMenu). */
let settingsDepth = 0;

/** A menu of settings (`lines` as they now stand), each change kept and taken up as it is made. Returns a command key, or 0. */
async function optionsMenu(g: GameCore, title: string, lines: () => Setting[]): Promise<number> {
  let at = 0;
  const o = g.options;
  // The music paused while the settings are gone through (at the title too, where nothing else holds it), but on the
  // Music and Music level lines - held by the outermost list, so Gameplay opened from the title's Settings, closing,
  // does not let it go under the Settings still open.
  if (settingsDepth++ === 0) g.sound.setHeld('settings', true);
  try {
    for (;;) {
      const now = lines();
      at = await chooseListening(g, title, now, at);
      if (at < 0 || at === 0) {
        await restoreView(g);
        return 0;
      }
      const done = await now[at].act?.();
      if (typeof done === 'number') return done;
      saveOptions(o);
      g.hooks.applyOptions?.(o);
      // The map beside the dungeon's view, under the menu, in the look as it now is.
      g.play.settingChanged?.();
    }
  } finally {
    if (--settingsDepth === 0) {
      g.sound.setHeld('settings', false);
      g.sound.hearMusic?.(false);
    }
  }
}

/** Settings (settingLines); `title`, opened from the title, where it holds the Pause menu's Audio and Gameplay too. */
export async function settingsMenu(g: GameCore, title = false): Promise<number> {
  return optionsMenu(g, 'Settings', () => settingLines(g, title));
}

/** Gameplay (gameplayLines). */
export async function gameplayMenu(g: GameCore): Promise<number> {
  return optionsMenu(g, 'Gameplay', () => gameplayLines(g));
}

/** Audio: the Sound (the music and its effects) and how loud each is - the Pause menu's, and Settings' at the title. */
export function audioLines(g: GameCore): Setting[] {
  return [{ label: 'Back', note: '' }, soundLine(g), musicLine(g), effectsLevelLine(g)];
}

/** Audio (audioLines). */
export async function audioMenu(g: GameCore): Promise<number> {
  return optionsMenu(g, 'Audio', () => audioLines(g));
}

/** The line that opens Audio: on the Pause menu, and in Settings at the title. */
function audioLine(g: GameCore): Setting {
  return {
    label: 'Audio',
    note: 'The soundtrack, the sound effects, and how loud each is.',
    act: () => audioMenu(g).then(() => undefined),
  };
}

/**
 * The line that opens Gameplay: on the Pause menu, and in Settings at the title. In play, a new interface lays the
 * screen out again: the Enhanced panel and its borders, or 1988's (layout.ts).
 */
function gameplayLine(g: GameCore, inPlay = false): Setting {
  return {
    label: 'Gameplay',
    note: 'How the game plays: interface, input, rules and more.',
    act: async () => {
      const look = g.options.tileSet;
      await gameplayMenu(g);
      if (inPlay && g.options.tileSet !== look) await g.play.relayout?.();
    },
  };
}

/** A yes-or-no question as a menu. */
export async function confirm(g: GameCore, question: string, boxed = false): Promise<boolean> {
  const lines = wrap(question);
  const items: Item[] = [
    ...lines.map((l) => ({ label: l, enabled: false })),
    { label: '', enabled: false },
    { label: 'No', key: c('N') },
    { label: 'Yes', key: c('Y') },
  ];
  // The map's square, as every question in play and in Settings (at the title too); `boxed`, a box of its own - asked
  // of the title's menu, over its picture. At the title, framed in the warning's purple (titleTone).
  const before = warning;
  warning = true;
  try {
    return (await choose(g, 'Are you sure?', items, lines.length + 1, boxed)) === lines.length + 2;
  } finally {
    warning = before;
  }
}

/** The cheats: pick one, see what it did; one that moves the party ends the menus. */
async function cheatsMenu(g: Game): Promise<void> {
  const { cheatsFor, DEV_CHEATS } = await import('./cheats.ts');
  const { Konami } = await import('./konami.ts');
  // The Konami code, while the development cheats are off, turns them on (devMode.ts): said in the log, the list drawn
  // again with them in it.
  const konami = new Konami();
  const seen = g.choiceSeen;
  g.choiceSeen = (k, raw, title) => {
    // The Cheats list alone: not a menu a cheat opens (Add word's), nor the Pause menu over it.
    if (devMode() || title !== 'Cheats') return undefined;
    const got = konami.feed(k, raw);
    if (got !== 'done') return got;
    enableDevMode();
    const t = g.text;
    const was = t.current;
    t.select(Win.messages);
    g.print('\nDev cheats enabled - CAN BREAK YOUR GAME!\n');
    t.select(was);
    return 'again';
  };
  let at = 0;
  try {
    for (;;) {
      const list = cheatsFor(g, devMode());
      // The development build's own in red, to tell them from the player's.
      at = await choose(
        g,
        'Cheats',
        list.map((c) => ({ label: c.label, colour: DEV_CHEATS.includes(c) ? Colour.brightRed : undefined })),
        at,
      );
      if (at === -2) {
        at = 0;
        continue;
      }
      if (at < 0) return;
      const said = await list[at].apply(g);
      const { chargeCheat } = await import('./cheats.ts');
      // Its cost, where it moved the Modern karma: the answer faintly red, in the Standard look (modernKarma.ts tint).
      const cost = chargeCheat(g, list[at]);
      drawVitals(g);
      const lines = wrap(said);
      const tinted = cost < 0 && g.options.tileSet === 'standard';
      await showText(g, 'Cheats', lines, tinted ? lines.map(() => Colour.virtueDown) : undefined);
    }
  } finally {
    g.choiceSeen = seen;
  }
}

// --- The journal and the letter picker ----------------------------------------------------------------------

const PICKER_ROWS = ['ABCDEFGHIJK', 'LMNOPQRSTUV', 'WXYZ0123456', '789.,!?-\'"*'];
const SPECIAL = ['Space', 'Del', 'Done', 'Cancel'];

/**
 * The letter picker: a grid of letters for a controller to type with. A
 * word is built up and shown; Done hands it back with an Enter at its end,
 * Cancel hands back nothing. `mixedCase` keeps the case (names), with a
 * row of its own under Space for the case (abc or ABC), and Y to switch it
 * from anywhere; X rubs out a letter as Del does (the port's: B does too,
 * but backs out once the word is gone). A key typed goes straight through
 * to the prompt that opened it, which reads a keyboard itself - unless the
 * picker is the whole of the asking (`typed`: Cheats' Add word), where it
 * goes into the word, Backspace rubs out, and a keyboard's Enter is Done
 * where the keyboard is not read as a controller.
 */
export async function letterPicker(g: GameCore, mixedCase = false, restore = true, typed = false): Promise<number[]> {
  const t = g.text;
  const was = t.current;
  // At the title the picker is a panel over the screen, put back as it was by its caller: the boxes after it are the
  // title's own again (titlePanel), not a panel's - the address asked, the Appearance screen.
  const panelBefore = titlePanel;
  let word = '';
  let r = 0;
  let col = 0;
  let lower = false;
  /** The rows: the letters', then Space, Del, Done and Cancel, then (a name's) the case's, below Space. */
  const SPECIALS = PICKER_ROWS.length;
  const CASE = SPECIALS + 1;
  const rows = mixedCase ? CASE + 1 : SPECIALS + 1;
  const widthOf = (row: number): number => (row === CASE ? 1 : row === SPECIALS ? SPECIAL.length : PICKER_ROWS[row].length);
  const draw = (): void => {
    panel(g, 'Letters');
    put(g, 0, 2, `>${word}`.slice(-(WIDTH - 1)).padEnd(WIDTH));
    const cell = (x: number, y: number, text: string, on: boolean): void => {
      t.inverse = on;
      put(g, x, y, text);
      t.inverse = false;
    };
    for (let y = 0; y < PICKER_ROWS.length; y++) {
      for (let x = 0; x < PICKER_ROWS[y].length; x++) {
        const ch = PICKER_ROWS[y][x];
        cell(x * 2, 4 + y * 2, lower ? ch.toLowerCase() : ch, y === r && x === col);
      }
    }
    let x = 0;
    SPECIAL.forEach((label, i) => {
      cell(x, 4 + SPECIALS * 2, label, r === SPECIALS && i === col);
      x += label.length + 1;
    });
    if (mixedCase) cell(0, 4 + CASE * 2, lower ? 'ABC' : 'abc', r === CASE);
  };
  let result: number[] = [];
  for (;;) {
    draw();
    const width = widthOf(r);
    const k = await key(g);
    if (k === K.Left) col = (col + width - 1) % width;
    else if (k === K.Right) col = (col + 1) % width;
    else if (k === K.Up || k === K.Down) {
      r = (r + (k === K.Up ? rows - 1 : 1)) % rows;
      col = Math.min(col, widthOf(r) - 1);
    } else if (k === Pad.X) word = word.slice(0, -1);
    else if (k === Pad.Y) lower = mixedCase ? !lower : lower;
    else if (k === Pad.B || k === K.Escape) {
      if (word.length) word = word.slice(0, -1);
      else break;
    } else if (typed && k === K.Backspace) word = word.slice(0, -1);
    else if (typed && k === K.Enter && g.options.input !== 'controller') {
      result = [...word].map((ch) => ch.charCodeAt(0)).concat(K.Enter);
      break;
    } else if (k === Pad.A || k === K.Enter) {
      if (r < SPECIALS) {
        const ch = PICKER_ROWS[r][col];
        word += lower ? ch.toLowerCase() : ch;
      } else if (r === CASE) lower = !lower;
      else if (col === 0) word += ' ';
      else if (col === 1) word = word.slice(0, -1);
      else if (col === 2) {
        result = [...word].map((ch) => ch.charCodeAt(0)).concat(K.Enter);
        break;
      } else break;
    } else if (typed && k >= 0x20 && k < 0x7f) word += mixedCase ? String.fromCharCode(k) : String.fromCharCode(k).toUpperCase();
    else if (k > 0x20 && k < 0x7f) {
      // A keyboard typed into the picker types straight through.
      result = [k];
      break;
    }
  }
  t.select(was);
  titlePanel = panelBefore;
  if (restore) await restoreView(g);
  return result;
}
