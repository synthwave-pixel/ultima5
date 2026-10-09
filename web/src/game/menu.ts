/**
 * menu.ts
 *
 * The modern engine's menus, drawn over the map in the game's own font so
 * they could pass for the original's: the command menu (what the
 * surroundings call for first, the rest after, each with its letter so
 * the keyboard is learned along the way), Settings, the journal and the
 * letter picker that lets a controller type names and words.
 */

import { saysWord } from './cmds.ts';
import { actorTileAt } from './actors.ts';
import { foesAbout } from './bumpAct.ts';
import { clearBorderTitle, drawVitals, updateFrame, Win } from './frame.ts';
import { drawTextCard } from './shopCard.ts';
import { CF, Game } from './game.ts';
import { menuKey, PAUSED, queueKeys } from './input.ts';
import { K, Pad, SAVE_NOW } from './io.ts';
import { somethingBeside } from './items.ts';
import { itemCounts, nextHeld } from './zstats.ts';
import { holdFullPanel } from './layout.ts';
import { drawSwitchCard } from './readyCard.ts';
import { journalTop, type JournalLine } from './journal.ts';
import { lootField, lootOffer } from './loot.ts';
import { Status } from './save.ts';
import { shortcutCasts, SPELL_EFFECTS } from './magic.ts';
import type { Keyword } from './talk.ts';
import { sayable, talksBackwards, townsfolkSaying } from './words.ts';
import { KEYWORD_LABELS } from './keywordLabels.ts';
import {
  attackOffer,
  fireOffer,
  getOffer,
  campWanted,
  holeUpLabel,
  holeUpOffer,
  jimmyOffer,
  klimbOffer,
  signAhead,
  newOrderOffer,
  openOffer,
  stealChestOffer,
  stealOffer,
  pushOffer,
  searchOffer,
  talkOffer,
  onlySide,
  yellOffer,
  type Offer,
} from './targets.ts';
import {
  AUTO_COMBAT,
  RULES,
  LEVELS,
  MUSIC_VOICES,
  PC_TILES,
  saveOptions,
  TILES,
  TILES_NAMES,
  type AutoCombat,
  type DungeonMap,
  type InputMode,
  type MusicVoice,
  type Rules,
} from './settings.ts';
import { A, T } from './tiles.ts';
import { tileAt } from './world.ts';
import { Colour } from '../ui/colours.ts';
import { devMode, enableDevMode } from '../devMode.ts';

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
const key = (g: Game): Promise<number> => menuKey(g);

/** Put the map back as it was before a menu covered it. */
export async function restoreView(g: Game): Promise<void> {
  g.draw.chromeBox?.(null);
  // At the title there is no map or party to put back (a game's stats would come up over it): what opened the menu
  // draws the title again itself.
  if (!g.inPlay) return;
  if (g.inDungeon) {
    const { refresh } = await import('./dungeon.ts');
    // The corridor's picture is smaller than the map's square: what a menu drew in the margin round it goes first.
    g.draw.pen = 0;
    g.draw.fill(8, 8, 0xb7, 0xb7);
    refresh(g);
  } else {
    g.viewDirty = 1;
    updateFrame(g);
  }
  drawVitals(g);
}

