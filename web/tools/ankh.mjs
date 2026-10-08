// The drawing the app's icon (tools/icons.mjs) and its key art (tools/key-art.mjs) share: the ankh in the
// chrome of the box's "Ultima V" lettering, the box's colours, and a renderer to PNG (resvg, with the game's own
// fonts and no others, so a picture renders the same on any machine).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS = ['UnifrakturMaguntia-Book.ttf', 'IMFeENrm28P.ttf', 'Sixtyfour.ttf', 'BritannianRunesII.ttf'].map((f) =>
  join(ROOT, 'web/public/fonts', f),
);

// The box's colours (Ultima V's 1988 cover): the lettering's chrome, its dark outline, the ground, the frame.
export const ICE = '#E4F5F7';
export const PALE = '#A3DDF0';
export const SKY = '#67CBEC';
export const HORIZON = '#2E464D';
export const DEEP = '#3064BC';
export const BLUE = '#349CE2';
export const OUTLINE = '#0B1D24';
export const GROUND = '#071315';
export const GROUND_LIT = '#11303A';
export const RED = '#B8321F';
export const RED_DARK = '#611207';
export const ORANGE = '#E88C45';

// The ankh in a 1024 square, its middle at (512, 521): a loop over a flared crossbar and a stem that widens to its
// foot. Each piece is a closed path; drawn together they are one shape.
const LOOP =
  'M512 150 C604 150 664 226 664 318 C664 398 616 458 560 500 L464 500 C408 458 360 398 360 318 C360 226 420 150 512 150 Z ' +
  'M512 214 C462 214 430 260 430 318 C430 380 466 428 512 462 C558 428 594 380 594 318 C594 260 562 214 512 214 Z';
const BAR =
  'M256 486 C300 500 360 504 420 504 L604 504 C664 504 724 500 768 486 L768 590 C724 576 664 572 604 572 L420 572 C360 572 300 576 256 590 Z';
const STEM = 'M474 560 L550 560 C556 680 566 790 588 858 L600 892 L424 892 L436 858 C458 790 468 680 474 560 Z';
const PIECES = [LOOP, BAR, STEM];
export const CENTRE = { x: 512, y: 521 };
export const REACH = 382; // the farthest the ankh's edge (and its outline) goes from its middle

// The fonts as resvg is given them. Britannian Runes II is not found by its name (its name table, presumably), only as
// a generic family's font: it is set as `serif`, and named so here.
const FONT_OPTIONS = {
  fontFiles: FONTS,
  loadSystemFonts: false,
  defaultFontFamily: 'UnifrakturMaguntia',
  serifFamily: 'Britannian Runes II',
};
const family = (name) => (name === 'Britannian Runes II' ? 'serif' : name);

/** The chrome's stops, top to bottom: ice, a dark horizon, deep blue, and light again at the foot. */
export function chrome(id, y1, y2) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">
      <stop offset="0" stop-color="${ICE}"/>
      <stop offset="0.28" stop-color="${PALE}"/>
      <stop offset="0.46" stop-color="${SKY}"/>
      <stop offset="0.5" stop-color="${HORIZON}"/>
      <stop offset="0.53" stop-color="${DEEP}"/>
      <stop offset="0.8" stop-color="${BLUE}"/>
      <stop offset="1" stop-color="${PALE}"/>
    </linearGradient>`;
}

/** A soft drop shadow's blur, and the light rim just inside a shape's edge (the whole shape's, no seams). */
function effects(id, rim) {
  return `<filter id="${id}blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}rim" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="erode" radius="${rim}" result="in"/>
      <feComposite in="SourceAlpha" in2="in" operator="out" result="edge"/>
      <feGaussianBlur in="edge" stdDeviation="1.2" result="soft"/>
      <feFlood flood-color="#FFFFFF" flood-opacity="0.6"/>
      <feComposite in2="soft" operator="in"/>
    </filter>`;
}

/** The ankh: a shadow, its outline, the chrome, and its rim. `id` keeps the gradients apart. */
export function ankh(id) {
  const shape = PIECES.map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join('');
  return `
  <defs>${chrome(`${id}chrome`, 150, 892)}${effects(id, 7)}</defs>
  <g transform="translate(10 18)" fill="#000" opacity="0.65" filter="url(#${id}blur)">${shape}</g>
  <g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="30" stroke-linejoin="round">${shape}</g>
  <g fill="url(#${id}chrome)">${shape}</g>
  <g fill="#FFFFFF" filter="url(#${id}rim)">${shape}</g>`;
}

/** The ankh with its middle at (x, y), `scale` times the 1024 drawing's size. */
export function ankhAt(id, x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(4)}) translate(-${CENTRE.x} -${CENTRE.y})">${ankh(id)}</g>`;
}

