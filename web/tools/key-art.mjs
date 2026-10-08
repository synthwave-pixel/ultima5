// The game's key art: Denis Loubet's painting from the box (1988) - the three hooded Shadowlords looming over the
// Avatar as he stands over his fallen friend - under "Ultima V" in IM FELL English in the box's chrome (ankh.mjs), with
// "Warriors of Destiny" and "1988 〜 2026" under it, on the near-black of the icon's ground. No red frame, the box's nor
// any other. The painting is the box's own, its lettering taken out of it; where a shape is wider or taller than the
// painting, the painting's own colours, blurred, darkened and turned to the wood's blue-green, carry it on to the
// edges, and its edges are feathered into them. The painting is cover-hires-900x1301.png in web/art/cover/ (see its
// README; docs/key-art-brief.md says what the art is to be): whole in the portrait capsule; in the wide shapes from just
// above the Shadowlords, but always the whole scene. Smooth, at full size: the box art as the box was, a painting.
// It is drawn in every shape it is shown in:
//   - Steam's library artwork, for the game added to Steam as a non-Steam game (desktop/steamArt.cjs puts it in place):
//     the portrait capsule (600x900), the wide capsule (920x430), the hero across the top of the game's page
//     (3840x1240, no words: Steam lays the logo over it) and the logo (1280x720, the title alone, on nothing), in
//     desktop/build/steam/ (or the directory an argument names);
//   - the boot screen, shown while the game loads (main.ts): web/public/boot.jpg, 1600x1000 (the game screen's shape),
//     a JPEG for its size;
//   - the README's banner: docs/banner.png, 1920x620;
//   - and each of them at its native size, in art/ at the repository's root (its README): as large as the scan allows,
//     the painting shown at no more than its own size there - never smaller than the shape's own size.
// Run `node tools/key-art.mjs [dir]` in web/. The boot screen's JPEG is made with macOS's sips, or ImageMagick.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OUTLINE, PALE, ROOT, chromeText, fitText, ground, plainText, writePng } from './ankh.mjs';
import { decodePng, encodePng } from './png.ts';

const STEAM = process.argv[2] ?? 'desktop/build/steam';
const FONT = 'IM FELL English';
const COVER = join(ROOT, 'web/art/cover');

/** A source's pixels, cropped to (x, y, w, h). */
function crop(img, x, y, w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) data.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4);
  return { width: w, height: h, data };
}

/**
 * Lettering taken out of the painting within (x, y, w, h): its pixels - light and nearly grey, as the box's lettering is,
 * where the painting there is dark and coloured - and those round them, filled from the painting about them, a few
 * rows and columns at a time inward, as a painter would carry the dark over.
 */
function erase(img, x0, y0, w, h, light = 90, grey = 0.35, grow = 2) {
  const { width, data } = img;
  const at = (x, y) => (y * width + x) * 4;
  let mask = new Uint8Array(width * img.height);
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const i = at(x, y);
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const hi = Math.max(r, g, b);
      if (hi > light && (hi - Math.min(r, g, b)) / hi < grey) mask[y * width + x] = 1;
    }
  for (let k = 0; k < grow; k++) {
    const next = mask.slice();
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (mask[y * width + x])
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const [nx, ny] = [x + dx, y + dy];
            if (nx >= 0 && ny >= 0 && nx < width && ny < img.height) next[ny * width + nx] = 1;
          }
    mask = next;
  }
  // Filled from the edge of the hole inward: each pass, every hole pixel beside a filled one takes their mean.
  for (let left = mask.reduce((n, m) => n + m, 0); left > 0; ) {
    const fill = [];
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < width; x++) {
        if (!mask[y * width + x]) continue;
        let [r, g, b, n] = [0, 0, 0, 0];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const [nx, ny] = [x + dx, y + dy];
            if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < img.height && !mask[ny * width + nx]) {
              const i = at(nx, ny);
              [r, g, b, n] = [r + data[i], g + data[i + 1], b + data[i + 2], n + 1];
            }
          }
        if (n >= 2) fill.push([x, y, r / n, g / n, b / n]);
      }
    if (!fill.length) break;
    for (const [x, y, r, g, b] of fill) {
      data.set([r, g, b, 255], at(x, y));
      mask[y * width + x] = 0;
    }
    left -= fill.length;
  }
  return img;
}

