/**
 * runes.ts
 *
 * The runes page (runes.html): everywhere the game shows runes, as it shows them. A dungeon sign in the first-person
 * view, its runes carved into the wall and read - giving way, letter by letter in a wave, to their English - with the
 * same sign printed in the log; and every other place runes are printed, printed in the log by the game's own code:
 * the signs Look reads (every one in SIGNS.DAT, the Eight Laws, Britain's wanted poster), the words the townsfolk
 * speak in runes (found in the TLK files, where a line turns runes on), the Codex's passages, a sextant's position,
 * a shrine's ALAKAZAM and the ending's last words. In either look - Modern reads printed runes into English, PC
 * (1988) keeps them runes; a conversation's runes read in the colour of their kind (runeWords.ts). Nothing here draws a
 * rune of its own.
 */

import { gameFiles } from '../boot.ts';
import { readFont } from '../data/font.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { readLocations } from '../data/maps.ts';
import { GameData } from '../game/data.ts';
import { readSignAhead, refresh } from '../game/dungeon.ts';
import { drawVitals, panelWindows, updateFrame, Win } from '../game/frame.ts';
import { Game } from '../game/game.ts';
import { printSign, readSign } from '../game/look.ts';
import { position } from '../game/magic.ts';
import { Save } from '../game/save.ts';
import { readCodex } from '../game/shrine.ts';
import { recite } from '../game/talk.ts';
import { CARVE_STYLES, type CarveStyle } from '../ui/carve.ts';
import { HI_HEIGHT, HI_WIDTH, RUNE_ENGLISH } from '../ui/framebuffer.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { Screen } from '../ui/screen.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** How long the loop waits after the runes have been read before it reads them again, in milliseconds. */
const LOOP_MS = 4000;

/** A place's name as a sentence has it: the game keeps most in capitals (DECEIT, Deceit). */
const cased = (n: string): string =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()) : n;

/** A rune letter read (A to _, a letter or two, RUNE_ENGLISH); '@', the runes' space, a space; anything else as it is. */
const english = (c: number): string => (c >= 0x41 && c <= 0x5f ? RUNE_ENGLISH[c - 0x41] : c === 0x40 ? ' ' : String.fromCharCode(c));

/** Something the game prints in runes, printed in the log as the game prints it there. */
interface Printed {
  group: string;
  label: string;
  print: (g: Game) => Promise<void> | void;
}

/** The TLK files, as the conversations' map ids choose them (talk.ts loadScript), with a name for a group. */
const TALK_FILES = [
  ['TOWNE.TLK', 'a towne'],
  ['DWELLING.TLK', 'a dwelling'],
  ['CASTLE.TLK', 'a castle'],
  ['KEEP.TLK', 'a keep'],
] as const;

/**
 * Every line of every conversation that turns runes on (0x8e): its script, where the line starts, and who says it -
 * each line once, with all who say it.
 */
