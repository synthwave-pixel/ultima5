/**
 * talk.ts
 *
 * Conversation (u5d talk.c). Each NPC's script in TOWNE, DWELLING, CASTLE
 * or KEEP.TLK is a run of strings: name, description, greeting, job,
 * farewell, then keyword and answer pairs, then labelled questions. The
 * text is compressed: bytes below 0x81 are words from a dictionary in
 * DATA.OVL (D_24ea), others letters with bit 7 set, and codes 0x81-0x9f
 * are actions: the Avatar's name, pause, join the party, ask the name,
 * karma up and down, call the guards, runes on and off, pay gold, give
 * an item, and labelled questions and their answers.
 */

import { drawVitals, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { heardOfThings, noteConversation, noteSleeper } from './journal.ts';
import { getChar, getCharYN, getString, selectDirection } from './input.ts';
import { saysWord } from './cmds.ts';
import { actorTileAt } from './actors.ts';
import { scheduleSlot } from './npc.ts';
import { T } from './tiles.ts';
import { callGuards, npcOfActor, removeNpc, setNpcKilled, begone } from './town.ts';
import { tileAt } from './world.ts';
import { merchant } from './shops.ts';
import { RUNE_INK, runeKind, runesRead } from './runeWords.ts';
import { scriptSpeech } from './words.ts';
import { heardPlaces } from './placeNames.ts';

const inc = (v: number, n: number, max: number): number => (v + n < max ? v + n : max);
const dec = (v: number, n: number): number => (v > n ? v - n : 0);

/** The conversation's state, kept between conversations as the original's globals were. */
export class TalkState {
  /** The line of the say menu last chosen (its mark in the record of what has been heard), or null if typed. */
  chosen: number | string | null = null;
  /** Wrong answers already given to each riddle of this conversation, by the question's label: the menu greys them. */
  tried = new Map<number, Set<string>>();
  /** D_4aee: an action waiting for its argument bytes. */
  pending = 0;
  /** D_4aef: arguments read so far. */
  argCount = 0;
  /** D_4af0: 0xff for letters, 0x7f while runes are on. */
  runeMask = 0xff;
  /** D_4af1, D_bce4: the word being built, up to 16 bytes. */
  word: number[] = [];
  /** D_4af2: answering a question (keywords then say nothing of name or job). */
  responding = 0;
  /** D_4af3: the column the last word ended at. */
  lastX = 0;
  /** D_4af4: the last letter printed. */
  lastChar = 0;
  /** D_4af5: a dictionary word was just printed (a space goes before a letter). */
  afterWord = 0;
  /** D_bce0: the action's arguments. */
  args = [0, 0, 0, 0];
  /** D_bcdc: the NPC talking. */
  npc = 0;
  /** D_bcf4: the current question's label. */
  label = 0;
  /** D_bcf6: which keyword answered. */
  keyword = 0;
  /** D_bcf8: what the player typed. */
  typed = '';
  /** D_b21e, D_bcde: the NPC's script and the reading position in it. */
  script = new Uint8Array(0x400);
  at = 0;
  /**
   * The words of this townsman's own conversation (words.ts scriptSpeech), for the Say list's labels: their own
   * script only, to where the next one in the file begins - the buffer above reads on into it.
   */
  own = new Set<string>();
  /** This conversation's key in keywordLabels.ts: its file and number ("0:1:"), a keyword after it. */
  labels = '';
  /** The keys held before Jeremy's gift of them, for his asking to be paid after it (payGold); null with none given. */
  keysBefore: number | null = null;
}

/**
 * Jeremy, Yew's chef (TOWNE.TLK 20): "Have five!" - five keys given before he asks 50 gold for them, kept whatever the
 * answer (1988's order). The port's: one who cannot pay keeps no more than five, so a broke prisoner still has the
 * way out of Yew's cell, but asking again and again is no longer a store of keys (issue #4).
 */
const JEREMY = '0:20:';
const BROKE_KEYS = 5;

export type Talk = { g: Game; t: TalkState; /** Being asked their name. */ naming?: boolean };

/**
 * The port's corrections to the scripts as the DOS files have them, each for one NPC (by their name, the script's
 * first word), a run of bytes put in place of another. Thrud of Windemere offers "the Jeweled Sword and Shield" for
 * the Resistance's password, and his gifts are items 0x08 (the Jewel Shield) and 0x1c - the Crossbow, where the
 * Jeweled Sword is 0x28: 28 written in decimal for a number meant in hex. Guides to the game, the Commodore 64's
 * among them, have him give the sword.
 */
const SCRIPT_FIXES: { who: string; was: number[]; now: number[] }[] = [
  { who: 'Thrud', was: [0x86, 0x08, 0x86, 0x1c], now: [0x86, 0x08, 0x86, 0x28] },
];

/** The NPC's script, from the settlement's TLK file (TALK_127e), with the port's corrections (SCRIPT_FIXES). */
export function loadScript(g: Game, npcTalk: number): void {
  const t = g.talk;
  const file = g.data.files.get(['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'][(g.s.mapId - 1) >> 3]);
  const count = file[0] | (file[1] << 8);
  let at = 2;
  for (let i = 1; (file[at] | (file[at + 1] << 8)) !== npcTalk && i <= count; i++) at += 4;
  const offset = file[at + 2] | (file[at + 3] << 8);
  t.script.fill(0);
  t.script.set(file.subarray(offset, offset + 0x400));
  let end = file.length;
  for (let i = 0; i < count; i++) {
    const o = file[4 + i * 4] | (file[5 + i * 4] << 8);
    if (o > offset && o < end) end = o;
  }
  t.labels = `${(g.s.mapId - 1) >> 3}:${npcTalk}:`;
  t.own = new Set(scriptSpeech(file.subarray(offset, Math.min(end, offset + 0x400)), g.data.table(0x24ea, 0x80)));
  let name = '';
  for (let i = 0; t.script[i] >= 0xa0; i++) name += String.fromCharCode(t.script[i] & 0x7f);
  for (const fix of SCRIPT_FIXES) {
    if (name !== fix.who) continue;
    for (let i = 0; i + fix.was.length <= t.script.length; i++)
      if (fix.was.every((b, k) => t.script[i + k] === b)) t.script.set(fix.now, i);
  }
}

// --- Printing words ---------------------------------------------------------------------

/** TALK_04e2: print the word built so far (runes where bit 7 is clear), wrapping at the window's width. */
function flushWord({ g, t }: Talk): void {
  if (t.word.length !== 0) {
    // A word in runes reads into English in the colour of its kind (the Standard look's): a mantra blue, a dungeon's
    // Word red, the rest grey (runeWords.ts).
    const runes = runesRead(t.word);
    if (runes) g.p.fx.readInk?.(RUNE_INK[runeKind(runes)]);
    for (const b of t.word) {
      g.text.font = (b & 0x80) === 0 ? 1 : 0;
      const c = b & 0x7f;
      if (g.text.win.x !== 0 || c !== 0x20) {
        if (t.lastX < 0xf || c !== 0x0a) {
          if (c !== 0x0a) t.lastX = g.text.win.x;
          g.printChar(c);
        } else if (c === 0x0a) {
          t.lastX = 0;
          g.gap();
        }
      } else g.gap(); // a space the line's end has swallowed still parts two words, for whoever is listening
    }
    t.word = [];
    g.text.font = 0;
    if (runes) g.p.fx.readInk?.(null);
  }
}

/** TALK_0574: add a letter to the word; a space or newline ends it (breaking the line if it will not fit). */
function addLetter(k: Talk, b: number): void {
  const { g, t } = k;
  if (t.word.length !== 0x10) {
    t.word.push(b);
    if (b !== 0x8a && b !== 0xa0) return;
    if (g.text.win.x + t.word.length >= 0x12) g.printChar('\n');
  }
  flushWord(k);
}

const printCr = (k: Talk): Promise<number> => processChar(k, 0x80 | 0x0d);
const printQuote = (k: Talk): Promise<number> => processChar(k, 0x80 | 0x22);

// --- Walking the script -------------------------------------------------------------------

/** TALK_0728: skip to after `a` (true) or `b` (false). */
function skip({ t }: Talk, a: number, b: number): boolean {
  for (;;) {
    const c = t.script[t.at++];
    if (c === a) return true;
    if (c === b) return false;
    if (t.at >= t.script.length) return false;
  }
}

/** TALK_075a: to the start of string `n`. */
function seek(k: Talk, n: number): void {
  k.t.at = 0;
  for (; n !== 0; n--) skip(k, 0, 0x90);
}

/** TALK_0788: say the string from here; true if the conversation ends. */
async function speak(k: Talk): Promise<boolean> {
  const t = k.t;
  while (t.script[t.at] !== 0) {
    if ((await processChar(k, t.script[t.at++])) !== 0) return true;
  }
  return false;
}

async function speakNth(k: Talk, n: number): Promise<boolean> {
  seek(k, n);
  return speak(k);
}

/** TALK_07be: the second of two alternatives. */
async function speakAlternative(k: Talk): Promise<boolean> {
  const t = k.t;
  t.at++;
  while (t.script[t.at] === 0) t.at++;
  while (t.script[t.at++] !== 0);
  return speak(k);
}

/** TALK_07e4. */
async function avatarName(k: Talk): Promise<void> {
  for (const c of k.g.s.members[0].name) await processChar(k, c.charCodeAt(0) | 0x80);
}

/** TALK_0000: compare, ignoring case and bit 7. */
function sameName(a: number[], b: number[]): boolean {
  for (let i = 0; ; i++) {
    const x = a[i] & 0x7f;
    const y = b[i] & 0x7f;
    const ux = x >= 0x61 && x <= 0x7a ? x - 0x20 : x;
    const uy = y >= 0x61 && y <= 0x7a ? y - 0x20 : y;
    if (ux !== uy) return false;
    if ((a[i + 1] ?? 0) === 0 && (b[i + 1] ?? 0) === 0) return true;
  }
}

/** TALK_080a: the NPC joins the party (found in the roster by the first three letters of its name). */
async function join(k: Talk): Promise<number> {
  const { g, t } = k;
  const s = g.s;
  const back = t.at;
  if (s.partySize === 6) {
    await getChar(g);
    g.say(0x9348); // "\"Thou hast no room for me in thy party! "
    g.say(0x9372); // "Seek me again if one of thy members doth leave\nthee."
    return 0;
  }
  seek(k, 0);
  const name = [...t.script.subarray(t.at, t.at + 3), 0];
  t.at += 3;
  let i = 0xf;
  for (;;) {
    const roster = [...s.members[i].b.subarray(0, 3), 0];
    if (sameName(name, roster)) break;
    if (--i === 0) {
      addLetter(k, 0x22);
      addLetter(k, 10);
      g.say(0x93a8); // "\nSystem Error -\nNo Match!"
      t.at = back;
      return 1;
    }
  }
  s.members[i].mapId = 0;
  const tmp = s.members[i].b.slice();
  s.members[i].b.set(s.members[s.partySize].b);
  s.members[s.partySize].b.set(tmp);
  s.partySize++;
  setNpcKilled(g, t.npc);
  removeNpc(g, t.npc);
  drawVitals(g);
  flushWord(k);
  t.at = back;
  return 1;
}

/** TALK_05b6: the NPC asks for gold (three digits); a beggar given to after a while raises karma. */
async function payGold(k: Talk): Promise<number> {
  const { g, t } = k;
  const s = g.s;
  const amount = (t.args[0] & 0x7f) * 100 + (t.args[1] & 0x7f) * 10 + (t.args[2] & 0x7f) - 0x14d0;
  if (s.gold >= amount) {
    s.gold -= amount;
    t.keysBefore = null;
    drawVitals(g);
    if ((s.actors[s.npcs[t.npc].actor].tile & 0xfc) === 0x6c && s.turn >= 100) {
      s.turn = 0;
      s.karma = inc(s.karma, 1, 99);
      if (s.gold === 0) s.karma = inc(s.karma, 2, 99);
    }
    return 0;
  }
  // Jeremy's keys, given already: one who cannot pay for them keeps up to five of all held (JEREMY).
  if (t.keysBefore !== null) s.keys = Math.max(t.keysBefore, Math.min(BROKE_KEYS, s.keys));
  t.keysBefore = null;
  t.word = [];
  g.printChar('"');
  g.say(0x9328); // "Thou hast not enough gold!"
  g.printChar('"');
  g.say(0x9344); // "\n\n"
  t.pending = t.argCount = 0;
  return interest(k);
}

/** TALK_0682: a gift: equipment below 0x40, else food, gold, keys, gems, torches, grapple, carpet, sextant, spyglass, badge, skull key. */
function give(g: Game, item: number): void {
  const s = g.s;
  if (item < 0x40) {
    s.equipment[item] = inc(s.equipment[item], 1, 99);
    return;
  }
  switch (item) {
    case 0x41:
      s.food = inc(s.food, 1, 9999);
      drawVitals(g);
      break;
    case 0x42:
      s.gold = inc(s.gold, 1, 9999);
      drawVitals(g);
      break;
    case 0x43:
      s.keys = inc(s.keys, 1, 99);
      break;
    case 0x44:
      s.gems = inc(s.gems, 1, 99);
      break;
    case 0x45:
      s.torches = inc(s.torches, 1, 99);
      break;
    case 0x46:
      s.grapple = inc(s.grapple, 1, 99);
      break;
    case 0x47:
      s.carpets = inc(s.carpets, 1, 99);
      break;
    case 0x48:
      s.sextants = 0xff;
      break;
    case 0x49:
      s.spyglasses = 0xff;
      break;
    case 0x4a:
      s.blackBadge = 0xff;
      break;
    case 0x4b:
      s.skullKeys = inc(s.skullKeys, 1, 99);
      break;
  }
}

// --- Keywords, questions and answers --------------------------------------------------------

/** The typed words match a keyword (TALK_0b04's test: at the start, or after a space). */
function matches(word: string, typed: string): boolean {
  return saysWord(word, typed);
}

/** TALK_099a: to keyword `n`'s string; false if there are no more. */
function toKeyword(k: Talk, n: number): boolean {
  k.t.at = 0;
  for (let i = n * 2 + 5; i !== 0; i--) if (!skip(k, 0, 0x90)) return false;
  return true;
}

/** Read a keyword string of the script (letters with bit 7 cleared) at the reading position. */
function scriptWord({ t }: Talk): string {
  let s = '';
  for (let i = t.at; t.script[i] !== 0 && i < t.script.length; i++) s += String.fromCharCode(t.script[i] & 0x7f);
  return s;
}

/** TALK_09d8: find the NPC's own keyword that was typed. */
function findKeyword(k: Talk): boolean {
  const t = k.t;
  t.keyword = 0;
  for (;;) {
    if (!toKeyword(k, t.keyword)) return false;
    if (matches(scriptWord(k), t.typed)) return true;
    t.at++;
    t.keyword++;
  }
}

/**
 * TALK_0a2c: print what is waiting, then read the player's words. Where
 * the keyboard is read as a controller there is no comfortable way to
 * type, so the player is offered the words they have learnt that this
 * townsman answers (menu.ts sayMenu), and nothing they have not - a
 * word read in a guide is added under Cheats (Add word).
 */
async function readWords(k: Talk): Promise<void> {
  flushWord(k);
  const { g, t } = k;
  t.chosen = null;
  if (g.options.input !== 'controller') {
    t.typed = await getString(g, 0xf);
    return;
  }
  // What has been said so far in this conversation is learnt before the choice is offered, so that a word a
  // townsman has just let fall can be asked about while still standing before them.
  g.words.learn(g, g.recording ?? '');
  const { answerMenu, sayMenu } = await import('./menu.ts');
  // Asked a question, the player answers it: yes, no, or a word the question is listening for that they have heard
  // somewhere. Asked their name, they give it. Otherwise it is their turn to ask.
  if (k.naming) t.typed = await answerMenu(g, [], g.s.members[0].name);
  else if (t.responding !== 0) {
    // A question that asks itself again on a wrong answer, and listens for something the player has not heard, is
    // a riddle: answered from a list of its answer's letters in other orders, or walked away from.
    const expected = answersOf(k);
    const unheard = expected.some((stub) => !/^(y|ye|yes|n|no)$/i.test(stub) && !g.words.forStub(stub));
    if (unheard && asksAgain(k)) {
      const tried = t.tried.get(t.label) ?? new Set<string>();
      t.tried.set(t.label, tried);
      t.typed = await answerMenu(g, expected, undefined, { tried });
    } else t.typed = await answerMenu(g, expected, undefined, undefined, asksAgain(k));
  } else t.typed = await sayMenu(g, keywordsOf(k), t.own);
  if (t.typed !== '\x1b') g.print(t.typed);
  g.printChar('\n');
}

/** A keyword the NPC answers, and where its answer leads (`dest`): keywords with the same one say the same. */
export interface Keyword {
  stub: string;
  dest: string;
}

/**
 * Every keyword this NPC answers, in the order the script keeps them, each with where its answer leads: the answer
 * itself, or - where the answer is only "the next one's" (0x87, TALK_07be), as a run of words sharing one reply is
 * written - the answer it passes on to, followed to the end of the run.
 */
export function keywordsOf(k: Talk): Keyword[] {
  const t = k.t;
  const was = t.at;
  const stubs: string[] = [];
  const answers: string[] = [];
  for (let n = 0; toKeyword(k, n); n++) {
    const word = scriptWord(k);
    if (!word || word.charCodeAt(0) < 0x20) break;
    stubs.push(word);
    skip(k, 0, 0x90);
    let answer = '';
    for (let i = t.at; i < t.script.length && t.script[i] !== 0; i++) answer += String.fromCharCode(t.script[i]);
    answers.push(answer);
  }
  t.at = was;
  const PASS_ON = String.fromCharCode(0x87);
  return stubs.map((stub, n) => {
    let to = n;
    while (answers[to] === PASS_ON && to + 1 < answers.length) to++;
    return { stub, dest: answers[to] };
  });
}

/** TALK_0a3c: the farewell. */
async function farewell(k: Talk): Promise<number> {
  await printQuote(k);
  if (!(await speakNth(k, 4))) {
    await printQuote(k);
    await printCr(k);
  }
  return 1;
}

/** TALK_0a54: the standard keywords: NAME, LOOK/JOB... (0-4 by the table D_4aa8), and swearing. */
async function standardKeyword(k: Talk, which: number): Promise<number> {
  const { g, t } = k;
  switch (which) {
    case 0:
      if (t.responding !== 0) return 2;
      g.words.markHeard(g.s.mapId, t.npc, 'name');
      g.say(0x93c2); // "\"My name is "
      if (await speakNth(k, 0)) return 1;
      await printQuote(k);
      await printCr(k);
      await printCr(k);
      return 0;
    case 1:
    case 2:
      if (t.responding !== 0) return 2;
      g.words.markHeard(g.s.mapId, t.npc, 'job');
      await printQuote(k);
      if (await speakNth(k, 3)) return 1;
      await printQuote(k);
      await printCr(k);
      await printCr(k);
      return 0;
    case 3:
    case 4:
      if (t.responding !== 0) return 2;
      return farewell(k);
    default:
      g.say(0x93d0); // "\"With language like that, how did you become an Avatar?"
      await printQuote(k);
      await printCr(k);
      await printCr(k);
      for (let i = 0; i < 0x1c; i++) {
        updateFrame(g);
        if (g.p.pollKey() !== 0) break;
        await g.p.sleep(1000 / 18.2);
      }
      g.p.flushKeys();
      return 0;
  }
}

/** Try the standard keywords (D_4aa8, 34 of them) against what was typed; -1 if none. */
async function tryStandard(k: Talk): Promise<number> {
  const words = k.g.data.table(0x4aa8, 0x22);
  let result = -1;
  for (let i = 0; i < 0x22; i++) {
    if (matches(words[i], k.t.typed)) {
      result = await standardKeyword(k, i);
      if (result === 0 || result === 1) return result;
    }
  }
  return result;
}

/** TALK_0b04: "Your interest?" until the player says nothing (bye). */
async function interest(k: Talk): Promise<number> {
  const { g, t } = k;
  for (;;) {
    t.responding = 0;
    t.keysBefore = null;
    g.say(0x9408); // "Your interest?\n:"
    await readWords(k);
    if (t.typed.length === 0) {
      g.say(0x941a); // "BYE\n\n"
      return farewell(k);
    }
    await printCr(k);
    await printCr(k);
    const r = await tryStandard(k);
    if (r === 1) return 1;
    if (r !== 0) {
      if (!findKeyword(k)) {
        // Offered and not answered (it can happen where a keyword needs a flag): asked, all the same.
        if (t.chosen !== null) g.words.markHeard(g.s.mapId, t.npc, t.chosen);
        g.say(0x9420); // "\"I cannot help thee with that."
        await printQuote(k);
        await printCr(k);
        await printCr(k);
      } else {
        // This one's answer to that word has now been heard: the say menu greys it - and the line that was chosen,
        // which is another where two of their keywords begin alike and the first of them answers for both.
        g.words.markHeard(g.s.mapId, t.npc, t.keyword);
        if (t.chosen !== null) g.words.markHeard(g.s.mapId, t.npc, t.chosen);
        await printQuote(k);
        if (await speakNth(k, t.keyword * 2 + 6)) return 1;
        await printQuote(k);
        await printCr(k);
        await printCr(k);
      }
    }
  }
}

/** TALK_093a: to the labelled question and ask it. */
async function askLabel(k: Talk): Promise<boolean> {
  const t = k.t;
  t.at = 0;
  while (t.script[t.at] !== t.label) skip(k, 0x90, 0x9f);
  t.at++;
  return speak(k);
}

/** TALK_0bd4: find the question's expected answer among its answers. */
function findAnswer(k: Talk): boolean {
  const t = k.t;
  t.at = 0;
  while (t.script[t.at] !== t.label) skip(k, 0x90, 0x9f);
  skip(k, 0, 0x9f);
  skip(k, 0, 0x9f);
  for (;;) {
    if (matches(scriptWord(k), t.typed)) return true;
    if (!skip(k, 0, 0x90)) return false;
    if (!skip(k, 0, 0x90)) return false;
  }
}

/** Whether the question at the current label is asked again when answered wrongly: its reply to any other answer ends by calling its own label. */
function asksAgain(k: Talk): boolean {
  const t = k.t;
  const was = t.at;
  t.at = 0;
  while (t.at < t.script.length && t.script[t.at] !== t.label) skip(k, 0x90, 0x9f);
  skip(k, 0, 0x9f); // past the question, to the reply to any other answer
  let again = false;
  for (let i = t.at; i < t.script.length && t.script[i] !== 0; i++) if (t.script[i] === t.label) again = true;
  t.at = was;
  return again;
}

/** The answers the question at the current label is looking for (its script's own list), as written there. */
function answersOf(k: Talk): string[] {
  const t = k.t;
  const was = t.at;
  const out: string[] = [];
  t.at = 0;
  while (t.at < t.script.length && t.script[t.at] !== t.label) skip(k, 0x90, 0x9f);
  skip(k, 0, 0x9f);
  skip(k, 0, 0x9f);
  for (let n = 0; n < 12 && t.at < t.script.length; n++) {
    const word = scriptWord(k);
    if (!word || word.charCodeAt(0) < 0x20) break;
    out.push(word);
    if (!skip(k, 0, 0x90) || !skip(k, 0, 0x90)) break;
  }
  t.at = was;
  return out;
}

/** TALK_0960: the reply to the matched answer. */
async function replyToAnswer(k: Talk): Promise<boolean> {
  skip(k, 0, 0x90);
  return speak(k);
}

/** TALK_096e: the reply to any other answer. */
async function replyOtherwise(k: Talk): Promise<boolean> {
  const t = k.t;
  t.at = 0;
  while (t.script[t.at] !== t.label) skip(k, 0x90, 0x9f);
  skip(k, 0, 0x9f);
  return speak(k);
}

/** TALK_0c5c: a question: its answer, the reply, then back to "Your interest?". */
async function question(k: Talk): Promise<number> {
  const { g, t } = k;
  let r: number;
  do {
    await printQuote(k);
    if (await askLabel(k)) return 1;
    await printQuote(k);
    do {
      await printCr(k);
      await printCr(k);
      t.responding = 0xff;
      g.say(0x9440); // "You respond-\n:"
      await readWords(k);
      // Walked away from a riddle (menu.ts LEAVE): the conversation ends, as at a farewell.
      if (t.typed === '\x1b') {
        t.typed = '';
        t.responding = 0;
        await printCr(k);
        return farewell(k);
      }
      if (t.typed.length === 0) g.say(0x9450); // "\n\n\"What didst thou say?"
    } while (t.typed.length === 0);
    await printCr(k);
    await printCr(k);
    r = await tryStandard(k);
    if (r === 1) return 1;
  } while (r === 0);
  await printQuote(k);
  const ended = findAnswer(k) ? await replyToAnswer(k) : await replyOtherwise(k);
  if (!ended) {
    await printQuote(k);
    await printCr(k);
    await printCr(k);
    return interest(k);
  }
  return 1;
}

/** TALK_0d42, TALK_0d7a: the NPC knows the Avatar's name. */
function setMet(g: Game, npc: number): void {
  g.s.npcMet[(g.s.mapId - 1) * 4 + (npc >> 3)] |= 1 << (npc & 7);
}
function hasMet(g: Game, npc: number): boolean {
  return (g.s.npcMet[(g.s.mapId - 1) * 4 + (npc >> 3)] & (1 << (npc & 7))) !== 0;
}

/** TALK_0dbe: the argument bytes of a pending action. */
async function actionArg(k: Talk, b: number): Promise<number> {
  const { g, t } = k;
  switch (t.pending) {
    case 0x85:
      t.args[t.argCount++] = b;
      if (t.argCount !== 3) return 0;
      if ((await payGold(k)) !== 0) return 1;
      t.pending = t.argCount = 0;
      return 0;
    case 0x86:
      if ((b & 0x7f) === 0x43 && t.labels === JEREMY && t.keysBefore === null) t.keysBefore = g.s.keys;
      give(g, b & 0x7f);
      t.pending = t.argCount = 0;
      return 0;
    case 0x8c:
      t.pending = t.argCount = 0;
      if (!hasMet(g, t.npc)) return 0;
      if (b === 0xff) return interest(k);
      t.label = b;
      return question(k);
    case 0xfe:
      t.args[t.argCount++] = b;
      if (t.argCount !== 2) return 0;
      t.pending = t.argCount = 0;
      if (g.s.karma < t.args[0]) return 0;
      t.label = t.args[1];
      return question(k);
    default:
      t.pending = t.argCount = 0;
      return 0;
  }
}

/** TALK_0e78: "What is thy name?" — a party member's name (first four letters) makes a friend. */
async function askName(k: Talk): Promise<void> {
  const { g, t } = k;
  await printQuote(k);
  flushWord(k);
  g.say(0x9468); // "What is thy name?\"\n"
  g.say(0x947c); // "\nYou respond-\n:"
  k.naming = true;
  try {
    await readWords(k);
  } finally {
    k.naming = false;
  }
  t.pending = t.argCount = 0;
  if (t.typed.length === 0) {
    g.say(0x948c); // "\n\n\"If you say so..."
    return;
  }
  for (let i = 0; i < g.s.partySize; i++) {
    if (matches(g.s.members[i].name.slice(0, 4), t.typed)) {
      setMet(g, t.npc);
      g.say(0x94a0); // "\n\n\"A pleasure!"
      return;
    }
  }
  g.say(0x94b0); // "\n\n\"If you say so..."
}

/** TALK_0f32_ProcessChar: one byte of script; nonzero ends the conversation. */
async function processChar(k: Talk, b: number): Promise<number> {
  const { g, t } = k;
  if (t.pending !== 0) return actionArg(k, b);
  t.argCount = 0;
  if (b === 0xa2 && t.lastChar === 0xa2) return 0;
  switch (b) {
    case 0x81:
      await avatarName(k);
      break;
    case 0x82:
      return 1;
    case 0x83:
      for (let i = 0; i < 0x1c; i++) {
        updateFrame(g);
        if (g.p.pollKey() !== 0) break;
        await g.p.sleep(1000 / 18.2);
      }
      g.p.flushKeys();
      return 0;
    case 0x84:
      return join(k);
    case 0x87: {
      const back = t.at;
      if (await speakAlternative(k)) return 1;
      t.at = back;
      return 0;
    }
    case 0x88:
      await askName(k);
      return 0;
    case 0x89:
      g.s.karma = inc(g.s.karma, 1, 99);
      return 0;
    case 0x8a:
      g.s.karma = dec(g.s.karma, 1);
      return 0;
    case 0x8b:
      callGuards(g);
      return 0;
    case 0x8e:
      t.runeMask ^= 0x80;
      return 0;
    case 0xff:
      flushWord(k);
      return interest(k);
    case 0x8f:
      await getChar(g);
      return 0;
    case 0xfe:
    case 0x85:
    case 0x86:
    case 0x8c:
      t.pending = b;
      return 0;
    default:
      if (b >= 0x91 && b <= 0x9f) {
        t.label = b;
        return question(k);
      }
      if (b < 0x81) {
        addLetter(k, 0xa0);
        const word = g.data.table(0x24ea, 0x80)[b - 1] ?? '';
        for (const c of word) addLetter(k, c.charCodeAt(0) | 0x80);
        if (word.length === 0) {
          addLetter(k, b);
          return 0;
        }
        t.afterWord = 1;
      } else {
        b |= 0x80;
        if (b === 0x8d) b = 0x8a;
        b &= t.runeMask;
        t.lastChar = b;
        if (t.afterWord !== 0) addLetter(k, 0xa0);
        addLetter(k, b);
        t.afterWord = 0;
      }
      break;
  }
  return 0;
}

/** TALK_111c: "You see ..." and a greeting: by name if the NPC knows the Avatar, else perhaps its own name. */
async function greet(k: Talk): Promise<number> {
  const { g, t } = k;
  g.say(0x94c4); // "You see "
  if (await speakNth(k, 1)) return 1;
  await printCr(k);
  await printCr(k);
  if (!hasMet(g, t.npc)) {
    if (g.random(0, 1) !== 0) {
      g.say(0x94ce); // "\"I am called "
      if (await speakNth(k, 0)) return 1;
      await printQuote(k);
      await printCr(k);
      await printCr(k);
    }
  } else {
    await printQuote(k);
    if (await speakNth(k, 2)) return 1;
    await printQuote(k);
    await printCr(k);
    await printCr(k);
  }
  return 0;
}

/** TALK_1180: where a Shadowlord of Falsehood haunts, something goes missing while the party talks. */
async function pickpocket(g: Game): Promise<void> {
  const s = g.s;
  if (s.townAir !== 0) return;
  g.say(0x94dc); // "\nSomething was stolen!\n"
  if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
  if ((s.keys | s.gems | s.torches) !== 0) {
    for (;;) {
      switch (g.random(0, 2)) {
        case 0:
          if (s.keys !== 0) {
            s.keys--;
            return;
          }
          break;
        case 1:
          if (s.gems !== 0) {
            s.gems--;
            return;
          }
          break;
        case 2:
          if (s.torches !== 0) {
            s.torches--;
            return;
          }
          break;
      }
    }
  }
  for (let i = 0x2f; i >= 0; i--) {
    if (s.equipment[i] !== 0) {
      s.equipment[i]--;
      return;
    }
  }
  for (let i = 7; i >= 0; i--) {
    if (s.potions[i] !== 0) {
      s.potions[i]--;
      return;
    }
  }
  for (let i = 7; i >= 0; i--) {
    if (s.scrolls[i] !== 0) {
      s.scrolls[i]--;
      return;
    }
  }
  s.gold = dec(s.gold, g.random(1, 0xf));
  drawVitals(g);
}

/**
 * The string of `script` (a TLK file's script, as loadScript loads it) from byte `at`, spoken as a conversation says
 * it - its words, letters and runes - for the runes page. It stops at the string's end, and at an action that would
 * ask, join, pay, give or end: all but the Avatar's name, a pause, a wait for a key, runes on and off and a new line.
 */
export async function recite(g: Game, script: Uint8Array, at: number): Promise<void> {
  const k: Talk = { g, t: g.talk };
  const t = g.talk;
  t.script.fill(0);
  t.script.set(script.subarray(0, t.script.length));
  Object.assign(t, { at, runeMask: 0xff, word: [], pending: 0, afterWord: 0, lastX: g.text.win.x, lastChar: 0 });
  // A question's label before its answer, which a conversation reaches the answer by.
  while (t.script[t.at] >= 0x90 && t.script[t.at] <= 0x9f) t.at++;
  const said = new Set([0x81, 0x83, 0x8d, 0x8e, 0x8f]);
  while (t.at < t.script.length && t.script[t.at] !== 0) {
    const b = t.script[t.at++];
    if ((b >= 0x81 && b <= 0x9f && !said.has(b)) || b >= 0xfe) break; // 0xfe, 0xff: an argument, the player's turn
    if ((await processChar(k, b)) !== 0) break;
  }
  flushWord(k);
  g.text.font = 0;
}

/** Whom a script is for: its first string, the name ("Sindar... I think" as Sindar), for the journal's clues. */
function scriptName(script: Uint8Array): string {
  let name = '';
  for (let i = 0; i < script.length && script[i] !== 0; i++) name += String.fromCharCode(script[i] & 0x7f);
  return /^[A-Za-z][A-Za-z' ]*[A-Za-z]/.exec(name)?.[0] ?? '';
}

/** TALK_127e: a conversation with the NPC whose script is number `n`. */
async function conversation(g: Game, n: number): Promise<void> {
  const k: Talk = { g, t: g.talk };
  loadScript(g, n);
  g.talk.tried.clear();
  g.recording = '';
  g.recordWindow = g.text.current; // what the borders print while they talk is nobody's words
  try {
    if ((await greet(k)) === 0 && (await interest(k)) === 0) await farewell(k);
  } finally {
    const heard = g.recording;
    g.recording = null;
    g.recordWindow = null;
    g.words.learn(g, heard ?? '');
    heardPlaces(g, heard ?? ''); // the places named, for the map (the port's)
    heardOfThings(g, heard ?? '', scriptName(g.talk.script)); // the journal's mysteries
    noteConversation(g, heard, scriptName(g.talk.script));
  }
  await pickpocket(g);
}

// --- Who answers -------------------------------------------------------------------------------

/** TALK_00ac. */
async function askPay(g: Game): Promise<boolean> {
  g.say(0x9052); // "\n\nDost thou pay?\n\n:"
  for (;;) {
    const c = await getCharYN(g);
    if (c === 0x59) {
      g.say(0x9066); // "Yes\n"
      return true;
    }
    if (c === 0x4e) break;
  }
  g.say(0x906c); // "No!\n"
  return false;
}

/** TALK_01e2: the guards' demands: Trinsic's charity, Blackthorn's tribute, the password at his palace. Nonzero means arrest. */
async function guardDemands(g: Game): Promise<number> {
  const s = g.s;
  if (s.mapId !== 0x12) {
    if (s.mapId === 5) {
      g.printChar('"');
      g.say(0x90a2); // "Thou wilt give\nhalf thy gold to\ncharity!"
      g.printChar('"');
      if (!(await askPay(g))) return 1;
      s.gold = Math.trunc(s.gold / 2);
      drawVitals(g);
      return 0;
    }
    let tribute = 0;
    for (let i = 0; i < s.partySize; i++) if (s.members[i].status !== 0x44) tribute += 10;
    g.say(0x90cc); // "A guard demands\na "
    g.printNumber(tribute, 2, ' ');
    g.say(0x90e0); // " gp tribute\nto Blackthorn!"
    if (!(await askPay(g))) return 1;
    if (s.gold >= tribute) {
      s.gold -= tribute;
      drawVitals(g);
      return 0;
    }
    return 1;
  }
  if (g.regalia === 0x1d) {
    // the Black Badge worn
    g.printChar('"');
    g.say(0x90fc); // "Give now the\npassword, bearer\nof the Badge!"
    g.printChar('"');
    g.say(0x9128); // "\n\nYour response?\n"
    const { askWord } = await import('./menu.ts');
    const word = (await askWord(g, 0xe, 'Password', [g.t(0x4a9a)], true)).toUpperCase().slice(0, 4);
    g.printChar('\n');
    if (word === g.t(0x4a9a).toUpperCase()) {
      g.printChar('\n');
      g.printChar('"');
      g.say(0x913a); // "Pass, friend!"
      g.printChar('"');
      g.printChar('\n');
      return 0;
    }
  }
  return 1;
}

/** TALK_031e_TalkToNpc: nonzero if the talk ends in an arrest. */
export async function talkToNpc(g: Game, npc: number): Promise<number> {
  const s = g.s;
  g.printChar('\n');
  g.talk.npc = npc;
  const me = s.npcs[npc];
  const sch = s.schedules[npc];
  if (sch.type(me.fe) === 4) {
    sch.setType(me.fe, 1);
  } else if (s.actors[me.actor].tile === 0x70 && ((me.fe & 1) === 0 || me.fa === 0)) {
    g.say(0x9148); // "The guard offers\nno response!\n"
    return 0;
  }
  const talk = me.fa;
  if (talk === 0) {
    g.say(0x9168); // "No response!\n"
    return 0;
  }
  if (talk < 0x80) {
    await conversation(g, talk);
    return 0;
  }
  if (talk === 0xfd) {
    g.printChar('"');
    g.say(0x9176); // "Don't hurt me!\nPlease go away!"
    g.printChar('"');
    g.printChar('\n');
    return 0;
  }
  if (talk === 0xfe) {
    await begone(g, npc);
    return 0;
  }
  if (talk === 0xff) return guardDemands(g);
  if ((me.fe & 1) !== 0 && (scheduleSlot(g, npc, s.hour) & 1) !== 0) {
    await merchant(g, talk);
    return 0;
  }
  g.say(0x9196); // "A merchant says:\n\"Come see me at\nmy shoppe, "
  g.say(0x91c4); // "when\nit's open!\"\n"
  return 0;
}

/** TALK_0054: a counter or table between the party and whom it talks to. */
export function counter(g: Game, x: number, y: number): boolean {
  switch (tileAt(g, x, y)) {
    case T.T29:
    case T.Table94:
    case T.Table95:
    case T.Table96:
    case T.T97:
    case T.T98:
    case T.T99:
    case T.Table9A:
    case T.Table9B:
    case T.Table9C:
    case T.Desk:
    case T.AE:
    case T.DoorBA:
    case T.DoorBB:
    case T.TableBE:
    case T.CA:
    case T.CB:
      return true;
  }
  return false;
}

/** TALK_041c_TalkCmd: talk to whoever is that way (across a counter too). */
export async function talkCommand(g: Game): Promise<number> {
  const s = g.s;
  if (!(await selectDirection(g))) return 0;
  const dx = s.dx;
  const dy = s.dy;
  let x = dx + s.x;
  let y = dy + s.y;
  if (actorTileAt(g, x, y, s.level) === 0 && counter(g, x, y)) {
    x += dx;
    y += dy;
  }
  if (actorTileAt(g, x, y, s.level) === 0) {
    g.say(0x91d6); // "\nNobody's here!\n"
    return 0;
  }
  const npc = npcOfActor(g, s.dx);
  if (npc < 0) {
    // Someone there who is not a townsperson (a creature, a corpse): the original read before its NPC table here.
    g.say(0x9168); // "No response!\n"
    return 0;
  }
  switch (tileAt(g, x, y)) {
    case T.Bed: {
      g.say(0x91e8); // "\n"Zzzzzz..."\n"
      // When this one is up, from their own day: the hours their place is not this bed.
      const sch = s.schedules[npc];
      const up: number[] = [];
      for (let h = 0; h < 24; h++) {
        const k = scheduleSlot(g, npc, h);
        if (sch.x(k) !== x || sch.y(k) !== y || sch.z(k) !== s.level) up.push(h);
      }
      const n = s.npcs[npc];
      let who = 'Someone abed';
      if (n.fa !== 0 && n.fa < 0x80 && hasMet(g, npc)) {
        loadScript(g, n.fa);
        g.talk.at = 0;
        who = scriptWord({ g, t: g.talk }) || who;
      }
      noteSleeper(g, who, up);
      return 0;
    }
    case T.Mirror:
      g.say(0x91f6); // "\nNo response!\n"
      return 0;
    default:
      return talkToNpc(g, npc);
  }
}
