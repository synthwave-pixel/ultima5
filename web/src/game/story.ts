/**
 * story.ts
 *
 * The story's set pieces (u5d blckthrn.c, endgame.c): death and Lord
 * British's resurrection, Blackthorn's capture and interrogation in his
 * palace, and the end: Lord British freed from the Underworld (or not),
 * the closing pages from END.DAT, and the Avatar's proclamation.
 *
 * The words come from the player's files: DATA.OVL, MISCMSG.DAT (the
 * interrogation), ENDMSG.DAT and END.DAT (the end), KARMA.DAT.
 */

import { loadResource } from '../data/images.ts';
import { setActor } from './actors.ts';
import { reveal, shakeScreen, sleepTicks, TICK_MS } from './effects.ts';
import { drawMoons, drawVitals, invertMember, setWind, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { blinker, waitMark } from './waitMark.ts';
import { getChar, getCharYN, getString } from './input.ts';
import { Intro } from './intro.ts';
import { Status } from './save.ts';
import { resurrect } from './shops.ts';
import { passTime } from './time.ts';
import { closingTune, followMap, playTune, Tune } from './music.ts';
import { CLASSES } from './zstats.ts';
import { Colour } from '../ui/colours.ts';
import { cue } from './cues.ts';

/** A NUL-terminated string from a file. */
export function fileText(g: Game, name: string, offset: number, max = 2000): string {
  const f = g.data.files.get(name);
  let s = '';
  for (let i = offset; i < f.length && i < offset + max && f[i] !== 0; i++) s += String.fromCharCode(f[i]);
  return s;
}

/** An 11x11 map from MISCMAPS.DAT (rows of 16) into the combat map. */
export function miscMap(g: Game, offset: number): void {
  const f = g.data.files.get('MISCMAPS.DAT');
  for (let r = 0; r < 0xb; r++) for (let c = 0; c < 0xb; c++) g.combatMap[r * 32 + c] = f[offset + r * 0x10 + c];
}

/** ULTIMA_433e_AudioFootstep. */
export async function footstepSound(g: Game): Promise<void> {
  if (g.soundOff) return;
  await g.sound.noise(1, 0x19, 1000);
  await g.p.sleep(20);
  await g.sound.noise(1, 0x19, 1500);
}

/** ULTIMA_20fa_WaitTicks. */
const wait = (g: Game, n: number): Promise<void> => g.p.sleep(TICK_MS * n);

// --- Death ----------------------------------------------------------------------------------------------

/** BLCKTHRN_0910_Death: darkness, then Lord British's shrine: he raises the party in his castle at dawn. */
export async function death(g: Game): Promise<void> {
  // The Upgrade is silent through death (its hook at ULTIMA 0e7c) and then follows the map again.
  playTune(g, Tune.None);
  void cue(g, 'BigDeath');
  try {
    await dying(g);
  } finally {
    followMap(g);
  }
}

async function dying(g: Game): Promise<void> {
  const s = g.s;
  const d = g.draw;
  // The port's (from the ultima3 port): the choice to take up the last save again instead, or one of the seven before
  // it - each greyed, and said, where there is none - each line saying what it does. A choice, not a question to be
  // backed out of: B is no answer (from the earlier saves' list, it is back to this).
  const { chooseSave, localSave, savedWhen, savedWhere, takeUp } = await import('./storage.ts');
  const kept = localSave.all();
  const last = kept[0] ?? null;
  const earlier = kept.slice(1);
  {
    const { choose, restoreView } = await import('./menu.ts');
    const lines = [
      {
        label: 'Load the last save',
        enabled: last !== null,
        note: last
          ? `Back to the game saved ${savedWhen(last.data.written)} (${savedWhere(g, last.data)}), all since undone.`
          : 'No game has been saved yet.',
      },
      {
        label: 'Load an earlier save',
        enabled: earlier.length > 0,
        note:
          earlier.length === 0
            ? 'No save before the last is kept yet.'
            : earlier.length === 1
              ? 'Back to the save before the last, chosen by when and where it was made.'
              : `Back to one of the ${earlier.length} saves before the last, chosen by when and where each was made.`,
      },
      { label: "Lord British's aid", note: 'Raised in his castle at dawn, as in 1988: all carried kept, some experience lost.' },
    ];
    let at = last ? 0 : 2;
    for (;;) {
      const i = await choose(g, 'All is lost', lines, at);
      if (i === 0 && last) await takeUp(g, last.data);
      if (i === 1) {
        const chosen = await chooseSave(g, 'Earlier saves', earlier);
        if (chosen) await takeUp(g, chosen.data);
        at = 1;
        continue;
      }
      if (i === 2) break;
    }
    await restoreView(g);
  }
  s.partyTile = 0x1e;
  if (s.mapId < 0x21) updateFrame(g);
  await wait(g, 10);
  const from = s.mapId;
  s.mapId = 0xff;
  g.chromePlace = 'copper'; // the frame copper through death (chromeTone.ts)
  s.combatTurn = 0xff;
  g.say(0x70e2); // "\nAn unending darkness engulfs thee..."
  g.p.fx.page(1);
  d.pen = 0;
  d.fill(8, 8, 0xb7, 0xb7);
  g.p.fx.page(0);
  await g.p.fx.reveal(8, 8, 0xb7, 0xb7);
  for (let r = 0; r < 0xb; r++) g.combatMap.fill(0xff, r * 32, r * 32 + 0xb);
  for (let i = 0; i < 0x20; i++) setActor(g, i, 0, 0, 0, 0, 0, 0);
  updateFrame(g);
  g.say(0x7108); // "\n\nThou hast found refuge."
  await wait(g, 0xe);
  g.say(0x7122); // "\n\nNo evil lives here, only peace and darkness."
  await wait(g, 0x1c);
  g.say(0x7152); // "\n\nBut thy slumber is disturbed!"
  g.combatMap[5 * 32 + 5] = 0;
  const a0 = s.actors[0];
  a0.tile = a0.anim = 0x1c;
  a0.x = a0.y = 5;
  updateFrame(g);
  if (!g.soundOff) {
    const a = g.data.words(0x3720, 6);
    const b = g.data.words(0x372c, 6);
    const c = g.data.words(0x3738, 6);
    const e = g.data.swords(0x3744, 6);
    for (let i = 0; i < 6; i++) await g.sound.pulse(a[i], 1, b[i], c[i], e[i]);
  }
  g.say(0x7172); // "\n\nSomeone shouts\n\n\"FORTIS FORTUNA\nAVENTARI\""
  await wait(g, 6);
  const a1 = s.actors[1];
  for (const [x, t] of [
    [2, 0x5e],
    [8, 0x5f],
  ]) {
    a1.tile = a1.anim = 0x16;
    a1.x = x;
    a1.y = 7;
    g.combatMap[7 * 32 + x] = 0;
    await reveal(g, t, x, 7);
    g.combatMap[7 * 32 + x] = t;
    a1.tile = 0;
    updateFrame(g);
    await wait(g, 4);
  }
  g.say(0x719e); // "\n\nThere is a peal of thunder!\n"
  await shakeScreen(g);
  await shakeScreen(g);
  g.combatMap[2 * 32 + 5] = 0;
  a1.tile = a1.anim = 0x16;
  a1.x = 5;
  a1.y = 2;
  await reveal(g, 0x174, 5, 2);
  a1.tile = a1.anim = 0x74;
  updateFrame(g);
  g.say(0x71be); // "\n\""
  g.print(fileText(g, 'KARMA.DAT', g.data.words(0x1a74, 5)[Math.min(4, Math.trunc(s.karma / 0x14))]));
  g.printChar('"');
  await getChar(g);
  g.say(0x71cc); // "\n\nStrange words are intoned."
  await wait(g, 4);
  for (let i = 0; i < s.partySize; i++) {
    if (!g.soundOff) await g.sound.pulse(Math.trunc(36400 / (i + 7)), 1, 30000, 2000, 2);
    resurrect(g, i, true);
    s.members[i].hp = s.members[i].maxHp;
    drawVitals(g);
  }
  g.say(0x71ea); // "\n\nVertigo...\n"
  await wait(g, 4);
  g.p.fx.page(1);
  d.pen = 0;
  d.fill(8, 8, 0xb7, 0xb7);
  d.tile(0x11c, 5, 5);
  g.p.fx.page(0);
  await g.p.fx.reveal(8, 8, 0xb7, 0xb7);
  if (s.karma < 0x4b) s.karma = 0x4b;
  s.mapId = 0x11;
  g.chromePlace = null; // back on the map: a fight or a camp is where it is again
  s.level = 1;
  s.partyTile = 0x1c;
  s.x = s.y = 10;
  s.icon = s.protection = 0;
  while (s.hour !== 6) passTime(g, 9);
  s.d58a7 = s.d58a6 = 0;
  if (s.food === 0) s.food = 0x3f;
  if (from !== 0 && from < 0x21) {
    const { enterTown } = await import('./town.ts');
    await enterTown(g, true);
  }
}

// --- Blackthorn ------------------------------------------------------------------------------------------

const miscMsg = (g: Game, at: number): string => fileText(g, 'MISCMSG.DAT', at, 1000);

/** BLCKTHRN_0000: footsteps, `n` of them. */
async function steps(g: Game, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await footstepSound(g);
    await sleepTicks(g, 2);
  }
}

