import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { InTwos } from '../src/ui/inTwos.ts';

const PACE = 150;

/** What reaches the game from `presses` ([key, held, ms]), on a ship (`on`) or not. */
function through(presses: [number, boolean, number][], on = true): number[] {
  const twos = new InTwos(
    () => on,
    () => PACE,
  );
  return presses.map(([k, held, ms]) => twos.take(k, held, ms));
}

/** Two ways held in turn, a pace apart, as the d-pad's pair or two arrow keys held send them: the first pressed. */
const inTurn = (a: number, b: number, n: number): [number, boolean, number][] =>
  Array.from({ length: n }, (_, i) => [i % 2 ? b : a, i > 0, i * PACE] as [number, boolean, number]);

/**
 * Issue #40: on a ship, two ways held - up and right on the d-pad, or two arrow keys - went in turn, and the ship
 * turned at every one, a turn spending the move: "Head North", "Head East", and nowhere. On a ship they go two at a
 * time - turn, sail, turn, sail - every other step a step on.
 */
describe('two ways held on a ship go two at a time', () => {
  it('turns, then sails, then turns the other way and sails: up and right held', () => {
    expect(through(inTurn(K.Up, K.Right, 8))).toEqual([K.Up, K.Up, K.Right, K.Right, K.Up, K.Up, K.Right, K.Right]);
  });

  it('does the same for two arrow keys held, each repeating on its own after both were pressed', () => {
    const keys: [number, boolean, number][] = [
      [K.Up, false, 0],
      [K.Right, false, 50], // pressed: the ship turns east at once
      [K.Up, true, 400],
      [K.Right, true, 450],
      [K.Up, true, 550],
      [K.Right, true, 600],
      [K.Up, true, 700],
    ];
    expect(through(keys)).toEqual([K.Up, K.Right, K.Right, K.Up, K.Up, K.Right, K.Right]);
  });

  it('sails on one way held alone, the other let go', () => {
    const keys: [number, boolean, number][] = [...inTurn(K.Up, K.Right, 4), [K.Up, true, 600], [K.Up, true, 750], [K.Up, true, 900]];
    expect(through(keys)).toEqual([K.Up, K.Up, K.Right, K.Right, K.Up, K.Up, K.Up]);
  });

  it('leaves every press as pressed, and keys that are no way alone', () => {
    expect(
      through([
        [K.Up, false, 0],
        [K.Right, false, 10],
        [K.Left, false, 20],
      ]),
    ).toEqual([K.Up, K.Right, K.Left]);
    expect(
      through([
        [K.Up, false, 0],
        [0x20, true, 150],
        [K.Right, true, 300],
      ]),
    ).toEqual([K.Up, 0x20, K.Up]);
  });

  it('leaves them in turn off a ship: on foot, a horse or the rowing boat turns without spending the move', () => {
    expect(through(inTurn(K.Up, K.Right, 6), false)).toEqual([K.Up, K.Right, K.Up, K.Right, K.Up, K.Right]);
  });
});

describe('aboard a ship (Game.aboardShip)', () => {
  it('is a ship on the world map, with sails or without - not the rowing boat, nor a ship in port', async () => {
    const { newGame } = await import('./helpers.ts');
    const { g } = newGame();
    g.s.mapId = 0;
    for (const [tile, ship] of [
      [0x20, true],
      [0x23, true],
      [0x24, true],
      [0x27, true],
      [0x28, false],
      [0x10, false],
    ] as const) {
      g.s.partyTile = tile;
      expect(g.aboardShip, tile.toString(16)).toBe(ship);
    }
    g.s.partyTile = 0x20;
    g.s.mapId = 2;
    expect(g.aboardShip).toBe(false);
  });
});
