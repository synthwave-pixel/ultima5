/**
 * dungeon.ts
 *
 * The corridor test page (dungeon.html): the first-person view as the
 * game composes it, for every sort of cell a party may face, in Original
 * and Standard side by side. The view is built by the game's own
 * drawing (game/dungeon.ts refresh) into a real screen, and the corridor
 * cut out of it; nothing here draws a corridor of its own. After the cells, the
 * eight wandering creatures (MON0-7.16), one, two and three squares off.
 */

import { gameFiles } from '../boot.ts';
import { readFont } from '../data/font.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { GameData } from '../game/data.ts';
import { Game } from '../game/game.ts';
import { Save } from '../game/save.ts';
import { HI, HI_HEIGHT, HI_WIDTH } from '../ui/framebuffer.ts';
import { Screen } from '../ui/screen.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { refresh } from '../game/dungeon.ts';
import { DUNGEON_CREATURES } from '../game/ultima5DungeonMap.ts';
import { TILE_NAMES } from '../data/tileNames.ts';
import { DosRandom } from '../game/rng.ts';
import { PC_TILES, TILES, TILES_NAMES, type Tiles } from '../game/settings.ts';
import { loadSkin } from '../ui/loadArt.ts';
import { actor } from '../game/actors.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** The corridor's rectangle on the screen, in DOS pixels (dungeon.ts fills it). */
const RETRO_VIEW = { x: 0x10, y: 0x0e, w: 0xa0, h: 0xa5 };
/** The square the Enhanced interface grows the view to (dungeon.ts showView), out to the frame. */
const SQUARE = { x: 8, y: 8, w: 0xb0, h: 0xb0 };

/**
 * What a cell is, by the high nibble the original keeps it in. A cell
 * also carries flags in its low bits; those the view draws are the hole
 * in the ceiling (8) and the state of a door.
 */
const CELLS: [string, number, string][] = [
  ['Passage', 0x00, 'open floor, walls either side'],
  ['Ladder up', 0x10, ''],
  ['Ladder down', 0x20, ''],
  ['Ladders both', 0x30, ''],
  ['Trap', 0x40, 'drawn as plain floor until it is found'],
  ['Fountain', 0x50, ''],
  ['Pit', 0x60, ''],
  ['Treasure', 0x70, ''],
  ['Room', 0x80, 'the mouth of a room'],
  ['Door', 0xa0, ''],
  ['Wall', 0xb0, 'a dead end'],
  ['Rubble', 0xc0, 'remains (Deceit, Wrong, Covetous), a caved in passage (Shame, Hythloth) or a stalactite'],
  ['Hidden door', 0xd0, 'a wall until it is searched out'],
  ['Open door', 0xe0, ''],
];

/**
 * The eight dungeons. The game picks the wall pictures by the dungeon's
 * number - three sets between the eight - and the Standard look gives
 * each dungeon its own light over the one set of grey stone.
 */
const WALLS: [string, string][] = [
  ['1 Deceit (DNG3)', '1'],
  ['2 Despise (DNG1)', '2'],
  ['3 Destard (DNG1)', '3'],
  ['4 Wrong (DNG3)', '4'],
  ['5 Covetous (DNG3)', '5'],
  ['6 Shame (DNG2)', '6'],
  ['7 Hythloth (DNG2)', '7'],
  ['8 Doom (DNG1)', '8'],
];

/** The arrangements of the corridor itself, beyond what stands in it. */
const SHAPES: [string, string][] = [
  ['ahead', 'the cell one step ahead'],
  ['far', 'three steps ahead, down an open corridor'],
  ['beside', 'in the opening to the right'],
];