/** BLCKTHRN_002e: a script byte's actor (guards 6 and 7, Blackthorn 8, members 0 and 1) and its step in (dx, dy). */
function scriptActor(g: Game, code: number): number {
  const s = g.s;
  const who = { 0x10: 6, 0x14: 7, 0x18: 8, 0x1c: 0, 0x20: 1 }[code & 0xfc] ?? 0;
  s.dx = s.dy = 0;
  switch (code & 3) {
    case 0:
      s.dy--;
      break;
    case 2:
      s.dy++;
      break;
    case 1:
      s.dx++;
      break;
    case 3:
      s.dx--;
      break;
  }
  return who;
}

/** BLCKTHRN_00be: a little script of steps (two actors at once after 1; a count after 2), pauses, map changes and exits. */
async function script(g: Game, addr: number, n: number): Promise<void> {
  const s = g.s;
  const b = g.data.bytes(addr, n);
  let sound = true;
  let count = 1;
  let pair = false;
  for (let i = 0; i < b.length && b[i] !== 0; ) {
    const c = b[i++];
    if (c < 0x10) {
      switch (c) {
        case 1:
          pair = true;
          break;
        case 2:
          count = b[i++];
          break;
        case 3:
          sound = true;
          break;
        case 4:
          sound = false;
          break;
        case 5:
          await sleepTicks(g, b[i++]);
          break;
        case 6: {
          const t = b[i++];
          const x = b[i++];
          const y = b[i++];
          g.combatMap[y * 32 + x] = t;
          break;
        }
        case 7:
          updateFrame(g);
          break;
        case 8:
          await steps(g, count);
          count = 1;
          break;
        case 9: {
          const a = s.actors[b[i++]];
          a.tile = a.anim = 0;
          break;
        }
      }
      continue;
    }
    const first = scriptActor(g, c);
    const [dx1, dy1] = [s.dx, s.dy];
    let second = -1;
    let [dx2, dy2] = [0, 0];
    if (pair) {
      second = scriptActor(g, b[i++]);
      [dx2, dy2] = [s.dx, s.dy];
    }
    for (; count > 0; count--) {
      s.actors[first].x += dx1;
      s.actors[first].y += dy1;
      if (second >= 0) {
        s.actors[second].x += dx2;
        s.actors[second].y += dy2;
      }
      if (sound) await steps(g, 1);
    }
    count = 1;
    pair = false;
  }
}

