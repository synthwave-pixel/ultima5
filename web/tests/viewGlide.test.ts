import { describe, expect, it } from 'vitest';
import type { ViewCell, ViewDrawn } from '../src/game/io.ts';
import { EGA_RGBA, Framebuffer, HI, HI_HEIGHT, HI_WIDTH, TILE_X, TILE_Y } from '../src/ui/framebuffer.ts';
import { ViewGlide } from '../src/ui/viewGlide.ts';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];
/** Tiles of one colour each: ground green (1), a walker red (2), the party brown (3), a marker blue (4). */
const [GROUND, WALKER, PARTY, MARKER] = [1, 2, 3, 4];
const tiles = new Uint8Array(512 * 128);
tiles.fill(0x22, GROUND * 128, GROUND * 128 + 128);
tiles.fill(0x44, WALKER * 128, WALKER * 128 + 128);
tiles.fill(0x66, PARTY * 128, PARTY * 128 + 128);
tiles.fill(0x11, MARKER * 128, MARKER * 128 + 128);
const CELL = 16 * HI;

/**
 * A view drawn as world.ts drawView draws one: ground everywhere, the marker on map square `marker`, the party in the
 * middle, a walker on view square `walker`; and what it says of its squares.
 */
function draw(fb: Framebuffer, origin: { x: number; y: number }, walker: [number, number], marker: [number, number]): ViewDrawn {
  const cells: ViewCell[] = [];
  const bare = { tile: GROUND, ground: undefined, place: undefined };
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 11; x++) {
      const mapped = origin.x + x === marker[0] && origin.y + y === marker[1];
      fb.tile(mapped ? MARKER : GROUND, TILE_X + x * 16, TILE_Y + y * 16);
    }
  fb.tile(WALKER, TILE_X + walker[0] * 16, TILE_Y + walker[1] * 16);
  fb.tile(PARTY, TILE_X + 5 * 16, TILE_Y + 5 * 16);
  cells[walker[1] * 11 + walker[0]] = { mover: 'a5', bare };
  cells[5 * 11 + 5] = { party: true, bare };
  return { scene: 'town', origin, wrap: 0, cells, covered: false };
}

/** The colour shown at (x, y) of the view's own pixels, `out` painted at `now`. */
function shown(vg: ViewGlide, now: number, x: number, y: number): number {
  const out = new Uint32Array(HI_WIDTH * HI_HEIGHT);
  vg.paint(now, out);
  return out[(TILE_Y * HI + y) * HI_WIDTH + TILE_X * HI + x];
}

