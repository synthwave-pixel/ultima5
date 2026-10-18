/**
 * speech.ts
 *
 * The Dialog setting's Play (the port's): what a townsman says, shown in the play area rather than the message log -
 * in the half of the view opposite the talk's menu (menu.ts talkBand), short of the townsman where they stand on that
 * side, so the party at the middle and they are in sight between. A reply too long for it is shown a page at a time,
 * the blinking arrow of a story page (waitMark.ts) at its corner till a key is pressed; so are the pauses the scripts
 * themselves make. What the party says, the prompts and the townsman's description stay in the log.
 */

import type { Game } from './game.ts';
import { Colour } from '../ui/colours.ts';
import { blinker, waitMark } from './waitMark.ts';

/** The text window the townsman's words are written in (frame.ts's are 0-2, the menus' 3). */
export const SPEECH = 4;
/** The message log's (frame.ts Win.messages). */
const LOG = 2;

/** The menus' columns in the map's square (menu.ts LEFT, WIDTH). */
const LEFT = 1;
const WIDTH = 21;

/** The panel as it stands: its text rows (the title's above them), and whether anything is yet unread in it. */
interface Panel {
  title: string;
  first: number;
  last: number;
  side: 'top' | 'bottom';
}
const panels = new WeakMap<Game, Panel>();

/** Whether the townsman's words go to the play area: the Dialog setting's Play, in play. */
export const speechOn = (g: Game): boolean => g.options.dialog === 'play' && g.inPlay;

/**
 * The panel's rows (its title's first, then its words') for the townsman `dy` rows of squares from the party: the top
 * of the view (the talk's menu below) for one north of it, or east or west, short of them where they stand above; the
 * bottom for one south, short of them. A row's gap always between the panel and the squares in sight.
 */
export function panelRows(dy: number): { side: 'top' | 'bottom'; first: number; last: number } {
  // The party's square is the view's sixth row (5): rows of squares are two of text, the view's first at text row 1.
  // One further than across a counter (a word shouted across the room) is taken as beside: the whole half.
  if (Math.abs(dy) > 2) dy = 0;
  if (dy > 0) return { side: 'bottom', first: 1 + 2 * (5 + dy) + 1 + 2, last: 22 };
  return { side: 'top', first: 1, last: dy < 0 ? 1 + 2 * (5 + dy) - 2 : 9 };
}

/**
 * Begin the townsman's words afresh: the panel drawn (cleared, its title the townsman's name or what is seen of them,
 * a line between it and the view), and its window chosen. Nothing where the setting is Log.
 */
export function begin(g: Game, title = panels.get(g)?.title ?? ''): void {
  if (!speechOn(g)) return;
  const s = g.s;
  const a = s.actors[s.npcs[g.talk.npc]?.actor ?? -1];
  const { side, first, last } = panelRows(a ? a.y - s.y : 0);
  panels.set(g, { title, first, last, side });
  frame(g);
}

/** Draw the panel and choose its window, the cursor at its top. */
function frame(g: Game): void {
  const p = panels.get(g);
  if (!p) return;
  const d = g.draw;
  const t = g.text;
  // Its rows (title first, then the text) and half the gap's row, the line between it and the view in the gap.
  const [y1, y2] = p.side === 'top' ? [8, p.last * 8 + 11] : [p.first * 8 - 4, 0xb7];
  d.pen = 0;
  d.fill(8, y1, 0xb7, y2);
  d.pen = Colour.blue;
  const edge = p.side === 'top' ? y2 : y1;
  d.line(8, edge, 0xb7, edge);
  d.chromeSpeech?.([8, y1, 0xb7, y2]);
  // The title on the panel's first row, centred; the words below it.
  const titleRow = p.first;
  const top = p.first + 1;
  // (A letter short of the row: a full one would begin the next, and the one row's window scroll it away. Not heard:
  // the title is no word of theirs - the conversation's recording, which the journal and the words read, goes without.)
  t.setWindow(SPEECH, LEFT, titleRow, LEFT + WIDTH - 1, titleRow);
  t.select(SPEECH);
  t.moveTo(0, 0);
  const title = p.title.slice(0, WIDTH - 1);
  const heard = g.recording;
  g.recording = null;
  g.print(title.padStart((WIDTH + title.length) >> 1).padEnd(WIDTH - 1));
  g.recording = heard;
  t.setWindow(SPEECH, LEFT, top, LEFT + WIDTH - 1, p.last);
  t.select(SPEECH);
  t.moveTo(0, 0);
}

/** The townsman speaks: their window chosen (after the log had the party's words). */
export function speak(g: Game): void {
  if (speechOn(g) && panels.has(g)) g.text.select(SPEECH);
}

/** The party speaks, or the game prompts: the log chosen. */
export function listen(g: Game): void {
  if (speechOn(g) && panels.has(g)) g.text.select(LOG);
}

/** Whether the townsman's window is the one written in now. */
const speaking = (g: Game): boolean => speechOn(g) && panels.has(g) && g.text.current === SPEECH;

/** Whether the townsman's window has anything in it yet. */
const written = (g: Game): boolean => {
  const w = g.text.windows[SPEECH];
  return w.x !== 0 || w.y !== 0;
};

/** Wait for a key, the story page's arrow blinking at the panel's lower right corner. */
async function waitHere(g: Game): Promise<void> {
  const p = panels.get(g);
  if (!p) return;
  const x = (LEFT + WIDTH) * 8 - 9;
  const y = p.last * 8 + 2;
  g.p.flushKeys();
  waiting.add(g);
  try {
    await g.p.waitKey(blinker(g, x, y));
  } finally {
    waiting.delete(g);
  }
  waitMark(g, false, x, y);
}
const waiting = new WeakSet<Game>();

/** Whether the panel waits for a key now, its arrow blinking (for whoever plays the game from outside: the tests). */
export const waitsForKey = (g: Game): boolean => waiting.has(g);

/** The panel's rows as they stand, or none (for whoever looks at the game from outside: the tests). */
export const panelShown = (g: Game): { side: 'top' | 'bottom'; first: number; last: number } | null => {
  const p = panels.get(g);
  return p ? { side: p.side, first: p.first, last: p.last } : null;
};

/**
 * Before a line is broken (talk.ts, `breaking`): where the new line would run past the panel's last row, the page
 * waits for a key and is begun again, the words to go on at its top.
 */
export async function room(g: Game, breaking: boolean): Promise<void> {
  if (!breaking || !speaking(g)) return;
  const w = g.text.win;
  if (w.y < w.bottom - w.top) return;
  await waitHere(g);
  frame(g);
}

/** One of the scripts' own pauses (talk.ts, 0x83 and 0x8f): in the panel, the arrow, till a key. */
export async function pause(g: Game): Promise<boolean> {
  if (!speaking(g)) return false;
  if (written(g)) await waitHere(g);
  return true;
}

/** The talk over: what is yet unread in the panel read first (a key), then the panel put away. */
export async function end(g: Game, read: boolean): Promise<void> {
  if (!panels.has(g)) return;
  if (read && speaking(g) && written(g)) await waitHere(g);
  panels.delete(g);
  g.draw.chromeSpeech?.(null);
  g.text.select(LOG);
}
