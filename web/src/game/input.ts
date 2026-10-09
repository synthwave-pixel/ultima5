/**
 * input.ts
 *
 * Reading keys the way the DOS game did: ULTIMA_266c_GetChar waits with the
 * cursor blinking and the map animating, and the prompts built on it: a
 * direction (ULTIMA_35ec), a party member (ULTIMA_2d7a, ULTIMA_4988), a
 * line of text (ULTIMA_3b1c) and a number (ULTIMA_3b9e).
 */

import { treasureLies } from './actors.ts';
import { autoTitle, clearBorderTitle, borderTitle, drawVitals, invertMember, markTurn, updateFrame } from './frame.ts';
import { liftDungeonMap } from './dungeonMap.ts';
import { Game } from './game.ts';
import { K, LOST_FOCUS, Pad } from './io.ts';
import { Status } from './save.ts';

export const upper = (c: number): number => (c >= 0x61 && c <= 0x7a ? c - 0x20 : c);

/** The cursor's four frames are glyphs 5-8 (D_5390, D_5392). */
const CURSOR_FIRST = 5;
const CURSOR_FRAMES = 4;

/**
 * Keys queued to be read before any new press: bump to act's command, and its direction. (The letter picker's words go
 * to the prompt that opened it alone, never here, where what was left of one was read as commands.)
 */
const typed: number[] = [];

/** Keys to be read next, before any the player presses (bump to act's command). */
export function queueKeys(...keys: number[]): void {
  typed.push(...keys);
}

/** Bump to act: run `command` toward `dir`, as if typed (the direction goes to the command's own prompt only). */
export function bumpInto(g: Game, command: number, dir: number): void {
  g.bumpDir = dir;
  typed.push(command);
}

/**
 * The keyboard as a controller (the ultima3 port's controller mode), a
 * hand or two: WASD or the arrows walk; Enter or Z is A; Space,
 * Escape, X or B is B (the space bar passes, as it always has); Q, / or C
 * is X (attack); E, . (full stop), V or Y is Y (cast). (Escape at the command prompt opens the Pause menu, as it
 * always has, rather than passing the turn.) Ultima V spends nearly every
 * letter on a command, so in this mode the letters are not commands at
 * all - everything is reached through the menus - and any other letter is
 * ignored rather than doing something the player did not ask for. 0
 * means: wait for another key.
 */
export function asPad(g: Game, k: number): number {
  if (g.options.input !== 'controller' || k >= 0x100 || k < 0x20) return k;
  switch (k) {
    case 0x20: // Space
      return Pad.B;
    case 0x2f: // /
      return Pad.X;
    case 0x2e: // .
      return Pad.Y;
  }
  switch (upper(k)) {
    case 0x57: // W
      return K.Up;
    case 0x41: // A
      return K.Left;
    case 0x53: // S
      return K.Down;
    case 0x44: // D
      return K.Right;
    case 0x5a: // Z
      return Pad.A;
    case 0x58: // X
    case 0x42: // B
      return Pad.B;
    case 0x43: // C
    case 0x51: // Q
      return Pad.X;
    case 0x56: // V
    case 0x59: // Y
    case 0x45: // E
      return Pad.Y;
  }
  return upper(k) >= 0x41 && upper(k) <= 0x5a ? 0 : k;
}

/**
 * A key for a menu: no cursor turns and nothing animates, but a keyboard
 * read as a controller is still one - W A S D move the bar, Z chooses, X
 * backs out - and the letters, which are nobody's shortcuts in that mode,
 * do nothing.
 */
export async function menuKey(g: Game, keep: number[] = []): Promise<number> {
  for (;;) {
    g.learnRead();
    const raw = await g.p.waitKey(() => g.titleIdle?.());
    g.lastRaw = raw;
    // Letters the menu itself answers to (Y and N at a yes or no) are letters even on a keyboard read as a pad.
    if (raw < 0x100 && keep.includes(upper(raw))) return upper(raw);
    const k = asPad(g, raw);
    noteBack(g, k);
    // Start or Select holds the game from any menu, as from the command prompt; the menu is drawn again after
    // (PAUSED). In the Pause menu, and what it opens, they back out of it, as ever.
    if ((k === Pad.Start || k === Pad.Select) && g.inPlay && !g.paused) {
      await pauseHere(g);
      return PAUSED;
    }
    if (k !== 0) return k;
  }
}

/** menuKey's word that the Pause menu has been up over the menu, which is to be drawn again. */
export const PAUSED = 0x1ff;

