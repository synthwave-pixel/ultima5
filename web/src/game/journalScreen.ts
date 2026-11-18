/**
 * journalScreen.ts
 *
 * The journal on its own screen (the Pause menu's Journal), its cards and their titles. Moved out of menu.ts, which
 * keeps the menus' own workings.
 */

import { clearBorderTitle, drawVitals, Win } from './frame.ts';
import { drawTextCard } from './shopCard.ts';
import { Game } from './game.ts';
import { Pad } from './io.ts';
import { journalTop, type JournalLine } from './journal.ts';
import { Colour } from '../ui/colours.ts';
import { LEFT_FOR_HOOK, choose, restoreView, showText, wrap } from './menu.ts';
/** The journal: the quest's state, then the clues heard. */
/**
 * The journal (journal.ts journalTop): how the quest stands, a line for each part with its count. A opens a part that
 * is many (the shrines, the dungeons, the Shadowlords) onto a line for each, or the clues heard to read, and on a line
 * that says what a thing is for (a piece of equipment's use), prints that; Y on any line, and Y alone, prints its hint
 * in the log - a hint is asked for, never given by the button that opens. B goes back, and out.
 */
/** The most letters a card's title has on the panel's border, its colon among them (frame.ts borderTitle). */
const CARD_TITLE = 13;

/**
 * A journal card's title, fitted to the panel's border: the name and a colon; else the name; else as many of its words
 * as fit, with the colon ("Buccaneer's:", "Sandalwood:"). Longer, it ran past the border's end and was left there.
 */
export function cardTitle(name: string): string {
  if (name.length + 1 <= CARD_TITLE) return `${name}:`;
  if (name.length <= CARD_TITLE) return name;
  let out = '';
  for (const word of name.split(' ')) {
    const next = out ? `${out} ${word}` : word;
    if (next.length + 1 > CARD_TITLE) break;
    out = next;
  }
  return out ? `${out}:` : `${name.slice(0, CARD_TITLE - 1)}:`;
}

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
  /** A place to see on the map (X on a line that names one: JournalLine.view), opened once the list has been left. */
  let viewing: { key: string; at: number } | null = null;
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
        const foot = [line.hint ? 'Y: Hint' : '', line.view && g.hooks.showMap ? 'X: View' : ''].filter(Boolean).join(' ');
        drawTextCard(g, cardTitle(line.card ?? line.open?.title ?? nameOf(line)), line.about ?? '', foot);
        carded = true;
      } else if (carded) {
        clearBorderTitle(g);
        drawVitals(g);
        carded = false;
      }
    };
    g.choiceKey = (k, i, shown) => {
      if (shown !== title) return false;
      // X on a place: the map, opened on it (the letter too, as Y's hint is, where the keyboard is Classic).
      if (k === Pad.X || k === 0x58 || k === 0x78) {
        const view = lines[i]?.view;
        if (!view || !g.hooks.showMap) return true;
        viewing = { key: view, at: i };
        return 'leave';
      }
      if (k !== Pad.Y && k !== 0x59 && k !== 0x79) return false;
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
        const view = viewing;
        if (r === LEFT_FOR_HOOK && view) {
          viewing = null;
          await g.hooks.showMap?.(false, view.key);
          await restoreView(g);
          at = view.at;
          continue;
        }
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
  /** A line's page of lines, and A on one of them its page in turn (Places' kinds, their places) or its page to read. */
  const openPage = async (page: NonNullable<JournalLine['open']>): Promise<void> => {
    const lines = page.lines;
    for (let i = 0; (i = await list(page.title, lines, i)) >= 0; ) {
      const open = lines[i].open;
      const read = lines[i].read;
      if (open) await openPage(open);
      else if (read) await readPage(nameOf(lines[i]), read);
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
      await openPage(line.open);
    } else await tell(nameOf(line), line.about ?? '');
  }
  await restoreView(g);
  return 0;
}
