// The app's icon, drawn here as vectors and rendered at every size it is wanted: an ankh in the chrome of the box's
// "Ultima V" lettering (ice white at the top, a dark horizon, deep blue below), on the box's near-black, inside the
// box's red frame. One drawing, in the shapes each place wants:
//   - a tile, square with rounded corners and the frame: the desktop apps (desktop/build/icon.png, and the sizes in
//     desktop/build/icons/ that the Linux packages install - a Flatpak takes none over 512), the PWA, Apple's
//     touch icon, Android's legacy launcher icon;
//   - a disc, the frame a ring: Android's legacy round launcher icon;
//   - the ankh alone in the middle of a larger square: Android's adaptive icon (its foreground, on
//     ic_launcher_background's colour; the launcher cuts it to a circle or a squircle, and shows it on the launch
//     screen) and the PWA's maskable icon.
// The ankh and the colours are tools/ankh.mjs's. The SVG itself is web/public/icon.svg (the page's favicon).
// Run `node tools/icons.mjs`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CENTRE, GROUND, ORANGE, RED, RED_DARK, REACH, ROOT, ankh, ground, writePng } from './ankh.mjs';

/** The tile: a rounded square, the box's red frame (a broad line between dark ones, a thin bright one inside) and its corners. */
function tile() {
  const corners = [
    [96, 96],
    [928, 96],
    [96, 928],
    [928, 928],
  ]
    .map(
      ([x, y]) =>
        `<rect x="${x - 26}" y="${y - 26}" width="52" height="52" rx="6" fill="${RED}" stroke="${RED_DARK}" stroke-width="8"/>` +
        `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="3" fill="${ORANGE}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${ground('t')}
  <rect width="1024" height="1024" rx="160" fill="url(#tground)"/>
  <rect x="96" y="96" width="832" height="832" fill="none" stroke="${RED_DARK}" stroke-width="34"/>
  <rect x="96" y="96" width="832" height="832" fill="none" stroke="${RED}" stroke-width="20"/>
  <rect x="130" y="130" width="764" height="764" fill="none" stroke="${ORANGE}" stroke-opacity="0.8" stroke-width="5"/>
  ${corners}
  <g transform="translate(512 521) scale(0.86) translate(-512 -521)">${ankh('t')}</g>
</svg>`;
}

/** The tile for the smallest sizes (48 and under): the frame only a red edge, the ankh as large as the square allows. */
function smallTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${ground('s')}
  <rect x="24" y="24" width="976" height="976" rx="150" fill="url(#sground)" stroke="${RED}" stroke-width="48"/>
  <g transform="translate(512 512) scale(1.12) translate(-${CENTRE.x} -${CENTRE.y})">${ankh('s')}</g>
</svg>`;
}

/** The disc: the frame a ring round it. */
function disc() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${ground('d')}
  <circle cx="512" cy="512" r="512" fill="url(#dground)"/>
  <circle cx="512" cy="512" r="466" fill="none" stroke="${RED_DARK}" stroke-width="36"/>
  <circle cx="512" cy="512" r="466" fill="none" stroke="${RED}" stroke-width="22"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="${ORANGE}" stroke-opacity="0.8" stroke-width="5"/>
  <g transform="translate(512 521) scale(0.98) translate(-512 -521)">${ankh('d')}</g>
</svg>`;
}

/**
 * The ankh alone, centred so that all of it lies within a circle `safe` of the square's width across (Android's
 * adaptive icons keep 66 of their 108 units; a maskable PWA icon, 80 in 100), on the ground or on nothing.
 */
function bare(safe, withGround) {
  const scale = (safe * 512) / REACH;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${withGround ? `${ground('b')}<rect width="1024" height="1024" fill="url(#bground)"/>` : ''}
  <g transform="translate(512 512) scale(${scale.toFixed(4)}) translate(-${CENTRE.x} -${CENTRE.y})">${ankh('b')}</g>
</svg>`;
}

const write = writePng;

const TILE = tile();
const DISC = disc();
writeFileSync(join(ROOT, 'web/public/icon.svg'), TILE);
write('web/public/pwa-192.png', TILE, 192);
write('web/public/pwa-512.png', TILE, 512);
write('web/public/pwa-maskable-512.png', bare(0.8 * 0.95, true), 512);
write('web/public/apple-touch-icon.png', bare(0.9, true), 180); // iOS rounds its own corners, over a full square
write('desktop/build/icon.png', TILE, 1024);
const SMALL = smallTile();
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024])
  write(`desktop/build/icons/${size}x${size}.png`, size <= 48 ? SMALL : TILE, size);
const RES = 'mobile/android/app/src/main/res';
const FOREGROUND = bare((66 / 108) * 0.95, false);
for (const [d, k] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  write(`${RES}/mipmap-${d}/ic_launcher.png`, TILE, 48 * k);
  write(`${RES}/mipmap-${d}/ic_launcher_round.png`, DISC, 48 * k);
  write(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, FOREGROUND, 108 * k);
}
// The launch screen behind the launcher's icon: the ground's colour (Android shows the adaptive icon over it).
const SPLASH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${GROUND}"/></svg>`;
for (const d of [
  'drawable',
  ...['land', 'port'].flatMap((o) => ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].map((k) => `drawable-${o}-${k}`)),
])
  write(`${RES}/${d}/splash.png`, SPLASH, 64);
console.log('icons written');
