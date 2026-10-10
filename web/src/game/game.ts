/**
 * game.ts
 *
 * The running game: the saved state (save.ts) and the working memory the
 * DOS game kept beside it, which rules modules read and write through a
 * `Game`. Names follow what the memory is for; the u5d address is on each
 * field.
 */

import type { UpdateHook } from '../ui/updates.ts';
import type { ChromePlace } from './chromeTone.ts';
import { TileCycles } from '../ui/animate.ts';
import type { Text } from '../ui/text.ts';
import { GameData } from './data.ts';
import { Fog } from './fog.ts';
import { Vocabulary } from './words.ts';
import type { Draw, Platform, Sound } from './io.ts';
import { type Random, TrueRandom } from './rng.ts';
import { Actor, Save } from './save.ts';
import { TalkState } from './talk.ts';
import { type Appearance, DEFAULT_APPEARANCE } from './appearance.ts';

/** Combat entity flags (u5d macros.h COMBAT_FLAGS_*). */
import { DEFAULTS, type Options } from './settings.ts';
import type { Transfer } from './transfer.ts';

export const CF = { Player: 0x80, Monster: 0x40, Dead: 0x20, Invisible: 0x10, Asleep: 0x08, F4: 0x04, F2: 0x02, Charmed: 0x01 } as const;

/** One combatant (CombatEntity, D_ba14, 8 bytes). */
export class Combatant {
  constructor(readonly b: Uint8Array) {}
  get hp(): number {
    return this.b[0];
  }
  set hp(v: number) {
    this.b[0] = v;
  }
  get dex(): number {
    return this.b[1];
  }
  set dex(v: number) {
    this.b[1] = v;
  }
  get flags(): number {
    return this.b[2];
  }
  set flags(v: number) {
    this.b[2] = v;
  }
  /** A party member's index, or a monster's kind. */
  get who(): number {
    return this.b[3];
  }
  set who(v: number) {
    this.b[3] = v;
  }
  get actor(): number {
    return this.b[4];
  }
  set actor(v: number) {
    this.b[4] = v;
  }
  get timer(): number {
    return this.b[5];
  }
  set timer(v: number) {
    this.b[5] = v;
  }
  get x(): number {
    return this.b[6];
  }
  set x(v: number) {
    this.b[6] = v;
  }
  get y(): number {
    return this.b[7];
  }
  set y(v: number) {
    this.b[7] = v;
  }
  clear(): void {
    this.b.fill(0);
  }
}

/** A clue heard in conversation: who said it, where, and the words. */
export interface Note {
  who: string;
  where: string;
  text: string;
  /** Game date, as the stats show it. */
  date: string;
}

/** What only the browser page can do for the game. */
export interface GameHooks {
  /** Apply settings the page owns (scanlines, sound). */
  applyOptions?: (o: Options) => void;
  /** The clipboard and files, for carrying a game between browsers, devices and the apps (transfer.ts). */
  transfer?: Transfer;
  /** Forget the installed game files and start the installer again. */
  uninstall?: () => Promise<void>;
  /** Show the map of Britannia (or the Underworld) over the game until dismissed. */
  showMap?: (underworld: boolean) => Promise<void>;
  /**
   * A line of text from the device's own keyboard (a phone's comes up on the screen), in a box high on the page
   * where that keyboard leaves it in sight; `value` to begin from, at most `max` letters. Null if it was put by.
   */
  askText?: ((title: string, value: string, max: number) => Promise<string | null>) | undefined;
  /**
   * A newer version (ui/updates.ts): what it is - one come down that a restart takes up, or a release whose page is
   * opened - taking it up, and the player told of it (its box at the title, once a version).
   */
  update?: UpdateHook;
  /** Leave the game, where it runs as an app that can (ui/platform.ts appQuit); a browser tab has none. */
  quit?: (() => void) | undefined;
}

/** What bump to act remembers of a thing (Game.bumped). */
export type Bumped = 'done' | 'searched' | 'trap' | 'clean' | 'disarmed';

/** A thing's place in Game.bumped: where it stands (the world's edge wrapped, as the actors' places are). */
export const thingKey = (g: Game, x: number, y: number): string => `${g.s.mapId}:${g.s.level}:${x & 0xff},${y & 0xff}`;