/** BLCKTHRN_0278: Blackthorn's question, the second time and after more pointed. */
function question(g: Game, n: number, shrine: number): void {
  const at = [0, 0x2d, 0x52, 0xac][n];
  g.print(miscMsg(g, at));
  if (n < 3) {
    g.print(g.data.table(0x1f4e, 8)[shrine]);
    g.say([0x6f6e, 0x6f72, 0x6f76][n]); // "?\""
  }
}

/**
 * BLCKTHRN_02ea: the answer; true if it gives away the mantra. The
 * original takes whatever is typed and asks only whether the mantra is
 * somewhere in it. Where the keyboard is read as a controller there is
 * nothing to type with, so the three answers the moment holds are
 * offered instead: to say nothing, to refuse, and - only if the player
 * has been told it - to give him the mantra he is asking for.
 */
async function answer(g: Game, shrine: number): Promise<boolean> {
  g.say(0x6f7a); // "\n\nYour response?\n:"
  const mantra = g.data.table(0x1f5e, 8)[shrine].toUpperCase();
  let typed: string;
  if (g.options.input === 'controller') {
    const { choose } = await import('./menu.ts');
    const said = answers(g, shrine);
    const at = await choose(
      g,
      'Answer',
      said.map((a) => ({ label: a.label })),
    );
    typed = said[at < 0 ? 0 : at].word;
    g.print(typed);
  } else {
    typed = (await getString(g, 0xe)).toUpperCase();
  }
  g.say(0x6f8e); // "\n\n"
  return typed.includes(mantra);
}

/**
 * What a player with no keyboard may answer Blackthorn: to say nothing,
 * to refuse him, and - only where the mantra he demands has been heard
 * somewhere in Britannia - to give it to him. The original takes
 * anything typed and looks in it for the mantra; these are the three
 * answers that moment holds, and nothing the original allowed is lost
 * but the wording.
 */