async function start(): Promise<void> {
  const files = await gameFiles();
  const data = new GameData(files);
  const tiles = lzwDecompress(files.get('TILES.16'));
  const canvas = document.createElement('canvas');
  canvas.width = HI_WIDTH;
  canvas.height = HI_HEIGHT;
  const screen = new Screen(canvas, tiles, [readFont(files.get('IBM.CH')), readFont(files.get('RUNES.CH'))]);
  const g = new Game(data, screen, new Save(files.get('INIT.GAM')));
  screen.standard = await loadStandardArt();
  screen.standard?.useOriginals(tiles);
  // Every set's skin (skins.ts), made now, so a set's corridor is drawn in it at once.
  for (const kind of TILES) screen.addSkin(kind, await loadSkin(kind));
  g.s.members[0].name = 'Tester';

  // A dungeon, lit, with the party at the middle of a level of solid rock.
  const level = 0;
  const cell = (x: number, y: number): number => level * 0x40 + (y & 7) * 8 + (x & 7);
  const put = (x: number, y: number, v: number): void => {
    g.s.dungeon[cell(x, y)] = v;
  };
  g.options.dungeonMap = 'off'; // the corner map would cover the very thing being looked at
  g.s.mapId = 0x21;
  g.s.level = level;
  g.s.x = 4;
  g.s.y = 4;
  g.s.facing = 0; // north
  g.s.light = 0x32;
  g.s.d58a6 = 100;
  g.s.partyTile = 0x1c;

  const out = $('views');
  const look = $<HTMLSelectElement>('look');
  const size = $<HTMLSelectElement>('size');
  const shape = $<HTMLSelectElement>('shape');
  const walls = $<HTMLSelectElement>('walls');
  const sets = $<HTMLSelectElement>('sets');
  const light = $<HTMLSelectElement>('light');
  for (const [name, why] of SHAPES) shape.append(new Option(why ? `${name} — ${why}` : name, name));
  for (const [name, value] of WALLS) walls.append(new Option(name, value));
  for (const el of [look, size, shape, walls, sets, light]) el.value = params.get(el.id) ?? el.value;

  /** Which dungeon's walls to draw, as dungeonLoop chooses them by the dungeon's number. */
  const setWalls = (): void => {
    const n = Number(walls.value);
    g.s.mapId = 0x20 + n;
    if (n === 1 || n === 4 || n === 5) {
      g.bb14 = 0x4f;
      g.bb15 = 0x45;
      g.s.dungeonLook = 3;
    } else {
      g.bb14 = 0x4d;
      g.bb15 = 5;
      g.s.dungeonLook = n === 6 || n === 7 ? 2 : 1;
    }
  };

  /**
   * The screen as it stands, with the corridor cut out of it: where 1988 drew it in the Retro interface, the square it
   * is grown to in the Enhanced.
   */
  const corridor = (scale: number, set: 'original' | 'standard'): HTMLCanvasElement => {
    const VIEW = set === 'standard' ? SQUARE : RETRO_VIEW;
    const img = new ImageData(HI_WIDTH, HI_HEIGHT);
    screen.fb.present(img);
    const whole = document.createElement('canvas');
    whole.width = HI_WIDTH;
    whole.height = HI_HEIGHT;
    whole.getContext('2d')!.putImageData(img, 0, 0);
    const cut = document.createElement('canvas');
    cut.width = VIEW.w * HI;
    cut.height = VIEW.h * HI;
    const ctx = cut.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(whole, VIEW.x * HI, VIEW.y * HI, VIEW.w * HI, VIEW.h * HI, 0, 0, VIEW.w * HI, VIEW.h * HI);
    cut.style.width = `${VIEW.w * scale}px`;
    cut.style.height = `${VIEW.h * scale}px`;
    cut.style.imageRendering = 'pixelated';
    return cut;
  };

  /** Lay out one cell's kind in front of the party, the way the chosen shape wants it. */
  const arrange = (kind: number): void => {
    g.s.dungeon.fill(0xb0, level * 0x40, level * 0x40 + 0x40); // rock everywhere
    put(4, 4, 0x00); // where the party stands
    if (shape.value === 'ahead') {
      put(4, 3, kind);
    } else if (shape.value === 'far') {
      put(4, 3, 0x00);
      put(4, 2, 0x00);
      put(4, 1, kind);
    } else {
      put(4, 3, 0x00);
      put(5, 3, kind);
    }
  };

  const build = (): void => {
    const q = new URLSearchParams({
      look: look.value,
      size: size.value,
      shape: shape.value,
      walls: walls.value,
      sets: sets.value,
      light: light.value,
    });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    out.textContent = '';
    setWalls();
    actor(g, 1).x = 0xff; // no creature in the cells' views
    // Lit, or the party without light (the Modern look's dark shows what gives its own).
    g.s.d58a6 = light.value === 'lit' ? 100 : 0;
    g.s.d58a7 = 0;
    const scale = Number(size.value);
    /** Each view to draw: its interface and its set, in order - Retro first, then Enhanced. */
    const views: ['original' | 'standard', Tiles][] = (['original', 'standard'] as const)
      .filter((set) => look.value === 'both' || look.value === set)
      .flatMap((set) =>
        (sets.value === 'all' ? (set === 'original' ? PC_TILES : TILES) : ([set === 'original' ? 'pc-ega' : 'modern-pc'] as Tiles[])).map(
          (t): ['original' | 'standard', Tiles] => [set, t],
        ),
      );
    /** The views of the case as it stands, a row of them, each named where every set is shown. */
    const row = (): HTMLDivElement => {
      const div = document.createElement('div');
      // Each view from the same moment: a drawing moves the drips on (the cell keeps their step), so each starts afresh.
      const cells = g.s.dungeon.slice();
      for (const [set, t] of views) {
        screen.setTileArt(set, t);
        // The game in the look drawn, as the game sets it: 1988's sign is printed on its plate only in its own look.
        g.options.tileSet = set;
        g.s.dungeon.set(cells);
        g.rng = new DosRandom(1);
        refresh(g);
        const cut = corridor(scale, set);
        if (sets.value !== 'all') div.appendChild(cut);
        else {
          const span = document.createElement('span');
          span.append(cut, `${set === 'original' ? 'Retro' : 'Enhanced'} · ${TILES_NAMES[t]}`);
          div.appendChild(span);
        }
      }
      return div;
    };
    const across = (n: number): string => `${SQUARE.w * scale * views.length * n + 8 * views.length * n}px`;
    const cases: [string, number, string][] = [
      ...CELLS,
      ['Sign', 0xb1, "a wall's sign, carved in the Enhanced interface"],
      ...[0, 1, 2, 3].map((k): [string, number, string] => [`Field ${k}`, 0x80 + k, "its crackle in the set's ink"]),
    ];
    for (const [name, kind, why] of cases) {
      arrange(kind);
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${name}</b> ${why}`;
      fig.append(cap, row());
      fig.style.setProperty('--w', across(1));
      out.appendChild(fig);
    }
    // The creatures, down an open corridor: each at one, two and three squares off, in each look.
    const a = actor(g, 1);
    for (let t = 0; t < 8; t++) {
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${TILE_NAMES[DUNGEON_CREATURES[t]].replace(/ 1$/, '')}</b> MON${t}, one to three squares off`;
      fig.appendChild(cap);
      for (let depth = 1; depth <= 3; depth++) {
        g.s.dungeon.fill(0xb0, level * 0x40, level * 0x40 + 0x40);
        for (let y = 1; y <= 4; y++) put(4, y, 0x00);
        Object.assign(a, { tile: t, x: 4, y: 4 - depth, b5: 1, b6: g.data.bytes(0x1744, 8)[t], b7: 0 });
        fig.appendChild(row());
      }
      a.x = 0xff;
      fig.style.setProperty('--w', across(1));
      out.appendChild(fig);
    }
  };
  for (const el of [look, size, shape, walls, sets, light]) el.addEventListener('change', build);
  if (params.has('hashes')) hashes();
  else build();

  /** The corridor's colour pixels as shown, hashed (FNV-1a, 32 bits): a fingerprint to compare a look before and after. */
  function corridorHash(): string {
    const img = new ImageData(HI_WIDTH, HI_HEIGHT);
    screen.fb.present(img);
    const px = new Uint32Array(img.data.buffer);
    let h = 0x811c9dc5;
    for (let y = RETRO_VIEW.y * HI; y < (RETRO_VIEW.y + RETRO_VIEW.h) * HI; y++)
      for (let x = RETRO_VIEW.x * HI; x < (RETRO_VIEW.x + RETRO_VIEW.w) * HI; x++) {
        h ^= px[y * HI_WIDTH + x];
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    return h.toString(16).padStart(8, '0');
  }

  /**
   * ?hashes: every case - each cell, a sign, the fields, in each shape and each set of walls, dark and lit, and the
   * eight creatures one to three squares off - in each look with its own 1988 tiles, as fingerprints, one a line.
   */
  function hashes(): void {
    const lines: string[] = [];
    const extra: [string, number][] = [
      ['Sign', 0xb1],
      ['Field 0', 0x80],
      ['Field 1', 0x81],
      ['Field 2', 0x82],
      ['Field 3', 0x83],
    ];
    const cases = [...CELLS.map(([name, kind]): [string, number] => [name, kind]), ...extra];
    for (const set of ['standard', 'original'] as const) {
      screen.setTileArt(set, set === 'standard' ? 'modern-pc' : 'pc-ega');
      for (const [wallsName, wallsValue] of WALLS.filter(([, v]) => ['1', '2', '6'].includes(v))) {
        walls.value = wallsValue;
        setWalls();
        actor(g, 1).x = 0xff;
        for (const [shapeName] of SHAPES) {
          shape.value = shapeName;
          for (const lit of [0x32, 0]) {
            g.s.light = lit;
            for (const [name, kind] of cases) {
              arrange(kind);
              g.rng = new DosRandom(1);
              refresh(g);
              lines.push(`${set} ${wallsName.split(' ')[1]} ${shapeName} ${lit ? 'lit' : 'dark'} ${name}: ${corridorHash()}`);
            }
          }
        }
      }
      g.s.light = 0x32;
      walls.value = '2';
      setWalls();
      const a = actor(g, 1);
      for (let t = 0; t < 8; t++)
        for (let depth = 1; depth <= 3; depth++) {
          g.s.dungeon.fill(0xb0, level * 0x40, level * 0x40 + 0x40);
          for (let y = 1; y <= 4; y++) put(4, y, 0x00);
          Object.assign(a, { tile: t, x: 4, y: 4 - depth, b5: 1, b6: g.data.bytes(0x1744, 8)[t], b7: 0 });
          g.rng = new DosRandom(1);
          refresh(g);
          lines.push(`${set} creature ${t} at ${depth}: ${corridorHash()}`);
        }
      a.x = 0xff;
    }
    const pre = document.createElement('pre');
    pre.id = 'hashes';
    pre.textContent = lines.join('\n');
    out.textContent = '';
    out.appendChild(pre);
  }
}

start().catch((err: unknown) => {
  $('views').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
