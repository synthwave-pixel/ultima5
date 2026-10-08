/**
 * sound.ts
 *
 * The DOS game's sound, through Web Audio: the PC speaker's four routines
 * (ULTIMA_2192 pulse, 223c noise, 22c0 tone, 43ae sweep) as square waves
 * and noise, timed as u5d's synthesized driver times them, and the music,
 * the Ultima V Upgrade's tunes as rendered files (tools/music), played by
 * ui/music.ts: each fetched the first time it plays - kept by the service
 * worker on the web, carried in the bundle in the apps.
 *
 * Browsers start audio only after a gesture, so the context is made on the
 * first key or tap (unlock). Until then the effects still take their time,
 * silently, so the game keeps its pace.
 *
 * The pace is the ultima3 port's: an effect starts at once and the game goes
 * on, waiting a moment at most (PACE) - where the DOS game stood still for
 * as long as its speaker sounded (a first-circle spell held play for nearly
 * two seconds). Only where the sound is itself the timing does the game wait
 * it out: a tune played note by note, a set piece the picture follows
 * (TIMED). And as that port mixes: the same effect is not started again
 * within a few dozen milliseconds, and a long one is not restarted while it
 * still sounds, so repeats do not pile up.
 */

import type { Sound } from '../game/io.ts';
import { levelGain, type MusicVoice, type SoundSet } from '../game/settings.ts';
import { arrangementsFor, pick, type Arrangement, type Occasion } from '../audio/soundtracks.ts';
import { REPEATED, standard } from '../audio/chip.ts';
import {
  fountainDroplets,
  fountainLevel,
  fountainSplash,
  u3Effect,
  waterfallBabble,
  waterfallLevel,
  waterfallRoar,
} from '../audio/chip3.ts';
import { identify, type Kind, type WordSource } from '../audio/effects.ts';
import { noiseRuns, pulseRuns, renderRuns, runsLength, sweepRuns, toneRuns } from '../audio/speaker.ts';
import type { Hold } from '../game/io.ts';
import { TUNE_FILES } from '../game/music.ts';
import { MUSIC, MusicPlayer } from './music.ts';

/** The effects' level into the mix (the chip voices are levelled in chip.ts; the speaker is a full-scale 0 or 1). */
const EFFECT_LEVEL = { standard: 1, original: 0.3 };
/**
 * The music's gain at full (100%): the rendered tunes are levelled at an RMS of -20 dBFS, their peaks at -1 dBFS at
 * most (tools/music/pcm.ts level), so unity is their own level, with room under full scale for the effects at their
 * loudest on top of them. The default level (60%) puts them some 8 dB under it, beneath the effects.
 */
const MUSIC_FULL = 1;
/** How many decoded tunes are kept (each tens of megabytes, and a phone has little): the one playing and the one before it. */
const KEEP_DECODED = 2;
/** A file that would not load is not tried again for this long (ms): the game asks for its tune at every command. */
const RETRY_AFTER = 60_000;
/** The music's gain at a level (0-10). */
export function musicGain(level: number): number {
  return MUSIC_FULL * levelGain(level);
}
/**
 * The effects' gain for a set at a level (0-10): the default level (80%) is each set's level as it always was. A set
 * or level that is none (a script's, or a setting from before the mixer: 'off') sounds as the Standard set, or not at
 * all, rather than giving the audio a gain of NaN, which throws.
 */
export function effectsGain(set: SoundSet, level: number): number {
  const gain = ((EFFECT_LEVEL[set] ?? EFFECT_LEVEL.standard) / levelGain(8)) * levelGain(level);
  return Number.isFinite(gain) ? gain : 0;
}
/** An effect at least this long lowers the music. */
const DUCK_SECONDS = 0.4;
const RATE = 44100;
/** The longest the game waits for an effect (seconds), unless its sound is the timing. */
const PACE = 0.1;
/**
 * Effects whose sound is the timing: the tunes played note by note (a harpsichord's keys, a lute, the chants,
 * Blackthorn's and the apparition's notes, a shrine's and a gem's shimmer) and the set pieces the picture follows
 * (the whirlpool, the earthquake, a spirit's coming, the apparition raising the party). The game waits these out.
 */
