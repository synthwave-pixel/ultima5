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
});
