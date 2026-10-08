/**
 * music.ts
 *
 * Which music plays where: the Ultima V Upgrade's rules (The Exodus
 * Project, 2001), read from its MIDI driver (upgrade/MID.DRV) and the
 * hooks it patched into the game's overlays. The DOS game of 1988 had no
 * music; the Upgrade gave it the Apple II and Commodore 128 versions'
 * songs, placed as those versions play them.
 *
 * The driver keeps sixteen tunes, numbered here from 1 in its order.
 * While the game waits for a command it asks the driver for the map's
 * tune (MID.DRV 016d); set pieces (the title, character creation, a
 * shrine, holing up, the ending) play their own tune and stop that until
 * they are done (MID.DRV 0299, 0293).
 */

import type { Occasion } from '../audio/soundtracks.ts';
import { nightOf } from './chromeTone.ts';
import { Game } from './game.ts';

/** The Upgrade's tunes, in MID.DRV's order (from 1; 0 is silence). */
export const Tune = {
  None: 0,
  Theme: 1,
  Britannia: 2,
  Hornpipe: 3,
  Engagement: 4,
  Stones: 5,
  Greyson: 6,
  Fanfare: 7,
  Monarch: 8,
  Tarantella: 9,
  Halls: 10,
  WorldsBelow: 11,
  Blackthorn: 12,
  LadyNan: 13,
  Reunion: 14,
  RuleBritannia: 15,
  Amiga: 16,
} as const;

/** Each tune's file (MID.DRV 0040), Tune.Theme first. */
export const TUNE_FILES = [
  'U5THEME.XMI',
  'BRITLAND.XMI',
  'HORNPIPE.XMI',
  'ENGGMNT.XMI',
  'STONES.XMI',
  'GREYSON.XMI',
  'FANFARE.XMI',
  'MONARCH.XMI',
  'TRNTLLA.XMI',
  'HALLS.XMI',
  'WRLDBLW.XMI',
  'BLCKTHRN.XMI',
  'LADYNAN.XMI',
  'REUNION.XMI',
  'RULEBRIT.XMI',
  'AMIGA.XMI',
];

/**
 * The tunes heard once - the character's making, the reunion with Lord British, the proclamation of victory - played
 * through and played again after a rest, as a player may stay on their screens; every other is heard over and over.
 */
export const HEARD_ONCE = ['AMIGA.XMI', 'REUNION.XMI', 'RULEBRIT.XMI'];

/** MID.DRV 016d: the tune for where the party is. */
export function mapTune(g: Game): number {
  const s = g.s;
  const id = s.mapId;
  if (id === 0xff) return s.battleWon !== 0 ? Tune.Theme : Tune.Engagement;
  // A frigate, furled or not; a skiff is on the land's tune.
  if ((s.partyTile & 0xf8) === 0x20) return Tune.Hornpipe;
  if (id === 0) return s.level !== 0 ? Tune.WorldsBelow : Tune.Britannia;
  if (id <= 8) return Tune.Tarantella; // the eight towns
  if (id <= 0xc) return Tune.LadyNan; // the lighthouses
  if (id <= 0x10) return Tune.Greyson; // the huts
  if (id === 0x11) return Tune.Monarch; // Lord British's castle
  if (id === 0x12) return Tune.Blackthorn;
  if (id <= 0x18) return Tune.Greyson; // the villages
  if (id <= 0x1d) return Tune.LadyNan; // the keeps
  if (id <= 0x20) return Tune.Fanfare; // the Lycaeum, Empath Abbey, Serpent's Hold
  if (id <= 0x28) return Tune.Halls; // the dungeons
  return Tune.None;
}

/**
 * The occasion the map's tune `tune` is asked for on (audio/soundtracks.ts): Britannia's by night - from the dusk's
 * middle to the dawn's, as the game's own light has it (chromeTone.ts) - and none else.
 */
export function mapOccasion(g: Game, tune: number): Occasion | undefined {
  if (tune !== Tune.Britannia) return undefined;
  return nightOf(g.s.hour, g.s.minute, g.data.twilight()) >= 0.5 ? 'night' : undefined;
}

/** MID.DRV 00: the map's tune, unless a set piece has the music. */
export function musicForMap(g: Game): void {
  if (!g.musicFollowsMap) return;
  const tune = mapTune(g);
  g.sound.music(tune, mapOccasion(g, tune));
}

/** A set piece's tune (or Tune.None for silence), on `occasion` where it has one; the map's waits until followMap. */
export function playTune(g: Game, tune: number, occasion?: Occasion): void {
  g.musicFollowsMap = false;
  g.sound.music(tune, occasion);
}

/** MID.DRV 0f: the music follows the map again, from the next wait for a command (the set piece's tune plays until then). */
export function followMap(g: Game): void {
  g.musicFollowsMap = true;
}

/**
 * MID.DRV 06: the introduction's tune, asked for at the wait before page
 * `page` is shown (the page before it still on the screen), so a tune to
 * each of its three parts.
 */
export function introTune(page: number): number {
  return page <= 7 ? Tune.Stones : page <= 0xe ? Tune.Halls : Tune.Greyson;
}

/** MID.DRV 18: the closing pages' tune, asked for as introTune is. */
export function closingTune(page: number): number {
  return page <= 3 ? Tune.Stones : Tune.LadyNan;
}
