import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readXmiEvents } from '../src/audio/xmi.ts';
import { ARRANGEMENTS, arrangementsOf } from '../src/audio/soundtracks.ts';
import { HEARD_ONCE, TUNE_FILES } from '../src/game/music.ts';
import { CROSSFADE, heldAt, MUSIC, MusicPlayer } from '../src/ui/music.ts';
import { rewritten } from '../tools/music/rewrites.ts';
import { GAMEDATA } from './helpers.ts';

const UPGRADE = join(GAMEDATA, 'upgrade');

describe("the Upgrade's music", () => {
  it('reads every XMI file of a copy of the Upgrade into a tune of notes', () => {
    const names = readdirSync(UPGRADE).filter((n) => n.endsWith('.XMI'));
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const tune = readXmiEvents(new Uint8Array(readFileSync(join(UPGRADE, name))));
      expect(tune.events.filter((e) => e.kind === 'on').length, name).toBeGreaterThan(20);
      expect(tune.length, name).toBeGreaterThan(5);
      expect(tune.length, name).toBeLessThan(600);
    }
  });

  it('is rendered in every arrangement a soundtrack plays, every tune a file with its loop inside it, and no other', () => {
    const named = new Set<string>();
    for (const name of TUNE_FILES) {
      const upgrade = readXmiEvents(new Uint8Array(readFileSync(join('public', 'music', name))));
      // A tune heard once rests five seconds before it comes round.
      const rest = HEARD_ONCE.includes(name) ? 5 : 0;
      for (const arrangement of arrangementsOf(name)) {
        const t = MUSIC[name]?.[arrangement];
        expect(t, `${arrangement} ${name}`).toBeDefined();
        if (!t) continue;
        expect(existsSync(join('public', 'music', t.file)), t.file).toBe(true);
        expect(t.loopStart).toBeGreaterThan(0); // the head, and its end before it, against a decoder's priming (tools/music/pcm.ts)
        // Remastered as some tunes are rewritten (tools/music/rewrites.ts); Original as the Upgrade wrote every one; the
        // styles as they play it (some slower).
        if (arrangement === 'original') expect(t.loopEnd - t.loopStart).toBeCloseTo(upgrade.length + rest, 2);
        else if (arrangement === 'remastered') expect(t.loopEnd - t.loopStart).toBeCloseTo(rewritten(name, upgrade).length + rest, 2);
        else expect((t.loopEnd - t.loopStart - rest) / upgrade.length, `${arrangement} ${name}`).toBeGreaterThan(0.5);
        // Named for what it holds, and the only file of its tune in the folder.
        expect(t.file, name).toMatch(new RegExp(`^${arrangement}/${name.replace('.XMI', '')}\\.[0-9a-f]{8}\\.ogg$`));
        const stem = name.replace('.XMI', '');
        expect(readdirSync(join('public', 'music', arrangement)).filter((f) => f.startsWith(`${stem}.`))).toEqual([t.file.split('/')[1]]);
        named.add(t.file);
      }
    }
    // No file the manifest does not name: no arrangement no soundtrack plays, no MP3 of before.
    for (const arrangement of ARRANGEMENTS) {
      const dir = join('public', 'music', arrangement);
      if (existsSync(dir)) for (const f of readdirSync(dir)) expect(named.has(`${arrangement}/${f}`), `${arrangement}/${f}`).toBe(true);
    }
  });
});

/** A fake audio context recording what is made and when. */
function context() {
  const log: string[] = [];
  const sources: { onended: (() => void) | null }[] = [];
  const param = (name: string) => ({
    value: 1,
    setValueAtTime: (v: number, t: number) => void log.push(`${name} set ${v} @${t}`),
    linearRampToValueAtTime: (v: number, t: number) => void log.push(`${name} ramp ${v} @${t}`),
    cancelScheduledValues: () => undefined,
    setTargetAtTime: () => undefined,
  });
  let gains = 0;
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => {
      const id = gains++;
      return {
        gain: param(`gain${id}`),
        connect: (n: unknown) => n,
        disconnect: () => void log.push(`gain${id} disconnect`),
        context: ctx,
      };
    },
    createBufferSource: () => {
      const src = {
        buffer: null as unknown,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        onended: null as (() => void) | null,
        connect: (n: unknown) => n,
        start: (t: number, offset: number) => void log.push(`start @${t} from ${offset} loop ${src.loopStart}-${src.loopEnd}`),
        stop: (t: number) => void log.push(`stop @${t}`),
      };
      sources.push(src);
      return src;
    },
  };
  return { ctx: ctx as unknown as AudioContext, log, sources, clock: (t: number) => void (ctx.currentTime = t) };
}