export class Game {
  s: Save;
  rng: Random = new TrueRandom();

  /** D_6608: the map in memory: four 16x16 chunks of the world, or a settlement level. */
  readonly map = new Uint8Array(1024);
  /** D_6708: a copy of the map. */
  readonly mapCopy = new Uint8Array(1024);
  /** D_ab02: the viewport's tiles, 11 rows of 32 (0: an actor is drawn here, 0xff: out of sight). */
  readonly view = new Uint8Array(0x160);
  /** What the party has seen of the two worlds (the port's own; the map shows it). */
  fog = new Fog();
  /** The words the player has heard said and may say back (the port's own; the talk menu offers them). */
  words = new Vocabulary();
  /** D_ac64: the actor tile drawn in each viewport cell, 11 rows of 16. */
  readonly actorMap = new Uint8Array(0xb0);
  /** The terrain under each actor in view, as the view held it before the actor took the square (for tile art that shows it). */
  readonly groundMap = new Uint8Array(0xb0);
  /** D_ad14: the combat map, or the light map (lit squares) outside combat. */
  readonly combatMap = new Uint8Array(0x400);
  /** D_a9fc: the actors put aside during combat or camping. */
  readonly savedActorBytes = new Uint8Array(256);
  readonly savedActors = Array.from({ length: 32 }, (_, i) => new Actor(this.savedActorBytes.subarray(i * 8, i * 8 + 8)));
  /** D_ba14: the combatants. */
  readonly combatBytes = new Uint8Array(256);
  readonly combat = Array.from({ length: 32 }, (_, i) => new Combatant(this.combatBytes.subarray(i * 8, i * 8 + 8)));
  /** D_b21e: the scratch buffer (NPC path search, and others). */
  readonly scratch = new Uint8Array(3000);
  /** BRIT.OOL and UNDER.OOL: each world's actors while the party is elsewhere. */
  readonly ool = { brit: new Uint8Array(256), under: new Uint8Array(256) };
  /** D_b11e: which tile each map tile is drawn as this tick. */
  readonly cycles = new TileCycles();

  /** D_24e6: the viewport needs rebuilding (1), or the map changed (bit 2). */
  viewDirty = 1;
  /** D_a9fa: the stats need redrawing. */
  vitalsDirty = 0;
  /** D_a9ce: sound effects off. */
  soundOff = false;
  /** D_538c: keys typed ahead are kept. */
  keyBuffer = true;
  /** D_a3e2: the map's name on the top border. */
  mapName = ' '.repeat(12);
  /** D_6a34: the ambient sound's eight-step beat. */
  ambientBeat = 0;
  /** D_6a08: the bard's banjo tune's note. */
  banjoNote = 0;
  /** D_217e..D_2186: up to two lighthouses in the map, and the beam's step. */
  lighthouse = { x1: -1, y1: -1, x2: -1, y2: -1, step: 0xff };
  /** D_a524: a sailing ship with plans moves every other turn. */
  shipHalf = 0;
  /** D_a526, D_a527. */
  a526 = 0;
  a527 = 0;
  /** D_545e. */
  d545e = 0;
  /** D_a9bc. */
  a9bc = 0;
  /** D_bb14..D_bb18: combat and misc bytes. */
  bb14 = 0;
  bb15 = 0;
  bb16 = 0;
  bb17 = 0;
  /** The conversation's state (talk.c's globals). */
  readonly talk = new TalkState();
  /** Combat draws its turn marker and crosshair over the map (set by the combat module). */
  drawCombatMarks: (() => void) | null = null;

  // --- The modern engine's additions --------------------------------------------------

