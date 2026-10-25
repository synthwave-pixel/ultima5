/**
 * merchantSpeech.ts
 *
 * A merchant's words in the Dialog setting's box (the port's), as a townsman's are (speech.ts): with Play, what a
 * merchant says between its quotation marks is shown in the box across the top of the view, the marks and all, and the rest - who says
 * it ("Gwenneth says,"), the party's answers, what comes of them ("Sold!") and the lists of wares a keyboard picks
 * from by letter - stays in the log. The shops print as 1988 printed them (shops.ts); their text is parted here by
 * its quotation marks as it is printed (Game.printRoute). The box is shown as the party is asked something (any wait
 * for a key or a choice: Game.beforeRead), and stays up while they answer; the merchant's next words, after it, begin
 * a box afresh. Nothing changes with the Dialog setting's Log.
 */

import type { Game } from './game.ts';
import * as speech from './speech.ts';
import { cue } from './cues.ts';

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
  /** Spaces not yet given (reflow): given before the next letter, not before a closing mark. */
  spaces: number;
  /** A paragraph's end held (reflow): a line's end before the next letter. */
  para: boolean;
  /** Their last word, kept back for what follows it - their closing mark, wrapped with it - till it comes (route). */
  tail: string;
  /** The box's own printing (boxPrint), not to be parted again. */
  direct: boolean;
  /** The log's last two letters (toLog): whether an empty line ends it already. */
  logTail: string;
  /** Their opening quotation mark, for the box, not yet given: it goes before the first letter after it (reflow). */
  opening: boolean;
  /** Given, the words after it in the box: the closing mark is the box's too. */
  opened: boolean;
  /** A list of wares kept from the log (logOnly, a controller's), as it was printed; null while none is. */
  hidden: string | null;
  /** The last letter printed in the visit, for a quotation mark at the start of the next to be read by (route). */
  lastRaw: string;
  /** Printed outside their marks and not yet given the log: the log's, or their words missing a mark (route). */
  pending: string;
  /** Their closing mark given with their last words already (sayWords). */
  closed: boolean;
  /** The party has been asked something, and nothing printed since: what is, outside a mark, is their answer. */
  echo: boolean;
  /** The merchant's name (merchantKeeper): the log's lines that only name who speaks ("says Max.") left out. */
  keeper: string;
}
const visits = new WeakMap<Game, Visit>();

/** The merchant of the visit under way, by name (shops.ts merchant): for the lines that only name who speaks. */
export function merchantKeeper(g: Game, name: string): void {
  const v = visits.get(g);
  if (v) v.keeper = name;
}

/**
 * The log's lines that only name who speaks - "Max says,", "says Max.", "Donya asks," - left out of `s`: with the box
 * the merchant's words are plainly theirs. A yell ("yells Max.") is heard instead (cues.ts Yell).
 */
function unnamed(g: Game, v: Visit, s: string): string {
  if (!v.keeper) return s;
  const name = v.keeper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let yelled = false;
  const line = (verb: string, lead: string): string => {
    if (verb === 'yells') yelled = true;
    return lead;
  };
  s = s
    .replace(new RegExp(`(^|\\n)[ \\t]*(says|yells|asks) ${name}\\.?[ \\t]*(?=\\n|$)`, 'g'), (_, lead: string, verb: string) =>
      line(verb, lead),
    )
    .replace(new RegExp(`(^|\\n)[ \\t]*${name} (says|yells|asks)[,:]?[ \\t]*(?=\\n|$)`, 'g'), (_, lead: string, verb: string) =>
      line(verb, lead),
    );
  if (yelled) void cue(g, 'Yell');
  return s;
}

/** Whether a merchant's words go to the box now: a visit under way, with the Dialog setting's Play. */
export const merchantSpeaking = (g: Game): boolean => visits.has(g);

/**
 * `visit` (a shop's, shops.ts merchant) with the merchant's words in the box - where the Dialog setting is Play;
 * else just `visit`. At its end the box's last words are read (a key) and the box put away; broken off (an error),
 * put away unread.
 */
