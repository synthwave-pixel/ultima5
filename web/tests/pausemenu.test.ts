import { describe, expect, it } from 'vitest';
import { getChar, getCommandKey } from '../src/game/input.ts';
import { K, LOST_FOCUS, Pad } from '../src/game/io.ts';
import { pauseMenu } from '../src/game/menu.ts';
import { appQuit } from '../src/ui/platform.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** The Pause menu (the ultima3 port's): what opens it, what it holds, and what left the command menu for it. */
describe('the Pause menu', () => {
  it('opens when the window loses focus at the command prompt, and the prompt waits on after it', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const seen: string[] = [];
    p.keys.push(LOST_FOCUS);
    p.next = () => {
      const m = g.menuShown;
      if (m) {
        seen.push(m.title);
        expect(g.paused).toBe(true);
        return Pad.B; // back to the game
      }
      return Pad.Y;
    };
    expect(await getCommandKey(g, 'town')).toBe(0x43); // Y, pressed after, is Cast as ever
    expect(seen).toEqual(['Paused']);
    expect(g.paused).toBe(false);
    expect(g.awaitingCommand).toBe(false);
  });

  it("opens on a keyboard's Escape in a fight too, read as a controller; Classic's Escape there is 1988's", async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const seen: string[] = [];
    p.keys.push(K.Escape);
    p.next = () => {
      const m = g.menuShown;
      if (m) {
        seen.push(m.title);
        return Pad.B;
      }
      return Pad.Y;
    };
    expect(await getCommandKey(g, 'combat')).toBe(0x43);
    expect(seen).toEqual(['Paused']);
    g.options.input = 'letters';
    p.keys.push(K.Escape);
    expect(await getCommandKey(g, 'combat')).toBe(K.Escape);
    expect(seen).toEqual(['Paused']);
  });

  it("saves from Save game there and then, without 1988's Quit prompt, which Q keeps", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    const { processCommand } = await import('../src/game/commands.ts');
    const { SAVE_NOW } = await import('../src/game/io.ts');
    let asked = false;
    p.next = () => {
      asked = true;
      return Pad.B;
    };
    const from = p.log.length;
    await processCommand(g, SAVE_NOW);
    const said = p.log.slice(from);
    expect(said).toContain('Saving');
    expect(said).not.toContain('Quit');
    expect(said).not.toContain('Save game?');
    expect(asked).toBe(false);
    await processCommand(g, 0x51); // Q, Classic's: asked, as ever
    expect(p.log.slice(from)).toMatch(/Quit:\s*Save game\?/);
  });

  it('lets a lost focus pass anywhere but the command prompt', async () => {
    const { g, p } = newGame();
    p.keys.push(LOST_FOCUS, 0x41);
    expect(await getChar(g)).toBe(0x41);
    expect(g.menuShown).toBeNull();
  });

  it('marks the command prompt as waiting only while it waits for its key', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const during: boolean[] = [];
    p.next = () => {
      during.push(g.awaitingCommand);
      return Pad.X;
    };
    await getCommandKey(g, 'town');
    expect(during).toEqual([true]);
    expect(g.awaitingCommand).toBe(false);
  });

  it('holds Auto combat, turned on and off in place; the command menu no longer offers it, Pass, Pause or saving', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.options.autoCombat = 'off';
    const labels: string[][] = [];
    let step = 0;
    p.next = () => {
      const m = g.menuShown!;
      labels.push([...m.labels]);
      const want = m.labels.findIndex((l) => l.startsWith('Auto combat'));
      if (step === 0 && m.at !== want) return K.Down;
      if (step++ === 0) return Pad.A;
      return Pad.B;
    };
    expect(await pauseMenu(g)).toBe(0);
    expect(g.options.autoCombat).toBe('allies'); // Off, then Allies, then All
    expect(labels[0]).toContain('Auto combat: Off');
    expect(labels.at(-1)).toContain('Auto combat: Allies');
    expect(labels.at(-1)).toEqual(expect.arrayContaining(['Resume', 'Save game', 'Save and quit']));

    const { commandMenu } = await import('../src/game/menu.ts');
    for (const where of ['town', 'combat'] as const) {
      g.commandPrompt = where;
      let offered: string[] = [];
      p.next = () => {
        offered = [...g.menuShown!.labels];
        return Pad.B;
      };
      await commandMenu(g);
      for (const gone of ['Pass', 'Pause', 'Save game']) expect(offered, where).not.toContain(gone);
      expect(
        offered.some((l) => l.startsWith('Auto combat')),
        where,
      ).toBe(false);
    }
  });
});