/** Text at (x, y) in the menus' window, a character at a time, never wrapping or scrolling it. */
function put(g: Game, x: number, y: number, text: string): void {
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
export function box(g: Game, title: string, width: number, rows: number): void {
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
  else d.chrome?.(true, 0, [x1, y1, x2, y2]); // at the title, its lines copper as the panel's frame about it
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
export function framedBox(g: Game, title: string, width: number, rows: number): void {
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
function framed(g: Game, x1: number, y1: number, x2: number, y2: number): void {
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
  d.chrome?.(true, 0, [x1, y1, x2, y2]);
}

/** How many pixels a frame's corner leaves bare on each of its first rows, from the outside in. */
const CORNER = [5, 3, 2, 1, 1];

/** Draw a menu panel's frame and title; the text window is left selected. */
function panel(g: Game, title: string): void {
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
function row(g: Game, y: number, item: Item | undefined, chosen: boolean, lettered = true): void {
  const t = g.text;
  const w = t.win;
  const letter = item?.key && item.key > 0x20 && item.key < 0x7f ? String.fromCharCode(item.key) : ' ';
  const text = item ? (lettered ? `${letter} ${item.label}` : item.label) : '';
  const fg = w.fg;
  if (item?.colour !== undefined) w.fg = item.colour;
  if (item && (item.enabled === false || item.dim)) w.fg = 8;
  if (chosen) t.inverse = true;
  put(g, 0, y, text.padEnd(cols));
  t.inverse = false;
  w.fg = fg;
}

/**
 * What the player may say to the townsman they are talking to: the words
 * they have learnt that this one answers, and the two the game always
 * answers. A word whose answer has been heard already is drawn grey but
 * may be said again. The last line takes leave. Nothing is typed here: a
 * list that offered letters would have a controller's player guessing at
 * words, and none need be guessed - a word from a guide is added to what
 * is known in Cheats (Add word), and said from here like any other.
 *
 * Returns what to say; 'BYE' takes leave.
 */
export async function sayMenu(g: Game, keywords: Keyword[], own?: ReadonlySet<string>): Promise<string> {
  const s = g.s;
  const npc = g.talk.npc;
  type Say = { item: Item; word: string; standard: boolean; mark: number | string };
  const lines: Say[] = [];
  const add = (label: string, word: string, mark: number | string, standard = false, dim = g.words.wasHeard(s.mapId, npc, mark)): void => {
    lines.push({ item: { label, dim }, word, standard, mark });
  };
  // Name and Job first (Work says what Job says, and Thank takes leave as Bye does, so neither is offered twice).
  add('Name', 'NAME', 'name', true);
  add('Job', 'JOB', 'job', true);
  // Words that lead to the same reply are offered once: the first of them the player knows. It greys once the reply
  // has been heard, by whichever of them it was asked.
  const heard = new Set<string>();
  keywords.forEach(({ dest }, i) => g.words.wasHeard(s.mapId, npc, i) && heard.add(dest));
  const offered = new Set<string>();
  // A townsman whose own keywords include "job" is answered by the game's Job before his own is looked at, so
  // his line would be a second Job that never greys: the five the game answers itself are not offered twice.
  // Nor is a word the game would take for swearing - a townsman's "crotchety" begins as one of the words it
  // scolds the player for, and said, it earns the scolding and never his answer.
  const always = g.data.table(0x4aa8, 0x22);
  const said = townsfolkSaying(g);
  // (A townsman whose own words are not known - none given - is taken as one who might talk backwards.)
  const backwards = !own?.size || talksBackwards(own, said);
  keywords.forEach(({ stub, dest }, i) => {
    if (stub.length < 3) return; // a stub of a letter or two would answer to half the vocabulary
    // Labelled with the townsman's own word for it, where it has been heard (words.ts forStub).
    const word = g.words.forStub(stub, false, { own, said, backwards, reviewed: KEYWORD_LABELS[g.talk.labels + stub.toUpperCase()] });
    if (!word || always.some((w) => saysWord(w, word.toUpperCase()))) return;
    if (offered.has(dest)) return;
    offered.add(dest);
    add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(), sayable(stub, word), i, false, heard.has(dest));
  });
  // What has not been asked comes first, and the two the game always answers lead it: a player who knows
  // nothing of this townsman is nudged towards their name and their trade before anything else.
  const rank = (l: Say): number => (l.item.dim ? 2 : 0) + (l.standard ? 0 : 1);
  lines.sort((a, b) => rank(a) - rank(b));
  const items = lines.map((l) => l.item);
  items.push({ label: 'Take leave' });
  const at = await choose(g, 'Say', items);
  if (at < 0 || at >= lines.length) return 'BYE';
  g.talk.chosen = lines[at].mark;
  return lines[at].word;
}

/**
 * A question with a few answers, in a box over the map; the view is put
 * back when it is answered. The index chosen, or -1 for B.
 */
export async function ask(g: Game, title: string, labels: string[], start = 0): Promise<number> {
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
export async function askYesNo(g: Game): Promise<boolean> {
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
  g: Game,
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
 * The player's answer to a townsman's question: whatever the question is
 * listening for that the player has heard said somewhere - the
 * Resistance's password, a name - and nothing they have not. Yes and No
 * where it listens for either (most do); a question that listens for
 * neither ("Who dost thou think is the rightful ruler of Britannia?",
 * Greyson's) is not a yes-or-no one, and is offered "I know not" instead,
 * which has the reply to any other answer. `own` is an answer that is
 * simply theirs to give: their name, asked for. `again`, a question asked
 * until it is answered rightly, may be walked away from.
 */
export async function answerMenu(
  g: Game,
  expected: string[],
  own?: string,
  riddle?: { tried: Set<string> },
  again = false,
): Promise<string> {
  const yesNo = (stub: string): boolean => /^(y|ye|yes|n|no)$/i.test(stub);
  const open = !own && !riddle && expected.length > 0 && !expected.some(yesNo);
  const lines: { label: string; word: string; dim?: boolean }[] = [];
  if (own) lines.push({ label: own, word: own });
  else if (riddle) {
    // A question asked until it is answered rightly, whose answer is worked out rather than heard (the next three
    // notes of Lord Kenneth's tune, read in 1988 off the score in the Book of Lore): the answer is offered among
    // its own letters in other orders, and a wrong one greys once it has been tried. Easier than the original, and
    // meant to be: a controller has no way to spell, and no way out of a question asked for ever.
    for (const stub of expected) {
      if (/^(y|ye|yes|n|no)$/i.test(stub)) lines.push(/^y/i.test(stub) ? { label: 'Yes', word: 'YES' } : { label: 'No', word: 'NO' });
      else for (const word of scrambles(stub.toUpperCase())) if (!lines.some((l) => l.word === word)) lines.push({ label: word, word });
    }
    for (const l of lines) l.dim = riddle.tried.has(l.word);
  } else {
    if (!open) lines.push({ label: 'Yes', word: 'YES' }, { label: 'No', word: 'NO' });
    for (const stub of expected) {
      // A letter alone is a way of saying yes (Malik's "o.k.?" listening for O), which Yes says: not a word to offer -
      // it would be any word that begins with it.
      if (yesNo(stub) || stub.trim().length < 2) continue;
      const own = g.talk.own;
      // Labelled as the townsman's own words would have it, as the Say list is (Greyson's mantra is Compassion, not
      // "complex"; Fiona's knowledge is of Covetous, not Cove).
      const said = townsfolkSaying(g);
      const word = g.words.forStub(stub, false, {
        own,
        said,
        reviewed: KEYWORD_LABELS[g.talk.labels + stub.toUpperCase()],
        backwards: !own.size || talksBackwards(own, said),
      });
      if (word && !lines.some((l) => l.word === sayable(stub, word)))
        lines.push({ label: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(), word: sayable(stub, word) });
    }
  }
  // A question goes on being asked until it is answered; only a name may be kept to oneself - and a riddle may be
  // walked away from, which the original did not allow, since there the answer could always be typed.
  if (own) lines.push({ label: 'Say nothing', word: '' });
  if (open) lines.push({ label: 'I know not', word: knowNot(expected) });
  if (riddle || (open && again)) lines.push({ label: 'Take leave', word: LEAVE });
  const at = await choose(
    g,
    'Answer',
    lines.map((l) => ({ label: l.label, dim: l.dim })),
  );
  if (riddle) {
    if (at < 0) return LEAVE;
    riddle.tried.add(lines[at].word);
    return lines[at].word;
  }
  // Backing out of a question is No (or, to one that is not a yes-or-no question, I know not): the nearest a
  // controller has to turning away.
  return at < 0 ? (own ? '' : open ? knowNot(expected) : 'NO') : lines[at].word;
}

/** "I know not", as said: what no answer the question listens for begins (the reply to any other, TALK_096e). */
function knowNot(expected: string[]): string {
  const said = 'I KNOW NOT';
  return expected.some((stub) => saysWord(stub, said)) ? '?' : said;
}

/** What answerMenu returns for walking away from a riddle (talk.ts ends the conversation on it). */
export const LEAVE = '\x1b';

/**
 * A word among its own letters in other orders: itself and up to three
 * others, in alphabetical order so its place says nothing. The same
 * every time, so a wrong one that has been greyed stays where it was.
 */
export function scrambles(word: string): string[] {
  const all = new Set<string>();
  const permute = (left: string, made: string): void => {
    if (all.size > 200) return;
    if (!left) all.add(made);
    for (let i = 0; i < left.length; i++) permute(left.slice(0, i) + left.slice(i + 1), made + left[i]);
  };
  permute(word, '');
  all.delete(word);
  const others = [...all].sort();
  // Spread the picks through the orders, from a number made of the word, rather than taking the first three.
  let seed = [...word].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const picked: string[] = [];
  while (picked.length < 3 && others.length) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    picked.push(...others.splice((seed >>> 8) % others.length, 1));
  }
  return [word, ...picked].sort();
}

/**
 * A word the game itself keeps a list of - a mantra, a virtue, a word of
 * power - asked for as the original asks, or chosen from those the player
 * has heard where the keyboard is read as a controller. Returns what to
 * say, or '' for nothing.
 */
export async function askWord(
  g: Game,
  max: number,
  title: string,
  choices: string[],
  stubs = false,
  known = false,
  twoColumns = false,
  start = '',
): Promise<string> {
  const { getString } = await import('./input.ts');
  if (g.options.input !== 'controller') return getString(g, max);
  const words: string[] = [];
  const items: Item[] = [];
  for (const choice of choices) {
    // The game's lists are of whole words (a mantra, a name) unless the caller says they are `stubs` (the lore's
    // topics, the first four letters of a password), which stand for whatever begins with them. A list the player
    // is taken to know already (the eight virtues, the manual's) is offered whole, in the game's own spelling.
    const word = known ? choice.toUpperCase() : g.words.forStub(choice, !stubs);
    if (!word || words.includes(word)) continue;
    words.push(word);
    items.push({ label: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() });
  }
  items.push({ label: 'Say nothing' });
  // (In two columns, boxed low in the view, where the scene above should stay in sight: a shrine's altar.)
  // The bar on `start` where it is offered (the word just chanted, chanted again).
  const from = Math.max(0, words.indexOf(start.toUpperCase()));
  const at = twoColumns ? await chooseTwoColumns(g, title, items, from) : await choose(g, title, items, from);
  const said = at < 0 || at >= words.length ? '' : words[at];
  g.print(said);
  g.printChar('\n');
  return said;
}

/**
 * A list to choose from, over the map. Up and down move (and wrap), left
 * and right a page where the list is longer than it shows (else as up and
 * down), Enter or A chooses, Escape, B or Space goes back; a letter
 * chooses the item it stands for. The index chosen, or -1 (-2: to be drawn anew, Game.choiceSeen).
 */
/** What choose returns where the opener's key hook (Game.choiceKey) left the list, to show something over it. */
export const LEFT_FOR_HOOK = -3;

export async function choose(g: Game, title: string, items: Item[], start = 0, boxed = false): Promise<number> {
  const t = g.text;
  const was = t.current;
  const noted = !boxed && items.some((it) => it.note);
  const rows = boxed ? Math.min(items.length, HEIGHT - 6) : HEIGHT - 3 - (noted ? NOTE_ROWS + 1 : 0);
  // A box's notes (the port's): under its lines, after a blank row, as many rows as its longest note wants (three at
  // most), the box as wide as the view's square to hold them.
  const boxNotes = boxed ? Math.min(BOX_NOTE_ROWS, Math.max(0, ...items.map((it) => (it.note ? wrap(it.note).length : 0)))) : 0;
  let at = Math.max(0, Math.min(start, items.length - 1));
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
        rows + (boxNotes ? boxNotes + 1 : 0),
      );
    else panel(g, title);
  };
  frame();
  const draw = (): void => {
    if (at < top) top = at;
    if (at >= top + rows) top = at - rows + 1;
    const head = boxed && !title ? 0 : 2;
    for (let r = 0; r < rows; r++) row(g, r + head, items[top + r], top + r === at, lettered);
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
    const k = await menuKey(g, boxed ? items.flatMap((it) => (it.key ? [it.key] : [])) : []);
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
export async function chooseTwoColumns(g: Game, title: string, items: Item[], start = 0): Promise<number> {
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
  let at = Math.max(0, Math.min(start, items.length - 1));
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
  picture?: (g: Game, at: { x0: number; y0: number; put: (x: number, y: number, text: string, fg?: number) => void }) => void;
}

/** The lines a page holds, under its title. */
export const PAGE_LINES = HEIGHT - 3;
/** How wide a page's line may be. */
export const PAGE_WIDTH = WIDTH;

/**
 * Pages over the map, one at a time (the ultima3 port's Help): A, Enter or right turns to the next, and past the last
 * closes; left goes back; B or Escape closes. The title counts the pages; the keys go unsaid, as a menu's do.
 */
export async function showPages(g: Game, pages: Page[]): Promise<void> {
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
export async function showText(g: Game, title: string, lines: string[], colours: (number | undefined)[] = []): Promise<number> {
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
  return out;
}

// --- The command menu -------------------------------------------------------------------------------

const c = (ch: string): number => ch.charCodeAt(0);
/** A controller's buttons, as keys (io.ts Pad). */
const BUTTONS = new Set<number>(Object.values(Pad));
/** The menu's keys for the spells the moment calls for (shortcutCasts), one each. */
const SHORTCUT = 0x110;
/** Loot and Leave's key in the command menu (loot.ts). */
const LOOT = 0x108;
/** The dungeon's Drink: Look at the fountain, and drink (dungeon.ts lookInDungeon, Game.drinkPreset). */
const DRINK = 0x104;
/** The dungeon's Read sign: the sign on the wall ahead, printed in the log (dungeon.ts readSignAhead). */
const READ_SIGN = 0x105;
/**
 * Steal and Steal from chest (targets.ts stealOffer, stealChestOffer): Get and Open, of what is another's, under keys
 * of their own so that a Get or an Open the menu also offers does not take their place.
 */
const STEAL = 0x10a;
const STEAL_CHEST = 0x10b;
/** Wait in a towne (cmds.ts waitInTown): the hours passed off a bed. */
const WAIT = 0x10c;

/** The four squares around the party. */
function around(g: Game): [number, number][] {
  const s = g.s;
  return [
    [s.x, s.y - 1],
    [s.x + 1, s.y],
    [s.x, s.y + 1],
    [s.x - 1, s.y],
  ];
}

/** Someone to talk to beside the party, or across a counter. */
function someoneNear(g: Game): boolean {
  const s = g.s;
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    for (let d = 1; d <= 2; d++) {
      const t = actorTileAt(g, s.x + dx * d, s.y + dy * d, s.level);
      if (t >= 0x40 && t !== 0xfc) return true;
    }
  }
  return false;
}

/**
 * Whether Board is to be had where the party is, `under` the actor there - as Board itself takes it (cmds.ts
 * boardCommand): on foot, a horse, a carpet lying where it was left (0x1b), a skiff or a ship; from a skiff or a
 * carpet, a ship - the skiff stowed aboard, the carpet packed (canBoardShip), a party rowed back to its ship having no
 * other way aboard.
 */
function canBoard(g: Game, under: number): boolean {
  const p = g.s.partyTile;
  const ship = (under & 0xfc) === 0x24;
  if (p === A.Avatar) return (under & 0xfe) === 0x10 || under === 0x1b || (under & 0xfc) === 0x28 || ship;
  return ship && ((p & 0xfe) === 0x14 || (p & 0xfe) === 0x1c || (p & 0xfc) === 0x28);
}

const ENTRANCES: number[] = [
  T.Hut,
  T.Keep,
  T.Village,
  T.Towne,
  T.Castle,
  T.Lighthouse,
  T.PalaceBlackthorn,
  T.CastleLB,
  T.Shrine,
  T.Codex,
  T.Cave,
  T.Mine,
  T.Dungeon,
  T.Ruins,
];

/**
 * The weapon in the hands of whoever would strike, and whether it
 * reaches: the menu says what is readied, and leads with it when it can
 * be thrown or shot (the port's, from the ultima3 port).
 */
function readied(g: Game): { name: string; ranged: boolean } | null {
  const s = g.s;
  let who = s.activeMember;
  if (s.mapId > 0x7f && s.combatTurn < 0x20) who = g.combat[s.combatTurn].who;
  if (who === 0xff || who >= s.partySize) {
    who = 0xff;
    for (let i = 0; i < s.partySize && who === 0xff; i++) {
      const st = s.members[i].status;
      if (st === Status.Good || st === Status.Poisoned) who = i;
    }
  }
  if (who === 0xff || who >= s.partySize) return null;
  const names = g.data.table(0x1962, 0x38);
  const damage = g.data.bytes(0x15fc, 0x38);
  const reach = g.data.bytes(0x1664, 0x38);
  let best: { name: string; ranged: boolean } | null = null;
  for (const slot of [2, 3, 0]) {
    const w = s.members[who].equips[slot];
    if (w === 0xff || !damage[w]) continue;
    const item = { name: (names[w] ?? '').trim(), ranged: reach[w] > 0 };
    if (!item.name) continue;
    if (!best || (item.ranged && !best.ranged)) best = item;
  }
  return best;
}

/** The Attack entry, named for what is in hand. */
function attackItem(g: Game): Item {
  const arm = readied(g);
  return { label: arm ? `Attack (${arm.name})` : 'Attack', key: c('A') };
}

/** What the surroundings call for, first. */
export function contextual(g: Game): Item[] {
  const s = g.s;
  const out: Item[] = [];
  const where = g.commandPrompt;
  // Seated at a harpsichord (town.ts numberKey): its notes are the number keys, which a controller has not.
  if (where === 'town' && g.view[6 * 32 + 5] === 0x8d) out.push({ label: 'Play', key: 0x100 + 6 });
  const near = around(g);
  const foeNear = (): boolean =>
    near
      .concat([
        [s.x - 1, s.y - 1],
        [s.x + 1, s.y - 1],
        [s.x - 1, s.y + 1],
        [s.x + 1, s.y + 1],
      ])
      .some(([x, y]) => {
        const t = actorTileAt(g, x, y, s.level);
        return (t >= 0x80 && t !== 0xfc) || (t & 0xfc) === 0x2c;
      });
  if (where === 'outdoors' && ENTRANCES.includes(tileAt(g, s.x, s.y))) out.push({ label: 'Enter', key: c('E') });
  // A horse is boarded where it is bought, in a towne's stable, and left at a towne's door: Board and X-it
  // are for towne and country both.
  if (where === 'outdoors' || where === 'town') {
    const under = actorTileAt(g, s.x, s.y, s.level);
    if (canBoard(g, under)) out.push({ label: 'Board', key: c('B') });
    if (s.partyTile !== A.Avatar) out.push({ label: 'X-it', key: c('X') });
  }
  if (where === 'outdoors') {
    if (foeNear()) out.push(attackItem(g));
    if ((s.partyTile & 0xf8) === 0x20) out.push({ label: 'Fire cannons', key: c('F') });
    if (s.grapple !== 0 && near.some(([x, y]) => tileAt(g, x, y) === 0xc)) out.push({ label: 'Klimb', key: c('K') });
  } else if (where === 'town') {
    if (someoneNear(g)) out.push({ label: 'Talk', key: c('T') });
    const doors = near.map(([x, y]) => tileAt(g, x, y));
    if (doors.some((t) => t >= 0xb8 && t <= 0xbb)) out.push({ label: 'Open', key: c('O') });
    if (doors.some((t) => t === 0xb9 || t === 0xbb)) out.push({ label: 'Jimmy', key: c('J'), enabled: s.keys !== 0 });
    // Furniture beside the party that moves (targets.ts pushOffer): Push, for what a bump does not reach - a chair, or
    // a barrel a bump only searches.
    if (pushOffer(g) === 'show') out.push({ label: 'Push', key: c('P') });
    const here = tileAt(g, s.x, s.y);
    if (here === T.LadderUp || here === T.LadderDown || here === 0xc8 || here === 0xc9) out.push({ label: 'Klimb', key: c('K') });
    if (here === T.Bed) out.push({ label: 'Sleep', key: c('H') });
  } else if (where === 'dungeon') {
    const cell = s.dungeon[s.level * 0x40 + s.y * 8 + s.x];
    const kind = cell & 0xf0;
    const ax = (g.data.swords(0x24d6, 4)[s.facing] + s.x) & 7;
    const ay = (g.data.swords(0x24de, 4)[s.facing] + s.y) & 7;
    if (s.actors[1].x === ax && s.actors[1].y === ay) out.push(attackItem(g));
    // Klimb: a ladder or a pit, or a hole above - grey without the grapple to go up it.
    const klimb = klimbOffer(g);
    if (klimb !== 'hide') out.push({ label: 'Klimb', key: c('K'), enabled: klimb === 'show' });
    // A sign on the wall ahead, read again in the log (the port's): its runes dissolve there as anywhere.
    if (signAhead(g) >= 0) out.push({ label: 'Read sign', key: READ_SIGN });
    if (kind === 0x40) {
      out.push({ label: 'Open chest', key: c('O') });
      out.push({ label: 'Jimmy chest', key: c('J'), enabled: s.keys !== 0 });
    }
    if (kind === 0x70) out.push({ label: 'Get', key: c('G') });
    // A fountain here or ahead (the port's): Look's drink, its way given - grey in the dark, where Look sees nothing.
    const ahead = s.dungeon[s.level * 0x40 + ay * 8 + ax] & 0xf0;
    const lit = s.d58a6 !== 0 || s.d58a7 !== 0;
    if (kind === 0x50 || ahead === 0x50) out.push({ label: 'Drink', key: DRINK, enabled: lit });
    // In the dark, a torch to light comes first - after a foe ahead to strike - so that A twice is not Klimb and out of
    // the dungeon just entered (the port's); with none to light, grey at the foot.
    if (!lit) {
      const torch = { label: 'Ignite torch', key: c('I'), enabled: s.torches !== 0 };
      if (s.torches !== 0) out.splice(out[0]?.key === attackItem(g).key ? 1 : 0, 0, torch);
      else out.push(torch);
    }
  } else if (where === 'combat') {
    out.push(attackItem(g));
    // Switch Weapon (the port's): the member's melee arms and their ranged, one for the other (switchWeapon.ts).
    if (g.combat[s.combatTurn]?.flags & CF.Player) out.push({ label: 'Switch Weapon', key: c('W') });
    // A room's trigger square beside the member - a wall that opens a secret way - or furniture that moves: Push, at
    // the head of the menu once no foe stands, after the arms while one does (targets.ts pushOffer).
    if (g.combat[s.combatTurn]?.flags & CF.Player && pushOffer(g) === 'show') {
      const push = { label: 'Push', key: c('P') };
      if (foesAbout(g, 'combat')) out.push(push);
      else out.unshift(push);
    }
    // A caster's last spell, ready to cast again (the ultima3 port's): the fight's fire bolt is one press away.
    const who = g.combat[s.combatTurn]?.who ?? -1;
    const last = g.lastSpell.get(who);
    if (last !== undefined && s.mixtures[last] !== 0 && !shortcutCasts(g).some((r) => r.spell === last))
      out.push({ label: `Cast (${SPELL_EFFECTS[last]})`, key: 0x100 + 7 });
  }
  // A camp that would be a rest, with someone it would heal: it leads the rest of the menu (targets.ts campWanted).
  if ((where === 'outdoors' || where === 'dungeon') && campWanted(g)) out.push({ label: 'Camp', key: c('H') });
  // The spells the moment calls for, cast without further asking: a heal, a cure, a light in the dark - each its own
  // line. After what the place itself offers - a towne underfoot is entered, a townsman at hand is spoken to -
  // since those are why the party came here, and the wound will keep.
  shortcutCasts(g).forEach((ready, i) => out.push({ label: ready.label, key: SHORTCUT + i }));
  // A weapon that reaches leads: with a bow in hand, shooting is the first thing offered.
  if (readied(g)?.ranged) {
    const at = out.findIndex((it) => it.key === c('A'));
    if (at > 0) out.unshift(out.splice(at, 1)[0]);
  }
  // Something still to be found beside the party - a hidden thing, a buried moonstone, a reagent at midnight, a wall
  // with a nick - puts Search at the head of the menu: a small hint (the port's), where 1988 left it to searching
  // everything.
  if ((where === 'town' || where === 'outdoors') && somethingBeside(g)) out.unshift({ label: 'Search', key: c('S') });
  // A fight won is left from the head of the menu: the field stays the party's until then, for its chests.
  // Not where the field cannot be left (Doom's last room): there it would only say so.
  if (where === 'combat' && s.battleWon !== 0 && !(s.combatFlags & 0x80)) {
    // Loot and Leave (loot.ts) above it, while there is something on the field to take and someone to take it: the
    // bar starts on what a won field is most often left by. Where no one can (all asleep), it waits greyed under it.
    const loot = lootOffer(g);
    const leave = { label: 'Leave combat', key: K.Escape };
    const take = { label: 'Loot and Leave', key: LOOT, enabled: loot === 'show' };
    out.unshift(...(loot === 'show' ? [take, leave] : loot === 'grey' ? [leave, take] : [leave]));
  }
  return out;
}

/**
 * The rest of the commands, in the order they are most wanted, each as the ultima3 port offers it (targets.ts):
 * left out where it has nothing to act on, greyed where it has but the party has not the means - no mixture to
 * cast, no torch to light, no gem to peer into, no key to jimmy with, no grapple for the mountain.
 */
function everything(g: Game): Item[] {
  const s = g.s;
  const where = g.commandPrompt;
  const combat = where === 'combat';
  const outdoors = where === 'outdoors';
  const offered = (item: Item, o: Offer): Item[] => (o === 'hide' ? [] : [{ ...item, enabled: o === 'show' }]);
  const has = (b: boolean): Offer => (b ? 'show' : 'grey');
  const only = (b: boolean): Offer => (b ? 'show' : 'hide');
  const onFoot = s.partyTile === A.Avatar;
  const under = actorTileAt(g, s.x, s.y, s.level);
  const list: Item[] = [
    ...offered({ label: 'Look', key: c('L') }, only(!combat)),
    ...offered({ label: 'Search', key: c('S') }, searchOffer(g)),
    ...offered({ label: 'Get', key: c('G') }, getOffer(g)),
    ...offered({ label: 'Steal', key: STEAL }, stealOffer(g)),
    ...offered({ label: 'Cast', key: c('C') }, has(s.mixtures.some((n) => n !== 0))),
    ...offered({ label: 'Use item', key: c('U') }, only(nextHeld(g, -1, 0x26, itemCounts(g), 0xff) !== -1)),
    { label: 'Ready', key: c('R') },
    { label: 'Ztats', key: c('Z') },
    ...offered({ label: 'Mix reagents', key: c('M') }, combat ? 'hide' : has(s.reagents.some((r) => r !== 0))),
    ...offered({ label: 'Talk', key: c('T') }, talkOffer(g)),
    ...offered({ label: 'Open', key: c('O') }, openOffer(g)),
    ...offered({ label: 'Steal from chest', key: STEAL_CHEST }, stealChestOffer(g)),
    ...offered({ label: 'Jimmy', key: c('J') }, jimmyOffer(g)),
    ...offered({ label: 'Push', key: c('P') }, pushOffer(g)),
    ...offered({ label: 'Klimb', key: c('K') }, klimbOffer(g)),
    ...offered(attackItem(g), attackOffer(g)),
    ...offered({ label: holeUpLabel(g), key: c('H') }, holeUpOffer(g)),
    // Off a bed in a towne, the hours passed standing (the port's, cmds.ts waitInTown), where Hole up is "Only in bed!".
    ...offered({ label: 'Wait', key: WAIT }, only(where === 'town' && tileAt(g, s.x, s.y) !== T.Bed)),
    ...offered({ label: 'Ignite torch', key: c('I') }, combat ? 'hide' : has(s.torches !== 0)),
    ...offered({ label: 'View a gem', key: c('V') }, combat ? 'hide' : has(s.gems !== 0)),
    ...offered({ label: 'Yell', key: c('Y') }, yellOffer(g)),
    ...offered({ label: 'Enter', key: c('E') }, only(outdoors && ENTRANCES.includes(tileAt(g, s.x, s.y)))),
    ...offered({ label: 'Board', key: c('B') }, only((outdoors || where === 'town') && canBoard(g, under))),
    ...offered({ label: 'X-it', key: c('X') }, only((outdoors || where === 'town') && !onFoot)),
    ...offered({ label: 'Fire', key: c('F') }, fireOffer(g)),
    ...offered({ label: 'New order', key: c('N') }, newOrderOffer(g)),
  ];
  // Only what the buttons and the Pause menu do not already do (the ultima3 port's): B passes, Start and Escape open
  // the Pause menu, and saving, quitting and Auto combat are there. The journal and the map are here alone.
  list.push({ label: 'Journal', key: 0x100 + 2 });
  if (!combat) list.push({ label: 'Map', key: 0x100 + 3 });
  return list;
}

/**
 * What a menu answers a key with (the port's, from the ultima3 port): a
 * step as the cursor moves, and a low note on backing out. A choice is
 * silent - what it opens or does says it, and a sound at every choice was
 * too much. They go through the same effects as the game's own sounds, so
 * the Standard set voices them as chip tones and Original as the PC
 * speaker.
 */
export function menuSound(g: Game, what: 'move' | 'back'): void {
  if (g.soundOff) return;
  // The game's own effects, by the parameters the original passes for them, so each set voices them its way.
  if (what === 'move')
    void g.sound.noise(1, 0x19, 1000); // a step
  else void g.sound.pulse(2300, 1, 18000, 1, 2); // the low note of the shop counter
}

/** Whether the Map command switches the dungeon's view (the Standard look, in a dungeon) rather than showing the world's map. */
function dungeonViews(g: Game): boolean {
  return g.inDungeon && g.options.tileSet === 'standard';
}

/**
 * The Standard look's dungeon, its Map command: the first-person view with the map round the party beside it, or the
 * whole level's map with the first-person view small beside it (dungeonMap.ts), the choice kept.
 */
function switchDungeonView(g: Game): void {
  g.options.dungeonView = g.options.dungeonView === 'full' ? 'mini' : 'full';
  saveOptions(g.options);
}

/** The command menu: the chosen command's key, or 0 (nothing chosen, or a menu of the engine's own was used). */
/** A command's name as a controller has it (commandMenu): 1988's own where it was spelt for its letter, plainly. */
export function plainName(g: Game, label: string): string {
  const aboard = g.s.partyTile >= 0x20 && g.s.partyTile < 0x2c; // a frigate or a skiff, rather than a horse or a carpet
  const plain: Record<string, string> = {
    Klimb: 'Climb',
    Ztats: 'Stats',
    Jimmy: 'Pick lock',
    'Jimmy chest': 'Pick chest lock',
    'X-it': aboard ? 'Disembark' : 'Dismount',
  };
  return plain[label] ?? label;
}

export async function commandMenu(g: Game): Promise<number> {
  // One list: what the moment calls for first, then the rest.
  const first = contextual(g);
  const items = [...first, ...everything(g).filter((it) => !first.some((f) => f.key === it.key))];
  // With a controller the letters are not shown, and 1988's names spelt for them (K for Klimb, Z for Ztats) read as
  // misspellings: the plain word. Classic input keeps both.
  if (g.options.input === 'controller') for (const it of items) it.label = plainName(g, it.label);
  // With the bar on a spell to cast or on Mix, the party panel shows mana (magicPanel.ts), and hit points again after.
  const magic = (k: number | undefined): boolean =>
    k === c('C') || k === c('M') || k === 0x100 + 7 || (k !== undefined && k >= SHORTCUT && k < SHORTCUT + 8);
  const watch = g.choiceWatch;
  // With the bar on Switch Weapon, in the Standard look, the arms it would take up shown on the panel as their card
  // (readyCard.ts drawSwitchCard), as Ready shows each armament's - the panel held at its full height for it.
  const switchable = g.options.tileSet === 'standard' && g.inCombat && g.s.combatTurn < 0x20;
  let release: (() => void) | null = null;
  const unCard = (): void => {
    if (!release) return;
    release();
    release = null;
    drawVitals(g);
  };
  g.choiceWatch = (at, title) => {
    if (title !== 'Commands') return;
    if (switchable && items[at]?.key === c('W')) {
      release ??= holdFullPanel(g);
      drawSwitchCard(g, g.combat[g.s.combatTurn].who);
      return;
    }
    unCard();
    // And on Ztats, experience toward the next level (frame.ts standardLine).
    const mana = magic(items[at]?.key);
    const xp = items[at]?.key === c('Z');
    if (mana === g.panelMana && xp === g.panelXp) return;
    g.panelMana = mana;
    g.panelXp = xp;
    drawVitals(g);
  };
  let i: number;
  try {
    i = await choose(g, 'Commands', items);
  } finally {
    g.choiceWatch = watch;
    unCard();
    if (g.panelMana || g.panelXp) {
      g.panelMana = g.panelXp = false;
      drawVitals(g);
    }
  }
  const k = i < 0 ? 0 : (items[i].key ?? 0);
  // Talk, Open or Jimmy with only one side to act on: its way given, not asked (targets.ts onlySide).
  if (g.options.input === 'controller') {
    const only = k === c('T') ? onlySide(g, 'talk') : k === c('O') ? onlySide(g, 'open') : k === c('J') ? onlySide(g, 'jimmy') : 0;
    if (only) g.bumpDir = only;
  }
  await restoreView(g);
  switch (k) {
    case 0x102:
      return journalScreen(g);
    case 0x103:
      if (dungeonViews(g)) {
        switchDungeonView(g);
        await restoreView(g);
        return 0;
      }
      await g.hooks.showMap?.(g.s.level === 0xff);
      await restoreView(g);
      return 0;
    case 0x106: {
      // The harpsichord: notes chosen one after another until B, then played as the keys they are.
      const notes: number[] = [];
      for (;;) {
        const at = await choose(
          g,
          `Notes ${notes.map((n) => String.fromCharCode(n)).join('')}`.slice(-WIDTH),
          Array.from({ length: 9 }, (_, n) => ({ label: String(n + 1) })),
          notes.length ? notes[notes.length - 1] - 0x31 : 0,
        );
        if (at < 0) break;
        notes.push(0x31 + at);
      }
      await restoreView(g);
      queueKeys(...notes);
      return 0;
    }
    case WAIT: {
      const { waitInTown } = await import('./cmds.ts');
      await waitInTown(g);
      return 0;
    }
    case STEAL:
      return c('G');
    case STEAL_CHEST:
      return c('O');
    case READ_SIGN: {
      const { readSignAhead } = await import('./dungeon.ts');
      readSignAhead(g);
      return 0;
    }
    case DRINK: {
      const s = g.s;
      g.drinkPreset = (s.dungeon[s.level * 0x40 + s.y * 8 + s.x] & 0xf0) === 0x50 ? 'here' : 'ahead';
      return c('L');
    }
    case LOOT:
      // Everything taken, the party leaves as Leave combat does; else it stays, told what is left.
      return (await lootField(g)) ? K.Escape : 0;
    case 0x107: {
      // The member's last spell again: the Cast command with the caster and the spell given, the aim still asked.
      const who = g.combat[g.s.combatTurn]?.who ?? -1;
      const last = g.lastSpell.get(who);
      if (last === undefined) return 0;
      g.castPreset = { caster: who, spell: last };
      return c('C');
    }
  }
  if (k >= SHORTCUT && k < SHORTCUT + 8) {
    // A spell the menu offered, cast as the Cast command with nothing left to ask.
    const ready = shortcutCasts(g)[k - SHORTCUT];
    if (!ready) return 0;
    g.castPreset = { caster: ready.caster, spell: ready.spell, on: ready.on };
    return c('C');
  }
  return k;
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
  allies: 'Allies: you play the Avatar, the game plays the rest of the party, summoned and charmed creatures too.',
  all: 'All: the game plays the whole party until a key is pressed.',
};

/**
 * The Pause menu. `midCommand`: opened from a prompt or a menu inside a command (Start, Select), where the game is not
 * saved - a command part done is no game to keep - nor the dungeon's view switched under the command's prompt.
 */
export async function pauseMenu(g: Game, midCommand = false): Promise<number> {
  /**
   * A saving line greyed says why, the bar resting on it (Item.rest): in a fight, inside a command (Start pressed at
   * its prompt), or - to save and leave - in a dungeon, which keeps no game from within it (storage.ts autosave).
   */
  const noSave = (able: boolean, what: string): Partial<Item> => {
    if (able) return {};
    const why =
      g.s.mapId === 0xff
        ? 'Not in a fight.'
        : midCommand
          ? 'Not in the middle of a command: finish it, then pause.'
          : what === 'Save and quit'
            ? 'Not in a dungeon: the game is kept outside, at its door. Save game keeps it here.'
            : 'Not now.';
    return { rest: true, note: why };
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
            g.options.autoCombat = AUTO_COMBAT[(AUTO_COMBAT.indexOf(g.options.autoCombat) + 1) % AUTO_COMBAT.length];
            saveOptions(g.options);
          },
        },
        applied(g, musicVoiceLine(g)),
        applied(g, musicLine(g)),
        applied(g, soundLine(g)),
        applied(g, effectsLevelLine(g)),
        { label: 'Gameplay', act: () => gameplayMenu(g).then(() => undefined) },
        {
          label: 'Settings',
          act: async () => {
            // A new look lays the screen out again: the Standard panel and its borders, or 1988's (layout.ts).
            const look = g.options.tileSet;
            await settingsMenu(g);
            if (g.options.tileSet !== look) {
              const { relayout } = await import('./layout.ts');
              await relayout(g);
            }
          },
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
          ...noSave(g.s.mapId !== 0xff && !midCommand, 'Save game'),
          act: async () => {
            await restoreView(g);
            return SAVE_NOW;
          },
        },
        {
          // The last save or one of the seven before it, taken up again (storage.ts), as All is lost offers them: asked
          // first, all played since being undone. Not in a fight, nor inside a command.
          label: 'Load a save',
          enabled: g.s.mapId !== 0xff && !midCommand,
          ...noSave(g.s.mapId !== 0xff && !midCommand, 'Load a save'),
          act: async () => {
            const { chooseSave, localSave, savedWhen, takeUp } = await import('./storage.ts');
            const kept = localSave.all();
            if (kept.length === 0) {
              await showText(g, 'Load a save', wrap('No game has been saved yet.'));
              return;
            }
            const chosen = await chooseSave(g, 'Load a save', kept);
            if (!chosen) return;
            if (!(await confirm(g, `Back to the game saved ${savedWhen(chosen.data.written)}? All played since is undone.`))) return;
            await takeUp(g, chosen.data);
          },
        },
        {
          label: 'Save and quit',
          enabled: g.s.mapId !== 0xff && !g.inDungeon && !midCommand,
          ...noSave(g.s.mapId !== 0xff && !g.inDungeon && !midCommand, 'Save and quit'),
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
const SOUND_NAMES = { standard: 'Standard', original: 'Original' } as const;
const RULES_NAMES: Record<Rules, string> = { story: 'Story', modern: 'Modern', classic: 'Classic' };
const RULES_NOTES: Record<Rules, string> = {
  story: 'As Modern, never hungry, fights eased more.',
  modern: 'Poison, hunger never kill; XP shared; fights eased.',
  classic: 'As in 1988, as the Apple II has it: deadly.',
};
const INPUT_NAMES: Record<InputMode, string> = { letters: 'Classic', controller: 'Controller' };

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
async function chooseListening(g: Game, title: string, lines: Setting[], at: number): Promise<number> {
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
async function dialLevel(g: Game, title: string, start: number, set: (n: number) => void, sample?: () => void): Promise<void> {
  const hear = (n: number): void => {
    set(n);
    g.hooks.applyOptions?.(g.options);
    sample?.();
  };
  const n = await amount(g, 0, LEVELS, start, { title, shown: percent, onChange: hear });
  if (n >= 0) set(n);
}

/** The music's level: in the Pause menu, and in Settings at the title. */
function musicLine(g: Game): Setting {
  const o = g.options;
  return {
    label: `Music level: ${percent(o.musicLevel)}`,
    note: "The Upgrade's music: Off, or 10% to 100%.",
    listen: true,
    act: () => dialLevel(g, 'Music level', o.musicLevel, (n) => void (o.musicLevel = n)),
  };
}

/** Each soundtrack's name on the Music line (the menu is 21 columns: the year of the 2026 ones is in their note). */
const SOUNDTRACK_NAMES: Record<MusicVoice, string> = {
  classical: 'Classical',
  electronic: 'Electronic',
  remastered: 'Ambient',
  original: 'Upgrade (2001)',
};
/** What each soundtrack is, under the Music line. */
const SOUNDTRACK_NOTES: Record<MusicVoice, string> = {
  classical: 'Classical (2026): strings, orchestra, consort, Celtic and piano.',
  electronic: 'Electronic (2026): analog synths, drum machines and keys.',
  remastered: 'Ambient (2026): soft synth pads, bells and mallets, calm.',
  original: "Upgrade (2001): the Ultima V Upgrade's MIDI, on a sound card.",
};

/** Which soundtrack plays: in the Pause menu, and in Settings at the title. */
function musicVoiceLine(g: Game): Setting {
  const o = g.options;
  return {
    label: `Music: ${SOUNDTRACK_NAMES[o.musicVoice]}`,
    note: SOUNDTRACK_NOTES[o.musicVoice],
    listen: true,
    act: () => void (o.musicVoice = MUSIC_VOICES[(MUSIC_VOICES.indexOf(o.musicVoice) + 1) % MUSIC_VOICES.length]),
  };
}

/** The sound effects' set: in the Pause menu, and in Settings at the title. */
function soundLine(g: Game): Setting {
  const o = g.options;
  return {
    label: `Sound FX: ${SOUND_NAMES[o.soundSet]}`,
    note: "Standard: the port's chip sounds. Original: the PC speaker, as in 1988.",
    act: () => void (o.soundSet = o.soundSet === 'standard' ? 'original' : 'standard'),
  };
}

/** The sound effects' level, a step's sound played at each step: in the Pause menu, and in Settings at the title. */
function effectsLevelLine(g: Game): Setting {
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

/** `line` as the Pause menu has it: the setting changed, kept and taken up at once. */
function applied(g: Game, line: Setting): Setting {
  return {
    ...line,
    act: async () => {
      await line.act?.();
      saveOptions(g.options);
      g.hooks.applyOptions?.(g.options);
    },
  };
}

/**
 * Settings: how the game looks - the UX, its tiles and what goes over them - and the keeping of the saved game. At
 * the title, with no Pause menu to hold them, the music, the sound effects and Gameplay's choices too. Each line
 * carries what it does, so lines may be added or moved without any numbering to keep in step.
 */
export function settingLines(g: Game, title = false): Setting[] {
  const o = g.options;
  const pc = o.tileSet !== 'standard';
  return [
    { label: 'Back', note: '' },
    {
      // The look: the port's own screen (Modern), or the 1988 PC release's EGA tiles and screen (the setting's values are
      // still 'standard' and 'original').
      label: `UX: ${o.tileSet === 'standard' ? 'Modern' : 'PC (1988)'}`,
      note: "Modern: the port's screen, with a choice of tiles. PC (1988): the 1988 game's.",
      act: () => void (o.tileSet = o.tileSet === 'standard' ? 'original' : 'standard'),
    },
    {
      // The look's tiles, one set after another: the Modern look's (settings.ts Tiles) or the PC (1988) look's
      // (PcTiles), each look keeping its own choice.
      label: `Tiles: ${TILES_NAMES[o.tileSet === 'standard' ? o.tiles : o.pcTiles]}`,
      note:
        o.tileSet === 'standard'
          ? "Modern PC: 1988's art redone. Apple ][ and PC EGA: as first drawn."
          : "PC EGA: the 1988 game's tiles. Apple ][: the Apple II's, as first drawn.",
      act: () => {
        if (o.tileSet === 'standard') o.tiles = TILES[(TILES.indexOf(o.tiles) + 1) % TILES.length];
        else o.pcTiles = PC_TILES[(PC_TILES.indexOf(o.pcTiles) + 1) % PC_TILES.length];
      },
    },
    {
      // A fine black line round Modern PC's people and creatures (standardArt.ts OUTLINE_WIDTH), not round what stands.
      label: `Outlines: ${onOff(o.outlines)}`,
      note: 'A fine black line round every person and creature, to see them on busy ground.',
      enabled: o.tileSet === 'standard' && o.tiles === 'modern-pc',
      act: () => void (o.outlines = !o.outlines),
    },
    {
      // The state's letter on the frame beside a member (P, S, D, C), as well as their name's colour: the Standard
      // look's, the EGA look showing it in the line as 1988 did.
      label: `Status letters: ${onOff(o.statusLetters)}`,
      note: "P, S, D or C on the frame beside a member, as well as their name's colour.",
      enabled: o.tileSet === 'standard',
      act: () => void (o.statusLetters = !o.statusLetters),
    },
    {
      // Each look its own: the PC (1988) look's on until turned off.
      label: `Scanlines: ${onOff(pc ? o.pcScanlines : o.scanlines)}`,
      note: 'Dark bands over the picture, as an old monitor had. Each UX keeps its own.',
      act: () => void (pc ? (o.pcScanlines = !o.pcScanlines) : (o.scanlines = !o.scanlines)),
    },
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
    ...(title
      ? [
          musicVoiceLine(g),
          musicLine(g),
          soundLine(g),
          effectsLevelLine(g),
          {
            label: 'Gameplay',
            note: 'How the game plays: input, poison, hunger, experience, throwing, aiming.',
            act: () => gameplayMenu(g).then(() => undefined),
          },
        ]
      : []),
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
    {
      label: 'Remove game files',
      note: 'Forget the installed game files; the saved game is kept.',
      enabled: !!g.hooks.uninstall,
      act: async () => {
        if (!(await confirm(g, 'Forget the installed Ultima V files? The saved game is kept; the files must be installed again to play.')))
          return;
        await g.hooks.uninstall?.();
        return 0;
      },
    },
  ];
}

/** Gameplay: how the game plays - its input, and the rules the port lets the player soften or keep as 1988's. */
export function gameplayLines(g: Game): Setting[] {
  const o = g.options;
  return [
    { label: 'Back', note: '' },
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
      note: RULES_NOTES[o.rules],
      act: () => void (o.rules = RULES[(RULES.indexOf(o.rules) + 1) % RULES.length]),
    },
    {
      label: `Auto aim: ${onOff(o.autoAim)}`,
      note: 'X (keyboard Q or C), or walking into a foe, strikes it, no crosshair.',
      act: () => void (o.autoAim = !o.autoAim),
    },
  ];
}

/** How many lists of settings are open, one over another (optionsMenu). */
let settingsDepth = 0;

/** A menu of settings (`lines` as they now stand), each change kept and taken up as it is made. Returns a command key, or 0. */
async function optionsMenu(g: Game, title: string, lines: () => Setting[]): Promise<number> {
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
    }
  } finally {
    if (--settingsDepth === 0) {
      g.sound.setHeld('settings', false);
      g.sound.hearMusic?.(false);
    }
  }
}

/** Settings (settingLines); `title`, opened from the title, where it holds the Pause menu's music and Gameplay too. */
export async function settingsMenu(g: Game, title = false): Promise<number> {
  return optionsMenu(g, 'Settings', () => settingLines(g, title));
}

/** Gameplay (gameplayLines). */
export async function gameplayMenu(g: Game): Promise<number> {
  return optionsMenu(g, 'Gameplay', () => gameplayLines(g));
}

/** A yes-or-no question as a menu. */
export async function confirm(g: Game, question: string, boxed = false): Promise<boolean> {
  const lines = wrap(question);
  const items: Item[] = [
    ...lines.map((l) => ({ label: l, enabled: false })),
    { label: '', enabled: false },
    { label: 'No', key: c('N') },
    { label: 'Yes', key: c('Y') },
  ];
  // The map's square, as every question in play and in Settings (at the title too); `boxed`, a box of its own - asked
  // of the title's menu, over its picture.
  return (await choose(g, 'Are you sure?', items, lines.length + 1, boxed)) === lines.length + 2;
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
      drawVitals(g);
      await showText(g, 'Cheats', wrap(said));
    }
  } finally {
    g.choiceSeen = seen;
  }
}

// --- The journal and the letter picker ----------------------------------------------------------------------

/** The journal: the quest's state, then the clues heard. */
/**
 * The journal (journal.ts journalTop): how the quest stands, a line for each part with its count. A opens a part that
 * is many (the shrines, the dungeons, the Shadowlords) onto a line for each, or the clues heard to read, and on a line
 * that says what a thing is for (a piece of equipment's use), prints that; Y on any line, and Y alone, prints its hint
 * in the log - a hint is asked for, never given by the button that opens. B goes back, and out.
 */
export async function journalScreen(g: Game): Promise<number> {
  /**
   * Whether text fits the log as it stands, a line or two kept clear (the log's width, letters; its height, rows):
   * longer, its beginning would scroll away before it is read, and it is shown in a reader of its own instead.
   */
  const fits = (text: string): boolean => {
    const w = g.text.windows[Win.messages];
    return wrap(text, w.right - w.left + 1).length <= w.bottom - w.top - 1;
  };
  /** Text in the log, the journal staying up. */
  const say = (text: string): void => {
    if (!text || text === 'Hint: ') return;
    const t = g.text;
    const was = t.current;
    t.select(Win.messages);
    g.print(`\n${text}\n`);
    t.select(was);
  };
  /** Text in the log - or, too long for it (the Crown's hunt, Doom's way), in a reader headed with the line's name. */
  const tell = async (name: string, text: string): Promise<void> => {
    if (!text) return;
    if (fits(text)) say(text);
    else await showText(g, name, wrap(text)); // (the list it was asked from drawn again over it after)
  };
  /** A line's name, without its count or state ("Shadowlords slain 0/3", "Mariah       in party"). */
  const nameOf = (line: JournalLine): string =>
    line.label
      .replace(/\s{2,}.*$/, '')
      .replace(/\s+\d+(\/\d+)?$/, '')
      .trim();
  /** A page to read (JournalLine.read), each line wrapped, the dim ones dark grey. */
  const readPage = async (name: string, read: NonNullable<JournalLine['read']>): Promise<void> => {
    const lines: string[] = [];
    const colours: (number | undefined)[] = [];
    for (const l of read)
      for (const w of l.text ? wrap(l.text) : ['']) {
        lines.push(w);
        colours.push(l.dim ? Colour.darkGray : undefined);
      }
    await showText(g, name, lines, colours);
  };
  /** A long hint asked for in a list (Y), shown once the list has been left for it (choose's LEFT_FOR_HOOK). */
  let pending: { name: string; text: string; at: number } | null = null;
  /** A list of the journal's lines, Y giving the hint of the one the bar is on - and what it says, its card on the panel. */
  const list = async (title: string, lines: JournalLine[], at: number): Promise<number> => {
    const key = g.choiceKey;
    const watch = g.choiceWatch;
    // The line under the bar that says something (a shrine's state, what a thing is for, where a companion is) or has
    // a hint: it on the party panel, headed with the line's name, "Y: Hint" at its foot where Y has one; on any other,
    // the party.
    let carded = false;
    g.choiceWatch = (i, shown) => {
      if (shown !== title) return;
      const line = lines[i];
      if (line?.about || line?.hint) {
        // Headed by its page's title where it opens one, short enough for the panel's border ("Shadowlords", not
        // "Shadowlords slain").
        drawTextCard(g, `${line.open?.title ?? nameOf(line)}:`, line.about ?? '', line.hint ? 'Y: Hint' : '');
        carded = true;
      } else if (carded) {
        clearBorderTitle(g);
        drawVitals(g);
        carded = false;
      }
    };
    g.choiceKey = (k, i, shown) => {
      if (shown !== title || (k !== Pad.Y && k !== 0x59 && k !== 0x79)) return false;
      const line = lines[i];
      if (!line?.hint) return true;
      const text = `Hint: ${line.hint}`;
      if (fits(text)) {
        say(text);
        return true;
      }
      pending = { name: nameOf(line), text, at: i };
      return 'leave';
    };
    try {
      for (;;) {
        const r = await choose(
          g,
          title,
          lines.map((l) => ({ label: l.label, enabled: l.enabled })),
          at,
        );
        const long = pending;
        if (r !== LEFT_FOR_HOOK || !long) return r;
        pending = null;
        await tell(long.name, long.text);
        at = long.at;
      }
    } finally {
      g.choiceKey = key;
      g.choiceWatch = watch;
      if (carded) {
        clearBorderTitle(g);
        drawVitals(g);
      }
    }
  };
  let at = 0;
  for (;;) {
    const top = journalTop(g);
    const pick = await list('Journal', top, at);
    if (pick < 0) break;
    at = pick;
    const line = top[pick];
    if (line.open) {
      // A on a line of the list opens its page to read (a topic's clues, the greyed ones dim); what a line says is on
      // the panel as the bar comes to it (its hint is Y's). The list stays, and B goes back.
      const lines = line.open.lines;
      for (let i = 0; (i = await list(line.open.title, lines, i)) >= 0; ) {
        const read = lines[i].read;
        if (read) await readPage(nameOf(lines[i]), read);
      }
    } else await tell(nameOf(line), line.about ?? '');
  }
  await restoreView(g);
  return 0;
}

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
export async function letterPicker(g: Game, mixedCase = false, restore = true, typed = false): Promise<number[]> {
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