export function answers(g: Game, shrine: number): { label: string; word: string }[] {
  const mantra = g.data.table(0x1f5e, 8)[shrine].toUpperCase();
  const out = [
    { label: 'Say nothing', word: '' },
    { label: 'Refuse', word: 'NEVER' },
  ];
  if (g.words.forStub(mantra)) out.push({ label: `Tell him ${mantra}`, word: mantra });
  return out;
}

/** BLCKTHRN_03ae: the companion dies in the field (or is sliced in half), and is gone from the party. */
async function companionDies(g: Game, sliced: boolean): Promise<void> {
  const s = g.s;
  g.print(miscMsg(g, sliced ? 0xf1 : 0x12d));
  await sleepTicks(g, 10);
  if (!g.soundOff) {
    for (let f = 2000; f < 25000; f += 0x32) await g.sound.pulse(0xa50, 1, 200, f, 0);
    for (let f = 25000; f > 2000; f -= 0x32) await g.sound.pulse(0xa50, 1, 200, f, 0);
  }
  const { explosion } = await import('./effects.ts');
  await explosion(g, s.actors[1].x, s.actors[1].y);
  s.actors[1].tile = s.actors[1].anim = 0;
  g.combatMap[7 * 32 + 5] = 0x80;
  let alive = 0;
  let m = 0;
  for (; m < s.partySize; m++) {
    if (s.members[m].status !== Status.Dead) alive++;
    if (alive === 2) break;
  }
  const lost = s.members[m].b.slice();
  for (; m < 0xf; m++) s.members[m].b.set(s.members[m + 1].b);
  s.members[0xf].b.set(lost);
  s.members[0xf].mapId = 0x7f;
  s.partySize--;
  drawVitals(g);
  if (sliced) {
    g.say(0x6f92); // "\n\n"
    g.print(s.members[0xf].name);
    g.say(0x6f96); // " is sliced in half! "
    await getChar(g);
    g.print(miscMsg(g, 0x1a0));
  }
  g.printChar('\n');
}

/** BLCKTHRN_0510: the guards take the party away. */
async function takenAway(g: Game): Promise<void> {
  await getChar(g);
  await script(g, 0x369e, 0x3c);
}

/** BLCKTHRN_051c: Blackthorn threatens the companion. */
async function threat(g: Game): Promise<void> {
  const s = g.s;
  g.print(miscMsg(g, 0x229));
  await script(g, 0x36da, 0x27);
  g.print(miscMsg(g, 0x25f));
  g.print(s.members[1].name);
  g.say(0x6fac); // " die!\" "
  await getChar(g);
  g.say(0x6fb4); // "\n\n"
}

/** BLCKTHRN_054a: the interrogation: four times he asks a shrine's mantra, the energy field closing on the companion. */
async function interrogation(g: Game, shrine: number, party: number): Promise<void> {
  const s = g.s;
  let threatened = false;
  g.say(0x6fb8); // "\n\n"
  for (let n = 0; n < 4; n++) {
    question(g, n, shrine);
    if (await answer(g, shrine)) {
      s.d58d8[shrine] = 0xff;
      s.karma = Math.max(0, s.karma - 5);
      if (party > 1) await companionDies(g, false);
      else g.print(miscMsg(g, 0x29c));
      await takenAway(g);
      return;
    }
    if (party < 2) {
      g.print(miscMsg(g, 0x2dc));
      await takenAway(g);
      return;
    }
    if (threatened) {
      passTime(g, 2);
      drawVitals(g);
      if (n < 3) g.combatMap[9 * 32 + 5] = [0xea, 0xeb, 0xe8][n];
      else await companionDies(g, true);
    } else {
      threatened = true;
      await threat(g);
    }
  }
}

/** BLCKTHRN_060e_Capture: taken in Blackthorn's palace: chained, questioned for a mantra, and turned out at the gate. */
export async function blackthornCapture(g: Game): Promise<void> {
  // Silent, as death is (the Upgrade's hook at ULTIMA 0e72).
  playTune(g, Tune.None);
  try {
    await captured(g);
  } finally {
    followMap(g);
  }
}