  /** The player's settings (settings.ts). */
  options: Options = { ...DEFAULTS };
  /** Which command prompt is waiting, if any: controller buttons and the menus depend on it. */
  commandPrompt: '' | 'town' | 'outdoors' | 'dungeon' | 'combat' = '';
  /** The command prompt is waiting for its key this moment (no menu of its own up): where a lost focus opens the Pause menu. */
  awaitingCommand = false;
  /** The menu on screen, if one is (menu.ts choose): its title, its lines and where the bar is - for the tests, which play by it as a player does. */
  /**
   * What the title does while a question over it waits for a key (the flames flickering on, while the character is
   * made), or null; the key waits that the title's questions use call it (menu.ts menuKey, intro.ts askName).
   */
  titleIdle: (() => void) | null = null;
  menuShown: {
    title: string;
    labels: string[];
    enabled: boolean[];
    dim: boolean[];
    at: number;
    /** 2 for a list in two columns (menu.ts chooseTwoColumns), read across; else one. */
    columns?: number;
  } | null = null;
  /** The journal: clues heard, kept with the saved game. */
  notes: Note[] = [];
  /** Whether a game is in play, rather than the title up (run.ts journeyOnward): what Export takes (transfer.ts). */
  inPlay = false;
  /** Whether the new game's pointer to the Tips has been given (run.ts journeyOnward); a new character's is not. */
  tipsNudged = true;
  /** The day (time.ts gameDay) the old man last came to camp (combat.ts apparitionComes); -1, not yet. Saved. */
  oldManDay = -1;
  /** Bump to act's direction, taken by the command's direction prompt (0 for none; dropped when the command ends). */
  bumpDir = 0;
  /**
   * Bump to act's things whose first step is done, by where they stand (thingKey): the party's, whoever did it and
   * from whichever side (bumpAct.ts). A chest keeps what its search found - 'trap' or 'clean', 'searched' where no
   * reading was made - or 'disarmed', by An Sanct or a key; its badge shows it (world.ts drawReadings). Forgotten with the place (a new fight, level or map).
   */
  readonly bumped = new Map<string, Bumped>();
  /** The member a bumped command is done by, chosen for it (bumpAct.ts): -1 for whoever the command asks for. */
  bumpWho = -1;
  /** The member a spell falls on (onWho), for its pulse (castEffect); -1 for none, the whole view. */
  spellOn = -1;
  /**
   * The squares the party's leader came through in a settlement, the last first (the port's): the Standard look
   * draws the other members on them, in a line behind (world.ts drawView). Emptied on a new level or place.
   */
  trail: { x: number; y: number; z: number }[] = [];
  /** A prompt was backed out of (the port's: such a command spends no turn). */
  cancelled = false;
  /**
   * The worn regalia (the port's own slot): the Amulet (0x0e), the Crown (0x1c) or the Black Badge (0x1d), or 0. In
   * 1988 it shared the spell's slot (Save icon), so a lasting spell cast - or a night's rest - took its power away.
   */
  regalia = 0;
  /** The Avatar's appearance (appearance.ts; the port's own, saved with its save). */
  appearance: Appearance = { ...DEFAULT_APPEARANCE };
  /** The companions' looks as the player has made them at a mirror, by name (companions.ts; the rest as they begin). */
  companionLooks = new Map<string, Appearance>();
  /** The party panel at its full 1988 height, while a screen that needs all nine rows is up (layout.ts). */
  panelFull = 0;
  /** The member a choice of member rests on (input.ts selectMember), drawn as one bar in the Standard look; -1 none. */
  picked = -1;
  /** The party panel shows mana where hit points are (magicPanel.ts), while a spell is being chosen to cast or mix. */
  panelMana = false;
  /** The party panel shows experience toward the next level where hit points are (the Standard look), while the
   * command menu's bar is on Ztats. */
  panelXp = false;
  /** A name the party box's top border shows over all else (the Standard look): the member Ready is for. */
  panelTitle = '';
  /** The Standard look's small dungeon map lies over the top of the log (dungeonMap.ts), the log covered under it. */
  mapOverLog = false;
  /** What the party box's top border names now (frame.ts clearBorderTitle), so it is drawn again only when it changes. */
  partyTitle = '';
  /** Told which line of a menu the bar is on, each time it is drawn: a shop shows who wears what beside its wares. */
  choiceWatch: ((at: number, title: string) => void) | null = null;
  /** A key a menu does not know, offered with the line the bar is on (the journal's Y, a hint); true if it was taken. */
  choiceKey: ((k: number, at: number, title: string) => boolean | 'leave') | null = null;
  /**
   * Every key a menu is given, before the menu acts on it, with the key it was read from (menuKey's `lastRaw`): the
   * Cheats menu watching for the Konami code. 'take' spends the key, the list staying; 'again' leaves the list (choose
   * returns -2) to be drawn anew.
   */
  choiceSeen: ((k: number, raw: number, title: string) => 'take' | 'again' | undefined) | null = null;
  /** The key menuKey last read, before a keyboard read as a controller made it a button (B the letter, or B). */
  lastRaw = 0;
  /**
   * When B last backed out of something away from the command prompt (a menu, Ztats, a page, a direction asked;
   * input.ts noteBack): a B at the prompt hard on its heels is the same press come twice, not a turn passed.
   */
  backAt = -Infinity;
  /**
   * In combat, the foe a member has just walked into - or pointed at, along a line past a friend walked into: the
   * attack that follows is aimed at it (combat.ts).
   */
  bumpFoe: { x: number; y: number; pointed?: boolean } | null = null;
  /** Y pressed in a fight with Auto aim on: the attack that follows finds its own foes (combat.ts attackEach). */
  autoAim = false;
  /**
   * The member told their Auto aim's shot might hit one of the party's side (combat.ts allyAtRisk): their next X, with
   * no other key between, shoots all the same. -1 for none.
   */
  allyWarned = -1;
  /** Another window playing this character, not yet warned of (otherWindows.ts); and those warned of. */
  otherWindow: string | null = null;
  readonly windowsWarnedOf = new Set<string>();
  /** Where the crosshair starts, if a foe stands there in reach: the foe walked into, Auto aim off (combat.ts aim). */
  aimFrom: { x: number; y: number } | null = null;
  /** A spell is being cast: its aim is marked as a spell's, not a weapon's (combat.ts crosshair). */
  casting = false;
  /** A direction is being asked: whoever acts is marked, the arrows pointing out (combat.ts drawCombatMarks). */
  directing = false;
  /** The member a spell will be for, as the choice of them moves - marked in a fight; -1 while none is chosen. */
  healPick = -1;
  /** The development build's auto kill: every foe falls at the start of each of the party's turns (cheats.ts). */
  autoKill = false;
  /** Whether the music follows the map (the Upgrade driver's flag); a set piece's tune turns it off. */
  musicFollowsMap = false;
  /** What is printed while a conversation goes on, for the journal (null when not listening). */
  recording: string | null = null;
  /**
   * Which text window is being recorded. The borders draw themselves
   * while a conversation is going on - the wind's name, the moons - and
   * what they print is not something anyone said.
   */
  recordWindow: number | null = null;
  /** Hooks the browser fills in: settings the page applies, the map and file dialogs. */
  hooks: GameHooks = {};
  /**
   * Where the last press came from (the page says). Only a player pressing real keys is offered the switch to
   * letter commands: chosen with a thumb or a gamepad, it would leave them with buttons the letters ignore.
   */
  lastSource: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';

