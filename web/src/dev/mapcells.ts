/**
 * mapcells.ts
 *
 * The dungeon map cells test page (mapcells.html): every cell value the eight dungeons' levels hold (DUNGEON.DAT), as
 * the dungeon map draws it - the Modern look's whole-level map and its small map round the party, the PC (1988) look's
 * whole view and corner - and what Look says of it. Each is drawn by the game's own map drawing (game/dungeonMap.ts
 * drawDungeonMap) into a real screen and cut out of it: the cell in the middle of a level of rock with a passage on
 * each side of it, so its arms show, and the level's cells round it. Beside them, the first-person view with the cell one
 * step ahead (game/dungeon.ts refresh), for what the maps leave out; and after the file's values, those play makes.
 */

import { gameFiles } from '../boot.ts';
import { readFont } from '../data/font.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { GameData } from '../game/data.ts';
import { dungeonSight, refresh } from '../game/dungeon.ts';
import { drawDungeonMap, kindOf, liftDungeonMap, mapCell } from '../game/dungeonMap.ts';
import { Game } from '../game/game.ts';
import { Save } from '../game/save.ts';
import { signIndex } from '../game/targets.ts';
import { HI, HI_HEIGHT, HI_WIDTH, RUNE_ENGLISH } from '../ui/framebuffer.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { Screen } from '../ui/screen.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const NAMES = ['Deceit', 'Despise', 'Destard', 'Wrong', 'Covetous', 'Shame', 'Hythloth', 'Doom'];

/** Each dungeon's rubble, as dungeonLoop sets Save.dungeonLook: stalactites, caved in passages, or remains. */
const RUBBLE = (n: number): number => (n === 1 || n === 4 || n === 5 ? 3 : n === 6 || n === 7 ? 2 : 1);

/** The first-person view's rectangle on the screen, in EGA pixels (dungeon.ts fills it). */
const VIEW = { x: 0x10, y: 0x0e, w: 0xa0, h: 0xa5 };

/**
 * Values the levels do not hold at the start but play makes (items.ts, dungeon.ts, magic.ts), each with how, and the
 * dungeon to draw it in.
 */
const MADE: [number, string, number][] = [
  [0x40, 'a chest unlocked with a key, or its trap disarmed', 1],
  [0x70, 'a chest opened, its treasure not yet got', 1],
  [0xa0, 'a room’s door once its fight is won (0xa0-0xaf, by room)', 1],
  [0xc4, 'a stalactite mid-drip (0xc1-0xc7, the drip’s step)', 2],
  [0x18, 'a hole in the ceiling (bit 3) over where a party fell, on any open cell', 1],
];

/** The cell looked at, in the middle of the level; the party beside it (the small map is round the party) or away. */
const AT = [4, 4];
const BESIDE = [3, 4];
const AWAY = [0, 0];

/** The maps, each a look and a choice of map, and the party where that map wants it. */
const MAPS = [
  // The Modern maps round the party: it beside the cell, the cell on its piece of the level.
  { id: 'modern-whole', name: 'Modern, whole level', set: 'standard', view: 'full', map: 'small', party: BESIDE },
  { id: 'modern-small', name: 'Modern, small map', set: 'standard', view: 'mini', map: 'small', party: BESIDE },
  { id: 'pc-whole', name: 'PC (1988), whole view', set: 'original', view: 'mini', map: 'full', party: AWAY },
  { id: 'pc-corner', name: 'PC (1988), corner', set: 'original', view: 'mini', map: 'small', party: AWAY },
] as const;

