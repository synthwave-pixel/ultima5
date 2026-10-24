/**
 * merchantSpeech.ts
 *
 * A merchant's words in the Dialog setting's box (the port's), as a townsman's are (speech.ts): with Play, what a
 * merchant says between its quotation marks is shown in the box across the top of the view, and the rest - who says
 * it ("Gwenneth says,"), the party's answers, what comes of them ("Sold!") and the lists of wares a keyboard picks
 * from by letter - stays in the log. The shops print as 1988 printed them (shops.ts); their text is parted here by
 * its quotation marks as it is printed (Game.printRoute). The box is shown as the party is asked something (any wait
 * for a key or a choice: Game.beforeRead), and stays up while they answer; the merchant's next words, after it, begin
 * a box afresh. Nothing changes with the Dialog setting's Log.
 */

import type { Game } from './game.ts';
import * as speech from './speech.ts';

/** The message log's window (frame.ts Win.messages). */
const LOG = 2;

interface Visit {
  /** Within the merchant's quotation marks: their words, the box's. */
  quoted: boolean;
  /** The party has been asked something since the box was begun: the merchant's next words begin it afresh. */
  fresh: boolean;
  /** Printing that is the log's whatever the quotation marks say (logOnly): the lists of wares. */
  logOnly: number;
  /** A line's end in their words not yet given (reflow): a paragraph's, if another follows, else a space. */
  held: boolean;
  /** The last letter given to the box. */
  last: string;
  /** The log's last two letters (toLog): whether an empty line ends it already. */
  logTail: string;
}
const visits = new WeakMap<Game, Visit>();

/** Whether a merchant's words go to the box now: a visit under way, with the Dialog setting's Play. */
export const merchantSpeaking = (g: Game): boolean => visits.has(g);

/**
 * `visit` (a shop's, shops.ts merchant) with the merchant's words in the box - where the Dialog setting is Play;
 * else just `visit`. At its end the box's last words are read (a key) and the box put away; broken off (an error),
 * put away unread.
 */
export async function withMerchantSpeech(g: Game, visit: () => Promise<void>): Promise<void> {
  if (!speech.speechOn(g) || visits.has(g)) return visit();
  const v: Visit = { quoted: false, fresh: true, logOnly: 0, held: false, last: '', logTail: g.said.slice(-2) };
  visits.set(g, v);
  const routeWas = g.printRoute;
  const readWas = g.beforeRead;
  g.printRoute = (s) => route(g, v, s);
  g.beforeRead = () => shown(g, v);
  let read = false;
  try {
    await visit();
    read = true;
  } finally {
    g.printRoute = routeWas;
    g.beforeRead = readWas;
    visits.delete(g);
    if (speech.boxShown(g) !== null || staged(g)) g.text.select(speech.SPEECH);
    await speech.end(g, read);
  }
}

/** Whether the merchant's window holds words not yet shown. */
const staged = (g: Game): boolean => speech.unshownWords(g);

/**
 * Text printed in a visit for the log: to the box within the quotation marks (which are not printed), to the log
 * outside them.
 */
function route(g: Game, v: Visit, s: string): void {
  // The log's text alone, or the box's: the party panel, the menus and the borders print as ever.
  const w = g.text.current;
  if (w !== LOG && w !== speech.SPEECH) {
    g.print(s);
    return;
  }
  if (v.logOnly > 0) {
    toLog(g, v, s);
    return;
  }
  let at = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i < s.length && s[i] !== '"') continue;
    const part = s.slice(at, i);
    if (part && v.quoted) {
      // Their words - after the party has answered, a box afresh - and the log's line ended before them (speech.speak).
      if (v.fresh) {
        speech.begin(g);
        v.fresh = false;
        v.last = '';
        v.held = false;
      }
      speech.speak(g);
      g.print(reflow(v, part));
    } else if (part) toLog(g, v, part);
    at = i + 1;
    if (i === s.length) break;
    v.quoted = !v.quoted;
    v.held = false;
    if (!v.quoted) g.text.select(LOG);
  }
}

/**
 * Their words as the box is to show them: 1988's lines were broken for the log's width, and the box is wider, so a
 * line's end within a paragraph is a space (none after a hyphen: "ocean-going"), and only an empty line - a paragraph's
 * end - is kept. A line's end is held until the next letter says which it is.
 */
function reflow(v: Visit, part: string): string {
  let out = '';
  for (const c of part) {
    if (c === '\n') {
      if (v.held) {
        out += '\n\n';
        v.held = false;
        v.last = '\n';
      } else if (v.last === '\n' || v.last === '') out += c;
      else v.held = true;
      continue;
    }
    if (v.held) {
      if (v.last !== '-' && v.last !== ' ' && c !== ' ') out += ' ';
      v.held = false;
    }
    out += c;
    v.last = c;
  }
  return out;
}

/**
 * Printed in the log, whichever window was chosen, and that window chosen again after - without what the merchant's
 * words leave behind there once they are the box's: a space a line begins with (the one after their closing mark,
 * before the party's answer), and more than one empty line in a row.
 */
function toLog(g: Game, v: Visit, s: string): void {
  const was = g.text.current;
  g.text.select(LOG);
  const w = g.text.win;
  for (const c of s) {
    if (c === ' ' && w.x === 0) continue;
    if (c === '\n' && w.x === 0 && (v.logTail === '\n\n' || v.logTail === '')) continue;
    g.print(c);
    v.logTail = (v.logTail + c).slice(-2);
  }
  if (was !== LOG) g.text.select(was);
}

/**
 * The party asked something: what the merchant has said shown (the box stays up while they answer), and the window
 * chosen as it was - a menu's, in the midst of a choice - or, where it was the box's, the log.
 */
async function shown(g: Game, v: Visit): Promise<void> {
  const was = g.text.current;
  if (staged(g)) {
    g.text.select(speech.SPEECH);
    await speech.listen(g);
  }
  g.text.select(was === speech.SPEECH ? LOG : was);
  v.fresh = true;
}

/**
 * One of a shop's pauses (a key to go on, as after the armoury's welcome): what the merchant has said shown, the story
 * page's arrow at its corner till a key; false where their words are the log's, for the shop's own wait.
 */
export async function merchantPause(g: Game): Promise<boolean> {
  const v = visits.get(g);
  if (!v || !staged(g)) return false;
  g.text.select(speech.SPEECH);
  await speech.pause(g);
  g.text.select(LOG);
  v.fresh = true;
  return true;
}

/**
 * `print` done in the log alone, quotation marks or none: a list of wares, picked from by letter (shops.ts) - the log
 * the window chosen while it prints, so that what it asks of the cursor (a line begun afresh) is asked of the log's.
 */
export function logOnly(g: Game, print: () => void): void {
  const v = visits.get(g);
  if (!v) return print();
  const was = g.text.current;
  v.logOnly++;
  g.text.select(LOG);
  try {
    print();
  } finally {
    v.logOnly--;
    g.text.select(was);
  }
}
