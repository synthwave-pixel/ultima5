// The game's key art, drawn from the icon's ankh and the box's look - "Ultima V" in IM FELL English (the game's own
// book lettering) in the box's chrome, three hooded Shadowlords with red eyes, the red frame - in every shape it is shown:
//   - Steam's library artwork, for the game added to Steam as a non-Steam game (a Flatpak on a Steam Deck or
//     Bazzite, say): the portrait capsule (600x900), the wide capsule (920x430), the hero across the top of the
//     game's page (3840x1240, no title: Steam lays the logo over it) and the logo (1280x720, transparent), in
//     desktop/build/steam/;
//   - the boot screen, shown while the game loads: web/public/boot.png, the game screen's own 320 by 200, which the
//     page draws at the display's size unsmoothed, the game's scanlines over it (main.ts);
//   - the README's banner, the hero with its title: docs/banner.png.
// The boot screen and the library artwork are drawn at the game's grain (ankh.mjs writePixelPng): pictured smaller,
// each pixel grown to a block. The boot screen and the hero, each the width of a screen, are the game's own 320 pixels
// across; the capsules, small tiles in Steam's library whose lettering must still be read, as coarse as that allows (a
// pixel of the cover twice as fine as the hero's on a Steam Deck), and the logo, laid over the hero, as the cover. The
// library's pictures carry the game's scanlines, one to a row of pixels (src/ui/scanlines.ts: the lower half of each
// let through at 0.65) - but the logo, which has nothing behind its letters. The icon has neither.
// Run `node tools/key-art.mjs`. TITLE_FONT and SUB_FONT name another of the game's fonts to try (UnifrakturMaguntia,
// Sixtyfour, Britannian Runes II); an argument, another directory for the Steam artwork.
import { BLUE, ORANGE, RED, RED_DARK, ankhAt, chromeText, fitText, ground, plainText, writePixelPng, writePng } from './ankh.mjs';

const OUT = process.argv[2] ?? 'desktop/build/steam';
const TITLE_FONT = process.env.TITLE_FONT ?? 'IM FELL English';
const SUB_FONT = process.env.SUB_FONT ?? TITLE_FONT;
/** The title and the subtitle under it, centred on x, each fitted to its width (and the title to `tall`). */
const titles = (id, x, y, width, tall, gap, subWidth) => {
  // (The runes are capitals, as the game's rune texts are.)
  const words = (text, font) => (font === 'Britannian Runes II' ? text.toUpperCase() : text);
  const [title, subtitle] = [words('Ultima V', TITLE_FONT), words('Warriors of Destiny', SUB_FONT)];
  const size = fitText(title, width, TITLE_FONT, tall);
  const sub = fitText(subtitle, subWidth, SUB_FONT, tall * 0.4);
  return `${chromeText(id, title, x, y, size, TITLE_FONT)}${plainText(subtitle, x, y + gap + sub * 0.7, sub, undefined, SUB_FONT)}`;
};

/**
 * A Shadowlord, as the box has them: a tall peaked hood and cloak, near-black, lit blue along its edges from behind;
 * in the hood's arch a black hollow and two red eyes. Its foot at (x, base), `h` tall; it fades into the ground.
 */
