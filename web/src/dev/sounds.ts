/**
 * sounds.ts
 *
 * The sound test page (sounds.html): every sound the game makes, by name -
 * the DOS game's effects (u5d's names), its families of notes, and the
 * port's own cues (game/cues.ts) - with what each is, when and how often
 * the game plays it, where in the code, and the voice it has; a button
 * plays it through the game's own PcSound, as each of the three suites that
 * match the soundtracks (audio/sfxKeys.ts), or as Upgrade (2001)'s PC
 * speaker. Above them, the
 * music: every tune in every arrangement each soundtrack plays, so an
 * effect can be heard over the tune it will sit on.
 */

import { gameFiles } from '../boot.ts';
import { GameData } from '../game/data.ts';
import { identify, RULES, type Kind } from '../audio/effects.ts';
import { cueKey, sfxKey, SUITES, type Suite } from '../audio/sfxKeys.ts';
import { type Arrangement, arrangementsFor, SOUNDTRACKS, type Soundtrack } from '../audio/soundtracks.ts';
import { TUNE_FILES } from '../game/music.ts';
import audition from './audition.json';
import { MUSIC, MusicPlayer } from '../ui/music.ts';
import { SFX_MANIFEST as SFX } from '../ui/sfxBank.ts';
import { musicGain, PcSound } from '../ui/sound.ts';
import { ABOUT, type About, CUES, FAMILY, GROUPS } from './sfxCatalogue.ts';

interface Entry {
  name: string;
  group: string;
  /** The calls, in order (a run is many). */
  calls: [Kind, number[]][];
}

const GROUP_OF: [RegExp, string][] = [
  [/^(step|dunstep|blocked|deny|tick|attack|damage|drip|status)/, 'Every turn'],
  [/^(foefire|launch|cannon|burst|shiphit|victory|failure|vanish)/, 'Combat'],
  [/^spell|^cast|^chant/, 'Spells'],
  [/^(harpsichord|lute|shop|chime)/, 'Instruments and shops'],
];

function group(name: string): string {
  for (const [re, g] of GROUP_OF) if (re.test(name)) return g;
  return 'Places and events';
}

function entries(data: GameData): Entry[] {
  const out: Entry[] = [];
  for (const [kind, args, name] of RULES) out.push({ name, group: group(name), calls: [[kind, args]] });
  const w = (a: number, n: number): number[] => data.ovl.words(a, n);
  const s16 = (v: number): number => (v << 16) >> 16;
  w(0x2746, 10).forEach((f, i) =>
    out.push({ name: `harpsichord ${i}`, group: group('harpsichord'), calls: [['pulse', [f, 1, 4000, 20000, -4]]] }),
  );
  w(0x6a36, 9).forEach((f, i) => out.push({ name: `lute ${i}`, group: group('lute'), calls: [['pulse', [f, 1, 2000, 20000, -10]]] }));
  for (let i = 1; i < 9; i++) {
    out.push({
      name: `cast circle ${i}`,
      group: group('cast'),
      calls: [['pulse', [w(0x4af6, 9)[i], 1, i * 4000 + 10000, w(0x4b08, 9)[i], s16(w(0x4b2c, 9)[i])]]],
    });
  }
  const phrase = (name: string, f: number, d: number, wd: number, inc: number, n: number): void => {
    out.push({
      name,
      group: group(name),
      calls: Array.from({ length: n }, (_, i): [Kind, number[]] => ['pulse', [w(f, n)[i], 1, w(d, n)[i], w(wd, n)[i], s16(w(inc, n)[i])]]),
    });
  };
  phrase('chant (shrine)', 0x4be6, 0x4bf4, 0x4c02, 0x4c10, 7);
  phrase('blackthorn', 0x3720, 0x372c, 0x3738, 0x3744, 6);
  out.push({
    name: 'apparition',
    group: group('apparition'),
    calls: w(0x3a26, 6).map((f): [Kind, number[]] => ['pulse', [f, 1, 5000, 200, 0xd]]),
  });
  const run = (name: string, freq: number, len: number): void => {
    const calls: [Kind, number[]][] = [];
    for (let f = 2000; f < 25000; f += 0x32) calls.push(['pulse', [freq, 1, len, f, 0]]);
    for (let f = 25000; f > 2000; f -= 0x32) calls.push(['pulse', [freq, 1, len, f, 0]]);
    out.push({ name, group: group(name), calls });
  };
  run('gemshard', 0xa50, 200);
  run('shrine1', 0xa8c, 200);
  run('shrine2', 0xc1c, 0x96);
  return out;
}