async function captured(g: Game): Promise<void> {
  const s = g.s;
  let party = 0;
  for (let m = 0; m < s.partySize; m++) if (s.members[m].status !== Status.Dead) party++;
  s.partyTile = 0x1c;
  updateFrame(g);
  g.say(0x6fbc); // "\nThou art subdued and blindfolded!"
  let shrine = 0;
  for (; shrine < 8; shrine++) if (s.d58d8[shrine] === 0) break;
  if (shrine < 8) {
    await sleepTicks(g, 2);
    g.draw.pen = 0;
    g.draw.fill(8, 8, 0xb7, 0xb7);
    s.level = 0xff;
    drawMoons(g);
    setWind(g, -1);
    for (let i = 0; i < 5; i++) {
      await wait(g, 5);
      await footstepSound(g);
    }
    g.say(0x6fe0); // "\n\nStrong guards drag thee away!"
    for (let i = 0; i < (g.soundOff ? 3 : 0x12); i++) {
      await wait(g, 5);
      await footstepSound(g);
    }
    for (let i = 0; i < 0x20; i++) setActor(g, i, 0, 0, 0, 0, 0, 0);
    s.mapId = 0xff;
    s.combatTurn = 0xff;
    miscMap(g, 0);
    const places = g.data.bytes(0x1f12, 0x30);
    const xs = g.data.bytes(0x1f42, 6);
    const ys = g.data.bytes(0x1f48, 6);
    const tiles = g.data.bytes(0x1ade, 9);
    for (let m = 0; m < party; m++) {
      const a = s.actors[m];
      a.x = xs[places[(party - 1) * 8 + m]];
      a.y = ys[places[(party - 1) * 8 + m]];
      a.tile = a.anim = tiles[CLASSES.indexOf(String.fromCharCode(s.members[m].cls))];
    }
    await sleepTicks(g, 0x10);
    g.say(0x7024); // "\n\nThou hast been chained and manacled!"
    await sleepTicks(g, 0x32);
    g.say(0x704c); // "\n\nFootsteps!"
    await steps(g, 8);
    setActor(g, 6, 0x70, 0x70, 4, 10, 0, 0);
    setActor(g, 7, 0x70, 0x70, 6, 10, 0, 0);
    await script(g, 0x3702, 12);
    if (!g.soundOff) await g.sound.pulse(0xaf0, 1, 13000, 100, 5);
    setActor(g, 8, 0x16, 0x16, 5, 5, 0, 0);
    await reveal(g, 0x178, 5, 5);
    setActor(g, 8, 0x78, 0x78, 5, 5, 0, 0);
    await sleepTicks(g, 8);
    g.say(0x705a); // "\n\nBlackthorn says:\n\n\"Ah, "
    g.print(s.members[0].name);
    g.say(0x7074); // "!\n'Tis indeed an honour to meet thee at last! "
    await getChar(g);
    g.say(0x70a4); // "\n\nGUARD! Release this good"
    if (s.members[0].gender === 12)
      g.say(0x70c0); // " lady "
    else if (s.members[0].gender === 11) g.say(0x70c8); // "man "
    g.say(0x70ce); // "at once!\""
    await script(g, 0x370e, 8);
    g.print(miscMsg(g, 0x32c));
    await getChar(g);
    await interrogation(g, shrine, party);
    if (s.actors[8].tile !== 0) await script(g, 0x3716, 10);
  }
  s.level = 0xff;
  drawMoons(g);
  setWind(g, -1);
  s.x = 10;
  s.y = 7;
  s.keys = 0;
  s.mapId = 0x12;
}

// --- The end -----------------------------------------------------------------------------------------------

/** ENDGAME_04fe: a step's pause and footfall. */
async function stepPause(g: Game): Promise<void> {
  await sleepTicks(g, 2);
  await footstepSound(g);
  await sleepTicks(g, 3);
}

/** ENDGAME_0510: actor `i` a step toward (x, y) (the longer way first); false once there (or gone). */
async function walkTo(g: Game, i: number, x: number, y: number): Promise<boolean> {
  const a = g.s.actors[i];
  if (a.tile === 0 || (a.x === x && a.y === y)) return false;
  if (Math.abs(a.x - x) < Math.abs(a.y - y)) a.y += a.y > y ? -1 : 1;
  else a.x += a.x > x ? -1 : 1;
  await stepPause(g);
  return true;
}

/** ENDGAME_05a2: now and then actor `i` wanders a step on open floor. */
async function wander(g: Game, i: number): Promise<void> {
  const a = g.s.actors[i];
  if (a.tile !== 0 && g.random(0, 1) !== 0) {
    for (let n = 0; n < 8; n++) {
      let x = a.x;
      let y = a.y;
      switch (g.random(0, 3)) {
        case 0:
          x++;
          break;
        case 1:
          x--;
          break;
        case 2:
          y++;
          break;
        case 3:
          y--;
          break;
      }
      if (g.view[y * 32 + x] === 0x44) {
        a.x = x;
        a.y = y;
        break;
      }
    }
  }
  await sleepTicks(g, 1);
}

