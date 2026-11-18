/**
 * game.ts
 *
 * The running game: the saved state (save.ts) and the working memory the
 * DOS game kept beside it, which rules modules read and write through a
 * `Game`. Names follow what the memory is for; the u5d address is on each
 * field. What any game on this engine has (printing, settings, hooks, the
 * menus' memory) is GameCore's (gameCore.ts), which Game extends.
 */

import { TileCycles } from '../ui/animate.ts';
import { GameData } from './data.ts';
import { Fog } from './fog.ts';
import { PathState } from './modernKarma.ts';
import { Vocabulary } from './words.ts';
import type { Platform } from './io.ts';
import { Actor, Save } from './save.ts';
import { TalkState } from './talk.ts';

import { GameCore } from './gameCore.ts';
import { ultima5Play } from './playHooks.ts';
import { useSaves } from './saveCodec.ts';
import { ultima5Saves } from './ultima5Saves.ts';

/** The types every game shares (gameCore.ts), where their importers have long found them. */
export type {
  CloudSaves,
  GameHooks,
  LineCheck,
  Note,
  PlayOption,
  SteamChoices,
  SteamHook,
  SteamStatus,
  SteamSwitched,
  TitleNote,
} from './gameCore.ts';

/** Combat entity flags (u5d macros.h COMBAT_FLAGS_*). */
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
/** What only the browser page can do for the game. */
/** What the Steam (beta) menu opens with (desktop/main.cjs steamStatus). Only found by reading. */
/** The options that set Steam's Play up, by system: a launch line (Windows, Linux), the compatibility tool, a Mac's. */
/** The options as they stand on this machine, Cloud saves for this launch's Steam account (off with none known). */
/** An option switched (desktop/steamOptions.cjs switchOption): whether it is on now, what to say, a launch line to show. */
/** Whether Steam's saved launch line is this copy's (desktop/launchCheck.cjs), and whether both Linux options are on. */
/**
 * The two sides of Steam Cloud saves' copy (cloudSwitch.ts): this computer's own saves and Steam's folder, each as
 * keys and values; a write on one side (true, or why not), a removal (false where it could not be made); the switch
 * recorded once the copy has all gone through, or its failure with the option left as it was; and the running game's
 * saves kept from then on where the option now says.
 */
/** A note for the title (Hooks.note): its text, the player told, and a choice to offer beside OK. */
/** What the Steam (beta) menu asks of the desktop app (steamMenu.ts). */
/** What bump to act remembers of a thing (Game.bumped). */
export type Bumped = 'done' | 'searched' | 'trap' | 'clean' | 'disarmed';
/** A thing's place in Game.bumped: where it stands (the world's edge wrapped, as the actors' places are). */
export const thingKey = (g: Game, x: number, y: number): string => `${g.s.mapId}:${g.s.level}:${x & 0xff},${y & 0xff}`;

export class Game extends GameCore {
  s: Save;
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

  /** D_a3e2: the map's name on the top border. */
  mapName = ' '.repeat(12);
  /** D_6a34: the ambient sound's eight-step beat. */
  ambientBeat = 0;
  /** When the clock last sounded (ms, Platform.now), and whether the tock comes next. */
  clockAt = -Infinity;
  /** Where the party stood at the last command asked for, and on what map and level (input.ts noteScene). */
  stood: { map: number; level: number; x: number; y: number } | null = null;
  clockTock = false;
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

