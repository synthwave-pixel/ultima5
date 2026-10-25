/**
 * speech.ts
 *
 * The Dialog setting's Play (the port's): what a townsman says, shown in the play area rather than the message log -
 * in a box framed as the Yes and No box is, only as big as the lines it holds, across the top of the view and centred
 * in it, the party's menu framed the same at its foot (menu.ts choose, talkMenuRows); each stops short of the party,
 * and of the townsman where they stand on its side, so both are in sight. Their words are written off the screen (text.ts stageWindow) and shown a box at a time: a reply too long for
 * the room there is shown a page at a time, the blinking arrow of a story page (waitMark.ts) at its corner till a key
 * is pressed; so are the pauses the scripts themselves make. What the party says, the prompts and the townsman's
 * description stay in the log.
 */

import type { Game } from './game.ts';
import { Colour } from '../ui/colours.ts';
import { CLEAR_WINDOW } from '../ui/text.ts';
import { animating, updateFrame } from './frame.ts';
import { LOST_FOCUS, TURN_LEFT, TURN_RIGHT } from './io.ts';
import { blinker, waitMark } from './waitMark.ts';

/** The text window the townsman's words are written in, off the screen (frame.ts's are 0-2, the menus' 3). */
export const SPEECH = 4;
/** The message log's (frame.ts Win.messages). */
const LOG = 2;

/** The columns their words are wrapped to; the box is two wider at most, room for the arrow beside the last line. */
const TEXT_WIDTH = 18;
const BOX_WIDTH = TEXT_WIDTH + 2;
/** The rows written off the screen before any is shown: more than a box ever holds. */
const STAGE_ROWS = 24;

/** The view's middle: the column whose left edge is the middle of the party's square (the view's sixth, 5). */
export const CENTRE = 12;
/** The most columns the talk's boxes take, the townsman's and the party's menu: the view's square, but a column. */
export const TALK_WIDTH = BOX_WIDTH;

/**
 * Where the box goes, for the townsman `dx`, `dy` squares from the party: its first row at `top`, the top of the view,
 * centred on `centre`; `rows`, the most it may hold - its frame half a row clear of the townsman where they stand to
 * the north, else of the party's own row.
 */
export interface Place {
  top: number;
  centre: number;
  rows: number;
}

/** A townsman `dx`, `dy` squares away: one further than across a counter (a word shouted across a room) is as beside. */
const near = (dx: number, dy: number): number => (Math.abs(dx) > 2 || Math.abs(dy) > 2 ? 0 : dy);

export function placement(dx: number, dy: number): Place {
  // Squares are two rows of text, the view's first at row 1, the party's the sixth (5).
  const d = near(dx, dy);
  const last = d < 0 ? 2 * (5 + d) - 1 : 2 * 5 - 1;
  return { top: 2, centre: CENTRE, rows: last - 1 };
}

/**
 * The rows the party's menu may take at the view's foot (inclusive), for the townsman `dx`, `dy` squares away: from a
 * row clear of the party's square, or of the townsman's where they stand to the south, to the view's last.
 */
export function talkMenuRows(dx: number, dy: number): { first: number; last: number } {
  const d = near(dx, dy);
  return { first: d > 0 ? 2 * (5 + d) + 4 : 2 * 6 + 2, last: 21 };
}

/**
 * Who speaks, squares from the party, where it is not the townsman talked to (g.talk.npc): a guard, a prisoner, the
 * old man at the camp (merchantSpeech.ts withSpeaker); null for the townsman.
 */
const speakers = new WeakMap<Game, { dx: number; dy: number }>();
export function speakFrom(g: Game, at: { dx: number; dy: number } | null): void {
  if (at) speakers.set(g, at);
  else speakers.delete(g);
}

/** Where whoever speaks stands, squares from the party: the speaker set (speakFrom), else the townsman talked to. */
function speaker(g: Game): { dx: number; dy: number } {
  const at = speakers.get(g);
  if (at) return at;
  const s = g.s;
  const a = s.actors[s.npcs[g.talk.npc]?.actor ?? -1];
  return { dx: a ? a.x - s.x : 0, dy: a ? a.y - s.y : 0 };
}

/** The talk's menu's rows (talkMenuRows), for whoever the party talks to now. */
export function talkMenu(g: Game): { first: number; last: number } {
  const { dx, dy } = speaker(g);
  return talkMenuRows(dx, dy);
}

/** The talk as it stands: where its box goes, and the cells of the one shown, if one is. */
interface Talking {
  place: Place;
  shown: { left: number; top: number; width: number; height: number; back: () => void } | null;
}
const talks = new WeakMap<Game, Talking>();

