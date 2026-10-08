import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUNE_FILES } from '../src/game/music.ts';
import type { Arrangement } from '../src/audio/soundtracks.ts';
import type { MusicVoice } from '../src/game/settings.ts';
import { MUSIC } from '../src/ui/music.ts';
import { PcSound } from '../src/ui/sound.ts';

/**
 * How the sound loads and plays a tune: fetch and decode stood in for by promises the test settles, a fake audio
 * context noting which sources start and stop.
 */

interface Source {
  buffer: { tag: string };
  started: boolean;
  stopped: boolean;
}
interface Pending {
  resolve: (buffer: { tag: string; duration: number }) => void;
  reject: () => void;
}

let sources: Source[];
let decodes: Pending[];
let decodeCalls: string[];
let fetchCalls: string[];
let missing: Set<string>;

/** The tune names of the tunes (game/music.ts Tune: the Theme is 1, Britannia 2, Hornpipe 3, Engagement 4, Stones 5). */
const THEME = 1;
const BRITANNIA = 2;
const HORNPIPE = 3;
const ENGAGEMENT = 4;
const STONES = 5;
const file = (arrangement: Arrangement, tune: number): string => MUSIC[TUNE_FILES[tune - 1]][arrangement]!.file;
const tag = (arrangement: Arrangement, tune: number): string => file(arrangement, tune);

/** Let what has been settled run its course through the promises. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** The pending decodes of `arrangement`'s tune `tune`, settled: loaded, or not. */
async function settle(arrangement: Arrangement, tune: number, ok: boolean): Promise<void> {
  const name = file(arrangement, tune);
  const at = decodes.findIndex((p) => (p as Pending & { name: string }).name === name);
  expect(at, `a decode of ${name} is pending`).toBeGreaterThanOrEqual(0);
  const [p] = decodes.splice(at, 1);
  if (ok) p.resolve({ tag: name, duration: 100 });
  else p.reject();
  await flush();
}
/** What plays now: the tags of the sources started and not stopped. */
const playing = (): string[] => sources.filter((s) => s.started && !s.stopped).map((s) => s.buffer.tag);

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
  createBufferSource() {
    const src = {
      buffer: null as unknown as { tag: string },
      started: false,
      stopped: false,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      connect: (n: unknown) => n,
      start: () => void (src.started = true),
      stop: () => void (src.stopped = true),
    };
    sources.push(src);
    return src;
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<{ tag: string; duration: number }> {
    const name = new TextDecoder().decode(bytes);
    decodeCalls.push(name);
    return new Promise((resolve, reject) =>
      decodes.push(Object.assign({ resolve, reject: () => reject(new Error('undecodable')) }, { name })),
    );
  }
  resume() {
    return Promise.resolve();
  }
}

/** A sound playing soundtrack `voice`, with the fake context made, its random picks from `random`. */
function sound(voice: MusicVoice = 'remastered', random: () => number = () => 0): PcSound {
  const s = new PcSound({} as never);
  s.random = random;
  s.setMusicVoice(voice);
  s.unlock();
  return s;
}

beforeEach(() => {
  sources = [];
  decodes = [];
  decodeCalls = [];
  fetchCalls = [];
  missing = new Set();
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', async (url: string) => {
    fetchCalls.push(url);
    const name = url.replace(/^.*\/music\//, '');
    return missing.has(name)
      ? { ok: false, statusText: 'Not Found' }
      : { ok: true, arrayBuffer: async () => new TextEncoder().encode(name).buffer };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the tune played', () => {
  it('is the version chosen, once it has loaded', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    expect(playing()).toEqual([]); // still loading
    await settle('remastered', BRITANNIA, true);
    expect(playing()).toEqual([tag('remastered', BRITANNIA)]);
    expect(fetchCalls).toEqual([`/music/${file('remastered', BRITANNIA)}`]);
  });

  it('is the other version where the one chosen will not load', async () => {
    const s = sound();
    missing.add(file('remastered', BRITANNIA)); // not on the server (offline, never fetched)
    s.music(BRITANNIA);
    await flush();
    await settle('original', BRITANNIA, true);
    expect(playing()).toEqual([tag('original', BRITANNIA)]);
  });

  it('is the other version where the one chosen will not decode', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, false);
    await settle('original', BRITANNIA, true);
    expect(playing()).toEqual([tag('original', BRITANNIA)]);
  });

  it('is none where neither version will load', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, false);
    await settle('original', BRITANNIA, false);
    expect(playing()).toEqual([]);
    expect(sources).toHaveLength(0);
  });

  it('is the last asked for, where another is asked for before the first has loaded', async () => {
    const s = sound();
    s.music(BRITANNIA);
    s.music(HORNPIPE);
    await flush();
    await settle('remastered', BRITANNIA, true); // the first comes in late
    expect(playing()).toEqual([]);
    await settle('remastered', HORNPIPE, true);
    expect(playing()).toEqual([tag('remastered', HORNPIPE)]);
  });

  it('is not the one that was loading, where the version is changed meanwhile - the new version’s plays', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    s.setMusicVoice('original');
    await flush();
    await settle('remastered', BRITANNIA, true);
    expect(playing()).toEqual([]); // the old version, loaded late, is not played
    await settle('original', BRITANNIA, true);
    expect(playing()).toEqual([tag('original', BRITANNIA)]);
  });

  it('is none, where the music is turned off while it loads', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    s.setMusic(0);
    await settle('remastered', BRITANNIA, true);
    expect(playing()).toEqual([]);
    expect(sources).toHaveLength(0);
  });

  it('is taken up again in the version chosen, where it is changed as the tune plays', async () => {
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, true);
    s.setMusicVoice('original');
    await flush();
    await settle('original', BRITANNIA, true);
    expect(playing()).toEqual([tag('original', BRITANNIA)]); // the old one stopped (crossfaded out), the new one begun
    expect(sources.filter((x) => x.stopped).map((x) => x.buffer.tag)).toEqual([tag('remastered', BRITANNIA)]);
  });
});