  /** Whether this fight has had its tip, or need not (combat.ts combatLoop, combatTip): one a fight. */
  fightTipped = false;
  /**
   * In a fight, each member's snap target (combat.ts snapTarget), by combat slot: the foe they last struck or chose
   * with LB/RB, theirs again while it stands in reach; -1 none. Not saved: a fight's own.
   */
  snapMemory: number[] = new Array<number>(0x20).fill(-1);
  /**
   * Whether each member's snap target (snapMemory) was chosen with the crosshair - aimed at by hand with Attack, or
   * with a spell aimed at one foe - and so stays theirs though it stands in the dark (combat.ts standingFoe). Not saved.
   */
  snapByHand: boolean[] = new Array<boolean>(0x20).fill(false);
  /** The day (time.ts gameDay) the old man last came to camp (combat.ts apparitionComes); -1, not yet. Saved. */
  oldManDay = -1;
  /** The arrows and quarrels held above the save's 99, by item (ammo.ts: the Modern rules carry 999). Saved. */
  ammoExtra: Record<number, number> = {};
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
  /**
   * A grapple's climb asked with a bump ("Confirm climb?", bumpAct.ts): from where to where, and the turn it was asked
   * on (turnsTaken). The next bump into the same mountain from the same square, on that turn or the next, climbs it.
   */
  climbAsked: { key: string; turn: number } | null = null;
  /** Every turn's end (time.ts endTurn), counted: what "the next turn" is measured by. */
  turnsTaken = 0;
  /** The Modern karma (modernKarma.ts): kept always beside 1988's, saved with the game. */
  path = new PathState();
  /** This fight ended by a cheat (Slay every foe): no Battle karma for it (modernKarma.ts battleOutcome). */
  cheatedFight = false;
  /** This fight is against the place's own people, attacked by the party: no Battle karma for winning it. */
  fightingTownsfolk = false;
  /** How often the karma the game reads has risen and fallen (modernKarma.ts deed): which way a stretch of play moved it. */
  karmaMoves = { up: 0, down: 0 };
  /** The sides as the fight began (combat.ts combatLoop): foes against the party, for the Battle karma. */
  fightOdds = { foes: 0, party: 0 };
  /** The member a spell falls on (onWho), for its pulse (castEffect); -1 for none, the whole view. */
  spellOn = -1;
  /**
   * The squares the party's leader came through in a settlement, the last first (the port's): the Standard look
   * draws the other members on them, in a line behind (world.ts drawView). Emptied on a new level or place.
   */
  trail: { x: number; y: number; z: number }[] = [];
  /**
   * The worn regalia (the port's own slot): the Amulet (0x0e), the Crown (0x1c) or the Black Badge (0x1d), or 0. In
   * 1988 it shared the spell's slot (Save icon), so a lasting spell cast - or a night's rest - took its power away.
   */
  regalia = 0;
  /**
   * In combat, the foe a member has just walked into - or pointed at, along a line past a friend walked into: the
   * attack that follows is aimed at it (combat.ts). `snap`: the snap target (combat.ts snapTarget), no foe walked
   * into, and passed over as any foe is where a stray shot might hit a friend.
   */
  bumpFoe: { x: number; y: number; pointed?: boolean; snap?: boolean } | null = null;
  /** X pressed in a fight with Snap attacks on: the attack that follows finds its own foes (combat.ts attackEach). */
  autoAim = false;
  /** Where the crosshair starts, if a foe stands there in reach: the foe walked into, Snap attacks off (combat.ts aim). */
  aimFrom: { x: number; y: number } | null = null;
  /** A direction is being asked: whoever acts is marked, the arrows pointing out (combat.ts drawCombatMarks). */
  directing = false;
  /** The member a spell will be for, as the choice of them moves - marked in a fight; -1 while none is chosen. */
  healPick = -1;
  /** The development build's auto kill: every foe falls at the start of each of the party's turns (cheats.ts). */
  autoKill = false;
  constructor(
    readonly data: GameData,
    p: Platform,
    save?: Save,
  ) {
    super(p);
    this.s = save ?? new Save(data.files.get('INIT.GAM'));
    this.play = ultima5Play(this);
    useSaves(ultima5Saves); // how the game is saved (ultima5Saves.ts), for the machinery (storage.ts)
  }

  protected override learnWords(text: string): void {
    this.words.learn(this, text);
  }

  /** A string from DATA.OVL. */
  t(address: number): string {
    return this.data.t(address);
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
  /**
   * What each combat slot taken off the field last held (combat.ts removeCombatant): its kind, by slot - for the report
   * of a creature that leaves no body, made after it is gone ("Insect Swarm killed!", not the empty slot's "Mage").
   */
  gone = new Map<number, number>();
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
  /** Where auto combat last took up other arms in this fight: not again from the same place and hands (autocombat.ts). */
  autoSwitchedAt = '';
  /** When a B was last pressed in a turn auto combat played: a second soon after turns it off (autocombat.ts). */
  autoBackAt = -Infinity;
  /** Whether "Auto" stands on the party box's top border, auto combat playing the turn (input.ts autoCombatKey). */
  autoShown = false;

  /** Print a DATA.OVL string. */
  say(address: number): void {
    this.print(this.data.t(address));
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
