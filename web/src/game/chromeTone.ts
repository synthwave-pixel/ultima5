/**
 * chromeTone.ts
 *
 * The Standard look's frame takes the colour of where the party is (the port's): copper in a towne, castle or keep -
 * safe - and purple in a towne a Shadowlord is in; blue out in Britannia and at sea, a little darker through the
 * night; a soft gold at a shrine and at the Codex; grey in the dungeons, darker on each level down, darkest in the
 * Underworld. A fight or a camp takes the colour of where it is. Each a tone of the copper (framebuffer.ts
 * chromeTone): its hue changed, or its colour taken away, its light and shade as the copper has them - the greys and
 * the blue as light to the eye as the copper, not as light by the numbers.
 */

import type { ChromeTone } from '../ui/framebuffer.ts';
import type { Game } from './game.ts';

/** A towne a Shadowlord is in. */
const SHADOWLORD: ChromeTone = { hue: 285, sat: 1, value: 1.05 };
/** Out in Britannia by day: the copper's blue. */
const OVERWORLD: ChromeTone = { hue: 215, sat: 1, value: 1.1 };
/** How much darker the blue is at the darkest of the night. */
const NIGHT = 0.25;
/** A shrine, the Codex: a soft gold. */
const SHRINE: ChromeTone = { hue: 42, sat: 0.8, value: 1.12 };
/** The dungeons' grey on their first level and their eighth, and the Underworld's. */
const DUNGEON_TOP = 0.62;
const DUNGEON_FOOT = 0.46;
const UNDERWORLD: ChromeTone = { sat: 0, value: 0.42 };

/** What a scene set apart from the map says it is (Game.chromePlace): a shrine's, or copper's (death, the ending). */
export type ChromePlace = 'shrine' | 'copper';

/** The light by day (time.ts), and in the dark of night. */
const DAYLIGHT = 0x32;
const NIGHTLIGHT = 2;

/**
 * How dark the night is at `hour`:`minute`, 0 to 1, as the game's own light has it (time.ts): the full dark till 5,
 * the dawn's light by 6 and the day's till 19, the dusk's dark by 20 - its twilight the game's own steps
 * (`twilight`, ten minutes each, the dusk the dawn backwards), drawn smoothly between them so the frame is hardly seen
 * to change; a night slept through in camp changes it at once.
 */
export function nightOf(hour: number, minute: number, twilight: ArrayLike<number>): number {
  const m = hour * 60 + minute;
  // Minutes into the dawn: the dusk's last minutes are the dawn's first (time.ts reads the steps backwards then).
  const into = m >= 5 * 60 && m < 6 * 60 ? m - 5 * 60 : m >= 19 * 60 && m < 20 * 60 ? 20 * 60 - m : null;
  if (into === null) return m >= 6 * 60 && m < 19 * 60 ? 0 : 1;
  const step = Math.min(Math.floor(into / 10), twilight.length - 1);
  const next = step + 1 < twilight.length ? twilight[step + 1] : DAYLIGHT;
  const light = twilight[step] + ((next - twilight[step]) * (into - step * 10)) / 10;
  return (DAYLIGHT - light) / (DAYLIGHT - NIGHTLIGHT);
}

/** The frame's tone where the party is now; null for the copper as it is. */
export function chromeTone(g: Game): ChromeTone | null {
  const s = g.s;
  let map = s.mapId;
  if (map > 0x7f) {
    // A scene apart from the map says what it is; a fight or a camp is where it was fought or made.
    if (g.chromePlace) return g.chromePlace === 'shrine' ? SHRINE : null;
    map = s.savedMapId;
  }
  if (map === 0) {
    if (s.level >= 0x80) return UNDERWORLD;
    // Quantised, so the frame is coloured afresh a few dozen times through a dusk, not at every minute.
    const dark = Math.round(nightOf(s.hour, s.minute, g.data.twilight()) * 32) / 32;
    return { ...OVERWORLD, value: OVERWORLD.value * (1 - NIGHT * dark) };
  }
  if (map <= 0x20) return map <= 8 && s.shadowlords.slice(0, 3).includes(map) ? SHADOWLORD : null;
  if (map <= 0x28) {
    const level = Math.max(0, Math.min(7, s.level));
    return { sat: 0, value: DUNGEON_TOP + ((DUNGEON_FOOT - DUNGEON_TOP) * level) / 7 };
  }
  return null;
}