function runicLines(files: { get(name: string): Uint8Array }): { script: Uint8Array; at: number; who: string; words: string }[] {
  const out = new Map<string, { script: Uint8Array; at: number; who: string[]; where: string; words: string }>();
  for (const [file, where] of TALK_FILES) {
    const d = files.get(file);
    const count = d[0] | (d[1] << 8);
    // Each script runs to where the next begins (or the file ends): read further, a line would be the next one's.
    const offsets = Array.from({ length: count }, (_, i) => d[4 + i * 4] | (d[5 + i * 4] << 8));
    const ends = [...offsets].sort((a, b) => a - b);
    for (const offset of offsets) {
      const script = d.subarray(offset, ends.find((e) => e > offset) ?? d.length);
      const first = script.subarray(0, Math.max(0, script.indexOf(0)));
      const name = /^[A-Za-z][A-Za-z' ]*[A-Za-z]/.exec(String.fromCharCode(...[...first].map((c) => c & 0x7f)))?.[0] ?? '?';
      for (let at = 0; at < script.length; ) {
        let end = script.indexOf(0, at);
        if (end < 0) end = script.length;
        const line = script.subarray(at, end);
        if (line.includes(0x8e)) {
          // The words spoken in runes: the letters between the switches.
          let runes = false;
          let words = '';
          for (const b of line) {
            if (b === 0x8e) {
              runes = !runes;
              words += runes && words ? ' / ' : '';
            } else if (runes && b >= 0xa0) words += english(b & 0x7f);
          }
          const key = Array.from(line).join(',');
          const seen = out.get(key);
          if (seen) seen.who.push(name);
          else out.set(key, { script, at, who: [name], where, words: words.trim() });
        }
        at = end + 1;
      }
    }
  }
  return [...out.values()].map((l) => ({ ...l, who: `${l.who.join(', ')}, in ${l.where}` }));
}

async function start(): Promise<void> {
  const files = await gameFiles();
  const data = new GameData(files);
  const tiles = lzwDecompress(files.get('TILES.16'));
  const canvas = $<HTMLCanvasElement>('screen');
  canvas.width = HI_WIDTH;
  canvas.height = HI_HEIGHT;
  const screen = new Screen(canvas, tiles, [readFont(files.get('IBM.CH')), readFont(files.get('RUNES.CH'))]);
  const g = new Game(data, screen, new Save(files.get('INIT.GAM')));
  const art = await loadStandardArt();
  art?.useOriginals(tiles);
  if (art) screen.addTiles('modern-pc', art);
  screen.setTileArt('standard', 'modern-pc');
  await Promise.race([screen.lettersLoaded, new Promise((r) => setTimeout(r, 4000))]);
  Object.assign(g.options, { tileSet: 'standard', tiles: 'modern-pc', dungeonMap: 'off', dungeonView: 'mini' });
  g.s.members[0].name = 'Reader';

  // Every dungeon sign: each dungeon's, numbered as its wall cells are (0xb1 up), with its runes read as English.
  const names = readLocations(data.ovl);
  const placeName = (id: number): string => (id === 0 ? 'Britannia' : cased(names.find((l) => l.id === id)?.name ?? `Place ${id}`));
  const pick = $<HTMLSelectElement>('sign');
  const group = (label: string): HTMLOptGroupElement => {
    const el = document.createElement('optgroup');
    el.label = label;
    pick.append(el);
    return el;
  };
  const counts = data.bytes(0x2df0, 8);
  const firsts = data.bytes(0x2de8, 8);
  const texts = data.table(0x2e10, 11);
  const walls = group('Dungeon signs, on the wall');
  for (let d = 0; d < 8; d++)
    for (let n = 1; n <= counts[d]; n++) {
      const runes = texts[firsts[d] + n - 1].replace(/[\n\r]+/g, ' ').trim();
      const text = [...runes].map((ch) => english(ch.charCodeAt(0))).join('');
      walls.append(new Option(`${placeName(0x21 + d)} ${n}: ${text}`, `${d + 1}:${n}`));
    }

  // Everything else printed in runes, printed in the log (value: its key in `printed`).
  const printed = new Map<string, Printed>();
  const add = (key: string, p: Printed): void => void printed.set(key, p);
  // The signs Look reads: SIGNS.DAT's, by place - each entry its map, level, x and y, then its text (look.ts readSign).
  // An entry whose text is a new line alone is half of a sign two squares wide, read from the entry after it.
  const signs = files.get('SIGNS.DAT');
  const wordsOf = data.table(0x3810, 9);
  for (let at = 0x42; at + 4 < signs.length; ) {
    const [map, z, x, y] = signs.subarray(at, at + 4);
    let end = signs.indexOf(0, at + 4);
    if (end < 0) end = signs.length;
    const text = signs.subarray(at + 4, end);
    if (!(text.length === 1 && text[0] === 0x0a)) {
      // Read for its name: English where bit 7 is set, runes read, the frames' pieces left out.
      const read = [...text]
        .map((c) =>
          c & 0x80 ? String.fromCharCode(c & 0x7f) : c >= 0x29 && c <= 0x31 ? wordsOf[c - 0x29] : c >= 0x40 && c <= 0x5f ? english(c) : ' ',
        )
        .join('')
        .replace(/[^A-Za-z' !?,.-]+/g, ' ')
        .trim()
        .slice(0, 48);
      add(`town:${at}`, {
        group: 'Signs, looked at',
        label: `${placeName(map)}: ${read}`,
        print: async (g) => {
          g.s.mapId = map;
          await readSign(g, z, x, y);
        },
      });
    }
    at = end + 1;
  }
  add('laws', { group: 'Signs, looked at', label: 'The Eight Laws', print: (g) => printSign(g, new Uint8Array(0), -1) });
  add('wanted', {
    group: 'Signs, looked at',
    label: "Britain's jail: the wanted poster",
    print: async (g) => {
      g.s.mapId = 4;
      await readSign(g, 0, 0x11, 0x15);
    },
  });
  for (const [n, l] of runicLines(files).entries())
    add(`talk:${n}`, { group: 'Spoken in runes', label: `${l.who}: ${l.words}`, print: (g) => recite(g, l.script, l.at) });
  add('codex', { group: 'Elsewhere', label: 'The Codex: its four passages', print: (g) => readCodex(g) });
  add('position', {
    group: 'Elsewhere',
    label: "A sextant's position (at Lord British's castle)",
    print: (g) => {
      Object.assign(g.s, { mapId: 0, x: 86, y: 110 });
      g.say(0x4a26); // "Position:"
      position(g);
    },
  });
  add('alakazam', {
    group: 'Elsewhere',
    label: 'ALAKAZAM, gold given at a shrine',
    print: (g) => {
      g.text.font = 1;
      g.say(0x95aa); // "ALAKAZAM"
      g.text.font = 0;
      g.say(0x95b4); // "!\n"
    },
  });
  add('ending', {
    group: 'Elsewhere',
    label: 'The ending: The Quest of the Avatar is forever',
    print: (g) => {
      g.text.font = 1;
      g.say(0x83ee);
      g.say(0x8404);
      g.text.font = 0;
    },
  });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const [key, p] of printed) {
    if (!groups.has(p.group)) groups.set(p.group, group(p.group));
    groups.get(p.group)?.append(new Option(p.label, key));
  }

  const look = $<HTMLSelectElement>('look');
  const carve = $<HTMLSelectElement>('carve');
  for (const c of CARVE_STYLES) carve.append(new Option(c, c));
  // Opened on its own, the groove in its red on a plate: the look being tried.
  carve.value = 'groove';
  // How much larger than 1988's the sign is carved, reflowed to fit the wall (signLayout.ts).
  const size = $<HTMLSelectElement>('size');
  const loop = $<HTMLInputElement>('loop');
  // A bolted plate for the sign.
  const plated = $<HTMLInputElement>('plate');
  // The party lit, or in the dark, where only what gives its own light is seen.
  const light = $<HTMLSelectElement>('light');
  const choices = [pick, look, carve, size, light];
  for (const el of choices) el.value = params.get(el.id) ?? el.value;
  if (!pick.value) pick.selectedIndex = 0;
  loop.checked = params.get('loop') !== 'off';
  plated.checked = params.get('plate') !== 'off';

  // A print still going on - waiting for a key, as the Codex does - let go before another starts: a key for each
  // wait, and any key left over forgotten.
  let printing: Promise<void> | null = null;
  const letGo = async (): Promise<void> => {
    for (let i = 0; i < 64 && printing; i++) {
      screen.push(0x20);
      await new Promise((r) => setTimeout(r, 20));
    }
    g.p.flushKeys();
  };

  // The party lit, in the middle of a level of rock, facing north at the sign on the wall ahead.
  const wall = (d: number, n: number): void => {
    const s = g.s;
    s.dungeon.set(files.get('DUNGEON.DAT').subarray((d - 1) * 0x200, d * 0x200));
    s.dungeon.fill(0xb0, 0, 0x40);
    s.dungeon[4 * 8 + 4] = 0x00;
    s.dungeon[3 * 8 + 4] = 0xb0 | n;
    // The dungeon's walls and light, as dungeonLoop chooses them by its number.
    if (d === 1 || d === 4 || d === 5) Object.assign(g, { bb14: 0x4f, bb15: 0x45 });
    else Object.assign(g, { bb14: 0x4d, bb15: 5 });
    Object.assign(s, {
      mapId: 0x20 + d,
      level: 0,
      x: 4,
      y: 4,
      facing: 0,
      light: 0x32,
      d58a6: light.value === 'dark' ? 0 : 100,
      d58a7: 0,
      partyTile: 0x1c,
      dungeonLook: d === 1 || d === 4 || d === 5 ? 3 : d === 6 || d === 7 ? 2 : 1,
    });
    refresh(g);
    // Read, as a sign bumped into is: printed at the foot of the log (the small map lies over its top), where runes
    // read in their printed face, and on the wall read from now, each time from the start (dungeon.ts readSignAhead).
    g.text.select(Win.messages);
    const log = g.text.windows[Win.messages];
    g.text.moveTo(0, log.bottom - log.top);
    g.print('\n');
    g.signRead = null;
    readSignAhead(g);
  };

  let quiet = 0;
  const showNow = async (): Promise<void> => {
    await letGo();
    const q = new URLSearchParams({ sign: pick.value, look: look.value });
    const onWall = !printed.has(pick.value);
    if (onWall) for (const [k, v] of Object.entries({ carve: carve.value, size: size.value })) q.set(k, v);
    if (onWall && light.value === 'dark') q.set('light', 'dark');
    if (onWall && !plated.checked) q.set('plate', 'off');
    if (!loop.checked) q.set('loop', 'off');
    history.replaceState(null, '', `?${q.toString()}`);
    // The wall's choices are for dungeon signs alone.
    for (const el of [carve, size, light, plated]) el.disabled = !onWall;
    const modern = look.value !== 'pc';
    screen.setTileArt(modern ? 'standard' : 'original', 'modern-pc');
    g.options.tileSet = modern ? 'standard' : 'original';
    const fb = screen.fb;
    Object.assign(fb, {
      carve: carve.value as CarveStyle,
      signScale: Number(size.value) || 1.5,
      signPlate: plated.checked,
    });
    panelWindows(g);
    updateFrame(g);
    if (onWall) {
      const [d, n] = pick.value.split(':').map(Number);
      wall(d, n);
      quiet = performance.now();
      return;
    }
    // Printed: the view dark, the party's panel, and the log cleared and printed from its top by the game's own code.
    drawVitals(g);
    g.draw.pen = 0;
    g.draw.fill(8, 8, 0xb7, 0xb7);
    const t = g.text;
    t.select(Win.messages);
    const log = t.windows[Win.messages];
    t.clearArea(log.left, log.top, log.right, log.bottom);
    t.moveTo(0, 0);
    t.font = 0;
    const run = (async () => {
      await printed.get(pick.value)?.print(g);
    })();
    printing = run;
    void run.finally(() => {
      if (printing === run) printing = null;
      g.text.font = 0;
      quiet = performance.now();
    });
  };
  // One at a time: a choice made while another is still being shown waits for it, and several such are one - two
  // prints at once would share the log and the conversation's place in its script.
  let queue = Promise.resolve();
  let waiting = false;
  const show = (): Promise<void> => {
    if (waiting) return queue;
    waiting = true;
    queue = queue.then(async () => {
      waiting = false;
      try {
        await showNow();
      } catch (err: unknown) {
        $('status').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    return queue;
  };
  // For the console, as the game's window.u5.
  (window as unknown as { runes: unknown }).runes = { g, screen };
  for (const el of [...choices, plated, loop]) el.addEventListener('change', () => void show());
  $('replay').addEventListener('click', () => void show());
  // A dungeon sign's view drawn again as the game draws it while it waits for a key (dungeon.ts), each time carving
  // the sign's letters as far as they have been read: the reading goes on only as the view is drawn.
  setInterval(() => {
    if (!printed.has(pick.value)) refresh(g);
  }, 110);
  // The loop: read again a while after the last letter has been read.
  setInterval(() => {
    const fb = screen.fb;
    if (!loop.checked) return;
    if (printing || fb.runes.active || performance.now() < fb.signReadBy) quiet = performance.now();
    else if (performance.now() - quiet > LOOP_MS) void show();
  }, 250);
  await show();
}

start().catch((err: unknown) => {
  $('status').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
