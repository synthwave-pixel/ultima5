/**
 * talkMenus.ts
 *
 * The conversation's menus: what to say (the words heard, by topic), the answers to a question, and a word asked for
 * at a prompt. Moved out of menu.ts, which keeps the menus' own workings.
 */

import { saysWord } from './cmds.ts';
import { Game } from './game.ts';
import type { Keyword } from './talk.ts';
import { sayable, talksBackwards, townsfolkSaying } from './words.ts';
import { KEYWORD_LABELS } from './keywordLabels.ts';
import { OPEN_ANSWERS } from './openAnswers.ts';
import { talkMenu } from './speech.ts';
import { merchantSpeaking } from './merchantSpeech.ts';
import { type Item, type TalkRows, choose, chooseTwoColumns } from './menu.ts';
/**
 * What the player may say to the townsman they are talking to: the words
 * they have learnt that this one answers, and the two the game always
 * answers. A word whose answer has been heard already is drawn grey but
 * may be said again. The last line takes leave. Nothing is typed here: a
 * list that offered letters would have a controller's player guessing at
 * words, and none need be guessed - a word from a guide is added to what
 * is known in Cheats (Add word), and said from here like any other.
 *
 * Returns what to say; 'BYE' takes leave.
 */
export async function sayMenu(g: Game, keywords: Keyword[], own?: ReadonlySet<string>): Promise<string> {
  const s = g.s;
  const npc = g.talk.npc;
  type Say = { item: Item; word: string; standard: boolean; mark: number | string };
  const lines: Say[] = [];
  const add = (label: string, word: string, mark: number | string, standard = false, dim = g.words.wasHeard(s.mapId, npc, mark)): void => {
    lines.push({ item: { label, dim }, word, standard, mark });
  };
  // Name and Job first (Work says what Job says, and Thank takes leave as Bye does, so neither is offered twice).
  add('Name', 'NAME', 'name', true);
  add('Job', 'JOB', 'job', true);
  // Words that lead to the same reply are offered once: the first of them the player knows. It greys once the reply
  // has been heard, by whichever of them it was asked.
  const heard = new Set<string>();
  keywords.forEach(({ dest }, i) => g.words.wasHeard(s.mapId, npc, i) && heard.add(dest));
  // Nor greyed where more of the reply can be heard now than was (talk.ts moreToHear): a question the party's karma or
  // the townsman's knowing them now opens, or an answer it listens for now known - white again till that is heard.
  for (const { dest, more } of keywords) if (more) heard.delete(dest);
  const offered = new Set<string>();
  // A townsman whose own keywords include "job" is answered by the game's Job before his own is looked at, so
  // his line would be a second Job that never greys: the five the game answers itself are not offered twice.
  // Nor is a word the game would take for swearing - a townsman's "crotchety" begins as one of the words it
  // scolds the player for, and said, it earns the scolding and never his answer.
  const always = g.data.table(0x4aa8, 0x22);
  const said = townsfolkSaying(g);
  // (A townsman whose own words are not known - none given - is taken as one who might talk backwards.)
  const backwards = !own?.size || talksBackwards(own, said);
  keywords.forEach(({ stub, dest }, i) => {
    if (stub.length < 3) return; // a stub of a letter or two would answer to half the vocabulary
    // Nor a stub spelt with full stops (Jimmy of Trinsic's "H.M."): its letters alone are some other word ("hm"), and
    // its fellow without them ("hms") is offered for the same answer.
    if (stub.includes('.')) return;
    // Labelled with the townsman's own word for it, where it has been heard (words.ts forStub) - or, reviewed as no
    // label (keywordLabels.ts), by the next of the keywords that share its answer.
    const reviewed = KEYWORD_LABELS[g.talk.labels + stub.toUpperCase()];
    if (reviewed === '') return;
    const word = g.words.forStub(stub, false, { own, said, backwards, reviewed });
    if (!word || always.some((w) => saysWord(w, word.toUpperCase()))) return;
    if (offered.has(dest)) return;
    // Nor a word an earlier keyword of theirs answers first, with another reply (talk.ts findKeyword: the first that
    // matches): Camile of West Britanny's TRUE is her crops' "Indeed they do!" before it is her True Master, whose
    // question Master asks - the next of that reply's words is offered instead.
    const says = sayable(stub, word).toUpperCase();
    const first = keywords.find((kw) => kw.stub !== '' && saysWord(kw.stub, says));
    if (first && first.dest !== dest) return;
    offered.add(dest);
    // (A name spelt out with full stops, "H.M.S.", is labelled as it is written.)
    const label = word.includes('.') ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    add(label, sayable(stub, word), i, false, heard.has(dest));
  });
  // What has not been asked comes first, and the two the game always answers lead it: a player who knows
  // nothing of this townsman is nudged towards their name and their trade before anything else.
  const rank = (l: Say): number => (l.item.dim ? 2 : 0) + (l.standard ? 0 : 1);
  lines.sort((a, b) => rank(a) - rank(b));
  // Taking leave last - or first, where everything this townsman answers has been heard: nothing is left to ask.
  const done = lines.every((l) => l.item.dim);
  const leave: Item = { label: 'Take leave' };
  const items = done ? [leave, ...lines.map((l) => l.item)] : [...lines.map((l) => l.item), leave];
  // Low in the view, framed as the townsman's words are above it: the party and they in sight between (speech.ts).
  const at = await choose(g, 'Say', items, 0, false, talkMenu(g));
  const line = at < 0 ? undefined : lines[done ? at - 1 : at];
  // The label chosen, for the log to echo as the menu showed it (talk.ts partyWords): backing out is Take leave.
  g.talk.echo = line ? line.item.label : leave.label;
  if (!line) return 'BYE';
  g.talk.chosen = line.mark;
  return line.word;
}

