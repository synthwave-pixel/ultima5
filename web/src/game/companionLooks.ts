/**
 * companionLooks.ts
 *
 * The companions' colours to begin with (companions.ts dresses them): each of the fourteen who may join the party in
 * colours of their own - the eight of Ultima IV in the colour of the virtue each stood for, the six since by where
 * they are found or who they are. Apart from companions.ts, which reads Ultima V's game, so that another game can
 * dress its own people in them (the Ultima IV port's party, a companion to each class).
 */

import { type Appearance, HAIR, type Hue, HUES, PEOPLE_SKIN } from './appearance.ts';

/** Clothes, trim and hair: the hues by name (appearanceMenu.ts), the hair by HAIR's. */
export type Preset = [Hue, Hue, string];
const H = (name: string): number =>
  ['red', 'orange', 'yellow', 'lime', 'green', 'jade', 'teal', 'azure', 'blue', 'violet', 'magenta', 'rose'].indexOf(name) * 30;

/**
 * Each companion's colours to begin with. Honesty blue, Compassion yellow, Valour red, Justice green, Sacrifice orange,
 * Honour purple, Spirituality white, Humility black, as Ultima IV's virtues were; the others by their places and ways.
 */
export const PRESETS: Readonly<Record<string, Preset>> = {
  Mariah: [H('blue'), 'white', 'black'], // Honesty; the Lycaeum
  Iolo: [H('yellow'), H('green'), 'white'], // Compassion; the old bard
  Geoffrey: [H('red'), H('yellow'), 'brown'], // Valour
  Jaana: [H('green'), H('orange'), 'auburn'], // Justice; the woods of Yew
  Julia: [H('orange'), H('red'), 'brunette'], // Sacrifice
  Dupre: [H('violet'), H('yellow'), 'blonde'], // Honour
  Shamino: ['white', H('green'), 'brown'], // Spirituality; the ranger
  Katrina: ['black', H('orange'), 'blonde'], // Humility; the shepherdess
  Gwenno: [H('rose'), H('yellow'), 'blonde'], // Britain; Iolo's wife
  Johne: ['grey', H('violet'), 'white'], // Ararat; the hermit gone strange
  Sentri: [H('teal'), 'white', 'black'], // Bordermarch
  Gorn: [H('orange'), H('red'), 'auburn'], // the barbarian in Blackthorn's cells
  Maxwell: [H('azure'), H('red'), 'brunette'], // Serpent's Hold
  Toshi: [H('blue'), H('yellow'), 'black'], // Empath Abbey
  Saduj: ['black', H('red'), 'black'], // Lord British's castle, Blackthorn's spy
};

/** The mages' figure (Ultima V's class letter): their hair shows whatever they wear; a fighter's helm or a bard's hat is kept as drawn. */
const MAGE = 'M'.charCodeAt(0);

/** The companion `name`'s look as they begin: their preset's colours (hair, if they walk as a `mage`), the people's skin. */
export function presetLook(name: string, mage: boolean): Appearance {
  const p = PRESETS[name];
  const hue = (h: Hue): number => Math.max(0, HUES.indexOf(h));
  if (!p) return { figure: 0, skin: PEOPLE_SKIN, hair: 0, main: 0, trim: 0 };
  const hair = mage
    ? Math.max(
        0,
        HAIR.findIndex((x) => x.name === p[2]),
      )
    : 0;
  return { figure: 0, skin: PEOPLE_SKIN, hair, main: hue(p[0]), trim: hue(p[1]) };
}

/** The companion's look as they begin, by their class's letter (Ultima V's: a mage 'M'). */
export function preset(name: string, cls: number): Appearance {
  return presetLook(name, cls === MAGE);
}
