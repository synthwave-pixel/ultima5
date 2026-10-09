/**
 * screen.ts
 *
 * The browser's side of the game's Platform: the framebuffer shown on the
 * canvas, the text windows drawn into it, the tileset animation and the
 * keyboard, in the DOS game's key codes.
 */

import { signInk, tinted } from './colours.ts';
import type { Font } from '../data/font.ts';
import type { Appearance } from '../game/appearance.ts';
import { K, type Draw, type Effects, type HarpView, type Platform, type Sound } from '../game/io.ts';
import { bitPicture, picture, type Picture } from '../data/images.ts';
import { TileAnimator } from './animate.ts';
import { menuUp } from './pageMenu.ts';
import {
  colourRGBA,
  EgaArt,
  TilesAlone,
  figureBounds,
  Framebuffer,
  HI,
  HI_HEIGHT,
  HI_WIDTH,
  HEIGHT,
  RUNE_LETTER,
  TILE_X,
  TILE_Y,
  WIDTH,
  type Bounds,
  type ChromeTone,
  type Face,
  type ImageOver,
  type Letter,
  type Snapshot,
  type Words,
} from './framebuffer.ts';
import { type PictureKind, restyle, twice, type WallOf } from './standardPictures.ts';
import type { Tiles } from '../game/settings.ts';
import type { StandardArt } from './standardArt.ts';
import { GYPSY_DROP, setChoice, setProse, type Measure, type Run } from './storyText.ts';
import { Text, type TextTarget } from './text.ts';

/** The DOS timer's tick; the game animated about once per tick while waiting for a key. */
export const TICK_MS = 1000 / 18.2;
/** The Warriors of Destiny flames' frame in the Standard look: 12 a second, where 1988 showed one a tick. */
const WD_MS = 1000 / 12;
/** How often the map animates while waiting: every other tick, about what a 1988 PC managed. */
const IDLE_MS = TICK_MS * 2;

/** The story pages' faces (public/fonts, SIL Open Font License): IM Fell English, and UnifrakturMaguntia's initials. */
const BODY_FACE = 'U5 Story';
const INITIAL_FACE = 'U5 Story Initial';

/** A text cell's side on the colour page. */
const GLYPH_SIDE = 8 * HI;

/**
 * The Standard look's lettering (public/fonts, SIL Open Font License, but the runes'): Sixtyfour for the letters and
 * figures - and a rune's English as it is read - and Britannian Runes II for the runes (its maker unknown; from The
 * Almighty Guru's Game Font Database, https://www.thealmightyguru.com/GameFonts/Series-Ultima.html); each set at
 * the display's own size over its text cell, filling `share` of it; `bold`, the outline thickened by that share of the
 * size (Sixtyfour has the one weight).
 */
const FACES: Record<Face, { family: string; file: string; share: number; bold: number }> = {
  mono: { family: 'U5 Letters', file: 'Sixtyfour.ttf', share: 0.88, bold: 0.054 },
  runes: { family: 'U5 Runes', file: 'BritannianRunesII.ttf', share: 0.86, bold: 0 },
  // Not a font: the game's own symbols, filled from their outlines (symbolPath).
  symbol: { family: '', file: '', share: 1, bold: 0 },
};

/** The picture enlarged by the sharpened smoothing (?scale=smooth), to compare with the nearest pixel (show). */
const SMOOTH = typeof location !== 'undefined' && new URLSearchParams(location.search).get('scale') === 'smooth';

/** How long a number played on the harpsichord rises and fades (ms). */
const POP_MS = 900;

/** Whether the harpsichord's keyboard is moving: a key down, or a number fading (drawn again each frame till not). */
const harpMoving = (v: HarpView, now: number): boolean =>
  (v.pressed !== null && now - v.pressed.t < 200) || v.pops.some((p) => now - p.t < POP_MS);

/** IBM.CH's arrows, 0x18 to 0x1b (up, down, right, left), as the lettering's face has them. */
const ARROWS = ['\u2191', '\u2193', '\u2192', '\u2190'];

/** A face's size in a cell, and where its baseline sits below the cell's top. */
interface Fit {
  size: number;
  baseline: number;
}

/** A DOM key to the DOS game's key code, or 0 if the game has no use for it. */
export function dosKey(e: KeyboardEvent): number {
  switch (e.key) {
    case 'ArrowLeft':
      return K.Left;
    case 'ArrowRight':
      return K.Right;
    case 'ArrowUp':
      return K.Up;
    case 'ArrowDown':
      return K.Down;
    case 'Enter':
      return K.Enter;
    case 'Escape':
      return K.Escape;
    case 'Backspace':
      return K.Backspace;
    case 'Tab':
      return K.Tab;
  }
  if (e.ctrlKey && e.key.length === 1) {
    const c = e.key.toUpperCase().charCodeAt(0);
    if (c === 0x42) return K.CtrlB;
    if (c >= 0x41 && c <= 0x5a) return c - 0x40;
  }
  if (e.key.length === 1 && e.key.charCodeAt(0) < 0x80) return e.key.charCodeAt(0);
  return 0;
}

class Silence implements Sound {
  async pulse(): Promise<void> {}
  async noise(): Promise<void> {}
  async tone(): Promise<void> {}
  async sweep(): Promise<void> {}
  music(): void {}
  setHeld(): void {}
}

