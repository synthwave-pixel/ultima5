/**
 * appearanceMenu.ts
 *
 * The Appearance screen (the port's own): the Avatar's figure, skin, hair and clothes chosen from a boxed list, each
 * row's value turned by left and right, and shown as it changes in the bedroom of the title's first scene - the
 * Avatar standing below its mirror, and the mirror giving the new look back - and beside the menu, the figure again,
 * large and walking, for its detail.
 */

import { readBritannia, tileAt } from '../data/maps.ts';
import { addressedAsLady, type Appearance, FIGURES, HAIR, HUES, randomAppearance, SKIN } from './appearance.ts';
import type { Game } from './game.ts';
import { asPad } from './input.ts';
import { drawScene, SCENE_MAP, titleBanner, VIEW_SCENE } from './intro.ts';
import { K, Pad } from './io.ts';
import { box, framedBox, menuSound } from './menu.ts';
import { T } from './tiles.ts';
import { groundAmong, isGround } from './world.ts';

/** The scene of the title's MISCMAPS.DAT the Avatar is shown in: its first, a bedroom with a mirror. */
export const SCENE_ROOM = 0;
/** The mirror's square in that scene; the Avatar stands on the square below it. */
export const MIRROR_SQUARE: readonly [number, number] = [9, 1];
const AVATAR_SQUARE: readonly [number, number] = [MIRROR_SQUARE[0], MIRROR_SQUARE[1] + 1];

/** The mirror as it reflects someone standing before it (world.ts T.Mirror9E). */
const MIRROR_REFLECTING = 0x9e;
/** The walking Avatar's first frame, less the actors' 0x100: the figure chosen is drawn in its place (Draw.avatar). */
const AVATAR_ACTOR = 0x4c;

/**
 * The figure again, large and walking, beside the menu's box (EGA pixels): a square of LARGE_SIZE, three tiles' width,
 * in the middle of the band to the right of the box's frame (which runs from x 64 to 247 and y 8 to 95, the box being
 * WIDTH characters wide, centred, in text rows 2 to 10) - clear of the frame and of the room below it (from y 0x80).
 */
const LARGE_SIZE = 48;
export const LARGE_AT: readonly [number, number] = [248 + ((320 - 248 - LARGE_SIZE) >> 1), 8 + ((96 - 8 - LARGE_SIZE) >> 1)];

/**
 * Behind the menu, the world as the Avatar would walk it: Britannia's squares grown to the large figure's size, across
 * the screen above the room's frame (ABOVE, EGA pixels), laid so the figure stands on WORLD_SQUARE - grass between the
 * sea to the west and a wood to the south - each drawn as the map in play draws it, from the squares about it.
 */
export const WORLD_SQUARE: readonly [number, number] = [50, 17];
export const ABOVE: [number, number, number, number] = [0, 0, 319, VIEW_SCENE[1] - 9];

function drawWorld(g: Game): void {
  const fx = g.p.fx;
  if (!fx.tileLarge) return;
  const brit = readBritannia(g.data.files, g.data.ovl);
  const at = (x: number, y: number): number => tileAt(brit, x & 0xff, y & 0xff);
  const [wx, wy] = WORLD_SQUARE;
  const [lx, ly] = LARGE_AT;
  g.draw.pen = 0;
  g.draw.fill(...ABOVE);
  for (let dy = -Math.ceil(ly / LARGE_SIZE); ly + dy * LARGE_SIZE <= ABOVE[3]; dy++)
    for (let dx = -Math.ceil(lx / LARGE_SIZE); lx + dx * LARGE_SIZE <= ABOVE[2]; dx++) {
      const [x, y] = [(wx + dx) & 0xff, (wy + dy) & 0xff];
      const t = at(x, y);
      const around = new Uint8Array(25);
      for (let ey = -2; ey <= 2; ey++) for (let ex = -2; ex <= 2; ex++) around[(ey + 2) * 5 + ex + 2] = at(x + ex, y + ey);
      // A thing that stands (a tree, a sign) on the ground round it, as the view gives it.
      const ground = isGround(t) ? undefined : g.cycles.shown[groundAmong(t, (ex, ey) => at(x + ex, y + ey), T.Grass)];
      fx.tileLarge(g.cycles.shown[t], lx + dx * LARGE_SIZE, ly + dy * LARGE_SIZE, LARGE_SIZE, ABOVE, ground, { map: 0, x, y, around });
    }
}

/** The clothes' hues by name, as HUES has them after the default (0 to 330 degrees, thirty apart). */
const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'jade', 'teal', 'azure', 'blue', 'violet', 'magenta', 'rose'];

/** A row that has a value: its label, the appearance's field, and the value's name. */
interface ValueRow {
  label: string;
  field: keyof Appearance;
  count: number;
  name: (v: number) => string;
}

const hueName = (v: number): string => {
  const h = HUES[v];
  return h === null ? 'default' : typeof h === 'string' ? h : HUE_NAMES[h / 30];
};