/**
 * The Pause menu, opened from a prompt or a menu in the middle of a command (Start or Select): the game's saving
 * greyed there - a command part done is no game to keep (a potion taken before it is given to anyone) - and the
 * prompt left as it was.
 */
async function pauseHere(g: Game): Promise<void> {
  const { pauseMenu } = await import('./menu.ts');
  await pauseMenu(g, !g.commandPrompt);
}

/** Whether rawKey's last key was the player's own, not queued nor auto combat's (whose Escape leaves a won field). */
let pressed = false;

/**
 * A raw key (a DOS code or a controller button) with the cursor turning,
 * and the map animating outside dungeons (or `idle`). `literal` is for
 * the places a player types words and names, where the letters are
 * letters whatever the keyboard is set to be. `command` for the command
 * prompt's own wait, where a lost focus opens the Pause menu.
 */
async function rawKey(g: Game, idle?: () => void, literal = false, command = false): Promise<number> {
  pressed = false;
  const queued = typed.shift();
  if (queued !== undefined) return queued;
  g.learnRead();
  const auto = await autoCombatKey(g);
  if (auto !== 0) return auto;
  pressed = true;
  const t = g.text;
  let frame = 0;
  // The passes of the key-wait loop, by which the figures move: on every pass in the PC EGA look, about nine a second,
  // as a 1988 AT drew them; in the Standard look on every other, as an XT's slower drawing had them, since its larger,
  // sharper figures show each frame's change far more.
  let pass = 0;
  const cursor = (c: number): void => {
    const was = t.advance;
    t.advance = false;
    t.printChar(c);
    t.advance = was;
  };
  for (;;) {
    g.awaitingCommand = command;
    const key = await g.p
      .waitKey(() => {
        cursor(CURSOR_FIRST + frame);
        frame = (frame + 1) % CURSOR_FRAMES;
        if (idle) idle();
        else if (g.s.mapId < 0x21 || g.s.mapId > 0x7f) updateFrame(g, g.options.tileSet !== 'standard' || (pass++ & 1) === 0);
      })
      .finally(() => (g.awaitingCommand = false));
    // A lost focus is for the command prompt alone (io.ts LOST_FOCUS); anywhere else it passes.
    if (key === LOST_FOCUS && !command) continue;
    const k = literal ? key : asPad(g, key);
    // Start or Select holds the game from any prompt, as from the command prompt (which answers them itself).
    if ((k === Pad.Start || k === Pad.Select) && !command && g.inPlay && !g.paused) {
      await pauseHere(g);
      continue;
    }
    if (k !== 0) {
      cursor(0x20);
      g.saidSince = '';
      if (!command) noteBack(g, k);
      return k;
    }
  }
}

/** What a member is chosen for, that the choice may start on the one who needs it (neediest). */
export type Need = 'hurt' | 'poisoned' | 'asleep' | 'dead';

/**
 * The member a healing is likeliest meant for, for the choice's bar to start on (the port's): one of the state
 * `need` names - the poisoned for a cure, the sleeping to be woken, the dead to be raised - and of those, or for a
 * healing, the living with the least of their hit points left, by the share of them; undefined where nobody is.
 */
export function neediest(g: Game, need: Need = 'hurt'): number | undefined {
  const s = g.s;
  const state = { hurt: null, poisoned: Status.Poisoned, asleep: Status.Sleeping, dead: Status.Dead }[need];
  let best: number | undefined;
  let least = Infinity;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (state !== null ? p.status !== state : p.status === Status.Dead || p.hp >= p.maxHp) continue;
    const share = p.maxHp > 0 ? p.hp / p.maxHp : 0;
    if (share < least) [best, least] = [m, share];
  }
  return best;
}

/** A B backing out, away from the command prompt: when, by the page's clock (Game.backAt). */
function noteBack(g: Game, k: number): void {
  if (k === Pad.B) g.backAt = g.p.now?.() ?? -Infinity;
}

/** How soon after a B away from the prompt a B at it is taken for the same press come twice (ms). */
const BACK_TWICE = 250;

/** The list last offered, and the text it was read from: offered again from there once that text is behind the cursor. */
let lastList: { said: string; list: { letter: number; label: string }[] } | null = null;

/**
 * The lettered choices in what has just been printed - "A...Ginseng",
 * "B...Garlic" - as a shopkeeper lists them before asking for a letter:
 * the last unbroken run of such lines, if nothing but a line or two of
 * question has been printed since.
 */