describe('Quit on the title menu', () => {
  it('is offered by the desktop app (its app: scheme) and the Android app (Capacitor), never by a browser tab', () => {
    let closed = 0;
    let exited = 0;
    const close = () => closed++;
    appQuit('app:', close)?.();
    expect(closed).toBe(1);
    const android = { isNativePlatform: () => true, Plugins: { App: { exitApp: () => exited++ } } };
    appQuit('https:', close, android)?.();
    expect(exited).toBe(1);
    expect(appQuit('https:', close)).toBeUndefined(); // the site
    expect(appQuit('http:', close)).toBeUndefined();
    // A web page with no native bridge, or an app without the App plugin, has none either.
    expect(appQuit('https:', close, { isNativePlatform: () => false, Plugins: android.Plugins })).toBeUndefined();
    expect(appQuit('https:', close, { isNativePlatform: () => true, Plugins: {} })).toBeUndefined();
  });
});

describe('the Pause menu, Gameplay and Settings', () => {
  it('put Music and Sound FX in Pause, the rules in Gameplay, and the look in Settings', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.lastSource = 'keyboard';
    let paused: string[] = [];
    p.next = () => {
      paused = [...g.menuShown!.labels];
      return Pad.B;
    };
    await pauseMenu(g);
    expect(paused.slice(0, 8)).toEqual([
      'Resume',
      'Auto combat: Off',
      'Music: Classical',
      'Music level: 60%',
      'Sound FX: Standard',
      'Sound FX level: 80%',
      'Gameplay',
      'Settings',
    ]);
    expect(paused).not.toContain('Journal');
    expect(paused).not.toContain('Map');
    const { gameplayLines, settingLines } = await import('../src/game/menu.ts');
    const name = (l: { label: string }): string => l.label.replace(/:.*/, '');
    expect(gameplayLines(g).map(name)).toEqual(['Back', 'Input', 'Auto Pause', 'Rules', 'Auto aim']);
    expect(settingLines(g).map(name)).toEqual([
      'Back',
      'UX',
      'Tiles',
      'Outlines',
      'Status letters',
      'Scanlines',
      'Export saved game',
      'Import saved game',
      'Remove game files',
    ]);
    // At the title there is no Pause menu: Settings holds the music, the sound and Gameplay.
    expect(settingLines(g, true).map(name)).toEqual(
      expect.arrayContaining(['Music', 'Music level', 'Sound FX', 'Sound FX level', 'Gameplay']),
    );
  });

  it('dials Music down to Off from Pause, heard as it turns, kept and taken up', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const applied: number[] = [];
    g.hooks.applyOptions = (o) => applied.push(o.musicLevel);
    let step = 0;
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Music level') return step++ < 6 ? K.Down : Pad.A;
      const want = m.labels.findIndex((l) => l.startsWith('Music level'));
      if (step === 0 && m.at !== want) return K.Down;
      return step === 0 ? Pad.A : Pad.B;
    };
    await pauseMenu(g);
    expect(g.options.musicLevel).toBe(0);
    expect(applied.slice(0, 6)).toEqual([5, 4, 3, 2, 1, 0]); // heard at each step
    expect(applied.at(-1)).toBe(0);
  });

  it("keeps the music paused under the Sound FX level's dial, the effects it plays heard, the menu held throughout", async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const holds: boolean[] = [];
    const heard: boolean[] = [];
    g.sound.setHeld = (_reason, held) => void holds.push(held);
    g.sound.hearMusic = (on) => void heard.push(on);
    let step = 0;
    let during: boolean[] = [];
    let musicUnderDial: boolean | undefined;
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Sound FX level') {
        during = [...holds];
        musicUnderDial = heard[heard.length - 1];
        return step++ < 2 ? K.Down : Pad.A;
      }
      const want = m.labels.findIndex((l) => l.startsWith('Sound FX level'));
      if (step === 0 && m.at !== want) return K.Down;
      return step === 0 ? Pad.A : Pad.B;
    };
    await pauseMenu(g);
    expect(during).toEqual([true]); // the Pause menu holds the music, and the dial lets nothing go
    expect(holds).toEqual([true, false]); // until Resume
    expect(heard).toContain(true); // heard as the bar passed the Music level line
    expect(musicUnderDial).toBe(false); // but not under the Sound FX level's dial
    expect(heard[heard.length - 1]).toBe(false);
  });

  it('cycles the Music line through the four soundtracks, each named within the menu’s width', async () => {
    const { settingLines } = await import('../src/game/menu.ts');
    const { g } = newGame();
    const music = () => settingLines(g, true).find((l) => l.label.startsWith('Music:'))!;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const line = music();
      seen.push(line.label);
      expect(line.label.length).toBeLessThanOrEqual(21);
      await line.act?.();
    }
    expect(seen).toEqual(['Music: Classical', 'Music: Electronic', 'Music: Ambient', 'Music: Upgrade (2001)']);
    expect(music().label).toBe('Music: Classical'); // round again
  });

  it('touches no hold at the title, where nothing is held', async () => {
    const { settingLines } = await import('../src/game/menu.ts');
    const { g, p } = newGame();
    const holds: boolean[] = [];
    g.sound.setHeld = (_reason, held) => void holds.push(held);
    const line = settingLines(g, true).find((l) => l.label.startsWith('Sound FX level'))!;
    p.keys.push(Pad.B);
    await line.act?.();
    expect(holds).toEqual([]);
  });

  it('leaves the level as it was when the dial is backed out of', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    let step = 0;
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Sound FX level') return step++ < 3 ? K.Down : Pad.B;
      const want = m.labels.findIndex((l) => l.startsWith('Sound FX level'));
      if (step === 0 && m.at !== want) return K.Down;
      return step === 0 ? Pad.A : Pad.B;
    };
    await pauseMenu(g);
    expect(g.options.effectsLevel).toBe(8);
  });
});