/** The ways the page plays the effects: the three suites, and Upgrade (2001)'s speaker - the Sound setting's four. */
type PlayAs = Suite | 'original';
const PLAY_AS: [PlayAs, string][] = [
  ['classical', 'Classical'],
  ['electronic', 'Electronic'],
  ['ambient', 'Ambient'],
  ['original', 'Upgrade (2001)'],
];
const isSuite = (set: PlayAs): set is Suite => (SUITES as readonly string[]).includes(set);

/** The soundtracks as the Audio menu names them (game/menu.ts SOUNDTRACK_NAMES). */
const SOUNDTRACK_NAMES: Record<Soundtrack, string> = {
  classical: 'Classical',
  electronic: 'Electronic',
  remastered: 'Ambient',
  original: 'Upgrade (2001)',
};
const OCCASIONS = [undefined, 'title', 'shrine', 'introduction', 'closing', 'night'] as const;

/** A row of the page: a sound, what the catalogue says of it, and how to play it. */
interface Row {
  name: string;
  about: About;
  /** The voice it has, in words, played as `set`. */
  voice: (set: PlayAs) => string;
  /** The ways to play it: one button each (a family has one a note); `run` null where `set` makes no sound of it. */
  plays: { label: string; run: (set: PlayAs) => (() => Promise<void>) | null; folded: (set: PlayAs) => boolean }[];
}

const OFTEN_ORDER = ['every step', 'every blow', 'often', 'now and then', 'rare', 'once'];

/** What a suite plays for a sound (its key, or null for the shared voice), in words. */
function suiteVoice(suite: Suite, key: ReturnType<typeof sfxKey>): string {
  if (key === 'silent') return 'folded: silent alone';
  if (key && (key.key === 'watrfall' || key.key === 'fountain')) return "the water's loops (the chip's, kept sounding)";
  if (!key || !SFX[suite]?.slices[key.key]) return 'the chip voice, softened';
  return key.hz ? 'a note of its bank, at the pitch' : "rendered in the suite's file";
}

/** The music: a row a tune, a column a soundtrack, a button an arrangement it plays there; played on its own context. */
function musicTable(host: HTMLElement): void {
  let ctx: AudioContext | null = null;
  const player = new MusicPlayer(() => ctx, musicGain(6));
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  let on: HTMLButtonElement | null = null;
  const play = async (button: HTMLButtonElement, tune: string, arrangement: Arrangement): Promise<void> => {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const entry = MUSIC[tune][arrangement]!;
    let got = decoded.get(entry.file);
    if (!got) {
      got = fetch(`${import.meta.env.BASE_URL}music/${entry.file}`)
        .then((res) => res.arrayBuffer())
        .then((bytes) => ctx!.decodeAudioData(bytes))
        .catch(() => null);
      decoded.set(entry.file, got);
      while (decoded.size > 2) decoded.delete(decoded.keys().next().value!);
    }
    on?.classList.remove('on');
    on = button;
    button.classList.add('on');
    const buffer = await got;
    if (on !== button || !buffer) return;
    player.play(`${arrangement}/${tune}`, buffer, entry.loopStart, entry.loopEnd);
  };
  const h = document.createElement('h2');
  h.textContent = 'Music';
  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  stop.addEventListener('click', () => {
    player.stop();
    on?.classList.remove('on');
    on = null;
  });
  const note = document.createElement('p');
  note.className = 'about';
  note.textContent = 'Every tune in every arrangement a soundtrack plays it in, at the default Music level: play an effect over it.';
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const t of ['Tune', ...SOUNDTRACKS.map((s) => SOUNDTRACK_NAMES[s])])
    head.appendChild(Object.assign(document.createElement('th'), { textContent: t }));
  const body = table.createTBody();
  for (const tune of TUNE_FILES) {
    const tr = body.insertRow();
    tr.insertCell().textContent = tune.replace(/\.XMI$/, '');
    for (const soundtrack of SOUNDTRACKS) {
      const cell = tr.insertCell();
      cell.className = 'play';
      const arrangements = [...new Set(OCCASIONS.flatMap((o) => arrangementsFor(soundtrack, tune, o)))].filter((a) => MUSIC[tune]?.[a]);
      for (const a of arrangements) {
        const b = document.createElement('button');
        b.textContent = a;
        b.title = `${tune} in ${a} (${SOUNDTRACK_NAMES[soundtrack]})`;
        b.addEventListener('click', () => void play(b, tune, a));
        cell.appendChild(b);
      }
    }
  }
  host.append(h, note, stop, table);
}

