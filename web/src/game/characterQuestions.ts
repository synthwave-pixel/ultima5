/**
 * characterQuestions.ts
 *
 * The questions a new character is asked at the title that are every game's on this engine, not one game's rules:
 * the Avatar's name (typed, or from a menu: one of the port's names, or the device's keyboard), how the Avatar is
 * addressed (Lady or Sir), and Thine Adventure (the rules the game is played by). Ultima V asks them in its
 * createCharacter (intro.ts); a game made on this engine without Ultima V's files asks the same.
 */

import { TICK_MS } from './effects.ts';
import type { GameCore } from './gameCore.ts';
import { asPad, upper } from './input.ts';
import { K, Pad } from './io.ts';
import { menuSound } from './menu.ts';

/** Names the port offers a player who would rather not think of one. They are the port's own. */
const SUGGESTED = [
  'Alaric',
  'Brianna',
  'Cedric',
  'Dorian',
  'Elara',
  'Faron',
  'Gwyneth',
  'Hollis',
  'Isolde',
  'Jarek',
  'Kestrel',
  'Lysander',
  'Maren',
  'Niall',
  'Orin',
  'Perrin',
  'Quillon',
  'Rowena',
  'Sable',
  'Torin',
  'Ulric',
  'Verity',
  'Wren',
  'Yvaine',
];

/** The rows under the name's line where its menu stands. */
const NAME_MENU_ROW = 0x15;

/** The answers to how the Avatar is addressed, as shown: the save's 0x0c (female) and 0x0b (male). */
const ADDRESSED: readonly [string, number][] = [
  ['Lady', 0x0c],
  ['Sir', 0x0b],
];

/**
 * How the Avatar is addressed (the port's words for the original's "Art thou Male or Female?", which only ever chose
 * the words the Avatar is spoken to with - "lady" or "sir" - and nothing of the Avatar's look or powers), in a box of
 * its own above the title's: Lady on the left and Sir on the right, neither chosen until the d-pad chooses one, and A
 * taking it - or typed, L or S, or the original's F or M. A with neither chosen is refused (the menus' no, the arrows
 * lit a moment). `start`, the answer given before (the save's gender), come back to from the step after: it is chosen
 * to begin with. The save's gender for the answer, or null for B (back to the name). The screen is put back as it
 * was, the box's copper for the caller to let go.
 */
export async function askAddress(g: GameCore, start?: number): Promise<number | null> {
  const t = g.text;
  const was = t.current;
  const back = g.p.fx.keepScreen?.();
  const { box } = await import('./menu.ts');
  const WIDTH = 21;
  box(g, '', WIDTH, 4);
  const put = (col: number, row: number, text: string, inverse = false): void => {
    const advance = t.advance;
    t.advance = false;
    t.inverse = inverse;
    for (let i = 0; i < text.length; i++) {
      t.moveTo(col + i, row);
      t.printChar(text.charCodeAt(i));
    }
    t.inverse = false;
    t.advance = advance;
  };
  const centre = (row: number, text: string): void => put((WIDTH - text.length) >> 1, row, text);
  centre(0, 'How art thou');
  centre(1, 'addressed?');
  let chosen = ADDRESSED.findIndex(([, gender]) => gender === start);
  // The arrows are the font's own (0x1b and 0x1a): the way to press for each.
  const show = (): void => {
    put(0, 3, '\x1b ');
    put(2, 3, ADDRESSED[0][0], chosen === 0);
    const sir = ADDRESSED[1][0];
    put(WIDTH - 2 - sir.length, 3, sir, chosen === 1);
    put(WIDTH - 2, 3, ' \x1a');
  };
  let taken = false;
  try {
    for (;;) {
      show();
      const k = upper(asPad(g, await g.p.waitKey(() => g.titleIdle?.())));
      if (k === K.Left || k === K.Right) {
        chosen = k === K.Left ? 0 : 1;
        menuSound(g, 'move');
      } else if (k === Pad.A || k === K.Enter) {
        if (chosen >= 0) {
          taken = true;
          break;
        }
        // Nothing chosen to take: the menus' no (their back's low note), and the arrows lit a moment - the way to choose.
        menuSound(g, 'back');
        put(0, 3, '\x1b', true);
        put(WIDTH - 1, 3, '\x1a', true);
        await g.p.sleep(TICK_MS * 3);
      } else if (k === 0x4c || k === 0x46 || k === 0x53 || k === 0x4d) {
        chosen = k === 0x4c || k === 0x46 ? 0 : 1; // L or the original's F; S or M
        taken = true;
        break;
      } else if (k === Pad.B || k === K.Escape || k === K.Space) {
        menuSound(g, 'back');
        break;
      }
    }
  } finally {
    back?.();
    t.select(was);
  }
  return taken ? ADDRESSED[chosen][1] : null;
}

/**
 * ULTIMA_1e38: the Avatar's name (case kept), on the line at column `at` of row 0x13. Typed on a keyboard as it
 * always was, straight onto the line. With a controller or a touch screen, from a menu under it: "Type a name" opens
 * the device's own keyboard in a box high on the screen (hooks.askText), where a phone's keyboard coming up from
 * below leaves it in sight - never a keyboard drawn in the game; "Suggest a name" gives one of the port's (the ultima3
 * port's offer); and once there is a name, "Continue" takes it. X and Y are the last two as well, unsaid. `start`, a
 * name already given (come back to from the next question), begins it instead of one of the port's.
 * `menuRow`, the first of the three rows its menu stands in (Ultima V: 0x15, under the name's line).
 */