describe('the tunes kept decoded', () => {
  it('are the playing one and the one before it, no more', async () => {
    const s = sound();
    const hear = async (tune: number): Promise<void> => {
      s.music(tune);
      await flush();
      if (decodes.length) await settle('remastered', tune, true);
    };
    await hear(BRITANNIA);
    await hear(HORNPIPE);
    await hear(BRITANNIA); // kept: not decoded again
    expect(decodeCalls).toHaveLength(2);
    await hear(ENGAGEMENT); // a third: Hornpipe, the oldest touched, is let go
    expect(decodeCalls).toHaveLength(3);
    await hear(HORNPIPE);
    expect(decodeCalls).toHaveLength(4); // decoded again
    expect(decodeCalls.at(-1)).toBe(file('remastered', HORNPIPE));
    await hear(ENGAGEMENT); // still kept
    expect(decodeCalls).toHaveLength(4);
  });

  it('do not include a tune that would not load: it is tried again, but not within a minute', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, false);
    await settle('original', BRITANNIA, false);
    expect(decodeCalls).toHaveLength(2);
    now += 59_000;
    s.music(BRITANNIA); // the next turn asks again, too soon
    await flush();
    expect(decodeCalls).toHaveLength(2);
    expect(fetchCalls).toHaveLength(2);
    expect(playing()).toEqual([]);
    now += 2_000; // past the minute
    s.music(BRITANNIA);
    await flush();
    expect(decodeCalls).toHaveLength(3); // fetched again, not remembered as lost
    await settle('remastered', BRITANNIA, true);
    expect(playing()).toEqual([tag('remastered', BRITANNIA)]);
  });

  it('wait only for the version that failed: the other is tried at once, and a success clears the wait', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const s = sound();
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, false);
    await settle('original', BRITANNIA, true); // the fallback plays
    expect(playing()).toEqual([tag('original', BRITANNIA)]);
    s.music(HORNPIPE); // another tune: its files are not under the wait
    await flush();
    await settle('remastered', HORNPIPE, true);
    now += 61_000;
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, true); // retried after the minute, and loads
    s.music(HORNPIPE);
    await flush();
    s.music(BRITANNIA);
    await flush();
    expect(decodeCalls.filter((c) => c === file('remastered', BRITANNIA))).toHaveLength(2); // no wait left on it: kept now
  });
});

describe('the soundtracks chosen from', () => {
  it('play one of a tune’s arrangements, at random, and another the next time it starts', async () => {
    const s = sound('classical', () => 0.99);
    s.music(HORNPIPE);
    await flush();
    await settle('strings', HORNPIPE, true); // the last of Original, Celtic, Consort, Orchestra, Piano, Strings
    expect(playing()).toEqual([tag('strings', HORNPIPE)]);
    s.music(ENGAGEMENT);
    await flush();
    await settle('strings', ENGAGEMENT, true);
    s.music(HORNPIPE); // started again: not the one it played last
    await flush();
    await settle('piano', HORNPIPE, true);
    expect(playing()).toEqual([tag('piano', HORNPIPE)]);
  });

  it('play an occasion’s own: a shrine’s, the title’s, a story’s', async () => {
    const s = sound('classical');
    s.music(STONES, 'shrine');
    await flush();
    await settle('piano', STONES, true);
    s.music(THEME, 'title');
    await flush();
    await settle('consort', THEME, true);
    s.music(STONES, 'introduction');
    await flush();
    await settle('consort', STONES, true);
    expect(playing()).toEqual([tag('consort', STONES)]);
    const e = sound('electronic');
    e.music(STONES, 'shrine');
    await flush();
    await settle('upsidedown', STONES, true);
    expect(playing()).toContain(tag('upsidedown', STONES));
  });

  it('play on, asked for the same tune again; and on another occasion, where what plays is one of its there too', async () => {
    const s = sound('classical');
    s.music(THEME, 'title');
    await flush();
    await settle('consort', THEME, true);
    s.music(THEME, 'title');
    s.music(THEME); // after a won battle: Consort is one of those too
    await flush();
    expect(decodes).toHaveLength(0);
    expect(playing()).toEqual([tag('consort', THEME)]);
  });

  it('cross Britannia over from the day’s to the night’s as the light turns, and back', async () => {
    const s = sound('electronic');
    s.music(BRITANNIA);
    await flush();
    await settle('remastered', BRITANNIA, true);
    s.music(BRITANNIA); // the next turn, still day
    await flush();
    expect(decodes).toHaveLength(0);
    s.music(BRITANNIA, 'night');
    await flush();
    await settle('grid', BRITANNIA, true);
    expect(playing()).toEqual([tag('grid', BRITANNIA)]); // the day's crossfaded out
    expect(sources.filter((x) => x.stopped).map((x) => x.buffer.tag)).toEqual([tag('remastered', BRITANNIA)]);
    s.music(BRITANNIA); // the dawn: the day's again, still kept decoded
    await flush();
    expect(decodes).toHaveLength(0);
    expect(playing()).toEqual([tag('remastered', BRITANNIA)]);
  });

  it('fall back to the tune’s others, then the Remastered’s, where the one picked will not load', async () => {
    const s = sound('electronic');
    missing.add(file('grid', BRITANNIA));
    missing.add(file('upsidedown', BRITANNIA));
    s.music(BRITANNIA, 'night');
    await flush();
    await settle('remastered', BRITANNIA, true);
    expect(playing()).toEqual([tag('remastered', BRITANNIA)]);
  });
});