/** Whether the townsman's words go to the play area: the Dialog setting's Play, in play. */
export const speechOn = (g: Game): boolean => g.options.dialog === 'play' && g.inPlay;

/**
 * Begin the townsman's words afresh: the box last shown (and the menu last answered) put away, the view as it is, and
 * the window off the screen emptied and chosen. Nothing where the setting is Log.
 */
export function begin(g: Game): void {
  if (!speechOn(g)) return;
  const { dx, dy } = speaker(g);
  const place = placement(dx, dy);
  const was = talks.get(g);
  talks.set(g, { place, shown: was?.shown ?? null });
  putAway(g, true);
  const t = g.text;
  t.stageWindow = SPEECH;
  t.setWindow(SPEECH, 0, 0, TEXT_WIDTH - 1, STAGE_ROWS - 1);
  t.select(SPEECH);
  t.printChar(CLEAR_WINDOW);
}

/** The box shown taken off the view - the view drawn again - or, `always`, the view drawn again whatever was over it. */
function putAway(g: Game, always = false): void {
  const k = talks.get(g);
  const b = k?.shown;
  if (!b && !always) return;
  if (b) g.text.clearArea(b.left, b.top, b.left + b.width - 1, b.top + b.height - 1);
  if (k) k.shown = null;
  g.draw.chromeSpeech?.(null);
  // The view drawn again whole: the box, and the menu answered under it, gone with what covered the map.
  g.covers.delete('speech');
  g.covers.delete('menu');
  const was = g.text.current;
  g.viewDirty = 1;
  updateFrame(g);
  g.text.select(was);
}

/**
 * The townsman speaks: their window chosen (after the log had the party's words). The log's line ended first where
 * the party's left it open - an answer typed as nothing, whose line the townsman's reply would have ended in the log.
 */
export function speak(g: Game): void {
  if (!speechOn(g) || !talks.has(g)) return;
  if (g.text.current === LOG && g.text.win.x !== 0) g.printChar('\n');
  g.text.select(SPEECH);
}

/** Whether the townsman's window is the one written in now. */
const speaking = (g: Game): boolean => speechOn(g) && talks.has(g) && g.text.current === SPEECH;

/** The rows written and not yet shown: their text, those before the first with anything in it left out (`from`). */
function unshown(g: Game): { from: number; lines: string[] } {
  const w = g.text.windows[SPEECH];
  const all = g.text.stagedLines().slice(0, w.y + (w.x > 0 ? 1 : 0));
  let from = 0;
  while (from < all.length && all[from] === '') from++;
  const lines = all.slice(from);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { from, lines };
}

/**
 * The next box of what is written: as many rows as there is room for, in a box their size centred over the townsman;
 * then, `wait`, the arrow at its corner till a key. The rows shown are let go from the window off the screen.
 */
async function showPage(g: Game, wait: boolean): Promise<void> {
  const k = talks.get(g);
  if (!k) return;
  const t = g.text;
  const { place } = k;
  const { from, lines: rest } = unshown(g);
  // A page that would leave one line alone for the next leaves it two: a question's last word is not paged apart
  // from the rest of it ("Wilt thou take" / "it?").
  const taken = rest.length === place.rows + 1 && place.rows > 2 ? place.rows - 1 : Math.min(rest.length, place.rows);
  const lines = rest.slice(0, taken);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) {
    t.dropStaged(from + taken);
    return;
  }
  putAway(g);
  let width = Math.max(...lines.map((l) => l.length));
  // The arrow a column clear of the last line, inside the box.
  if (wait) width = Math.max(width, lines[lines.length - 1].length + 2);
  // An even width, so it is centred to the pixel: the view's middle lies between two columns.
  width = Math.min(BOX_WIDTH, width + (width & 1));
  const height = lines.length;
  const left = Math.max(2, Math.min(22 - width, place.centre - (width >> 1)));
  const top = place.top;
  frameBox(g, left, top, width, height);
  t.showStaged(from, height, left, top, width);
  k.shown = { left, top, width, height, back: t.keep(left, top, left + width - 1, top + height - 1) };
  t.dropStaged(from + taken);
  if (wait) await waitHere(g, (left + width - 1) * 8, (top + height - 1) * 8 + 2);
}