export class Screen implements Platform {
  readonly fb: Framebuffer;
  readonly text: Text;
  readonly draw: Draw;
  readonly fx: Effects;
  sound: Sound = new Silence();
  private readonly animator: TileAnimator;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  /** The colour page as drawn (1280 by 800), and it grown by a whole number where the display is more than twice it. */
  private readonly base: CanvasRenderingContext2D;
  private grown: CanvasRenderingContext2D | null = null;
  /** The canvas's size in the display's own pixels, as last fitted to the window. */
  private wanted: [number, number] = [HI_WIDTH, HI_HEIGHT];
  private readonly keys: number[] = [];
  private waiter: ((k: number) => void) | null = null;
  /** Called on every key (audio unlocks from a gesture). */
  onKey: (() => void) | null = null;
  /** Whether a held key's auto-repeat is dropped: a key standing in for a controller's button, which never repeats. */
  dropRepeat: ((k: number) => boolean) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    tiles: Uint8Array,
    fonts: Font[],
  ) {
    // What the canvas shows (the boot screen at the display's size, or the loading notice) stays until the game first
    // draws: it is not sized here (sizing a canvas clears it, even to the size it has), only as it is shown (show).
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.image = this.ctx.createImageData(HI_WIDTH, HI_HEIGHT);
    this.glyphs = fonts[0];
    const base = document.createElement('canvas');
    [base.width, base.height] = [HI_WIDTH, HI_HEIGHT];
    this.base = base.getContext('2d') as CanvasRenderingContext2D;
    this.fb = new Framebuffer(tiles, fonts);
    this.fb.dirty = false;
    // The canvas has the display's own pixels, as many as the window gives it (a phone's are about nine tenths of the
    // colour page's, a desktop's half again or more, twice that on a sharp display): the colour page is scaled to
    // them as it is shown (show), and the story's words set at their size. Sized when next shown, not now, so what
    // is on it (the loading notice) stays until the game draws.
    const fit = (): void => {
      const r = canvas.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      this.wanted = [Math.round(r.width * devicePixelRatio), Math.round(r.height * devicePixelRatio)];
      this.fb.dirty = true;
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(canvas);
    window.addEventListener('resize', fit);
    fit();
    this.animator = new TileAnimator(tiles);
    const fb = this.fb;
    // What each marked row read when its marks were set: a mark shows only while its row still does.
    const markLines = new Map<number, string>();
    fb.markShown = (m) => this.text.screenText(m.row, 24, 38) === markLines.get(m.row);
    const target: TextTarget = {
      glyph: (font, code, column, row, fg, bg, underline, again) => {
        fb.glyph(font, code, column, row, fg, bg, again);
        if (underline) fb.line(column * 8, row * 8 + 7, column * 8 + 7, row * 8 + 7, fg);
      },
      // A border's cap: its glyph, and the two white lines that join it to the border (ULTIMA_4c2a, ULTIMA_4cce).
      cap: (side, column, row, fg, bg) => {
        fb.glyph(0, side, column, row, fg, bg);
        const [a, b] =
          side === 2
            ? [
                [0, 0, 5, 3],
                [5, 4, 0, 7],
              ]
            : [
                [7, 0, 2, 3],
                [2, 4, 7, 7],
              ];
        const [x, y] = [column * 8, row * 8];
        fb.line(x + a[0], y + a[1], x + a[2], y + a[3], 15);
        fb.line(x + b[0], y + b[1], x + b[2], y + b[3], 15);
      },
      clearCells: (c1, r1, c2, r2, colour) => fb.fill(c1 * 8, r1 * 8, c2 * 8 + 7, r2 * 8 + 7, colour),
      scrollCells: (c1, r1, c2, r2, colour) => fb.scroll(c1 * 8, r1 * 8, c2 * 8 + 7, r2 * 8 + 7, -8, colour),
    };
    this.text = new Text(target);
    this.draw = {
      get pen() {
        return fb.pen;
      },
      set pen(c: number) {
        fb.pen = c;
      },
      fill: (x1, y1, x2, y2) => fb.fill(x1, y1, x2, y2),
      line: (x1, y1, x2, y2) => fb.line(x1, y1, x2, y2),
      plot: (x, y) => fb.plot(x, y),
      invert: (x1, y1, x2, y2) => fb.xorFill(x1, y1, x2, y2, 15),
      tile: (tile, x, y, ground, place, tint, floor) =>
        fb.tile(tile, TILE_X + x * 16, TILE_Y + y * 16, undefined, ground, place, tint, floor),
      avatar: (look, lady = false, base) => {
        this.avatarLook = look;
        this.avatarLady = lady;
        this.avatarBase = base;
        this.sets.get('modern-pc')?.setAppearance(look, lady, base);
        // The walking Avatar's outline over its frames is the old figure's now.
        this.walks.clear();
        fb.dirty = true;
      },
      leader: (at) => {
        const art = this.sets.get('modern-pc');
        if (art) art.leader = at;
      },
      dressAs: (dress) => {
        const art = this.sets.get('modern-pc');
        if (art) art.dressing = dress;
      },
      party: (tile, x, y, figures, terrain, floor, place) =>
        fb.party(tile, figures, TILE_X + x * 16, TILE_Y + y * 16, terrain, floor, place),
      icon: (tile, x, y, size, trim, tint) => {
        if (this.look !== 'standard' || !this.standard) return false;
        const px = this.standard.figure(tile);
        fb.drawScaled(tint === undefined ? px : this.tintedFigure(px, tint), [x, y, size, size], trim);
        return true;
      },
      marker: (x, y, colour) => fb.marker(TILE_X + x * 16, TILE_Y + y * 16, colourRGBA(colour)),
      harpsichord: (view) => {
        this.harp = view;
        fb.dirty = true;
      },
      aim: (x, y, mark) => fb.aim(TILE_X + x * 16, TILE_Y + y * 16, performance.now(), mark),
      burst: (x, y, frame, magic) => {
        if (this.look === 'standard') fb.burst(x, y, frame, magic);
      },
      pulse: (square) => {
        if (this.look === 'standard') fb.spellPulse(square);
      },
      unpulse: () => fb.uncover(),
      chrome: (on, fromRow = 0, only) => {
        // A dialog's own frame is added to what is copper already (the title menu's box below it, a question over
        // Settings at the title); the screen's copper set anew lets them all go.
        if (only) {
          if (!this.inGame) [fb.chromeFrom, fb.chromeAlso] = [HEIGHT, []];
          fb.chromeAlso = [...fb.chromeAlso.filter((r) => r.join() !== only.join()), only];
          this.inGame = true;
          this.theme();
          return;
        }
        fb.chromeAlso = [];
        this.inGame = on;
        fb.chromeFrom = fromRow;
        this.theme();
      },
      mark: (row, side, code, colour, line) => {
        const key = `${row}:${side}`;
        if (!code) fb.marks.delete(key);
        else fb.marks.set(key, { column: side === 'left' ? 23 : 39, row, code, colour });
        markLines.set(row, line);
        fb.dirty = true;
      },
      chromeBox: (rect) => {
        fb.chromeBox = rect;
        fb.dirty = true;
      },
      chromeHole: (rect) => {
        fb.chromeHole = rect;
        fb.dirty = true;
      },
      revealStep: (tile, x, y, step) => fb.revealStep(tile, TILE_X + x * 16, TILE_Y + y * 16, step),
      // AnimateTile_BuildMoongateTile: the floor (brick, or grass) with the gate's top rows rising at its foot.
      moongate: (rows, floor, x, y) => fb.moongateRise(rows, floor === 'brick' ? 0x44 : 0x05, TILE_X + x * 16, TILE_Y + y * 16),
      scroll: (x1, y1, x2, y2, amount) => fb.scroll(x1, y1, x2, y2, amount),
      savePage: () => fb.transfer(0, 1, 0, 0, WIDTH - 1, HEIGHT - 1),
      restorePage: () => fb.transfer(1, 0, 0, 0, WIDTH - 1, HEIGHT - 1),
    };
    this.fx = this.makeEffects();
    this.loadStoryFonts();
    this.loadLetterFonts();
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.altKey) return;
      // Typing in a box of the page's own (a name, a pasted save) is the box's.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = dosKey(e);
      if (k === 0) return;
      e.preventDefault();
      if (e.repeat && this.dropRepeat?.(k)) return;
      this.push(k);
    });
    const frame = (now: number): void => {
      if (this.fb.runes.active) this.fb.stepRunes(now);
      // The frame's tone where the party is (the Standard look's, chromeTone.ts), at once when it changes.
      if (this.toneOf) {
        const tone = this.look === 'standard' ? this.toneOf() : null;
        const key = tone ? `${tone.hue ?? '-'}|${tone.sat}|${tone.value}` : '';
        if (key !== this.toneKey) {
          this.toneKey = key;
          this.fb.chromeTone = tone;
          this.fb.dirty = true;
        }
      }
      // The harpsichord's keyboard drawn again while a key is down or a number fades (drawHarp).
      if (this.harp && harpMoving(this.harp, performance.now())) this.fb.dirty = true;
      if (this.fb.dirty) {
        this.fb.present(this.image);
        this.show();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * The colour page onto the canvas at the display's size, and page 0's story words over it at that size. Enlarged,
   * by the nearest pixel: every edge hard, a pixel of the art one display pixel wider than the next here and there
   * (the player's choice, September 2026, over the sharpened smoothing, which `?scale=smooth` shows: grown square-
   * edged to the whole number past the display's size and shrunk to it smoothed, every pixel as wide as the next and
   * each edge soft by a display pixel). Made smaller (a phone), smoothed, where the nearest pixel would drop rows.
   */
  private show(): void {
    const [w, h] = this.wanted;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
    this.base.putImageData(this.image, 0, 0);
    const ctx = this.ctx;
    const scale = w / HI_WIDTH;
    const whole = (Math.abs(scale - Math.round(scale)) < 0.01 && scale >= 1) || (scale > 1 && !SMOOTH);
    let from: HTMLCanvasElement = this.base.canvas;
    if (!whole && scale > 1) {
      const k = Math.ceil(scale);
      let g = this.grown;
      if (g?.canvas.width !== HI_WIDTH * k) {
        const made = document.createElement('canvas');
        [made.width, made.height] = [HI_WIDTH * k, HI_HEIGHT * k];
        g = this.grown = made.getContext('2d');
      }
      if (g) {
        g.imageSmoothingEnabled = false;
        g.drawImage(from, 0, 0, g.canvas.width, g.canvas.height);
        from = g.canvas;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = !whole;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, w, h);
    // The letters over their cells, then the marks the chrome carries, at the display's size.
    const letters: Letter[] = [...this.fb.lettersShown(), ...this.fb.revealing];
    const marks = this.fb.marksShown();
    if (letters.length || marks.length) {
      const cell = GLYPH_SIDE * scale;
      for (const l of letters) {
        const [x, y] = [l.x * HI * scale, l.y * HI * scale];
        const k = l.to ? l.k : 0;
        if (k < 1) {
          ctx.globalAlpha = (1 - k) * l.alpha;
          this.setLetter(ctx, l, x, y, cell, l.colour);
        }
        if (l.to && k > 0) {
          ctx.globalAlpha = k * l.alpha;
          this.setLetter(ctx, l.to, x, y, cell, l.to.colour ?? l.colour);
        }
      }
      ctx.globalAlpha = 1;
      for (const m of marks) this.setLetter(ctx, m, m.column * GLYPH_SIDE * scale, m.row * GLYPH_SIDE * scale, cell, m.colour);
    }
    if (this.harp) this.drawHarp(ctx, w, h, this.harp, performance.now());
    const words = this.fb.words[0];
    if (!words.length) return;
    ctx.setTransform(scale, 0, 0, h / HI_HEIGHT, 0, 0);
    ctx.textBaseline = 'alphabetic';
    for (const { run, alpha } of words) {
      if (alpha <= 0) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.font = `${run.size}px "${run.face === 'body' ? BODY_FACE : INITIAL_FACE}"`;
      ctx.fillStyle = `#${run.colour.toString(16).padStart(6, '0')}`;
      ctx.fillText(run.text, run.x, run.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The harpsichord's keyboard over the view (harpsichord.ts), or null. */
  private harp: HarpView | null = null;
  /** IBM.CH, for the number over a key the PC (1988) look plays (its own lettering, as its screen has it). */
  private readonly glyphs: Font;

  /**
   * The harpsichord's keyboard (harpsichord.ts), over the picture at the display's size: nine keys across the box's
   * lines, pale with dark gaps and the black keys of a scale between (a whole step's gaps: none between 3 and 4, nor 7
   * and 8), the bar on one; the key just played pressed for a moment; a gold dot on the tune's next key where the
   * player knows it; and each number played rising from its key and fading. The Standard look's in its lettering and
   * colours, the PC (1988) look's in the EGA's and IBM.CH's.
   */
  private drawHarp(ctx: CanvasRenderingContext2D, w: number, h: number, v: HarpView, now: number): void {
    const ega = this.look !== 'standard';
    ctx.setTransform(w / 320, 0, 0, h / 200, 0, 0);
    const KW = 10;
    const KH = 28;
    const kx = v.x + Math.floor((v.w - KW * 9) / 2);
    const ky = v.y + 14;
    const pal = ega
      ? {
          gap: '#000000',
          key: '#ffffff',
          down: '#aaaaaa',
          black: '#000000',
          shine: '#ffffff',
          bar: '#55ffff',
          dot: '#ffff55',
          pop: '#ffff55',
        }
      : {
          gap: '#1a1206',
          key: '#efe7cf',
          down: '#cfc6ad',
          black: '#100c08',
          shine: '#3a332b',
          bar: '#67cbec',
          dot: '#e8b030',
          pop: '#fff4c2',
        };
    for (let i = 0; i < 9; i++) {
      const down = v.pressed?.key === i && now - v.pressed.t < 160 ? 1 : 0;
      const x0 = kx + i * KW;
      ctx.fillStyle = pal.gap;
      ctx.fillRect(x0, ky, KW, KH);
      ctx.fillStyle = down ? pal.down : pal.key;
      ctx.fillRect(x0 + 1, ky + down, KW - 2, KH - 1 - down);
      if (i === v.at) {
        ctx.fillStyle = pal.bar;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0 + 1, ky + KH - 9, KW - 2, 8);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.bar;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 1.5, ky + 0.5, KW - 3, KH - 1.5);
      }
      if (i === v.dot) {
        ctx.fillStyle = pal.dot;
        ctx.beginPath();
        ctx.arc(x0 + KW / 2, ky + KH - 5 + down, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const b of [0, 1, 3, 4, 5, 7]) {
      const bx = kx + (b + 1) * KW - 3;
      ctx.fillStyle = pal.black;
      ctx.fillRect(bx, ky, 6, 17);
      if (!ega) {
        ctx.fillStyle = pal.shine;
        ctx.fillRect(bx + 1, ky, 1, 15);
      }
    }
    for (const p of v.pops) {
      const age = (now - p.t) / POP_MS;
      if (age < 0 || age >= 1) continue;
      ctx.globalAlpha = 1 - age * age;
      const cx = kx + p.key * KW + KW / 2;
      const top = ky - 9 - age * 4;
      if (ega) {
        ctx.fillStyle = pal.pop;
        const code = 0x31 + p.key;
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 8; c++)
            if (this.glyphs.rows[code * 8 + r] & (0x80 >> c)) ctx.fillRect(Math.round(cx - 4) + c, Math.round(top) + r, 1, 1);
      } else {
        ctx.font = `8px "${FACES.mono.family}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = pal.pop;
        ctx.fillText(String(p.key + 1), cx, top);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'start';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Whether the story pages' fonts are to hand; until they are (or if they never are) the pages are set as in 1988. */
  private storyFonts = false;
  private storyCanvas: OffscreenCanvasRenderingContext2D | null = null;

  private loadStoryFonts(): void {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
    const base = `${import.meta.env.BASE_URL}fonts/`;
    const faces = [
      new FontFace(BODY_FACE, `url(${base}IMFeENrm28P.ttf)`),
      new FontFace(INITIAL_FACE, `url(${base}UnifrakturMaguntia-Book.ttf)`),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        for (const f of loaded) document.fonts.add(f);
        this.storyFonts = true;
      })
      .catch(() => undefined);
  }

  /** Whether the lettering's faces are to hand; until they are, the glyphs are drawn on the colour page as before. */
  private letterFonts = false;
  /** Each face's width and height to its size (a letter's advance, a capital's height), measured once loaded. */
  private readonly metrics = new Map<Face, { advance: number; cap: number }>();

  /** Settled once the lettering's faces have loaded, or failed to (main.ts waits on it before the game draws). */
  lettersLoaded: Promise<void> = Promise.resolve();

  private loadLetterFonts(): void {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
    const base = `${import.meta.env.BASE_URL}fonts/`;
    const faces = Object.values(FACES)
      .filter((f) => f.file)
      .map((f) => new FontFace(f.family, `url(${base}${f.file})`));
    this.lettersLoaded = Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        for (const f of loaded) document.fonts.add(f);
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return;
        for (const [face, f] of Object.entries(FACES) as [Face, (typeof FACES)[Face]][]) {
          if (!f.file) continue;
          ctx.font = `100px "${f.family}"`;
          this.metrics.set(face, { advance: ctx.measureText('M').width / 100, cap: ctx.measureText('H').actualBoundingBoxAscent / 100 });
        }
        this.letterFonts = true;
        this.theme();
      })
      .catch(() => undefined);
  }

  /** How a face sits in a cell `cell` pixels square. */
  private fit(face: Face, cell: number): Fit {
    const m = this.metrics.get(face) ?? { advance: 0.6, cap: 0.7 };
    const share = FACES[face].share;
    const size = Math.min((cell * share) / m.advance, (cell * share * 0.78) / m.cap);
    return { size, baseline: cell / 2 + (m.cap * size) / 2 };
  }

  /** Whether a glyph of the game's has any ink. */
  private inked(font: number, code: number): boolean {
    const rows = this.fb.fonts[font].rows;
    for (let r = 0; r < 8; r++) if (rows[code * 8 + r]) return true;
    return false;
  }

  /** Letters as stencils 32 by 32 (a sign carved into a wall): made once each. */
  private readonly masks = new Map<string, Uint8Array>();

  private letterMask(face: Face, text: string, side = GLYPH_SIDE): Uint8Array | null {
    const key = `${face}:${text}:${side}`;
    const kept = this.masks.get(key);
    if (kept) return kept;
    if (typeof OffscreenCanvas === 'undefined') return null;
    const ctx = new OffscreenCanvas(side, side).getContext('2d');
    if (!ctx) return null;
    this.setLetter(ctx, { face, text }, 0, 0, side, 0xffffff);
    const data = ctx.getImageData(0, 0, side, side).data;
    const mask = new Uint8Array(side * side);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    this.masks.set(key, mask);
    return mask;
  }

  /** The game's symbols as outlines, 32 units square: made once each from their smoothed shapes. */
  private readonly symbols = new Map<string, Path2D>();

  /**
   * A symbol's shape (`font:code`) as a path: each row's runs of ink as rectangles, filled as one, so the edges are
   * cut at the display's own pixels rather than the colour page's.
   */
  private symbolPath(text: string): Path2D {
    let path = this.symbols.get(text);
    if (path) return path;
    const [font, code] = text.split(':').map(Number);
    const mask = this.fb.symbolMask(font, code);
    path = new Path2D();
    for (let y = 0; y < GLYPH_SIDE; y++) {
      for (let x = 0; x < GLYPH_SIDE; ) {
        if (!mask[y * GLYPH_SIDE + x]) {
          x++;
          continue;
        }
        const from = x;
        while (x < GLYPH_SIDE && mask[y * GLYPH_SIDE + x]) x++;
        path.rect(from, y, x - from, 1);
      }
    }
    this.symbols.set(text, path);
    return path;
  }

  /** One letter set in a cell `cell` pixels square at (x, y) of a context, in `colour` (0xRRGGBB). */
  private setLetter(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    { face, text }: { face: Face; text: string },
    x: number,
    y: number,
    cell: number,
    colour: number,
  ): void {
    const css = `#${colour.toString(16).padStart(6, '0')}`;
    if (face === 'symbol') {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(cell / GLYPH_SIDE, cell / GLYPH_SIDE);
      ctx.fillStyle = css;
      ctx.fill(this.symbolPath(text));
      ctx.restore();
      return;
    }
    const { size, baseline } = this.fit(face, cell);
    const f = FACES[face];
    ctx.font = `${size}px "${f.family}"`;
    ctx.fillStyle = css;
    const width = ctx.measureText(text).width;
    // Two letters for one rune (TH, EE...) are drawn narrower, to stand in its one cell.
    const squeeze = Math.min(1, (cell * f.share) / width);
    ctx.save();
    ctx.translate(x + cell / 2, y + baseline);
    ctx.scale(squeeze, 1);
    if (f.bold) {
      ctx.strokeStyle = css;
      ctx.lineWidth = size * f.bold;
      ctx.lineJoin = 'miter';
      ctx.strokeText(text, -width / 2, 0);
    }
    ctx.fillText(text, -width / 2, 0);
    ctx.restore();
  }

  /** The canvas the story's words are set on, and how wide a run of them is. */
  private get story(): { ctx: OffscreenCanvasRenderingContext2D; measure: Measure } | null {
    if (this.look !== 'standard' || !this.storyFonts || typeof OffscreenCanvas === 'undefined') return null;
    this.storyCanvas ??= new OffscreenCanvas(HI_WIDTH, HI_HEIGHT).getContext('2d');
    const ctx = this.storyCanvas;
    if (!ctx) return null;
    const measure: Measure = (text, size, face) => {
      ctx.font = `${size}px "${face === 'body' ? BODY_FACE : INITIAL_FACE}"`;
      return ctx.measureText(text).width;
    };
    return { ctx, measure };
  }

  /** Runs of the story's words set over a page: kept as words, drawn at the display's size as it is shown (show). */
  private drawRuns(measure: Measure, runs: Run[], page: number): void {
    const words: Words[] = runs.map((run) => ({
      run,
      box: [run.x, run.y - run.size * 1.1, run.x + measure(run.text, run.size, run.face), run.y + run.size * 0.45],
      alpha: 1,
    }));
    this.fb.addWords(page, words);
  }

  private makeEffects(): Effects {
    const fb = this.fb;
    // The gypsy's stage: page 0 as it stood when it began, and the rectangles drawn over since.
    let stageBase: Snapshot | null = null;
    let staged: [number, number, number, number][] = [];
    const tick = (): Promise<void> => this.sleep(TICK_MS);
    let wdFrame = 0;
    let wdDue = 0;
    const nextWD = (): void => {
      const src = wdFrame * 0x32;
      // Not over a dialog's box on the title (a question asked while the character is made): its frame is copper.
      for (let row = 0; row < 0x31; row++) fb.copyRow(1, src + row, 0, 0x41 + row, 0xf, fb.chromeAlso);
      wdFrame = (wdFrame + 1) & 3;
    };
    // The Standard look's flames at two thirds of 1988's pace (a frame a tick, about 18 a second): 12 a second, by
    // the clock, in the title's loop and while the title burns in alike. Asked once a tick, a frame comes every tick
    // or two in turn, each due a twelfth of a second after the last was due, so the pace holds whatever the timer's
    // jitter; asked faster (the burning in), the frames between are let pass.
    const pacedWD = (): void => {
      if (this.look === 'standard') {
        const now = performance.now();
        if (now < wdDue - 10) return;
        wdDue = (now - wdDue > WD_MS ? now : wdDue) + WD_MS; // after a pause, from now
      }
      nextWD();
    };
    return {
      page: (n) => {
        fb.page = n;
      },
      pageNow: () => fb.page,
      keepScreen: () => {
        const shot = fb.snapshot(0);
        return () => fb.restorePage(0, shot);
      },
      image: (res, i, x, y, flags = 0, style) => {
        const v = picture(res, i);
        if (v) fb.image(v, x, y, flags, this.styled(res, i, v, style));
      },
      viewSlide: (x1, y1, x2, y2, k) => {
        if (this.look === 'standard') fb.viewSlide(x1, y1, x2, y2, k);
      },
      dungeonTint: (dungeon) => {
        this.tint = dungeon;
        fb.signInk = signInk(dungeon);
      },
      bitImage: (res, i, x, y) => {
        const v = bitPicture(res, i);
        if (v) fb.bitImage(v, x, y);
      },
      prose: (texts) => {
        const story = this.story;
        if (!story) return false;
        const runs = setProse(texts, fb.litMap(fb.page), story.measure);
        if (!runs) return false;
        this.drawRuns(story.measure, runs, fb.page);
        return true;
      },
      choice: (question, left, right, lit) => {
        const story = this.story;
        if (!story) return false;
        const was = fb.page;
        fb.page = 0;
        // The band under the bowls, and the band above the braziers, as the picture leaves them: black.
        fb.fill(0, 149 + GYPSY_DROP, WIDTH - 1, HEIGHT - 1, 0);
        fb.fill(0, 0, WIDTH - 1, GYPSY_DROP - 1, 0);
        fb.page = was;
        this.drawRuns(story.measure, setChoice(question, left, right, lit, story.measure), 0);
        return true;
      },
      stage: (scene) => {
        if (stageBase) for (const [x1, y1, x2, y2] of staged) fb.restoreRect(0, stageBase, x1, y1, x2, y2);
        staged = [];
        if (!scene) {
          stageBase = null;
          return;
        }
        stageBase ??= fb.snapshot(0);
        if (scene.fire) {
          const [x, y, w, h] = scene.fire;
          fb.shimmer(stageBase, scene.fire, scene.now);
          staged.push([x, y, x + w - 1, y + h - 1]);
        }
        if (scene.figure && this.standard) {
          const { tile, x, y, size = 16 } = scene.figure;
          const was = fb.page;
          fb.page = 0;
          fb.drawFigure(this.standard.figure(tile), [x, y, size, size], this.walkBounds(tile));
          fb.page = was;
          staged.push([x, y, x + size - 1, y + size - 1]);
        }
      },
      transfer: (from, to, x1, y1, x2, y2, dx = x1, dy = y1) => fb.transfer(from, to, x1, y1, x2, y2, dx, dy),
      readSign: (key, read) => fb.readSign(key, read),
      readInk: (rgb) => {
        fb.readInk = rgb;
      },
      carveSign: (text, left, top, key, read) => this.look === 'standard' && fb.carveSign(text, left, top, key, read),
      farSign: (text, left, top) => {
        if (this.look === 'standard') fb.farSign(text, left, top);
      },
      sideSign: (text, left, top, side, depth) => {
        if (this.look === 'standard') fb.sideSign(text, left, top, side, depth);
      },
      emit: (on) => fb.emit(on),
      darkenUnlit: (x1, y1, x2, y2) => {
        if (this.look === 'standard') fb.darkenUnlit(x1, y1, x2, y2);
      },
      transferScaled: (from, to, x1, y1, x2, y2, dx, dy, dw, dh, clipFrom, clipTo) =>
        fb.transferScaled(
          from,
          to,
          [x1, y1, x2, y2],
          [dx, dy, dw, dh],
          clipFrom === undefined ? undefined : [clipFrom, clipTo ?? dx + dw - 1],
        ),
      reveal: async (x1, y1, x2, y2, also, ms) => {
        // GRAP_BUF_TransferPage_Reveal: an LFSR sized to the area visits every pixel once.
        const masks = [3, 6, 0xc, 0x14, 0x30, 0x60, 0xb8, 0x110, 0x240, 0x500, 0xca0, 0x1b00, 0x3500, 0x6000, 0xb400];
        const area = ([ax1, ay1, ax2, ay2]: [number, number, number, number]) => {
          const w = ax2 - ax1 + 1;
          const total = w * (ay2 - ay1 + 1);
          let bits = 2;
          let max = 3;
          while (max < total) {
            bits++;
            max = (1 << bits) - 1;
          }
          const mask = masks[bits - 2];
          let state = 1 % max || 1;
          const a = { total, done: 0, put: (): void => {} };
          a.put = () => {
            for (;;) {
              const idx = state - 1;
              const lsb = state & 1;
              state >>= 1;
              if (lsb) state ^= mask;
              if (idx >= total) continue;
              fb.copyPixel(1, 0, ax1 + (idx % w), ay1 + Math.floor(idx / w));
              a.done++;
              return;
            }
          };
          return a;
        };
        const main = area([x1, y1, x2, y2]);
        // A second area (the port's: the dungeon map's small first-person view), as far through as the first at every step.
        const second = also ? area(also) : null;
        const keepUp = (): void => {
          if (second) while (second.done < second.total && second.done * main.total < main.done * second.total) second.put();
        };
        // The story's words dissolve with the pixels, faded as far as the pixels are through.
        const words = fb.revealWords(x1, y1, x2, y2);
        // Pixels a tick: 512 (the intro's pace), or as many as finish it in `ms`.
        const perTick = ms ? Math.max(1, Math.ceil((main.total * TICK_MS) / ms)) : 512;
        while (main.done < main.total) {
          main.put();
          keepUp();
          if (main.done % perTick === perTick - 1) {
            fb.dirty = true;
            words(main.done / main.total);
            if (this.pollKey()) {
              words(1);
              fb.transfer(1, 0, x1, y1, x2, y2);
              if (also) fb.transfer(1, 0, ...also);
              return true;
            }
            await tick();
          }
        }
        keepUp();
        words(1);
        fb.dirty = true;
        return false;
      },
      originLogo: () => this.originLogo(),
      showWD: async (maskRes) => {
        const mask = bitPicture(maskRes, 0);
        if (!mask) return;
        const backup = fb.snapshot(1);
        fb.clearPage(1);
        const copyPixel = (mx: number, my: number): void => {
          const x = 0x10 + mx;
          for (let f = 0; f < 4; f++) fb.restorePixel(1, backup, x, f * 0x32 + my);
        };
        // A wait of the burning in; in the Standard look the flames go on at their own pace through it.
        const burnWait = async (ms: number): Promise<void> => {
          if (this.look !== 'standard') return this.sleep(ms);
          for (let left = ms; left > 0; left -= 40) {
            await this.sleep(Math.min(40, left));
            pacedWD();
          }
        };
        const pass = async (masked: boolean): Promise<boolean> => {
          let seed = 1;
          let countdown = 0x100;
          let made = 0;
          for (let i = 0; i < 0x8000; i++) {
            const ry = Math.floor(seed / 0x120);
            const x = seed % 0x120;
            if (ry < 0x31 && x < mask.width && ry < mask.height) {
              const set = (mask.bits[ry * mask.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
              if (set === masked) {
                copyPixel(x, ry);
                if (made % 64 === 63) {
                  fb.dirty = true;
                  if (this.pollKey()) return true;
                  await burnWait(masked ? 120 : 33);
                }
                made++;
              }
            }
            if (--countdown === 0) {
              // 1988's flame, a frame every so many steps of the burning in; the Standard look's goes by the clock.
              if (this.look !== 'standard') nextWD();
              countdown = 0x100;
            }
            const carry = seed & 1;
            seed >>= 1;
            if (carry) seed ^= 0x3500;
            if (seed === 1) break;
          }
          return false;
        };
        let aborted = await pass(false);
        if (!aborted) aborted = await pass(true);
        if (!aborted) copyPixel(0, 0);
        fb.restorePage(1, backup);
        pacedWD();
      },
      nextWDFrame: pacedWD,
      tilePx: (tile, px, py, ground, floor, place) => fb.tile(tile, px, py, undefined, ground, place, 0, floor),
      copyFigure: async (tile, scale) => {
        if (this.look !== 'standard' || !this.standard || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
        const px = this.standard.figure(tile);
        const n = Math.round(Math.sqrt(px.length));
        const side = n * scale;
        const canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = [side, side];
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const image = ctx.createImageData(side, side);
        // The figure's pixels are RGBA in memory order, as the image's are.
        const out = new Uint32Array(image.data.buffer);
        for (let y = 0; y < side; y++)
          for (let x = 0; x < side; x++) out[y * side + x] = px[Math.floor(y / scale) * n + Math.floor(x / scale)];
        ctx.putImageData(image, 0, 0);
        // The PNG given as a promise, so the clipboard is asked while the key that asked is still fresh (Safari).
        const png = new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no PNG'))), 'image/png'),
        );
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          return true;
        } catch {
          return false;
        }
      },
      tileLarge: (tile, px, py, size, clip, ground, place) => {
        const square = this.look === 'standard' ? this.standard?.square(tile, ground, place) : null;
        if (!square) return;
        const was = fb.page;
        fb.page = 0;
        fb.drawScaled(square, [px, py, size, size], false, clip);
        fb.page = was;
      },
      moongatePx: (rows, px, py) => fb.moongateRise(rows, 0x05, px, py),
      revealPx: (tile, px, py, step) => fb.revealStep(tile, px, py, step),
    };
  }

  /** GRAP_BUF_AnimateOriginLogo: the logo's lines (on page 1) fold in and out, blue, by the table from the driver. */
  private async originLogo(): Promise<boolean> {
    const fb = this.fb;
    const table = [
      0x07, 0x00, 0x4b, 0x03, 0x0b, 0xff, 0xff, 0xff, 0x01, 0xff, 0xff, 0xff, 0xff, 0x00, 0x02, 0xff, 0x03, 0x48, 0x07, 0x0f, 0xff, 0xff,
      0x01, 0x05, 0xff, 0xff, 0x02, 0x04, 0xff, 0xff, 0x03, 0xff, 0x00, 0x06, 0xff, 0x0a, 0x47, 0x0b, 0x13, 0xff, 0xff, 0x02, 0x08, 0xff,
      0x03, 0x07, 0xff, 0x01, 0x09, 0xff, 0x04, 0x06, 0xff, 0x05, 0xff, 0x00, 0x0a, 0xff, 0x15, 0x42, 0x14, 0x1c, 0xff, 0x04, 0x0f, 0xff,
      0x01, 0x07, 0x0c, 0x12, 0xff, 0x05, 0x0e, 0xff, 0x02, 0x08, 0x0b, 0x11, 0xff, 0x03, 0x06, 0x0d, 0x10, 0xff, 0x09, 0x0a, 0xff, 0x00,
      0x13, 0xff, 0x29, 0x3c, 0x20, 0x28, 0xff, 0x07, 0x18, 0xff, 0x02, 0x0c, 0x13, 0x1d, 0xff, 0x03, 0x08, 0x0d, 0x12, 0x17, 0x1c, 0xff,
      0x01, 0x06, 0x0b, 0x14, 0x19, 0x1e, 0xff, 0x04, 0x09, 0x0e, 0x11, 0x16, 0x1b, 0xff, 0x05, 0x0a, 0x0f, 0x10, 0x15, 0x1a, 0xff, 0x00,
      0x1f, 0xff, 0x49, 0x35, 0x2d, 0x35, 0xff, 0x04, 0x0b, 0x12, 0x1a, 0x21, 0x28, 0xff, 0x01, 0x08, 0x0f, 0x13, 0x24, 0x2b, 0xff, 0x06,
      0x0d, 0x14, 0x18, 0x1f, 0x26, 0xff, 0x03, 0x0a, 0x11, 0x16, 0x1b, 0x22, 0x29, 0xff, 0x02, 0x05, 0x09, 0x0c, 0x10, 0x13, 0x19, 0x1c,
      0x20, 0x23, 0x27, 0x2a, 0xff, 0x07, 0x0e, 0x15, 0x17, 0x1e, 0x25, 0xff, 0x00, 0x2c, 0xff, 0x76, 0x2e, 0x3d, 0x45, 0xff, 0x1c, 0x17,
      0x12, 0x0d, 0x08, 0x03, 0x20, 0x25, 0x2a, 0x2f, 0x34, 0x39, 0xff, 0x1a, 0x15, 0x10, 0x0b, 0x06, 0x01, 0x22, 0x27, 0x2c, 0x31, 0x36,
      0x3b, 0xff, 0x1d, 0x18, 0x13, 0x0e, 0x09, 0x04, 0x1f, 0x24, 0x29, 0x2e, 0x33, 0x38, 0xff, 0x1b, 0x16, 0x11, 0x0c, 0x07, 0x02, 0x21,
      0x26, 0x2b, 0x30, 0x35, 0x3a, 0xff, 0x19, 0x0f, 0x05, 0x23, 0x2d, 0x37, 0xff, 0x1e, 0x28, 0x32, 0x14, 0x0a, 0xff, 0x00, 0x3c, 0xff,
    ];
    let cursor = 0;
    let listStart = 0;
    let listLenM1 = 0;
    let srcY = 0;
    let dstY = 0;
    let lines = 0;
    const visible = new Uint8Array(128);
    const read = (): number => (cursor < table.length ? table[cursor++] : 0);
    const header = (): void => {
      srcY = read();
      dstY = read();
      lines = read();
    };
    const listAt = (i: number): number => (i < 0 || listStart + i >= table.length ? 0xff : table[listStart + i]);
    const render = async (dir: number): Promise<boolean> => {
      let y = dir === 0 ? dstY : dstY + lines;
      const adv = (): void => {
        y = dir === 0 ? y + 1 : (y - 1) & 0xffff;
      };
      let hidden = 0;
      let shown = 0;
      for (let i = 0; i < lines; i++) {
        if (visible[i] === 0) hidden++;
        else shown++;
      }
      for (let i = 0; i < hidden >> 1; i++) {
        fb.clearRow(0, y);
        adv();
      }
      let scan = 0;
      for (let i = 0; i < shown; i++) {
        while (scan < lines && visible[scan] === 0) scan++;
        if (scan >= lines) break;
        fb.copyRow(1, srcY + scan, 0, y, 9);
        scan++;
        adv();
      }
      hidden++;
      for (let i = 0; i < hidden >> 1; i++) {
        fb.clearRow(0, y);
        adv();
      }
      if (this.pollKey()) return true;
      await this.sleep(2 * (Math.trunc(lines / 3) + 15));
      return false;
    };
    const reverseSet = async (dir: number): Promise<boolean> => {
      visible.fill(0, 0, lines);
      let pos = listLenM1 - 1;
      for (let count = 6; count >= 0; ) {
        const v = listAt(pos--);
        if (v === 0xff) {
          count--;
          if (await render(dir)) return true;
        } else if (v < lines) {
          visible[v] = 1;
        }
      }
      return false;
    };
    const forwardClear = async (dir: number): Promise<boolean> => {
      let pos = 1;
      for (let count = 6; count > 0; ) {
        const v = listAt(pos++);
        if (v === 0xff) {
          count--;
          if (await render(dir)) return true;
        } else if (v < lines) {
          visible[v] = 0;
        }
      }
      return false;
    };
    const abort = async (): Promise<boolean> => {
      cursor = 0xbf;
      header();
      visible.fill(1, 0, lines);
      await render(0);
      return true;
    };
    let passes = read();
    let dir = 1;
    while (passes !== 0) {
      header();
      const len = read();
      listLenM1 = len - 1;
      listStart = cursor;
      cursor += len;
      dir ^= 1;
      if (await reverseSet(dir)) return abort();
      if (--passes === 0) break;
      if (await forwardClear(dir)) return abort();
    }
    return false;
  }

  /** A key from any source (keyboard, touch, gamepad); `pressed` false for one the page itself sends. */
  push(k: number, pressed = true): void {
    // A box of the page's own over the game (the crash box) takes the controller and the touch pad's keys itself.
    if (menuUp()) return;
    if (pressed) this.onKey?.();
    // The runes being read are read at once; the key goes on to the game.
    if (this.fb.runes.active) this.fb.finishRunes();
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(k);
    } else if (this.keys.length < 16) {
      this.keys.push(k);
    }
  }

  unseen(draw: (shown: () => void) => void): void {
    const fb = this.fb;
    const image = this.ctx.createImageData(HI_WIDTH, HI_HEIGHT);
    draw(() => fb.present(image));
    this.text.clearArea(0, 0, 39, 24); // the text's record of the screen, too: nothing of it is there
    for (const n of [1, 0]) {
      fb.page = n;
      fb.fill(0, 0, 319, 199, 0);
    }
    fb.dirty = false;
  }

  animateTiles(): void {
    this.animator.tick();
    this.standard?.tick();
  }

  setClock(hour: number, minute: number): void {
    this.clock = [hour, minute];
    this.animator.setClock(hour, minute);
    this.standard?.setClock(hour, minute);
  }

  /** The time the clocks show, for a tile set taken up later. */
  private clock: [number, number] = [0, 0];

  /** The Standard tile art in use, once loaded: one of the Standard look's sets (settings.ts Tiles). */
  standard: StandardArt | null = null;

  /**
   * The Standard look's tile sets made so far, by name; how one not made yet is made, the first time it is chosen (null
   * for none, or none to be had); and what to do when one chosen before it was made is ready - draw again.
   */
  private readonly sets = new Map<Tiles, StandardArt>();
  private readonly making = new Set<Tiles>();
  makeTiles: ((kind: Tiles) => Promise<StandardArt | null>) | null = null;
  onTilesReady: (() => void) | null = null;
  private tiles: Tiles = 'modern-pc';
  /** The Avatar's appearance as last given (Draw.avatar), for a Modern PC set made after it. */
  private avatarLook: Appearance | null = null;
  private avatarLady = false;
  private avatarBase: number | undefined;
  /** Whether Modern PC's actors are outlined (Settings' Outlines). */
  private outlines = true;

  /** Set `kind` of the Standard look's tiles, made: kept, and taken up if it is the set chosen. */
  addTiles(kind: Tiles, art: StandardArt): void {
    this.sets.set(kind, art);
    if (kind === 'modern-pc') art.setAppearance(this.avatarLook, this.avatarLady, this.avatarBase);
    if (kind === this.tiles) this.takeUp(art);
  }

  /** `art` the Standard tiles in use: the figures' outlines measured again, its clocks set. */
  private takeUp(art: StandardArt): void {
    const outlined = this.outlines && art === this.sets.get('modern-pc');
    if (art === this.standard && art.outlined === outlined) return;
    this.standard = art;
    art.outlined = outlined;
    this.walks.clear();
    art.setClock(...this.clock);
  }

  /**
   * Which tile art the screen draws with: in the Modern look ('standard') set `tiles` (when loaded); in the PC (1988)
   * look the EGA tiles, or with `tiles` Apple ][ that set's tiles, its lettering left out. The game redraws after. A
   * set not made yet is made now, and taken up when it is ready (the EGA's or the last set's until then).
   */
  setTileArt(set: 'standard' | 'original', tiles: Tiles = this.tiles, outlines = this.outlines): void {
    this.tiles = tiles;
    this.outlines = outlines;
    const ega = set === 'original' && tiles !== 'apple2';
    const made = this.sets.get(tiles);
    if (ega) {
      // The EGA tiles themselves: no set to take up.
    } else if (made) this.takeUp(made);
    else if (this.makeTiles && !this.making.has(tiles)) {
      this.making.add(tiles);
      // A set whose making failed (its sheet not fetched, offline) is not left marked as being made: chosen again, it
      // is tried again, the set before it drawn meanwhile.
      void this.makeTiles(tiles).then(
        (art) => {
          if (!art) return;
          this.sets.set(tiles, art);
          if (tiles === 'modern-pc') art.setAppearance(this.avatarLook, this.avatarLady, this.avatarBase);
          if (this.tiles !== tiles) return;
          this.setTileArt(this.look, tiles);
          this.onTilesReady?.();
        },
        (e: unknown) => {
          console.warn(`The ${tiles} tiles could not be made`, e);
          this.making.delete(tiles);
        },
      );
    }
    const apple = !ega && set === 'original' && this.standard && this.standard === this.sets.get('apple2') ? this.standard : null;
    this.fb.art = set === 'standard' && this.standard ? this.standard : apple ? new TilesAlone(apple) : new EgaArt(this.fb.tiles);
    this.look = set;
    this.theme();
  }

  private look: 'standard' | 'original' = 'original';
  /** Where the frame's tone comes from, once a game is under way (main.ts, chromeTone.ts); null for the copper. */
  toneOf: (() => ChromeTone | null) | null = null;
  private toneKey = '';
  /** Which dungeon's walls are being drawn (1-8, 0 outside one). */
  private tint = 0;

  /** The Standard tile art if that is the set in use, for what is drawn outside the screen (the land map). */
  get standardArt(): StandardArt | null {
    return this.look === 'standard' && this.standard ? this.standard : null;
  }
  private inGame = false;

  /** Figures under a light (the dungeon map's stone in its dungeon's), by the figure and the light, made once each. */
  private readonly tintedFigures = new WeakMap<Uint32Array, Map<number, Uint32Array>>();

  private tintedFigure(px: Uint32Array, tint: number): Uint32Array {
    const byTint = this.tintedFigures.get(px) ?? new Map<number, Uint32Array>();
    this.tintedFigures.set(px, byTint);
    let out = byTint.get(tint);
    if (!out) {
      // RGBA in memory order (0xAABBGGRR) to 0xRRGGBB and back, its alpha kept.
      out = px.map((v) => {
        const rgb = tinted(((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff), tint);
        return ((v & 0xff000000) | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
      });
      byTint.set(tint, out);
    }
    return out;
  }

  /** Pictures in the Standard look, made once each from the player's own. */
  private readonly restyled = new WeakMap<Uint8Array, Map<number, Uint32Array>>();

  /**
   * How a picture shows in the Standard look: the corridor's walls, things and wandering creature in the Standard
   * palette at the colour page's size. The scenes - the title, the introduction, the gypsy's cards, the ending - are the game's own
   * pixels in its own colours, each a square block: the art as it was drawn, the words beside it the port's.
   */
  private styled(res: Uint8Array, i: number, v: Picture, style?: PictureKind): ImageOver | undefined {
    if (this.look !== 'standard' || !this.standard || style === undefined) return undefined;
    let m = this.restyled.get(res);
    if (!m) this.restyled.set(res, (m = new Map<number, Uint32Array>()));
    // A wall is the colour of the dungeon it stands in, so what is kept is kept by both.
    const tint = style === 'dungeon' ? this.tint : 0;
    const at = i * 16 + tint;
    const px = m.get(at) ?? twice(restyle(v, style, tint, style === 'dungeon' ? wallOf(res, i) : undefined), v.width * 2, v.height * 2);
    m.set(at, px);
    return { kind: 'rgba', px, width: v.width * HI, scale: HI };
  }

  /** Each four-frame figure's outline over all its frames, by its first frame's tile: made once each. */
  private readonly walks = new Map<number, Bounds>();

  /** The outline all four frames of `tile`'s figure share (figureBounds of each, joined): it is fitted by that. */
  private walkBounds(tile: number): Bounds | undefined {
    if (!this.standard) return undefined;
    const base = tile & ~3;
    let b = this.walks.get(base);
    if (!b) {
      b = [Infinity, Infinity, -1, -1];
      for (let f = 0; f < 4; f++) {
        const [x0, y0, x1, y1] = figureBounds(this.standard.figure(base + f));
        if (x1 < 0) continue;
        b = [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)];
      }
      this.walks.set(base, b);
    }
    return b[2] < 0 ? undefined : b;
  }

  /** Standard's copper frame and soft flash, while the game's own screen is up. */
  private theme(): void {
    // The lettering in its faces in the Standard look, once they have loaded; the EGA look draws the game's own. The
    // letters set before are let go: the game draws the screen again after a change of look.
    const faces = this.look === 'standard' && this.letterFonts;
    this.fb.letterOf = faces
      ? (font, code) =>
          font === 0 && code >= 0x21 && code <= 0x7a
            ? { face: 'mono', text: String.fromCharCode(code) }
            : font === 0 && code >= 0x18 && code <= 0x1b
              ? { face: 'mono', text: ARROWS[code - 0x18] } // the lettering's own arrows
              : font === 1 && code >= 0x41 && code <= 0x5f
                ? { face: 'runes', text: RUNE_LETTER[code - 0x41] }
                : // The game's symbols: IBM.CH's but the borders' caps (the copper's) and the frame's corners beyond
                  // the letters; every one of RUNES.CH's that is not a rune letter and has ink.
                  (font === 0 && code > 2 && code < 0x20) || (font === 1 && this.inked(1, code))
                  ? { face: 'symbol', text: `${font}:${code}` }
                  : null
      : undefined;
    this.fb.letterMask = faces ? (face, text, side) => this.letterMask(face, text, side) : undefined;
    if (!faces) for (const m of this.fb.letters) m.clear();
    this.fb.chrome = this.look === 'standard' && this.inGame;
    this.fb.softFlash = this.look === 'standard';
    this.fb.dirty = true;
  }

  pollKey(): number {
    return this.keys.shift() ?? 0;
  }

  flushKeys(): void {
    this.keys.length = 0;
  }

  async waitKey(idle: () => void | Promise<void>): Promise<number> {
    const queued = this.keys.shift();
    if (queued !== undefined) return queued;
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      // An idle that fails (an animation's frame) is said in the console, once, and the wait goes on looking: the key
      // that ends it still comes, and the next idle may well do.
      let told = false;
      const tick = (): void => {
        void new Promise<void>((r) => r(idle()))
          .catch((e: unknown) => {
            if (!told) console.error(e);
            told = true;
          })
          .then(() => {
            if (this.waiter === done) timer = setTimeout(tick, IDLE_MS);
          });
      };
      const done = (k: number): void => {
        if (timer !== null) clearTimeout(timer);
        resolve(k);
      };
      this.waiter = done;
      tick();
    });
  }

  now(): number {
    return performance.now();
  }

  sleep(ms: number): Promise<void> {
    if (this.asleep) return this.asleep.then(() => this.sleep(ms));
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * While the page is away the game holds: every wait the engine makes
   * goes on until it comes back, so an animation, a tune and the clock do
   * not run on in a tab nobody is looking at. Keys are still taken, so
   * one pressed on the way back is not lost.
   */
  private asleep: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  setAwake(awake: boolean): void {
    if (awake) {
      this.wake?.();
      this.wake = null;
      this.asleep = null;
      return;
    }
    if (this.asleep) return;
    this.asleep = new Promise((r) => {
      this.wake = r;
    });
  }
}

/**
 * For a wall's picture (DNGn.16), the same wall drawn plain: a side wall
 * with a door (4-7) or a fall of rock (0x14-0x17) against the bare side
 * wall (0-3), and the same ahead (0xc-0xf and 0x18-0x1b against 8-0xb).
 * A bare wall has nothing in it to find.
 */
function wallOf(res: Uint8Array, i: number): WallOf | undefined {
  const twin =
    (i >= 4 && i < 8) || (i >= 0xc && i < 0x10) ? i - 4 : i >= 0x14 && i < 0x18 ? i - 0x14 : i >= 0x18 && i < 0x1c ? i - 0x10 : -1;
  if (twin < 0) return undefined;
  const stone = picture(res, 9);
  if (!stone) return undefined;
  return { plain: picture(res, twin), stone, ahead: (i & 0xf8) === 8 || (i & 0xfc) === 0x18 };
}