  constructor(
    readonly data: GameData,
    readonly p: Platform,
    save?: Save,
  ) {
    this.s = save ?? new Save(data.files.get('INIT.GAM'));
    // The message window's repeated turns fold (text.ts): "North (x5)" rather than five lines of it.
    p.text.foldWindow = 2; // frame.ts Win.messages
  }

  get text(): Text {
    return this.p.text;
  }
  get draw(): Draw {
    return this.p.draw;
  }
  get sound(): Sound {
    if (this.hushed) return this.silence;
    return this.p.sound;
  }

  /** A string from DATA.OVL. */
  t(address: number): string {
    return this.data.t(address);
  }

  /**
   * The last of what has been printed, whatever the window: a shopkeeper's
   * list of wares is read back out of it, so a player with no letters to
   * press can be offered the list itself (input.ts letteredChoices).
   */
  said = '';
  private read = '';
  /** Learn the words in what has been printed since this was last called (input.ts, whenever a key is waited for). */
  learnRead(): void {
    if (!this.read) return;
    this.words.learn(this, this.read);
    this.read = '';
  }
  /** The same, since the player last pressed a key: the question now before them. */
  saidSince = '';
  private remember(s: string): void {
    // The scroll of messages only: the borders' winds and titles are nobody's wares.
    // Whatever is printed for the player to read - a townsman's words, a sign, a book, the Codex - may hold a word
    // worth keeping (learnRead); the borders' winds and the menus' own lines are nobody's words.
    if (this.p.text.current !== 0 && this.p.text.current !== 3) this.read = (this.read + s).slice(-4000);
    if (this.p.text.current !== 2) return;
    this.said = (this.said + s).slice(-700);
    this.saidSince = (this.saidSince + s).slice(-700);
  }

