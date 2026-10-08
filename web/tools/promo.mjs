// The README's promotional sheets, put together from screenshots of the game (as ultima3's promo/ are):
//   - promo/features.jpg: nine scenes of the Modern look, each captioned - towns, talk, combat, the dungeons and their
//     map, the journal, the cloth map, the mirror and the gypsy;
//   - promo/looks.jpg: the two looks and their tiles (Modern with Modern PC, Apple ][ or PC EGA; PC 1988 with PC EGA or
//     Apple ][), each in the world, a town, combat and a dungeon.
// The screenshots are the game's own canvas (2560x1600), taken in the dev server with tools/pilot (its bot, the
// `?play&peek&at=` starts and shots.mjs to save them) from a mid-game save, and so made from the player's own copy of the
// game: they are kept in screenshots/ at the repository's root (git-ignored), named promo-<scene>.png as below.
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
  ['talk', 'Talk by the words you have learned, picked from a list'],
  ['combat-ship', 'Combat on land and sea: pirates boarding'],
  ['dungeon', 'First-person dungeons, lit by torch'],
  ['dungeon-map', 'The whole dungeon level, mapped as you go'],
  ['journal', 'A journal of what you have heard, with hints'],
  ['map', 'The cloth map from the box, in the game'],
  ['mirror', 'Choose how the Avatar looks, at the mirror'],
  ['gypsy', "The gypsy's questions of virtue, as in the original"],
];

const LOOKS = [
  ['look-modern', 'Modern look, Modern PC tiles'],
  ['look-apple', 'Modern look, Apple ][ tiles'],
  ['look-ega', 'Modern look, PC EGA tiles'],
  ['look-orig-ega', 'PC 1988 look, PC EGA tiles'],
  ['look-orig-apple', 'PC 1988 look, Apple ][ tiles'],
];
const SCENES = ['world', 'town', 'combat', 'dungeon'];

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

// The looks: a row to each look and its tiles, a column to each scene.
{
  const w = (W - 2 * M - 3 * GAP) / 4;
  const h = Math.round((w * 10) / 16);
  const top = 88;
  const row = h + 52;
  let body = text('Two looks, three tile sets, one game', M, 44, 34, ICE);
  SCENES.forEach((scene, c) => (body += text(scene.toUpperCase(), M + c * (w + GAP), 76, 15, DIM)));
  LOOKS.forEach(([look, label], r) => {
    const y = top + r * row;
    body += text(label, M, y + 24, 22, PALE);
    SCENES.forEach((scene, c) => (body += shot(`${look}-${scene}`, M + c * (w + GAP), y + 36, w, h)));
  });
  writeJpeg('promo/looks.jpg', svg(W, top + LOOKS.length * row + 4, body));
}
