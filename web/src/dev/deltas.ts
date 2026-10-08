/**
 * deltas.ts
 *
 * The tile deltas page (deltas.html): every tile Modern PC still draws in the Standard art rather than from the
 * originals (originals.ts), each beside the original and the original as Modern PC would draw it - whole, the ground
 * it is (as the walls and floors would be), or lifted onto a ground (as the furniture is) - with a choice for each
 * among those and keeping the Standard art. The choices are kept in the browser and copied out as a list.
 */

import { gameFiles } from '../boot.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { TILE_NAMES } from '../data/tileNames.ts';
import { TileAnimator } from '../ui/animate.ts';
import { EgaArt, HI_WIDTH } from '../ui/framebuffer.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { FALLS, ORIGINALS, OUTDOORS, STRUCTURE, original } from '../ui/originals.ts';
import { CELL, LAND } from '../ui/standardArt.ts';

type Choice = 'keep' | 'whole' | 'lifted';

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The tiles in groups, each with the choice suggested for it. */
const GROUPS: [name: string, tiles: number[], hint: Choice][] = [
  ['Overland places', [0x10, 0x11, 0x12, 0x13, 0x14, 0x16, 0x17, 0x1b, 0x1d, 0x38, ...range(0x39, 0x3f)], 'lifted'],
  [
    'Town structure',
    [
      0x27,
      0x28,
      0x40,
      0x43,
      0x44,
      0x45,
      0x47,
      0x48,
      0x49,
      0x4a,
      0x4b,
      0x4c,
      0x4d,
      0x4e,
      0x4f,
      ...range(0x50, 0x57),
      0x5e,
      0x5f,
      0x6a,
      0x6b,
      0x87,
      0x8c,
      0xb0,
      0xb1,
      0xbc,
      ...range(0xc4, 0xc7),
      0xe1,
      0xe2,
      0xfe,
      0xff,
    ],
    'whole',
  ],
  ['Effects and dungeon decals', [0x00, 0xc0, 0xc1, 0xc2, 0xc3, 0xcc, 0xcd, 0xce, 0xcf, 0xdd], 'lifted'],
  ['Corner pieces', range(0xd0, 0xd3), 'whole'],
  ['Actors kept Standard', [0x107, 0x108, 0x109, 0x10a, 0x10b, 0x10d], 'keep'],
];

/** The river and shore masks the game keeps among its tiles: never drawn, so not to decide. */
const MASKS = new Set(range(0x70, 0x7f));

const STORE = 'ultima5.deltas';
const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function loadChoices(): Record<number, Choice> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<number, Choice>;
  } catch {
    return {};
  }
}

function saveChoices(c: Record<number, Choice>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(c));
  } catch {
    // The choices last the visit.
  }
}