async function start(): Promise<void> {
  const files = await gameFiles();
  const data = new GameData(files);
  const tiles = lzwDecompress(files.get('TILES.16'));
  const canvas = document.createElement('canvas');
  canvas.width = HI_WIDTH;
  canvas.height = HI_HEIGHT;
  const screen = new Screen(canvas, tiles, [readFont(files.get('IBM.CH')), readFont(files.get('RUNES.CH'))]);
  const g = new Game(data, screen, new Save(files.get('INIT.GAM')));
  const art = await loadStandardArt();
  if (art) {
    art.useOriginals(tiles);
    screen.addTiles('modern-pc', art);
  }

  // Every value the levels hold: where it is found (dungeon by dungeon), and how often.
  const dungeons = files.get('DUNGEON.DAT');
  const found = new Map<number, { count: number; in: Set<number>; made?: string }>();
  for (let n = 1; n <= 8; n++)
    for (const v of dungeons.subarray((n - 1) * 0x200, n * 0x200)) {
      const f = found.get(v) ?? { count: 0, in: new Set<number>() };
      f.count++;
      f.in.add(n);
      found.set(v, f);
    }
  for (const [v, how, n] of MADE) if (!found.has(v)) found.set(v, { count: 0, in: new Set([n]), made: how });

  const out = $('cells');
  const only = $<HTMLSelectElement>('dungeon');
  const size = $<HTMLSelectElement>('size');
  const show = $<HTMLSelectElement>('show');
  only.append(new Option('All eight', '0'));
  NAMES.forEach((name, i) => only.append(new Option(`${i + 1} ${name}`, String(i + 1))));
  for (const el of [only, size, show]) el.value = params.get(el.id) ?? el.value;

  /** The screen as it stands, the EGA pixels (x, y, w, h) of it cut out, grown `scale` times. */
  const cut = (x: number, y: number, w: number, h: number, scale: number): HTMLCanvasElement => {
    const img = new ImageData(HI_WIDTH, HI_HEIGHT);
    screen.fb.present(img);
    const whole = document.createElement('canvas');
    [whole.width, whole.height] = [HI_WIDTH, HI_HEIGHT];
    whole.getContext('2d')!.putImageData(img, 0, 0);
    const part = document.createElement('canvas');
    [part.width, part.height] = [w * HI, h * HI];
    part.getContext('2d')!.drawImage(whole, x * HI, y * HI, w * HI, h * HI, 0, 0, w * HI, h * HI);
    part.style.width = `${w * scale}px`;
    part.style.height = `${h * scale}px`;
    return part;
  };

  /**
   * Value `v` drawn on one of the maps, in dungeon `n`'s light: the cell and the level's cells round it (the small
   * map whole, which is those and the party's), every cell of the level seen.
   */
  const drawn = (v: number, n: number, map: (typeof MAPS)[number], scale: number): HTMLCanvasElement | null => {
    const s = g.s;
    Object.assign(g.options, { tileSet: map.set, tiles: 'modern-pc', dungeonView: map.view, dungeonMap: map.map });
    screen.setTileArt(map.set, 'modern-pc');
    Object.assign(s, { mapId: 0x20 + n, level: 0, x: map.party[0], y: map.party[1], facing: 1 });
    s.dungeonLook = RUBBLE(n);
    s.dungeon.fill(0xb0, 0, 0x40);
    const put = (x: number, y: number, c: number): void => void (s.dungeon[y * 8 + x] = c);
    put(AT[0], AT[1], v);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
      put(AT[0] + dx, AT[1] + dy, 0x00);
    put(map.party[0], map.party[1], 0x00);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fog.markPlace(s.mapId, 0, x, y);
    g.draw.pen = 0;
    g.draw.fill(0, 0, 319, 199);
    liftDungeonMap(g); // the small map's cover over the log, from the last one drawn
    drawDungeonMap(g);
    const at = mapCell(g, AT[0], AT[1]);
    if (!at) return null;
    const side = at[2];
    // The small map whole (three cells a side round the party, the cell east of it); on the others, the cell with one
    // of the level's round it.
    const [x, y] = map.id === 'modern-small' ? mapCell(g, map.party[0] - 1, map.party[1] - 1)! : [at[0] - side, at[1] - side];
    return cut(x, y, side * 3, side * 3, scale);
  };

  /** Value `v` one step ahead of the party in dungeon `n`, lit, in the first-person view of look `set`. */
  const ahead = (v: number, n: number, set: 'standard' | 'original', scale: number): HTMLCanvasElement => {
    const s = g.s;
    Object.assign(g.options, { tileSet: set, tiles: 'modern-pc', dungeonView: 'mini', dungeonMap: 'off' });
    screen.setTileArt(set, 'modern-pc');
    Object.assign(s, { mapId: 0x20 + n, level: 0, x: 4, y: 5, facing: 0, light: 0x32, d58a6: 100, partyTile: 0x1c });
    // The walls dungeonLoop gives the dungeon.
    [g.bb14, g.bb15] = RUBBLE(n) === 3 ? [0x4f, 0x45] : [0x4d, 5];
    s.dungeonLook = RUBBLE(n);
    s.dungeon.fill(0xb0, 0, 0x40);
    s.dungeon[5 * 8 + 4] = 0x00;
    s.dungeon[4 * 8 + 4] = v;
    liftDungeonMap(g);
    g.draw.pen = 0;
    g.draw.fill(0, 0, 319, 199);
    refresh(g);
    return cut(VIEW.x, VIEW.y, VIEW.w, VIEW.h, scale);
  };

  /** What a wall's sign (0xb1-0xbf) says in dungeon `n`, if the dungeon has that sign. */
  const signText = (v: number, n: number): string | null => {
    if ((v & 0xf0) !== 0xb0 || (v & 0xf) === 0) return null;
    g.s.mapId = 0x20 + n;
    const i = signIndex(g, v & 0xf);
    if (i < 0) return null;
    // Its runes read in English (a rune letter for one or two, RUNE_ENGLISH), its lines run together.
    const runes = g.data
      .table(0x2e10, 11)
      [i].replace(/[\n\r]+/g, ' ')
      .trim();
    return [...runes].map((ch) => (ch >= 'A' && ch <= '_' ? RUNE_ENGLISH[ch.charCodeAt(0) - 0x41] : ch)).join('');
  };

  const build = (): void => {
    const q = new URLSearchParams({ dungeon: only.value, size: size.value, show: show.value });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    out.textContent = '';
    const scale = Number(size.value);
    const shown = (set: string): boolean => show.value === 'both' || (show.value === 'modern') === (set === 'standard');
    const maps = MAPS.filter((m) => shown(m.set));
    const views = (['standard', 'original'] as const).filter(shown);
    const head = document.createElement('tr');
    const viewNames = views.map((v) => `${v === 'standard' ? 'Modern' : 'PC (1988)'}, view ahead`);
    for (const h of ['Cell', 'Found in', 'Map reads it as', ...maps.map((m) => m.name), ...viewNames, 'Look says']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    out.append(head);
    const wanted = Number(only.value);
    for (const [v, f] of [...found].sort(([a, fa], [b, fb]) => Number(!!fa.made) - Number(!!fb.made) || a - b)) {
      if (wanted && !f.made && !f.in.has(wanted)) continue;
      const n = wanted || Math.min(...f.in);
      const row = document.createElement('tr');
      const td = (content: string | Node, cls = ''): void => {
        const c = document.createElement('td');
        if (cls) c.className = cls;
        c.append(content);
        row.append(c);
      };
      const where = [...f.in].sort().map((i) => NAMES[i - 1]);
      td(`0x${v.toString(16).padStart(2, '0')}`, 'value');
      td(f.made ? `Made in play: ${f.made}` : `${where.join(', ')} (${f.count})`, 'where');
      td(kindOf(v));
      for (const m of maps) td(drawn(v, n, m, scale) ?? '—');
      for (const set of views) td(ahead(v, n, set, Math.max(1, scale / 2)));
      // Look's words: by each dungeon's rubble where they differ (the remains, a pirate once in 255); a sign's own.
      const words = (look: number, pirate = false): string => g.data.t(dungeonSight(v, look, pirate)).trim();
      const dungeonsIn = f.made ? [n] : [...f.in];
      const kinds = [...new Set(dungeonsIn.map(RUBBLE))];
      const lines =
        (v & 0xf0) === 0xc0
          ? kinds.map((k) => {
              const inIt = dungeonsIn.filter((i) => RUBBLE(i) === k).map((i) => NAMES[i - 1]);
              return `${inIt.join(', ')}: ${words(k)}${k === 3 ? ` (1 in 255: ${words(k, true)})` : ''}`;
            })
          : [words(kinds[0])];
      for (const i of dungeonsIn) {
        const sign = signText(v, i);
        if (sign) lines.push(`Sign in ${NAMES[i - 1]}: ${sign}`);
      }
      td(lines.join('\n'), 'look');
      out.append(row);
    }
  };
  for (const el of [only, size, show]) el.addEventListener('change', build);
  build();
}

start().catch((err: unknown) => {
  $('cells').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
