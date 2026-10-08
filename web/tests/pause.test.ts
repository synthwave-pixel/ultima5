import { describe, expect, it } from 'vitest';
import type { Hold } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/**
 * The game is held for two reasons - the page is away, the pause menu is up - and sounds again only
 * when both have let go (the ultima3 port's two holds), so a window coming back to an open menu stays quiet.
 */
describe('holding the game', () => {
  const heard = (): { held: Set<Hold>; sound: { setHeld: (r: Hold, h: boolean) => void } } => {
    const held = new Set<Hold>();
    return {
      held,
      sound: {
        setHeld: (reason, on) => {
          if (on) held.add(reason);
          else held.delete(reason);
        },
      },
    };
  };

  it('the menu holds the sound and lets it go', () => {
    const { g } = newGame();
    const ears = heard();
    Object.assign(g.p.sound, ears.sound);
    expect(g.paused).toBe(false);
    g.pause(true);
    expect(g.paused).toBe(true);
    expect([...ears.held]).toEqual(['menu']);
    g.pause(false);
    expect(g.paused).toBe(false);
    expect([...ears.held]).toEqual([]);
  });

  it('holds only once, however often it is asked', () => {
    const { g } = newGame();
    const ears = heard();
    Object.assign(g.p.sound, ears.sound);
    g.pause(true);
    g.pause(true);
    g.pause(false);
    expect(g.paused).toBe(false);
    expect([...ears.held]).toEqual([]);
  });
});

/** The sound itself: what holds it, and when it sounds again. */
describe('the sound holds', () => {
  class Ctx {
    state: 'running' | 'suspended' = 'running';
    resume(): Promise<void> {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend(): Promise<void> {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }

  const sound = async (): Promise<{ s: { setHeld: (r: Hold, h: boolean) => void; hearMusic: (on: boolean) => void }; ctx: Ctx }> => {
    const { PcSound } = await import('../src/ui/sound.ts');
    const s = new PcSound({} as unknown as ConstructorParameters<typeof PcSound>[0]);
    const ctx = new Ctx();
    (s as unknown as { ctx: Ctx }).ctx = ctx;
    return { s, ctx };
  };

  it('stops everything for the page away; for a menu, pauses only the music, its clicks still heard', async () => {
    const { s, ctx } = await sound();
    const musicHeld = (): boolean => (s as unknown as { player: { held: boolean } }).player.held;
    s.setHeld('focus', true);
    expect(ctx.state).toBe('suspended');
    s.setHeld('menu', true);
    expect(musicHeld()).toBe(true);
    // The window comes back while the menu is still up: everything sounds again but the music, which the menu holds.
    s.setHeld('focus', false);
    expect(ctx.state).toBe('running');
    expect(musicHeld()).toBe(true);
    s.setHeld('menu', false);
    expect(musicHeld()).toBe(false);
  });

  it('lets the music be heard over a menu where it is asked for (the Music level line), and holds it again', async () => {
    const { s, ctx } = await sound();
    const musicHeld = (): boolean => (s as unknown as { player: { held: boolean } }).player.held;
    s.setHeld('settings', true);
    expect(ctx.state).toBe('running');
    expect(musicHeld()).toBe(true);
    s.hearMusic(true);
    expect(musicHeld()).toBe(false);
    s.hearMusic(false);
    expect(musicHeld()).toBe(true);
    s.setHeld('settings', false);
    expect(musicHeld()).toBe(false);
  });
});

describe('the music under a menu', () => {
  it('is heard only while the bar is on the Music or Music level line, in the Pause menu and in Settings at the title', async () => {
    const { pauseMenu, settingsMenu } = await import('../src/game/menu.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    for (const where of ['pause', 'title'] as const) {
      const { g, p } = newGame();
      if (where === 'pause') journeyOnward(g);
      const heard: boolean[] = [];
      Object.assign(g.p.sound, { hearMusic: (on: boolean) => void heard.push(on) });
      const lines = (): string[] => g.menuShown?.labels ?? [];
      let steps = 0;
      let onMusic = false;
      let onVoice = false;
      let elsewhere = false;
      let offAgain = false;
      fly(g, p, [
        () => {
          const at = g.menuShown?.at ?? -1;
          const label = lines()[at] ?? '';
          if (label.startsWith('Music:')) {
            onVoice = heard[heard.length - 1] === true;
            return K.Down;
          }
          if (!onVoice && heard.length) elsewhere ||= heard[heard.length - 1] === false;
          if (label.startsWith('Music level')) {
            onMusic = heard[heard.length - 1] === true;
            return K.Down;
          }
          if (onMusic && !offAgain) {
            offAgain = heard[heard.length - 1] === false;
            return Pad.B;
          }
          return steps++ < 30 ? K.Down : Pad.B;
        },
      ]);
      await (where === 'pause' ? pauseMenu(g) : settingsMenu(g, true)).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      expect(onMusic, where).toBe(true);
      expect(onVoice, where).toBe(true);
      expect(elsewhere, where).toBe(true); // not heard on the lines before them
      expect(offAgain, where).toBe(true);
    }
  });
});

describe('the music under lists of settings, one over another', () => {
  it("stays paused in the title's Settings after Gameplay, opened from it, closes", async () => {
    const { settingsMenu } = await import('../src/game/menu.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    const held = new Set<Hold>();
    let hearing = false;
    Object.assign(g.p.sound, {
      setHeld: (r: Hold, on: boolean) => void (on ? held.add(r) : held.delete(r)),
      hearMusic: (on: boolean) => void (hearing = on),
    });
    let stage = 0;
    let afterGameplay: { held: boolean; hearing: boolean } | null = null;
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Gameplay') {
        stage = 2;
        return Pad.B;
      }
      if (stage === 0) {
        const want = m.labels.indexOf('Gameplay');
        if (m.at !== want) return K.Down;
        stage = 1;
        return Pad.A;
      }
      // Back in Settings, on the Gameplay line: the music still paused.
      afterGameplay ??= { held: held.has('settings'), hearing };
      return Pad.B;
    };
    await settingsMenu(g, true);
    expect(afterGameplay).toEqual({ held: true, hearing: false });
    expect(held.size).toBe(0); // let go as Settings closes
  });
});
