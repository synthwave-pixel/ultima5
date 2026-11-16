/**
 * frames.ts
 *
 * The frames test page (frames.html): each tile set's frame (skins.ts frameFor) at a place, in the Retro and the
 * Enhanced interface, side by side - each the game itself in a frame of the page (?dev&play&new&peek&ux=&tiles=&at=,
 * main.ts). The choices are kept in the URL.
 */

import { PC_TILES, TILES, TILES_NAMES, type Tiles } from '../game/settings.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const at = $<HTMLSelectElement>('at');
const sets = $<HTMLSelectElement>('sets');
const width = $<HTMLSelectElement>('width');
sets.append(new Option('Every set', 'all'));
for (const t of TILES) sets.append(new Option(TILES_NAMES[t], t));
for (const el of [at, sets, width]) el.value = params.get(el.id) ?? el.value;

/** The views of each set: its interface's name, and the address of the game in it (Remastered's Enhanced alone). */
function views(t: Tiles): [string, string][] {
  const game = (ux: string): string => `/?dev&play&new&peek&ux=${ux}&tiles=${t}&at=${at.value}`;
  const out: [string, string][] = [];
  if (PC_TILES.includes(t as (typeof PC_TILES)[number])) out.push(['Retro', game('original')]);
  out.push(['Enhanced', game('standard')]);
  return out;
}

function build(): void {
  const q = new URLSearchParams({ at: at.value, sets: sets.value, width: width.value });
  history.replaceState(null, '', `?${q.toString()}`);
  const out = $('sets-out');
  out.textContent = '';
  const w = Number(width.value);
  for (const t of sets.value === 'all' ? TILES : [sets.value as Tiles]) {
    const h = document.createElement('h2');
    h.textContent = TILES_NAMES[t];
    const row = document.createElement('div');
    row.className = 'row';
    for (const [name, src] of views(t)) {
      const fig = document.createElement('figure');
      const frame = document.createElement('iframe');
      Object.assign(frame, { src, width: String(w), height: String((w * 10) / 16), loading: 'lazy' });
      const cap = document.createElement('figcaption');
      cap.textContent = name;
      fig.append(frame, cap);
      row.appendChild(fig);
    }
    out.append(h, row);
  }
}

for (const el of [at, sets, width]) el.addEventListener('change', build);
build();
