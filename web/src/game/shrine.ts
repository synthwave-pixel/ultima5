/**
 * shrine.ts
 *
 * The shrines and the Codex (u5d cast2.c CAST2_0e76_Shrine, 0966, 0d24):
 * the walk to the altar, meditation on a virtue and its mantra, the
 * quest ordained, gold offered for karma, the quest's end rewarded; at
 * the Codex, the urns of the fallen and the wisdom each quest seeks.
 * The words are MISCMSG.DAT's (from 0x3ab) and DATA.OVL's.
 */

import { setActor } from './actors.ts';
import { shakeScreen, sleepTicks } from './effects.ts';
import { drawVitals, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { getChar, getDigit } from './input.ts';
import { askWord, restoreView } from './menu.ts';
import { followMap, playTune, Tune } from './music.ts';
import { passTime } from './time.ts';
import { T } from './tiles.ts';
import { buildLightMap, tileAt } from './world.ts';
import { fileText, footstepSound, miscMap } from './story.ts';
import { Colour } from '../ui/colours.ts';
import { cue } from './cues.ts';

const msg = (g: Game, at: number): string => fileText(g, 'MISCMSG.DAT', 0x3ab + at, 2000);

/** ULTIMA_6f1e: does the typed word begin with the stored one (its first eight letters when longer)? */
export function saysMantra(stored: string, typed: string): boolean {
  const n = stored.length < 9 ? stored.length : 8;
  return typed.slice(0, n).toUpperCase() === stored.slice(0, n).toUpperCase();
}

/** CAST2_0e64: a step, and its sound. */
async function step(g: Game): Promise<void> {
  await sleepTicks(g, 1);
  await footstepSound(g);
  await sleepTicks(g, 4);
}

/** The long rising and falling tone of the shrines. */
async function chime(g: Game, freq: number, len: number): Promise<void> {
  if (g.soundOff) return;
  for (let f = 2000; f < 25000; f += 0x32) await g.sound.pulse(freq, 1, len, f, 0);
  for (let f = 25000; f > 2000; f -= 0x32) await g.sound.pulse(freq, 1, len, f, 0);
}

/** CAST2_0966_ShrineOfVirtue: kneel, name the virtue, chant its mantra thrice; then a quest, an offering, or the quest's reward. */
async function shrineOfVirtue(g: Game): Promise<void> {
  const s = g.s;
  const xs = g.data.bytes(0x1f6e, 8);
  const ys = g.data.bytes(0x1f76, 8);
  let v = 0;
  for (; v < 8; v++) if (s.x === xs[v] && s.y === ys[v]) break;
  if (v === 8) v = 6;
  const a0 = s.actors[0];
  a0.tile = a0.anim = 0x6c;
  updateFrame(g);
  g.print(msg(g, 0x36d)); // "...and thou dost kneel before the Altar.\n\n"
  await sleepTicks(g, 10);
  g.print(msg(g, 0x398)); // "Upon what virtue dost thou meditate?\n\n:"
  // With a controller each answer is a list, in two columns low in the view, the altar and the Avatar kneeling
  // there above it; and between them the list is put away, the scene a second in sight before the next chant.
  const pad = g.options.input === 'controller';
  const behold = async (): Promise<void> => {
    if (!pad) return;
    await restoreView(g);
    await g.p.sleep(1000);
  };
  let typed = await askWord(g, 0xc, 'Virtue', g.data.table(0x1f4e, 8), false, true, true);
  if (typed === '') return;
  let focused = saysMantra(g.data.table(0x4b3e, 8)[v], typed);
  await sleepTicks(g, 6);
  g.printChar('\n');
  for (let i = 0; i < 3; i++) {
    await behold();
    g.say(0x958e); // "\nMantra:"
    // (Each chant after the first offered from the word just chanted: thrice the same, as a rule.)
    typed = await askWord(g, 0xc, 'Mantra', g.data.table(0x1f5e, 8), false, false, true, i > 0 ? typed : '');
    if (typed === '') return;
    if (!saysMantra(g.data.table(0x1f5e, 8)[v], typed)) focused = false;
    await sleepTicks(g, 0xc);
  }
  if (pad) await restoreView(g);
  const bit = 1 << v;
  if (!focused) {
    g.print(msg(g, 0x3c0)); // "\n\nThine thoughts are unfocused.\n"
  } else if ((s.questDone & 0xff & bit) === 0) {
    s.questActive |= bit;
    g.print(msg(g, 0x3e1));
    a0.tile = a0.anim = 0x1c;
    await getChar(g);
    g.print(msg(g, 0x40e)); // "\n\nThe Altar speaks and a Quest is ordained! "
    g.print(msg(g, g.data.words(0x4b5e, 8)[v]));
    g.say(0x9598); // "\"\n"
    await getChar(g);
    g.print(msg(g, 0x44b)); // "\n\"Return again when thy Quest is done!\"\n"
    if (!g.soundOff) {
      const a = g.data.words(0x4be6, 7);
      const b = g.data.words(0x4bf4, 7);
      const c = g.data.words(0x4c02, 7);
      const d = g.data.swords(0x4c10, 7);
      for (let i = 0; i < 7; i++) await g.sound.pulse(a[i], 1, b[i], c[i], d[i]);
    }
  } else if ((s.questActive & 0xff & bit) === 0) {
    let hundreds = 0;
    for (let paid = false; !paid; ) {
      g.print(msg(g, 0x474)); // "\n\nOffer how many hundredweights gold? "
      let k: number;
      do k = await getDigit(g, true);
      while (k < 0x30 || k > 0x39);
      g.printChar(k);
      hundreds = k - 0x30;
      if (hundreds === 0) {
        g.say(0x959c); // " gp\n"
        return;
      }
      g.say(0x95a2); // "00 gp\n\n"
      if (s.gold < hundreds * 100)
        g.print(msg(g, 0x49b)); // "Thou hast not that much gold!"
      else paid = true;
    }
    s.gold -= hundreds * 100;
    drawVitals(g);
    s.karma = Math.min(s.karma + hundreds, 99);
    g.text.font = 1;
    g.say(0x95aa); // "ALAKAZAM"
    g.text.font = 0;
    g.say(0x95b4); // "!\n"
    g.draw.pen = Colour.brightWhite;
    g.draw.invert(8, 8, 0xb7, 0xb7);
    await chime(g, 0xa8c, 200);
  } else {
    s.questActive &= ~bit & 0xffff;
    g.print(msg(g, 0x4b9)); // "\n\nA thunderous voice booms:\n\n\"WELL DONE!\"\n\n"
    g.draw.pen = Colour.brightWhite;
    g.draw.invert(8, 8, 0xb7, 0xb7);
    await chime(g, 0xc1c, 0x96);
    await shakeScreen(g);
    s.karma = Math.min(s.karma + 3, 99);
    const p = s.members[0];
    if (g.data.bytes(0x4b7e, 8)[v] !== 0) {
      p.str = Math.min(p.str + 1, 0x1e);
      g.say(0x95b8); // "Strength +1\n"
    }
    if (g.data.bytes(0x4b86, 8)[v] !== 0) {
      p.dex = Math.min(p.dex + 1, 0x1e);
      g.say(0x95c6); // "Dexterity +1\n"
    }
    if (g.data.bytes(0x4b8e, 8)[v] !== 0) {
      p.int = Math.min(p.int + 1, 0x1e);
      g.say(0x95d4); // "Intelligence +1\n"
    }
    if (v === 7) s.karma = Math.min(s.karma + 3, 99);
  }
  await sleepTicks(g, 10);
}

/** CAST2_0d24_Codex: the Codex answers the first quest sought; with all eight known, its last words. */
async function codex(g: Game): Promise<void> {
  const s = g.s;
  void cue(g, 'Invocation'); // the Codex speaks
  await getChar(g);
  g.print(msg(g, 0x4e5));
  await getChar(g);
  g.print(msg(g, 0x515));
  await getChar(g);
  let v = 0;
  for (; v < 8; v++) if (s.questActive & (1 << v)) break;
  if (v === 8) {
    g.print(msg(g, 0x53e));
    return;
  }
  s.questDone |= 1 << v;
  g.printChar('"');
  g.print(msg(g, g.data.words(0x4b6e, 8)[v]));
  g.say(0x95e6); // "\"\n\n"
  await getChar(g);
  if ((s.questDone & 0xff) !== 0xff) return;
  for (const pen of [Colour.red, Colour.brightWhite, Colour.red]) {
    g.draw.pen = pen;
    g.draw.invert(8, 8, 0xb7, 0xb7);
    await shakeScreen(g);
  }
  g.print(msg(g, 0x555));
  await getChar(g);
  await readCodex(g);
}

/** "Thou dost read:" and the Codex's four passages, in runes, a key after each (the runes page's too). */
export async function readCodex(g: Game): Promise<void> {
  g.say(0x95ea); // "Thou dost read:\n\n"
  for (const at of [0x57f, 0x5d1, 0x60c, 0x680]) {
    g.text.font = 1;
    g.print(msg(g, at));
    g.text.font = 0;
    await getChar(g);
  }
}

/** CAST2_0e76_Shrine: into a shrine (or the Codex's chamber) from the map: the walk, the altar, and back out. */
export async function shrine(g: Game): Promise<void> {
  const s = g.s;
  const tile = tileAt(g, s.x, s.y);
  const isCodex = tile === T.Codex;
  g.viewDirty = 1;
  const from = s.mapId;
  s.mapId = 0xff;
  g.chromePlace = 'shrine'; // the frame in a shrine's gold (chromeTone.ts)
  s.combatTurn = 0xff;
  const saved = s.b.slice(0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100);
  for (const a of s.actors) a.tile = 0;
  playTune(g, Tune.Stones, 'shrine');
  miscMap(g, isCodex ? 0x160 : 0xb0);
  updateFrame(g);
  let urns = 0;
  for (let m = 1; m < 0x10; m++) if (s.members[m].mapId === 0x7f) urns++;
  if (urns > 0) {
    let at = g.data.bytes(0x4b96, 8)[urns - 1];
    const ux = g.data.bytes(0x4b9e, 0x24);
    const uy = g.data.bytes(0x4bc2, 0x24);
    for (let i = 0; i !== urns; i++, at++) setActor(g, i + 1, 3, 3, ux[at], uy[at], s.level, 0);
  }
  g.print(msg(g, isCodex ? 0x6db : 0x6ae));
  for (let i = 0; i < 4; i++) await step(g);
  const a0 = s.actors[0];
  a0.tile = a0.anim = 0x1c;
  a0.x = 5;
  a0.y = 10;
  a0.z = s.level;
  await step(g);
  if (isCodex && urns > 0) {
    g.say(0x9624); // "\n\nThou dost see\n"
    g.say(urns === 1 ? 0x9636 : 0x9648); // "an urn marked:\n\n" : "urns marked:\n\n"
    for (let m = 1; m < 0x10; m++) {
      if (s.members[m].mapId !== 0x7f) continue;
      g.print(s.members[m].name.toUpperCase());
      g.printChar('\n');
    }
  }
  for (let i = 0; i < (isCodex ? 7 : 4); i++) {
    a0.y--;
    await step(g);
  }
  if (isCodex) await codex(g);
  else await shrineOfVirtue(g);
  a0.tile = a0.anim = 0x1c;
  await sleepTicks(g, 1);
  while (a0.y < 10) {
    a0.y++;
    await step(g);
  }
  a0.tile = a0.x = a0.y = 0;
  for (let i = 0; i < 4; i++) await step(g);
  await sleepTicks(g, 10);
  s.b.set(saved, 0x5c5a - 0x55a6);
  s.mapId = from;
  g.chromePlace = null; // back on the map: a fight or a camp is where it is again
  passTime(g, 0x10);
  buildLightMap(g);
  followMap(g);
}
