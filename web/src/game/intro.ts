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
import { ULTIMA5_CHOICE } from '../ui/storyText.ts';
import { blinker, waitMark } from './waitMark.ts';
import { leftArrow, rightArrow } from './frame.ts';
import { Game } from './game.ts';
import { TitleMenu, type TitleContent } from './titleMenu.ts';
import { askAddress, askAdventure, askName } from './characterQuestions.ts';
import { titleShown } from './menu.ts';
import { asPad, upper } from './input.ts';
import { addressedAsLady, customisable, DEFAULT_APPEARANCE } from './appearance.ts';
import { K, Pad, type Place, type Dressing } from './io.ts';
import { introTune, playTune, Tune } from './music.ts';
import { Save } from './save.ts';
import { localSave } from './storage.ts';
import { savedAvatar, savedDressing } from './ultima5Saves.ts';
import { chooseCharacter, newCharacter } from './characters.ts';
import { saveOptions } from './settings.ts';
import { TICK_MS } from './effects.ts';
import { T } from './tiles.ts';
import { animateActors, clockTick } from './frame.ts';
import { groundAmong, isGround } from './world.ts';
import { actor, actorSlots } from './actors.ts';
import { freshObjects } from './objectMigration.ts';

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

/** A companion in the scenes: their colours, and the figure (its first frame, less the actors' 0x100) they are drawn as. */
interface SceneCompanion {
  dress: Dressing;
  figure: number;
}

/**
 * A scene's squares from column `lo` to `hi`, as the attract mode draws them: `map` the scene with its people (a 0
 * square has someone standing, their tile at +0x80), `copy` the scene without them; a 0xfe square is left as it is.
 */