const TIMED = new Set([
  'harpsichord',
  'lute',
  'chant',
  'blackthorn',
  'apparition',
  'gemshard',
  'shrine1',
  'shrine2',
  'whirl',
  'shake',
  'gatein',
  'shadowin',
  'spiritin',
  'possess',
  'revive',
  'endmoon',
  'raise',
]);
/** The water heard every tick near it (a waterfall, a fountain): it never lowers the music. */
const AMBIENT = new Set(['watrfall', 'fountain']);
/** Whether effect `name`, `played` seconds long, lowers the music: a long one does, but for the water near it. */
export function ducks(name: string, played: number): boolean {
  return played >= DUCK_SECONDS && !AMBIENT.has(name);
}
/**
 * Water in the Standard set - a waterfall, a fountain - not heard again for this long (ms) - the party gone from it, or
 * the game's ticks stopped - fades away. Its call comes every tick (frame.ts ambientSound, a few times a second).
 */
const WATER_QUIET_MS = 1200;
/** About how long water's sound takes to fade in, to fade away, and to follow the party nearer or further (s). */
const WATER_EASE = 2;

/** The water the Standard set keeps sounding while the party is near, by effect: its loops, and its level by nearness. */
const WATERS: Record<string, { loops: (r: () => number) => Float32Array[]; level: (d2: number) => number }> = {
  watrfall: { loops: (r) => [waterfallRoar(r), waterfallBabble(r)], level: waterfallLevel },
  fountain: { loops: (r) => [fountainSplash(r), fountainDroplets(r)], level: fountainLevel },
};

/** The same effect starts at most this often (ms). */
const MIN_INTERVAL_MS = 70;
/** An effect at least this long (seconds) is not restarted while it sounds. */
const LONG = 0.5;

const RUNS: Record<Kind, (a: number[]) => ReturnType<typeof pulseRuns>> = {
  pulse: (a) => pulseRuns(a[0], a[1], a[2], a[3], a[4]),
  noise: (a) => noiseRuns(a[0], a[1], a[2]),
  tone: (a) => toneRuns(a[0], a[1]),
  sweep: (a) => sweepRuns(a[0], a[1], a[2], a[3]),
};

