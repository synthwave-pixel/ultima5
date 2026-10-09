/**
 * io.ts
 *
 * The boundary between game logic and the browser. The DOS game drew
 * straight to the screen through its text windows and a graphics driver;
 * game code here does the same through `Platform`, which the browser
 * implements with a canvas and tests implement with fakes. Every wait is a
 * Promise.
 *
 * Keys are the DOS game's codes (u5d macros.h): arrows 1-4, Enter 13,
 * Escape 27, Backspace 8, letters upper case.
 */

import type { Occasion } from '../audio/soundtracks.ts';
import type { Text } from '../ui/text.ts';
import type { Appearance } from './appearance.ts';

export const K = {
  Left: 1,
  Right: 2,
  Up: 3,
  Down: 4,
  CtrlE: 5,
  Backspace: 8,
  Tab: 9,
  CtrlK: 0x0b,
  Enter: 0x0d,
  CtrlS: 0x13,
  CtrlV: 0x16,
  Escape: 0x1b,
  Space: 0x20,
  Plus: 0x2b,
  Minus: 0x2d,
  CtrlB: 0xfc,
} as const;

/**
 * Controller buttons (a gamepad, the touch pad), beyond any DOS key code.
 * What each means depends on the prompt waiting for it (input.ts): at a
 * command prompt A opens the command menu, elsewhere it is Enter.
 */
export const Pad = { A: 0x100, B: 0x101, X: 0x102, Y: 0x103, Start: 0x104, Select: 0x105 } as const;

/** The Pause menu's Save game, as a command: saved there and then, without 1988's Quit prompt (storage.ts saveCommand). */
export const SAVE_NOW = 0x109;

/** Play the harpsichord, as a command: its keyboard (harpsichord.ts), from Play or a walk into it (apart from menu.ts's own 0x104-0x10c). */
export const HARPSICHORD = 0x106;

/**
 * The harpsichord's keyboard as the screen draws it over the view (Draw.harpsichord, harpsichord.ts): in the box at
 * (x, y, w, h) in EGA pixels, nine keys, the bar on `at`, a gold dot on `dot` (-1 none), the key last `pressed` (when,
 * by Platform.now) and the numbers rising from those played (`pops`).
 */
export interface HarpView {
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
  dot: number;
  pressed: { key: number; t: number } | null;
  pops: { key: number; t: number }[];
}

/**
 * Not a key: the window lost focus, or the page was hidden (another app in front, the Android app sent to the
 * background), while the game waited for a command. The command prompt opens the Pause menu for it (the ultima3
 * port's), so the player comes back to the game held rather than to play already going on; every other prompt lets it
 * pass, the game holding anyway while the page is hidden.
 */
export const LOST_FOCUS = 0x1f0;

/** A member drawn on the map: the figure's tile (an actor's, 0x100 on) and its tint, 0xRRGGBB (0 none). */
export interface Figure {
  tile: number;
  tint: number;
  /** A companion's figure: drawn in their colours, where the art can (Draw.dressAs). */
  dress?: Dressing | null;
}

/** A companion's figure as it is drawn (companions.ts): their look, and whether a woman (a mage's then has no beard). */
export interface Dressing {
  look: Appearance;
  lady: boolean;
}

/** Which of the Standard look's marks (Draw.aim): a weapon's aim, a spell's, a member a spell is for, a direction. */
export type Mark = 'attack' | 'spell' | 'heal' | 'direction';

/** Where a square of the world map is: for tile art that draws what lies between squares (the shores) from the map. */
export interface Place {
  /** 0 Britannia, 1 the Underworld. */
  map: number;
  /** The square, in the map's squares. */
  x: number;
  y: number;
  /** The map's squares round it, five by five, row by row: the square itself is the middle one (12). */
  around: Uint8Array;
}