  /**
   * A break between words that the screen does not show: where a word
   * ends exactly at the line's end, the space after it is never printed,
   * and what is kept of what was said (the journal's clues, the words
   * learnt) would run the two words into one - "runesFALLAX".
   */
  gap(): void {
    this.remember(' ');
    if (this.recording !== null && (this.recordWindow === null || this.p.text.current === this.recordWindow)) this.recording += ' ';
  }

  /**
   * What would have been printed in the log, held back while this is not null (quietly): a command that does many
   * things at once says them after, together (loot.ts). The party's panel and the screen draw as ever.
   */
  heldText: string | null = null;
  /** Whether what is printed now is held back: the log's window (2, frame.ts Win.messages) while quietly. */
  private get holding(): boolean {
    return this.heldText !== null && this.p.text.current === 2;
  }

  /** No sound made while this is so (hush), the music and its holds apart. */
  private hushed = false;

  /** The sound while hushed: nothing made, at once; the music and its holds as ever. */
  private get silence(): Sound {
    const real = this.p.sound;
    const none = (): Promise<void> => Promise.resolve();
    return {
      pulse: none,
      noise: none,
      tone: none,
      sweep: none,
      music: (tune, occasion) => real.music(tune, occasion),
      cue: none,
      setHeld: (reason, held) => real.setHeld(reason, held),
      hearMusic: (on: boolean) => real.hearMusic?.(on),
    };
  }

  /** `work` done without a sound of its own (Loot and Leave's run of chests: loot.ts). */
  async hush<T>(work: () => Promise<T>): Promise<T> {
    const was = this.hushed;
    this.hushed = true;
    try {
      return await work();
    } finally {
      this.hushed = was;
    }
  }

  /** `work` done with nothing it prints shown: what it would have said, returned instead. */
  async quietly(work: () => unknown): Promise<string> {
    const was = this.heldText;
    this.heldText = '';
    try {
      await work();
      return this.heldText;
    } finally {
      this.heldText = was;
    }
  }

  /** ULTIMA_1850_PrintString. */
  print(s: string): void {
    if (this.holding) {
      this.heldText += s;
      return;
    }
    this.remember(s);
    if (this.recording !== null && (this.recordWindow === null || this.p.text.current === this.recordWindow)) this.recording += s;
    this.p.text.print(s);
  }

  /** While a menu holds the game, the animation and the sound stop (the pause menu). */
  private held = false;

  /** Hold the game, or let it go: the tiles stop moving and the sound stops with them. */
  pause(on: boolean): void {
    if (this.held === on) return;
    this.held = on;
    this.sound.setHeld('menu', on);
  }

  /** Whether the game is held by a menu: the animation asks before it ticks. */
  get paused(): boolean {
    return this.held;
  }

  /** Whom the spell chosen from the command menu is for, where it asks. */
  castOn: number | null = null;

