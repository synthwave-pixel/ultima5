/**
 * ultima5Saves.ts
 *
 * Ultima V's own saves (the machinery that keeps them is storage.ts's): what a save holds - SAVED.GAM, the two
 * worlds' creatures (BRIT.OOL, UNDER.OOL) and the port's own beside them - how one is checked and taken up again, who
 * and where it says, the title's view of the saved Avatar and companions, going back to a save, the Save command, and
 * when the game may save itself. Moved from storage.ts unchanged; ultima5Saves is its SaveCodec.
 */

import { GAME_ID } from '../brand.ts';
import { drawFrame, gameWindows } from './playScreen.ts';
import { Relocate } from './relocate.ts';
import { type PathData, PathState } from './modernKarma.ts';
import { Fog, type FogData } from './fog.ts';
import { Vocabulary, type WordData } from './words.ts';
import { Game, type Note } from './game.ts';
import { Save, SAVE_SIZE } from './save.ts';
import { preset } from './companions.ts';
import type { Dressing } from './io.ts';
import { addressedAsLady, type Appearance, LADY, validAppearance } from './appearance.ts';
import { placeTitle } from './journal.ts';
import { fromBase64, toBase64, type SaveCodec, type StoredSave } from './saveCodec.ts';
import { localSave } from './storage.ts';
import { decodeObjects, encodeObjects, type ObjectsData } from './objectStores.ts';
import { freshObjects } from './objectMigration.ts';
export const SAVE_VERSION = 1;
export interface SaveData {
  game: typeof GAME_ID;
  version: number;
  /** SAVED.GAM, base64. */
  save: string;
  /** BRIT.OOL and UNDER.OOL, base64. */
  brit: string;
  under: string;
  /** When it was written (ms since 1970). */
  written: number;
  /** The journal's clues (the modern engine's; older saves have none). */
  notes?: Note[];
  /** The regalia worn, in their own slot (Game.regalia; older saves kept them in the lasting spell's). */
  regalia?: number;
  /** What has been seen of the worlds, the towns and the dungeons, run-length encoded (older saves have none). */
  fog?: FogData;
  /** The words the player has heard said, and whose answers they have had (older saves have none). */
  words?: WordData;
  /** False for a game not yet begun, whose first turn points to the Tips (saves before tipsShown; none: begun). */
  tipsNudged?: boolean;
  /** The tips given in the log, by name (Game.tipsShown; older saves have none, but their tipsNudged). */
  tipsShown?: string[];
  /** The Avatar's appearance (appearance.ts; older saves have none: the default). */
  appearance?: Appearance;
  /** The companions' looks made at a mirror, by name (companions.ts; older saves have none: each as they begin). */
  companions?: Record<string, Appearance>;
  /** The day the old man last came to camp (Game.oldManDay; older saves have none: not yet). */
  oldManDay?: number;
  /** The arrows and quarrels above the save's 99, by item (Game.ammoExtra; older saves have none: none). */
  ammo?: Record<string, number>;
  /** The Modern karma's pools and what they have counted (modernKarma.ts; older saves have none: begun afresh). */
  path?: PathData;
  /** The vehicles and things left in each place (objectStores.ts; older saves kept them in the actor tables). */
  objects?: ObjectsData;
}

export function serialize(g: Game): SaveData {
  return {
    game: GAME_ID,
    version: SAVE_VERSION,
    save: toBase64(g.s.b),
    brit: toBase64(g.ool.brit),
    under: toBase64(g.ool.under),
    written: Date.now(),
    notes: g.notes,
    regalia: g.regalia,
    fog: g.fog.encode(),
    words: g.words.encode(),
    tipsShown: [...g.tipsShown],
    appearance: g.appearance,
    companions: Object.fromEntries(g.companionLooks),
    oldManDay: g.oldManDay,
    ammo: g.ammoExtra,
    path: g.path.encode(),
    objects: encodeObjects(g),
  };
}

/** Parse and check a save; throws with the reason when it will not do. */
export function parseSave(text: string): SaveData {
  const d = JSON.parse(text) as Partial<SaveData>;
  if (d.game !== GAME_ID) throw new Error('not an Ultima V save');
  if (typeof d.version !== 'number' || d.version > SAVE_VERSION) throw new Error('a save from a newer version');
  if (typeof d.save !== 'string' || typeof d.brit !== 'string' || typeof d.under !== 'string') throw new Error('the save is incomplete');
  if (fromBase64(d.save).length !== SAVE_SIZE || fromBase64(d.brit).length !== 256 || fromBase64(d.under).length !== 256)
    throw new Error('the save is damaged');
  return d as SaveData;
}

