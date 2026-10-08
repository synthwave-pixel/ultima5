import { describe, expect, it } from 'vitest';
import { thingKey } from '../src/game/game.ts';
import { enterWorld } from '../src/game/outdoors.ts';
import { updateFrame } from '../src/game/frame.ts';
import { Colour } from '../src/ui/colours.ts';
import { newGame } from './helpers.ts';

/**
 * A chest's badge (world.ts drawReadings): what its search said, in its top-right corner, the party's reading
 * that the next bump goes by (bumpAct.ts).
 */
describe("a chest's badge", () => {
  /** The world outside Britain, a chest east of the party; the pixels the view puts down, by colour. */
  const scene = () => {
    const { g } = newGame();
    const s = g.s;
    [s.mapId, s.level, s.x, s.y, s.hour] = [0, 0, 82, 106, 12];
    enterWorld(g);
    for (let i = 1; i < 0x20; i++) s.actors[i].tile = 0;
    Object.assign(s.actors[5], { tile: 0x01, anim: 0x01, x: s.x + 1, y: s.y, z: 0, b5: 0x81 });
    const drawn = (): Map<number, Set<string>> => {
      const px = new Map<number, Set<string>>();
      const d = g.draw;
      const put = (x: number, y: number): void => {
        if (!px.has(d.pen)) px.set(d.pen, new Set());
        px.get(d.pen)!.add(`${x},${y}`);
      };
      d.plot = put;
      d.fill = (x1, y1, x2, y2) => {
        for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) put(x, y);
      };
      updateFrame(g);
      return px;
    };
    return { g, s, drawn };
  };
  // The chest's square is view cell (6, 5): its top-right corner at pixels (113..119, 88..94).
  const corner = (x: number, y: number): boolean => x >= 113 && x <= 119 && y >= 88 && y <= 94;

  it('is none on a chest not searched', () => {
    const { drawn } = scene();
    for (const [, at] of drawn()) for (const p of at) expect(corner(...(p.split(',').map(Number) as [number, number]))).toBe(false);
  });

  it('is a red "!" where a trap was read, a green tick where none, a blue tick once disarmed', () => {
    const { g, s, drawn } = scene();
    const key = thingKey(g, s.x + 1, s.y);
    for (const [reading, colour] of [
      ['trap', Colour.red],
      ['clean', Colour.green],
      ['disarmed', Colour.blue],
    ] as const) {
      g.bumped.set(key, reading);
      const px = drawn();
      expect(
        [...(px.get(colour) ?? [])].some((p) => corner(...(p.split(',').map(Number) as [number, number]))),
        reading,
      ).toBe(true);
      // The glyph, in white: the "!" a column, the tick a diagonal.
      const white = [...(px.get(Colour.brightWhite) ?? [])].filter((p) => corner(...(p.split(',').map(Number) as [number, number])));
      expect(white.length, reading).toBe(reading === 'trap' ? 4 : 5);
    }
    // A search begun and backed out of has no reading: no badge.
    g.bumped.set(key, 'searched');
    const px = drawn();
    expect(
      [...(px.get(Colour.red) ?? []), ...(px.get(Colour.green) ?? [])].some((p) =>
        corner(...(p.split(',').map(Number) as [number, number])),
      ),
    ).toBe(false);
  });
});