function shadowlord(id, x, base, h, glow = 1) {
  const w = h * 0.56;
  const p = (fx, fy) => `${(fx * w).toFixed(1)} ${(fy * h).toFixed(1)}`;
  // The hood's peak, falling to the shoulders a quarter of the way down, the cloak spreading to the ground.
  const cloak =
    `M${p(0, 0)} C${p(0.13, 0.01)} ${p(0.21, 0.09)} ${p(0.23, 0.2)} C${p(0.3, 0.25)} ${p(0.37, 0.33)} ${p(0.4, 0.5)} ` +
    `C${p(0.44, 0.7)} ${p(0.48, 0.86)} ${p(0.5, 1)} L${p(-0.5, 1)} C${p(-0.48, 0.86)} ${p(-0.44, 0.7)} ${p(-0.4, 0.5)} ` +
    `C${p(-0.37, 0.33)} ${p(-0.3, 0.25)} ${p(-0.23, 0.2)} C${p(-0.21, 0.09)} ${p(-0.13, 0.01)} ${p(0, 0)} Z`;
  // The hood's opening: an arch, pointed at the top.
  const hollow = `M${p(0, 0.055)} C${p(0.07, 0.07)} ${p(0.115, 0.12)} ${p(0.115, 0.2)} L${p(-0.115, 0.2)} C${p(-0.115, 0.12)} ${p(-0.07, 0.07)} ${p(0, 0.055)} Z`;
  const folds = [-0.16, 0.05, 0.22]
    .map(
      (f) =>
        `<path d="M${p(f * 0.5, 0.3)} C${p(f * 0.8, 0.55)} ${p(f, 0.8)} ${p(f * 1.1, 1)}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="${(h * 0.01).toFixed(1)}"/>`,
    )
    .join('');
  const eye = (dx) =>
    `<ellipse cx="${(dx * w).toFixed(1)}" cy="${(0.145 * h).toFixed(1)}" rx="${(h * 0.022).toFixed(1)}" ry="${(h * 0.014).toFixed(1)}" fill="#FF2A10" filter="url(#${id}eye)"/>` +
    `<ellipse cx="${(dx * w).toFixed(1)}" cy="${(0.145 * h).toFixed(1)}" rx="${(h * 0.009).toFixed(1)}" ry="${(h * 0.0055).toFixed(1)}" fill="#FFB49A"/>`;
  return `
  <defs>
    <linearGradient id="${id}cloak" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1B4E86"/>
      <stop offset="0.1" stop-color="#0B2140"/>
      <stop offset="0.5" stop-color="#050E1C"/>
      <stop offset="0.88" stop-color="#0B2140"/>
      <stop offset="1" stop-color="#2564A6"/>
    </linearGradient>
    <linearGradient id="${id}fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF"/>
      <stop offset="0.6" stop-color="#FFF"/>
      <stop offset="1" stop-color="#FFF" stop-opacity="0.15"/>
    </linearGradient>
    <mask id="${id}mask" maskUnits="userSpaceOnUse" x="${-w}" y="-10" width="${2 * w}" height="${h + 20}">
      <rect x="${-w}" y="0" width="${2 * w}" height="${h}" fill="url(#${id}fade)"/>
    </mask>
    <filter id="${id}eye" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="${(h * 0.01).toFixed(1)}"/></filter>
  </defs>
  <g transform="translate(${x} ${base - h})" mask="url(#${id}mask)" opacity="${glow}">
    <path d="${cloak}" fill="url(#${id}cloak)" stroke="#6CB4EC" stroke-opacity="0.55" stroke-width="${(h * 0.005).toFixed(1)}"/>
    ${folds}
    <path d="${hollow}" fill="#000" stroke="#123A66" stroke-width="${(h * 0.006).toFixed(1)}"/>
    ${eye(-0.045)}${eye(0.045)}
  </g>`;
}

/** The box's frame: a broad red line between dark ones, a thin bright one inside it, and square knots at the corners. */
function frame(w, h, inset, line) {
  const corners = [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ]
    .map(
      ([x, y]) =>
        `<rect x="${x - line * 1.3}" y="${y - line * 1.3}" width="${line * 2.6}" height="${line * 2.6}" rx="${line * 0.3}" fill="${RED}" stroke="${RED_DARK}" stroke-width="${line * 0.4}"/>` +
        `<rect x="${x - line * 0.55}" y="${y - line * 0.55}" width="${line * 1.1}" height="${line * 1.1}" rx="${line * 0.15}" fill="${ORANGE}"/>`,
    )
    .join('');
  return `
  <rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="${RED_DARK}" stroke-width="${line * 1.7}"/>
  <rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" fill="none" stroke="${RED}" stroke-width="${line}"/>
  <rect x="${inset + line * 1.7}" y="${inset + line * 1.7}" width="${w - 2 * inset - line * 3.4}" height="${h - 2 * inset - line * 3.4}" fill="none" stroke="${ORANGE}" stroke-opacity="0.8" stroke-width="${line * 0.25}"/>
  ${corners}`;
}