export const VALUES: readonly ValueRow[] = [
  { label: 'Figure', field: 'figure', count: FIGURES.length, name: (v) => FIGURES[v].name },
  { label: 'Skin', field: 'skin', count: SKIN.length, name: (v) => `${v + 1} of ${SKIN.length}` },
  { label: 'Hair', field: 'hair', count: HAIR.length, name: (v) => HAIR[v].name },
  { label: 'Clothes', field: 'main', count: HUES.length, name: hueName },
  { label: 'Trim', field: 'trim', count: HUES.length, name: hueName },
];
const COPY_LABEL = 'Copy to clipboard';

/** The rows of a screen with `values` - each a value's, then Surprise me, Copy to clipboard and Done - by their place. */
function rowsFor(values: readonly ValueRow[]): {
  values: readonly ValueRow[];
  surprise: number;
  copy: number;
  done: number;
  count: number;
} {
  const surprise = values.length;
  return { values, surprise, copy: surprise + 1, done: surprise + 2, count: surprise + 3 };
}

/** The box's width in characters: a label's column, then the value between its arrows. */
const WIDTH = 21;
/** Where the value's left arrow stands, and how wide the value between the arrows is. */
const FIELD = 8;
export const VALUE_WIDTH = WIDTH - FIELD - 2;

/** One row's text, `WIDTH` long, of the screen laid out as `rows`; `copy`, what the copying row says. */
function rowText(look: Appearance, r: number, copy: string, rows: ReturnType<typeof rowsFor>): string {
  if (r === rows.surprise) return centred('Surprise me', WIDTH);
  // Its arrows the pose's: the one to copy, chosen with left and right.
  if (r === rows.copy) return '\x1b' + centred(copy, WIDTH - 2) + '\x1a';
  if (r === rows.done) return centred('Done', WIDTH);
  const row = rows.values[r];
  // The arrows are the font's own (0x1b and 0x1a), as the frame's marks use them.
  return row.label.padEnd(FIELD) + '\x1b' + centred(row.name(look[row.field]), VALUE_WIDTH) + '\x1a';
}

function centred(s: string, width: number): string {
  const left = (width - s.length) >> 1;
  return (' '.repeat(Math.max(0, left)) + s).padEnd(width);
}

/**
 * The Appearance screen, from `start`: the appearance chosen (Done), or null (B, to go back a step: at creation, to
 * how the Avatar is addressed; at a mirror, the appearance as it was). Up and down move the bar, and
 * wrap; left and right turn the row's value round, as A does; A on Surprise me rolls one at random. On Copy to
 * clipboard the figure stands still, left and right turn it through the four steps of its walk, and A puts the large
 * figure in the step shown on the clipboard (a PNG, clear about it), saying so on the row until the next key; it walks
 * on when the bar leaves the row.
 *
 * For a companion at a mirror (`who`, companions.ts), the same screen under their name, their trade's figure in the
 * Avatar's place: their colours only - no Figure row, the trade and the sex being theirs - Surprise me keeping the
 * figure. The Avatar is drawn as the player made them again after, whatever is chosen.
 */
