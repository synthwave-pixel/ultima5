import { describe, expect, it } from 'vitest';
import { getCommandKey } from '../src/game/input.ts';
import { pauseMenu } from '../src/game/menu.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import type { UpdateOffer } from '../src/ui/updates.ts';
import { newGame } from './helpers.ts';

/** A newer version come while playing (ui/updates.ts): said in the log before the turn, and on the Pause menu. */
describe('an update while playing', () => {
  const playing = (offer: UpdateOffer) => {
    const { g, p } = newGame();
    journeyOnward(g);
    let now: UpdateOffer | null = offer;
    const calls = { told: 0, applied: 0 };
    g.hooks.update = {
      offer: () => now,
      apply: () => void calls.applied++,
      told: () => {
        calls.told++;
        if (now) now = { ...now, told: true };
      },
    };
    return { g, p, calls };
  };

  it('is said in the log once, before the turn, the game going on', async () => {
    const { g, p, calls } = playing({ kind: 'restart', installed: true, version: '1.1.168', current: '1.1.166', told: false });
    p.keys.push(0x4c, 0x4c); // L, twice: two turns' prompts
    await getCommandKey(g, 'town');
    await getCommandKey(g, 'town');
    // (The log wraps at its width, the space at a wrap gone: compared without spaces.)
    const said = p.log.replace(/\s+/g, '');
    expect(said.split('UltimaV1.1.168isinstalled:itstartsthenexttimeyouplay.')).toHaveLength(2);
    expect(calls).toEqual({ told: 1, applied: 0 });
  });

  it('says a build downloaded by electron-updater is installed on quitting', async () => {
    const { g, p } = playing({ kind: 'restart', version: '1.1.168', current: '1.1.166', told: false });
    p.keys.push(0x4c);
    await getCommandKey(g, 'town');
    expect(p.log.replace(/\s+/g, '')).toContain('UltimaV1.1.168hasdownloaded:itisinstalledwhenyouquit.');
  });

  it('keeps a line on the Pause menu, saying the way to it rather than restarting out of the game', async () => {
    const { g, p, calls } = playing({ kind: 'restart', installed: true, version: '1.1.168', current: '1.1.166', told: true });
    g.options.input = 'controller';
    const seen = { text: '', labels: [] as string[] };
    p.next = () => {
      const m = g.menuShown;
      // The line's text read (no menu up): kept, and closed.
      if (!m) {
        seen.text = p.rows.map((r) => r.join('')).join(' ');
        return Pad.B;
      }
      seen.labels = m.labels;
      if (seen.text) return Pad.B; // and out of the menu
      const at = m.labels.indexOf('Update (1.1.168)');
      return m.at === at ? Pad.A : K.Down;
    };
    expect(await pauseMenu(g)).toBe(0);
    expect(seen.labels).toContain('Update (1.1.168)');
    expect(seen.text.replace(/\s+/g, ' ')).toContain('Save and quit');
    expect(calls.applied).toBe(0); // no restart out of a game in play
  });
});
