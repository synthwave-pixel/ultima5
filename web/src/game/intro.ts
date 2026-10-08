/**
 * intro.ts
 *
 * The title and everything before the game (u5d intro.c, font.c): the
 * Origin logo, Lord British's signature, the title with "Warriors of
 * Destiny", the menu, the illustrated introduction, the acknowledgements,
 * character creation by the virtues' dilemmas, and the attract mode's
 * little scenes ("Return to the View").
 */

import { loadResource } from '../data/images.ts';
import { Colour } from '../ui/colours.ts';
import { GYPSY_DROP } from '../ui/storyText.ts';
import { blinker, waitMark } from './waitMark.ts';
import { leftArrow, rightArrow, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { menuSound, titleShown } from './menu.ts';
import { asPad, upper } from './input.ts';
import { addressedAsLady, customisable, DEFAULT_APPEARANCE } from './appearance.ts';
import { K, Pad, type Place } from './io.ts';
import { introTune, playTune, Tune } from './music.ts';
import { Save } from './save.ts';
import { characters, currentCharacter, localSave, restore, roomForCharacter, savedAvatar } from './storage.ts';
import { chooseCharacter, MAX_CHARACTERS, newCharacter } from './characters.ts';
import { loadOptions, saveOptions } from './settings.ts';
import { TICK_MS } from './effects.ts';
import { T } from './tiles.ts';
import { animateActors } from './frame.ts';
import { groundAmong, isGround } from './world.ts';

/** The proportional text's layout (D_5146..D_5158): two column spans by height, the space's width, and the pen. */
export interface Prose {
  left: [number, number];
  right: [number, number];
  top: number;
  bottom: number;
  space: number;
  x: number;
  y: number;
}

/**
 * A gypsy's question as the question and its two answers, A and B ("... dost thou A) ...; or B) ...?"), for the
 * Standard look to set each answer under its bowl; null if it is not one.
 */
export function splitQuestion(text: string): { question: string; a: string; b: string } | null {
  const m = text.match(/^(.*?)\s+A\)\s+(.*?);?\s+or\s+B\)\s+(.*)$/is);
  return m ? { question: m[1], a: m[2], b: m[3] } : null;
}

/** The title's little scenes as a place for the tile art (io.ts Place): a settlement's map, none of the game's. */
export const SCENE_MAP = 0x100;
/** Where the view's scene is drawn (EGA pixels, inclusive): nineteen squares by four, below its bar. */
export const VIEW_SCENE: [number, number, number, number] = [8, 0x80, 8 + 0x13 * 16 - 1, 0x80 + 4 * 16 - 1];

/** Where a scene's square (x, y) is drawn (EGA pixels): in the view's box, below its bar. */
export const scenePx = (x: number, y: number): [number, number] => [8 + x * 16, 0x10 + (y + 7) * 16];

/**
 * INTRO_043e: a line in the title's bottom border, under the scenes' box - a scene's name, the copyright under the
 * menu, The Mirror under the Appearance screen's room (appearanceMenu.ts).
 */
export function titleBanner(g: Game, text: string): void {
  const left = -(Math.trunc(text.length / 2) - 0x12);
  const right = left + text.length + 2;
  const d = g.draw;
  d.pen = Colour.blue;
  d.fill(8, 0xc1, left * 8, 199);
  d.fill(right * 8, 0xc1, 0x137, 199);
  d.pen = Colour.brightWhite;
  d.line(8, 0xc0, left * 8, 0xc0);
  d.line(right * 8, 0xc0, 0x137, 0xc0);
  g.text.moveTo(left, 0x18);
  leftArrow(g);
  g.print(text);
  rightArrow(g);
}

/**
 * A scene's squares from column `lo` to `hi`, as the attract mode draws them: `map` the scene with its people (a 0
 * square has someone standing, their tile at +0x80), `copy` the scene without them; a 0xfe square is left as it is.
 */
export function drawScene(g: Game, map: Uint8Array, copy: Uint8Array, lo = 0, hi = 0x12): void {
  const fx = g.p.fx;
  // The ground under a thing that stands, from the scene's squares round it (the scene without its people), as a
  // towne's view gives it (world.ts groundAmong): for the Standard look, which draws a tree or a chair on a clear
  // ground where the EGA tile has its own drawn in.
  const groundAt = (x: number, y: number, t: number): number =>
    g.cycles.shown[
      groundAmong(
        t,
        (dx, dy) => (x + dx < 0 || x + dx > 0x12 || y + dy < 0 || y + dy > 3 ? undefined : copy[(y + dy) * 32 + x + dx]),
        T.Grass,
      )
    ];
  // Where a square of the scene is, with the squares round it (the scene without its people), as a towne's view
  // gives its squares (world.ts placeOf): the Standard look draws a wall or a floor in the version its square has,
  // and a square's land (a path's edge) from its neighbours. Beyond the scene's edge, the edge's own square.
  const placeAt = (x: number, y: number): Place => {
    const around = new Uint8Array(25);
    const own = copy[y * 32 + x];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const [sx, sy] = [x + dx, y + dy];
        const v = sx < 0 || sx > 0x12 || sy < 0 || sy > 3 ? 0xff : copy[sy * 32 + sx];
        around[(dy + 2) * 5 + dx + 2] = v === 0xff ? own : v;
      }
    return { map: SCENE_MAP, x, y, around };
  };
  const drawCell = (x: number, y: number): void => {
    const t = map[y * 32 + x];
    const [px, py] = scenePx(x, y);
    if (t !== 0) fx.tilePx(g.cycles.shown[t], px, py, isGround(t) ? undefined : groundAt(x, y, t), undefined, placeAt(x, y));
    else {
      const a = map[x + y * 32 + 0x80];
      // Someone standing: on the square's own tile, and that on the ground round it if it is a thing.
      const under = copy[y * 32 + x];
      if (a !== 0x16)
        fx.tilePx(0x100 + a, px, py, g.cycles.shown[under], isGround(under) ? undefined : groundAt(x, y, under), placeAt(x, y));
    }
  };
  for (let x = lo; x <= hi; x++) for (let y = 0; y < 4; y++) if (map[y * 32 + x] !== 0xfe) drawCell(x, y);
}

/** The Avatar's figure, among the actors' tiles. */
/** The Avatar on the gypsy's stage: the walking Avatar's four frames (0x14c), as a fight and the map draw it. */
const AVATAR_WALKING = 0x14c;
/** Its frame at `now` (ms): a step every two ticks, as the map's figures move. */
const walking = (now: number): number => AVATAR_WALKING + (Math.floor(now / (TICK_MS * 2)) & 3);

/**
 * The gypsy's stage (EGA pixels): the Avatar between the bowls, at each bowl, and each bowl's flame - on the braziers
 * as the Standard look lowers them (GYPSY_DROP), the only look the stage is.
 */
const STAGE = {
  y: 112 + GYPSY_DROP,
  centre: 150,
  bowls: [58, 242],
  fires: [
    [44, 86 + GYPSY_DROP, 50, 42],
    [228, 86 + GYPSY_DROP, 50, 42],
  ] as [number, number, number, number][],
};