const uri = (img) => `data:image/png;base64,${Buffer.from(encodePng(img)).toString('base64')}`;
const source = (name) => decodePng(readFileSync(join(COVER, name)));

// The whole painting, from just below the box's title: the subtitle taken out of the sky (its "y" reaches down to the
// tallest hood), the blue-lit rim of the hood left alone (it is coloured, the lettering grey).
const whole = erase(crop(source('cover-hires-900x1301.png'), 0, 208, 900, 1093), 0, 0, 900, 132, 80, 0.3, 2);
const WHOLE = { uri: uri(whole), w: whole.width, h: whole.height };
// The same, the whole scene - the Shadowlords looming over the Avatar as he stands over his fallen friend - from a
// little sky over the tallest hood (its peak 40 rows down, its middle 382 across) to the moss and flowers at the foot.
const framed = crop(whole, 0, 50, 900, 1043);
const FRAMED = { uri: uri(framed), w: framed.width, h: framed.height, peak: 40, middle: 382 };

/**
 * The painting `p` at (x, y), `scale` times its size, its edges feathered `fade` (top, right, bottom, left: 0 where it
 * meets the picture's edge), over its own colours blurred, darkened, turned to the wood's blue-green (so the knight's
 * red never glows at an edge) and spread to the whole `w` by `h` (and, more
 * strongly, `reach` times its own size about it).
 */
function painting(id, w, h, p, x, y, scale, [top, right, bottom, left], reach = 1.5) {
  const [pw, ph] = [p.w * scale, p.h * scale];
  const edge = (name, x1, y1, x2, y2, f, len) =>
    `<linearGradient id="${id}${name}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0" stop-color="#000"/><stop offset="${f > 0 ? Math.min(1, f / len) : 0}" stop-color="#fff"/></linearGradient>`;
  return `
  <defs>
    <filter id="${id}spread" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="${(Math.max(w, h) * 0.05).toFixed(1)}"/>
      <feColorMatrix type="matrix" values="0.12 0.12 0.06 0 0  0.1 0.24 0.12 0 0  0.08 0.18 0.26 0 0  0 0 0 1 0"/>
    </filter>
    ${edge('t', 0, y, 0, y + ph, top, ph)}${edge('b', 0, y + ph, 0, y, bottom, ph)}
    ${edge('l', x, 0, x + pw, 0, left, pw)}${edge('r', x + pw, 0, x, 0, right, pw)}
    <mask id="${id}m1" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#${id}t)"/></mask>
    <mask id="${id}m2" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#${id}b)" mask="url(#${id}m1)"/></mask>
    <mask id="${id}m3" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#${id}l)" mask="url(#${id}m2)"/></mask>
    <mask id="${id}m4" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#${id}r)" mask="url(#${id}m3)"/></mask>
  </defs>
  <image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${p.uri}" filter="url(#${id}spread)" opacity="0.8"/>
  <image x="${x - (pw * (reach - 1)) / 2}" y="${y - (ph * (reach - 1)) / 2}" width="${pw * reach}" height="${ph * reach}" preserveAspectRatio="none" href="${p.uri}" filter="url(#${id}spread)"/>
  <image x="${x}" y="${y}" width="${pw}" height="${ph}" preserveAspectRatio="none" href="${p.uri}" mask="url(#${id}m4)"/>`;
}

/** Darkness drawn in from the picture's edges, so the spread colours die away into the ground. */
const vignette = (id, w, h, cx, cy, r) => `
  <defs><radialGradient id="${id}vig" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/>
  </radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${id}vig)"/>`;