  /** A spell chosen from the command menu, to be cast without asking again (see magic.ts shortcutCast). */
  castPreset: { caster: number; spell: number; on?: number | undefined } | null = null;
  /** The command menu's Drink (the port's): Look at the fountain here, or the one ahead, and drink without asking. */
  drinkPreset: 'here' | 'ahead' | null = null;
  /** A Search bumped into (dungeon.ts move): the way it looks is Ahead, not asked. */
  searchAhead = false;
  /**
   * The dungeon sign read - bumped into, or read with Read sign - as its place and the way it is seen from, and which
   * reading it is (dungeon.ts readSignAhead): its runes give way to their English on the wall. Null for none; a step
   * to another square forgets it, the sign's runes runes again.
   */
  signRead: string | null = null;
  /** How many times a sign has been read, so that each reading plays from the start. */
  signReads = 0;
  /**
   * What a scene set apart from the map is, for the Standard look's frame (chromeTone.ts): a shrine's gold, or the
   * copper (death, the ending). Heeded only while the map id is set aside (over 0x7f), so it never outlasts its scene.
   */
  chromePlace: ChromePlace | null = null;
  /** The spell each member last cast in a fight, offered again at the head of their combat menu (menu.ts). */
  lastSpell = new Map<number, number>();
  /** The spell last mixed (magic.ts mixBySpell): Mix's list comes back with the bar on it, to mix it again. */
  lastMix = -1;
  /**
   * Who charmed each fighter charmed in this fight, by its place in the fight (combat.ts charm): the roll to shake it -
   * or `bound`, with no roll at all (a summoned creature, the Chaos Sword's wielder).
   */
  charmedBy = new Map<number, number | 'bound'>();
  /**
   * The eased rules' bound on what a fight breeds (combat.ts mayBreed): how many more copies and summons it
   * allows, both sides' together; and by combat slot, how often a creature may divide (where it is not the Combat
   * setting's own, a copy's) and has. Begun again with each fight.
   */
  spawnLeft = 0;
  /**
   * With the eased rules, the daemons inside possessed members (combat.ts castOut): by the member's combat slot,
   * the daemon's hit points as it went in and its intelligence; and the members whose daemon is to come out at the
   * turn's end. Begun again with each fight.
   */
  possessedBy = new Map<number, { hp: number; int: number; summoned: boolean; margin?: number }>();
  /** The combat slots of the creatures gated in or summoned in this fight (combat.ts spawned), not split off. */
  summoned = new Set<number>();
  /** Switch Weapon's memory (switchWeapon.ts): by member, their last melee and ranged arms, and their style. */
  armsMemory = new Map<string, { melee?: number[]; ranged?: number[]; style?: 'dual' | 'shield' | 'twoHanded' }>();
  castOutDue: number[] = [];
  splitLimit = new Map<number, number>();
  splits = new Map<number, number>();
  /**
   * Auto combat's measure of a fight going anywhere (autocombat.ts): the foes' hit points and number at the last
   * party turn that lowered them, and the party turns since. Begun again with each fight (combat.ts).
   */
  autoProgress = Infinity;
  autoIdle = 0;
  /** Auto combat (Allies) handed back to the player for the rest of this fight (autocombat.ts handBack). */
  autoHeld = false;
  /** When a B was last pressed in a turn auto combat played: a second soon after turns it off (autocombat.ts). */
  autoBackAt = -Infinity;
  /** Whether "Auto" stands on the party box's top border, auto combat playing the turn (input.ts autoCombatKey). */
  autoShown = false;

  /** Print a DATA.OVL string. */
  say(address: number): void {
    this.print(this.data.t(address));
  }
  /** ULTIMA_16ba_PrintChar. */
  printChar(c: number | string): void {
    const code = typeof c === 'string' ? c.charCodeAt(0) : c;
    if (this.holding) {
      this.heldText += String.fromCharCode(code);
      return;
    }
    if (code === 0x0a || (code >= 0x20 && code < 0x7f)) this.remember(String.fromCharCode(code));
    if (
      this.recording !== null &&
      (this.recordWindow === null || this.p.text.current === this.recordWindow) &&
      (code === 0x0a || (code >= 0x20 && code < 0x7f))
    )
      this.recording += String.fromCharCode(code);
    this.p.text.printChar(code);
  }
  /** ULTIMA_1a3e_PrintNumber. */
  printNumber(n: number, minLength = 1, filler = ' '): void {
    if (this.holding) {
      this.heldText += String(n).padStart(minLength, filler);
      return;
    }
    this.p.text.printNumber(n, minLength, filler);
  }

  /** ULTIMA_2092_RandomRange. */
  random(low: number, high: number): number {
    return this.rng.range(low, high);
  }

  /** The map is a settlement (1-32). */
  get inTown(): boolean {
    return this.s.mapId !== 0 && this.s.mapId < 0x21;
  }
  /** Britannia or the Underworld. */
  get outdoors(): boolean {
    return this.s.mapId === 0;
  }
  /** A dungeon (33-40). */
  get inDungeon(): boolean {
    return this.s.mapId > 0x20 && this.s.mapId < 0x80;
  }
  /** Combat or camping on a special map (the map id is 0xff meanwhile). */
  get inCombat(): boolean {
    return this.s.mapId > 0x7f;
  }
}
