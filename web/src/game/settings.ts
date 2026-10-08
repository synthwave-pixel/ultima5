/**
 * settings.ts
 *
 * The player's settings, kept by the browser apart from the saved game:
 * each character's own (characters.ts), so that people sharing a machine
 * each play as they like; with no character, the machine's.
 */

import { SOUNDTRACKS, type Soundtrack } from '../audio/soundtracks.ts';
import { charKey, chosenCharacter } from './characters.ts';

export interface Options {
  /** The party fights its own battles until a key is pressed. */
  autoCombat: boolean;
  /** Dark bands over the picture, as a CRT showed it. */
  /** Scanlines in the Modern look; the PC (1988) look keeps its own (pcScanlines). */
  scanlines: boolean;
  /** Scanlines in the PC (1988) look: on until turned off, as an old monitor showed it. */
  pcScanlines: boolean;
  /** Sound effects: the Standard chip voices or the Original PC speaker (their level is effectsLevel). */
  soundSet: SoundSet;
  /** The look: Modern ('standard', the port's screen) or PC (1988) ('original', the EGA game's screen and tiles). */
  tileSet: TileSet;
  /** The Modern look's tiles (Tiles): Modern PC, Apple ][ or PC EGA. */
  tiles: Tiles;
  /** The PC (1988) look's tiles (Tiles, under that look): PC EGA or Apple ][. */
  pcTiles: PcTiles;
  /** Modern PC's people and creatures drawn with a fine black line round them, to be seen on busy ground. */
  outlines: boolean;
  /** Which soundtrack of the Upgrade's songs plays: Classical (the default), Electronic, Remastered or Original. */
  musicVoice: MusicVoice;
  /** The music's level, 0 (Off) to 10 (100%), in tens of percent. */
  musicLevel: number;
  /** The sound effects' level, 0 (Off) to 10 (100%), in tens of percent. */
  effectsLevel: number;
  /** The map over the dungeon view: none, a corner of it, or the whole view. */
  /** The EGA look's map over the dungeon's first-person view: in its corner, over all of it, or none. */
  dungeonMap: DungeonMap;
  /**
   * The Standard look's dungeon (the Map command switches it): the first-person view with the map round the party
   * small beside it, or the whole level's map in the view's place and the first-person view small beside it.
   */
  dungeonView: DungeonView;
  /** The game's rules: Story, Modern or Classic (Rules). */
  rules: Rules;
  /**
   * Auto aim, in a fight: X, and walking into a foe, strike without the crosshair - each weapon at the foe walked into,
   * else the nearest it reaches; and after a blow aimed by hand, the hands after it strike the same foe while it stands
   * in their reach. Off, every blow is aimed by hand (walking into a foe, the crosshair starts on it).
   */
  autoAim: boolean;
  /** What the keyboard is: the original's letter commands, or a controller in disguise. */
  input: InputMode;
  /** The Pause menu opened at the command prompt when the window loses focus or the page is hidden (the port's). */
  autoPause: boolean;
  /**
   * The Standard look's party panel: a member's state (P, S, D, C) as its letter on the frame beside them, as well as
   * in their name's colour. Off, the colour alone. The EGA look shows the letter in the line, as 1988 did, either way.
   */
  statusLetters: boolean;
}

/**
 * Letters (named Classic in Settings): every command is a letter, as in 1988. Controller: the
 * keyboard stands in for a pad - WASD or the arrows to walk, Z or Enter
 * for A, X or B for B, C for X, V or Y for Y - and the letters are not
 * commands, since everything is reached through the menus.
 */
export type InputMode = 'letters' | 'controller';

/**
 * The game's rules, one setting (Gameplay, and Thine Adventure's question at a character's making):
 *
 * - Classic: 1988's game as the Apple II has it. Poison and hunger kill; a kill's experience is all its striker's;
 *   the last dagger or spear may be thrown away; armour alone soaks a blow; a sleeper wakes as in 1988 and a charm
 *   holds the fight through; dividing and gating in are unbounded, a summoner gating in 1 turn in 32 (the DOS game's
 *   1 in 8); a pass-out frees every possessed member; the mimic's armour 8 (the DOS game's 3).
 * - Modern: eased. Poison stops at 1 hit point and hunger at half the party's; experience shared; the last dagger or
 *   spear kept back; 3 added to armour; sleepers wake readily and charms are thrown off - a daemon cast out of the
 *   one it possessed; what a fight breeds bounded; the heavy hitters' blows half their attack to all of it.
 * - Story: as Modern, and more so - hunger never hurts, and 10 added to armour while the party has food (3, as Modern,
 *   once it has none); a fight allowed less breeding.
 */
export type Rules = 'story' | 'modern' | 'classic';
export const RULES: readonly Rules[] = ['story', 'modern', 'classic'];

/** The eased rules (Story and Modern): sleep, charm, breeding and the rest, as the port has them (combat.ts). */
export const eased = (o: Pick<Options, 'rules'>): boolean => o.rules !== 'classic';