export async function withMerchantSpeech<T>(g: Game, visit: () => Promise<T>): Promise<T> {
  return withSpeaker(g, null, visit);
}

/**
 * `speak` - whatever someone says to the party with quotation marks about it, a guard's arrest, a prisoner's thanks,
 * the old man's word at the camp - with their words in the box as a merchant's are (this module's routing), the box
 * placed for where they stand (`from`: squares from the party; null, the townsman talked to). Where the Dialog
 * setting is Log, just `speak`.
 */
export async function withSpeaker<T>(g: Game, from: { dx: number; dy: number } | null, speak: () => Promise<T>): Promise<T> {
  if (!speech.speechOn(g) || visits.has(g)) return speak();
  const v: Visit = {
    quoted: false,
    fresh: true,
    logOnly: 0,
    held: false,
    last: '',
    logTail: g.said.slice(-2),
    opening: false,
    opened: false,
    spaces: 0,
    para: false,
    tail: '',
    direct: false,
    hidden: null,
    lastRaw: '\n',
    pending: '',
    closed: false,
    echo: false,
    keeper: '',
  };
  visits.set(g, v);
  speech.speakFrom(g, from);
  const routeWas = g.printRoute;
  const readWas = g.beforeRead;
  g.printRoute = (s) => route(g, v, s);
  g.beforeRead = () => shown(g, v);
  let read = false;
  try {
    const out = await speak();
    read = true;
    return out;
  } finally {
    giveLog(g, v);
    giveTail(g, v);
    g.printRoute = routeWas;
    g.beforeRead = readWas;
    visits.delete(g);
    if (speech.boxShown(g) !== null || staged(g)) g.text.select(speech.SPEECH);
    await speech.end(g, read);
    speech.speakFrom(g, null);
  }
}

/** Where `actor` stands, squares from the party (withSpeaker's `from`). */
export const fromActor = (g: Game, actor: number): { dx: number; dy: number } => {
  const a = g.s.actors[actor];
  return a ? { dx: a.x - g.s.x, dy: a.y - g.s.y } : { dx: 0, dy: 0 };
};

/** Whether the merchant's window holds words not yet shown. */
const staged = (g: Game): boolean => speech.unshownWords(g);

/**
 * Text printed in a visit for the log: to the box within the quotation marks - the marks with them, as a townsman's
 * words are shown - to the log outside them. What is outside them is held (Visit.pending) until it is known whose it
 * is: a mark that opens after it, or the party asked something, and it was the log's; a mark that closes after it -
 * 1988 leaving its opening mark out, as where a choice backed out of has a shop ask its question again - and it was
 * the merchant's, their words missing their mark.
 */
function route(g: Game, v: Visit, s: string): void {
  // The log's text alone, or the box's: the party panel, the menus and the borders print as ever.
  const w = g.text.current;
  if ((w !== LOG && w !== speech.SPEECH) || v.direct) {
    g.print(s);
    return;
  }
  if (v.logOnly > 0) {
    if (v.hidden !== null) v.hidden += s;
    else toLog(g, v, s);
    return;
  }
  let at = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i < s.length && s[i] !== '"') continue;
    const part = s.slice(at, i);
    const mark = i < s.length;
    if (v.quoted && part) sayWords(g, v, part, mark);
    else if (part && v.echo) {
      // The first printed after the party is asked, outside any mark: their answer echoed (":Yes"), the log's.
      v.echo = false;
      giveLog(g, v);
      toLog(g, v, part);
    } else if (part) v.pending += part;
    if (part && /\S/.test(part)) v.echo = false;
    at = i + 1;
    if (!mark) break;
    // The mark read by what is either side of it: at a word's start (a line's start or a space before it, a letter
    // after), it opens; after a letter or a stop, it closes.
    const before = i > 0 ? s[i - 1] : v.lastRaw;
    const atStart = /^\s?$/.test(before) && /[A-Za-z'.]/.test(s[i + 1] ?? '');
    if (v.quoted) {
      closeWords(g, v);
      // Their words left unclosed (a choice backed out of: "Thou canst buy:", then "Come back when ..."): closed, and
      // this mark opens their next.
      if (atStart) openWords(v);
    } else if (!atStart && /\S/.test(before) && /\S/.test(v.pending)) {
      // A mark that closes with none opened: what was held was their words, their opening mark left out.
      const words = v.pending.replace(/^\s+/, '');
      const lead = v.pending.slice(0, v.pending.length - words.length);
      v.pending = lead;
      openWords(v);
      sayWords(g, v, words, true);
      closeWords(g, v);
    } else {
      giveLog(g, v);
      openWords(v);
    }
  }
  if (s) v.lastRaw = s[s.length - 1];
}