/** The ground's gradient (`${id}ground`): near-black, lit a little round (cx, cy). */
export function ground(id, cx = 512, cy = 470, r = 560) {
  return `
  <defs>
    <radialGradient id="${id}ground" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${GROUND_LIT}"/>
      <stop offset="1" stop-color="${GROUND}"/>
    </radialGradient>
  </defs>`;
}

/**
 * Words in the box's chrome, outlined dark, with a shadow and a rim; centred on x, its baseline at y. The lettering is
 * one of the game's own fonts: blackletter (UnifrakturMaguntia) unless another is named.
 */
export function chromeText(id, text, x, y, size, name = 'UnifrakturMaguntia') {
  const t = `<text x="${x}" y="${y}" font-family="${family(name)}" font-size="${size}" text-anchor="middle">${text}</text>`;
  const o = Math.max(4, size * 0.07);
  return `
  <defs>${chrome(`${id}chrome`, y - size * 0.78, y + size * 0.08)}${effects(id, Math.max(2, size * 0.018))}</defs>
  <g transform="translate(${size * 0.03} ${size * 0.05})" fill="#000" stroke="#000" stroke-width="${o}" opacity="0.7" filter="url(#${id}blur)">${t}</g>
  <g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${o}" stroke-linejoin="round">${t}</g>
  <g fill="url(#${id}chrome)">${t}</g>
  <g fill="#FFFFFF" filter="url(#${id}rim)">${t}</g>`;
}

/** Plain words, one colour, outlined dark; centred on x, the baseline at y. */
export function plainText(text, x, y, size, colour = PALE, name = 'UnifrakturMaguntia') {
  const t = `<text x="${x}" y="${y}" font-family="${family(name)}" font-size="${size}" text-anchor="middle">${text}</text>`;
  return `<g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${Math.max(3, size * 0.12)}" stroke-linejoin="round">${t}</g><g fill="${colour}">${t}</g>`;
}

/** The font size at which `text` is `width` across, or `height` tall if that is less (its outline and shadow besides). */
export function fitText(text, width, name = 'UnifrakturMaguntia', height = Infinity) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400"><text x="10" y="300" font-family="${family(name)}" font-size="100">${text}</text></svg>`;
  const box = new Resvg(probe, { font: FONT_OPTIONS }).getBBox();
  return Math.min((100 * width) / (box?.width ?? 400), (100 * height) / (box?.height ?? 100));
}

/** An SVG rendered to a PNG `width` wide, written under the repository's root. */
export function writePng(path, svg, width) {
  const file = resolve(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: FONT_OPTIONS,
  })
    .render()
    .asPng();
  writeFileSync(file, png);
}

/**
 * An SVG written flattened (resvg's own tree, its text turned to outlines), so that a browser draws it as it is drawn
 * here - at any size, with no font to fetch.
 */
export function writeSvg(path, svg) {
  const file = resolve(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, new Resvg(svg, { font: FONT_OPTIONS }).toString());
}

/**
 * An SVG drawn at the game's grain: rendered `pixel` times smaller than `width` by `height`, each of its pixels then
 * grown to a block of `pixel` (no smoothing), and - `scan` - the game's scanlines over it, one to a row of blocks, the
 * lower half of each dark (src/ui/scanlines.ts, 0.65 let through). Written as a PNG under the repository's root.
 */
export function writePixelPng(path, svg, width, height, pixel, scan = true) {
  const file = resolve(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  const small = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(width / pixel) },
    background: 'rgba(0,0,0,0)',
    font: FONT_OPTIONS,
  })
    .render()
    .asPng();
  const dark = Math.floor(pixel / 2);
  let bands = '';
  if (scan)
    for (let y = pixel - dark; y < height; y += pixel)
      bands += `<rect x="0" y="${y}" width="${width}" height="${Math.min(dark, height - y)}"/>`;
  const big = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">
  <image width="${width}" height="${height}" preserveAspectRatio="none" image-rendering="optimizeSpeed" xlink:href="data:image/png;base64,${Buffer.from(small).toString('base64')}"/>
  <g fill="#000" fill-opacity="${1 - 0.65}">${bands}</g></svg>`;
  writeFileSync(file, new Resvg(big, { background: 'rgba(0,0,0,0)' }).render().asPng());
}