/**
 * The audition (tools/sfx/audition.ts): candidates for a sound, to choose by ear; a star marks a favourite (kept in this browser), and
 * the picks are listed to copy.
 */
function auditionTable(host: HTMLElement): void {
  let ctx: AudioContext | null = null;
  let buffer: Promise<AudioBuffer | null> | null = null;
  const KEY = 'u5-audition-picks';
  const picks = new Set<string>(
    ((): string[] => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
  );
  const play = async (at: number, length: number): Promise<void> => {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    buffer ??= fetch(`${import.meta.env.BASE_URL}${audition.file}`)
      .then((res) => res.arrayBuffer())
      .then((bytes) => ctx!.decodeAudioData(bytes))
      .catch(() => null);
    const b = await buffer;
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(ctx.currentTime + 0.01, at, length);
  };
  const h = document.createElement('h2');
  h.textContent = 'Audition: the magic';
  const note = document.createElement('p');
  note.className = 'about';
  note.textContent =
    'Every magic effect as the game plays it (the same in every suite): the sub bloom under all of it, the chamber from the third circle, the whispers from the sixth, everything at the eighth. Star the ones you like.';
  const list = document.createElement('p');
  list.className = 'about';
  const showPicks = (): void => {
    list.textContent = `Your picks: ${[...picks].join('; ') || 'none yet'}`;
    try {
      localStorage.setItem(KEY, JSON.stringify([...picks]));
    } catch {
      // (Not kept: the picks are still listed.)
    }
  };
  const table = document.createElement('table');
  const body = table.createTBody();
  for (const it of audition.items) {
    const tr = body.insertRow();
    const cell = tr.insertCell();
    cell.className = 'play';
    const b = document.createElement('button');
    b.textContent = '▶';
    b.addEventListener('click', () => void play(it.slice[0], it.slice[1]));
    const star = document.createElement('button');
    const mark = (): void => void (star.textContent = picks.has(it.label) ? '★' : '☆');
    mark();
    star.title = 'A favourite';
    star.addEventListener('click', () => {
      if (picks.has(it.label)) picks.delete(it.label);
      else picks.add(it.label);
      mark();
      showPicks();
    });
    cell.append(b, star);
    tr.insertCell().textContent = it.label;
  }
  showPicks();
  host.append(h, note, table, list);
}

async function start(): Promise<void> {
  auditionTable(document.getElementById('audition')!);
  musicTable(document.getElementById('music')!);
  const files = await gameFiles();
  const data = new GameData(files);
  const sound = new PcSound(data.ovl);
  const main = document.getElementById('effects')!;
  main.textContent = '';
  const all = entries(data);
  let playing = 0;
  const calls = (e: Entry) => (set: PlayAs) => async (): Promise<void> => {
    sound.unlock();
    sound.setEffects(set, 8);
    const mine = ++playing;
    for (const [kind, args] of e.calls) {
      if (mine !== playing) return;
      if (kind === 'pulse') await sound.pulse(args[0], args[1], args[2], args[3], args[4]);
      else if (kind === 'noise') await sound.noise(args[0], args[1], args[2]);
      else if (kind === 'tone') await sound.tone(args[0], args[1]);
      else await sound.sweep(args[0], args[1], args[2], args[3]);
    }
  };
  /** A sound's key in the suites, by its first call. */
  const keyOf = (e: Entry): ReturnType<typeof sfxKey> => {
    const [kind, args] = e.calls[0];
    return sfxKey(identify(data.ovl, kind, args), kind, args);
  };
  const byName = new Map(all.map((e) => [e.name, e]));

  const rows: Row[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const e of all) {
    const family = Object.keys(FAMILY).find((f) => e.name === f || e.name.startsWith(`${f} `));
    if (family) {
      if (seen.has(family)) continue;
      seen.add(family);
      const members = all.filter((m) => m.name === family || m.name.startsWith(`${family} `));
      rows.push({
        name: family,
        about: FAMILY[family],
        voice: (set) => (set === 'original' ? 'the PC speaker' : suiteVoice(set, keyOf(members[0]))),
        plays: members.map((m) => {
          const folded = (set: PlayAs): boolean => isSuite(set) && keyOf(m) === 'silent';
          return {
            label: m.name === family ? '▶' : m.name.slice(family.length + 1),
            folded,
            run: (set: PlayAs) => (folded(set) ? null : calls(m)(set)),
          };
        }),
      });
      continue;
    }
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    const about = ABOUT[e.name];
    if (!about) {
      unknown.push(e.name);
      continue;
    }
    const folded = (set: PlayAs): boolean => isSuite(set) && keyOf(e) === 'silent';
    rows.push({
      name: e.name,
      about,
      voice: (set) => (set === 'original' ? 'the PC speaker' : suiteVoice(set, keyOf(e))),
      plays: [{ label: '▶', folded, run: (set) => (folded(set) ? null : calls(e)(set)) }],
    });
  }
  for (const [name, about] of Object.entries(CUES)) {
    const fallback = about.original ? byName.get(about.original) : undefined;
    rows.push({
      name,
      about,
      voice: (set) =>
        set === 'original'
          ? fallback
            ? `the PC speaker's ${fallback.name}`
            : 'none: the DOS game was silent'
          : suiteVoice(set, { key: cueKey(name) }),
      plays: [
        {
          label: '▶',
          folded: () => false,
          run: (set) =>
            set === 'original'
              ? fallback
                ? calls(fallback)(set)
                : null
              : async () => {
                  sound.unlock();
                  sound.setEffects(set, 8);
                  ++playing;
                  await sound.cue(name);
                },
        },
      ],
    });
  }

  const controls = document.getElementById('controls')!;
  let set: PlayAs = 'classical';
  const setButtons = PLAY_AS.map(([v, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      set = v;
      for (const x of setButtons) x.classList.toggle('on', x === b);
      // A gesture: the audio may start, and a suite's file is fetched now, ready for the first effect.
      sound.unlock();
      sound.setEffects(v, 8);
      render();
    });
    return b;
  });
  setButtons[0].classList.add('on');
  const often = document.createElement('select');
  for (const o of ['any', ...OFTEN_ORDER]) often.add(new Option(o === 'any' ? 'How often: any' : o, o));
  often.addEventListener('change', () => render());
  controls.append('Play as ', ...setButtons, often);

  const render = (): void => {
    main.textContent = '';
    for (const g of GROUPS) {
      const mine = rows.filter((r) => r.about.group === g && (often.value === 'any' || r.about.often === often.value));
      if (!mine.length) continue;
      const h = document.createElement('h2');
      h.textContent = g;
      main.appendChild(h);
      const table = document.createElement('table');
      const head = table.createTHead().insertRow();
      for (const t of ['', 'Sound', 'When it plays', 'How often', 'Where', 'Voice'])
        head.appendChild(Object.assign(document.createElement('th'), { textContent: t }));
      const body = table.createTBody();
      for (const r of mine.sort((a, b) => OFTEN_ORDER.indexOf(a.about.often) - OFTEN_ORDER.indexOf(b.about.often))) {
        const tr = body.insertRow();
        const play = tr.insertCell();
        play.className = 'play';
        for (const p of r.plays) {
          const b = document.createElement('button');
          const run = p.run(set);
          b.textContent = run ? p.label : p.folded(set) ? 'folded' : 'silent';
          b.disabled = !run;
          b.title = run
            ? `Play ${r.name}${p.label === '▶' ? '' : ` ${p.label}`} (${set})`
            : p.folded(set)
              ? 'Played within another sound'
              : 'The DOS game made no sound here';
          if (run) b.addEventListener('click', () => void run());
          play.appendChild(b);
        }
        const what = tr.insertCell();
        what.innerHTML = `<b></b><br><code></code>`;
        what.querySelector('b')!.textContent = r.about.what;
        what.querySelector('code')!.textContent = r.name;
        tr.insertCell().textContent = r.about.when;
        const o = tr.insertCell();
        o.innerHTML = `<span class="often"></span>`;
        o.firstElementChild!.textContent = r.about.often;
        o.firstElementChild!.className = `often o${OFTEN_ORDER.indexOf(r.about.often)}`;
        tr.insertCell().className = 'where';
        tr.cells[4].textContent = r.about.where;
        tr.insertCell().className = 'voice';
        tr.cells[5].textContent = r.voice(set);
      }
      main.appendChild(table);
    }
    if (unknown.length) main.insertAdjacentHTML('beforeend', `<p class="note">Not yet described: ${unknown.join(', ')}</p>`);
  };
  render();
}

start().catch((err: unknown) => {
  document.getElementById('effects')!.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