/**
 * The player's answer to a townsman's question: whatever the question is
 * listening for that the player has heard said somewhere - the
 * Resistance's password, a name - and nothing they have not. Yes and No
 * where it listens for either (most do); a question that listens for
 * neither ("Who dost thou think is the rightful ruler of Britannia?",
 * Greyson's) is not a yes-or-no one, and is offered "I know not" instead,
 * which has the reply to any other answer. `own` is an answer that is
 * simply theirs to give: their name, asked for. `again`, a question asked
 * until it is answered rightly, may be walked away from.
 */
export async function answerMenu(
  g: Game,
  expected: string[],
  own?: string,
  riddle?: { tried: Set<string> },
  again = false,
): Promise<string> {
  const yesNo = (stub: string): boolean => /^(y|ye|yes|n|no)$/i.test(stub);
  // (An answer that is no word - Sir Arbuthnot's "'Tis indeed an honor!", a reply that took its answer's place in his
  // file - is listened for by nothing a player could say: his question is asked as yes or no, as it reads.)
  const isWord = (stub: string): boolean => /^[a-z0-9][a-z0-9'.]*$/i.test(stub.trim());
  const open = !own && !riddle && expected.some(isWord) && !expected.some(yesNo);
  const lines: { label: string; word: string; dim?: boolean }[] = [];
  if (own) lines.push({ label: own, word: own });
  else if (riddle) {
    // A question asked until it is answered rightly, whose answer is worked out rather than heard (the next three
    // notes of Lord Kenneth's tune, read in 1988 off the score in the Book of Lore): the answer is offered among
    // its own letters in other orders, and a wrong one greys once it has been tried. Easier than the original, and
    // meant to be: a controller has no way to spell, and no way out of a question asked for ever.
    for (const stub of expected) {
      if (/^(y|ye|yes|n|no)$/i.test(stub)) lines.push(/^y/i.test(stub) ? { label: 'Yes', word: 'YES' } : { label: 'No', word: 'NO' });
      else for (const word of scrambles(stub.toUpperCase())) if (!lines.some((l) => l.word === word)) lines.push({ label: word, word });
    }
    for (const l of lines) l.dim = riddle.tried.has(l.word);
  } else {
    // A question that listens for nothing and does not read as yes or no: the answers written for it (openAnswers.ts).
    const written = expected.length === 0 ? OPEN_ANSWERS[g.talk.labels + g.talk.label.toString(16)] : undefined;
    if (written) for (const label of written) lines.push({ label, word: label.toUpperCase() });
    else if (!open) lines.push({ label: 'Yes', word: 'YES' }, { label: 'No', word: 'NO' });
    for (const stub of expected) {
      // A letter alone is a way of saying yes (Malik's "o.k.?" listening for O), which Yes says: not a word to offer -
      // it would be any word that begins with it.
      if (yesNo(stub) || stub.trim().length < 2) continue;
      const own = g.talk.own;
      // Labelled as the townsman's own words would have it, as the Say list is (Greyson's mantra is Compassion, not
      // "complex"; Fiona's knowledge is of Covetous, not Cove).
      const said = townsfolkSaying(g);
      const word = g.words.forStub(stub, false, {
        own,
        said,
        reviewed: KEYWORD_LABELS[g.talk.labels + stub.toUpperCase()],
        backwards: !own.size || talksBackwards(own, said),
      });
      if (word && !lines.some((l) => l.word === sayable(stub, word)))
        lines.push({ label: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(), word: sayable(stub, word) });
    }
  }
  // A question goes on being asked until it is answered; only a name may be kept to oneself - and a riddle may be
  // walked away from, which the original did not allow, since there the answer could always be typed.
  if (own) lines.push({ label: 'Say nothing', word: '' });
  if (open) lines.push({ label: 'I know not', word: knowNot(expected) });
  if (riddle || (open && again)) lines.push({ label: 'Take leave', word: LEAVE });
  const at = await choose(
    g,
    'Answer',
    lines.map((l) => ({ label: l.label, dim: l.dim })),
    0,
    false,
    talkMenu(g),
  );
  if (riddle) {
    if (at < 0) return LEAVE;
    riddle.tried.add(lines[at].word);
    g.talk.echo = lines[at].label;
    return lines[at].word;
  }
  // Backing out of a question is No (or, to one that is not a yes-or-no question, I know not): the nearest a
  // controller has to turning away. The label chosen - or the line that answer is, backed out of - for the log to
  // echo as the menu showed it (talk.ts partyWords).
  const word = at < 0 ? (own ? '' : open ? knowNot(expected) : 'NO') : lines[at].word;
  g.talk.echo = at >= 0 ? lines[at].label : (lines.find((l) => l.word === word)?.label ?? null);
  return word;
}

/** "I know not", as said: what no answer the question listens for begins (the reply to any other, TALK_096e). */
function knowNot(expected: string[]): string {
  const said = 'I KNOW NOT';
  return expected.some((stub) => saysWord(stub, said)) ? '?' : said;
}

/** What answerMenu returns for walking away from a riddle (talk.ts ends the conversation on it). */
export const LEAVE = '\x1b';

/**
 * A word among its own letters in other orders: itself and up to three
 * others, in alphabetical order so its place says nothing. The same
 * every time, so a wrong one that has been greyed stays where it was.
 */
export function scrambles(word: string): string[] {
  const all = new Set<string>();
  const permute = (left: string, made: string): void => {
    if (all.size > 200) return;
    if (!left) all.add(made);
    for (let i = 0; i < left.length; i++) permute(left.slice(0, i) + left.slice(i + 1), made + left[i]);
  };
  permute(word, '');
  all.delete(word);
  const others = [...all].sort();
  // Spread the picks through the orders, from a number made of the word, rather than taking the first three.
  let seed = [...word].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const picked: string[] = [];
  while (picked.length < 3 && others.length) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    picked.push(...others.splice((seed >>> 8) % others.length, 1));
  }
  return [word, ...picked].sort();
}