/** Their words begun: the opening mark to go before their first letter (reflow). */
function openWords(v: Visit): void {
  v.quoted = true;
  v.held = v.para = false;
  v.spaces = 0;
  v.opening = true;
  v.opened = false;
}

/**
 * Their words written for the box - after the party has answered, a box afresh, and the log's line ended before them
 * (speech.speak) - `closing` where their closing mark comes after them, wrapped with them.
 */
function sayWords(g: Game, v: Visit, part: string, closing: boolean): void {
  if (v.fresh) {
    giveLog(g, v);
    speech.begin(g);
    v.fresh = false;
    v.last = '';
    v.held = v.para = false;
    v.spaces = 0;
    // A quotation begun before the party was asked, and taken up after it: opened afresh in the new box.
    if (!v.opening) v.opening = true;
  }
  speech.speak(g);
  let out = v.tail + reflow(v, part);
  v.tail = '';
  // The closing mark with the words before it, so that the two are wrapped as one (not the mark alone on a line);
  // else their last word kept back for it (a shop prints the mark apart, after them).
  if (closing && v.opened) {
    out += '"';
    v.last = '"';
    v.closed = true;
  } else {
    const cut = Math.max(out.lastIndexOf(' '), out.lastIndexOf('\n')) + 1;
    v.tail = out.slice(cut);
    out = out.slice(0, cut);
  }
  boxPrint(g, out);
}

/** Their words ended: their closing mark after them in the box (where it is not already, nor shown already). */
function closeWords(g: Game, v: Visit): void {
  if (v.opened && !v.fresh && !v.closed) {
    g.text.select(speech.SPEECH);
    boxPrint(g, `${v.tail}"`);
    v.tail = '';
    v.last = '"';
  }
  v.quoted = false;
  v.closed = false;
  v.held = v.para = false;
  v.spaces = 0;
  v.opening = v.opened = false;
  g.text.select(LOG);
}

/** What was held for the log (Visit.pending), given it: known now to be the log's. */
function giveLog(g: Game, v: Visit): void {
  if (!v.pending) return;
  const text = v.pending;
  v.pending = '';
  toLog(g, v, text);
}

/** Printed in the box's window (chosen), as it is: no space to begin a line the last filled. */
function boxPrint(g: Game, out: string): void {
  const v = visits.get(g);
  const w = g.text.win;
  if (w.x === 0 || w.x > w.right - w.left) out = out.replace(/^ +/, '');
  if (!out) return;
  if (v) v.direct = true;
  try {
    g.print(out);
  } finally {
    if (v) v.direct = false;
  }
}

/** Their last word, kept back (Visit.tail), given to the box: before it is shown. */
function giveTail(g: Game, v: Visit): void {
  if (!v.tail) return;
  const was = g.text.current;
  g.text.select(speech.SPEECH);
  boxPrint(g, v.tail);
  v.tail = '';
  g.text.select(was);
}

/**
 * Their words as the box is to show them: 1988's lines were broken for the log's width, and the box is wider, so a
 * line's end within a paragraph is a space (none after a hyphen: "ocean-going"), and a paragraph's end (an empty line)
 * a line's end. A line's end is held until the next letter says which it is.
 */