/** The graphics driver's operations the game uses (u5d grap_drv.c), in DOS pixels. */
export interface Draw {
  /**
   * The Avatar's appearance (appearance.ts), for the tile art that draws it (the Modern PC tiles); `lady`, whether the
   * Avatar is addressed as Lady (a mage without her beard); `base`, a figure other than the look's own to draw in the
   * Avatar's place (a companion at a mirror: their trade's figure, appearanceMenu.ts).
   */
  avatar?(look: Appearance, lady?: boolean, base?: number): void;
  /**
   * The figures drawn from now on are a companion's, until set again (null): drawn in their colours, a woman's mage
   * without the beard, where the tile art can (the Standard look's Modern PC tiles).
   */
  dressAs?(dress: Dressing | null): void;
  /**
   * Where the party's leader stands (a Place's map and square), or null: the tile art that draws the Avatar as the
   * player made it gives him back in the mirror he stands before, and anyone else the mirror as the tiles have it.
   */
  leader?(at: Pick<Place, 'map' | 'x' | 'y'> | null): void;
  /** Pen colour for fill, line and plot (DRV_2d). */
  pen: number;
  fill(x1: number, y1: number, x2: number, y2: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  plot(x: number, y: number): void;
  /** XOR with white: inverts the rectangle. */
  invert(x1: number, y1: number, x2: number, y2: number): void;
  /**
   * A tile at viewport cell (x, y): cell (0, 0) is pixel (8, 8). `ground`, the terrain tile beneath, shows through
   * tile art that lets it; `place`, where on the world map the square is, lets art draw its shore from the map;
   * `tint` (0xRRGGBB) draws the figure all in that colour (a member's state).
   */
  tile(tile: number, x: number, y: number, ground?: number, place?: Place, tint?: number, floor?: number): void;
  /**
   * The party on foot at viewport cell (x, y), drawn as its members - `figures`, in marching order - where the tile
   * art does (the Standard look's grid of four), else as `tile`; on `terrain`, itself on `floor` where it has
   * see-through parts (a hut, a sign).
   */
  party?(tile: number, x: number, y: number, figures: Figure[], terrain: number, floor?: number, place?: Place): void;
  /**
   * The Standard art's `tile` shrunk or grown into the square of `size` EGA pixels at (x, y), over what is there (the
   * dungeon map's cells); `trim` fits its figure to the square; `tint` (0xRRGGBB) lays a light on it as a dungeon's lies
   * on its grey stone (colours.ts tinted). False where the look has no such art (the EGA look), and nothing is drawn.
   */
  icon?(tile: number, x: number, y: number, size: number, trim?: boolean, tint?: number): boolean;
  /**
   * The game's screen (frame, panels, menus) is up, or not (the intro and ending's full pictures): the Standard look
   * themes the first only - from row `fromRow` down. With `only` (EGA pixels, inclusive), that rectangle is added to
   * what is themed, `on` and `fromRow` as they were (the whole of it, if nothing was): a dialog's own frame at the
   * title, over a picture whose blue is its own.
   */
  chrome?(on: boolean, fromRow?: number, only?: [number, number, number, number]): void;
  /**
   * A dialog's box over the map, in the EGA's pixels (x1, y1, x2, y2), whose blue border the Standard look draws as
   * the frame's copper, as it does a menu's at the map's edge; null once the view is drawn again.
   */
  chromeBox?(rect: [number, number, number, number] | null): void;
  /**
   * A part of the screen that is never the frame, in the EGA's pixels (x1, y1, x2, y2): the attract mode's scene,
   * whose squares, as they come, would each time change the black the copper may curve into; null for none.
   */
  chromeHole?(rect: [number, number, number, number] | null): void;
  /**
   * The Standard look's mark on the frame beside a party line (screen row `row`): the active player's arrow on the
   * left, a state's letter on the right - `code` a glyph of the game's font in `colour`, 0 to take it away. Shown
   * while the row reads `line` (columns 24 to 38), so that a list drawn over the party's rows hides it.
   */
  mark?(row: number, side: 'left' | 'right', code: number, colour: number, line: string): void;
  /**
   * The Standard look's hit (the ultima3 port's burst) over view cell (x, y): frame 1-3 as it grows, 0 to take it
   * away; red for a blow or a missile, blue for magic. Absent in a look that has none.
   */
  burst?(x: number, y: number, frame: number, magic: boolean): void;
  /**
   * The Standard look's spell pulse (the ultima3 port's): the view, or view cell `square` where the spell falls on
   * one member, washed half white; `unpulse` takes it away. Absent in a look that has none.
   */
  pulse?(square: [number, number] | null): void;
  unpulse?(): void;
  /**
   * The Standard look's mark on the combatant whose turn it is, at viewport cell (x, y): the ultima3 Standard outline,
   * in colour number `colour` (their state's or hit points', as their bar in the party panel).
   */
  marker?(x: number, y: number, colour: number): void;
  /** The harpsichord's keyboard over the view (HarpView), or null to take it away. */
  harpsichord?(view: HarpView | null): void;
  /**
   * The Standard look's marks at viewport cell (x, y), four triangles round the square (Mark): a weapon's aim red
   * fading to dark orange and back each second, a spell's dark purple and dark blue, a member a spell is for green
   * and dark green - each pointing in; a direction asked, white, pointing out from whoever acts. Absent in a look
   * that has none (the crosshair is drawn).
   */
  aim?(x: number, y: number, mark?: Mark): void;
  /**
   * One step of drawing `tile` into cell (x, y) a pixel at a time: step 0
   * is the top-left pixel, then an 8-bit LFSR (mask 0xb8) picks the rest
   * (u5d GRAP_BUF_PutTileRevealStep).
   */
  revealStep(tile: number, x: number, y: number, step: number): void;
  /** A moongate rising `rows` pixels out of the ground at cell (x, y). */
  moongate(rows: number, floor: 'grass' | 'brick', x: number, y: number): void;
  /** Scroll a pixel rectangle up (negative) or down (positive), as the earthquake does. */
  scroll(x1: number, y1: number, x2: number, y2: number, amount: number): void;
  /** Save and restore the screen (the driver's second page). */
  savePage(): void;
  restorePage(): void;
}

/** The picture operations and effects of the title and story (u5d grap_drv.c, origin.c, wd.c, reveal.c). */
export interface Effects {
  /** Draw on page 0 (the screen) or 1 (behind it). */
  page(n: number): void;
  /** The page being drawn on (page). */
  pageNow?(): number;
  /** The screen as it is now kept: the function given back puts it back (what a box drawn over it covered). */
  keepScreen?(): () => void;
  /** Picture `i` of a picture file's contents; flags 1 flip vertically, 2 horizontally. */
  /**
   * Picture `i` of a picture file. `style` says what it is, for a look that draws it its own way: 'dungeon' for the
   * corridor's walls, 'thing' for what stands in it, 'creature' for a half of its wandering creature.
   */
  image(res: Uint8Array, i: number, x: number, y: number, flags?: number, style?: 'dungeon' | 'thing' | 'creature'): void;
  /**
   * Pixels (x1, y1)-(x2, y2) of page `from` shrunk or grown into the box (dx, dy, dw, dh) of page `to` (the dungeon's
   * view made small, or grown to the map's square); the box's columns `clipFrom` to `clipTo` alone, where given.
   */
  transferScaled?(
    from: number,
    to: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    clipFrom?: number,
    clipTo?: number,
  ): void;
  /**
   * The Standard look reads the runes of a sign drawn anew each frame (the dungeon's): the text printed from now until
   * `readSign(null)` is sign `key` - its place and the way it is seen from - read as far as it is since first shown.
   */
  readSign?(key: string | null, read?: boolean): void;
  /** The colour runes printed from now read into English in (0xRRGGBB), or null for their own (runeWords.ts). */
  readInk?(rgb: number | null): void;
  /**
   * The Standard look's sign on the wall ahead, carved whole and larger than 1988 printed it (framebuffer.ts
   * carveSign): its text, 1988's text column and row for it, its key as readSign's, and whether it has been read.
   * False where the look draws signs as 1988 did, printed.
   */
  carveSign?(text: string, left: number, top: number, key: string, read: boolean): boolean;
  /** The Standard look's sign two squares ahead: smaller, in its runes alone (framebuffer.ts farSign). */
  farSign?(text: string, left: number, top: number): void;
  /**
   * The Standard look's sign on a side wall - `side` 0 left, 1 right - beside the party's square (`depth` 0) or the one
   * ahead (1): in its runes, running away down the passage as the wall does (framebuffer.ts sideSign).
   */
  sideSign?(text: string, left: number, top: number, side: number, depth: number): void;
  /**
   * From now, what is drawn gives a light of its own (framebuffer.ts shine) - a skeleton's eyes, a field's crackle -
   * which the Standard look's dark shows (darkenUnlit); false, as ever.
   */
  emit?(on: boolean): void;
  /** The Standard look's dark: the box (EGA pixels) of the page being drawn black, but for what gives light of its own. */
  darkenUnlit?(x1: number, y1: number, x2: number, y2: number): void;
  /** Whose dungeon's walls are being drawn (1-8), so the Standard look knows what light is in them. */
  dungeonTint?(dungeon: number): void;
  /**
   * The Standard look's fall (dungeon.ts pitTrap): the box (EGA pixels) shown as it was when the fall began, slid up by
   * `k` of its height, black behind it; null when it is done.
   */
  viewSlide?(x1: number, y1: number, x2: number, y2: number, k: number | null): void;
  /** Bit picture `i` in white. */
  bitImage(res: Uint8Array, i: number, x: number, y: number): void;
  /**
   * A story page's prose (its texts, in order) set the Standard look's way (ui/storyText.ts): in a real font, one
   * block in the page's clearest space, on the page drawn on. False where the look sets it as 1988 did - the EGA look,
   * or the fonts not to hand - and nothing is drawn.
   */
  prose?(texts: string[]): boolean;
  /**
   * The gypsy's question set the Standard look's way on page 0: each answer under its bowl, grey, or white for the
   * one `lit` (0 the left, 1 the right, -1 neither), the question under them. False as for prose.
   */
  choice?(question: string, left: string, right: string, lit: number): boolean;
  /**
   * A figure (an actor's tile, at EGA pixel x, y, fitted by all its frames into a square of `size` EGA pixels, 16 if
   * not given) and a fire's shimmer (a rectangle of EGA pixels) drawn over page 0 as it stood when the first scene was
   * drawn, at `now` (ms); null puts page 0 back as it stood and ends it.
   */
  stage?(
    scene: {
      figure: { tile: number; x: number; y: number; size?: number } | null;
      fire: [number, number, number, number] | null;
      now: number;
    } | null,
  ): void;
  /** Copy a rectangle between pages. */
  transfer(from: number, to: number, x1: number, y1: number, x2: number, y2: number, dx?: number, dy?: number): void;
  /**
   * Copy page 1 to page 0 a pixel at a time in a scattered order; true if a key cut it short. `also`, a second
   * rectangle, dissolves in step with the first, as far through it at every moment. `ms`, how long it takes (else 512
   * pixels a tick, the intro's pace: some three seconds for the view).
   */
  reveal(x1: number, y1: number, x2: number, y2: number, also?: [number, number, number, number], ms?: number): Promise<boolean>;
  /** The Origin logo drawn line by line from page 1; true if a key cut it short. */
  originLogo(): Promise<boolean>;
  /** "Warriors of Destiny" appearing through its mask (the four frames are on page 1). */
  showWD(mask: Uint8Array): Promise<void>;
  /** The next of its four flickering frames. */
  nextWDFrame(): void;
  /** A tile, a rising moongate, a reveal step, at pixel positions (the attract mode's map sits lower). */
  /**
   * `ground` (and `floor` under that) drawn under the tile where the look draws things on a clear ground; `place`
   * where it stands, for a look that draws a square by its place and its neighbours, as a towne's view does.
   */
  tilePx(tile: number, px: number, py: number, ground?: number, floor?: number, place?: Place): void;
  /**
   * A square of the Standard look's grown to `size` EGA pixels a side with its top-left at (px, py), on page 0, drawn
   * as tilePx draws it; only what falls within `clip` (EGA pixels, inclusive) is drawn. Nothing in the PC (1988) look.
   */
  /**
   * The Standard look's figure `tile` grown `scale` times (each of its pixels a square of them), clear about it, put on
   * the clipboard as a PNG: whether it was (not in the PC (1988) look, nor where the clipboard takes no pictures).
   */
  copyFigure?(tile: number, scale: number): Promise<boolean>;
  tileLarge?(
    tile: number,
    px: number,
    py: number,
    size: number,
    clip: [number, number, number, number],
    ground?: number,
    place?: Place,
  ): void;
  moongatePx(rows: number, px: number, py: number): void;
  revealPx(tile: number, px: number, py: number, step: number): void;
}

export interface Sound {
  /** ULTIMA_2192_AudioPulse. */
  pulse(freq: number, delay: number, duration: number, width: number, increment: number): Promise<void>;
  /** ULTIMA_223c_AudioWhiteNoise. */
  noise(rate: number, duration: number, limit: number): Promise<void>;
  /** ULTIMA_22c0_AudioTone. */
  tone(freq: number, duration: number): Promise<void>;
  /** ULTIMA_43ae_AudioSweepTone. */
  sweep(from: number, to: number, step: number, duration: number): Promise<void>;
  /**
   * Background music: one of the Upgrade's tunes (game/music.ts Tune), or 0 to stop - on `occasion`, where it has
   * arrangements of its own there (audio/soundtracks.ts).
   */
  music(tune: number, occasion?: Occasion): void;
  /**
   * One of the ultima3 port's sounds by name (game/cues.ts), where the Standard set gives one the DOS game had
   * not; a moment's wait at most. Absent where there is no such set.
   */
  cue?(name: string): Promise<void>;
  /**
   * How near what the next ambient call sounds is - a waterfall, a fountain, a clock - in squares, squared (frame.ts
   * ambientSound), told just before it; where its level follows it. Absent where nothing does.
   */
  nearby?(d2: number): void;
  /**
   * Hold the sound, or let it go, for one reason: the page away holds everything; a menu over the game (the pause menu,
   * a list of settings) only the music, paused where it is. Each comes back only when nothing holds it: a window that
   * comes back while the pause menu is up leaves the music paused, as the menu does.
   */
  setHeld(reason: Hold, held: boolean): void;
  /** The music heard though a menu holds it (the Music or Music level line under the bar), or held again. */
  hearMusic?(on: boolean): void;
}

/**
 * What holds the sound: the page is away, the pause menu is up, a list of settings (Settings, at the title too), or the
 * harpsichord's keyboard (its notes heard alone).
 */
export type Hold = 'focus' | 'menu' | 'settings' | 'harpsichord';

export interface Platform {
  text: Text;
  draw: Draw;
  fx: Effects;
  sound: Sound;
  /** The tileset effects, one tick (the EGA driver's DRV_60). */
  animateTiles(): void;
  /** Set the clock tile's hands. */
  setClock(hour: number, minute: number): void;
  /** A key if one is waiting, else 0 (ULTIMA_1d5e_PollKey). */
  pollKey(): number;
  /** Wait for a key, calling `idle` about 18 times a second while none comes. */
  waitKey(idle: () => void | Promise<void>): Promise<number>;
  /** Drop waiting keys (ULTIMA_1b16_ClearKbdBuffer). */
  flushKeys(): void;
  /** Wait, keeping the page alive. */
  sleep(ms: number): Promise<void>;
  /** The page's clock, in milliseconds (performance.now); absent where nothing runs in time (the tests' platform). */
  now?(): number;
  /**
   * `draw` done unseen, `shown` standing for each frame it would show: what a first showing costs (a picture's
   * restyling, a shape of the frame's copper) paid now rather than as the frame comes. Both pages blank after.
   */
  unseen?(draw: (shown: () => void) => void): void;
}