/** A mist low over the ground, the blue of the box's swamp light. */
function mist(id, w, h, y) {
  return `
  <defs>
    <linearGradient id="${id}mist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0.16"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${y}" width="${w}" height="${h - y}" fill="url(#${id}mist)"/>`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

// The portrait capsule: the title at the top, as on the box; the Shadowlords looming over the ankh below it.
const capsule = svg(
  600,
  900,
  `${ground('c', 300, 560, 620)}<rect width="600" height="900" fill="url(#cground)"/>
  ${shadowlord('c1', 120, 900, 470, 0.85)}${shadowlord('c3', 480, 900, 470, 0.85)}${shadowlord('c2', 300, 900, 620)}
  ${mist('c', 600, 900, 560)}
  ${ankhAt('ca', 300, 690, 0.4)}
  ${titles('ct', 300, 170, 480, 115, 22, 380)}
  ${frame(600, 900, 16, 9)}`,
);

// The wide capsule: the title to the left, the ankh and a Shadowlord behind it to the right.
const wide = svg(
  920,
  430,
  `${ground('w', 700, 230, 520)}<rect width="920" height="430" fill="url(#wground)"/>
  ${shadowlord('w1', 600, 430, 300, 0.75)}${shadowlord('w3', 820, 430, 300, 0.75)}${shadowlord('w2', 710, 430, 390)}
  ${mist('w', 920, 430, 260)}
  ${ankhAt('wa', 710, 300, 0.2)}
  ${titles('wt', 290, 222, 440, 110, 26, 360)}
  ${frame(920, 430, 14, 8)}`,
);

// The hero: no title (Steam lays the logo over it, low on the left); the Shadowlords to the right, the ankh glowing
// between them and the logo. Its top is Steam's: the Steam Deck lays its status bar (search, battery, clock) across the
// top right of a game's page, so the Shadowlords stand low, the tallest's hood more than a third of the way down (HERO_TOP).
const HERO_TOP = 0.36;
const heroBody = `${ground('h', 2500, 620, 2200)}<rect width="3840" height="1240" fill="url(#hground)"/>
  ${shadowlord('h1', 2660, 1240, 640, 0.7)}${shadowlord('h3', 3380, 1240, 640, 0.7)}${shadowlord('h2', 3020, 1240, 1240 * (1 - HERO_TOP))}
  ${mist('h', 3840, 1240, 700)}
  ${ankhAt('ha', 1980, 680, 0.95)}`;
const hero = svg(3840, 1240, heroBody);

// The logo: the title alone, on nothing.
const logo = svg(1280, 720, `${titles('lt', 640, 400, 1120, 290, 70, 860)}`);

// The boot screen, at the game screen's shape (16:10): the wide capsule's picture, the title to the left of the ankh.
const boot = svg(
  1600,
  1000,
  `${ground('b', 1200, 520, 1100)}<rect width="1600" height="1000" fill="url(#bground)"/>
  ${shadowlord('b1', 1040, 1000, 640, 0.75)}${shadowlord('b3', 1470, 1000, 640, 0.75)}${shadowlord('b2', 1255, 1000, 840)}
  ${mist('b', 1600, 1000, 600)}
  ${ankhAt('ba', 1255, 690, 0.42)}
  ${titles('bt', 470, 480, 660, 170, 50, 560)}
  ${frame(1600, 1000, 24, 13)}`,
);

// The README's banner: the hero, its title set where Steam lays the logo (smooth, without scanlines: a page shows it small).
const banner = svg(3840, 1240, `${heroBody}${titles('nt', 880, 700, 1300, 340, 90, 1050)}`);

// Each at its size in Steam, of pixels this many across (see the head of this file).
writePixelPng(`${OUT}/capsule.png`, capsule, 600, 900, 6);
writePixelPng(`${OUT}/wide.png`, wide, 920, 430, 4);
writePixelPng(`${OUT}/hero.png`, hero, 3840, 1240, 12);
writePixelPng(`${OUT}/logo.png`, logo, 1280, 720, 6, false);
// The boot screen at the game screen's own 320 by 200: the page grows it, and lays the scanlines over it.
writePng('web/public/boot.png', boot, 320);
writePng('docs/banner.png', banner, 1920);
console.log(`key art written: Steam's in ${OUT}, the boot screen, the README's banner`);