/** The top of the title menu's box: the Standard look's copper starts here, under the logo. */
const TITLE_MENU_ROW = 112;

/** The Avatar's walking figure (its first frame, less the actors' 0x100), and the shepherd's, at home in the first scene. */
const AVATAR_FIGURE = 0x4c;
const HOME_FIGURE = 0x50;

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

/** The title menu's choices by letter. */
const MENU = 'JCUAR';

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
 * taking it - or typed, L or S, or the original's F or M. The save's gender for the answer, or null for B (back to the
 * name). The screen is put back as it was, the box's copper for the caller to let go.
 */
export async function askAddress(g: Game): Promise<number | null> {
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
  let chosen = -1;
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
      } else if ((k === Pad.A || k === K.Enter) && chosen >= 0) {
        taken = true;
        break;
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
 */
export async function askName(g: Game, max: number, at: number, start = ''): Promise<string> {
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
      t.moveTo(1, NAME_MENU_ROW + r);
      g.print(' '.repeat(0x26));
      const label = list[r];
      if (!label) continue;
      t.moveTo((0x27 - label.length) >> 1, NAME_MENU_ROW + r);
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
    const typed = await g.hooks.askText('By what name shalt thou be known?', s, max);
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
    t.moveTo(1, NAME_MENU_ROW + r);
    g.print(' '.repeat(0x26));
  }
  t.moveTo(at, 0x13);
  g.print(s);
  return s;
}

/**
 * A new game's Avatar where no character was made (the development build's ?play&new): INIT.GAM's, which the gypsy has
 * not seen, given what a made one has at least (Intro.createCharacter) - a name, the strength to carry what it starts
 * with, and its mana full.
 */
export function unmadeAvatar(g: Game): void {
  const m = g.s.members[0];
  m.name = 'Avatar';
  m.str = Math.max(m.str, 0x14);
  m.mp = m.int;
}

export class Intro {
  prose: Prose = { left: [0, 0], right: [0, 0], top: 0, bottom: 0, space: 5, x: 0, y: 0 };
  private font: Uint8Array;
  private widths: Uint8Array;

  constructor(private readonly g: Game) {
    this.font = this.res('PROPORT.PCS');
    this.widths = g.data.bytes(0x50eb, 0x5a);
  }

  private get fx() {
    return this.g.p.fx;
  }

  private res(name: string): Uint8Array {
    return loadResource(this.g.data.files, this.g.data.ovl, name);
  }

  private async ticks(n: number): Promise<void> {
    await this.g.p.sleep(TICK_MS * n);
  }

  /** INTRO_094e: wait up to `n` ticks; true if a key came. */
  private async pause(n: number): Promise<boolean> {
    for (let i = 0; i < n; i++) {
      if (this.g.p.pollKey() !== 0) return true;
      await this.ticks(1);
    }
    return false;
  }

  /**
   * Wait for a key, flickering the title (INTRO_2090 each tick); `mark`, the arrow blinking in the page's corner
   * that says a story page waits (waitMark.ts).
   */
  private async anyKey(flicker = false, mark = false): Promise<number> {
    const blink = mark ? blinker(this.g) : null;
    try {
      for (;;) {
        const k = this.g.p.pollKey();
        if (k !== 0) return k;
        if (flicker) this.fx.nextWDFrame();
        blink?.();
        await this.ticks(1);
      }
    } finally {
      if (mark) waitMark(this.g, false);
    }
  }

  // --- Proportional text -----------------------------------------------------------

  /**
   * FONT_0000: justified text in PROPORT.PCS's glyphs on page 1, between
   * the spans; `{` is a wide space, `_` a hyphen at a break.
   */
  proseText(text: string): void {
    const p = this.prose;
    const fx = this.fx;
    const w = (c: number): number => this.widths[c - 0x21];
    const at = (i: number): number => (i < text.length ? text.charCodeAt(i) : 0);
    fx.page(1);
    let span = p.y > p.top && p.y < p.bottom ? 1 : 0;
    let width = p.right[span] - p.left[span];
    let start = 0;
    let used = p.x - p.left[span];
    while (at(start) !== 0) {
      let spaces = 0;
      let i = start;
      while (at(i) !== 0 && used < width && at(i) !== 0x0a) {
        const c = at(i);
        if (c <= 0x20) {
          used += p.space;
          spaces++;
        } else if (c === 0x7b) used += 0xf;
        else if (c !== 0x5f) used += w(c) + 1;
        i++;
      }
      for (;;) {
        if (at(i) === 0 && used < width) break;
        if (at(i) === 0x0a) break;
        if (--i <= start) break;
        if (at(i) === 0x20) {
          used -= p.space;
          spaces--;
          break;
        }
        if (at(i) === 0x5f && used + this.widths[0xc] + 1 < width) {
          used += this.widths[0xc] + 1;
          break;
        }
        if (at(i) !== 0x5f && at(i) !== 0x7b) used -= w(at(i)) + 1;
      }
      let slack = width - used;
      const end = i;
      for (i = start; i < end; i++) {
        const c = at(i);
        if (c <= 0x20) {
          p.x += p.space;
          if (spaces !== 0 && at(end) !== 0 && at(end) !== 0x0a) {
            const extra = Math.trunc(slack / spaces);
            p.x += extra;
            slack -= extra;
            spaces--;
          }
        } else if (c === 0x7b) {
          p.x += 0xf;
        } else if (c !== 0x5f) {
          if (p.y < 0xc0) fx.bitImage(this.font, c - 0x20, p.x, p.y);
          p.x += w(c) + 1;
        }
      }
      start = end;
      if (at(start) !== 0) {
        if (at(start) === 0x5f && p.y < 0xc0) fx.bitImage(this.font, 0xd, p.x, p.y);
        used = 0;
        p.y += 9;
        span = p.y > p.top && p.y < p.bottom ? 1 : 0;
        p.x = p.left[span];
        width = p.right[span] - p.x;
        start++;
      }
    }
    fx.page(0);
  }

  /** A NUL-terminated string from a file. */
  private fileText(name: string, offset: number, max = 2000): string {
    const f = this.g.data.files.get(name);
    let s = '';
    for (let i = offset; i < f.length && i < offset + max && f[i] !== 0; i++) s += String.fromCharCode(f[i]);
    return s;
  }

  // --- The title ---------------------------------------------------------------------

  /** INTRO_0010: the four frames of "Warriors of Destiny" onto page 1. */
  private wdFrames(ultima: Uint8Array): void {
    this.fx.page(1);
    this.g.printChar(0xff);
    for (let i = 0; i < 4; i++) this.fx.image(ultima, i + 1, 0x10, i * 0x32, 0);
  }