describe('the music player', () => {
  const buffer = { duration: 70 } as AudioBuffer;

  it('pauses where it has got to, and goes on from there, its loop taken round', () => {
    const { ctx, log, clock } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('a', buffer, 4, 60);
    clock(30); // twenty seconds in
    player.hold(true);
    expect(player.playing).toBe('a'); // paused, not gone
    expect(log.some((l) => l.startsWith('stop'))).toBe(true);
    clock(100); // however long the menu is up
    player.hold(false);
    expect(log).toContain('start @100 from 20 loop 4-60');
    // Past the loop's end, round from its start.
    expect(heldAt({ loopStart: 4, loopEnd: 60, startAt: 0 }, 70)).toBeCloseTo(4 + ((70 - 4) % 56));
  });

  it('while paused, keeps a tune asked for to start when let go, and forgets one stopped', () => {
    const { ctx, log } = context();
    const player = new MusicPlayer(() => ctx);
    player.hold(true);
    player.play('b', buffer, 1, 50);
    expect(log.some((l) => l.startsWith('start'))).toBe(false);
    expect(player.playing).toBe('b');
    player.hold(false);
    expect(log).toContain('start @10 from 0 loop 1-50');
    player.hold(true);
    player.stop();
    player.hold(false);
    expect(player.playing).toBe('');
  });

  it('starts a tune at the file’s start and loops it between its loop’s points, fading it in', () => {
    const { ctx, log } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('remastered/BRITLAND.XMI', buffer, 4.5, 68.4);
    expect(player.playing).toBe('remastered/BRITLAND.XMI');
    expect(log).toContain('start @10 from 0 loop 4.5-68.4');
    expect(log).toContain(`gain0 ramp 1 @${10 + CROSSFADE}`); // its fade (gain0; gain1 is the music's level)
  });

  it('can begin a tune elsewhere in its file than the start', () => {
    const { ctx, log } = context();
    new MusicPlayer(() => ctx).play('a', buffer, 4.5, 60, 2);
    expect(log).toContain('start @10 from 2 loop 4.5-60');
  });

  it('plays on for the same tune, and crossfades to another', () => {
    const { ctx, log } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('a', buffer, 0.5, 60);
    const before = log.length;
    player.play('a', buffer, 0.5, 60);
    expect(log).toHaveLength(before); // nothing new
    player.play('b', buffer, 0.5, 60);
    expect(log).toContain(`gain0 ramp 0 @${10 + CROSSFADE}`); // a fades out
    expect(log).toContain(`gain2 ramp 1 @${10 + CROSSFADE}`); // as b fades in
    expect(log.filter((l) => l.startsWith('start'))).toHaveLength(2); // b begins
    expect(player.playing).toBe('b');
  });

  it('fades away on stop, and says it plays nothing', () => {
    const { ctx, log } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('a', buffer, 0.5, 60);
    player.stop();
    expect(player.playing).toBe('');
    expect(log.some((l) => l.startsWith('stop'))).toBe(true);
  });

  it('fades down from where its fade-in has got to, as the clock tells, not from a gain value an engine may not give mid-ramp', () => {
    const { ctx, log, clock } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('a', buffer, 0.5, 60);
    clock(10 + CROSSFADE / 2); // half way up
    player.stop();
    expect(log).toContain('gain0 set 0.5 @10.25');
    expect(log).toContain(`gain0 ramp 0 @${10.25 + CROSSFADE}`);
    // A tune that has been heard some time fades from full.
    const again = new MusicPlayer(() => ctx);
    clock(20);
    again.play('b', buffer, 0.5, 60);
    clock(30);
    again.stop();
    expect(log.some((l) => / set 1 @30$/.test(l))).toBe(true);
  });

  it('lets go of a tune’s fade once the tune has ended', () => {
    const { ctx, log, sources } = context();
    const player = new MusicPlayer(() => ctx);
    player.play('a', buffer, 0.5, 60);
    player.stop();
    expect(log.some((l) => l.endsWith('disconnect'))).toBe(false); // still fading
    sources[0].onended?.();
    expect(log).toContain('gain0 disconnect');
  });
});

describe("the music player's level", () => {
  it('is set from now, leaving no duck pending to bring the old level back', () => {
    const calls: string[] = [];
    const gain = {
      value: 0.12,
      cancelScheduledValues: (t: number) => void calls.push(`cancel ${t}`),
      setValueAtTime: (v: number, t: number) => void calls.push(`set ${v} ${t}`),
      setTargetAtTime: () => void calls.push('target'),
    };
    const player = new MusicPlayer(() => null);
    (player as unknown as { out: unknown }).out = { gain, context: { currentTime: 3 } };
    player.setVolume(0.5);
    expect(calls).toEqual(['cancel 3', 'set 0.5 3']);
  });
});