describe('Smooth motion over the view (viewGlide.ts)', () => {
  it('glides a walker from its square to the next, its old square bare beneath', () => {
    const fb = new Framebuffer(tiles, fonts);
    const vg = new ViewGlide(fb, () => 150);
    vg.drawn(draw(fb, { x: 10, y: 10 }, [3, 3], [0, 0]), 0);
    expect(vg.moving(0)).toBe(false);
    vg.drawn(draw(fb, { x: 10, y: 10 }, [4, 3], [0, 0]), 0);
    expect(vg.moving(1000)).toBe(true);
    const half = 1000 + 85;
    // Halfway: the walker across the line between the squares, the ground where it is not.
    expect(shown(vg, half, 3 * CELL + CELL / 2 + 4, 3 * CELL + 8)).toBe(EGA_RGBA[4]);
    expect(shown(vg, half, 4 * CELL + 4, 3 * CELL + 8)).toBe(EGA_RGBA[4]);
    expect(shown(vg, half, 3 * CELL + 4, 3 * CELL + 8)).toBe(EGA_RGBA[2]);
    expect(shown(vg, half, 4 * CELL + CELL - 4, 3 * CELL + 8)).toBe(EGA_RGBA[2]);
    expect(vg.moving(1000 + 170)).toBe(false);
  });

  it('slides the map under the party, which stays in the middle, the edge that leaves kept from the last view', () => {
    const fb = new Framebuffer(tiles, fonts);
    const vg = new ViewGlide(fb, () => 150);
    // The marker on the view's left edge; the party steps east, so it leaves the view.
    vg.drawn(draw(fb, { x: 10, y: 10 }, [8, 8], [10, 12]), 0);
    vg.moving(0);
    vg.drawn(draw(fb, { x: 11, y: 10 }, [7, 8], [10, 12]), 0);
    expect(vg.moving(1000)).toBe(true);
    const half = 1000 + 85;
    // The party where it always is.
    expect(shown(vg, half, 5 * CELL + 8, 5 * CELL + 8)).toBe(EGA_RGBA[6]);
    expect(shown(vg, half, 5 * CELL + CELL - 8, 5 * CELL + 8)).toBe(EGA_RGBA[6]);
    // The marker, gone from the new view, half slid out at the left edge.
    expect(shown(vg, half, 8, 2 * CELL + 8)).toBe(EGA_RGBA[1]);
    expect(shown(vg, half, CELL / 2 + 8, 2 * CELL + 8)).toBe(EGA_RGBA[2]);
    // The walker stood still on the map: it slides with it.
    expect(shown(vg, half, 7 * CELL + CELL / 2 + 8, 8 * CELL + 8)).toBe(EGA_RGBA[4]);
  });

  it("hides a fight's marks while anything moves, none taken along by one walking beside them", () => {
    const fb = new Framebuffer(tiles, fonts);
    const vg = new ViewGlide(fb, () => 150);
    const bare = { tile: GROUND, ground: undefined, place: undefined };
    /** A field: member a1 walking at `a`, member a2 still at (5, 5), whose turn it is, boxed - over the squares round. */
    const field = (a: [number, number]): ViewDrawn => {
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) fb.tile(GROUND, TILE_X + x * 16, TILE_Y + y * 16);
      fb.tile(WALKER, TILE_X + a[0] * 16, TILE_Y + a[1] * 16);
      fb.tile(PARTY, TILE_X + 5 * 16, TILE_Y + 5 * 16);
      vg.marks(0);
      const [x1, y1, x2, y2] = [TILE_X + 78, TILE_Y + 78, TILE_X + 97, TILE_Y + 97];
      for (const [l, t, r, b] of [
        [x1, y1, x2, y1],
        [x1, y2, x2, y2],
        [x1, y1, x1, y2],
        [x2, y1, x2, y2],
      ])
        fb.fill(l, t, r, b, 15);
      const cells: ViewCell[] = [];
      cells[a[1] * 11 + a[0]] = { mover: 'a1', bare };
      cells[5 * 11 + 5] = { mover: 'a2', bare };
      return { scene: 'fight', origin: null, wrap: 0, cells, covered: false };
    };
    // Diagonal to the one boxed, then beside them: into the square the box's left edge lies over.
    vg.drawn(field([4, 4]), 0);
    vg.moving(0);
    vg.drawn(field([4, 5]), 0);
    expect(vg.moving(1000)).toBe(true);
    const half = 1000 + 85;
    // No box: where its left edge lies, the walker gliding there, and no piece of it gone up with them.
    expect(shown(vg, half, 78 * HI + 1, 5 * CELL + 20)).toBe(EGA_RGBA[4]);
    expect(shown(vg, half, 78 * HI + 1, 5 * CELL - 20)).toBe(EGA_RGBA[4]);
    // Nor its top edge, over the square the walker left: the ground.
    expect(shown(vg, half, 5 * CELL + 8, 78 * HI + 1)).toBe(EGA_RGBA[2]);
  });

  it('settles at once when anything else is drawn over the view, and takes no box-covered view', () => {
    const fb = new Framebuffer(tiles, fonts);
    const vg = new ViewGlide(fb, () => 150);
    vg.drawn(draw(fb, { x: 10, y: 10 }, [3, 3], [0, 0]), 0);
    vg.moving(0);
    vg.drawn(draw(fb, { x: 10, y: 10 }, [4, 3], [0, 0]), 0);
    expect(vg.moving(1000)).toBe(true);
    vg.settle();
    expect(vg.moving(1001)).toBe(false);
    vg.drawn({ ...draw(fb, { x: 10, y: 10 }, [5, 3], [0, 0]), covered: true }, 0);
    expect(vg.moving(2000)).toBe(false);
  });
});