/**
 * A word the game itself keeps a list of - a mantra, a virtue, a word of
 * power - asked for as the original asks, or chosen from those the player
 * has heard where the keyboard is read as a controller. Returns what to
 * say, or '' for nothing.
 */
export async function askWord(
  g: Game,
  max: number,
  title: string,
  choices: string[],
  stubs = false,
  known = false,
  twoColumns = false,
  start = '',
  rows?: TalkRows,
): Promise<string> {
  const { getString } = await import('./input.ts');
  if (g.options.input !== 'controller') return getString(g, max);
  const words: string[] = [];
  const items: Item[] = [];
  for (const choice of choices) {
    // The game's lists are of whole words (a mantra, a name) unless the caller says they are `stubs` (the lore's
    // topics, the first four letters of a password), which stand for whatever begins with them. A list the player
    // is taken to know already (the eight virtues, the manual's) is offered whole, in the game's own spelling.
    const word = known ? choice.toUpperCase() : g.words.forStub(choice, !stubs);
    if (!word || words.includes(word)) continue;
    words.push(word);
    items.push({ label: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() });
  }
  items.push({ label: 'Say nothing' });
  // (In two columns, boxed low in the view, where the scene above should stay in sight: a shrine's altar.)
  // The bar on `start` where it is offered (the word just chanted, chanted again).
  const from = Math.max(0, words.indexOf(start.toUpperCase()));
  // (Or low in the view as the lists of play are, where `rows` says: the Yell.)
  const at = twoColumns ? await chooseTwoColumns(g, title, items, from) : await choose(g, title, items, from, false, rows);
  const said = at < 0 || at >= words.length ? '' : words[at];
  // (A merchant's choice, with the Dialog setting's Play, echoed as the menu labelled it: "British", not "british".)
  g.print(merchantSpeaking(g) && said ? items[at].label : said);
  g.printChar('\n');
  return said;
}