async function start(): Promise<void> {
  const files = await gameFiles();
  const tiles = lzwDecompress(files.get('TILES.16'));
  const ega = new EgaArt(tiles);
  const animator = new TileAnimator(tiles);
  const modern = await loadStandardArt();
  if (!modern) {
    $('tiles').textContent = 'No Standard sheet (public/graphics/standard-tiles.png).';
    return;
  }
  modern.useOriginals(tiles);
  // The actors outlined, as the game draws them with Settings' Outlines on.
  modern.outlined = true;

  // The tiles that were the Standard art's when the page was made, in their groups, whether or not they are drawn from
  // the originals since (the view drawn now shows which); any other not drawn from them, in Other.
  const drawnFromOriginals = (t: number): boolean => ORIGINALS.has(t) || OUTDOORS.has(t) || STRUCTURE.has(t) || FALLS.includes(t);
  const grouped = new Set(GROUPS.flatMap(([, t]) => t));
  const others = range(0, 0x1ff).filter((t) => !drawnFromOriginals(t) && !grouped.has(t) && !MASKS.has(t));
  const groups: [string, number[], Choice][] = [
    ...GROUPS,
    ...(others.length ? [['Other', others, 'keep'] as [string, number[], Choice]] : []),
  ];

  const group = $<HTMLSelectElement>('group');
  group.innerHTML = ['<option value="">All</option>', ...groups.map(([n]) => `<option>${n}</option>`)].join('');
  const show = $<HTMLSelectElement>('show');
  const ground = $<HTMLSelectElement>('ground');
  const size = $<HTMLSelectElement>('size');
  const animate = $<HTMLInputElement>('animate');
  for (const el of [group, show, ground, size]) el.value = params.get(el.id) ?? el.value;
  const main = $('tiles');
  const choices = loadChoices();

  // One scratch page the width of the colour pages, a cell high, that each view is drawn into.
  const page = new Uint32Array(HI_WIDTH * CELL);
  type View = { canvas: HTMLCanvasElement; tile: number; kind: 'original' | 'now' | Choice };
  const views: View[] = [];
  let tick = 0;
  const put = (canvas: HTMLCanvasElement, px: (x: number, y: number) => number): void => {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(CELL, CELL);
    const out = new Uint32Array(img.data.buffer);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out[y * CELL + x] = px(x, y);
    ctx.putImageData(img, 0, 0);
  };
  const paint = (v: View): void => {
    const g = Number(ground.value);
    const on = g >= 0 && !LAND.has(v.tile) && v.tile !== g ? g : undefined;
    page.fill(0xff000000);
    if (v.kind === 'original') ega.draw(page, v.tile, 0, 0);
    else if (v.kind === 'now' || v.kind === 'keep') modern.draw(page, v.tile, 0, 0, on);
    else {
      // The original as Modern PC would draw it: whole, or over the chosen ground where it was lifted off its own.
      if (v.kind === 'lifted' && on !== undefined) modern.draw(page, on, 0, 0);
      const px = original(tiles, v.tile, tick, v.kind === 'lifted');
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (px[y * CELL + x] >>> 24) page[y * HI_WIDTH + x] = px[y * CELL + x];
    }
    put(v.canvas, (x, y) => page[y * HI_WIDTH + x]);
  };

  const counts = (): void => {
    const all = groups.flatMap(([, t]) => t);
    const n = (c: Choice): number => all.filter((t) => choices[t] === c).length;
    $('counts').innerHTML =
      ` <b>${all.length}</b> tiles: <b>${n('whole')}</b> whole, <b>${n('lifted')}</b> lifted, <b>${n('keep')}</b> kept, ` +
      `<b>${all.length - n('whole') - n('lifted') - n('keep')}</b> undecided.`;
  };

  const build = (): void => {
    const q = new URLSearchParams({ group: group.value, show: show.value, ground: ground.value, size: size.value });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    main.textContent = '';
    views.length = 0;
    const px = (CELL / 2) * Number(size.value);
    for (const [name, list, hint] of groups) {
      if (group.value && group.value !== name) continue;
      const shown = list.filter((t) => show.value === 'all' || (show.value === 'undecided' ? !choices[t] : choices[t] === show.value));
      if (!shown.length) continue;
      const h = document.createElement('h2');
      h.textContent = `${name} (${shown.length})`;
      main.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const t of shown) grid.appendChild(card(t, hint, px));
      main.appendChild(grid);
    }
    if (!main.children.length) main.textContent = 'Nothing to show with these filters.';
    counts();
  };

  /** One tile's card: its four views, its name, and its choice. */
  const card = (t: number, hint: Choice, px: number): HTMLElement => {
    const el = document.createElement('div');
    el.className = `tile ${choices[t] ?? ''}`;
    const row = document.createElement('div');
    row.className = 'views';
    const buttons: HTMLButtonElement[] = [];
    const labels: [View['kind'], string][] = [
      ['original', 'original'],
      ['now', 'now'],
      ['whole', 'whole'],
      ['lifted', 'lifted'],
    ];
    const cells: HTMLElement[] = [];
    // The card as its choice stands: its border, its button, the view chosen (keeping is the view drawn now).
    const mark = (): void => {
      el.className = `tile ${choices[t] ?? ''}`;
      for (const b of buttons) b.classList.toggle('on', b.dataset.choice === choices[t]);
      cells.forEach((cell, i) => {
        const kind = labels[i][0];
        cell.classList.toggle('chosen', kind === choices[t] || (kind === 'now' && choices[t] === 'keep'));
      });
    };
    // A choice made, or made again to undo it. A card that no longer answers the filter goes at its next change,
    // not from under the pointer.
    const choose = (c: Choice): void => {
      if (choices[t] === c) delete choices[t];
      else choices[t] = c;
      saveChoices(choices);
      mark();
      counts();
    };
    for (const [kind, label] of labels) {
      const v = document.createElement('div');
      v.className = 'view';
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = CELL;
      canvas.style.width = canvas.style.height = `${px}px`;
      if (kind !== 'original') canvas.addEventListener('click', () => choose(kind === 'now' ? 'keep' : kind));
      const cap = document.createElement('span');
      cap.textContent = label;
      v.append(canvas, cap);
      row.appendChild(v);
      cells.push(v);
      const view: View = { canvas, tile: t, kind };
      views.push(view);
      paint(view);
    }
    const name = document.createElement('div');
    name.className = 'name';
    name.innerHTML = `<b>${t}</b> (0x${t.toString(16)}) ${TILE_NAMES[t] || ''}`;
    const pick = document.createElement('div');
    pick.className = 'choose';
    for (const [c, label] of [
      ['keep', 'Keep'],
      ['whole', 'Whole'],
      ['lifted', 'Lifted'],
    ] as [Choice, string][]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.choice = c;
      if (c === hint) b.classList.add('hint');
      b.addEventListener('click', () => choose(c));
      buttons.push(b);
      pick.appendChild(b);
    }
    el.append(row, name, pick);
    mark();
    return el;
  };

  for (const el of [group, show, ground, size]) el.addEventListener('change', build);

  $('copy').addEventListener('click', () => {
    const all = groups.flatMap(([, t]) => t);
    const line = (c: Choice | undefined, title: string): string => {
      const ts = all.filter((t) => choices[t] === c);
      return ts.length ? `${title}: ${ts.map((t) => `${t} ${TILE_NAMES[t] || ''}`.trim()).join(', ')}` : '';
    };
    const text = [
      line('whole', 'Original, whole'),
      line('lifted', 'Original, lifted'),
      line('keep', 'Keep Standard'),
      line(undefined, 'Undecided'),
    ]
      .filter(Boolean)
      .join('\n');
    const list = $<HTMLTextAreaElement>('list');
    list.value = text;
    list.style.display = 'block';
    list.select();
    void navigator.clipboard?.writeText(text).catch(() => {});
  });
  $('clear').addEventListener('click', () => {
    if (!confirm('Clear every choice on this page?')) return;
    for (const k of Object.keys(choices)) delete choices[Number(k)];
    saveChoices(choices);
    build();
  });

  build();

  // The game's animation rate: about nine ticks a second (every other DOS timer tick).
  setInterval(
    () => {
      if (!animate.checked) return;
      animator.tick();
      modern.tick();
      tick++;
      for (const v of views) paint(v);
    },
    (1000 / 18.2) * 2,
  );
}

start().catch((err: unknown) => {
  $('tiles').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
