import { describe, expect, it } from 'vitest';
import { sfxKey, type SfxManifest } from '../src/audio/sfxKeys.ts';
import { bankRate, SfxBank } from '../src/ui/sfxBank.ts';
import { PcSound } from '../src/ui/sound.ts';
import { newGame } from './helpers.ts';

/** A source the fake context made: how it was started. */
interface Started {
  when: number;
  offset?: number | undefined;
  duration?: number | undefined;
  rate: number;
  buffer: unknown;
}

/** An audio context that records what it is asked to play, and decodes any file to a fake buffer of 60 s. */
function fakeContext() {
  const started: Started[] = [];
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }, connect: () => ({}) }),
    createBuffer: (_c: number, length: number, rate: number) => ({ kind: 'chip', length, rate, copyToChannel: () => {} }),
    createBufferSource: () => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: () => ({}),
        start(when: number, offset?: number, duration?: number) {
          started.push({ when, offset, duration, rate: src.playbackRate.value, buffer: src.buffer });
        },
        stop() {},
      };
      return src;
    },
    decodeAudioData: async () => ({ kind: 'atlas', duration: 60 }),
  };
  return { ctx, started };
}

/** A game's sound on the fake context, its bank given `manifest` and files that come when `release` is called. */
function soundWith(manifest: SfxManifest) {
  const { g } = newGame();
  const sound = new PcSound(g.data.ovl);
  const { ctx, started } = fakeContext();
  const waiting: (() => void)[] = [];
  const inner = sound as unknown as { ctx: unknown; out: unknown; bank: SfxBank };
  inner.ctx = ctx;
  inner.out = { gain: { value: 1 }, connect: () => ({}) };
  inner.bank = new SfxBank(manifest, () => new Promise((r) => waiting.push(() => r(new ArrayBuffer(8)))));
  /** The files asked for come (the first `n` of them, or all). */
  const release = async (n = Infinity): Promise<void> => {
    for (const w of waiting.splice(0, n)) w();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { g, sound, started, release };
}

const MOONGATE = [5900, 1, 30000, 2000, 2] as const;
const manifest = (slices: Record<string, [number, number][]>): SfxManifest => ({
  classical: { file: 'sfx/classical.x.ogg', slices },
  electronic: { file: 'sfx/electronic.x.ogg', slices },
  ambient: { file: 'sfx/ambient.x.ogg', slices },
});

describe('a suite played', () => {
  it('is silent until the suite has loaded, and keeps the pace', async () => {
    const { sound, started } = soundWith(manifest({ moongate: [[2, 1.1]] }));
    sound.setEffects('classical', 8);
    const t = performance.now();
    await sound.pulse(...MOONGATE);
    expect(performance.now() - t).toBeLessThan(400);
    expect(started).toHaveLength(0);
  });

  it('plays an effect from its slice once loaded', async () => {
    const { sound, started, release } = soundWith(manifest({ moongate: [[2, 1.1]] }));
    sound.setEffects('classical', 8);
    await release();
    await sound.pulse(...MOONGATE);
    expect(started).toHaveLength(1);
    expect(started[0].offset).toBe(2);
    expect(started[0].duration).toBe(1.1);
    expect(started[0].buffer).toMatchObject({ kind: 'atlas' });
  });

  it("plays a harpsichord key from the bank at the call's pitch", async () => {
    const { g, sound, started, release } = soundWith(manifest({}));
    const f = g.data.ovl.words(0x2746, 10)[4];
    const args = [f, 1, 4000, 20000, -4];
    const key = sfxKey({ name: 'harpsichord', note: 4 }, 'pulse', args);
    if (!key || key === 'silent') throw new Error('no key');
    const m = Number(key.key.split(':')[1]);
    const inner = sound as unknown as { bank: SfxBank };
    inner.bank = new SfxBank(manifest({ [key.key]: [[5, 0.7]] }), async () => new ArrayBuffer(8));
    sound.setEffects('classical', 8);
    await release();
    await new Promise((r) => setTimeout(r, 0));
    await sound.pulse(args[0], args[1], args[2], args[3], args[4]);
    expect(started).toHaveLength(1);
    expect(started[0].rate).toBeCloseTo(key.hz! / (440 * Math.pow(2, (m - 69) / 12)), 3);
  });

  it('clamps a note far outside the bank', () => {
    expect(bankRate(20000, 'harpsichord:96')).toBe(2);
    expect(bankRate(5, 'harpsichord:36')).toBe(0.5);
  });

  it('plays an unnamed call on its softened chip voice', async () => {
    const { sound, started, release } = soundWith(manifest({}));
    sound.setEffects('ambient', 8);
    await release();
    await sound.pulse(1234, 1, 5000, 6, 7);
    expect(started).toHaveLength(1);
    expect(started[0].buffer).toMatchObject({ kind: 'chip', rate: 44100 });
  });

  it('plays nothing for a folded call', async () => {
    const { g, sound, started, release } = soundWith(manifest({}));
    sound.setEffects('classical', 8);
    await release();
    for (const f of g.data.ovl.words(0x3a26, 6)) await sound.pulse(f, 1, 5000, 200, 0xd);
    expect(started).toHaveLength(0);
  });

  it('drops a load that finishes after the suite changed', async () => {
    const { sound, started, release } = soundWith(manifest({ moongate: [[2, 1.1]] }));
    sound.setEffects('classical', 8);
    sound.setEffects('ambient', 8);
    const inner = sound as unknown as { bank: SfxBank };
    // Only the first load comes back: classical's, no longer wanted.
    await release(1);
    expect(inner.bank.slice('classical', 'moongate', () => 0)).toBeNull();
    await sound.pulse(...MOONGATE);
    expect(started).toHaveLength(0); // ambient's file has not come: silent, and never classical's
  });

  it('does not restart a long slice still sounding', async () => {
    const { sound, started, release } = soundWith(manifest({ moongate: [[2, 1.1]] }));
    sound.setEffects('classical', 8);
    await release();
    await sound.pulse(...MOONGATE);
    await new Promise((r) => setTimeout(r, 100));
    await sound.pulse(...MOONGATE);
    expect(started).toHaveLength(1);
  });

  it('plays the Classical suite before any set is chosen: the Standard chip set is no more', async () => {
    const { sound, started, release } = soundWith(manifest({ moongate: [[2, 1.1]] }));
    const inner = sound as unknown as { bank: SfxBank; ctx: BaseAudioContext; effects: string };
    expect(inner.effects).toBe('classical');
    await sound.pulse(...MOONGATE); // its file not asked for yet: silent, not a chip voice
    expect(started).toHaveLength(0);
    const loading = inner.bank.load(inner.ctx, 'classical');
    await release();
    await loading;
    await sound.pulse(...MOONGATE);
    expect(started).toHaveLength(1);
    expect(started[0].buffer).toMatchObject({ kind: 'atlas' });
  });

  it('tries a file that would not load again, but not within a minute', async () => {
    let clock = 0;
    let fetches = 0;
    let fail = true;
    const bank = new SfxBank(
      manifest({ moongate: [[2, 1.1]] }),
      async () => {
        fetches++;
        if (fail) throw new Error('offline');
        return new ArrayBuffer(8);
      },
      () => clock,
    );
    const { ctx } = fakeContext();
    expect(await bank.load(ctx as never, 'classical')).toBeNull();
    expect(fetches).toBe(1);
    // Asked for an effect within the minute: not fetched again.
    clock = 30_000;
    expect(bank.slice('classical', 'moongate', () => 0)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetches).toBe(1);
    // After it: fetched again by the effect asked for, and then played.
    fail = false;
    clock = 61_000;
    expect(bank.slice('classical', 'moongate', () => 0)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetches).toBe(2);
    expect(bank.slice('classical', 'moongate', () => 0)).not.toBeNull();
  });

  it("lets a suite's file go when Upgrade (2001)'s speaker is chosen, and fetches it once however often it is asked for", async () => {
    let fetches = 0;
    const bank = new SfxBank(manifest({ moongate: [[2, 1.1]] }), async () => {
      fetches++;
      return new ArrayBuffer(8);
    });
    const { ctx } = fakeContext();
    const a = bank.load(ctx as never, 'classical');
    void bank.load(ctx as never, 'ambient');
    const again = bank.load(ctx as never, 'classical');
    void bank.load(ctx as never, 'classical');
    await Promise.all([a, again]);
    expect(fetches).toBe(2); // classical once, ambient once
    expect(bank.slice('classical', 'moongate', () => 0)).not.toBeNull();
    bank.forget();
    expect(bank.slice('classical', 'moongate', () => 0)).toBeNull();
  });
});