export class PcSound implements Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  /** When each effect last started (performance clock, ms), and when each long one ends (audio clock, s). */
  private readonly lastStart = new Map<string, number>();
  private readonly ends = new Map<string, number>();
  private readonly chips = new Map<string, Float32Array>();
  private readonly cues = new Map<string, Float32Array>();
  /**
   * Water's sound near it, in the Standard set, by effect (WATERS): its loops (chip3.ts), made once, sounding on and on
   * while its call keeps coming, at a level by how near it is; and when it is to fade.
   */
  private readonly waters = new Map<
    string,
    { gain: GainNode; sources: AudioBufferSourceNode[]; level: number; quiet?: ReturnType<typeof setTimeout> }
  >();
  private readonly waterLoops = new Map<string, Float32Array[]>();
  /** How near what the next ambient call sounds is (squares, squared: frame.ts ambientSound). */
  private near2 = 0;
  /** Which effects play (the Sound FX setting). */
  private effects: SoundSet = 'standard';
  /** How loud they play (the Sound FX level, 0-10); at 0 none is started. */
  private effectsLevel = 8;
  private readonly player = new MusicPlayer(() => this.ctx, musicGain(6));
  /** Whether music plays at all (the Music level above none). */
  musicOn = true;
  /** Which soundtrack plays (the Music setting). */
  private voice: MusicVoice = 'classical';
  /** The tune asked for, and on what occasion, so it can start once audio is unlocked, music is turned on, or its file has come. */
  private wanted = 0;
  private occasion: Occasion | undefined = undefined;
  /** What is playing or loading for: the soundtrack, tune and occasion last asked for ('' where it must be chosen afresh). */
  private asked = '';
  /** The arrangement each tune last played in, so the next time it starts it is another. */
  private readonly lastPlayed = new Map<string, Arrangement>();
  /** Where the arrangement is picked at random from (0 to 1): the tests set it. */
  random: () => number = Math.random;
  /**
   * Tunes decoded, by arrangement and name - only the last two (a decoded tune is tens of megabytes): fetched the first
   * time each plays (kept by the service worker on the web, in the bundle in the apps). Null where it could not be had,
   * and then not kept.
   */
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
  /** When each file that would not load last failed (performance clock, ms); a success clears it. */
  private readonly failedAt = new Map<string, number>();

  constructor(private readonly data: WordSource) {}

  /** Make the audio context (from a key press or tap). */
  unlock(): void {
    if (this.ctx) {
      // (A closed context, or WebKit's refusal without a gesture, rejects: the game stays quiet, nothing more.)
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.out = this.ctx.createGain();
    this.out.gain.value = effectsGain(this.effects, this.effectsLevel);
    this.setEffects(this.effects, this.effectsLevel);
    this.out.connect(this.ctx.destination);
    this.musicAgain();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }

  /** ULTIMA_2192. */
  pulse(freq: number, delay: number, duration: number, width: number, increment: number): Promise<void> {
    return this.effect('pulse', [freq, delay, duration, width, increment]);
  }

  /** ULTIMA_223c. */
  noise(rate: number, duration: number, limit: number): Promise<void> {
    return this.effect('noise', [rate, duration, limit]);
  }

  /** ULTIMA_22c0. */
  tone(freq: number, duration: number): Promise<void> {
    return this.effect('tone', [freq, duration]);
  }

  /** ULTIMA_43ae. */
  sweep(from: number, to: number, step: number, duration: number): Promise<void> {
    return this.effect('sweep', [from, to, step, duration]);
  }

  /**
   * One call of the four routines: the Original set plays the speaker as it
   * sounded, the Standard set its chip voice. The sound starts at once; the
   * game waits a moment at most, or the whole of it where the sound is the
   * timing (TIMED).
   */
  private async effect(kind: Kind, args: number[]): Promise<void> {
    const runs = RUNS[kind](args);
    const length = runsLength(runs);
    const effect = identify(this.data, kind, args);
    const name = effect?.name ?? `${kind}:${args.join(',')}`;
    const wait = TIMED.has(name) ? length : Math.min(length, PACE);
    const ctx = this.ctx;
    if (ctx && this.out && this.effectsLevel > 0) this.start(ctx, kind, args, name);
    await this.wait(wait * 1000);
  }

  /**
   * One of the ultima3 port's sounds by name (game/cues.ts), in the Standard set: started at once, as an effect is,
   * and waited a moment at most. The footfalls a turn repeats are a little different each time.
   */
  async cue(name: string): Promise<void> {
    if (this.effects !== 'standard' || this.effectsLevel === 0) return;
    const varies = name === 'HorseWalk';
    let pcm = varies ? null : (this.cues.get(name) ?? null);
    if (!pcm) {
      pcm = u3Effect(name, varies ? Math.pow(2, ((Math.random() - 0.5) * 0.8) / 12) : 1) ?? new Float32Array(1);
      if (!varies) this.cues.set(name, pcm);
    }
    const ctx = this.ctx;
    if (ctx && this.out) this.play(ctx, pcm, `cue:${name}`);
    await this.wait(Math.min(pcm.length / RATE, PACE) * 1000);
  }

  nearby(d2: number): void {
    this.near2 = d2;
  }

  /** Start an effect now, as the ultima3 port mixes them - water in the Standard set kept sounding instead. */
  private start(ctx: AudioContext, kind: Kind, args: number[], name: string): void {
    if (WATERS[name] && this.effects === 'standard') return this.water(ctx, name);
    this.play(ctx, () => (this.effects === 'original' ? renderRuns(RUNS[kind](args), RATE) : this.chip(kind, args)), name);
  }

  /**
   * Play effect `name` now, as the ultima3 port mixes: not again within a few dozen milliseconds, and not over a long
   * one still sounding. `make` gives its sound, made only when it plays.
   */
  private play(ctx: AudioContext, make: Float32Array | (() => Float32Array), name: string): void {
    // Held, the clock stands still: a sound started now would wait there and sound with the rest on the hold's lifting.
    if (ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastStart.get(name) ?? -Infinity) < MIN_INTERVAL_MS) return;
    if ((this.ends.get(name) ?? 0) > ctx.currentTime) return; // a long one still sounding
    this.lastStart.set(name, now);
    this.sound(ctx, typeof make === 'function' ? make() : make, name);
  }

  /** Sound `pcm` into the mix: a long one marked as sounding, and the music lowered under it. */
  private sound(ctx: AudioContext, pcm: Float32Array, name: string): void {
    if (pcm.length <= 1) return;
    const played = pcm.length / RATE;
    const start = ctx.currentTime + 0.005;
    const buf = ctx.createBuffer(1, pcm.length, RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out!);
    src.start(start);
    if (played >= LONG && !TIMED.has(name)) this.ends.set(name, start + played);
    if (ducks(name, played)) this.player.duck(start, start + played);
  }

  /**
   * Water's call (a waterfall's, a fountain's), in the Standard set: its loops sound on - begun, faded in, if they were
   * not - at the level for how near it is, eased to; and if no call comes again for a while, they fade away (hush).
   */
  private water(ctx: AudioContext, name: string): void {
    const now = ctx.currentTime;
    const level = WATERS[name].level(this.near2);
    this.near2 = 0; // told before each call; the introduction's falls, untold, are near
    let water = this.waters.get(name);
    if (!water) {
      let loops = this.waterLoops.get(name);
      if (!loops) this.waterLoops.set(name, (loops = WATERS[name].loops(Math.random)));
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.connect(this.out!);
      const sources = loops.map((pcm) => {
        const buf = ctx.createBuffer(1, pcm.length, RATE);
        buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(gain);
        src.start(now, Math.random() * buf.duration); // anywhere in the loop: not the same moment each time
        return src;
      });
      water = { gain, sources, level: -1 };
      this.waters.set(name, water);
    }
    if (Math.abs(level - water.level) > 0.01) {
      water.gain.gain.setTargetAtTime(level, now, WATER_EASE / 3);
      water.level = level;
    }
    clearTimeout(water.quiet);
    water.quiet = setTimeout(() => this.hush(false, name), WATER_QUIET_MS);
  }

  /**
   * Water no longer heard fades away - its calls stopped, as they do under the pause menu - but for that held with
   * everything else (the page away), which waits to be heard again; `now`, at once (another set of effects chosen).
   * `name` the one water, or all of it.
   */
  private hush(now: boolean, name?: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [key, water] of [...this.waters]) {
      if (name && key !== name) continue;
      clearTimeout(water.quiet);
      if (!now && ctx.state !== 'running') {
        water.quiet = setTimeout(() => this.hush(false, key), WATER_QUIET_MS);
        continue;
      }
      this.waters.delete(key);
      const t = ctx.currentTime;
      const ease = now ? 0.05 : WATER_EASE / 3;
      water.gain.gain.cancelScheduledValues(t);
      water.gain.gain.setValueAtTime(water.gain.gain.value, t);
      water.gain.gain.setTargetAtTime(0, t, ease);
      for (const src of water.sources) src.stop(t + ease * 8);
    }
  }

  /** The Standard voice, cached unless it varies each play. */
  private chip(kind: Kind, args: number[]): Float32Array {
    const effect = identify(this.data, kind, args);
    const varies = !!effect && (REPEATED.has(effect.name) || effect.name.startsWith('spell'));
    const key = `${kind}:${args.join(',')}`;
    if (!varies) {
      const hit = this.chips.get(key);
      if (hit) return hit;
    }
    const pcm = standard(effect, kind, args, Math.random);
    if (!varies) this.chips.set(key, pcm);
    return pcm;
  }

  /** Arrangement `arrangement`'s file of tune `name`, decoded; null where there is none, or it will not load. */
  private decode(ctx: AudioContext, arrangement: Arrangement, name: string): Promise<AudioBuffer | null> {
    const key = `${arrangement}/${name}`;
    let got = this.decoded.get(key);
    if (!got) {
      if (performance.now() - (this.failedAt.get(key) ?? -Infinity) < RETRY_AFTER) return Promise.resolve(null);
      const entry = MUSIC[name]?.[arrangement];
      const made = entry
        ? fetch(`${import.meta.env.BASE_URL}music/${entry.file}`)
            .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
            .then((bytes) => ctx.decodeAudioData(bytes))
            .catch(() => null)
        : Promise.resolve(null);
      // A tune that would not load is not kept as lost: it is tried again, but not for a minute.
      got = made.then((buffer) => {
        if (buffer) this.failedAt.delete(key);
        else {
          this.failedAt.set(key, performance.now());
          if (this.decoded.get(key) === got) this.decoded.delete(key);
        }
        return buffer;
      });
      this.decoded.set(key, got);
      // The oldest let go past the last few: the one playing, and the one before it to come back to.
      while (this.decoded.size > KEEP_DECODED) this.decoded.delete(this.decoded.keys().next().value!);
    } else {
      this.decoded.delete(key);
      this.decoded.set(key, got); // the newest again
    }
    return got;
  }

  /**
   * Tune `tune` (game/music.ts Tune; 0 for none) played on `occasion`: in an arrangement the soundtrack chosen plays
   * there (audio/soundtracks.ts) - one picked at random where it has several, not the one the tune played in last -
   * or, where that file cannot be had (offline before its first fetch, a decode that fails), another of them, then the
   * Remastered's, then the Original's, else none. The same tune asked for again plays on, as does one asked for on
   * another occasion where what is playing is still one of its arrangements there (Britannia's at dusk is not, and
   * crossfades to the night's); a tune asked for and then another before it has loaded gives way to the last.
   */
  music(tune: number, occasion?: Occasion): void {
    this.wanted = tune;
    this.occasion = occasion;
    const name = TUNE_FILES[tune - 1];
    const ctx = this.ctx;
    if (!this.musicOn || !name || !ctx) {
      this.asked = '';
      this.player.stop();
      return;
    }
    const voice = this.voice;
    const ask = `${voice}|${name}|${occasion ?? ''}`;
    if (ask === this.asked) return;
    this.asked = ask;
    const choices = arrangementsFor(voice, name, occasion).filter((a) => MUSIC[name]?.[a]);
    if (choices.some((a) => this.player.playing === `${a}/${name}`)) return;
    const first = choices.length ? pick(choices, this.lastPlayed.get(name), this.random) : undefined;
    const order = [...new Set([first, ...choices, 'remastered', 'original'])].filter(
      (a): a is Arrangement => !!a && !!MUSIC[name]?.[a as Arrangement],
    );
    void (async () => {
      for (const arrangement of order) {
        const buffer = await this.decode(ctx, arrangement, name);
        // Asked for something else meanwhile, or the music turned off: this one is not wanted now.
        if (this.asked !== ask || !this.musicOn) return;
        if (!buffer) continue;
        this.lastPlayed.set(name, arrangement);
        const { loopStart, loopEnd } = MUSIC[name][arrangement]!;
        this.player.play(`${arrangement}/${name}`, buffer, loopStart, loopEnd);
        return;
      }
      // None would load: asked for again, it is tried again (each file not within a minute of its failing).
      this.asked = '';
      this.player.stop();
    })();
  }

  /** The tune asked for, chosen afresh: the soundtrack, or whether music plays, has changed, or audio has begun. */
  private musicAgain(): void {
    this.asked = '';
    this.music(this.wanted, this.occasion);
  }

  /** The Music setting's soundtrack: the tune playing taken up again in it, crossfaded. */
  setMusicVoice(voice: MusicVoice): void {
    if (voice === this.voice) return;
    this.voice = voice;
    this.musicAgain();
  }

  /** The Sound FX setting changed: the set, and the level it is heard at. */
  setEffects(set: SoundSet, level: number): void {
    this.effects = set;
    this.effectsLevel = level;
    if (set !== 'standard' || level === 0) this.hush(true);
    if (this.out) this.out.gain.value = effectsGain(set, level);
  }

  /** The Music setting changed: at no level it stops, at any other it plays at that level. */
  setMusic(level: number): void {
    this.musicOn = level > 0;
    this.player.setVolume(musicGain(level));
    this.musicAgain();
  }

  /** What is holding the sound: the page is away, the pause menu or a list of settings is up. */
  private readonly holds = new Set<Hold>();
  /** The music heard over a menu's hold: the bar on the Music or Music level line (hearMusic). */
  private hearing = false;

  /**
   * Hold the sound, or let it go, for one reason. The page away holds everything: the whole audio context stops, so
   * the music and anything still ringing hold where they are and take up again where they left off. A menu over the
   * game (the pause menu, Settings) holds only the music - paused where it is, to go on from there - so the menu's own
   * clicks are heard as they are made, not saved up for when it lets go. The sound comes back only when every reason
   * has let go: a window that comes back while the menu is up leaves the music paused until the player resumes.
   */
  setHeld(reason: Hold, held: boolean): void {
    if (held) this.holds.add(reason);
    else this.holds.delete(reason);
    this.holdMusic();
    if (!this.ctx) return;
    if (!this.holds.has('focus')) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } else if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** The music heard though a menu holds it (the Music or Music level line under the bar, its dial), or held again. */
  hearMusic(on: boolean): void {
    this.hearing = on;
    this.holdMusic();
  }

  /** The music paused while a menu holds it, but where it is to be heard. */
  private holdMusic(): void {
    this.player.hold((this.holds.has('menu') || this.holds.has('settings')) && !this.hearing);
  }
}
