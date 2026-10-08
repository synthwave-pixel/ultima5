/**
 * rng.ts
 *
 * The game's random numbers. In play, the browser's own (TrueRandom); the tests put in a mock of their own
 * (tests/mockRandom.ts), its numbers seeded or set.
 *
 * Not the DOS game's generator (u5d 2000.c ULTIMA_2092_RandomRange: add 0x9248, rotate right 3, xor 0x9248, add
 * 0x11, on 16 bits), which ran in loops - some 40 or 82 numbers long - and tied each number to the one before: a
 * random square of a fight could only ever be 63 of its 121. DosRandom keeps it for the one place the game wants the
 * same numbers each time, the felling of a blighted towne's trees each day (town.ts).
 */

/** Random numbers, as the game asks for them. */
export interface Random {
  /** An integer in [low, high] inclusive. */
  range(low: number, high: number): number;
  /** ULTIMA_3aae_Random: [0, n]. */
  upTo(n: number): number;
}

/** The browser's random numbers: the game's in play. */
export class TrueRandom implements Random {
  range(low: number, high: number): number {
    return low + Math.floor(Math.random() * (high - low + 1));
  }

  upTo(n: number): number {
    return this.range(0, n);
  }
}

/** The DOS game's generator, from `seed`: the same numbers each time. */
export class DosRandom implements Random {
  constructor(public seed: number) {}

  range(low: number, high: number): number {
    let ax = (this.seed + 0x9248) & 0xffff;
    ax = ((ax >>> 3) | (ax << 13)) & 0xffff;
    ax ^= 0x9248;
    ax = (ax + 0x11) & 0xffff;
    this.seed = ax;
    return ((ax & 0x7fff) % (high - low + 1)) + low;
  }

  upTo(n: number): number {
    return this.range(0, n);
  }
}
