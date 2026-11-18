/**
 * gameCore.ts
 *
 * What a running game is on this engine whatever the game: the platform it draws, prints and plays through, the
 * printing (and holding it back, routing it, folding it), the random numbers, the player's settings, the page's hooks,
 * the menus' memory, the notes and tips, the Avatar's appearance and the redraw flags. Ultima V's Game (game.ts)
 * extends it with its own: the save, the 1988 memory, the words and the map's fog, the talk and combat state.
 */

import type { SyncState } from '../install/sources.ts';
import type { UpdateHook } from '../ui/updates.ts';
import type { ChromePlace } from './chromeTone.ts';
import type { Text } from '../ui/text.ts';
import type { Draw, Platform, Sound } from './io.ts';
import { type Random, TrueRandom } from './rng.ts';
import { type Appearance, DEFAULT_APPEARANCE } from './appearance.ts';
import { DEFAULTS, type Options } from './settings.ts';
import type { Transfer } from './transfer.ts';
import type { TalkRows } from './menu.ts';

export interface Note {
  who: string;
  where: string;
  text: string;
  /** Game date, as the stats show it. */
  date: string;
}
export interface GameHooks {
  /** Apply settings the page owns (scanlines, sound). */
  applyOptions?: (o: Options) => void;
  /** The clipboard and files, for carrying a game between browsers, devices and the apps (transfer.ts). */
  transfer?: Transfer;
  /** Forget the installed game files and start the installer again. */
  uninstall?: () => Promise<void>;
  /**
   * Show the map of Britannia (or the Underworld) over the game until dismissed: opened on the place `focus` (a mark's
   * key, "place:<id>" or "shrine:<n>": the journal's X) where one is given, on whichever world has it.
   */
  showMap?: (underworld: boolean, focus?: string) => Promise<void>;
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
  /**
   * A note for the title to say, in the news box (a Steam launch's, boot.ts steamNote): its text, the player told, and
   * a choice to offer beside OK (macOS Sync's Fix now), whose result is said after.
   */
  note?: () => TitleNote | null;
  /** Leave the game, where it runs as an app that can (ui/platform.ts appQuit); a browser tab has none. */
  quit?: (() => void) | undefined;
  /** The title's Steam (beta) menu (the desktop app's; web and Android have none): see SteamHook. */
  steam?: SteamHook;
  /** This app's own version (the desktop app's, the Android app's), for the edition's name; none on the web. */
  version?: () => string | undefined;
}
export interface SteamStatus {
  system: 'linux' | 'windows' | 'mac';
  /** The Flatpak build, which works less well with Steam than the AppImage. */
  flatpak: boolean;
  /** Steam's folder, the player's home written ~; null where no Steam was found. */
  steam: string | null;
  /** Ultima V in Steam's libraries: installed in `where`, listed in `where` with its folder gone, or none. */
  game: 'ok' | 'missing' | 'none';
  where: string;
  /** Whether a Steam account is known: this launch's, else the one signed in last. */
  account: boolean;
  /** Whether Steam launched this run. */
  launch: boolean;
  /** The launch line this copy would use; null where it has none (the portable .exe, a Mac). */
  line: string | null;
  /** A Mac's: whether Steam is running, which setting up or taking away would quit. */
  steamRunning?: boolean;
  /** macOS Sync (desktop/main.cjs syncState): whether Cloud saves made here reach a Mac, and whether it may be fixed here. */
  sync?: SyncState;
}
export type PlayOption = 'playLine' | 'compatTool' | 'macPlay';
export interface SteamChoices {
  playLine: boolean;
  compatTool: boolean;
  macPlay: boolean;
  /** macOS Sync, the option (on unless turned off). */
  macSync: boolean;
  cloud: boolean;
  /** Whether Cloud saves is on for any Steam account on this machine, this launch's or another's. */
  cloudAny: boolean;
  /**
   * Whether Cloud saves is to come on by itself for this launch's account (cloudSwitch.ts cloudByDefault): not yet
   * chosen for it, on a machine set up since it became the default.
   */
  cloudOffered: boolean;
}
export interface SteamSwitched {
  on: boolean;
  message: string;
  line?: string;
}
export interface LineCheck {
  state: 'correct' | 'missing' | 'not-seen' | 'stale' | 'twice';
  bothLinux: boolean;
}
export interface CloudSaves {
  own(): Record<string, string>;
  /** Steam's folder, or null where it can't be read. */
  steam(): Record<string, string> | null;
  write(side: 'own' | 'steam', key: string, value: string): true | string;
  remove(side: 'own' | 'steam', key: string): boolean;
  record(on: boolean, failed?: string): Promise<SteamSwitched | null>;
  use(on: boolean): void;
}
export interface TitleNote {
  text: string;
  seen: () => void;
  action?: { label: string; run: () => Promise<string | null> };
}
export interface SteamHook {
  status(): Promise<SteamStatus>;
  /** Whether Steam started this copy (boot.ts steamLaunch): asked at once, as the title's lines depend on it. */
  launched(): boolean;
  options(): SteamChoices;
  /** Turns an option on or off, with what it does here; null where it was refused. */
  setOption(name: PlayOption | 'macSync', on: boolean): Promise<SteamSwitched | null>;
  /** Steam's saved launch line read back, or null where there is none to read. */
  lineState(): Promise<LineCheck | null>;
  /** macOS Sync's fix (desktop/main.cjs fixSync): the rules given MacOS (closing Steam), the saves re-marked; what to say. */
  fixCloud(): Promise<string | null>;
  /** Puts the launch line on the clipboard; false where this copy has none. */
  copyLine(): Promise<boolean>;
  /** Puts the tester report on the clipboard; false where it could not be made. */
  copyReport(): Promise<boolean>;
  /** Opens a page in the player's browser. */
  open(url: string): void;
  cloud: CloudSaves;
}