export function letteredChoices(g: Game): { letter: number; label: string }[] {
  // A wine list: "a) Rose.......18", line after line with no break between them, the price at the end of each.
  const wines = [...g.saidSince.matchAll(/([a-z])\)\s*([A-Za-z' ]+?)\.{2,}\s*(\d+)/g)];
  if (wines.length >= 2) return wines.map((m) => ({ letter: m[1].toUpperCase().charCodeAt(0), label: `${m[2]} ${m[3]}` }));
  const lines = g.said.split('\n');
  let end = lines.length - 1;
  // Back over the question that follows the list ("Thy interest?"), a few lines at most.
  let skipped = 0;
  while (end >= 0 && !/^[A-Za-z]\.{3}/.test(lines[end].trim())) {
    if (lines[end].trim() !== '' && ++skipped > 3) return [];
    end--;
  }
  const out: { letter: number; label: string }[] = [];
  for (let i = end; i >= 0; i--) {
    // (An armoury letters its wares in small letters, a herbalist in capitals: the key is the capital either way.)
    const m = /^([A-Za-z])\.{3,}\s*(.+)$/.exec(lines[i].trim());
    if (!m) {
      if (lines[i].trim() === '') continue;
      break;
    }
    out.unshift({ letter: m[1].toUpperCase().charCodeAt(0), label: m[2].trim() });
  }
  return out;
}

/**
 * A letter from those a shopkeeper will take - B or S at the armoury, C, H
 * or R at the healer's - where the question names the choices in words
 * ("to Buy or to Sell?") rather than listing them. Typed, it is the
 * original's prompt. A player with no letters is shown the words
 * themselves, read back out of what the shopkeeper has just said: for
 * each letter, the last capitalised word beginning with it - or, where
 * the question's choices are always the same, `labels`, one to a letter
 * (the healer's "Cure poison", where the words read back gave the
 * healer's own name). Backing out is Space, which every such prompt
 * takes for leaving.
 */
export async function getLetter(g: Game, letters: number[], labels?: string[]): Promise<number> {
  if (g.options.input !== 'controller') return getChar(g);
  if (labels) {
    const { ask } = await import('./menu.ts');
    const at = await ask(g, 'Choose', labels);
    return at < 0 ? K.Space : letters[at];
  }
  // Capitalised words that do not begin a sentence: those are the ones a shopkeeper is naming.
  // (In the question now before the player, not in the greeting before it, which names the shop.)
  const named = [...(g.saidSince || g.said).matchAll(/([a-z,;]\s+)([A-Z][a-z']+)/g)].map((m) => m[2]);
  const found = letters
    .map((letter) => ({ letter, word: [...named].reverse().find((w) => w.charCodeAt(0) === letter) }))
    .filter((f) => f.word !== undefined);
  // What was not named is not on offer this time (a pub that has not yet spoken of a chat); if nothing was, the
  // letters themselves will have to do.
  if (found.length > 0) letters = found.map((f) => f.letter);
  const items = letters.map((letter) => ({ label: found.find((f) => f.letter === letter)?.word ?? String.fromCharCode(letter) }));
  const { ask } = await import('./menu.ts');
  const at = await ask(
    g,
    'Choose',
    items.map((it) => it.label),
  );
  return at < 0 ? K.Space : letters[at];
}

/**
 * ULTIMA_266c_GetChar: the next key, upper-cased. While waiting, the
 * cursor turns at the text position and, outside dungeons, the map
 * animates (ULTIMA_5910_UpdateFrame). A controller's A here is Enter and
 * its B Escape - every prompt's "none" - and X and Y are themselves
 * (Pad.X, Pad.Y): a key to go on, where any key does; the blow or the
 * spell they began, at its aim; nothing, elsewhere - but Y at a prompt
 * answered by a letter (`letters`), where it opens the letter picker and
 * its first letter is the answer.
 */
export async function getChar(g: Game, idle?: () => void, literal = false, letters = false): Promise<number> {
  // At a prompt a letter answers, a list of lettered wares just printed is offered as a menu at once, to a player
  // with no letters - and again with A - its B the prompt's "none" (Space, which every such prompt takes for leaving).
  // Nowhere else: a list still in the log is no answer to a wait, a direction or a member.
  let list: { letter: number; label: string }[] = [];
  if (letters && !literal) {
    list = letteredChoices(g);
    // What was read at this prompt before, where the loop asks again (the wine list's own lines are gone by then).
    if (list.length < 2 && lastList?.said === g.said) list = lastList.list;
    if (list.length >= 2) lastList = { said: g.said, list };
  }
  const offer = async (): Promise<number> => {
    const { ask } = await import('./menu.ts');
    const at = await ask(
      g,
      'Choose',
      list.map((c) => c.label),
    );
    return at < 0 ? K.Space : list[at].letter;
  };
  const offers = g.options.input === 'controller' && list.length >= 2;
  if (offers) return offer();
  for (;;) {
    const k = await rawKey(g, idle, literal);
    if (k < 0x100) return upper(k);
    switch (k) {
      case Pad.A:
        return K.Enter;
      case Pad.B:
        return K.Escape;
      case Pad.X:
        return Pad.X;
      case Pad.Y: {
        if (!letters) return Pad.Y;
        const { letterPicker } = await import('./menu.ts');
        const word = await letterPicker(g);
        if (word.length !== 0) return upper(word[0]); // one letter is the answer; the rest of a word is nobody's
        break;
      }
    }
  }
}

/**
 * Up or down, where a ladder goes both ways: typed (U, D or an arrow) as
 * the original asks it, or chosen from a box. Returns an arrow, or Space
 * for neither.
 */
export async function upOrDown(g: Game): Promise<number> {
  if (g.options.input !== 'controller' || typed.length !== 0) return getChar(g);
  const { ask } = await import('./menu.ts');
  const at = await ask(g, g.options.input === 'controller' ? 'Climb' : 'Klimb', ['Up', 'Down']);
  return at === 0 ? K.Up : at === 1 ? K.Down : K.Space;
}

/** GetChar at a yes-or-no question: a controller's A is Yes, B No. */
export async function getCharYN(g: Game): Promise<number> {
  if (g.options.input === 'controller' && typed.length === 0) {
    // A question is a box with its two answers in it, not a wait for a button the player must know of: Yes, No,
    // and B for No. (Y and N still answer it from a keyboard.)
    const { askYesNo } = await import('./menu.ts');
    g.saidSince = '';
    return (await askYesNo(g)) ? 0x59 : 0x4e;
  }
  for (;;) {
    // Y and N answer a yes-or-no question on any keyboard, even one read as a controller, where Y is otherwise
    // the pad's Y button: nobody asked "dost thou wish to leave?" should find that typing Y does nothing.
    const key = await rawKey(g, undefined, true);
    if (key < 0x100 && (upper(key) === 0x59 || upper(key) === 0x4e)) return upper(key);
    const k = asPad(g, key);
    if (k === 0) continue;
    if (k < 0x100) return upper(k);
    if (k === Pad.A) return 0x59;
    if (k === Pad.B) return 0x4e;
  }
}

/**
 * The key at a command prompt. The original's letters all work; A (or Tab,
 * or Enter where Enter is no command) opens the command menu, B passes, X
 * attacks (fires, aboard a ship or beside a cannon), Y casts, and Start, Select or Escape open the Pause menu
 * (Classic's Escape, in a fight, leaves a won field as in 1988) - as does the window losing focus while the prompt
 * waits.
 */
export async function getCommandKey(g: Game, where: Game['commandPrompt'], idle?: () => void): Promise<number> {
  const menu = await import('./menu.ts');
  const { musicForMap } = await import('./music.ts');
  g.commandPrompt = where;
  // Out of the dungeon's view, the log is all the log again (the Standard look's small map lay over it).
  if (where !== 'dungeon') liftDungeonMap(g);
  g.autoAim = false;
  g.casting = false;
  // The Upgrade asks for the map's tune whenever the game waits for a command (its hook in ULTIMA_1b38).
  musicForMap(g);
  // This character played in another window too: said here, before the turn (otherWindows.ts).
  if (g.otherWindow !== null) {
    const { warnOfOtherWindow } = await import('./otherWindows.ts');
    await warnOfOtherWindow(g);
  }
  try {
    for (;;) {
      const k = await rawKey(g, idle, false, true);
      let key = k;
      // A warning that a shot might hit an ally holds only for the X straight after it (combat.ts allyAtRisk).
      if (k !== Pad.X) g.allyWarned = -1;
      // Enter is A too, but for Classic input in a dungeon, where it turns the party about as in 1988.
      const turns = where === 'dungeon' && g.options.input !== 'controller';
      if (k === Pad.A || k === K.Tab || (k === K.Enter && !turns)) key = await menu.commandMenu(g);
      // B passes; on a won field it leaves, as Escape does, there being nothing to pass for - unless treasure lies
      // there still, which B must not walk away from by accident (Leave combat, at the head of the menu, does it on
      // purpose), or the field is one that cannot be left (Doom's last room), where B is the only pass there is.
      // (A B on the heels of one that backed out of a menu or a page is that press again, a hand's bounce or a
      // double tap: ignored, not a turn passed - the port's.)
      else if (k === Pad.B && (g.p.now?.() ?? -Infinity) - g.backAt < BACK_TWICE) continue;
      else if (k === Pad.B)
        key = where === 'combat' && g.s.battleWon !== 0 && !(g.s.combatFlags & 0x80) && !treasureLies(g) ? K.Escape : K.Space;
      // X: attack, wherever the party is - Fire, aboard a ship or beside a cannon, as the guns are the attack there.
      else if (k === Pad.X) {
        key = where !== 'combat' && firesHere(g) ? 0x46 : 0x41;
        // Auto aim: X's attack in a fight finds its own foes; the menu's Attack still aims its first blow by hand.
        g.autoAim = where === 'combat' && g.options.autoAim;
      }
      // Y: cast, wherever the party is (Look and Ztats are in the menu).
      else if (k === Pad.Y) key = 0x43;
      // Both system buttons, either side of a controller's logo, hold the game (the u3 port's), and Escape on a
      // keyboard - in a fight too, for a keyboard read as a controller, whose B leaves a won field; Classic's Escape
      // there is 1988's, which leaves it.
      else if (
        k === Pad.Start ||
        k === Pad.Select ||
        k === LOST_FOCUS ||
        (k === K.Escape && (where !== 'combat' || (pressed && g.options.input === 'controller')))
      )
        key = await menu.pauseMenu(g);
      if (key !== 0) return upper(key);
    }
  } finally {
    g.commandPrompt = '';
  }
}

/**
 * Whether the attack here is the guns: aboard a frigate out in Britannia (its broadside), or beside one of a
 * castle's cannons (cmds.ts fireCommand).
 */
function firesHere(g: Game): boolean {
  const s = g.s;
  if (s.mapId === 0) return s.partyTile >= 0x20 && s.partyTile <= 0x27;
  if (s.mapId > 0x20 || g.inDungeon) return false;
  return [
    [5, 4],
    [6, 5],
    [5, 6],
    [4, 5],
  ].some(([x, y]) => (g.view[y * 32 + x] & 0xfc) === 0xb4);
}

/**
 * Auto combat plays a turn (autocombat.ts). A key that holds the game - Start, Select, Escape, the window losing focus -
 * opens the Pause menu in the midst of it, where Auto combat can be turned off or changed, in either mode; with All any
 * other key hands the party back.
 */
async function autoCombatKey(g: Game): Promise<number> {
  const key = g.options.autoCombat === 'off' || g.s.mapId !== 0xff ? 0 : await autoTurnKey(g);
  // The turn the player's, or the fight over: "Auto" taken down from the map's top border, the sky back there. Not in a
  // dungeon, whose view (its level on the border) is drawn again as the party comes back to it.
  if (key === 0 && g.autoShown) {
    g.autoShown = false;
    if (g.s.mapId === 0xff || g.s.mapId < 0x21) autoTitle(g, false);
  }
  return key;
}

/** autoKey, the player's keys told apart for it: one that holds the game (its Pause menu opened here), B, and the rest. */
async function autoTurnKey(g: Game): Promise<number> {
  const { autoKey } = await import('./autocombat.ts');
  return autoKey(g, async (raw) => {
    const k = asPad(g, raw);
    if (k === Pad.Start || k === Pad.Select || raw === K.Escape || raw === LOST_FOCUS) {
      if (!g.inPlay || g.paused) return 'other';
      await pauseHere(g);
      return 'pause';
    }
    // B as a controller gives it, or as the keyboard read as one does (Space, X, B); with Classic input, Space.
    return k === Pad.B || (g.options.input !== 'controller' && raw === 0x20) ? 'back' : 'other';
  });
}

/**
 * `ask` done with whoever acts marked, the arrows pointing out (the port's): on the map, a fight's or the world's
 * and a town's - not a dungeon's, seen from within. The mark is drawn at once and taken away after.
 */
export async function directing(g: Game, ask: () => Promise<void>): Promise<void> {
  const s = g.s;
  const onMap = s.mapId < 0x21 || s.mapId > 0x7f;
  // Drawn without disturbing (dx, dy), which a direction's asker may hold its start in.
  const redraw = (): void => {
    const [dx, dy] = [s.dx, s.dy];
    updateFrame(g);
    [s.dx, s.dy] = [dx, dy];
  };
  g.directing = onMap;
  if (onMap) redraw();
  try {
    await ask();
  } finally {
    g.directing = false;
    if (onMap) redraw();
  }
}

/**
 * ULTIMA_35ec_SelectDirection: an arrow (dx, dy set) is true; Space or Escape prints "Pass" and is false. With `here`
 * (the port's, a controller's), A answers the party's own square, the one marked: true, with dx and dy both 0.
 */
export async function selectDirection(g: Game, here = false): Promise<boolean> {
  const s = g.s;
  s.dx = 0;
  s.dy = 0;
  let k = g.bumpDir;
  g.bumpDir = 0;
  const hereToo = here && g.options.input === 'controller';
  if (k === 0) {
    // Which way is asked where Select: is, on the border, for a player who was not told the d-pad answers it.
    const hint = g.options.input === 'controller' && typed.length === 0;
    if (hint) borderTitle(g, hereToo ? 'Which way, or here?' : 'Which way?');
    await directing(g, async () => {
      do k = await getChar(g);
      while (k !== K.Space && k !== K.Escape && k !== K.Up && k !== K.Down && k !== K.Left && k !== K.Right && !(hereToo && k === K.Enter));
    });
    if (hint) clearBorderTitle(g);
  }
  switch (k) {
    case K.Enter:
      g.print('Here\n');
      return true;
    case K.Up:
      g.say(0xa2a6); // "North\n"
      s.dy--;
      return true;
    case K.Down:
      g.say(0xa2ae); // "South\n"
      s.dy++;
      return true;
    case K.Left:
      g.say(0xa2b6); // "West\n"
      s.dx--;
      return true;
    case K.Right:
      g.say(0xa2bc); // "East\n"
      s.dx++;
      return true;
    default:
      // B, with a controller, is no way and no turn: the line ended, not "Pass" (Classic's Space still passes so).
      if (g.options.input === 'controller') g.printChar('\n');
      else g.say(0xa2a0); // "Pass\n"
      g.cancelled = true;
      return false;
  }
}

/** ULTIMA_1fa0_Backspace: rub out `n` characters before the cursor. */
export function backspace(g: Game, n: number): void {
  const w = g.text.win;
  for (let i = 0; i < n; i++) {
    if (w.x > 0) w.x--;
    const was = g.text.advance;
    g.text.advance = false;
    g.printChar(' ');
    g.text.advance = was;
  }
}

/** ULTIMA_3b1c_GetString: a line of up to `max` characters (upper case), ended by Enter. */
export async function getString(g: Game, max: number): Promise<string> {
  let s = '';
  const buffered = g.keyBuffer;
  g.keyBuffer = false;
  let k: number;
  do {
    k = await getChar(g, undefined, true); // words are typed as letters, whatever the keyboard is set to be
    if (k === Pad.Y) {
      // The letter picker's word, into this line and no other prompt; its Done ends the line (its Enter), Cancel
      // types nothing.
      const { letterPicker } = await import('./menu.ts');
      for (const c of await letterPicker(g))
        if (c === K.Enter) k = K.Enter;
        else if (c > 0x1f && c < 0x80 && s.length < max) {
          s += String.fromCharCode(upper(c));
          g.printChar(upper(c));
        }
    } else if ((k === K.Backspace || k === K.Left) && s.length !== 0) {
      backspace(g, 1);
      s = s.slice(0, -1);
    } else if (k === K.Escape && s.length !== 0) {
      backspace(g, s.length);
      s = '';
    } else if (k > 0x1f && k < 0x80 && s.length < max) {
      s += String.fromCharCode(k);
      g.printChar(k);
    }
  } while (k !== K.Enter);
  g.keyBuffer = buffered;
  return s;
}

/**
 * One digit, where the game asks for a single key of them ("For how many
 * hours? (1-9)"): typed, or on a controller dialled - up and down through
 * the digits, A to say it, B for none (Space, as the prompts take it).
 * Nothing is left printed; the prompt prints what it is given.
 */
export async function getDigit(g: Game, zero = false, most = 9): Promise<number> {
  if (g.options.input !== 'controller' || typed.length !== 0) return getChar(g);
  const { amount } = await import('./menu.ts');
  const n = await amount(g, zero ? 0 : 1, most, 1);
  // Where nought is an answer (no gold offered at a shrine) B gives it; elsewhere B is Space, which the prompts
  // take for none.
  return n < 0 ? (zero ? 0x30 : K.Space) : 0x30 + n;
}

/**
 * How many hours to sleep, at a camp or in a bed; 0 for none. The keyboard types a digit, 1 to 9, as in 1988. A
 * controller dials 1 to 23 (the port's; 24 would be the hour it is, and end at once), starting at 9 - a rest needs six -
 * with `outcome` under the number saying
 * what that many hours will be (rest.ts restOutcome: Rest, or Wait), and under it the hour they end at (untilLine).
 */
export async function getHours(g: Game, outcome: (hours: number) => string): Promise<number> {
  if (g.options.input === 'controller' && typed.length === 0) {
    const { amount } = await import('./menu.ts');
    // What the hours will be (Rest, Wait), and the hour they end at.
    const { untilLine } = await import('./rest.ts');
    return Math.max(0, await amount(g, 1, 23, 9, { title: 'Hours', caption: (h) => `${outcome(h)}\n${untilLine(g, h)}` }));
  }
  let k: number;
  while ((k = await getChar(g)) !== K.Space && (k < 0x30 || k > 0x39));
  return k === K.Space ? 0 : k - 0x30;
}

/**
 * ULTIMA_3b9e: a number of up to `max` digits (at most 5), with an optional sign. Dialled with a controller, `most`
 * caps the dial below what the digits allow (what the party can pay for), and `caption` says beneath it what the
 * number on the dial comes to; typed, as in 1988, neither is shown.
 */
export async function getNumber(
  g: Game,
  max: number,
  { most: cap, caption }: { most?: number; caption?: ((n: number) => string) | undefined } = {},
): Promise<number> {
  max = Math.min(max, 5);
  let s = '';
  let k: number;
  if (g.options.input === 'controller' && typed.length === 0) {
    // A controller has no digits: the number is dialled in a box (menu.ts amount), as the ultima3 port does it.
    const { amount } = await import('./menu.ts');
    const high = Math.max(1, Math.min(10 ** max - 1, cap ?? Infinity));
    const n = Math.max(0, await amount(g, 0, high, 1, { caption }));
    if (n > 0) for (const ch of String(n)) g.printChar(ch.charCodeAt(0));
    return n;
  }
  const dial = false;
  const most = 10 ** max - 1;
  const show = (n: number): void => {
    backspace(g, s.length);
    s = n === 0 ? '' : String(n);
    for (const ch of s) g.printChar(ch.charCodeAt(0));
  };
  do {
    k = await getChar(g);
    const by = dial ? (k === K.Up ? 1 : k === K.Down ? -1 : k === K.Right ? 10 : k === K.Left ? -10 : 0) : 0;
    if (by !== 0 && !/^[-+]/.test(s)) {
      show(Math.max(0, Math.min(most, (parseInt(s, 10) || 0) + by)));
    } else if (k >= 0x30 && k <= 0x39) {
      if (s.length < max) {
        s += String.fromCharCode(k);
        g.printChar(k);
      }
    } else if ((k === K.Minus || k === K.Plus) && s.length === 0) {
      s += String.fromCharCode(k);
      g.printChar(k);
    } else if ((k === K.Backspace || k === K.Left) && s.length !== 0) {
      s = s.slice(0, -1);
      backspace(g, 1);
    } else if (k === K.Escape && s.length !== 0) {
      backspace(g, s.length);
      s = '';
    }
  } while (k !== K.Enter);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ULTIMA_2d7a: pick a member with the digits or the arrows, the line
 * highlighted; Enter or Space picks, Escape gives -1, and 0 (when
 * `allowNone`) gives -2. Where `able` is given, only those it allows can
 * be chosen: the bar passes over the rest (the port's).
 */
export async function selectMember(
  g: Game,
  allowNone = false,
  able: (m: number) => boolean = () => true,
  onPick?: (m: number) => void,
  start?: number,
): Promise<number> {
  const s = g.s;
  const turn = s.mapId > 0x7f && (g.combat[s.combatTurn].flags & 0x80) !== 0 ? g.combat[s.combatTurn].who : -1;
  if (turn >= 0) markTurn(g, turn, false);
  borderTitle(g, g.t(0x5554)); // "Select:"
  const can = (m: number): boolean => m >= 0 && m < s.partySize && able(m);
  /** The next member that can be chosen from `m` in `by`'s direction, or `m` where there is none. */
  const step = (m: number, by: number): number => {
    for (let i = m + by; i >= 0 && i < s.partySize; i += by) if (can(i)) return i;
    return m;
  };
  let sel = start !== undefined && can(start) ? start : can(0) ? 0 : step(0, 1);
  let shown = -1;
  // The choice's bar: the Standard look draws the line again as one bar (frame.ts memberLine), as it marks a turn,
  // where turning its colours over would turn a name's or its mana's to their opposites; the EGA look inverts it.
  const bar = (m: number, on: boolean): void => {
    if (g.options.tileSet !== 'standard') return invertMember(g, m);
    g.picked = on ? m : -1;
    const was = g.text.current;
    drawVitals(g, false);
    g.text.select(was);
  };
  let done = false;
  do {
    if (shown !== sel) {
      bar(sel, true);
      shown = sel;
      onPick?.(sel);
    }
    let k: number;
    // (Y, where a spell asks whom it is for, is the spell's own button: it chooses, as A does.)
    do k = await getChar(g);
    while (k > 0x37 && !(k === Pad.Y && g.casting));
    if (k === Pad.Y) k = K.Enter;
    if (k > 0x30 && k < 0x37 && k - 0x31 < s.partySize) {
      if (can(k - 0x31)) sel = k - 0x31;
    } else {
      switch (k) {
        case K.Left:
        case K.Up:
          sel = step(sel, -1);
          break;
        case K.Right:
        case K.Down:
          sel = step(sel, 1);
          break;
        case 0x30:
          if (allowNone) {
            sel = -2;
            done = true;
          }
          break;
        case K.Escape:
          sel = -1;
          done = true;
          g.cancelled = true;
          break;
        case K.Enter:
        case K.Space:
          done = true;
          break;
      }
    }
    if (shown !== sel) bar(shown, false);
  } while (!done);
  if (sel > -1) bar(sel, false);
  // The Standard look marks the turn's member again (the EGA game's inversion left it for the turn's end to turn).
  if (turn >= 0 && g.options.tileSet === 'standard') markTurn(g, turn, true);
  clearBorderTitle(g);
  return sel;
}

/**
 * ULTIMA_4988: who acts: the combatant whose turn it is, the active
 * player, the only one able, or a choice. -1 (after "None!") if nobody.
 * The choice's bar starts on the member `prefer` scores highest (the
 * port's: Cast, on the one with the most spells to cast), else the first.
 */
export async function whoActs(g: Game, only: (m: number) => boolean = () => true, prefer?: (m: number) => number): Promise<number> {
  const s = g.s;
  let who = -1;
  // `only` narrows who may be chosen (Cast: those who cast at all, magicPanel.ts): the rest are passed over, the
  // active member too - one able is taken without asking, as ever.
  const fit = (m: number): boolean => (s.members[m].status === Status.Good || s.members[m].status === Status.Poisoned) && only(m);
  if (s.mapId > 0x80) {
    who = g.combat[s.combatTurn].who;
  } else if (g.bumpWho >= 0) {
    // A bumped command's member, chosen for it (bumpAct.ts): named, as the answer to "Player:" would be.
    who = g.bumpWho;
    g.bumpWho = -1;
    g.say(0xa3c4); // "Player: "
    g.print(s.members[who].name);
    if (g.text.win.x !== 0) g.printChar('\n');
  } else if (s.activeMember !== 0xff && only(s.activeMember)) {
    who = s.activeMember;
  } else {
    let able = 0;
    for (let i = 0; i !== s.partySize; i++) {
      if (fit(i)) {
        who = i;
        able++;
      }
    }
    if (able > 1) {
      let start = -1;
      if (prefer) for (let i = 0; i !== s.partySize; i++) if (fit(i) && (start < 0 || prefer(i) > prefer(start))) start = i;
      for (;;) {
        g.say(0xa3c4); // "Player: "
        who = await selectMember(g, false, fit, undefined, start < 0 ? undefined : start);
        if (who < 0) break;
        const st = s.members[who].status;
        if (st === Status.Good || st === Status.Poisoned) {
          g.print(s.members[who].name);
          if (g.text.win.x !== 0) g.printChar('\n');
          break;
        }
        g.say(0xa3ce); // "Disabled!\n\n"
      }
    }
  }
  if (who === -1)
    g.say(0xa3da); // "None!\n"
  else if (who === -2) g.printChar('\n');
  return who;
}

/** Wait for Y or N; true for Y. */
export async function yesNo(g: Game): Promise<boolean> {
  let k: number;
  do k = await getCharYN(g);
  while (k !== 0x59 && k !== 0x4e);
  return k === 0x59;
}
