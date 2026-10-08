import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/** A shop's lettered question, by controller: its choices by their own names (input.ts getLetter's labels). */
async function choices(kind: number, mapId: number): Promise<string[]> {
  const { g, p } = newGame();
  journeyOnward(g);
  g.options.input = 'controller';
  g.s.mapId = mapId;
  let seen: string[] = [];
  p.next = () => {
    const m = g.menuShown;
    if (m?.title === 'Choose' && !seen.length) {
      seen = [...m.labels];
      return Pad.B;
    }
    return seen.length ? Pad.B : Pad.A;
  };
  await merchant(g, kind).catch(() => undefined);
  return seen;
}

describe("a shop's question by controller", () => {
  it("offers the healer's arts by name, not the healer's own, each with its price", async () => {
    const arts = await choices(0x87, 30);
    expect(arts).toHaveLength(3);
    expect(arts[0]).toMatch(/^Cure poison \(\d+gp\)$/);
    expect(arts[1]).toMatch(/^Heal \(\d+gp\)$/);
    expect(arts[2]).toMatch(/^Resurrect \(\d+gp\)$/);
    // Minoc's healer cures and heals free, with the Light; raising the dead is paid for there too.
    const minoc = await choices(0x87, 5);
    expect(minoc.slice(0, 2)).toEqual(['Cure poison (free)', 'Heal (free)']);
    expect(minoc[2]).toMatch(/^Resurrect \(\d+gp\)$/);
  });

  it('offers the armoury buying and selling', async () => {
    const { g } = newGame();
    expect(await choices(0x81, g.data.bytes(0x23ca, 16)[0])).toEqual(['Buy', 'Sell']);
  });
});