/**
 * What a game's play screen does around the menus (menu.ts): put back what a menu covered, the rows of a
 * conversation a menu is drawn beside, and the view's animation while a menu waits. None at the title or in a
 * game that has no such screen; Ultima V's are playHooks.ts's.
 */
export interface PlayHooks {
  restore?(): Promise<void>;
  talkRows?(): TalkRows | undefined;
  animating?(): () => void;
  /** Start or Select pressed in a menu while in play: the game held, its Pause menu over the menu. */
  pause?(): Promise<void>;
}

export class GameCore {
  /** The play screen's part in the menus (PlayHooks). */
  play: PlayHooks = {};
  /**
   * What lies over the view while the map goes on animating under it (EGA pixels, inclusive): the talk's menu and the
   * townsman's box (menu.ts talkBox, speech.ts). The squares under them are not drawn (world.ts drawView, covered).
   */
  readonly covers = new Map<'menu' | 'speech', [number, number, number, number]>();
  /** A spell is being cast: its aim is marked as a spell's, not a weapon's (combat.ts crosshair). */
  casting = false;

  constructor(readonly p: Platform) {
    // The message window's repeated turns fold (text.ts): "North (x5)" rather than five lines of it.
    p.text.foldWindow = 2; // frame.ts Win.messages
  }

  rng: Random = new TrueRandom();

  /** D_24e6: the viewport needs rebuilding (1), or the map changed (bit 2). */
  viewDirty = 1;
  /** D_a9fa: the stats need redrawing. */
  vitalsDirty = 0;
  /** D_a9ce: sound effects off. */
  soundOff = false;
  /** D_538c: keys typed ahead are kept. */
  keyBuffer = true;
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
  /**
   * The tips given in the log, once each, kept with the saved game (tips.ts): 'nudge', a new game's pointer to the
   * Tips (run.ts journeyOnward); and a fight's, one a fight (COMBAT_TIPS). A new character's are none.
   */
  tipsShown = new Set<string>(['nudge']);
  /** A prompt was backed out of (the port's: such a command spends no turn). */
  cancelled = false;
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
  /** Another window playing this character, not yet warned of (otherWindows.ts); and those warned of. */
  otherWindow: string | null = null;
  readonly windowsWarnedOf = new Set<string>();
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