export function drawScene(
  g: Game,
  map: Uint8Array,
  copy: Uint8Array,
  lo = 0,
  hi = 0x12,
  companionOf?: (figure: number) => SceneCompanion | null,
): void {
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
      if (a !== 0x16) {
        const companion = companionOf?.(a);
        if (companion) g.draw.dressAs?.(companion.dress);
        const figure = companion ? companion.figure + (a & 3) : a;
        fx.tilePx(0x100 + figure, px, py, g.cycles.shown[under], isGround(under) ? undefined : groundAt(x, y, under), placeAt(x, y));
        if (companion) g.draw.dressAs?.(null);
      }
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
 * where 1988 has them, in the Standard look, the only look the stage is (its question between the bowls above it).
 */
const STAGE = {
  y: 112,
  centre: 150,
  bowls: [58, 242],
  fires: [
    [44, 86, 50, 42],
    [228, 86, 50, 42],
  ] as [number, number, number, number][],
};

/** The top of the title menu's box: the Standard look's copper starts here, under the logo. */
const TITLE_MENU_ROW = 112;

/** The Avatar's walking figure (its first frame, less the actors' 0x100), and the shepherd's, at home in the first scene. */
const AVATAR_FIGURE = 0x4c;
const HOME_FIGURE = 0x50;
/** Shamino's figure in the scenes' script (the bard's), in The Arrival struck by the Shadowlord's bolt and in The Welcoming. */
const SHAMINO_FIGURE = 0x44;
/** The Welcoming, whose figure in the first scene's dress (HOME_FIGURE) is Iolo. */
const WELCOMING = 3;
/** The figures they walk as in the game, their trades' (companions.ts figureOf): Shamino the fighter, Iolo the bard. */
const SHAMINO_WALKS = 0x48;
const IOLO_WALKS = 0x44;

/** The title menu's choices by letter. */
const MENU = 'JCUAR';
/** The game's five lines (INTRO_06bc), by letter: where each starts, and its text in the game's data. */
const GAME_LINES: Record<string, [number, number]> = {
  J: [0xc, 0x310c],
  C: [9, 0x311b],
  U: [9, 0x3148],
  A: [0xb, 0x315e],
  R: [10, 0x316f],
};

/** The introduction's page of the Shadowlord's bolt (its picture the bolt striking, the page before's before it). */
const STRIKE_PAGE = 11;
/** Where the Standard look holds Iolo's portrait through his pages (kinds 4-6): the upper right, 144 pixels wide. */
const IOLO_X = 176;

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
    this.menuScreen = new TitleMenu(g, this.titleContent());
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

  /**
   * The page on show read (ui/storyText.ts setSteps: a step at a time), each step after a key, the page's arrow blinking
   * for it, and a last key once all is read. Left goes back a step; at the first, 'back' where `back` lets it (to the
   * page before), else nothing. `onStep` has each step's words as it is set, read on or read back - and gives back the
   * key that cut its picture short, if one did, to be read as the next; `wait` is told of each wait, and whether it is
   * the last. 'on' once the page is read, 'out' where B (or Escape) was pressed instead -
   * where `leave` lets them leave; else they are keys as any other.
   */
  async readPage(
    onStep?: (words: string) => Promise<number | void>,
    wait?: (last: boolean) => void,
    back = false,
    leave = true,
  ): Promise<'on' | 'back' | 'out'> {
    const fx = this.fx;
    let ahead = 0;
    for (;;) {
      const more = fx.proseMore?.() ?? false;
      wait?.(!more);
      let k = ahead;
      ahead = 0;
      if (!k) {
        this.g.p.flushKeys();
        k = await this.g.p.waitKey(blinker(this.g));
        waitMark(this.g, false);
      }
      k = asPad(this.g, k);
      if (leave && (k === Pad.B || k === K.Escape)) return 'out';
      if (k === K.Left) {
        const words = fx.proseBack?.() ?? null;
        if (words !== null) ahead = (await onStep?.(words)) || 0;
        else if (back) return 'back';
      } else if (!more) return 'on';
      else {
        // Set before onStep is asked for: an absent onStep's call would not set it (?.( short-circuits its arguments).
        const words = fx.proseNext?.() ?? '';
        ahead = (await onStep?.(words)) || 0;
      }
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
    // A page at a time, read a step at a time; Left goes back a step, from a page's first to the last of the page before
    // (the port's, for words passed too quickly), where 1988 only went on.
    let i = 0;
    let toLast = false;
    while (i < 0x15) {
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
      // Iolo's pages (kinds 4-6) draw his head, and his hands below it. 1988 moved him corner to corner, page to page;
      // where the page is set the Standard look's way he holds still in the upper right (the port's).
      const portrait = (x: number, y: number): void => {
        fx.image(story, pics[i], x, y);
        if (kinds[i] >= 4) fx.image(story, kinds[i] * 2 - 5, x, y + 0x37);
      };
      const held = kinds[i] >= 4;
      if (held) portrait(IOLO_X, 0);
      else portrait(px[i], py[i]);
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
        const laid = fx.prose?.([words]) ?? false;
        if (!laid && held) {
          // Set as 1988 did: his portrait where 1988 had it, for its spans to run round.
          g.printChar(0xff);
          portrait(px[i], py[i]);
        }
        if (!laid) this.proseText(words);
        // The Shadowlord's bolt read in steps (the port's): the page opens on the picture before it, the Shadowlords
        // as they stood, and the bolt's strike as "The arrow strikes him full in the chest!" is read.
        else if (i === STRIKE_PAGE && fx.proseMore?.()) fx.image(this.res(`STORY${sets[i - 1] + 1}.16`), pics[i - 1], px[i - 1], py[i - 1]);
      }
      fx.transfer(1, 0, 0, 0, 319, 199);
      if (kinds[i] === 2) {
        fx.page(1);
        fx.image(story, 2, 0x28, 0x56);
        await fx.reveal(0x28, 0x56, 0x4b, 0x78);
      }
      // The bolt's page shows the Shadowlords as they stood until the strike is read, and again if read back past it.
      let struck = false;
      const strike = async (words: string, now = false): Promise<number> => {
        if (i !== STRIKE_PAGE || struck === /^The arrow strikes/.test(words)) return 0;
        struck = !struck;
        fx.page(1);
        // The strike dissolves in as it is read, a key cutting it short read as the next; read back, either is there at
        // once, the key not kept waiting.
        if (struck) fx.image(story, pics[i], px[i], py[i]);
        else fx.image(this.res(`STORY${sets[i - 1] + 1}.16`), pics[i - 1], px[i - 1], py[i - 1]);
        if (struck && !now) return fx.reveal(0, py[i], 319, 199);
        fx.transfer(1, 0, 0, py[i], 319, 199);
        return 0;
      };
      if (toLast) {
        let words = '';
        while (fx.proseMore?.()) words = fx.proseNext?.() ?? '';
        await strike(words, true);
        toLast = false;
      }
      // The tune for the page after is asked for at its last step's wait, as 1988 asked at the wait before each page.
      const tune = (last: boolean): void => {
        if (last || i !== 0) playTune(g, introTune(last ? i + 1 : i), 'introduction');
      };
      // B leaves the story for the title (the port's), where every key turned the next of its twenty-one pages.
      const read = await this.readPage(strike, tune, i !== 0);
      if (read === 'out') break;
      if (read === 'back') {
        i--;
        toLast = true;
      } else i++;
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
    this.menuScreen.menu(4);
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
    // The braziers and their virtues, where 1988 has them.
    const page = (): void => {
      fx.page(1);
      g.printChar(0xff);
      fx.image(cards, 1, 0x10, 0);
      fx.image(cards, 1, 200, 0);
      fx.image(cards, lo + 2, cx[lo], cy[lo]);
      fx.image(cards, hi + 2, cx[hi] + 0xb8, cy[hi]);
      fx.transfer(1, 0, 0, 0, 319, 199);
    };
    const words = this.fileText('QUESTION.DAT', g.data.words(0x517c + a * 16, 8)[b]);
    // A is always the left card's answer - the lower virtue's, whichever of the two was drawn first - and B the right.
    const split = splitQuestion(words.replace(/_/g, ''));
    page();
    let k: number;
    if (split && fx.choice?.(split.question, split.a, split.b, -1, ULTIMA5_CHOICE)) {
      // The Standard look: the Avatar walked to a bowl, and A taken there.
      k = (await this.chooseBowl(split.question, split.a, split.b)) === 0 ? 0x41 : 0x42;
    } else {
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
        fx.choice?.(question, left, right, lit, ULTIMA5_CHOICE);
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
    g.ammoExtra = {}; // nor carries more than its 99 arrows (ammo.ts)
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
    // How the Avatar is addressed, once answered: chosen again where the question is come back to.
    let address: number | undefined;
    let step: 'name' | 'address' | 'appearance' = 'name';
    for (;;) {
      if (step === 'name') {
        name = await askName(g, 8, was, name);
        t.moveTo(was + name.length, 0x13);
        if (name.length === 0) return false;
        fresh.members[0].name = name;
        step = 'address';
      } else if (step === 'address') {
        const gender = await askAddress(g, address);
        // Its box's copper let go, the title's box's kept.
        g.draw.chrome?.(true, TITLE_MENU_ROW);
        if (gender === null) {
          step = 'name';
          continue;
        }
        fresh.members[0].gender = address = gender;
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
    await askAdventure(g);
    g.titleIdle = null;
    g.draw.chrome?.(false);
    Object.assign(this.prose, { x: 0, y: 9, left: [0, 0xaf], right: [0x140, 0x140], top: 0x59, bottom: 200 });
    // Ultima IV's Towns while the character is made, as Ultima IV plays it at the gypsy's questions: the Upgrade's
    // Amiga theme (Tune.Amiga) was here, and is kept, unplayed.
    playTune(g, Tune.U4Towns);
    fx.page(1);
    g.printChar(0xff);
    fx.image(cards, 0, 0, 0x60);
    const opening = this.fileText('QUESTION.DAT', 0);
    if (!fx.prose?.([opening])) this.proseText(opening);
    fx.transfer(1, 0, 0, 0, 319, 199);
    this.prose.top = 200;
    await this.readPage();
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
    await this.readPage();
    fx.page(1);
    g.printChar(0xff);
    fx.page(0);
    m.mp = m.int = this.stats.int;
    m.dex = this.stats.dex;
    m.str = this.stats.str <= 0x14 ? 0x14 : this.stats.str;
    g.ool.brit.fill(0);
    g.ool.under.set(g.data.files.get('INIT.OOL').subarray(0, 256));
    freshObjects(g); // the Underworld's skiff and bodies, INIT.GAM's own, into the stores (objectMigration.ts)
    g.printChar(0xff);
    t.moveTo(0, 10);
    g.tipsShown = new Set(); // its first turn points to the Tips (run.ts journeyOnward), its fights give theirs
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
    // The companions the scenes show, Shamino and Iolo: their figures as in the game, their colours as the player's
    // saved game has them (companions.ts). Where the tiles dress no one, the script's own figures.
    const shamino = customisable(g) ? savedDressing(g, 'Shamino') : null;
    const iolo = customisable(g) ? savedDressing(g, 'Iolo') : null;
    const companionOf = (figure: number): SceneCompanion | null => {
      if (shamino && (figure & 0xfc) === SHAMINO_FIGURE) return { dress: shamino, figure: SHAMINO_WALKS };
      return iolo && scene.n === WELCOMING && (figure & 0xfc) === HOME_FIGURE ? { dress: iolo, figure: IOLO_WALKS } : null;
    };
    /** FONT_02fc: `n` frames of the scene; true if a key was pressed. */
    const frames = async (n: number): Promise<boolean> => {
      do {
        const modern = g.options.tileSet === 'standard';
        animateActors(g, pass % (modern ? 4 : 2) === 0, !modern || pass % 2 === 0);
        pass++;
        fx.nextWDFrame();
        if (own) {
          const avatar = [...actorSlots(g)].map(([, a]) => a).find((a) => a.tile !== 0 && (a.tile & 0xfc) === AVATAR_FIGURE);
          d.leader?.(avatar ? { map: SCENE_MAP, x: avatar.x, y: avatar.y } : null);
        }
        for (const [, a] of actorSlots(g)) {
          if (a.tile === 0) continue;
          const c = a.x + a.y * 0x20;
          map[c] = 0;
          map[c + 0x80] = a.anim;
        }
        drawScene(g, map, copy, scene.lo, scene.hi, companionOf);
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
          clockTick(g, scene.beat);
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
      const companion = tile >= 0x100 ? companionOf(tile - 0x100) : null;
      const shown = companion ? 0x100 + companion.figure + (tile & 3) : tile;
      for (let step = 0; step < 0x100; ) {
        if (companion) d.dressAs?.(companion.dress);
        for (let k = 0; k < 4 && step < 0x100; k++) {
          fx.revealPx(shown, px, py, step++);
          fx.revealPx(shown, px, py, step++);
        }
        if (companion) d.dressAs?.(null);
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
        const next = (): ReturnType<typeof actor> => actor(g, script[++at]);
        switch (script[at]) {
          case 0: {
            const a = next();
            const t = script[++at];
            a.tile = a.anim = own && scene.n === 0 && t === HOME_FIGURE ? AVATAR_FIGURE : t;
            a.x = script[++at];
            a.y = script[++at];
            a.b6 = 0;
            break;
          }
          case 1: {
            const a = next();
            a.tile = a.anim = a.b6 = 0;
            map[a.y * 32 + a.x] = copy[a.y * 32 + a.x];
            break;
          }
          case 2:
          case 0xd: {
            const op = script[at];
            const a = next();
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
            const a = next();
            const t = a.tile;
            a.tile = a.anim = 0x16;
            if (await revealTile(0x100 + t, a.x, a.y)) return;
            a.tile = a.anim = t;
            break;
          }
          case 8: {
            const a = next();
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
            // The bolt's firing as it flies (the port's: 1988 sounded only the blow it lands).
            if (!g.soundOff) void g.sound.cue?.('ShadowBolt');
            for (let i = 0; i < 5; i++) {
              if (await frames(1)) return;
              const lx = i * 9;
              const ly = i * 3;
              d.pen = Colour.brightWhite;
              d.line(lx + 0x80, ly + 0x98, lx + 0x89, ly + 0x9b);
              d.line(lx + 0x80, ly + 0x99, lx + 0x89, ly + 0x9c);
            }
            at += 2;
            const a = actor(g, script[at]);
            const [px, py] = tileAtPx(a.x, a.y);
            fx.tilePx(0, px, py);
            if (!g.soundOff) void g.sound.noise(1, 0x4b0, 4000);
            if (await frames(3)) return;
            break;
          }
          case 0xc:
            for (const [, a] of actorSlots(g)) a.anim = a.tile = a.b6 = 0;
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
      this.menuScreen.draw();
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

  /** The title's menu (titleMenu.ts), round and round, with Ultima V's title around it. */
  readonly menuScreen: TitleMenu;

  /** INTRO_0986_Main: returns when the player journeys onward with a game in hand. */
  run(): Promise<void> {
    return this.menuScreen.run();
  }

  /** What Ultima V shows and does around the title's menu (titleMenu.ts TitleContent). */
  private titleContent(): TitleContent {
    const g = this.g;
    return {
      gameKeys: MENU,
      idleKey: 'R',
      menuRow: TITLE_MENU_ROW,
      gameLine: (key) => {
        const line = GAME_LINES[key];
        return line && [line[0], g.t(line[1])];
      },
      opening: async () => {
        for (let i = 0; i < 0x100; i++) g.cycles.shown[i] = i;
        return this.opening();
      },
      attract: () => this.view(),
      drawTitle: async () => {
        await this.title(false);
      },
      banner: () => this.banner(g.t(0x31c1)), // "Copyright 1988 Lord British"
      prompt: () => this.selectPrompt(),
      spin: (n) => this.spin(n),
      idle: () => this.fx.nextWDFrame(),
      playTheme: () => playTune(g, Tune.Theme, 'title'),
      quiet: () => playTune(g, Tune.None),
      newCharacter: async () => {
        const t = g.text;
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
      },
      line: async (key) => {
        if (key === 'U') {
          playTune(g, Tune.None);
          await this.introduction();
          await this.title(false);
        } else if (key === 'A') {
          playTune(g, Tune.None);
          await this.acknowledgements();
        } else if (key === 'R') await this.view();
      },
    };
  }
}