/**
 * A saved game taken up again. What the player has mapped is theirs, not
 * the Avatar's, so the save's record is added to what is already known
 * rather than put in its place: going back to a save after a party wipe
 * does not unlearn the country walked since it was written. `fresh`: a
 * character taken up from the title, from nothing of anyone else's - the
 * maps and the words known begun anew before the save's are added.
 */
export function restore(g: Game, stored: SaveData | StoredSave, fresh = false): void {
  const d = stored as SaveData;
  if (fresh) {
    g.fog = new Fog();
    g.words = new Vocabulary();
  }
  g.s.b.set(fromBase64(d.save));
  g.ool.brit.set(fromBase64(d.brit));
  g.ool.under.set(fromBase64(d.under));
  g.notes = Array.isArray(d.notes) ? d.notes : [];
  // The regalia worn: their own slot, or - a save from before it - the spell's slot they shared, moved out of it.
  const s = g.s;
  if (typeof d.regalia === 'number') g.regalia = d.regalia;
  else if (s.icon === 0x0e || s.icon === 0x1c || s.icon === 0x1d) {
    g.regalia = s.icon;
    s.icon = s.protection = 0;
  } else g.regalia = 0;
  g.fog.merge(Fog.decode(d.fog));
  g.words.merge(Vocabulary.decode(d.words));
  // The tips given; a save from before the list, its pointer to the Tips alone - given, unless the game was not begun.
  g.tipsShown = new Set(
    Array.isArray(d.tipsShown) ? d.tipsShown.filter((t): t is string => typeof t === 'string') : d.tipsNudged === false ? [] : ['nudge'],
  );
  g.oldManDay = typeof d.oldManDay === 'number' && Number.isFinite(d.oldManDay) ? d.oldManDay : -1;
  // The ammunition above the byte's 99 (ammo.ts), each a whole number up to 900; anything else, none.
  g.ammoExtra = {};
  for (const [k, n] of Object.entries(typeof d.ammo === 'object' && d.ammo !== null ? d.ammo : {}))
    if (Number.isInteger(n) && n > 0 && n <= 900) g.ammoExtra[Number(k)] = n;
  // The Modern karma, as saved; a save from before it begins it afresh, at a new game's (not from 1988's karma).
  g.path = PathState.decode(d.path);
  if (typeof d.objects === 'object' && d.objects !== null) decodeObjects(g, d.objects);
  else freshObjects(g); // a save from before the stores: its tables' vehicles and things moved in (objectMigration.ts)
  g.appearance = validAppearance(d.appearance);
  const made = typeof d.companions === 'object' && d.companions !== null ? Object.entries(d.companions) : [];
  g.companionLooks = new Map(made.map(([name, look]) => [name, validAppearance(look)]));
  g.draw.avatar?.(g.appearance, addressedAsLady(g));
}

/** The saved game's Avatar as the player made it, and whether addressed as Lady; null with no game saved. */
export function savedAvatar(): { look: Appearance; lady: boolean } | null {
  const saved = localSave.read<SaveData>();
  if (!saved) return null;
  return { look: validAppearance(saved.appearance), lady: new Save(fromBase64(saved.save)).members[0].gender === LADY };
}

/**
 * How companion `name` looks in the title's scenes, where no game is loaded: as the saved game has them, a mirror's
 * colours kept; with no save, or none of that name in it, as they begin, of the roster's trade if it knows them.
 */
export function savedDressing(g: Game, name: string): Dressing {
  const saved = localSave.read<SaveData>();
  const members = saved ? new Save(fromBase64(saved.save)).members : g.s.members;
  const member = members.find((m) => m.name === name);
  const made = saved && typeof saved.companions === 'object' && saved.companions !== null ? saved.companions[name] : undefined;
  return {
    look: made ? validAppearance(made) : preset(name, member?.cls ?? 0),
    lady: member?.gender === LADY,
  };
}

/** The same game: a save written again with nothing played since (the party taken back to it, and saved at once). */
const sameGame = (a: SaveData, b: SaveData): boolean => a.save === b.save && a.brit === b.brit && a.under === b.under;

/** The Avatar's name in a save. */
export const avatarName = (d: StoredSave): string => new Save(fromBase64(d.save)).members[0].name.trim();

/**
 * Where a save was made, by the game's own names: the towne, castle, keep or hut ("Yew", "Lord British's Castle"),
 * the dungeon and its level ("Wrong, level 3"), or out in the open "Britannia" or "the Underworld" - a place's name
 * there where the party stands on its square, as the game saves itself at a door ("Minoc"; "Deceit, Underworld" at
 * a dungeon's way up), a shrine's on its own ("Shrine of Honesty").
 */