export async function askName(g: GameCore, max: number, at: number, start = '', menuRow = NAME_MENU_ROW): Promise<string> {
  const t = g.text;
  let s = '';
  /** Whether the name is one of the port's, as given: a letter typed then begins a name of the player's own. */
  let given = false;
  const items = (): string[] => ['Type a name', 'Suggest a name', ...(s ? ['Continue'] : [])];
  let sel = 0;
  const show = (): void => {
    t.moveTo(at, 0x13);
    g.print(s.padEnd(max));
    const list = items();
    for (let r = 0; r < 3; r++) {
      // Within the box's borders, which the lines are cleared inside of.
      t.moveTo(1, menuRow + r);
      g.print(' '.repeat(0x26));
      const label = list[r];
      if (!label) continue;
      t.moveTo((0x27 - label.length) >> 1, menuRow + r);
      t.inverse = r === sel;
      g.print(label);
      t.inverse = false;
    }
    t.moveTo(at + s.length, 0x13);
  };
  const setName = (name: string): void => {
    s = name.slice(0, max);
    given = false;
    // A name of the player's own in hand: the bar goes to taking it.
    if (s) sel = items().indexOf('Continue');
  };
  /** One of the port's names, not the one there already; the bar left on "Suggest a name", to be pressed again. */
  const suggest = (): void => {
    let name = s;
    while (name === s) name = SUGGESTED[g.random(0, SUGGESTED.length - 1)].slice(0, max);
    s = name;
    given = true;
    sel = items().indexOf('Suggest a name');
  };
  // A name to begin with: the one given, come back to, or one of the port's, to be kept, rolled again or typed over.
  if (start) {
    s = start.slice(0, max);
    sel = items().indexOf('Continue');
  } else suggest();
  const type = async (): Promise<void> => {
    // A gamepad has no keyboard to type in the page's box with (a television, a handheld): the letter picker, over
    // the screen, which is put back as it was.
    if (g.lastSource === 'gamepad' || !g.hooks.askText) {
      const back = g.p.fx.keepScreen?.();
      const { letterPicker } = await import('./menu.ts');
      const word = await letterPicker(g, true, false);
      back?.();
      const typed = String.fromCharCode(...word.filter((c) => c > 0x1f && c < 0x7f)).trim();
      if (typed) setName(typed);
      return;
    }
    // The flames burn on behind the page's box (and around it, where it covers them): it waits for its own keys, not
    // the game's, so the title's idle is kept going here, at the pace a key's wait keeps it.
    const burning = g.titleIdle ? setInterval(() => g.titleIdle?.(), TICK_MS * 2) : null;
    let typed: string | null;
    try {
      typed = await g.hooks.askText('By what name shalt thou be known?', s, max);
    } finally {
      if (burning !== null) clearInterval(burning);
    }
    if (typed?.trim()) setName(typed.trim());
  };
  for (;;) {
    show();
    // Keys as typed (a name's letters are not the pad's), but Enter is A in Controller input, as everywhere else: it
    // presses the bar - rolling another name where it stands on "Suggest a name" - rather than keeping the name.
    const typed = await g.p.waitKey(() => g.titleIdle?.());
    const k = typed === K.Enter && g.options.input === 'controller' ? Pad.A : typed;
    const list = items();
    if (k === K.Up) sel = (sel + list.length - 1) % list.length;
    else if (k === K.Down) sel = (sel + 1) % list.length;
    else if (k === Pad.X || k === K.Tab) suggest();
    else if (k === Pad.Y) await type();
    // B with no name to rub out goes back to the title (a character not made after all).
    else if ((k === Pad.B || k === K.Escape) && !s) break;
    else if (k === Pad.A || (k === K.Enter && !s)) {
      const choice = list[sel];
      if (choice === 'Continue') break;
      if (choice === 'Suggest a name') suggest();
      else await type();
    } else if (k === K.Enter) break;
    // Rubbing out one of the port's names takes it all: it is not a name the player began.
    else if ((k === K.Backspace || k === K.Left || k === Pad.B) && s.length !== 0) s = given ? '' : s.slice(0, -1);
    else if (k === K.Escape) s = '';
    else if (k > 0x1f && k < 0x80 && (given || s.length < max)) {
      if (given) [s, given] = ['', false];
      s += String.fromCharCode(k);
    }
    sel = Math.min(sel, items().length - 1);
  }
  // Within the box's borders, as the lines were drawn: from column 0 the box's left edge went with them.
  for (let r = 0; r < 3; r++) {
    t.moveTo(1, menuRow + r);
    g.print(' '.repeat(0x26));
  }
  t.moveTo(at, 0x13);
  g.print(s);
  return s;
}

/**
 * How hard a game the new character is to have (the ultima3 port's question): each answer sets the rules that
 * Settings holds, where they may be changed afterwards - on the copy of the settings in use the new character is
 * given, kept with them as they are made (createCharacter). Backing out leaves them as they are.
 * `classicYear`, the year the game came out, in Classic's words (Ultima V: 1988).
 */
export async function askAdventure(g: GameCore, classicYear = 1988): Promise<void> {
  const { choose } = await import('./menu.ts');
  // In the middle of the screen in its own frame, above the name and address just given.
  const i = await choose(
    g,
    'Thine Adventure',
    [
      {
        label: 'Modern (recommended)',
        note: 'Poison, hunger never kill. XP shared. Fights eased.',
      },
      {
        label: `Classic (as in ${classicYear})`,
        note: `As in ${classicYear}: deadly, XP unshared.`,
      },
      { label: 'Story (relaxed)', note: 'As Modern, never hungry; fights eased more.' },
    ],
    0,
    true,
  );
  if (i < 0) return;
  const o = g.options;
  o.rules = i === 1 ? 'classic' : i === 0 ? 'modern' : 'story';
  g.hooks.applyOptions?.(o);
}