/** The title and the subtitle under it, as key-art.mjs sets them. */
const titles = (id, x, y, width, tall, gap, subWidth, dated = true) => {
  const size = fitText('Ultima V', width, FONT, tall);
  const sub = fitText('Warriors of Destiny', subWidth, FONT, tall * 0.4);
  const subY = y + gap + sub * 0.7;
  return `${chromeText(id, 'Ultima V', x, y, size, FONT)}${plainText('Warriors of Destiny', x, subY, sub, undefined, FONT)}${dated ? dateline(x, subY + sub * 0.95, sub * 0.6) : ''}`;
};

/**
 * Under the subtitle, small: "1988 〜 2026" - the 1988 game, made again - in the subtitle's face and pale blue, outlined
 * as it is; the line's middle at x, its baseline at y, `size` its type. IM FELL has no wave dash, so the 〜 is drawn: one
 * wave, a type size across, at the height of the figures' middles.
 */
function dateline(x, y, size) {
  // From the middle to each year: the wave's half-width and a type size and a quarter of space beside it.
  const half = size * 0.5;
  const gap = half + size * 1.25;
  const year = (text, anchor, at) =>
    `<text x="${at}" y="${y}" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;
  const years = year('1988', 'end', x - gap) + year('2026', 'start', x + gap);
  const [mid, rise] = [y - size * 0.24, size * 0.09];
  const wave =
    `M${x - half} ${mid + rise * 0.4} C${x - half * 0.6} ${mid - rise * 1.6} ${x - half * 0.2} ${mid - rise} ${x} ${mid} ` +
    `S${x + half * 0.6} ${mid + rise * 1.6} ${x + half} ${mid - rise * 0.4}`;
  const line = (colour, width) => `<path d="${wave}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
  return `<g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${Math.max(2, size * 0.12)}" stroke-linejoin="round">${years}</g>
  ${line(OUTLINE, size * 0.08 + Math.max(2, size * 0.12))}
  <g fill="${PALE}">${years}</g>
  ${line(PALE, size * 0.08)}`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

// The portrait capsule: the whole painting at the top, its foot dissolving into the dark; the title below it.
const cs = 600 / WHOLE.w;
const capsule = svg(
  600,
  900,
  `${ground('c', 300, 380, 640)}<rect width="600" height="900" fill="url(#cground)"/>
  ${painting('cp', 600, 900, WHOLE, 0, -12, cs, [0, 0, 190, 0])}
  ${vignette('c', 600, 900, 300, 360, 620)}
  ${titles('ct', 300, 795, 470, 100, 18, 360)}`,
);

// The wide capsule and the boot screen show the whole scene a little taller than they are, its foot and top just cut.
const WIDE_SCALE = 436 / FRAMED.h;
const BOOT_SCALE = 1012 / FRAMED.h;

// The wide capsule: the whole scene to the left, where it has the room; the title to the right, the painting's right
// edge fading under it.
const wide = svg(
  920,
  430,
  `${ground('w', 220, 230, 560)}<rect width="920" height="430" fill="url(#wground)"/>
  ${painting('wp', 920, 430, FRAMED, -4, -6, WIDE_SCALE, [30, 190, 0, 0])}
  ${vignette('w', 920, 430, 240, 215, 660)}
  ${titles('wt', 665, 222, 400, 105, 26, 330)}`,
);

// The hero: no title (Steam's rule; it lays the logo over it, low on the left unless the player moves it). The whole
// scene in the middle, as tall as the hero, its heart - the Avatar standing over his fallen friend, from the top of the
// knight's helmet (row 397 of FRAMED) to just under the friend's face (row 730), around column 430 - inside Steam's safe area, the
// middle 860 by 380 that stays in view however the Steam window is sized, the Shadowlords rising over it. (All of them
// in it, the scene would be too small to fill a window of the usual shape, where the hero is shown whole.) The wood
// carried on to both sides; the Steam Deck's status bar, across the top right, lies over wood, not over anyone.
const SAFE = { x: 1490, y: 430, w: 860, h: 380 };
const HEART = { top: 397, bottom: 730, middle: 430 };
const hs = 1200 / FRAMED.h;
const hx = SAFE.x + SAFE.w / 2 - HEART.middle * hs;
const hy = SAFE.y + SAFE.h / 2 - ((HEART.top + HEART.bottom) / 2) * hs;
const heroBody = `${ground('h', 1920, 680, 2400)}<rect width="3840" height="1240" fill="url(#hground)"/>
  ${painting('hp', 3840, 1240, FRAMED, hx, hy, hs, [120, 260, 160, 260], 2.2)}
  ${vignette('h', 3840, 1240, 1920, 680, 2400)}`;
const hero = svg(3840, 1240, heroBody);

// The logo Steam lays over the hero: the title and subtitle alone, on nothing (Steam's rule: no words but the game's
// name, so no dateline).
const logo = svg(1280, 720, titles('lt', 640, 400, 1120, 290, 70, 860, false));

// The boot screen, at the game screen's shape (16:10): the wide capsule's picture - the scene to the left, the title
// to the right.
const boot = svg(
  1600,
  1000,
  `${ground('b', 420, 520, 1100)}<rect width="1600" height="1000" fill="url(#bground)"/>
  ${painting('bp', 1600, 1000, FRAMED, -6, -6, BOOT_SCALE, [30, 300, 0, 0])}
  ${vignette('b', 1600, 1000, 450, 500, 1150)}
  ${titles('bt', 1200, 480, 600, 160, 48, 500)}`,
);

// The README's banner: as the wide capsule - the scene to the left, the title to the right - at the banner's shape,
// the scene as tall as the banner.
const ns = 1252 / FRAMED.h;
const banner = svg(
  3840,
  1240,
  `${ground('n', 1200, 640, 2400)}<rect width="3840" height="1240" fill="url(#nground)"/>
  ${painting('np', 3840, 1240, FRAMED, 620, -6, ns, [30, 380, 0, 380], 1.8)}
  ${vignette('n', 3840, 1240, 1600, 640, 2600)}
  ${titles('nt', 2720, 640, 1300, 340, 90, 1050)}`,
);

/** The size at which the painting, drawn `scale` times its own size in a shape `width` wide, is shown at its own. */
const native = (width, scale) => Math.max(width, Math.round(width / scale));

/** The boot screen as a JPEG (a painting is many times smaller so than as a PNG), from a PNG written beside it. */
function writeJpeg(path, art, width) {
  const png = path.replace(/\.jpg$/, '.tmp.png');
  writePng(png, art, width);
  const [from, to] = [join(ROOT, png), join(ROOT, path)];
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', from, '--out', to], { stdio: 'ignore' });
  } catch {
    execFileSync('magick', [from, '-quality', '85', to], { stdio: 'ignore' });
  } finally {
    rmSync(from, { force: true });
  }
}

// Where they are used, each at the size it is used at.
writePng(`${STEAM}/capsule.png`, capsule, 600);
writePng(`${STEAM}/wide.png`, wide, 920);
writePng(`${STEAM}/hero.png`, hero, 3840);
writePng(`${STEAM}/logo.png`, logo, 1280);
writeJpeg('web/public/boot.jpg', boot, 1600);
writePng('docs/banner.png', banner, 1920);
// And at their native sizes (the logo, all drawn, at twice its own).
writePng('art/capsule.png', capsule, native(600, cs));
writePng('art/wide.png', wide, native(920, WIDE_SCALE));
writePng('art/hero.png', hero, native(3840, hs));
writePng('art/logo.png', logo, 2560);
writePng('art/boot.png', boot, native(1600, BOOT_SCALE));
writePng('art/banner.png', banner, native(3840, ns));
console.log(`key art written: Steam's in ${STEAM}, the boot screen, the README's banner, and art/ at native size`);