export function savedWhere(g: Game, d: StoredSave): string {
  const s = new Save(fromBase64(d.save));
  const id = s.mapId > 0x7f ? s.savedMapId : s.mapId;
  if (id > 0x20 && id <= 0x28) return `${placeTitle(g, id)}, level ${s.level + 1}`;
  if (id !== 0) return placeTitle(g, id) || 'Britannia';
  const under = s.level === 0xff;
  const locs = g.data.locations;
  for (let i = under ? 0x20 : 0; i < 0x28; i++) {
    if (locs[i]?.x !== s.x || locs[i]?.y !== s.y) continue;
    return under ? `${placeTitle(g, i + 1)}, Underworld` : placeTitle(g, i + 1);
  }
  if (!under) {
    const xs = g.data.bytes(0x1f6e, 8);
    const ys = g.data.bytes(0x1f76, 8);
    const virtues = g.data.table(0x1f4e, 8);
    for (let i = 0; i < 8; i++) {
      if (xs[i] !== s.x || ys[i] !== s.y) continue;
      const virtue = virtues[i].charAt(0) + virtues[i].slice(1).toLowerCase();
      // (Spirituality's, at the menus' width, the other way about.)
      return virtue.length > 11 ? `${virtue} shrine` : `Shrine of ${virtue}`;
    }
  }
  return under ? 'the Underworld' : 'Britannia';
}

/**
 * The game taken back to a save, all played since undone (All is lost's choice, and the Pause menu's), and handed
 * to the main loop (run.ts) to go on from where it was saved.
 */
export async function takeUp(g: Game, d: StoredSave): Promise<never> {
  // Out of a fight (the Pause menu's, in one), what its own end puts right (combat.ts finishLoop): no key pressed in it
  // carried over, the lighthouse's beam and the fight's music stopped.
  if (g.s.mapId === 0xff) {
    g.p.flushKeys();
    g.lighthouse.step = 0xff;
    g.sound.music(0);
    g.autoShown = false;
  }
  restore(g, d);
  const { drawVitals } = await import('./frame.ts');
  // The screen drawn anew as Journey Onward draws it (run.ts journeyOnward): the menu's box taken away, the frame -
  // which blacks out everything, the party's panel too - and the panel again, as nothing else draws it till it changes.
  g.draw.chromeBox?.(null);
  gameWindows(g);
  drawFrame(g);
  drawVitals(g);
  g.viewDirty = 1;
  throw new Relocate();
}

/**
 * CAST2_10fe_SaveGame: "Save game?" - Q, which 1988 called Quit. `asked`: the Pause menu's Save game (the port's), the
 * player's choice already made there - no "Quit:", no question, just the saving.
 */
export async function saveCommand(g: Game, asked = false): Promise<number> {
  if (asked)
    g.print(g.t(0x966a).replace(/^Yes\n/, '')); // "Saving...\n"
  else {
    const { yesNo } = await import('./input.ts');
    g.say(0xa1ea); // "Quit:"
    g.say(0x9658); // "\nSave game? "
    if (!(await yesNo(g))) {
      g.say(0x9666); // "No\n"
      return 0;
    }
    g.say(0x966a); // "Yes\nSaving...\n"
  }
  // Said done only once it is read back whole: where it could not be kept, the player is told so, the saves before
  // it as they were.
  if (localSave.write(g))
    g.say(0x96ac); // "Done.\n"
  else g.print('Not saved!\n');
  return 0;
}

/** Whether the game may save itself now (storage.ts autosave): outdoors, and someone in the party alive. */
export function canAutosave(g: Game): boolean {
  if (g.s.mapId !== 0) return false;
  let alive = false;
  for (let i = 0; i < g.s.partySize; i++) if (g.s.members[i].status !== 0x44) alive = true; // 'D'
  return alive;
}

/** Ultima V's saves as the machinery reads them (saveCodec.ts), set by Game. */
export const ultima5Saves: SaveCodec = {
  serialize: (g) => serialize(g as Game),
  parse: (text) => parseSave(text),
  same: (a, b) => sameGame(a as SaveData, b as SaveData),
  avatarName: (d) => avatarName(d),
  level: (d) => new Save(fromBase64(d.save)).members[0].level,
  where: (g, d) => savedWhere(g as Game, d),
  canAutosave: (g) => canAutosave(g as Game),
  restore: (g, d, fresh) => restore(g as Game, d, fresh),
};