function reflow(v: Visit, part: string): string {
  let out = '';
  for (const c of part) {
    // The opening mark before their first letter, a space between it and words before it in the box.
    if (v.opening) {
      if (c === '\n' || c === ' ') continue;
      out += (v.last !== '' && v.last !== '\n' ? ' ' : '') + '"';
      v.opening = false;
      v.opened = true;
      v.last = '"';
    }
    if (c === '\n') {
      // A paragraph's end a line's end alone in the box, no empty row (the box has few to spare: a short question
      // after a long speech is not to be paged apart from it), and never two - held, as a line's end is, till the
      // next letter: none before a closing mark.
      if (v.held) v.para = true;
      else if (v.last !== '\n' && v.last !== '') v.held = true;
      continue;
    }
    // Spaces held too, till a letter after them: none before the closing mark, nor two for a line's end after one -
    // nor two at all, the box's lines its own (1988's karma words have "achieved  the" for one).
    if (c === ' ') {
      if (!v.held) v.spaces++;
      continue;
    }
    if (v.para) out += '\n';
    else if (v.held) {
      if (v.last !== '-' && !/[?!.,;:]/.test(c)) out += ' ';
    } else if (v.spaces > 0) out += ' ';
    v.held = v.para = false;
    v.spaces = 0;
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
  s = unnamed(g, v, s);
  // The letter a choice echoes in the log ("M"), as its menu labelled it ("Mutton"), as a townsman's talk echoes it.
  const pick = g.lastPick;
  const letter = /^(\s*)([A-Za-z])(\s*)$/.exec(s);
  if (pick && letter && letter[2].toUpperCase().charCodeAt(0) === pick.letter) {
    s = `${letter[1]}${pick.label}${letter[3]}`;
    g.lastPick = null;
  }
  const was = g.text.current;
  g.text.select(LOG);
  // What goes, worked out ahead of the cursor, then printed whole: the log wraps a word it is given whole, never one
  // given it a letter at a time.
  let x = g.text.win.x;
  let tail = v.logTail;
  let out = '';
  for (const c of s) {
    if (c === ' ' && x === 0) continue;
    if (c === '\n' && x === 0 && (tail === '\n\n' || tail === '')) continue;
    out += c;
    x = c === '\n' ? 0 : x + 1;
    tail = (tail + c).slice(-2);
  }
  if (out) g.print(out);
  v.logTail = tail;
  if (was !== LOG) g.text.select(was);
}

/**
 * The party asked something: what the merchant has said shown (the box stays up while they answer), and the window
 * chosen as it was - a menu's, in the midst of a choice - or, where it was the box's, the log.
 */
async function shown(g: Game, v: Visit): Promise<void> {
  const was = g.text.current;
  // Their sentence left open on a colon ("Excellent! We stock:"), the party asked something first (who is buying):
  // its words wait for what follows, shown with it, not alone.
  if (v.quoted && /:\s*$/.test(`${speech.unshownText(g)}${v.tail}`)) return;
  // Held for the log, the log's (the party asked something: no mark closes it now) - the choice echoed in it first.
  giveLog(g, v);
  g.lastPick = null;
  v.echo = true;
  giveTail(g, v);
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
  if (v) {
    giveLog(g, v);
    giveTail(g, v);
  }
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
  // (What was held before it the log's, before the list.)
  if (!v.quoted) giveLog(g, v);
  v.logOnly++;
  if (g.options.input === 'controller') v.hidden = '';
  g.text.select(LOG);
  try {
    print();
  } finally {
    v.logOnly--;
    g.text.select(was);
    // With a controller the list is the menu's (its wares, priced), not the log's as well: kept in what was said, a
    // line to each, for the menu read from it (input.ts letteredChoices).
    if (v.hidden !== null) {
      const list = `${g.said.endsWith('\n') ? '' : '\n'}${v.hidden.replace(/(?<=\S)(?=[A-Za-z]\.{3,})/g, '\n')}\n`;
      g.said = (g.said + list).slice(-700);
      g.saidSince = (g.saidSince + list).slice(-700);
      v.hidden = null;
    }
  }
}