/** ENDGAME_023a: text gathered into a line, printed at each newline. */
class Lines {
  private line = '';
  constructor(private readonly g: Game) {}
  add(text: string): void {
    this.line = (this.line + text).slice(0, 39);
    if (this.line.endsWith('\n')) {
      this.g.print(this.line);
      this.line = '';
    }
  }
}

/** ENDGAME_028c: a number in words (to 99). */
function numberWords(g: Game, out: Lines, n: number): void {
  const ones = g.data.table(0x3e0c, 19);
  if (n < 0x15) {
    out.add(ones[n - 1] ?? '');
    return;
  }
  out.add(g.data.table(0x3e32, 8)[Math.trunc(n / 10) - 2]);
  if (n % 10) {
    out.add(g.t(0x82c6)); // "-"
    out.add(ones[(n % 10) - 1]);
  }
}

/** ENDGAME_02d6: an ordinal in words. */
function ordinal(g: Game, out: Lines, n: number): void {
  const firsts = g.data.table(0x3e42, 12);
  if (n < 13) out.add(firsts[n - 1]);
  else if (n < 20) {
    numberWords(g, out, n);
    out.add(g.t(0x831e)); // "th"
  } else {
    out.add(g.t(0x8322)); // "Twent"
    if (n === 20)
      out.add(g.t(0x8328)); // "ieth"
    else {
      out.add(g.t(0x832e)); // "y-"
      out.add(firsts[n - 0x15]);
    }
  }
}

/** ENDGAME_0000: the closing pages: pictures from END1/END2.16 and TEXT.16, words from END.DAT in the proportional font; then ENDSC.16. */
async function closingPages(g: Game): Promise<void> {
  const fx = g.p.fx;
  g.draw.chrome?.(false);
  const names = g.data.ovl.strings(0x25ea, 30);
  const res = (i: number): Uint8Array => loadResource(g.data.files, g.data.ovl, names[i]);
  const text16 = res(0x11);
  const intro = new Intro(g);
  await fx.reveal(0, 0, 0x13f, 199);
  g.text.select(0);
  const file = g.data.bytes(0x3df4, 6);
  const pics = g.data.bytes(0x3dee, 6);
  const px = g.data.bytes(0x3dfa, 6);
  const py = g.data.bytes(0x3e00, 6);
  const kinds = g.data.bytes(0x3e06, 6);
  const left = g.data.bytes(0x3da6, 12);
  const right = g.data.words(0x3db2, 12);
  const tops = g.data.bytes(0x3dd6, 6);
  const bottoms = g.data.bytes(0x3ddc, 6);
  const xs = g.data.bytes(0x3de2, 6);
  const ys = g.data.bytes(0x3de8, 6);
  const at = g.data.words(0x3dca, 6);
  for (let i = 0; i < 6; i++) {
    const pic = res(0x18 + file[i]);
    fx.page(1);
    g.printChar(0xff);
    if (kinds[i] === 1) {
      if (i === 0) {
        fx.image(text16, 0, 0xd8, 0);
        fx.image(text16, 4, 0x98, 0x1c);
      } else if (i === 3) {
        fx.image(text16, 5, 0xe0, 0);
        fx.image(text16, 0, 0xb0, 0);
      }
    }
    fx.image(pic, pics[i], px[i], py[i]);
    intro.prose.left = [left[0 + i * 2], left[1 + i * 2]];
    intro.prose.right = [right[i * 2], right[i * 2 + 1]];
    intro.prose.top = tops[i];
    intro.prose.bottom = bottoms[i];
    intro.prose.x = xs[i];
    intro.prose.y = ys[i];
    const words = fileText(g, 'END.DAT', at[i]);
    if (!fx.prose?.([words])) intro.proseText(words);
    fx.page(1);
    if (i !== 0) {
      playTune(g, closingTune(i), 'closing');
      g.p.flushKeys();
      await g.p.waitKey(blinker(g)); // the arrow that says the page waits (waitMark.ts)
      waitMark(g, false);
    }
    fx.transfer(1, 0, 0, 0, 0x13f, 199);
    fx.page(0);
  }
  playTune(g, closingTune(6), 'closing');
  g.p.flushKeys();
  await g.p.waitKey(blinker(g));
  waitMark(g, false);
  fx.page(1);
  g.printChar(0xff);
  fx.image(res(0x1c), 0, 0x28, 0);
  fx.transfer(1, 0, 0, 0, 0x13f, 199);
  fx.page(0);
}