  /** INTRO_04e0: the box the menu sits in. */
  private menuBorders(): void {
    const g = this.g;
    const t = g.text;
    t.win.fg = Colour.blue;
    t.moveTo(0, 0xf);
    g.printChar(0x7b);
    for (let i = 0; i < 0x26; i++) g.printChar(0x7f);
    g.printChar(0x7c);
    for (let i = 0; i < 8; i++) {
      g.printChar(0x7f);
      t.moveTo(0x27, t.win.y);
      g.printChar(0x7f);
    }
    g.printChar(0x7d);
    for (let i = 0; i < 0x26; i++) g.printChar(0x7f);
    t.advance = false;
    g.printChar(0x7e);
    t.advance = true;
    const d = g.draw;
    d.pen = Colour.brightWhite;
    d.line(7, 127, 312, 127);
    d.line(312, 127, 312, 192);
    d.line(312, 192, 7, 192);
    d.line(7, 192, 7, 127);
    t.win.fg = Colour.brightWhite;
  }

  /** INTRO_05b0: "ULTIMA" (revealed, with its sound, the first time) and "Warriors of Destiny". */
  private async title(slow: boolean): Promise<boolean> {
    const g = this.g;
    const fx = this.fx;
    const ultima = this.res('ULTIMA.16');
    fx.page(0);
    g.printChar(0xff);
    fx.page(1);
    // Page 1 cleared first (the port's): it may still hold the flames' four frames from the title shown before
    // (Settings, a game not found), whose tips lie in the rows the logo leaves bare and would come over with it.
    g.printChar(0xff);
    fx.image(ultima, 0, 0, 0, 0);
    if (slow) slow = !(await fx.reveal(0, 0, 319, 100));
    if (!slow) fx.transfer(1, 0, 0, 0, 319, 100);
    this.wdFrames(ultima);
    if (slow) await fx.showWD(this.g.data.files.get('WD.BIT'));
    fx.page(0);
    fx.nextWDFrame();
    this.menuBorders();
    titleShown();
    return slow;
  }

  /** INTRO_043e: a line in the bottom border. */
  private banner(text: string): void {
    titleBanner(this.g, text);
  }

  /** INTRO_06bc: the choices, one highlighted (the original's Transfer from Ultima IV is left out: it only rebuilt the Avatar from an Ultima IV save). */
  private menu(sel: number): void {
    // The Standard look's copper for the menu's box, below the logo.
    this.g.draw.chrome?.(true, TITLE_MENU_ROW);
    const g = this.g;
    const items: [number, number | string][] = [
      [0xc, 0x310c],
      [9, 0x311b],
      [9, 0x3148],
      [0xb, 0x315e],
      [10, 0x316f],
    ];
    // The port's own lines under the game's five: its settings, and a new version that has come down and waits.
    for (const k of this.menuKeys().slice(MENU.length)) {
      const label = k === 'S' ? 'Settings' : k === 'D' ? 'Delete Character' : k === 'Q' ? 'Quit' : 'Update: restart';
      items.push([(0x28 - label.length - 2) >> 1, label]);
    }
    const top = items.length > 6 ? 0x10 : 0x11;
    items.forEach(([x, text], i) => {
      if (i === sel) g.printChar(0xfd);
      g.text.moveTo(x, i + top);
      // Journey Onward grey with no game saved to journey on with (the port's), passed over by the bar.
      const fg = g.text.win.fg;
      if (i === 0 && this.noSave) g.text.win.fg = 8;
      g.printChar(' ');
      if (typeof text === 'string') g.print(text);
      else g.say(text);
      g.printChar(' ');
      g.text.win.fg = fg;
      if (i === sel) g.printChar(0xfd);
    });
  }

