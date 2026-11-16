// The README's promotional sheets, put together from screenshots of the game (as ultima3's promo/ are):
//   - promo/features.jpg: nine scenes of the Enhanced interface and the Remastered look, each captioned - towns, talk
//     (the reply in a box over the view, the words to say framed under it), combat, the dungeons and their map, the
//     journal, the cloth map, the mirror and the gypsy;
//   - promo/looks.jpg and promo/looks-2.jpg: the looks, newest first - each in the world, a town, combat and a dungeon,
//     and in the Enhanced interface the dungeon also as the whole level's map. The first sheet five looks under
//     Enhanced, the second the Apple II's three under Enhanced and two under Retro.
// The screenshots are the game's own canvas, taken in the dev server at the `?play&peek&ux=&tiles=&at=` starts (the
// looks' from showcase/12-blackthorns-palace.json, at world:86,108, town:1:15,24:0, arena:2 and dungeon:1 lit, facing
// south), and so made from the player's own copy of the game: they are kept in screenshots/ at the repository's root
// (git-ignored), named promo-<scene>.png as below.
// Run `node tools/promo.mjs` in web/. The JPEGs are made with macOS's sips, or ImageMagick.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ICE, PALE, ROOT } from './ankh.mjs';

const SHOTS = join(ROOT, 'screenshots');
const FONT = 'IM FELL English';
const GROUND = '#111315';
const DIM = '#7F96A0';

const FEATURES = [
  ['town', 'Towns by day and night, their people at their schedules'],
  ['talk', 'Talk by the words you have learned, the reply above'],
  ['combat-ship', 'Combat on land and sea: pirates boarding'],
  ['dungeon', 'First-person dungeons, lit by torch'],
  ['dungeon-map', 'The whole dungeon level, mapped as you go'],
  ['journal', 'A journal of what you have heard, with hints'],
  ['map', 'The cloth map from the box, in the game'],
  ['mirror', 'Choose how the Avatar looks, at the mirror'],
  ['gypsy', "The gypsy's questions of virtue, as in the original"],
];

// The looks, newest first: the shots' name, the row's label, and whether it has the whole level's map for a dungeon
// (the Enhanced interface's alone). Two sheets, to be read at the README's width.
const LOOK_SHEETS = [
  {
    file: 'promo/looks.jpg',
    title: 'Eight looks, one game: newest first',
    looks: [
      ['look-remastered', 'Remastered (2026), Enhanced', true],
      ['look-x68k', 'Sharp X68k (1990), Enhanced', true],
      ['look-c64', 'C64 (1989), Enhanced', true],
      ['look-ega', 'PC EGA (1988), Enhanced', true],
      ['look-cga', 'PC CGA (1988), Enhanced', true],
    ],
  },
  {
    file: 'promo/looks-2.jpg',
    title: "The Apple II's looks, and the Retro interface",
    looks: [
      ['look-apple', 'Apple Color (1988), Enhanced', true],
      ['look-apple2e', 'Apple //e (1988), Enhanced', true],
      ['look-apple2c', 'Apple //c (1988), Enhanced', true],
      ['look-retro-ega', 'PC EGA (1988), Retro: the 1988 screen', false],
      ['look-retro-apple', 'Apple Color (1988), Retro', false],
    ],
  },
];
const SCENES = ['world', 'town', 'combat', 'dungeon', 'dungeon-map'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A screenshot, drawn w by h at (x, y). */
function shot(name, x, y, w, h) {
  const png = readFileSync(join(SHOTS, `promo-${name}.png`)).toString('base64');
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="data:image/png;base64,${png}"/>`;
}

const text = (s, x, y, size, fill, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${GROUND}"/>${body}</svg>`;

/** An SVG drawn to a JPEG under the repository's root, by way of a PNG beside it. */
function writeJpeg(path, art) {
  const to = join(ROOT, path);
  const from = to.replace(/\.jpg$/, '.tmp.png');
  mkdirSync(join(to, '..'), { recursive: true });
  const fonts = ['IMFeENrm28P.ttf'].map((f) => join(ROOT, 'web/public/fonts', f));
  const png = new Resvg(art, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: FONT } }).render().asPng();
  writeFileSync(from, png);
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', from, '--out', to], { stdio: 'ignore' });
  } catch {
    execFileSync('magick', [from, '-quality', '85', to], { stdio: 'ignore' });
  } finally {
    rmSync(from, { force: true });
  }
}

const W = 1560;
const M = 18; // the margin round the sheet
const GAP = 12; // between pictures across

// The features: three by three, each captioned under it.
{
  const w = (W - 2 * M - 2 * GAP) / 3;
  const h = Math.round((w * 10) / 16);
  const top = 64;
  const row = h + 46;
  let body = text('Ultima V: Warriors of Destiny, remade', M, 44, 34, ICE);
  FEATURES.forEach(([name, caption], i) => {
    const [x, y] = [M + (i % 3) * (w + GAP), top + Math.floor(i / 3) * row];
    body += shot(name, x, y, w, h) + text(caption, x, y + h + 26, 21, PALE);
  });
  writeJpeg('promo/features.jpg', svg(W, top + 3 * row, body));
}

// The looks: a row to each look, a column to each scene; a sheet to each five.
for (const { file, title, looks } of LOOK_SHEETS) {
  const w = (W - 2 * M - (SCENES.length - 1) * GAP) / SCENES.length;
  const h = Math.round((w * 10) / 16);
  const top = 88;
  const row = h + 52;
  let body = text(title, M, 44, 34, ICE);
  SCENES.forEach((scene, c) => (body += text(scene.replace('-', ' ').toUpperCase(), M + c * (w + GAP), 76, 15, DIM)));
  looks.forEach(([look, label, mapped], r) => {
    const y = top + r * row;
    body += text(label, M, y + 24, 22, PALE);
    SCENES.forEach((scene, c) => {
      if (scene === 'dungeon-map' && !mapped) return;
      body += shot(`${look}-${scene}`, M + c * (w + GAP), y + 36, w, h);
    });
  });
  writeJpeg(file, svg(W, top + looks.length * row + 4, body));
}
