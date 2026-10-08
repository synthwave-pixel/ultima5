import { describe, expect, it } from 'vitest';
import { processCommand } from '../src/game/commands.ts';
import { K, Pad } from '../src/game/io.ts';
import { castCommand, useCommand } from '../src/game/magic.ts';
import { Status } from '../src/game/save.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/**
 * A command backed out of at its own prompt spends nothing (the port's): no turn, and not the thing it would have
 * used - a potion given to nobody, a scroll or a Skull Key whose way is passed, a spell whose phase is not given.
 */
describe('backing out, on a controller', () => {
  const player = () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0; // Britannia, out of doors
    g.s.potions.fill(0);
    g.s.scrolls.fill(0);
    g.s.skullKeys = 0;
    return { g, p };
  };
  /** Use: the item whose line begins `item`, then B at whatever it asks; what the Items list offered. */
  const useThenB = async (g: ReturnType<typeof newGame>['g'], p: ReturnType<typeof newGame>['p'], item: string): Promise<void> => {
    let chosen = false;
    let calls = 0;
    p.next = () => {
      if (++calls > 200) throw new Error(`looping: ${g.menuShown?.title ?? 'no menu'} ${p.log.slice(-160)}`);
      const m = g.menuShown;
      if (m?.title === 'Items' && !chosen) {
        const at = m.labels.findIndex((l) => l.startsWith(item));
        if (at < 0) throw new Error(`no ${item} in ${m.labels.join(', ')}`);
        if (m.at === at) chosen = true;
        return m.at === at ? Pad.A : m.at < at ? K.Down : K.Up;
      }
      return Pad.B;
    };
    await useCommand(g);
    expect(chosen).toBe(true);
  };

  it('keeps a potion given to nobody (B at "On who")', async () => {
    const { g, p } = player();
    g.s.potions[1] = 1; // yellow, heal: Shamino is hurt, so it is to be had from the list
    await useThenB(g, p, 'Potion');
    expect(g.s.potions[1]).toBe(1);
    expect(g.cancelled).toBe(true);
  });

  it('keeps a Resurrection scroll read on nobody, and a Wind Change scroll whose way is passed with B', async () => {
    for (const n of [6, 1]) {
      const { g, p } = player();
      g.s.scrolls[n] = 1;
      g.s.members[2].status = Status.Dead; // someone to raise, so the Resurrection scroll is to be had
      await useThenB(g, p, 'Scroll');
      expect(g.s.scrolls[n], `scroll ${n}`).toBe(1);
      expect(g.cancelled, `scroll ${n}`).toBe(true);
    }
  });

  it('keeps a Skull Key whose way is passed, and bursts nothing on the party', async () => {
    const { g, p } = player();
    g.s.skullKeys = 1;
    setTileAt(g, g.s.x + 1, g.s.y, 0x97); // a magically locked door beside the party
    await useThenB(g, p, 'Skull');
    expect(g.s.skullKeys).toBe(1);
    expect(p.log).not.toMatch(/Failed/);
  });

  it('passes a spell\'s "Direction-" with B, as every other direction asked', async () => {
    const { g, p } = player();
    g.s.scrolls[1] = 1;
    await useThenB(g, p, 'Scroll');
    expect(p.log).toMatch(/Pass/);
  });

  it("gives back Gate Travel's mixture and magic when no phase is given (B at the dial), which offers only 1 to 8", async () => {
    const { g, p } = player();
    const s = g.s;
    const me = s.members[0];
    [me.level, me.mp] = [8, 20];
    s.mixtures[0x2e] = 1;
    g.castPreset = { caster: 0, spell: 0x2e };
    let most = 0;
    p.next = () => {
      const m = g.menuShown;
      // The dial, run up as far as it goes: its last number, then B.
      if (m?.title && most === 0) {
        for (let i = 0; i < 12; i++) p.keys.push(K.Up);
        most = -1;
        return K.Up;
      }
      return Pad.B;
    };
    await castCommand(g);
    expect(s.mixtures[0x2e]).toBe(1);
    expect(me.mp).toBe(20);
    expect(p.log).not.toMatch(/Failed/);
  });

  it('forgets a spell chosen from the menu that the command never came to cast', async () => {
    const { g, p } = player();
    g.castPreset = { caster: 1, spell: 0 };
    p.keys.push(Pad.B);
    await processCommand(g, K.Space); // a pass: no Cast at all
    expect(g.castPreset).toBeNull();
  });
});

describe('a command backed out of spends no turn, on a controller', () => {
  it('Yell, nothing said (B at the words)', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0;
    p.next = () => Pad.B;
    expect(await processCommand(g, 0x59)).toBe(0);
    expect(p.log).toMatch(/Nothing/);
  });

  it('Hole up, no hours dialled (B at the dial)', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0;
    g.s.actors[0].anim = 0x1c; // the party on foot, as a camp needs
    p.next = () => Pad.B;
    expect(await processCommand(g, 0x48)).toBe(0);
    expect(p.log).not.toMatch(/On foot|On land/);
  });
});