describe('the scanlines', () => {
  it('are each UX’s own: off in Modern, on in PC (1988) until turned off', async () => {
    const { DEFAULTS } = await import('../src/game/settings.ts');
    expect([DEFAULTS.scanlines, DEFAULTS.pcScanlines]).toEqual([false, true]);
    const { settingLines } = await import('../src/game/menu.ts');
    const { g } = newGame();
    const line = () => settingLines(g).find((l) => l.label.startsWith('Scanlines'))!;
    expect(line().label).toBe('Scanlines: Off');
    g.options.tileSet = 'original';
    expect(line().label).toBe('Scanlines: On');
    await line().act?.();
    expect([g.options.scanlines, g.options.pcScanlines]).toEqual([false, false]);
    g.options.tileSet = 'standard';
    await line().act?.();
    expect([g.options.scanlines, g.options.pcScanlines]).toEqual([true, false]);
  });

  it('keep what a player already in the PC (1988) look saw, from when one setting served both', async () => {
    const { loadOptions, SETTINGS_KEY } = await import('../src/game/settings.ts');
    const store = new Map<string, string>();
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null }, configurable: true });
    try {
      store.set(SETTINGS_KEY, JSON.stringify({ tileSet: 'original', scanlines: false }));
      expect(loadOptions().pcScanlines).toBe(false);
      store.set(SETTINGS_KEY, JSON.stringify({ tileSet: 'original', scanlines: true }));
      expect(loadOptions().pcScanlines).toBe(true);
      store.set(SETTINGS_KEY, JSON.stringify({ tileSet: 'standard', scanlines: false }));
      expect(loadOptions().pcScanlines).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: was, configurable: true });
    }
  });
});