  /**
   * How hard a game the new character is to have (the ultima3 port's question): each answer sets the rules that
   * Settings holds, where they may be changed afterwards - on the copy of the settings in use the new character is
   * given, kept with them as they are made (createCharacter). Backing out leaves them as they are.
   */
  private async adventure(): Promise<void> {
    const g = this.g;
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
          label: 'Classic (as in 1988)',
          note: 'As in 1988: deadly, XP unshared.',
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

  /**
   * Character `id` the one in play, their settings in use (the look, the tiles, the sound and the music changed to
   * theirs); null, the latest's (storage.ts currentCharacter).
   */
  private useCharacter(id: string | null): void {
    const g = this.g;
    chooseCharacter(id);
    if (id === null) currentCharacter();
    g.options = loadOptions();
    g.hooks.applyOptions?.(g.options);
  }

  /** No game is saved: Journey Onward is grey, and the bar starts on Create New Character (menu, run). */
  private noSave = false;

  /**
   * The title menu's keys: the game's five, Settings, '!' while an update waits to be restarted into, and Quit in an
   * app that can (the desktop app, where full screen and Steam's Game Mode leave no close button; the Android app).
   * Quit and the update never come together - the apps have no service worker, their updates being new builds - so
   * the list is seven lines at most, which the box holds.
   */
  /**
   * The title's lines' keys: the game's five, then the port's - Settings, Delete Character where any character is
   * kept, a waiting update, Quit in the apps. The box holds eight: where an update waits in an app, Delete Character
   * stands aside for it (the picker's Delete a character... still offers it, with two or more).
   */
  private menuKeys(): string {
    const after = (this.g.hooks.update?.ready() ? '!' : '') + (this.g.hooks.quit ? 'Q' : '');
    const del = !this.noSave && MENU.length + 2 + after.length <= 8 ? 'D' : '';
    return MENU + 'S' + del + after;
  }

  // --- The opening -------------------------------------------------------------------------

  /** INTRO_0050: Lord British's signature, stroke by stroke, from BRITISH.PTH. */
  private penAt = 0;
  private async signature(x: number, y: number): Promise<boolean> {
    const g = this.g;
    const path = g.data.files.get('BRITISH.PTH');
    let colour: number = Colour.brightWhite;
    g.draw.pen = colour;
    let i = this.penAt;
    for (; i < path.length; i++) {
      if (colour !== 0) {
        g.draw.pen = colour;
        g.draw.plot(x, y);
      }
      colour = Colour.brightWhite;
      const b = path[i];
      let dy = b & 7;
      if (dy > 2) colour = 0;
      if (b & 8) dy = -dy;
      let dx = (b >> 4) & 7;
      if (dx > 2) colour = 0;
      if (b & 0x80) dx = -dx;
      x += dx;
      y += dy;
      if (g.p.pollKey() !== 0) return false;
      if ((i & 0x1f) === 0) await this.ticks(1);
      if (b === 0) break;
    }
    this.penAt = i + 1;
    return true;
  }

  /** INTRO_0986 before the menu: logo, "presents", "a", the signature, "production", the title. */
  private async opening(): Promise<boolean> {
    const g = this.g;
    const fx = this.fx;
    const title = this.res('TITLE.BIT');
    const british = this.res('BRITISH.BIT');
    let go: boolean;
    // ULTIMA_0d72: the logo's seven parts on page 1, then its animation.
    fx.page(1);
    g.draw.pen = 0;
    g.draw.fill(0, 0, 319, 199);
    const widths = g.data.words(0x5306, 7);
    const gaps = g.data.words(0x5314, 7);
    let y = 0;
    for (let i = 0; i < 7; i++) {
      fx.bitImage(title, i, (320 - widths[i]) >> 1, y);
      y += gaps[i];
    }
    fx.page(0);
    go = !(await fx.originLogo());
    fx.page(1);
    g.draw.pen = 0;
    g.draw.fill(0, 0x8c, 0x13f, 199);
    fx.bitImage(title, 7, 0x6c, 0x8c);
    fx.transfer(1, 0, 0, 0x8c, 0x13f, 199);
    if (go) {
      await this.ticks(0x12);
      go = !(await this.pause(0x14));
    }
    if (go) {
      g.text.select(0);
      g.printChar(0xff);
      fx.bitImage(title, 8, 0x98, 0);
      fx.transfer(1, 0, 0, 0, 319, 199);
      go = !(await this.pause(0x14));
      if (go) {
        fx.page(0);
        this.penAt = 0;
        go = false;
        if ((await this.signature(0x2c, 0x44)) && (await this.signature(0x40, 0x5e)) && (await this.signature(0x8f, 0x4e))) {
          go = await this.signature(0xa7, 0x69);
        }
        fx.page(1);
      }
      fx.bitImage(british, 0, 0x18, 0x42);
      fx.transfer(1, 0, 0, 0, 319, 199);
      fx.bitImage(title, 9, 0x68, 0xa0);
      fx.transfer(1, 0, 0, 0, 319, 199);
      if (go) go = !(await this.pause(0x14));
    }
    g.printChar(0xff);
    fx.page(0);
    go = await this.title(go);
    return go;
  }

  // --- The introduction ---------------------------------------------------------------

  /** INTRO_014e: twenty-one pages of the story, a picture and its text each. */
  async introduction(): Promise<void> {
    this.g.draw.chrome?.(false);
    const g = this.g;
    const fx = this.fx;
    const d = g.data;
    const text = this.res('TEXT.16');
    const pages = d.bytes(0x2f98, 0x2a);
    const rights = d.words(0x2fc2, 0x2a);
    const storyAt = d.words(0x3016, 0x15);
    const b = (a: number): Uint8Array => d.bytes(a, 0x16);
    const [tops, bottoms, xs, ys, pics, sets, px, py, kinds] = [0x3040, 0x3056, 0x306c, 0x3082, 0x3098, 0x30ae, 0x30c4, 0x30da, 0x30f0].map(
      b,
    );
    fx.page(1);
    g.printChar(0xff);
    fx.page(0);
    g.printChar(0xff);
    let set = 0;
    let story = this.res('STORY1.16');
    let left = false;
    for (let i = 0; i < 0x15; i++) {
      if (set !== sets[i]) {
        set = sets[i];
        story = this.res(`STORY${set + 1}.16`);
      }
      fx.page(1);
      g.printChar(0xff);
      if (kinds[i] === 1) {
        if (i === 0) {
          fx.image(text, 0, 0xe0, 0x1e);
          fx.image(text, 1, 0xa8, 0x3a);
        } else if (i === 7) {
          fx.image(text, 0, 0xe8, 0x1a);
          fx.image(text, 2, 200, 0x36);
        } else if (i === 0xe) {
          fx.image(text, 0, 0xb8, 0);
          fx.image(text, 3, 0xf8, 0);
        }
      }
      fx.image(story, pics[i], px[i], py[i]);
      if (kinds[i] >= 4) fx.image(story, kinds[i] * 2 - 5, px[i], py[i] + 0x37);
      this.prose.left = [pages[i * 2], pages[i * 2 + 1]];
      this.prose.right = [rights[i * 2], rights[i * 2 + 1]];
      this.prose.top = tops[i];
      this.prose.bottom = bottoms[i];
      this.prose.x = xs[i];
      this.prose.y = ys[i];
      if (kinds[i] === 3) {
        fx.image(story, 3, 0x60, 0x27);
        // "Instantly, a shimmering blue door springs up!" "With heart beating rapidly, you step into it."
        if (!fx.prose?.([g.t(0x2f31), g.t(0x2f5f)])) {
          this.proseText(g.t(0x2f31));
          this.prose.x = xs[i];
          this.prose.y = 0xb4;
          this.proseText(g.t(0x2f5f));
        }
      } else {
        const words = this.fileText('STORY.DAT', storyAt[i]);
        if (!fx.prose?.([words])) this.proseText(words);
      }
      if (i !== 0) {
        playTune(g, introTune(i), 'introduction');
        g.p.flushKeys();
        // B leaves the story for the title (the port's), where every key turned the next of its twenty-one pages.
        const k = asPad(g, await this.anyKey(false, true));
        if (k === Pad.B || k === K.Escape) {
          left = true;
          break;
        }
      }
      fx.transfer(1, 0, 0, 0, 319, 199);
      if (kinds[i] === 2) {
        fx.page(1);
        fx.image(story, 2, 0x28, 0x56);
        await fx.reveal(0x28, 0x56, 0x4b, 0x78);
      }
    }
    if (!left) {
      playTune(g, introTune(0x15), 'introduction');
      g.p.flushKeys();
      await this.anyKey(false, true);
    }
    fx.page(1);
    g.printChar(0xff);
    fx.page(0);
  }

  // --- Acknowledgements ------------------------------------------------------------------

  /** INTRO_072e: the scroll unrolls over the title, and rolls back. */
  async acknowledgements(): Promise<void> {
    this.g.draw.chrome?.(false);
    const g = this.g;
    const fx = this.fx;
    const scroll = this.res('STARTSC.16');
    fx.page(1);
    fx.image(scroll, 1, 0x10, 0x3f);
    fx.page(0);
    for (let y = 199; y >= 0x3f; y--) {
      fx.image(scroll, 0, 0x90, y);
      fx.image(scroll, 2, 0xa0, y);
      if ((y & 7) === 0) await g.p.sleep(8);
    }
    for (let i = 0; i < 0x90; i += 8) {
      fx.image(scroll, 0, 0x88 - i, 0x3f);
      fx.transfer(1, 0, 0x98 - i, 0x3f, 0x9f - i, 199);
      fx.image(scroll, 2, i + 0xa8, 0x3f);
      fx.transfer(1, 0, i + 0xa0, 0x3f, i + 0xa7, 199);
      await this.ticks(1);
    }
    const ultima = this.res('ULTIMA.16');
    fx.page(1);
    g.printChar(0xff);
    fx.image(ultima, 1, 0x10, 0x41);
    this.menuBorders();
    this.menu(4);
    await this.anyKey();
    fx.page(0);
    for (let i = 0x88; i >= 0; i -= 8) {
      fx.image(scroll, 0, 0x90 - i, 0x3f);
      fx.transfer(1, 0, 0x88 - i, 0x3f, 0x8f - i, 199);
      fx.image(scroll, 2, i + 0xa0, 0x3f);
      fx.transfer(1, 0, i + 0xb0, 0x3f, i + 0xb7, 199);
      await this.ticks(1);
    }
    for (let y = 0x3f; y < 199; y++) {
      fx.image(scroll, 0, 0x90, y + 1);
      fx.image(scroll, 2, 0xa0, y + 1);
      fx.transfer(1, 0, 0x90, y, 0xaf, y);
      if ((y & 7) === 0) await g.p.sleep(8);
    }
    fx.transfer(1, 0, 0x90, 199, 0xaf, 199);
    this.wdFrames(ultima);
    fx.page(0);
    g.p.flushKeys();
  }

  // --- Character creation ------------------------------------------------------------------

  private used = new Uint8Array(8);
  private lost = new Uint8Array(8);
  private stats = { int: 0, dex: 0, str: 0 };

  /** FONT_0998: a virtue not yet shown this round nor lost. */
  private pickVirtue(): number {
    let v: number;
    do v = this.g.random(0, 7);
    while (this.used[v] !== 0 || this.lost[v] !== 0);
    this.used[v] = 1;
    return v;
  }

  /** FONT_09c8: one dilemma: two virtues' cards and the question between them; the chosen virtue's stats rise. */
  private async dilemma(cards: Uint8Array): Promise<void> {
    const g = this.g;
    const fx = this.fx;
    this.prose.x = 0;
    this.prose.y = 0x98;
    let a = this.pickVirtue();
    let b = this.pickVirtue();
    const [lo, hi, first] = a > b ? [b, a, 0x42] : [a, b, 0x41];
    const cx = g.data.bytes(0x51fc, 8);
    const cy = g.data.bytes(0x5204, 8);
    // The braziers and their virtues, lowered by `drop` (the Standard look's page, its question over them).
    const page = (drop: number): void => {
      fx.page(1);
      g.printChar(0xff);
      fx.image(cards, 1, 0x10, drop);
      fx.image(cards, 1, 200, drop);
      fx.image(cards, lo + 2, cx[lo], cy[lo] + drop);
      fx.image(cards, hi + 2, cx[hi] + 0xb8, cy[hi] + drop);
      fx.transfer(1, 0, 0, 0, 319, 199);
    };
    const words = this.fileText('QUESTION.DAT', g.data.words(0x517c + a * 16, 8)[b]);
    // A is always the left card's answer - the lower virtue's, whichever of the two was drawn first - and B the right.
    const split = splitQuestion(words.replace(/_/g, ''));
    const standard = !!split && g.options.tileSet === 'standard';
    page(standard ? GYPSY_DROP : 0);
    let k: number;
    if (split && fx.choice?.(split.question, split.a, split.b, -1)) {
      // The Standard look: the Avatar walked to a bowl, and A taken there.
      k = (await this.chooseBowl(split.question, split.a, split.b)) === 0 ? 0x41 : 0x42;
    } else {
      if (standard) page(0); // the words set as 1988 set them, under the braziers where 1988 had them
      this.proseText(words);
      fx.transfer(1, 0, 0, 0, 319, 199);
      do {
        k = upper(await this.anyKey());
        // A controller's A and B answer A and B, and so do the keys that stand for them (Z and X).
        if (k === Pad.A || k === 0x5a) k = 0x41;
        else if (k === Pad.B || k === 0x58) k = 0x42;
      } while (k !== 0x41 && k !== 0x42);
    }
    if (k !== first) [a, b] = [b, a];
    this.stats.int += g.data.bytes(0x5164, 8)[a];
    this.stats.dex += g.data.bytes(0x516c, 8)[a];
    this.stats.str += g.data.bytes(0x5174, 8)[a];
    this.lost[b] = 1;
  }

  /**
   * The Standard look's answer to the gypsy: the Avatar stands between the bowls, the d-pad walks it to one - its
   * fire stirs, its answer turns from grey to white - and A (or Return) takes it. 0 the left bowl, 1 the right.
   */
  private async chooseBowl(question: string, left: string, right: string): Promise<number> {
    const g = this.g;
    const fx = this.fx;
    let side = -1;
    let x = STAGE.centre;
    let lit = -1;
    let taken = false;
    for (;;) {
      const raw = g.p.pollKey();
      const k = raw ? asPad(g, raw) : 0;
      if (k === K.Left) side = 0;
      else if (k === K.Right) side = 1;
      else if ((k === Pad.A || k === K.Enter || upper(k) === 0x5a) && side >= 0) taken = true; // Z, as A on a keyboard
      const to = side < 0 ? STAGE.centre : STAGE.bowls[side];
      x += Math.sign(to - x) * Math.min(Math.abs(to - x), 8);
      const there = side >= 0 && x === to ? side : -1;
      if (there !== lit) {
        lit = there;
        fx.choice?.(question, left, right, lit);
      }
      const now = performance.now();
      fx.stage?.({ figure: { tile: walking(now), x, y: STAGE.y }, fire: lit >= 0 ? STAGE.fires[lit] : null, now });
      if (taken && lit === side) break;
      await g.p.sleep(33);
    }
    // A moment in the fire before the next question.
    for (let i = 0; i < 14; i++) {
      const now = performance.now();
      fx.stage?.({ figure: { tile: walking(now), x, y: STAGE.y }, fire: STAGE.fires[side], now });
      await g.p.sleep(33);
    }
    fx.stage?.(null);
    return side;
  }

  /** FONT_0b0a: name, how the Avatar is addressed, the seven dilemmas; the new game is saved. True if one was made. */
  async createCharacter(): Promise<boolean> {
    // The name and address are asked in the title's box, which keeps its copper; the gypsy's pages after take it off.
    this.g.draw.chrome?.(true, TITLE_MENU_ROW);
    const g = this.g;
    const fx = this.fx;
    const t = g.text;
    const cards = this.res('CREATE.16');
    const fresh = new Save(g.data.files.get('INIT.GAM'));
    g.s = fresh;
    g.fog.clear(); // a new Avatar knows nothing of the land
    g.words.clear();
    g.oldManDay = -1; // the old man has yet to come to this Avatar's camp
    const d = g.draw;
    d.pen = Colour.blue;
    d.fill(0x78, 0x78, 200, 0x7e);
    d.pen = Colour.brightWhite;
    d.line(0x78, 0x7f, 200, 0x7f);
    d.pen = 0;
    d.fill(8, 0x80, 0x137, 0xbf);
    t.moveTo(3, 0x11);
    g.say(0xa06a); // "By what name shalt thou be known?"
    t.moveTo(0xe, 0x13);
    g.printChar(':');
    const was = t.win.x;
    // The name, then how the Avatar is addressed, then (with the Modern PC tiles) the appearance, in the title's
    // bedroom before its mirror - B at each going back to the one before; any other set keeps the Avatar as drawn, and
    // the appearance can be made at a mirror later.
    g.appearance = { ...DEFAULT_APPEARANCE };
    g.companionLooks.clear();
    let name = '';
    let step: 'name' | 'address' | 'appearance' = 'name';
    for (;;) {
      if (step === 'name') {
        name = await askName(g, 8, was, name);
        t.moveTo(was + name.length, 0x13);
        if (name.length === 0) return false;
        fresh.members[0].name = name;
        step = 'address';
      } else if (step === 'address') {
        const gender = await askAddress(g);
        // Its box's copper let go, the title's box's kept.
        g.draw.chrome?.(true, TITLE_MENU_ROW);
        if (gender === null) {
          step = 'name';
          continue;
        }
        fresh.members[0].gender = gender;
        step = 'appearance';
      } else {
        if (customisable(g)) {
          const { chooseAppearance } = await import('./appearanceMenu.ts');
          const look = await chooseAppearance(g, g.appearance);
          g.draw.chrome?.(true, TITLE_MENU_ROW);
          if (!look) {
            this.banner(g.t(0x31c1)); // "Copyright 1988 Lord British", where the Appearance screen had The Mirror
            step = 'address';
            continue;
          }
          g.appearance = look;
        }
        break;
      }
    }
    g.draw.avatar?.(g.appearance, addressedAsLady(g));
    await this.adventure();
    g.titleIdle = null;
    g.draw.chrome?.(false);
    Object.assign(this.prose, { x: 0, y: 9, left: [0, 0xaf], right: [0x140, 0x140], top: 0x59, bottom: 200 });
    // The Upgrade plays the Amiga version's theme while the character is made.
    playTune(g, Tune.Amiga);
    fx.page(1);
    g.printChar(0xff);
    fx.image(cards, 0, 0, 0x60);
    const opening = this.fileText('QUESTION.DAT', 0);
    if (!fx.prose?.([opening])) this.proseText(opening);
    fx.transfer(1, 0, 0, 0, 319, 199);
    this.prose.top = 200;
    await this.anyKey(false, true);
    const m = fresh.members[0];
    this.stats = { int: m.int, dex: m.dex, str: m.str };
    this.used.fill(0);
    this.lost.fill(0);
    for (let i = 0; i < 4; i++) await this.dilemma(cards);
    this.used.fill(0);
    for (let i = 0; i < 2; i++) await this.dilemma(cards);
    this.used.fill(0);
    await this.dilemma(cards);
    Object.assign(this.prose, { x: 0, y: 0, top: 0x5a, space: 4 });
    this.prose.left[1] = 0;
    this.prose.right[1] = 0xa6;
    fx.page(1);
    g.printChar(0xff);
    fx.image(cards, 10, 0xa8, 100);
    const verdict = this.fileText('QUESTION.DAT', 0x322);
    if (!fx.prose?.([verdict])) this.proseText(verdict);
    this.prose.space = 5;
    fx.transfer(1, 0, 0, 0, 319, 199);
    await this.anyKey(false, true);
    fx.page(1);
    g.printChar(0xff);
    fx.page(0);
    m.mp = m.int = this.stats.int;
    m.dex = this.stats.dex;
    m.str = this.stats.str <= 0x14 ? 0x14 : this.stats.str;
    g.ool.brit.fill(0);
    g.ool.under.set(g.data.files.get('INIT.OOL').subarray(0, 256));
    g.printChar(0xff);
    t.moveTo(0, 10);
    g.tipsNudged = false; // its first turn points to the Tips (run.ts journeyOnward)
    // A character of their own, beside any others kept (characters.ts), with the settings in use as theirs.
    chooseCharacter(newCharacter());
    saveOptions(g.options);
    // (Where it cannot be kept, the game goes on all the same, and the first door's save says "Not saved!".)
    localSave.write(g);
    return true;
  }

  // --- The attract mode ------------------------------------------------------------------

  /** FONT_04a4: the little scenes from MISCMAPS.DAT (a script from 0x2c0 + 0x200). */
  async view(): Promise<void> {
    // The scenes' box, below the logo, in the Standard look's copper, as the menu's.
    this.g.draw.chrome?.(true, TITLE_MENU_ROW);
    this.g.draw.chromeHole?.(VIEW_SCENE);
    const g = this.g;
    const fx = this.fx;
    const d = g.draw;
    this.viewBar();
    const script = new Uint8Array(2000);
    script.set(g.data.files.get('MISCMAPS.DAT').subarray(0x2c0, 0x2c0 + 2000));
    const map = g.map;
    const copy = g.mapCopy;
    const s = g.s;
    const saved = s.b.slice();
    const dxs = g.data.swords(0x24d6, 4);
    const dys = g.data.swords(0x24de, 4);
    const scene = { n: -1, lo: 9, hi: 9, grow: 0, sound: 0, beat: 0 };
    const tileAtPx = scenePx;
    // The saved game's Avatar as the player made it, in the scenes the Avatar's own figure is in; and where the tiles
    // draw it so (the Modern PC tiles, customisable), in the bedroom of the first scene too, in place of the shepherd
    // 1988 had there - the Avatar at home before the call - the mirror giving it back, as at the character's making.
    const worn = savedAvatar();
    if (worn) d.avatar?.(worn.look, worn.lady);
    const own = worn !== null && customisable(g);
    // The figures step at the game's pace (input.ts rawKey): every other tick in the PC (1988) look, every fourth in
    // the Modern; the scenes' own script keeps 1988's time. The water and the other moving tiles: in the Modern look at
    // the map's pace too, every other tick (screen.ts IDLE_MS), where 1988's scenes ran them each tick, twice as fast.
    let pass = 0;
    /** FONT_02fc: `n` frames of the scene; true if a key was pressed. */
    const frames = async (n: number): Promise<boolean> => {
      do {
        const modern = g.options.tileSet === 'standard';
        animateActors(g, pass % (modern ? 4 : 2) === 0, !modern || pass % 2 === 0);
        pass++;
        fx.nextWDFrame();
        if (own) {
          const avatar = s.actors.find((a) => a.tile !== 0 && (a.tile & 0xfc) === AVATAR_FIGURE);
          d.leader?.(avatar ? { map: SCENE_MAP, x: avatar.x, y: avatar.y } : null);
        }
        for (const a of s.actors) {
          if (a.tile === 0) continue;
          const c = a.x + a.y * 0x20;
          map[c] = 0;
          map[c + 0x80] = a.anim;
        }
        drawScene(g, map, copy, scene.lo, scene.hi);
        if (scene.lo !== 0 && scene.grow !== 0) {
          scene.lo--;
          scene.hi++;
        }
        scene.grow ^= 1;
        if (g.p.pollKey() !== 0) return true;
        await this.ticks(1);
        if (!g.soundOff && scene.sound === 2) void g.sound.noise(0x14, 0x3c, 10000);
        else if (!g.soundOff && scene.sound === 3) {
          scene.beat = (scene.beat + 1) & 7;
          if (scene.beat === 0) void g.sound.tone(3000, 3);
          else if (scene.beat === 4) void g.sound.tone(2000, 3);
        }
      } while (--n !== 0);
      return false;
    };
    const titles = g.data.table(0x515c, 4);
    const setScene = (n: number): void => {
      this.banner(titles[n]);
      for (let x = 0; x < 0x13; x++) {
        for (let y = 0; y < 4; y++) copy[y * 32 + x] = map[y * 32 + x] = script[n * 0x80 + x + y * 0x20];
      }
      scene.lo = scene.hi = 9;
      scene.grow = 0;
      scene.sound = n;
      scene.n = n;
    };
    /** ULTIMA_1068 in the attract mode: reveal a tile, a frame of the scene every eight pixels. */
    const revealTile = async (tile: number, x: number, y: number): Promise<boolean> => {
      const [px, py] = tileAtPx(x, y);
      for (let step = 0; step < 0x100; ) {
        for (let k = 0; k < 4 && step < 0x100; k++) {
          fx.revealPx(tile, px, py, step++);
          fx.revealPx(tile, px, py, step++);
        }
        if (step >= 0x100) return false;
        if (await frames(1)) return true;
      }
      return false;
    };
    let gx = 0;
    let gy = 0;
    let repeat = 0;
    let loopAt = 0;
    try {
      for (let at = 0x200; at < 2000; at++) {
        const actor = (): (typeof s.actors)[number] => s.actors[script[++at]];
        switch (script[at]) {
          case 0: {
            const a = actor();
            const t = script[++at];
            a.tile = a.anim = own && scene.n === 0 && t === HOME_FIGURE ? AVATAR_FIGURE : t;
            a.x = script[++at];
            a.y = script[++at];
            a.b6 = 0;
            break;
          }
          case 1: {
            const a = actor();
            a.tile = a.anim = a.b6 = 0;
            map[a.y * 32 + a.x] = copy[a.y * 32 + a.x];
            break;
          }
          case 2:
          case 0xd: {
            const op = script[at];
            const a = actor();
            const dir = script[++at];
            map[a.y * 32 + a.x] = copy[a.y * 32 + a.x];
            a.x += dxs[dir];
            a.y += dys[dir];
            if (op === 0xd && (await frames(7))) return;
            break;
          }
          case 3:
            if (await frames(script[++at])) return;
            break;
          case 4:
            gx = script[++at];
            gy = script[++at];
            map[gy * 32 + gx] = copy[gy * 32 + gx] = 0xfe;
            for (let h = 1; h < 0x10; h++) {
              const [px, py] = tileAtPx(gx, gy);
              fx.moongatePx(h, px, py);
              if (await frames(1)) return;
            }
            map[gy * 32 + gx] = copy[gy * 32 + gx] = 0xdc;
            if (await frames(2)) return;
            break;
          case 5:
            map[gy * 32 + gx] = copy[gy * 32 + gx] = 0xfe;
            for (let h = 0xf; h > 0; h--) {
              const [px, py] = tileAtPx(gx, gy);
              fx.moongatePx(h, px, py);
              if (await frames(1)) return;
            }
            map[gy * 32 + gx] = copy[gy * 32 + gx] = 5;
            if (await frames(2)) return;
            break;
          case 6:
            setScene(script[++at]);
            break;
          case 7: {
            const a = actor();
            const t = a.tile;
            a.tile = a.anim = 0x16;
            if (await revealTile(0x100 + t, a.x, a.y)) return;
            a.tile = a.anim = t;
            break;
          }
          case 8: {
            const a = actor();
            const t = a.tile;
            a.tile = a.anim = 0x16;
            if (await revealTile(copy[a.y * 32 + a.x], a.x, a.y)) return;
            a.tile = a.anim = t;
            break;
          }
          case 9:
            at = 0x1ff;
            break;
          case 10: {
            const tile = script[++at];
            const x = script[++at];
            const y = script[++at];
            copy[y * 32 + x] = map[y * 32 + x] = tile;
            break;
          }
          case 0xb: {
            for (let i = 0; i < 5; i++) {
              if (await frames(1)) return;
              const lx = i * 9;
              const ly = i * 3;
              d.pen = Colour.brightWhite;
              d.line(lx + 0x80, ly + 0x98, lx + 0x89, ly + 0x9b);
              d.line(lx + 0x80, ly + 0x99, lx + 0x89, ly + 0x9c);
            }
            at += 2;
            const a = s.actors[script[at]];
            const [px, py] = tileAtPx(a.x, a.y);
            fx.tilePx(0, px, py);
            if (!g.soundOff) void g.sound.noise(1, 0x4b0, 4000);
            if (await frames(3)) return;
            break;
          }
          case 0xc:
            for (const a of s.actors) a.anim = a.tile = a.b6 = 0;
            break;
          case 0xe:
            repeat = script[++at];
            loopAt = at;
            break;
          case 0xf:
            if (--repeat !== 0) at = loopAt;
            break;
        }
        if (g.p.pollKey() !== 0) return;
      }
    } finally {
      s.b.set(saved);
      g.draw.chromeHole?.(null);
      if (own) d.leader?.(null);
    }
  }

  /** The bar across the top of the view's box (the menu's top border, where "Select:" was). */
  private viewBar(): void {
    const d = this.g.draw;
    d.pen = Colour.blue;
    d.fill(0x78, 0x78, 199, 0x7e);
    d.pen = Colour.brightWhite;
    d.line(0x78, 0x7f, 199, 0x7f);
  }

  // --- The menu -----------------------------------------------------------------------------

  /**
   * The title drawn once unseen while the page loads (the port's): its pictures and each shape of its
   * frame's copper cut then - the menu's box, with each turn of its cursor, and the view's with each scene's banner -
   * which else stalled the flames as they first burnt and flickered, and each scene as it began (tens of
   * milliseconds on a desktop, several times that on a phone).
   */
  prepare(): void {
    const g = this.g;
    g.p.unseen?.((shown) => {
      g.text.select(0);
      g.text.setWindow(0, 0, 0, 0x27, 0x18);
      void this.title(false); // no reveal and no burning in: drawn at once
      this.titleMenu();
      this.selectPrompt();
      for (let n = 0; n < 4; n++) {
        this.spin(n);
        shown();
      }
      g.draw.chromeHole?.(VIEW_SCENE);
      this.viewBar();
      for (const title of g.data.table(0x515c, 4)) {
        this.banner(title);
        shown();
      }
      g.draw.chromeHole?.(null);
    });
    g.draw.chrome?.(false);
  }

  /** The title's windows, and its banner and menu in them (the first item chosen). */
  private titleMenu(sel = 0): void {
    const g = this.g;
    const t = g.text;
    t.setWindow(0, 1, 0x10, 0x26, 0x17);
    t.select(0);
    g.printChar(0xff);
    t.setWindow(0, 0, 0, 0x27, 0x18);
    t.setWindow(1, 0x18, 1, 0x27, 9);
    t.setWindow(2, 0x18, 0xb, 0x27, 0x17);
    this.banner(g.t(0x31c1)); // "Copyright 1988 Lord British"
    this.menu(sel);
  }

  /** "Select:" in the menu's top border, and the cursor after it. */
  private selectPrompt(): void {
    const g = this.g;
    g.text.moveTo(0xf, 0xf);
    leftArrow(g);
    g.say(0x31dd); // "Select: "
    rightArrow(g);
    g.text.moveTo(0x17, 0xf);
  }

  /** The title's cursor, turned `n` (a turn a tick while it waits). */
  private spin(n: number): void {
    const t = this.g.text;
    t.advance = false;
    this.g.printChar(5 + (n & 3));
    t.advance = true;
  }

  /** INTRO_0986_Main: returns when the player journeys onward with a game in hand. */
  async run(): Promise<void> {
    const g = this.g;
    g.draw.chrome?.(false);
    const t = g.text;
    for (let i = 0; i < 0x100; i++) g.cycles.shown[i] = i;
    t.select(0);
    t.setWindow(0, 0, 0, 0x27, 0x18);
    let fresh = await this.opening();
    if (fresh) {
      playTune(g, Tune.Theme, 'title');
      await this.view();
    }
    fresh = true;
    /** A choice made for the player, taken on the menu's next round (Journey Onward with no game: Create a character). */
    let queued = 0;
    for (;;) {
      playTune(g, Tune.Theme, 'title');
      this.noSave = localSave.read() === null;
      let choice = this.noSave ? 1 : 0;
      this.titleMenu(choice);
      let key = queued;
      queued = 0;
      let keys = this.menuKeys();
      while (key <= 0x20) {
        // An update may come down while the title waits: its line is added then.
        if (this.menuKeys() !== keys) {
          keys = this.menuKeys();
          this.menu(choice);
        }
        this.selectPrompt();
        key = 0;
        for (let n = 0; n < 200 && key === 0; n++) {
          key = upper(asPad(g, g.p.pollKey())); // a keyboard read as a controller is one here too
          if (key === 0) {
            this.spin(n);
            this.fx.nextWDFrame();
            await this.ticks(1);
          }
        }
        switch (key) {
          case K.Left:
          case K.Up:
            choice = choice === 0 ? keys.length - 1 : choice - 1;
            if (choice === 0 && this.noSave) choice = keys.length - 1;
            this.menu(choice);
            menuSound(g, 'move');
            break;
          case K.Right:
          case K.Down:
            choice = choice === keys.length - 1 ? 0 : choice + 1;
            if (choice === 0 && this.noSave) choice = 1;
            this.menu(choice);
            menuSound(g, 'move');
            break;
          case K.Enter:
          case K.Space:
          case Pad.A:
            key = keys.charCodeAt(choice);
            break;
          case 0:
            key = 0x52;
            break;
          default: {
            const i = keys.indexOf(String.fromCharCode(key));
            if (i >= 0) this.menu(i);
            else key = 0;
          }
        }
      }
      switch (key) {
        case 0x4a: {
          playTune(g, Tune.None);
          const kept = characters();
          if (kept.length === 0) {
            // In a box of its own over the title's picture, as the new character's question is (where 1988 printed
            // "No active game. Please create a character" in the message window's place, over the menu's lines), the
            // way on offered as the menu's first line.
            const { choose } = await import('./menu.ts');
            const i = await choose(
              g,
              'Journey Onward',
              [
                { label: 'No game is saved yet.', enabled: false },
                { label: '', enabled: false },
                { label: 'Create a character' },
                { label: 'Back' },
              ],
              2,
              true,
            );
            await this.title(false);
            if (i === 2) queued = 0x43;
            break;
          }
          // One character: theirs, straight in. More: whose (characterMenu.ts), any deleted there.
          // (The menu's lines drawn again under its boxes: titleMenu.)
          let who = kept[0];
          if (kept.length > 1) {
            const { pickCharacter } = await import('./characterMenu.ts');
            const picked = await pickCharacter(g, async () => {
              await this.title(false);
              this.titleMenu(0); // the bar where it was, on Journey Onward
            });
            if (!picked) {
              // Back, or a deletion that left one or none: the title, in the latest's settings.
              this.useCharacter(null);
              await this.title(false);
              break;
            }
            who = picked;
          }
          this.useCharacter(who.id);
          restore(g, who.data, true);
          return;
        }
        case 0x43: {
          // No more than MAX_CHARACTERS (characters.ts): at that, a character must go before another is made.
          if (!roomForCharacter()) {
            const { choose, wrap } = await import('./menu.ts');
            // Wrapped to the box, as a question is (menu.ts confirm).
            const said = wrap(`${MAX_CHARACTERS} characters are kept, all there is room for. Delete one to make another.`);
            const i = await choose(
              g,
              'Create New Character',
              [
                ...said.map((label) => ({ label, enabled: false })),
                { label: '', enabled: false },
                { label: 'Delete a character...' },
                { label: 'Back' },
              ],
              said.length + 1,
              true,
            );
            if (i === said.length + 1) {
              const { deleteCharacterMenu } = await import('./characterMenu.ts');
              const redraw = async (): Promise<void> => {
                await this.title(false);
                this.titleMenu(1);
              };
              await redraw();
              if (await deleteCharacterMenu(g, redraw)) this.useCharacter(null);
            }
            await this.title(false);
            break;
          }
          // The theme plays on while the character is made, the flames flickering behind its questions (not the
          // Appearance screen's, which covers them), up to the gypsy's pages, which have their own tune.
          g.titleIdle = () => this.fx.nextWDFrame();
          // A new character is one more beside those kept (characters.ts): nothing of anyone's is put by for it. The
          // character is made below the logo and its flames, the name asked where the menu was, as in 1988.
          try {
            await this.createCharacter();
          } finally {
            g.titleIdle = null;
          }
          t.setWindow(0, 0, 0, 0x27, 0x18);
          t.select(0);
          g.printChar(0xff);
          this.fx.page(1);
          g.printChar(0xff);
          this.fx.page(0);
          await this.title(false);
          break;
        }
        case 0x44: {
          // Delete Character: whom, of every character kept - the last one too (characterMenu.ts).
          const { deleteCharacterMenu } = await import('./characterMenu.ts');
          const redraw = async (): Promise<void> => {
            await this.title(false);
            this.titleMenu(keys.indexOf('D'));
          };
          if (await deleteCharacterMenu(g, redraw)) this.useCharacter(null);
          await this.title(false);
          break;
        }
        case 0x55:
          playTune(g, Tune.None);
          await this.introduction();
          await this.title(false);
          break;
        case 0x41:
          playTune(g, Tune.None);
          await this.acknowledgements();
          break;
        case 0x52:
          await this.view();
          break;
        case 0x53: {
          const { settingsMenu } = await import('./menu.ts');
          // On a cleared screen, as in the game (the panel draws its own frame, the map's, centred); the title is
          // drawn again after.
          g.draw.pen = 0;
          g.draw.fill(0, 0, 319, 199);
          await settingsMenu(g, true);
          t.select(0);
          g.printChar(0xff);
          await this.title(false);
          break;
        }
        case 0x21:
          g.hooks.update?.apply();
          break;
        case 0x51:
          g.hooks.quit?.(); // the app goes; should it not, the title is still here
          break;
      }
      void fresh;
      void updateFrame;
    }
  }
}