export async function chooseAppearance(
  g: Game,
  start: Appearance,
  who?: { name: string; base: number; lady: boolean },
): Promise<Appearance | null> {
  const t = g.text;
  const was = t.current;
  const back = g.p.fx.keepScreen?.();
  const look: Appearance = { ...start };
  const rows = rowsFor(who ? VALUES.filter((v) => v.field !== 'figure') : VALUES);
  const title = who ? who.name : 'Appearance';
  let at = 0;
  // The room: its squares (copy), and the same with the mirror reflecting and the Avatar on the square below it,
  // someone standing as the attract mode keeps them (a 0 square, their figure 0x80 on).
  const room = g.data.files.get('MISCMAPS.DAT').subarray(0x2c0 + SCENE_ROOM * 0x80);
  const copy = new Uint8Array(0x100);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 0x13; x++) copy[y * 32 + x] = room[x + y * 0x20];
  const map = copy.slice();
  const [mx, my] = MIRROR_SQUARE;
  const [ax, ay] = AVATAR_SQUARE;
  map[my * 32 + mx] = MIRROR_REFLECTING;
  map[ay * 32 + ax] = 0;
  let step = 0;
  let pass = 0;
  let copyNote = COPY_LABEL;
  const drawRoom = (): void => {
    map[ay * 32 + ax + 0x80] = AVATAR_ACTOR + (step & 3);
    // The Avatar is the one before the mirror here, so it gives him back as he is being made.
    g.draw.leader?.({ map: SCENE_MAP, x: ax, y: ay });
    drawScene(g, map, copy);
    // And beside the menu, large, in the same step of his walk, out in the world drawn behind the menu (drawWorld).
    const [lx, ly] = LARGE_AT;
    g.p.fx.stage?.({
      figure: { tile: 0x100 + AVATAR_ACTOR + (step & 3), x: lx, y: ly, size: LARGE_SIZE },
      fire: null,
      now: 0,
    });
  };
  const put = (r: number): void => {
    const text = rowText(look, r, copyNote, rows);
    const advance = t.advance;
    t.advance = false;
    t.inverse = r === at;
    for (let i = 0; i < text.length; i++) {
      t.moveTo(i, r + 2);
      t.printChar(text.charCodeAt(i));
    }
    t.inverse = false;
    t.advance = advance;
  };
  const draw = (): void => {
    for (let r = 0; r < rows.count; r++) put(r);
    // What the menu shows, for whoever watches the screen's menus (as choose gives it).
    g.menuShown = {
      title,
      labels: Array.from({ length: rows.count }, (_, r) => rowText(look, r, copyNote, rows).trim()),
      enabled: Array<boolean>(rows.count).fill(true),
      dim: Array<boolean>(rows.count).fill(false),
      at,
    };
  };
  const changed = (): void => {
    if (who) g.draw.avatar?.(look, who.lady, who.base);
    else g.draw.avatar?.(look, addressedAsLady(g));
    drawRoom();
  };
  // The Avatar walks on the spot, a step every fourth pass, as the Standard look's figures do - but for the step being
  // chosen to copy.
  const idle = (): void => {
    if (at === rows.copy || ++pass % 4 !== 0) return;
    step++;
    drawRoom();
  };
  // In play the screen is laid out as at the title: the game's screen cleared and its frame's copper let go (the
  // party's marks with it), the menu in the title's frame across the top - text rows 2 to 10 - and the room below.
  // Its own way of laying a box out, not the map's square the in-play boxes sit in, which the room would cover.
  if (g.inPlay) {
    g.draw.chrome?.(false);
    g.draw.pen = 0;
    g.draw.fill(0, 0, 319, 199);
  }
  // The world first, the menu's box over it (the stage keeps the screen as it stands then, the figure's ground).
  drawWorld(g);
  g.draw.chromeHole?.(VIEW_SCENE);
  if (g.inPlay) framedBox(g, title, WIDTH, rows.count);
  else {
    box(g, title, WIDTH, rows.count);
    // At the title, the room's name in the border under it, as each scene's is (in play the screen has no border).
    const was = g.text.current;
    g.text.select(0);
    titleBanner(g, 'The Mirror');
    g.text.select(was);
  }
  changed();
  let result: Appearance | null = null;
  try {
    for (;;) {
      draw();
      const k = asPad(g, await g.p.waitKey(idle));
      copyNote = COPY_LABEL;
      if (k === K.Up || k === K.Down) {
        at = (at + (k === K.Up ? rows.count - 1 : 1)) % rows.count;
        menuSound(g, 'move');
      } else if (at < rows.surprise && (k === K.Left || k === K.Right || k === Pad.A || k === K.Enter)) {
        const row = rows.values[at];
        look[row.field] = (look[row.field] + (k === K.Left ? row.count - 1 : 1)) % row.count;
        menuSound(g, 'move');
        changed();
      } else if (at === rows.surprise && (k === Pad.A || k === K.Enter)) {
        // By a roll of its own, not the game's dice, which the actors and the fights share (as the party's walk is). A
        // companion's figure is their trade's, kept.
        const figure = look.figure;
        Object.assign(
          look,
          randomAppearance((lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))),
          who ? { figure } : {},
        );
        menuSound(g, 'move');
        changed();
      } else if (at === rows.copy && (k === K.Left || k === K.Right)) {
        step = (step + (k === K.Left ? 3 : 1)) & 3;
        menuSound(g, 'move');
        drawRoom();
      } else if (at === rows.copy && (k === Pad.A || k === K.Enter)) {
        const copied = (await g.p.fx.copyFigure?.(0x100 + AVATAR_ACTOR + (step & 3), LARGE_SIZE / 16)) ?? false;
        copyNote = copied ? 'Copied!' : 'Cannot copy here';
        menuSound(g, copied ? 'move' : 'back');
      } else if (at === rows.done && (k === Pad.A || k === K.Enter)) {
        result = look;
        break;
      } else if (k === Pad.B || k === K.Escape || k === K.Space) {
        menuSound(g, 'back');
        break;
      }
    }
  } finally {
    // Given up: the Avatar drawn as it was - and after a companion's, always: the Avatar's place is the Avatar's again.
    if (who) g.draw.avatar?.(g.appearance, addressedAsLady(g));
    else if (!result) g.draw.avatar?.(start, addressedAsLady(g));
    g.menuShown = null;
    g.draw.chromeHole?.(null);
    g.p.fx.stage?.(null);
    g.draw.leader?.(null);
    back?.();
    // In play, the game's screen is themed as it was (the frame's copper, the party's marks) and its picture is back.
    if (g.inPlay) g.draw.chrome?.(true);
    t.select(was);
  }
  return result;
}
