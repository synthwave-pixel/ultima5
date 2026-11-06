import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { settingLines } from '../src/game/menu.ts';
import type { SteamHook, SteamStatus } from '../src/game/game.ts';
import { newGame } from './helpers.ts';

/** The Steam line in Settings: shown only where the desktop app gives the game a Steam hook, and what it asks and says. */
describe('the Steam line in Settings', () => {
  const hook = (status: SteamStatus | Error, calls: string[] = []): SteamHook => ({
    status: async () => {
      calls.push('status');
      if (status instanceof Error) throw status;
      return status;
    },
    setup: async () => (calls.push('setup'), 'Set up done.'),
    remove: async () => (calls.push('remove'), 'Removed it.'),
    copyLine: async () => (calls.push('copy'), true),
  });

  /** Opens the Steam line and chooses the lines named, in turn (then Back); everything the screen showed between is kept. */
  const useSteam = async (status: SteamStatus | Error, choices: string[], calls: string[] = []) => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.hooks.steam = hook(status, calls);
    const line = settingLines(g).find((l) => l.label === 'Steam')!;
    const todo = [...choices];
    const menus: string[][] = [];
    const texts: string[] = [];
    p.next = () => {
      const m = g.menuShown;
      if (!m) {
        texts.push(p.log);
        return Pad.A;
      }
      menus.push([...m.labels]);
      texts.push(m.labels.join(' '));
      const want = todo.length === 0 ? 'Back' : todo[0];
      if (m.labels[m.at] !== want && !m.labels[m.at].startsWith(want)) return K.Down;
      if (todo.length > 0) todo.shift();
      return Pad.A;
    };
    await line.act!();
    // The screen's words as one line, a wrapped sentence joined.
    return { menus, texts: [texts.join(' ').replace(/\s+/g, ' ')], calls };
  };

  it('is listed only where the page has a Steam hook', () => {
    const { g } = newGame();
    expect(settingLines(g).map((l) => l.label)).not.toContain('Steam');
    g.hooks.steam = hook({ system: 'linux', state: 'ready', line: null });
    expect(settingLines(g).map((l) => l.label)).toContain('Steam');
  });

  it('copies the launch line on Windows, and says where to paste it', async () => {
    const calls: string[] = [];
    const { texts } = await useSteam(
      { system: 'windows', state: 'not-set-up', line: '"C:\\Ultima V.exe" %command%' },
      ['Copy launch line'],
      calls,
    );
    expect(calls).toContain('copy');
    expect(texts.join('\n')).toContain('Copied. In Steam: Ultima V');
    expect(texts.join('\n')).toContain('Launch Options, and paste.');
  });

  it('asks a Mac with Steam running to quit it before setting up, and does nothing on No', async () => {
    const steam: SteamStatus = { system: 'mac', state: 'steam-running', line: null };
    const no = await useSteam(steam, ['Set up', 'No']);
    expect(no.texts.join('\n')).toContain('Steam must be closed for this.');
    expect(no.calls).not.toContain('setup');
    const yes = await useSteam(steam, ['Set up', 'Yes']);
    expect(yes.calls).toContain('setup');
    expect(yes.texts.join('\n')).toContain('Set up done.');
  });

  it('asks a Mac with Steam running to quit it before the first setup, and before removing, doing nothing on No', async () => {
    const running: SteamStatus = { system: 'mac', state: 'not-set-up', line: null, steamRunning: true };
    const no = await useSteam(running, ['Set up', 'No']);
    expect(no.texts.join('\n')).toContain('Steam must be closed for this. Quit Steam now?');
    expect(no.calls).not.toContain('setup');
    const set = await useSteam(running, ['Set up', 'Yes']);
    expect(set.calls).toContain('setup');
    const ready: SteamStatus = { system: 'mac', state: 'ready', line: null, steamRunning: true };
    const keep = await useSteam(ready, ['Remove Steam setup', 'No']);
    expect(keep.texts.join('\n')).toContain('Steam must be closed for this. Quit Steam now?');
    expect(keep.calls).not.toContain('remove');
    const gone = await useSteam(ready, ['Remove Steam setup', 'Yes']);
    expect(gone.calls).toContain('remove');
  });

  it('sets up a Mac with Steam closed without asking', async () => {
    const { calls, menus } = await useSteam({ system: 'mac', state: 'not-set-up', line: null }, ['Set up']);
    expect(calls).toContain('setup');
    expect(menus.flat()).not.toContain('Yes');
  });

  it('shows the Mac note, and removes the setup', async () => {
    const { menus, calls, texts } = await useSteam({ system: 'mac', state: 'ready', line: null }, ['Remove Steam setup']);
    expect(menus[0].join(' ')).toContain('Invalid platform');
    expect(calls).toContain('remove');
    expect(texts.join('\n')).toContain('Removed it.');
  });

  it('does not offer the launch line on a Mac, nor Set up on Windows', async () => {
    const mac = await useSteam({ system: 'mac', state: 'ready', line: null }, []);
    expect(mac.menus[0]).not.toContain('Copy launch line');
    const win = await useSteam({ system: 'windows', state: 'not-set-up', line: 'x' }, []);
    expect(win.menus[0]).not.toContain('Set up');
  });

  it('shows a short failure line, and still opens, when the status cannot be had', async () => {
    const { menus } = await useSteam(new Error('boom'), []);
    expect(menus[0].join(' ')).toContain("Steam's state could not be read");
  });

  it('speaks only in letters the game can draw (0x20-0x7e), in every state of every system', async () => {
    const systems = ['linux', 'windows', 'mac'] as const;
    const states = ['ready', 'not-set-up', 'steam-running', 'no-steam', 'not-owned'] as const;
    for (const system of systems) {
      for (const state of states) {
        const { g, p } = newGame();
        g.options.input = 'controller';
        g.hooks.steam = hook({ system, state, line: 'x' });
        const todo = ['Set up', 'Copy launch line', 'Remove Steam setup', 'Yes'];
        const seen: string[] = [];
        p.next = () => {
          const m = g.menuShown;
          if (!m) {
            seen.push(p.log);
            return Pad.A;
          }
          seen.push(...m.labels);
          const i = m.labels.findIndex((l) => todo.includes(l));
          if (i < 0) return Pad.B;
          if (m.at !== i) return K.Down;
          todo.splice(todo.indexOf(m.labels[i]), 1);
          return Pad.A;
        };
        await settingLines(g).find((l) => l.label === 'Steam')!.act!();
        expect(seen.join('').match(/[^\x20-\x7e\n]/g) ?? []).toEqual([]);
      }
    }
  });

  it('says a setup or removal that rejects as "That didn\'t work"', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.hooks.steam = { ...hook({ system: 'linux', state: 'ready', line: null }), setup: () => Promise.reject(new Error('disk full')) };
    let sent = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (sent) return Pad.B;
      if (m.labels[m.at] === 'Set up') return ((sent = true), Pad.A);
      return K.Down;
    };
    await settingLines(g).find((l) => l.label === 'Steam')!.act!();
    expect(p.log.replace(/\s+/g, ' ')).toContain("That didn't work: disk full");
  });

  it("keeps the desktop app's Steam messages to the same letters", () => {
    const main = readFileSync(fileURLToPath(new URL('../../desktop/main.cjs', import.meta.url)), 'utf8');
    const strings = main.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l));
    expect(strings.filter((l) => /[^\t -~]/.test(l))).toEqual([]);
  });
});
