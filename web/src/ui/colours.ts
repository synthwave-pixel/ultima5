/** The EGA colour numbers the DOS game uses by name (u5d intro.c, set for EGA). */
export const Colour = {
  black: 0,
  blue: 1,
  green: 2,
  red: 4,
  magenta: 5,
  lightGray: 7,
  darkGray: 8,
  brightBlue: 9,
  brightGreen: 10,
  brightRed: 12,
  brightYellow: 14,
  brightWhite: 15,
  /**
   * The port's own, for the Standard look's lettering (a member's state): past the EGA's sixteen, the colour number's
   * high bits pick the colour (EXTRA_RGB) and its low four the EGA colour drawn in its place on the EGA page.
   */
  lavender: 0x10 | 13, // asleep (bright magenta on the EGA page)
  levelBlue: 0x20 | 9, // a level due (bright blue on the EGA page)
  mana: 0x30 | 13, // a member's mana in the EGA look's line while a spell is chosen (light purple; bright magenta)
  charmed: 0x40 | 13, // a member charmed in a fight, their name (pink; bright magenta on the EGA page)
} as const;

/**
 * Which dungeon's walls are being drawn, and so what colour the stone
 * takes. The walls are one set of pictures in black and white, and the
 * eight dungeons are told apart by the light in them: Deceit, Wrong and
 * Hythloth cold and violet, Despise, Covetous and Shame green with damp,
 * Destard and Doom red with what burns below. It costs nothing but a
 * multiply, and no art is drawn twice.
 */
export const DUNGEON_TINTS = [
  0xffffff, // 0: no dungeon (the pictures as they stand)
  0x7d5f9e, // 1 Deceit
  0x5f8f5a, // 2 Despise
  0xa8584c, // 3 Destard
  0x8a6aa8, // 4 Wrong
  0x6a9a62, // 5 Covetous
  0x6fae86, // 6 Shame (its walls are dark brick, so the light in it is lifted)
  0x9080c4, // 7 Hythloth (the same)
  0xb0564a, // 8 Doom
];

/**
 * The red of runes, 0xRRGGBB: the groove's (carve.ts), the violet dungeons' signs', and a word of evil said in runes
 * as it reads in the log (runeWords.ts) - one red wherever a rune is red.
 */
export const RUNE_RED = 0xc8201f;

/**
 * The colour a dungeon's signs are cut in (the Standard look, carve.ts), 0xRRGGBB: another dungeon's light, so the
 * letters stand apart from the stone they are cut in - the violet dungeons' in red (the runes' red, as Doom's light
 * is), the green ones' in the violet of Hythloth's, the red ones' in the green of Shame's - its hue kept, deepened and
 * lifted to be read. 0 outside a dungeon (the cut's own pale stone).
 */
export function signInk(dungeon: number): number {
  const [violet, green, red] = [
    [1, 4, 7],
    [2, 5, 6],
    [3, 8],
  ];
  const donor = violet.includes(dungeon) ? 8 : green.includes(dungeon) ? 7 : red.includes(dungeon) ? 6 : 0;
  if (!donor) return 0;
  if (donor === 8) return RUNE_RED;
  const [h, s] = hsl(DUNGEON_TINTS[donor]);
  return fromHsl(h, Math.min(1, s * 1.8), SIGN_LIGHT);
}

/** How light a sign's letters are: well above the lit stone round them. */
const SIGN_LIGHT = 0.66;

/** A colour (0xRRGGBB) as hue (0-1), saturation and lightness. */
function hsl(rgb: number): [number, number, number] {
  const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff].map((v) => v / 255);
  const [hi, lo] = [Math.max(r, g, b), Math.min(r, g, b)];
  const l = (hi + lo) / 2;
  if (hi === lo) return [0, 0, l];
  const d = hi - lo;
  const s = l > 0.5 ? d / (2 - hi - lo) : d / (hi + lo);
  const h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

/** A colour (0xRRGGBB) from hue (0-1), saturation and lightness. */
function fromHsl(h: number, s: number, l: number): number {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v = u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
    return Math.round(v * 255);
  };
  return (ch(h + 1 / 3) << 16) | (ch(h) << 8) | ch(h - 1 / 3);
}

/** A colour (0xRRGGBB) by its light alone, which stone takes before its dungeon's tint is laid on. */
function grey(rgb: number): number {
  const l = Math.round(((rgb >> 16) & 0xff) * 0.3 + ((rgb >> 8) & 0xff) * 0.59 + (rgb & 0xff) * 0.11);
  return (l << 16) | (l << 8) | l;
}

/** Grey stone under a dungeon's own light (0xRRGGBB both): the colour's light, in the tint's hue. */
export function tinted(rgb: number, tint: number): number {
  const l = grey(rgb) & 0xff;
  const of = (shift: number): number => Math.round((l * ((tint >> shift) & 0xff)) / 255);
  return (of(16) << 16) | (of(8) << 8) | of(0);
}

/** The extra colours by their colour number's high bits (0 is none: the EGA's own). */
export const EXTRA_RGB = [0, 0xb8a0ff, 0x60a0ff, 0xc8a8ff, 0xff6ad5];