/**
 * What each adds to a member's armour before a blow's roll (combat.ts memberDefence): Classic none, the Apple II's
 * design (armour alone); Modern 3, near what the 1988 DOS game gave everyone whatever they wore, early on; Story 10,
 * while the party is well fed - with no food left, Modern's 3 (armourBonus).
 */
export const ARMOUR_BONUS: Record<Rules, number> = { story: 10, modern: 3, classic: 0 };

/** The rules' armour bonus for a party with `food` rations: Story's falls to Modern's when there are none. */
export const armourBonus = (o: Pick<Options, 'rules'>, food: number): number =>
  o.rules === 'story' && food === 0 ? ARMOUR_BONUS.modern : ARMOUR_BONUS[o.rules];

/**
 * With the eased rules, how many creatures a fight can breed - copies split off, daemons gated in, creatures the
 * party summons, both sides' together; when they are spent nothing more divides or gates in (combat.ts mayBreed).
 * Classic sets no bound.
 */
export const SPAWN_ALLOWANCE: Record<Exclude<Rules, 'classic'>, number> = { story: 6, modern: 12 };

/**
 * With the eased rules, how often each creature a fight begins with may divide; a copy may divide one time fewer
 * than what it split from may (combat.ts mayBreed). Classic sets no bound.
 */
export const ORIGINAL_SPLITS: Record<Exclude<Rules, 'classic'>, number> = { story: 2, modern: 3 };

/**
 * How often, in 256, a summoner gates in a daemon on its turn (combat.ts monsterMagic): Story and Modern 32, 1 in 8,
 * as the DOS game has it - their summoners kept busy, what they breed bounded by the fight's allowance instead
 * (SPAWN_ALLOWANCE); Classic 8, 1 in 32, as the Apple II's MAIN.COMBAT has it ($A1E2: a random byte AND $1F).
 */
export const SUMMON_CHANCE: Record<Rules, number> = { story: 32, modern: 32, classic: 8 };

/** Poison kills (Classic, as in 1988), or takes a member to a single hit point and no further. */
export const poisonKills = (o: Pick<Options, 'rules'>): boolean => o.rules === 'classic';

/**
 * Hunger kills (Classic, as in 1988), or takes each member down to half their hit points and no further (Modern), or
 * never hurts at all (Story) - the food eaten all the same, and a party with none fighting less well fed
 * (armourBonus).
 */
export const starvation = (o: Pick<Options, 'rules'>): 'deadly' | 'damage' | 'harmless' =>
  o.rules === 'classic' ? 'deadly' : o.rules === 'modern' ? 'damage' : 'harmless';

/** A kill's experience shared among the living (the eased rules), rather than all to whoever struck the blow. */
export const balancedXp = (o: Pick<Options, 'rules'>): boolean => o.rules !== 'classic';

/**
 * The last dagger or spear in the party's hands kept back, though it still strikes at arm's length (the eased rules);
 * with the Classic, thrown away as the original has it.
 */
export const keepsLastThrow = (o: Pick<Options, 'rules'>): boolean => o.rules !== 'classic';

/** How the dungeon's map shows over the first-person view. */
export type DungeonMap = 'off' | 'small' | 'full';

/** The Standard look's dungeon: the first-person view, or the whole level's map (dungeonMap.ts). */
export type DungeonView = 'mini' | 'full';

export type SoundSet = 'standard' | 'original';
const SOUND_SETS: readonly SoundSet[] = ['standard', 'original'];
/** The music's soundtracks (audio/soundtracks.ts): Classical, Electronic, Remastered, Original. */
export type MusicVoice = Soundtrack;
export const MUSIC_VOICES: readonly MusicVoice[] = SOUNDTRACKS;
/** The mixer's steps: a level is 0 to LEVELS, each a tenth. */
export const LEVELS = 10;

/** A level's gain: on a curve (the square), so that each step sounds like a step. */
export function levelGain(level: number): number {
  return (level / LEVELS) ** 2;
}
export type TileSet = 'standard' | 'original';

/**
 * The Standard look's tiles, as the ultima3 port offers its sets. Modern PC: the original land out in the world, its
 * shores and edges still drawn from the map, and the original actors and furniture lifted onto it (originals.ts); the
 * towns' floors and walls and the buildings the Standard look's. Apple ][: the Apple II's six colours, tile by tile on black - the ultima3 port's Apple II tiles
 * where Ultima III had the same thing, made from them where it had not (the forest, the scrub, the hills, the deep and
 * the shallows), the rest the player's own tiles in those colours (appleArt.ts). PC EGA: the player's own tiles as the
 * 1988 PC game drew them, each whole on black, in the Modern look's screen (egaTiles.ts). The PC (1988) look (tileSet
 * 'original') has a choice of its own (PcTiles).
 */
export type Tiles = 'modern-pc' | 'apple2' | 'pc-ega';
export const TILES: readonly Tiles[] = ['modern-pc', 'apple2', 'pc-ega'];
/** The PC (1988) look's tiles: the EGA tiles as the game drew them, or the Apple ][ set's in their place. */
export type PcTiles = Extract<Tiles, 'pc-ega' | 'apple2'>;
export const PC_TILES: readonly PcTiles[] = ['pc-ega', 'apple2'];