/** The box's frame round cells (left, top) on, `width` by `height`: emptied, edged, and kept clear of the map. */
function frameBox(g: Game, left: number, top: number, width: number, height: number): void {
  const d = g.draw;
  const [x1, y1, x2, y2] = [left * 8 - 4, top * 8 - 4, (left + width) * 8 + 3, (top + height) * 8 + 3];
  d.pen = 0;
  d.fill(x1, y1, x2, y2);
  d.pen = Colour.blue;
  d.line(x1, y1, x2, y1);
  d.line(x1, y2, x2, y2);
  d.line(x1, y1, x1, y2);
  d.line(x2, y1, x2, y2);
  d.chromeSpeech?.([x1, y1, x2, y2]);
  g.covers.set('speech', [x1, y1, x2, y2]); // the map goes on under it (waitHere, the talk's menu)
}

/** The box shown drawn again as it was, its words and all: after the Pause menu has been over it (menu.ts restoreView). */
export function redrawBox(g: Game): void {
  const b = talks.get(g)?.shown;
  if (!b) return;
  frameBox(g, b.left, b.top, b.width, b.height);
  b.back();
}

/** Everything written shown, box by box, each but the last read (a key) before the next; the last too, `read`. */
async function flush(g: Game, read: boolean): Promise<boolean> {
  const rows = talks.get(g)?.place.rows ?? 1;
  let shown = false;
  for (;;) {
    const n = unshown(g).lines.length;
    if (n === 0) return shown;
    shown = true;
    await showPage(g, n > rows || read);
  }
}

/** The party speaks, or the game prompts: what the townsman said shown (it stays while they answer), the log chosen. */
export async function listen(g: Game): Promise<void> {
  if (!speechOn(g) || !talks.has(g)) return;
  if (g.text.current === SPEECH) await flush(g, false);
  g.text.select(LOG);
}

/** Wait for a key, the story page's arrow blinking at (x, y): the box's lower right corner. */
async function waitHere(g: Game, x: number, y: number): Promise<void> {
  g.p.flushKeys();
  waiting.add(g);
  try {
    // The arrow blinking, and the map going on round the box, as it does round the talk's menu.
    const blink = blinker(g, x, y);
    const animate = animating(g);
    // A key reads on, as at every wait (input.ts rawKey): not a turn of the right stick, nor the window losing focus -
    // a pad whose stick rests off its centre would otherwise turn every page by itself.
    for (;;) {
      const k = await g.p.waitKey(() => {
        blink();
        animate();
      });
      if (k !== TURN_LEFT && k !== TURN_RIGHT && k !== LOST_FOCUS) break;
    }
  } finally {
    waiting.delete(g);
  }
  waitMark(g, false, x, y);
}
const waiting = new WeakSet<Game>();

/** Whether words have been written for the box that it has not yet shown (merchantSpeech.ts). */
export const unshownWords = (g: Game): boolean => talks.has(g) && unshown(g).lines.length > 0;

/** The words written for the box and not yet shown, a line to a row (merchantSpeech.ts). */
export const unshownText = (g: Game): string => (talks.has(g) ? unshown(g).lines.join('\n') : '');

/** Whether the box waits for a key now, its arrow blinking (for whoever plays the game from outside: the tests). */
export const waitsForKey = (g: Game): boolean => waiting.has(g);

/** The box as it stands, in text cells, or none (for whoever looks at the game from outside: the tests). */
export const boxShown = (g: Game): { left: number; top: number; width: number; height: number } | null => {
  const b = talks.get(g)?.shown;
  return b ? { left: b.left, top: b.top, width: b.width, height: b.height } : null;
};

/**
 * Before a word is written (talk.ts): where the row it goes on - the cursor's, or `ahead` the next - lies past the
 * room the box has, the box so far is shown and waits for a key, the word to go on at the top of the next.
 */
export async function room(g: Game, ahead: number): Promise<void> {
  if (!speaking(g)) return;
  const k = talks.get(g)!;
  const w = g.text.windows[SPEECH];
  const { from } = unshown(g);
  if (w.y + ahead - from < k.place.rows) return;
  await showPage(g, true);
}

/** One of the scripts' own pauses (talk.ts, 0x83 and 0x8f): what is written shown, the arrow, till a key. */
export async function pause(g: Game): Promise<boolean> {
  if (!speaking(g)) return false;
  await flush(g, true);
  return true;
}

/** The talk over: what is yet unshown read first (a key, `read`), then the box put away. */
export async function end(g: Game, read: boolean): Promise<void> {
  if (!talks.has(g)) return;
  if (read && speaking(g)) await flush(g, true);
  putAway(g);
  talks.delete(g);
  g.text.stageWindow = -1;
  g.text.select(LOG);
}
