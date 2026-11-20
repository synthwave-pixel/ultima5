import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { soften } from '../src/audio/sfxKeys.ts';
import type { MusicPlayer } from '../src/ui/music.ts';
import { PcSound, type GameEffects } from '../src/ui/sound.ts';

/**
 * A game's own effects, by name (PcSound.named): its PC speaker's sound as it rendered it, played as it sounded in
 * Upgrade (2001) and softened in a suite with no sound of that name; the suite's own where it names one; the game's
 * pace from the speaker's sound, waited out only where the game says the sound is the timing; and the music lowered
 * under a long one unless the game says it is heard too often. The names and sounds here are invented.
 */

const RATE = 44100;
const tone = (samples: number, v: number): Float32Array => new Float32Array(samples).fill(v);
const SPEAKER: Record<string, Float32Array> = {
  zap: tone(2205, 0.5), // 0.05 s
  ping: tone(8820, 0.25), // 0.2 s
  hum: tone(RATE, 0.125), // 1 s
  boom: tone(RATE, 0.75), // 1 s
  bump: tone(2205, 0.375),
};
const SUITE: Record<string, string | null> = {
  zap: null,
  ping: 'silent',
  hum: 'nosuch',
  boom: null,
  bump: 'blocked',
  mute: 'cue:Attack',
};
const EFFECTS: GameEffects = {
  speaker: (name) => SPEAKER[name] ?? null,
  suite: (name) => (name in SUITE ? SUITE[name] : 'silent'),
  timed: new Set(['ping']),
  unducked: new Set(['hum']),
};

/** What the fake context has sounded: each started source's samples (or the suite's buffer, by its tag). */
let started: (Float32Array | string)[];
let decodes: ((buffer: unknown) => void)[];

class FakeContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain() {
    const param = {
      value: 1,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      cancelScheduledValues: () => {},
      setTargetAtTime: () => {},
    };
    return { gain: param, connect: (n: unknown) => n, disconnect: () => {} };
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { data, duration: length / RATE, copyToChannel: (from: Float32Array) => data.set(from) };
  }
  createBufferSource() {
    const src = {
      buffer: null as unknown as { data?: Float32Array; tag?: string },
      playbackRate: { value: 1 },
      connect: (n: unknown) => n,
      start: () => void started.push(src.buffer.data ?? src.buffer.tag ?? '?'),
      stop: () => {},
    };
    return src;
  }
  decodeAudioData(): Promise<unknown> {
    return new Promise((resolve) => decodes.push(resolve));
  }
  resume() {
    return Promise.resolve();
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** A sound with the fake context made, playing `set` at `level`, with the game's effects (or, null, none: Ultima V). */
function sound(set: 'original' | 'classical', level = 8, effects: GameEffects | null = EFFECTS): PcSound {
  const s = new PcSound({} as never, effects ?? undefined);
  s.setEffects(set, level);
  s.unlock();
  return s;
}
const timed = async (f: () => Promise<void>): Promise<number> => {
  const t = performance.now();
  await f();
  return performance.now() - t;
};

beforeEach(() => {
  started = [];
  decodes = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a game’s own effect, by name', () => {
  it('plays its speaker as it sounded in Upgrade (2001)', async () => {
    await sound('original').named('zap');
    expect(started).toEqual([SPEAKER.zap]);
  });

  it('plays nothing in Upgrade (2001) where its speaker had nothing, whatever a suite has', async () => {
    await sound('original').named('mute');
    expect(started).toEqual([]);
  });

  it('softens its speaker in a suite with no sound for it', async () => {
    const s = sound('classical');
    await s.named('zap'); // no suite sound named
    await s.named('hum'); // a name the suite has not
    expect(started).toEqual([soften(SPEAKER.zap), soften(SPEAKER.hum)]);
  });

  it('plays the suite’s own once its file has come, and nothing before', async () => {
    const s = sound('classical');
    await s.named('bump');
    expect(started).toEqual([]); // the suite's file still on its way
    await flush();
    decodes.forEach((d) => d({ tag: 'classical', duration: 600 }));
    await flush();
    await s.named('bump');
    expect(started).toEqual(['classical']);
  });

  it('plays nothing where the game says silent, nor a name it lacks', async () => {
    const s = sound('classical');
    await s.named('ping');
    await s.named('nosuch');
    expect(started).toEqual([]);
  });

  it('plays nothing at no Sound FX level', async () => {
    await sound('original', 0).named('zap');
    await sound('classical', 0).named('zap');
    expect(started).toEqual([]);
  });

  it('waits the speaker’s sound out only where the game says it is the timing', async () => {
    expect(await timed(() => sound('classical').named('ping'))).toBeGreaterThanOrEqual(150); // timed, 0.2 s, silent in the suite
    expect(await timed(() => sound('original').named('zap'))).toBeLessThan(90);
    expect(await timed(() => sound('original').named('boom'))).toBeLessThan(250); // a second, waited a moment at most
    expect(await timed(() => sound('classical').named('mute'))).toBeLessThan(40); // no speaker: no wait
  });

  it('lowers the music under a long one, but not one the game says is heard too often', async () => {
    const s = sound('original');
    const duck = vi.spyOn((s as unknown as { player: MusicPlayer }).player, 'duck');
    await s.named('hum');
    expect(duck).not.toHaveBeenCalled();
    await s.named('boom');
    expect(duck).toHaveBeenCalledTimes(1);
  });

  it('is nothing, and no error, for a game that names none (Ultima V)', async () => {
    const s = sound('original', 8, null);
    expect(await timed(() => s.named('zap'))).toBeLessThan(40);
    expect(started).toEqual([]);
  });
});