export const TILES_NAMES: Record<Tiles, string> = {
  'modern-pc': 'Modern PC',
  apple2: 'Apple ][',
  'pc-ega': 'PC EGA',
};

/** The settings in use with no character: a fresh machine's, or the last character's once they are deleted. */
export const SETTINGS_KEY = 'ultima5.settings';

/** Where the settings in use are kept: the chosen character's, or the machine's with none chosen. */
function settingsKey(): string {
  const id = chosenCharacter();
  return id === null ? SETTINGS_KEY : charKey(id, 'settings');
}

export const DEFAULTS: Options = {
  autoCombat: false,
  scanlines: false,
  pcScanlines: true,
  soundSet: 'standard',
  tileSet: 'standard',
  tiles: 'modern-pc',
  pcTiles: 'pc-ega',
  outlines: true,
  musicVoice: 'classical',
  musicLevel: 6,
  effectsLevel: 8,
  dungeonMap: 'small',
  dungeonView: 'mini',
  rules: 'modern',
  autoAim: true,
  input: 'controller',
  autoPause: false,
  statusLetters: false,
};

/** What settings kept by an earlier build may carry besides the Options they became. */
type Saved = Partial<Options> & { sound?: boolean; music?: boolean; autoAimY?: boolean; notes?: boolean };

/**
 * Settings as kept by this or an earlier build - the browser's, or a game's exported file - made what Options are
 * now: old names carried over, a value this build has not dropped (to be the default's). What is not there stays not
 * there, so a file's settings laid over a character's change only what they say.
 */
export function normaliseOptions(from: Saved): Partial<Options> {
  const saved = { ...from };
  // Clues are always noted now: the setting that could stop it is gone.
  delete saved.notes;
  // Settings from when it was Y's alone.
  if (saved.autoAimY !== undefined && saved.autoAim === undefined) saved.autoAim = saved.autoAimY;
  delete saved.autoAimY;
  // Settings from before the sound sets: effects off stays off.
  if (saved.sound === false && !saved.soundSet) saved.effectsLevel = 0;
  delete saved.sound;
  // Settings from before the mixer: Music Off is a level of 0; Sound FX Off is a level of 0, the set Standard.
  const was = saved as { music?: boolean; musicLevel?: number; soundSet?: string };
  if (was.music === false && was.musicLevel === undefined) saved.musicLevel = 0;
  delete was.music;
  if (was.soundSet === 'off') {
    saved.soundSet = 'standard';
    if (saved.effectsLevel === undefined) saved.effectsLevel = 0;
  }
  // A level whole and within the steps; one that is no number is the default's.
  for (const key of ['musicLevel', 'effectsLevel'] as const) {
    const n: unknown = saved[key];
    if (n === undefined) continue;
    if (typeof n === 'number' && Number.isFinite(n)) saved[key] = Math.max(0, Math.min(LEVELS, Math.round(n)));
    else delete saved[key];
  }
  // A set this build does not have would give the sound a gain of NaN.
  if (saved.soundSet !== undefined && !SOUND_SETS.includes(saved.soundSet)) delete saved.soundSet;
  if (saved.musicVoice !== undefined && !MUSIC_VOICES.includes(saved.musicVoice)) delete saved.musicVoice;
  // The rules one setting now (Rules): what the six it replaced said is dropped, and the default's taken. A value this
  // build does not have would give a member's defence no bonus at all, as NaN.
  const old = saved as Record<string, unknown>;
  for (const key of ['poison', 'effects', 'starvation', 'balancedXp', 'throwing', 'combat']) delete old[key];
  if (saved.rules !== undefined && !RULES.includes(saved.rules)) delete saved.rules;
  // A set this build does not have (Modern U3, gone 2026-09-30): the default.
  if (saved.tiles !== undefined && !TILES.includes(saved.tiles)) delete saved.tiles;
  if (saved.pcTiles !== undefined && !PC_TILES.includes(saved.pcTiles)) delete saved.pcTiles;
  // Settings from when one Scanlines served both looks: a player already in the PC (1988) look keeps what they
  // see; the rest find them on there the first time they switch.
  if (saved.pcScanlines === undefined && saved.tileSet === 'original') saved.pcScanlines = saved.scanlines ?? DEFAULTS.scanlines;
  return saved;
}

/**
 * The saved settings over the defaults (storage may be missing or refuse): the chosen character's - or, where they
 * have none kept yet, the machine's.
 */
export function loadOptions(): Options {
  try {
    const raw = globalThis.localStorage?.getItem(settingsKey()) ?? globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...normaliseOptions(JSON.parse(raw) as Saved) };
  } catch {
    // Private windows and blocked storage: the defaults will do.
  }
  return { ...DEFAULTS };
}

export function saveOptions(o: Options): void {
  try {
    globalThis.localStorage?.setItem(settingsKey(), JSON.stringify(o));
  } catch {
    // Nowhere to keep them; they last the session.
  }
}