/** The ending's pictures and proclamation alone (for development: ?at=ending). */
export async function endingPages(g: Game): Promise<void> {
  const d = g.draw;
  g.p.fx.page(1);
  d.pen = 0;
  d.fill(0, 0, 0x13f, 199);
  g.p.fx.page(0);
  await closingPages(g);
  await proclamation(g);
}

/** ENDGAME_0326: the proclamation of the Avatar's deed, dated, and how long the quest took. */
async function proclamation(g: Game): Promise<void> {
  const s = g.s;
  const t = g.text;
  const out = new Lines(g);
  t.moveTo(0, 1);
  g.printChar(0xfd);
  g.printChar(0xfc);
  g.say(0x8332); // "Be it known that on\n"
  out.add(g.t(0x8348)); // "the "
  ordinal(g, out, s.day);
  out.add(g.t(0x834e)); // " Day of\n"
  out.add(g.t(0x8358)); // "the "
  ordinal(g, out, s.month);
  out.add(g.t(0x835e)); // " Month\n"
  g.say(0x8366); // "of the Year\n"
  numberWords(g, out, Math.trunc(s.year / 100));
  out.add(g.t(0x8374)); // " Hundred\n"
  numberWords(g, out, s.year % 100);
  out.add(g.t(0x837e)); // "\n\n"
  out.add(s.members[0].name);
  out.add(g.t(0x8382)); // " the Avatar\n\n"
  for (const a of [0x8390, 0x83a0, 0x83b2, 0x83ca, 0x83de]) g.say(a);
  t.font = 1;
  g.say(0x83ee); // "[E@QUE_@OF@[E@AVATAR\n"
  g.say(0x8404); // "IS@FOREVER\n\n\n\n"
  t.font = 0;
  g.printChar(0xfd);
  g.say(0x8414); // "Report now, thy Quest compleat in\n"
  let years = s.year - 0x8b;
  let months = s.month - 4;
  let days = s.day - 5;
  if (days < 0) {
    days += 0x1c;
    months--;
  }
  if (months < 0) {
    months += 0xd;
    years--;
  }
  if (years !== 0) {
    out.add(String(years));
    out.add(g.t(0x8438)); // " year"
    if (years > 1) out.add(g.t(0x843e)); // "s"
    if (months !== 0 || days !== 0) out.add(g.t(0x8440)); // ", "
  }
  if (months !== 0) {
    out.add(String(months));
    out.add(g.t(0x8444)); // " month"
    if (months > 1) out.add(g.t(0x844c)); // "s"
    if (days !== 0) out.add(g.t(0x844e)); // ", "
  }
  if (days !== 0) {
    out.add(String(days));
    out.add(g.t(0x8452)); // " day"
    if (days > 1) out.add(g.t(0x8458)); // "s"
  }
  out.add(g.t(0x845a)); // "\n"
  g.say(0x845c); // "to Lord British at Origin Systems!"
  playTune(g, Tune.RuleBritannia);
  // The original ends here, in a loop for ever (the player reboots); the port's next button press, once the
  // proclamation has had a moment to be read, goes back to the title.
  g.p.flushKeys();
  // A plain wait: the ticks' (sleepTicks) would draw the map's view each one, over the scroll.
  await wait(g, 0x40);
  g.p.flushKeys();
  await g.p.waitKey(() => {});
  if (typeof location !== 'undefined') location.reload();
  for (;;) await g.p.waitKey(() => {});
}

