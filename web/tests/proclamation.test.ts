import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { endingPages } from '../src/game/story.ts';
import { newGame } from './helpers.ts';

describe('the proclamation', () => {
  it('is left on its scroll: the map is not drawn again over it while it waits', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.s.drawMap = 1; // as it is at the end, the party having walked a map to get there
    let proclaimed = false;
    let drawnOver = 0;
    // drawView (world.ts) says where the leader stands each time it draws the map.
    g.draw.leader = (at) => {
      if (/Be it known/i.test(p.log)) drawnOver++;
      void at;
    };
    p.next = () => {
      if (/Origin Systems!/.test(p.log)) {
        proclaimed = true;
        return undefined; // the key that would go back to the title: the test ends here
      }
      return K.Enter;
    };
    await endingPages(g).catch((e: unknown) => {
      if (!/ran out of keys/.test(String(e))) throw e;
    });
    expect(proclaimed).toBe(true);
    expect(drawnOver).toBe(0);
  });

  it('its pages read back with Left, from a page to the one before, and no further than the first', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    // Each page as it is put on the screen: the last picture drawn before the whole page is copied there.
    let pic = '';
    const shown: string[] = [];
    p.fx.image = (_res, i, x, y) => {
      pic = `${i},${x},${y}`;
    };
    p.fx.transfer = (from, to, x1, y1, x2, y2) => {
      if (from === 1 && to === 0 && x1 === 0 && y1 === 0 && x2 === 0x13f && y2 === 199) shown.push(pic);
    };
    p.keys.push(K.Enter, K.Enter, K.Left, K.Left, K.Left, K.Enter);
    await endingPages(g).catch((e: unknown) => {
      if (!/ran out of keys/.test(String(e))) throw e;
    });
    const [first, second, third] = shown;
    expect(new Set([first, second, third]).size).toBe(3);
    expect(shown).toEqual([first, second, third, second, first, second]);
  });
});
