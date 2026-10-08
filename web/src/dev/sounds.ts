/**
 * sounds.ts
 *
 * The sound test page (sounds.html): every sound the game makes, by name -
 * the DOS game's effects (u5d's names), its families of notes, and the
 * port's own cues (game/cues.ts) - with what each is, when and how often
 * the game plays it, where in the code, and the voice the Standard set
 * gives it; a button plays it, in the Standard set or the Original, through
 * the game's own PcSound.
 */

import { gameFiles } from '../boot.ts';
import { GameData } from '../game/data.ts';
import { RULES, type Kind } from '../audio/effects.ts';
import { FOLDED, SHARED } from '../audio/chip.ts';
import { PcSound } from '../ui/sound.ts';
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

/** A row of the page: a sound, what the catalogue says of it, and how to play it. */
interface Row {
  name: string;
  about: About;
  /** The Standard voice, in words. */
  voice: string;
  /** The ways to play it: one button each (a family has one a note). */
  plays: { label: string; standard: (() => Promise<void>) | null; original: (() => Promise<void>) | null }[];
}

const OFTEN_ORDER = ['every step', 'every blow', 'often', 'now and then', 'rare', 'once'];

async function start(): Promise<void> {
  const files = await gameFiles();
  const data = new GameData(files);
  const sound = new PcSound(data.ovl);
  const main = document.getElementById('effects')!;
  main.textContent = '';
  const all = entries(data);
  let playing = 0;
  const calls = (e: Entry, set: 'original' | 'standard') => async (): Promise<void> => {
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
  const byName = new Map(all.map((e) => [e.name, e]));

  // The rows: the DOS effects (once each), the families (a button a note), the port's own cues.
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
        voice:
          family === 'cast circle'
            ? 'folded into the spell (ultima3 Spell): silent alone'
            : family === 'blackthorn'
              ? "Blackthorn's theme, a note a call (BlackthornNote)"
              : SHARED[family]
                ? `ultima3 ${SHARED[family]}`
                : 'own chip voice, from the call',
        plays: members.map((m) => ({
          label: m.name === family ? '▶' : m.name.slice(family.length + 1),
          standard: family === 'cast circle' ? null : calls(m, 'standard'),
          original: calls(m, 'original'),
        })),
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
    const shared = SHARED[e.name] ?? (e.name.startsWith('spell') ? 'Spell' : undefined);
    rows.push({
      name: e.name,
      about,
      voice: FOLDED[e.name]
        ? `folded into ${FOLDED[e.name]}: silent alone`
        : shared
          ? `ultima3 ${shared}`
          : 'own chip voice, from the call',
      plays: [{ label: '▶', standard: FOLDED[e.name] ? null : calls(e, 'standard'), original: calls(e, 'original') }],
    });
  }
  for (const [name, about] of Object.entries(CUES)) {
    const fallback = about.original ? byName.get(about.original) : undefined;
    rows.push({
      name,
      about,
      voice: `ultima3 ${name} (the port's own)`,
      plays: [
        {
          label: '▶',
          standard: async () => {
            sound.unlock();
            sound.setEffects('standard', 8);
            ++playing;
            await sound.cue(name);
          },
          original: fallback ? calls(fallback, 'original') : null,
        },
      ],
    });
  }

  // The controls: which set the buttons play, and a filter by how often.
  const controls = document.getElementById('controls')!;
  let set: 'standard' | 'original' = 'standard';
  const setButtons = (['standard', 'original'] as const).map((v) => {
    const b = document.createElement('button');
    b.textContent = v === 'standard' ? 'Standard' : 'Original';
    b.addEventListener('click', () => {
      set = v;
      for (const x of setButtons) x.classList.toggle('on', x === b);
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
      for (const t of ['', 'Sound', 'When it plays', 'How often', 'Where', 'Standard voice'])
        head.appendChild(Object.assign(document.createElement('th'), { textContent: t }));
      const body = table.createTBody();
      for (const r of mine.sort((a, b) => OFTEN_ORDER.indexOf(a.about.often) - OFTEN_ORDER.indexOf(b.about.often))) {
        const tr = body.insertRow();
        const play = tr.insertCell();
        play.className = 'play';
        for (const p of r.plays) {
          const b = document.createElement('button');
          const run = set === 'standard' ? p.standard : p.original;
          b.textContent = run ? p.label : set === 'standard' ? 'folded' : 'silent';
          b.disabled = !run;
          b.title = run
            ? `Play ${r.name}${p.label === '▶' ? '' : ` ${p.label}`} (${set})`
            : set === 'standard'
              ? 'The Standard set plays this within another sound'
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
        tr.cells[5].textContent = r.voice;
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