  /**
   * The last of what has been printed, whatever the window: a shopkeeper's
   * list of wares is read back out of it, so a player with no letters to
   * press can be offered the list itself (input.ts letteredChoices).
   */
  said = '';
  private read = '';
  /** What a game learns of the words in what was printed (Game's: its vocabulary); none in the core. */
  protected learnWords(_text: string): void {}
  /** Learn the words in what has been printed since this was last called (input.ts, whenever a key is waited for). */
  learnRead(): void {
    if (!this.read) return;
    this.learnWords(this.read);
    this.read = '';
  }
  /** The same, since the player last pressed a key: the question now before them. */
  saidSince = '';
  private remember(s: string): void {
    // The scroll of messages only: the borders' winds and titles are nobody's wares.
    // Whatever is printed for the player to read - a townsman's words, a sign, a book, the Codex - may hold a word
    // worth keeping (learnRead); the borders' winds and the menus' own lines are nobody's words.
    if (this.p.text.current !== 0 && this.p.text.current !== 3) this.read = (this.read + s).slice(-4000);
    // The log's, and the Dialog setting's box's (speech.ts SPEECH): what a merchant names there is still what a menu
    // offers (input.ts getLetter).
    if (this.p.text.current !== 2 && this.p.text.current !== 4) return;
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
    if (this.recording !== null && this.recorded()) this.recording += ' ';
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

  /** Whether work is hushed now (hush): no sound made, and no spell's flash (magic.ts castEffect). */
  get isHushed(): boolean {
    return this.hushed;
  }

  /**
   * `work` done without a sound or a spell's flash of its own (Loot and Leave's run of chests: loot.ts) - An Sanct
   * cast on chest after chest flashed the view as fast as it was cast, some ten times a second.
   */
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

  /**
   * Where what is printed goes, in place of the window chosen, while it is set: a merchant's words parted from the
   * rest (merchantSpeech.ts), each part printed by it in its own window. (`routing` while it prints them.)
   */
  printRoute: ((s: string) => void) | null = null;
  private routing = false;
  /**
   * The choice last made from a shopkeeper's words offered as a menu (input.ts getLetter, getChar's lettered list): its
   * letter, and its label, for the log to echo in its place with the Dialog setting's Play (merchantSpeech.ts).
   */
  lastPick: { letter: number; label: string } | null = null;
  /** Called as the player is asked something - any wait for a key or a choice (input.ts, menu.ts) - while it is set. */
  beforeRead: (() => Promise<void>) | null = null;

  /** `s` given to the printRoute, where one is set (and it is not printing already); whether it took it. */
  private routed(s: string): boolean {
    if (!this.printRoute || this.routing) return false;
    this.routing = true;
    try {
      this.printRoute(s);
    } finally {
      this.routing = false;
    }
    return true;
  }

  /** ULTIMA_1850_PrintString. */
  print(s: string): void {
    if (this.holding) {
      this.heldText += s;
      return;
    }
    if (this.routed(s)) return;
    this.remember(s);
    if (this.recording !== null && this.recorded()) this.recording += s;
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

  /**
   * What a scene set apart from the map is, for the Standard look's frame (chromeTone.ts): a shrine's gold, or the
   * copper (death, the ending). Heeded only while the map id is set aside (over 0x7f), so it never outlasts its scene.
   */
  chromePlace: ChromePlace | null = null;
  /** ULTIMA_16ba_PrintChar. */
  printChar(c: number | string): void {
    const code = typeof c === 'string' ? c.charCodeAt(0) : c;
    if (this.holding) {
      this.heldText += String.fromCharCode(code);
      return;
    }
    if ((code === 0x0a || (code >= 0x20 && code < 0x7f)) && this.routed(String.fromCharCode(code))) return;
    if (code === 0x0a || (code >= 0x20 && code < 0x7f)) this.remember(String.fromCharCode(code));
    if (this.recording !== null && this.recorded() && (code === 0x0a || (code >= 0x20 && code < 0x7f)))
      this.recording += String.fromCharCode(code);
    this.p.text.printChar(code);
  }
  /**
   * Whether what is written now is heard (the recording's: a conversation's words): written in the conversation's own
   * window, or in the Dialog setting's panel the townsman speaks in (speech.ts, window 4).
   */
  private recorded(): boolean {
    const now = this.p.text.current;
    return this.recordWindow === null || now === this.recordWindow || now === 4;
  }
  /** ULTIMA_1a3e_PrintNumber. */
  printNumber(n: number, minLength = 1, filler = ' '): void {
    if (this.holding) {
      this.heldText += String(n).padStart(minLength, filler);
      return;
    }
    if (this.routed(String(n).padStart(minLength, filler))) return;
    this.p.text.printNumber(n, minLength, filler);
  }

  /** ULTIMA_2092_RandomRange. */
  random(low: number, high: number): number {
    return this.rng.range(low, high);
  }
}