/** ENDGAME_0648_EndgameMain: Lord British freed: the fallen rise, and with the Sandalwood Box the Shard of Hatred... the end, good or bad. */
export async function endgame(g: Game): Promise<void> {
  const s = g.s;
  const d = g.draw;
  const msg = (at: number): string => fileText(g, 'ENDMSG.DAT', at, 1000);
  // The Upgrade's reunion with Lord British (ENDGAME_0648).
  playTune(g, Tune.Reunion);
  g.chromePlace = 'copper'; // the frame copper through the ending (chromeTone.ts)
  s.combatTurn = 0xff;
  drawVitals(g);
  miscMap(g, 0x210);
  for (const a of s.actors) a.tile = a.anim = 0;
  const lb = s.actors[31];
  lb.tile = lb.anim = 0x7c;
  lb.x = 5;
  lb.y = 8;
  lb.b6 = 0;
  await sleepTicks(g, 0x28);
  while (await walkTo(g, 0x1f, 5, 3));
  const tiles = g.data.bytes(0x1ade, 9);
  const xs = g.data.bytes(0x3e5a, 6);
  const ys = g.data.bytes(0x3e60, 6);
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead) {
      g.printChar('\n');
      g.print(p.name);
      g.say(0x849a); // " lives!\n"
      p.status = Status.Good;
      p.hp = p.maxHp;
      d.pen = Colour.brightWhite;
      d.invert(8, 8, 0xb7, 0xb7);
      if (!g.soundOff) await g.sound.pulse(0x2260, 1, 40000, 5000, 1);
      drawVitals(g);
    }
    const a = s.actors[m];
    a.tile = a.anim = tiles[CLASSES.indexOf(String.fromCharCode(p.cls))];
    a.x = 5;
    a.y = 9;
    a.b6 = 0;
    await sleepTicks(g, 1);
    while (await walkTo(g, m, xs[m], ys[m]));
  }
  await sleepTicks(g, 0x28);
  g.print(msg(0));
  g.print(s.members[0].name);
  g.say(0x84ae); // "!\"\n\n"
  await getChar(g);
  g.print(msg(0x21));
  const yesNo = async (): Promise<number> => {
    for (;;) {
      const k = await getCharYN(g);
      if (k === 0x59) {
        g.say(0x84b4); // "Yes\n\n"
        return k;
      }
      if (k === 0x4e) {
        g.say(0x84ba); // "No\n\n"
        return k;
      }
    }
  };
  let k = await yesNo();
  if (k === 0x4e) {
    g.print(msg(0x49));
    k = await yesNo();
  }
  if (k === 0x59 && s.sandalwoodBox !== 0) {
    await sleepTicks(g, 8);
    while (await walkTo(g, 0, 5, 4));
    while (await walkTo(g, 0, 5, 5));
    await sleepTicks(g, 4);
    setActor(g, 6, 0xe, 0xe, 5, 4, 0, 0);
    s.actors[6].b6 = 0;
    g.print(msg(0xab));
    await sleepTicks(g, 0x28);
    g.say(0x84cc); // "\n\nHe says:\n\n"
    for (const at of [0xd3, 0x128, 0x167, 0x1c9, 0x211]) {
      await getChar(g);
      g.print(msg(at));
    }
    await getChar(g);
    g.print(msg(0x24b));
    s.actors[6].tile = s.actors[6].anim = 8;
    await getChar(g);
    if (!g.soundOff) await g.sound.pulse(0x1450, 1, 50000, 10000, 1);
    s.actors[6].tile = s.actors[6].anim = 0;
    g.combatMap[4 * 32 + 5] = 0xdc;
    for (s.moongateHeight = 1; s.moongateHeight < 0x10; s.moongateHeight++) await sleepTicks(g, 1);
    await sleepTicks(g, 4);
    while (await walkTo(g, 0x1f, 5, 4));
    lb.tile = lb.anim = 0;
    await sleepTicks(g, 1);
    for (let m = 0; m < s.partySize; m++) {
      while (await walkTo(g, m, 5, 4));
      s.actors[m].tile = s.actors[m].anim = 0;
      await sleepTicks(g, 1);
    }
    for (s.moongateHeight = 0xf; s.moongateHeight > 0; s.moongateHeight--) await sleepTicks(g, 1);
    d.tile(0x44, 5, 4);
    g.p.fx.page(1);
    d.pen = 0;
    d.fill(0, 0, 0x13f, 199);
    g.p.fx.page(0);
    await closingPages(g);
    await proclamation(g);
    return;
  }
  // The bad end: Lord British and the party wander Britannia's ruin for ever.
  g.say(0x84da); // "\"I see...\n"
  await sleepTicks(g, 0x28);
  g.print(msg(0x2d5));
  s.actors[0].y--;
  await stepPause(g);
  for (;;) {
    let moving = 0;
    moving += (await walkTo(g, 2, 8, 6)) ? 1 : 0;
    moving += (await walkTo(g, 0x1f, 4, 1)) ? 1 : 0;
    moving += (await walkTo(g, 0, 8, 4)) ? 1 : 0;
    if (moving === 0) break;
  }
  // The original wanders here for ever (the player reboots); the port's next button press, once the wandering has
  // had a moment to be seen, goes back to the title, as the proclamation's does.
  g.p.flushKeys();
  for (let round = 0; ; round++) {
    await wander(g, 1);
    await wander(g, 3);
    await wander(g, 4);
    await wander(g, 5);
    const pressed = g.p.pollKey() !== 0;
    if (round >= 4 && pressed && typeof location !== 'undefined') location.reload();
  }
}

export { invertMember };
