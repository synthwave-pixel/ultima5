/**
 * magic.ts
 *
 * Spells, mixing, and using items (u5d cast.c, cast2.c's spell helpers,
 * CMDS_1ad8 Mix). Every word the game says is read from DATA.OVL.
 *
 * Spell state lives in the save: `icon` (D_587a) is the lasting effect
 * shown on the border (P protection, N negate magic, Q quickness, C
 * charm-proof, T time stopped; the amulet, crown and badge too) and
 * `protection` (D_588e) its turns; `d58a6` is the light spell's turns.
 */

import { SETTLEMENTS } from '../data/maps.ts';
import { actorTileAt } from './actors.ts';
import {
  aim,
  arenaFree,
  attackWith,
  cellAt,
  charm,
  combatantAt,
  damage,
  enemyFlags,
  EF,
  hitFlash,
  onMonsterSide,
  passable,
  placeCombatant,
  released,
  spawned,
  poison,
  putToSleep,
  randomSquare,
  removeCombatant,
  report,
  roll,
  sayName,
  stat,
  wake,
} from './combat.ts';
import { explosion, shakeScreen, sleepTicks, TICK_MS } from './effects.ts';
import {
  clearBorderChar,
  clearBorderTitle,
  clearSpellBar,
  drawVitals,
  invertMember,
  borderTitle,
  setWind,
  updateFrame,
  animateActors,
} from './frame.ts';
import { CF, Game, thingKey } from './game.ts';
import { holdFullPanel, withFullPanel } from './layout.ts';
import { isCaster } from './rest.ts';
import { drawSpellCard, makeable, recipe, withManaPanel } from './magicPanel.ts';
import { cue } from './cues.ts';
import { directing, getChar, getDigit, getNumber, neediest, type Need, selectMember, upper, whoActs } from './input.ts';
import { K } from './io.ts';
import { nightSky, viewGem } from './look.ts';
import { toMoonstone } from './moongate.ts';
import { Status } from './save.ts';
import { resurrect } from './shops.ts';
import { A, T } from './tiles.ts';
import { itemCounts, listBox, nextHeld, pickItem } from './zstats.ts';
import { buildView, drawView, overlayActors, tileAt, tileCell } from './world.ts';
import { Colour } from '../ui/colours.ts';

const Q = { Int: -1, Dex: -2 } as const;

/** ULTIMA_3f14: add, up to a limit. */
const upTo = (v: number, n: number, max: number): number => (v + n < max ? v + n : max);

// --- Casting's look and sound ------------------------------------------------------------------

/** CAST2_0000_CastEffect: the map flashes and the spell's circle sounds (effect by circle; 9 the regalia). */
export async function castEffect(g: Game, n: number): Promise<void> {
  const snd = g.soundOff ? null : g.sound;
  if (n < 9) {
    // The ultima3 port's pace: the spell sounds and the view flashes, briefly, and the game goes on - where the DOS
    // game held the view inverted while its speaker sparkled and hummed (for a first-circle spell, nearly two
    // seconds). The sparkle and the two hums still sound (the Standard set folds them into one), unwaited.
    void snd?.noise(800, n * 0x640 + 8000, 700);
    const a = g.data.words(0x4af6, 9)[n];
    const b = g.data.words(0x4b08, 9)[n];
    const c = g.data.words(0x4b1a, 9)[n];
    const d = g.data.swords(0x4b2c, 9)[n];
    void snd?.pulse(a, 1, n * 4000 + 10000, b, d).then(() => snd.pulse(a, 1, n * 4000 + 10000, c, -d));
    // The Standard look pulses as the ultima3 port's does: the square of the member the spell falls on, or the
    // whole view, washed half white; the EGA look inverts the view, as the DOS game did.
    const on = g.spellOn;
    g.spellOn = -1;
    if (g.options.tileSet === 'standard' && g.draw.pulse && g.draw.unpulse) {
      g.draw.pulse(on >= 0 ? memberSquare(g, on) : null);
      await g.p.sleep(SPELL_FLASH_MS);
      g.draw.unpulse();
    } else {
      g.draw.pen = Colour.brightWhite;
      g.draw.invert(8, 8, 0xb7, 0xb7);
      await g.p.sleep(SPELL_FLASH_MS);
      g.draw.invert(8, 8, 0xb7, 0xb7);
    }
  } else {
    await snd?.pulse(0x1180, 1, 65000, 300, 1);
  }
}

/** The view square member `m` stands on: in a fight their own, out of one the party's; null where there is none (a dungeon's passages). */
function memberSquare(g: Game, m: number): [number, number] | null {
  if (g.inCombat) {
    const c = g.combat.find((e) => (e.flags & CF.Player) !== 0 && e.who === m);
    return c ? [c.x, c.y] : null;
  }
  return g.inDungeon ? null : [5, 5];
}

/** How long the view flashes for a spell (the ultima3 port's flash). */
const SPELL_FLASH_MS = 100;
/** Negate Matter, Standard sound: the beat after the spell's flash before the thing is unmade (its dissolve 0.35s into the spell). */
const UNMAKE_BEAT_MS = 250;

/** CAST2_08f8: a lasting effect on the border. */
async function lasting(g: Game, icon: number, turns: number, effect: number): Promise<void> {
  g.s.icon = icon;
  g.s.protection = turns;
  await castEffect(g, effect);
  drawVitals(g);
}

/** CAST2_009e_OnWho: pick a member; -1 for none. A spell chosen from the command menu names its own. */
async function onWho(g: Game, need?: Need): Promise<number> {
  g.say(0x94f4); // "On who: "
  const chosen = g.castOn;
  g.castOn = null;
  // In a fight the member the choice is on is marked on the field, green (combat.ts drawCombatMarks). The bar starts
  // on whoever the spell is likeliest for (input.ts neediest).
  const m = chosen !== null ? chosen : await selectMember(g, false, undefined, (at) => (g.healPick = at), need && neediest(g, need));
  g.healPick = -1;
  g.spellOn = m; // the spell's pulse falls on them (castEffect)
  if (m < 0)
    g.say(0x94fe); // "None!"
  else g.print(g.s.members[m].name);
  if (g.text.win.x !== 0) g.printChar('\n');
  return m;
}

/** CAST2_0306: a direction from the caster; the square in (dx, dy). Returns the key (0 for Pass). */
async function castDirection(g: Game): Promise<number> {
  const s = g.s;
  if (s.mapId > 0x7f) {
    s.dx = g.combat[s.combatTurn].x;
    s.dy = g.combat[s.combatTurn].y;
  } else {
    s.dx = s.x;
    s.dy = s.y;
  }
  g.say(0x9504); // "Direction-"
  // A bumped cast (An Sanct at a chest, bumpAct.ts) is aimed where the party walked.
  let bumped = g.bumpDir;
  g.bumpDir = 0;
  if (g.options.input === 'controller' && !bumped) borderTitle(g, 'Which way?');
  for (;;) {
    let k = bumped;
    if (!k) await directing(g, async () => void (k = await getChar(g)));
    bumped = 0;
    if (g.options.input === 'controller' && [K.Up, K.Right, K.Down, K.Left, K.Space, K.Escape].includes(k as never)) clearBorderTitle(g);
    switch (k) {
      case K.Up:
        g.say(0x9510); // "North\n"
        s.dy--;
        return k;
      case K.Right:
        g.say(0x9518); // "East\n"
        s.dx++;
        return k;
      case K.Down:
        g.say(0x951e); // "South\n"
        s.dy++;
        return k;
      case K.Left:
        g.say(0x9526); // "West\n"
        s.dx--;
        return k;
      case K.Space:
      case K.Escape: // B, as it passes at every other direction asked
        g.say(0x952c); // "Pass\n"
        g.cancelled = true;
        return 0;
    }
  }
}

/** CAST2_00de_SelectSpell: syllables by their letters (J and O are none), sorted; the spell's index, -1 for none typed, -2 for no such spell. */
export async function selectSpell(g: Game, casting = false, caster = -1, mixing = false): Promise<number> {
  const t = g.text;
  const words = g.data.table(0x1bfc, 26);
  const typed: number[] = [];
  const at: number[] = [];
  for (let done = false; !done; ) {
    // A controller has no syllables to type: it is shown the list at once, and B out of the list is no spell.
    const pad = g.options.input === 'controller';
    const k = pad && typed.length === 0 ? K.Enter : upper(await getChar(g));
    if (k === K.Enter && typed.length === 0) {
      // The port's spell list, where nothing is typed yet: the spell chosen is printed by what it does (its words are
      // kept in DATA.OVL only as sorted letters, so their spoken order is not there to print).
      const spell = await pickSpell(g, casting, caster, mixing);
      if (spell < 0 && pad) return -1;
      if (spell < 0) continue;
      g.print(SPELL_EFFECTS[spell]);
      g.printChar('\n');
      return spell;
    }
    if (k === 0x4a || k === 0x4f) continue;
    if (k >= 0x41 && k <= 0x5a) {
      if (typed.length < 4) {
        const word = words[k - 0x41];
        if (t.win.x + word.length > 0xd) g.printChar('\n');
        at.push(t.win.x);
        typed.push(k);
        g.print(word);
        g.printChar(' ');
      }
      continue;
    }
    switch (k) {
      case K.Backspace:
        if (typed.length !== 0) {
          const x = at.pop() ?? 0;
          const w = typed.pop() ?? 0x41;
          t.moveTo(x, t.win.x === 0 ? t.win.y - 1 : t.win.y);
          for (let i = 0; i < words[w - 0x41].length; i++) g.printChar(' ');
          t.moveTo(x, t.win.y);
        }
        break;
      case K.Escape:
        typed.length = 0;
        done = true;
        break;
      case K.Enter:
      case K.Space:
        done = true;
        break;
    }
  }
  typed.sort((a, b) => a - b);
  const letters = String.fromCharCode(...new Set(typed));
  let spell = g.data.table(0x1c30, 0x30).indexOf(letters);
  if (typed.length === 0) return -1;
  g.printChar('\n');
  if (spell < 0) spell = -2;
  return spell;
}

/** What each spell does, in the port's words (the 1988 manual's names), by spell number. */
export const SPELL_EFFECTS = [
  'Light',
  'Magic missile',
  'Awaken',
  'Cure poison',
  'Heal',
  'Negate matter',
  'Unlock',
  'Repel undead',
  'Wind change',
  'Locate',
  'Summon animal',
  'Create food',
  'Great light',
  'Fire bolt',
  'Fire field',
  'Poison field',
  'Sleep field',
  'Blink',
  'Dispel field',
  'Protection',
  'Energy field',
  'Up a level',
  'Down a level',
  'Reveal',
  'Insect swarm',
  'Magic lock',
  'Magic unlock',
  'Great heal',
  'Sleep',
  'Quickness',
  'Tremor',
  'Confusion',
  'Negate magic',
  'See all',
  'Charm',
  'Turn to rat',
  'Invisibility',
  'Death bolt',
  'Clone',
  'View',
  'Poison wind',
  'Fear',
  'Resurrect',
  'Summon daemon',
  'Death wind',
  'Fire storm',
  'Gate travel',
  'Time stop',
];

/**
 * A scroll's spell, by the letters of its syllables in the scroll table
 * (0x41ac, "IS" for In Sanct): the letters sorted are the spell's key in
 * the spell table, and its effect is named as the spell list names it.
 */
export function scrollEffect(g: Game, n: number): string {
  const letters = [...(g.data.table(0x41ac, 8)[n] ?? '')].sort().join('');
  const spell = g.data.table(0x1c30, 0x30).indexOf(letters);
  return SPELL_EFFECTS[spell] ?? letters;
}

/** The same, short enough for the Use list's row (seven letters beside the count, the icon and the dash). */
const SCROLL_SHORT: Record<string, string> = {
  'Great light': 'Light',
  'Wind change': 'Wind',
  Protection: 'Protect',
  'Negate magic': 'Negate',
  'Summon daemon': 'Daemon',
  Resurrect: 'Raise',
  'Time stop': 'Freeze',
};
export function scrollShort(g: Game, n: number): string {
  const effect = scrollEffect(g, n);
  return SCROLL_SHORT[effect] ?? effect;
}

/** A scroll's syllables spoken in order ("In Sanct"), from the words the letters stand for (0x1bfc). */
export function scrollWords(g: Game, n: number): string {
  const words = g.data.table(0x1bfc, 26);
  return [...(g.data.table(0x41ac, 8)[n] ?? '')]
    .map((c) => words[c.charCodeAt(0) - 0x41] ?? c)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

/** What each potion does, by its colour's number (the port's words for the Use list), and the colour to draw its flask. */
export const POTION_EFFECTS = ['Awaken', 'Heal', 'Cure', 'Poison', 'Sleep', 'Rat', 'Vanish', 'See all'];
/** The same at full length, for a menu with room for it. */
export const POTION_LONG = ['Awaken', 'Heal', 'Cure poison', 'Poison', 'Sleep', 'Turn to rat', 'Invisibility', 'See all'];
export const POTION_COLOURS = [9, 14, 12, 10, 6, 13, 8, 15]; // blue, yellow, red, green, orange, purple, black, white

/**
 * The spell list: every spell by its effect, in the order of the circles, each with its mixtures on hand - "(0)"
 * where there are none; the spell, or -1. To cast, the spells that work where the party stands and are of a circle
 * `caster` has reached (the ultima3 port's rule: the rest are left out), greyed where there is none mixed or the
 * caster cannot cast it now - asleep, the mana short - so a mixture is not spent for nothing, and those that can be
 * cast put first. To mix, every spell, in the game's order.
 */
async function pickSpell(g: Game, casting: boolean, caster: number, mixing = false): Promise<number> {
  const { choose, restoreView } = await import('./menu.ts');
  const s = g.s;
  // Each spell by what it does and the mixtures of it made ("Light x6"); greyed where it cannot be cast - or, mixing on a
  // controller (mixBySpell), where the party has not the reagents for one.
  // A spell greyed may still have the bar rest on it (menu.ts Item.rest), its card on the panel saying why: none mixed,
  // the mana or the circle short, a reagent missing.
  const all = SPELL_EFFECTS.map((e, i) => ({
    spell: i,
    label: `${e} x${s.mixtures[i]}`,
    enabled: mixing ? makeable(g, i) > 0 : !casting || caster < 0 || able(g, caster, i),
    rest: true,
  }));
  const learnt = (spell: number): boolean => caster < 0 || s.members[caster].level > Math.trunc(spell / 6);
  // To cast, those that can be cast now first, then those greyed, each by circle in the game's order (the sort keeps
  // it: the spells are numbered by circle).
  const items = casting
    ? all.filter((it) => worksHere(g, it.spell) !== false && learnt(it.spell)).sort((a, b) => Number(b.enabled) - Number(a.enabled))
    : all;
  // In a fight the bar starts on the caster's last spell, so the fight's fire bolt is cast again at a press; else on
  // the first that can be cast.
  // Mixing, on the spell last mixed (mixBySpell), to mix it again.
  const last = mixing ? g.lastMix : casting && g.inCombat ? g.lastSpell.get(g.combat[s.combatTurn]?.who ?? -1) : undefined;
  const lastAt = items.findIndex((it) => it.spell === last && it.enabled);
  // The spell the bar is on, shown on the party panel as its card (magicPanel.ts): its words, mixtures, cost, reagents.
  const watch = g.choiceWatch;
  // A recipe of more than four (Clone, Resurrect) takes the panel's full height while the bar is
  // on it (layout.ts): under the words, the cost and the circle, the panel's own height has room for four reagents.
  const tall: { release: (() => void) | null } = { release: null };
  g.choiceWatch = (at, title) => {
    if (title !== 'Spells' || !items[at]) return;
    const big = g.options.tileSet === 'standard' && recipe(g, items[at].spell).length > 4;
    if (big && !tall.release) tall.release = holdFullPanel(g);
    else if (!big && tall.release) {
      tall.release();
      tall.release = null;
    }
    drawSpellCard(g, items[at].spell, casting ? caster : -1);
  };
  let i: number;
  try {
    i = await choose(
      g,
      'Spells',
      items,
      lastAt >= 0
        ? lastAt
        : Math.max(
            0,
            items.findIndex((it) => it.enabled),
          ),
    );
  } finally {
    g.choiceWatch = watch;
    tall.release?.();
    drawVitals(g);
  }
  await restoreView(g);
  return i < 0 ? -1 : items[i].spell;
}

/** The 48 spells, by number (six to a circle). */
const EVERY_SPELL = [...Array(48).keys()];

/** Whether `who` has the means to cast `spell`: a mixture, awake and well, the circle learnt, the mana there. */
function able(g: Game, who: number, spell: number): boolean {
  const s = g.s;
  const circle = Math.trunc(spell / 6) + 1;
  const p = s.members[who];
  return s.mixtures[spell] !== 0 && (p.status === Status.Good || p.status === Status.Poisoned) && p.level >= circle && p.mp >= circle;
}

/**
 * Whether a spell works where the party stands (its byte at 0x1c90: outdoors, town, dungeon, combat); null where
 * magic is absorbed, which lets every spell be listed (the casting tells of it).
 */
function worksHere(g: Game, spell: number): boolean | null {
  const s = g.s;
  const where = g.data.bytes(0x1c90, 0x30)[spell];
  if (s.mapId === 0) return (where & 8) !== 0;
  if (s.mapId > 0x7f) return (where & 1) !== 0;
  if ((s.mapId === 0x12 && s.crown === 0) || s.mapId === 0x1d) return null;
  return (where & (s.mapId < 0x21 ? 4 : 2)) !== 0;
}

// --- The spells --------------------------------------------------------------------------------

/** CAST_0000: the Shadowlords, Blackthorn and Lord British shrug off charms and the like. */
const immune = (g: Game, i: number): boolean => [47, 0xe, 0xf].includes(g.combat[i].who);

/** COMSUBS_0000: the target resists (a roll against the two intelligences). */
function resists(g: Game, caster: number, target: number): boolean {
  return roll(g) < Math.trunc((stat(g, target, Q.Int) + 0x1e - stat(g, caster, Q.Int)) / 2);
}

/** CAST_0032: a spell that attacks like a weapon (magic missile, fire bolt...). */
async function attackSpell(g: Game, weapon: number): Promise<void> {
  g.s.weapon = weapon;
  await attackWith(g, g.s.combatTurn, weapon);
}

/** CAST_004c: a field: in a dungeon one before the party; in combat thrown like a missile. */
async function fieldSpell(g: Game, n: number): Promise<number> {
  const s = g.s;
  if (s.mapId < 0x80) {
    await castEffect(g, n === 3 ? 4 : 3);
    const x = (g.data.swords(0x24d6, 4)[s.facing] + s.x) & 7;
    const y = (g.data.swords(0x24de, 4)[s.facing] + s.y) & 7;
    const at = s.level * 0x40 + y * 8 + x;
    const here = s.dungeon[at];
    if ((here & 0xf7) !== 0) return 0;
    s.dungeon[at] = (here & 8) | g.data.bytes(0x4596, 4)[n];
    return -1;
  }
  s.weapon = g.data.bytes(0x4592, 4)[n];
  await attackWith(g, s.combatTurn, s.weapon);
  return -1;
}

/** CAST_0114_AnZu: awaken. */
async function anZu(g: Game): Promise<number> {
  const s = g.s;
  const m = await onWho(g, 'asleep');
  if (m < 0) return -1;
  if (s.members[m].status !== Status.Sleeping) return 0;
  s.members[m].status = Status.Good;
  if (s.mapId > 0x7f) {
    for (let i = 0; i < 0x20; i++) {
      const c = g.combat[i];
      if ((c.flags & (CF.Player | CF.Monster | CF.Dead | CF.Asleep)) === (CF.Player | CF.Asleep) && c.who === m) {
        wake(g, i);
        break;
      }
    }
  }
  await castEffect(g, 1);
  g.vitalsDirty = 1;
  return -1;
}

/** CAST_01ae_AnNox: cure poison. */
async function anNox(g: Game): Promise<number> {
  const m = await onWho(g, 'poisoned');
  if (m < 0) return -1;
  if (g.s.members[m].status !== Status.Poisoned) return 0;
  g.s.members[m].status = Status.Good;
  await castEffect(g, 1);
  g.vitalsDirty = 1;
  return 1;
}

/** CAST2_03c2: heal a little (a roll of hit points). */
function heal(g: Game, m: number): number {
  const p = g.s.members[m];
  if (p.status === Status.Dead) return 0;
  p.hp = upTo(p.hp, roll(g), p.maxHp);
  g.vitalsDirty = 1;
  return 1;
}

/** CAST_01fa_Mani: heal. */
async function mani(g: Game): Promise<number> {
  const m = await onWho(g, 'hurt');
  const r = m < 0 ? -1 : heal(g, m);
  if (r !== 0) await castEffect(g, 1);
  return r;
}

/** CAST_0230_AnYlem: furniture before the caster vanishes. */
async function anYlem(g: Game): Promise<number> {
  const s = g.s;
  if ((await castDirection(g)) === 0) return -1;
  await castEffect(g, 1);
  const [map, i] = tileCell(g, s.dx, s.dy);
  if (
    ![T.T5B, T.Chair90, T.Chair91, T.Chair92, T.Chair93, 0x9d, T.Desk, T.Barrel, T.Vanity, 0xa9, T.Dresser, 0xae, T.Trunk].includes(map[i])
  )
    return 0;
  // The Standard set lets the spell's sound open first (it sounds on, unwaited), then the thing is pulled away.
  if (!g.soundOff && g.options.soundSet === 'standard') await g.p.sleep(UNMAKE_BEAT_MS);
  map[i] = T.T44;
  g.say(0x459a); // "POOF!\n"
  g.viewDirty |= 2;
  updateFrame(g);
  await cue(g, 'Dissolve', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
  return -1;
}

/** CAST_02d2_AnSanct: unlock: a dungeon chest (disarmed), a locked door, a chest in view. */
async function anSanct(g: Game): Promise<number> {
  const s = g.s;
  if (s.mapId > 0x20 && s.mapId < 0x80) {
    await castEffect(g, 2);
    let at = s.level * 0x40 + s.y * 8 + s.x;
    if ((s.dungeon[at] & 0xf0) !== 0x40) {
      at = s.level * 0x40 + ((g.data.swords(0x24de, 4)[s.facing] + s.y) & 7) * 8 + ((g.data.swords(0x24d6, 4)[s.facing] + s.x) & 7);
    }
    if ((s.dungeon[at] & 0xf0) !== 0x40) return 0;
    if (s.dungeon[at] & 1) g.say(0x45a1); // "Disarmed!\n"
    s.dungeon[at] = (s.dungeon[at] & 8) | 0x70;
    g.say(0x45ac); // "Chest opened!\n"
    return -1;
  }
  if ((await castDirection(g)) === 0) return -1;
  const [map, i] = tileCell(g, s.dx, s.dy);
  if (map[i] === T.DoorB9 || map[i] === T.DoorBB) {
    map[i]--;
    g.viewDirty |= 2;
    await castEffect(g, 2);
    return 1;
  }
  for (let a = 0; a < 0x20; a++) {
    const actor = s.actors[a];
    if (actor.tile === 1 && actor.x === s.dx && actor.y === s.dy && (s.mapId > 0x7f || actor.z === s.level)) {
      actor.b5 &= 0x7f;
      g.bumped.set(thingKey(g, s.dx, s.dy), 'disarmed'); // the bump opens it next (bumpAct.ts)
      await castEffect(g, 2);
      return 1;
    }
  }
  return 0;
}

/** CAST_043e_AnCorpXen: the undead flee. */
async function anCorpXen(g: Game): Promise<void> {
  await castEffect(g, 2);
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (
      !immune(g, i) &&
      (c.flags & (CF.Player | CF.Monster)) === CF.Monster &&
      (enemyFlags(g, c.who) & 0xff & EF.Undead) !== 0 &&
      !resists(g, g.s.combatTurn, i)
    ) {
      c.hp = 1;
      c.flags |= CF.F2;
    }
  }
}

/** CAST2_06ec: the party's position in latitude and longitude, in runes. */
export function position(g: Game): void {
  const s = g.s;
  const t = g.text;
  t.font = 1;
  g.printChar('\n');
  g.printChar(((s.y & 0xf0) >> 4) + 0x41);
  g.printChar("'");
  g.printChar((s.y & 0xf) + 0x41);
  g.say(0x9548); // "\", "
  g.printChar(((s.x & 0xf0) >> 4) + 0x41);
  g.printChar("'");
  g.printChar((s.x & 0xf) + 0x41);
  g.printChar('"');
  t.font = 0;
  g.printChar('\n');
}

/** CAST_04b0_KalXen: summon a creature (rat, spider, bat or snake) to fight for the party. */
async function kalXen(g: Game): Promise<number> {
  const s = g.s;
  await castEffect(g, 2);
  const r = g.random(0, 0xf);
  const kind = r < 6 ? 0x14 : r < 0xb ? 0x16 : r < 0xe ? 0x15 : 0x22;
  for (let misses = 0; ; ) {
    if (!randomSquare(g) || !arenaFree(g, 0x90, s.dx, s.dy)) {
      if (++misses >= 8) return 0;
      continue;
    }
    const i = placeCombatant(g, kind, 0, s.dx, s.dy, s.level);
    if (i < 0) return 0;
    const a = s.actors[g.combat[i].actor];
    a.anim = a.tile = A.Circle;
    const { reveal } = await import('./effects.ts');
    await reveal(g, kind * 4 + 0x140, s.dx, s.dy);
    a.anim = a.tile = kind * 4 + 0x40;
    charm(g, i, 'bound'); // summoned, for good
    spawned(g, i);
    return 1;
  }
}

/** CAST_05dc_InPor: blink: in combat to a random square; outdoors as far as the grass goes in a direction. */
async function inPor(g: Game): Promise<number> {
  const s = g.s;
  if (s.mapId > 0x7f) {
    const c = g.combat[s.combatTurn];
    const a = s.actors[c.actor];
    if (s.combatFlags & 2) return 0;
    await castEffect(g, 3);
    for (let n = 0; n < 7; n++) {
      if (!randomSquare(g) || !arenaFree(g, a.tile, s.dx, s.dy)) continue;
      a.x = c.x = s.dx;
      a.y = c.y = s.dy;
      return 1;
    }
    return 0;
  }
  if ((await castDirection(g)) === 0) return -1;
  await castEffect(g, 3);
  const dx = s.dx - s.x;
  const dy = s.dy - s.y;
  const right = Math.min(s.chunkX + 0x20, 0x100);
  const bottom = Math.min(s.chunkY + 0x20, 0x100);
  let moved = 0;
  let x = s.dx & 0xff;
  for (let y = s.dy & 0xff; s.chunkX <= x && x < right && s.chunkY <= y && y < bottom; y += dy) {
    if (tileAt(g, x, y) === T.Grass) {
      moved = -1;
      s.x = x;
      s.y = y;
      g.viewDirty = 1;
    }
    x += dx;
  }
  if (moved !== 0) {
    const { enterWorld } = await import('./outdoors.ts');
    enterWorld(g);
  }
  return moved;
}

/** CAST_074c_QuasWis: the invisible are seen. */
async function quasWis(g: Game): Promise<void> {
  await castEffect(g, 4);
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (c.flags !== 0 && (c.flags & CF.Player) === 0 && (c.flags & CF.Invisible) !== 0) {
      c.flags &= ~CF.Invisible;
      const a = g.s.actors[c.actor];
      a.anim = a.tile;
      overlayActors(g);
      drawView(g);
    }
  }
}

/** CAST_07b4_BetInXen: a swarm of insects for the party. */
async function betInXen(g: Game): Promise<number> {
  const s = g.s;
  await castEffect(g, 5);
  let found = false;
  for (let n = 0; n < 8 && !found; n++) found = randomSquare(g) && arenaFree(g, 0xbc, s.dx, s.dy);
  if (!found) return 0;
  let any = 0;
  for (let n = 0; n < 4; n++) {
    const i = placeCombatant(g, 0x1f, 0, s.dx, s.dy, s.level);
    if (i < 0) break;
    charm(g, i, 'bound'); // summoned, for good
    spawned(g, i);
    any = 1;
  }
  return any;
}

/** CAST_0846_AnExPor: lock a door by magic. */
async function anExPor(g: Game): Promise<number> {
  const s = g.s;
  if ((await castDirection(g)) === 0) return -1;
  await castEffect(g, 5);
  const [map, i] = tileCell(g, s.dx, s.dy);
  if (map[i] === T.DoorB8 || map[i] === T.DoorB9) map[i] = T.T97;
  else if (map[i] === T.DoorBA || map[i] === T.DoorBB) map[i] = T.T98;
  else return 0;
  g.viewDirty |= 2;
  return 1;
}

/** CAST2_0768: unlock a magically locked door (the spell and the skull key). */
async function unlockMagic(g: Game): Promise<number> {
  const s = g.s;
  if ((await castDirection(g)) === 0) return -1;
  const [map, i] = tileCell(g, s.dx, s.dy);
  if (map[i] === T.T97) map[i] = T.DoorB8;
  else if (map[i] === T.T98) map[i] = T.DoorBA;
  else return 0;
  g.viewDirty |= 2;
  return 1;
}

/** CAST_08ac_ManiVas: great healing (in combat only while the battle is undecided... as the original has it). */
async function maniVas(g: Game): Promise<number> {
  const s = g.s;
  const m = await onWho(g, 'hurt');
  if (m < 0) return -1;
  if (s.members[m].status === Status.Dead || (s.mapId > 0x7f && s.battleWon === 0)) return 0;
  s.members[m].hp = s.members[m].maxHp;
  await castEffect(g, 5);
  g.vitalsDirty = 1;
  return 1;
}

/** CAST_091e_InPorVasYlem: an earthquake: foes who fail a dexterity roll are hurt. */
async function inPorVasYlem(g: Game, caster: number): Promise<void> {
  const s = g.s;
  await castEffect(g, 6);
  await shakeScreen(g);
  for (let i = 0; i < 0x20; i++) {
    if (g.combat[i].flags === 0 || !onMonsterSide(g, i)) continue;
    if (stat(g, i, Q.Dex) <= roll(g)) {
      await hitFlash(g, i, true);
      const p = s.members[caster];
      p.exp = upTo(p.exp, await damage(g, i, g.random(1, 0x14)), 9999);
      await report(g, i, s.combatTurn);
    }
  }
}

/** CAST_09a0_AnExXen: charm (or free) a creature. */
async function anExXen(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x45bb); // "Creature: "
  if ((await aim(g, s.combatTurn, 0xf)) === 0) return -1;
  await castEffect(g, 6);
  if ((tileAt(g, s.crossX, s.crossY) & 0xfe) === T.T84) return 0;
  const i = combatantAt(g, s.crossX, s.crossY);
  if (i < 0 || immune(g, i) || !onMonsterSide(g, i) || resists(g, s.combatTurn, i)) return 0;
  g.combat[i].flags ^= CF.Charmed;
  // (Charmed now, by the caster - or freed: Game.charmedBy, for the eased rules' roll.)
  if (g.combat[i].flags & CF.Charmed) g.charmedBy.set(i, s.combatTurn);
  else {
    g.charmedBy.delete(i);
    released(g, i); // a daemon within, cast out (combat.ts castOut)
  }
  if (g.combat[i].flags & CF.Player) {
    s.members[g.combat[i].who].status = Status.Good;
    drawVitals(g);
  }
  sayName(g, i);
  g.say(0x45c6); // " charmed!\n"
  return -1;
}

/** CAST_0a5c_BetRelXen: a creature becomes a rat. */
async function betRelXen(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x45d1); // "Creature: "
  if ((await aim(g, s.combatTurn, 0xf)) === 0) return -1;
  await castEffect(g, 6);
  const i = combatantAt(g, s.crossX, s.crossY);
  if (i < 0 || immune(g, i) || resists(g, s.combatTurn, i)) return 0;
  const { x, y } = g.combat[i];
  removeCombatant(g, -i - 1);
  placeCombatant(g, 0x14, 0, x, y, s.level);
  return 1;
}

/** CAST_0afe_LorSanct: the caster turns invisible. */
async function lorSanct(g: Game): Promise<number> {
  const c = g.combat[g.s.combatTurn];
  g.s.actors[c.actor].anim = A.Invisible;
  c.flags |= CF.Invisible;
  await castEffect(g, 7);
  return 1;
}

/** CAST_0b28_InQuasXen: a creature is cloned. */
async function inQuasXen(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x45dc); // "Creature: "
  // Its crosshair first on the nearest friend: a copy is to fight for the party, and one of a foe would fight it.
  if ((await aim(g, s.combatTurn, 0xf, true)) === 0) return -1;
  await castEffect(g, 7);
  const i = combatantAt(g, s.crossX, s.crossY);
  if (i < 0) return 0;
  const actor = s.actors.findIndex((a) => a.tile === 0);
  if (actor < 0) return 0;
  const slot = g.combat.findIndex((c) => c.flags === 0);
  if (slot < 0) return 0;
  g.combat[slot].b.set(g.combat[i].b);
  g.combat[slot].actor = actor;
  s.actors[actor].b.set(s.actors[g.combat[i].actor].b);
  // The original tries random squares until one is free.
  for (let n = 0; n < 1000; n++) {
    if (randomSquare(g) && arenaFree(g, A.Avatar, s.dx, s.dy)) {
      s.actors[actor].x = g.combat[slot].x = s.dx;
      s.actors[actor].y = g.combat[slot].y = s.dy;
      return 1;
    }
  }
  removeCombatant(g, -slot - 1);
  return 0;
}

/** CAST_0c98_CorpInQuas: all creatures flee in fear. */
async function corpInQuas(g: Game): Promise<void> {
  await castEffect(g, 7);
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if ((c.flags & (CF.Player | CF.Monster)) === CF.Monster && !immune(g, i) && !resists(g, g.s.combatTurn, i)) {
      c.hp = 1;
      c.flags |= CF.F2;
    }
  }
}

/** CAST_0cf0_PorRelVas: to a buried moonstone's place. */
async function porRelVas(g: Game): Promise<number> {
  if ((g.s.partyTile & 0xf0) === 0x20) return 0;
  g.say(0x45e7); // "To phase: "
  const k = await getDigit(g, false, 8); // the phase of the moon whose stone it is, 1 to 8
  if (k > 0x20) g.printChar(k);
  g.printChar('\n');
  // No phase given (B, the space bar): the spell is not cast after all - its mixture and magic kept, no turn spent.
  if (k < 0x31 || k > 0x39) {
    g.cancelled = true;
    return 0;
  }
  if (k >= 0x31 && k <= 0x38) {
    await castEffect(g, 8);
    if (await toMoonstone(g, k - 0x31)) return -1;
  }
  return 0;
}

/** CAST_0d4c_AnTym: time stops (not before a Shadowlord). */
async function anTym(g: Game): Promise<number> {
  await castEffect(g, 8);
  if (g.s.actors.some((a) => a.tile === 0xfc)) {
    g.say(0x45f2); // "Magic absorbed!\n"
    if (!g.soundOff) await g.sound.pulse(0x2648, 1, 28000, 1000, 2);
    return 0;
  }
  g.s.icon = 0x54;
  g.s.protection = 10;
  drawVitals(g);
  return -1;
}

/** CAST2_04c2: a daemon comes: charmed (or not, if the caster fails an intelligence roll; a scroll never fails). */
async function summonDaemon(g: Game, scroll: boolean): Promise<number> {
  const s = g.s;
  await castEffect(g, scroll ? 5 : 8);
  for (let n = 0; n < 8; n++) {
    if (!randomSquare(g) || !arenaFree(g, 0xd8, s.dx, s.dy) || tileAt(g, s.dx, s.dy) === 0xff) continue;
    const i = placeCombatant(g, 0x26, 0, s.dx, s.dy, s.level);
    if (i < 0) return 0;
    if (!g.soundOff) await g.sound.pulse(0xac8, 1, 12000, 500, 5);
    const a = s.actors[g.combat[i].actor];
    a.tile = a.anim = A.Circle;
    const { reveal } = await import('./effects.ts');
    await reveal(g, 0x1d8, s.dx, s.dy);
    a.tile = a.anim = 0xd8;
    spawned(g, i); // bound or not
    if (!scroll && roll(g) >= stat(g, s.combatTurn, Q.Int)) {
      g.say(0x9532); // "Oops...\n"
      return -1;
    }
    charm(g, i, 'bound'); // summoned, for good
    return 1;
  }
  return 0;
}

/** CAST2_046c: everything around is seen for a while, walls or no. */
async function seeAll(g: Game): Promise<void> {
  const s = g.s;
  buildView(g, -1, s.x - s.chunkX, s.y - s.chunkY);
  for (let n = 0; n < 0x14; n++) {
    if (s.icon !== 0x54) animateActors(g);
    overlayActors(g);
    drawView(g);
    await sleepTicks(g, 1);
  }
  g.viewDirty = 1;
  updateFrame(g);
}

/** CAST2_07bc: dispel a field: in a dungeon, here or before the party; in combat, in a direction. */
async function dispelField(g: Game, spell: boolean): Promise<number> {
  const s = g.s;
  if (s.mapId < 0x80) {
    // The original reads the dungeon map here even outdoors (past its end); only dungeons have fields to dispel.
    if (s.mapId <= 0x20) return 0;
    if (spell) await castEffect(g, 4);
    let at = s.level * 0x40 + s.y * 8 + s.x;
    if ((s.dungeon[at] & 0xf0) !== 0x80) {
      at = s.level * 0x40 + ((s.y + g.data.swords(0x24de, 4)[s.facing]) & 7) * 8 + ((s.x + g.data.swords(0x24d6, 4)[s.facing]) & 7);
    }
    if ((s.dungeon[at] & 0xf0) !== 0x80) return 0;
    s.dungeon[at] &= 8;
    g.say(0x954c); // "Field destroyed!\n"
    return -1;
  }
  if ((await castDirection(g)) === 0) return -1;
  if (spell) await castEffect(g, 4);
  for (let a = 0; a < 0x20; a++) {
    const actor = s.actors[a];
    if ((actor.tile & 0xfc) === 0xe8 && actor.x === s.dx && actor.y === s.dy) {
      removeCombatant(g, a + 1);
      return 1;
    }
  }
  return 0;
}

/** CAST_1bb0: one spark of a wave at pixel (x, y); false when it hits the edge or a wall. The cell is left in (dx, dy). */
function spark(g: Game, x: number, y: number, pen: number): boolean {
  const s = g.s;
  if (x < 8 || x > 0xb6 || y < 8 || y > 0xb6) {
    s.dx = s.dy = -1;
    return false;
  }
  g.draw.pen = pen;
  g.draw.plot(x, y);
  g.draw.plot(x + 1, y);
  if ((y & 1) === 0) return true;
  cellAt(g, x, y);
  return s.dx >= 0 && s.dy >= 0 ? passable(g, s.dx, s.dy) : false;
}

/** CAST_1c36: a wave of 21 sparks from the caster's side in `dir`, spreading as it goes; the cells it reaches that hold someone. */
async function wave(g: Game, pen: number, caster: number, dir: number): Promise<[number, number][]> {
  const s = g.s;
  let x0 = g.combat[caster].x * 16 + 8;
  let y0 = g.combat[caster].y * 16 + 8;
  if (dir === K.Up) x0 += 8;
  else if (dir === K.Right) {
    x0 += 0x10;
    y0 += 8;
  } else if (dir === K.Left) y0 += 8;
  else if (dir === K.Down) {
    x0 += 8;
    y0 += 0x10;
  }
  pen += 8;
  const spread = g.data.words(0x1cf0, 0x15);
  const acc = [...spread];
  const xs = Array<number>(0x15).fill(x0);
  const ys = Array<number>(0x15).fill(y0);
  const done = Array<boolean>(0x15).fill(false);
  const hits: [number, number][] = [];
  let finished = 0;
  while (finished < 0x15) {
    finished = 0;
    for (let k = 0; k < 0x15; k++) {
      if (done[k]) {
        finished++;
        continue;
      }
      const n = g.rng.upTo(0xf);
      for (let j = 0; j < n; j++) {
        if (!spark(g, xs[k], ys[k], pen)) {
          done[k] = true;
        } else if (hits.length < 0x3f && s.dx > -1 && s.dy > -1 && s.dx < 0xb && s.dy < 0xb && g.view[s.dy * 32 + s.dx] === 0) {
          hits.push([s.dx, s.dy]);
          g.view[s.dy * 32 + s.dx] = 0xff;
        }
        if (!done[k]) {
          acc[k] -= 10;
          if (dir === K.Left) xs[k]--;
          else if (dir === K.Right) xs[k]++;
          else if (dir === K.Up) ys[k]--;
          else ys[k]++;
          if (acc[k] < 1) {
            const side = k < 10 ? -1 : 1;
            if (dir === K.Left) ys[k] -= side;
            else if (dir === K.Right) ys[k] += side;
            else if (dir === K.Up) xs[k] += side;
            else xs[k] -= side;
            acc[k] += spread[k];
          }
        }
        if (done[k]) break;
      }
    }
    await g.p.sleep(3);
  }
  return hits;
}

/** CAST_1f60: a wave spell: 1 sleep, 2 poison, 3 fire, 4 death, on those it reaches. */
async function waveSpell(g: Game, caster: number, kind: number, pen: number): Promise<void> {
  const s = g.s;
  const who = s.members[g.combat[caster].who];
  const dir = await castDirection(g);
  if (dir === 0) return;
  if (!g.soundOff) void g.sound.noise(800, kind === 1 ? 16000 : kind === 2 ? 0x4b00 : 0x5140, 700);
  const hits = await wave(g, pen, caster, dir);
  for (const [x, y] of hits) {
    for (let i = 0x1f; i > -1; i--) {
      const c = g.combat[i];
      if (c.x !== x || c.y !== y || (c.timer & 0x80) !== 0 || (c.flags & CF.Dead) !== 0 || c.flags === 0) continue;
      c.timer |= 0x80;
      switch (kind) {
        case 1:
          if (!resists(g, caster, i) && !immune(g, i)) {
            await hitFlash(g, i, true);
            putToSleep(g, i);
            await report(g, i, caster);
          }
          break;
        case 2:
          if (stat(g, i, Q.Dex) <= roll(g)) {
            await hitFlash(g, i, true);
            await poison(g, i, caster);
            await report(g, i, caster);
          }
          break;
        case 3:
          await hitFlash(g, i, true);
          who.exp = upTo(who.exp, await damage(g, i, g.rng.upTo(0x1e)), 9999);
          await report(g, i, caster);
          break;
        case 4:
          if (!resists(g, caster, i) && !immune(g, i)) {
            await hitFlash(g, i, true);
            who.exp = upTo(who.exp, await damage(g, i, 99), 9999);
            await report(g, i, caster);
          }
          break;
      }
      break;
    }
  }
  for (const c of g.combat) c.timer &= 0x7f;
}

/** CAST_0dba_CastSpellCmd: Cast: the caster, the words, where it may be cast, the mixture, the points, the spell. */
/** A spell the moment calls for, ready to cast: which spell, by whom, and what the menu calls it. */
export interface Shortcut {
  spell: number;
  caster: number;
  label: string;
  /** Whom it is for, where the spell asks (a heal, a cure). */
  on?: number;
}

/** Whether `who` can cast `spell` here and now: the circle learnt, the mana there, a mixture on hand. */
export function canCast(g: Game, who: number, spell: number): boolean {
  const s = g.s;
  const circle = Math.trunc(spell / 6) + 1;
  const p = s.members[who];
  if (s.mixtures[spell] === 0) return false;
  if (p.status !== Status.Good && p.status !== Status.Poisoned) return false;
  if (p.level < circle || p.mp < circle) return false;
  const where = g.data.bytes(0x1c90, 0x30)[spell];
  if (s.mapId === 0) return (where & 8) !== 0;
  if (s.mapId > 0x7f) return (where & 1) !== 0;
  if ((s.mapId === 0x12 && s.crown === 0) || s.mapId === 0x1d) return false; // absorbed here
  return (where & (s.mapId < 0x21 ? 4 : 2)) !== 0;
}

/** Whoever can cast it with the most mana to spare - in a fight, the member whose turn it is, if they can - or -1. */
function bestCaster(g: Game, spell: number): number {
  const s = g.s;
  // In a fight only the member whose turn it is acts: another's mana is not theirs to spend.
  if (s.mapId > 0x7f) {
    const who = g.combat[s.combatTurn]?.who ?? -1;
    return who >= 0 && who < s.partySize && canCast(g, who, spell) ? who : -1;
  }
  let best = -1;
  for (let i = 0; i < s.partySize; i++) {
    if (!canCast(g, i, spell)) continue;
    if (best < 0 || s.members[i].mp > s.members[best].mp) best = i;
  }
  return best;
}

/** Spells by index, as SPELL_EFFECTS names them. */
export const AN_SANCT = 6;
const LIGHT = 0;
const HEAL = 4;
const CURE = 3;
const GREAT_LIGHT = 12;
const GREAT_HEAL = 27;

/** Who can unlock a chest with An Sanct now (bumpAct.ts): in a fight, the member whose turn it is, if they can; -1 for none. */
export function unlockCaster(g: Game): number {
  return bestCaster(g, AN_SANCT);
}

/**
 * Who can cast An Sanct on a won field's chests (loot.ts): any member who can, the most mana first - the fight is
 * won, so it is nobody's turn. None where a cast in the fight would be absorbed. -1 for none.
 */
export function unlockAnyCaster(g: Game): number {
  const s = g.s;
  if (s.icon === 0x4e || (s.crown === 0 && s.savedMapId === 0x12)) return -1;
  let best = -1;
  for (let i = 0; i < s.partySize; i++) {
    if (!canCast(g, i, AN_SANCT)) continue;
    if (best < 0 || s.members[i].mp > s.members[best].mp) best = i;
  }
  return best;
}

/** An Sanct on chest `actor`, cast by `who` (loot.ts): its mixture and mana spent, and its trap gone for certain. */
export async function unlockChest(g: Game, actor: number, who: number): Promise<void> {
  const s = g.s;
  const circle = Math.trunc(AN_SANCT / 6) + 1;
  s.mixtures[AN_SANCT]--;
  s.members[who].mp -= circle;
  const a = s.actors[actor];
  a.b5 &= 0x7f;
  g.bumped.set(thingKey(g, a.x, a.y), 'disarmed');
  g.vitalsDirty = 1;
  await castEffect(g, circle);
}

/** The first spell the moment calls for (shortcutCasts), or null. */
export function shortcutCast(g: Game): Shortcut | null {
  return shortcutCasts(g)[0] ?? null;
}

/**
 * The spells the moment calls for, each where someone can cast it: a heal
 * while anyone is hurt, a cure while anyone is poisoned - both, where both
 * are wanted - and a light in the dark (the port's, from the ultima3
 * port). The greater spell is offered when the need is great and it can be
 * cast.
 */
export function shortcutCasts(g: Game): Shortcut[] {
  const ready: Shortcut[] = [];
  const s = g.s;
  const members = Array.from({ length: s.partySize }, (_, i) => s.members[i]);
  const offer = (spell: number): Shortcut | null => {
    const caster = bestCaster(g, spell);
    return caster < 0 ? null : { spell, caster, label: `Cast (${SPELL_EFFECTS[spell]})` };
  };
  /** Who the spell is for: the one who needs it most. */
  const worst = (pick: (m: (typeof members)[number]) => boolean, by: (m: (typeof members)[number]) => number): number => {
    let at = -1;
    for (let i = 0; i < members.length; i++) {
      if (!pick(members[i])) continue;
      if (at < 0 || by(members[i]) < by(members[at])) at = i;
    }
    return at;
  };
  const hurt = members.filter((m) => m.status !== Status.Dead && m.hp < m.maxHp);
  if (hurt.length) {
    const sore = hurt.some((m) => m.hp * 2 < m.maxHp);
    const heal = (sore ? offer(GREAT_HEAL) : null) ?? offer(HEAL);
    if (heal) {
      heal.on = worst(
        (m) => m.status !== Status.Dead && m.hp < m.maxHp,
        (m) => m.hp / Math.max(1, m.maxHp),
      );
      ready.push(heal);
    }
  }
  if (members.some((m) => m.status === Status.Poisoned)) {
    const cure = offer(CURE);
    if (cure) {
      cure.on = worst(
        (m) => m.status === Status.Poisoned,
        (m) => m.hp,
      );
      ready.push(cure);
    }
  }
  // Underground, or out at night, with nothing alight.
  if (s.light === 0 && (s.mapId > SETTLEMENTS || s.hour < 5 || s.hour > 19)) {
    const light = offer(GREAT_LIGHT) ?? offer(LIGHT);
    if (light) ready.push(light);
  }
  return ready;
}

export async function castCommand(g: Game): Promise<number> {
  g.casting = true; // its aim marked as a spell's (combat.ts crosshair); cleared at the next prompt
  const s = g.s;
  let turn = 1;
  s.d5890 = s.d588f = 1;
  // A spell chosen from the command menu is cast as it stands: the caster, the spell and whom it is for.
  const preset = g.castPreset;
  g.castPreset = null;
  g.castOn = preset?.on ?? null;
  // The caster chosen with the party's mana in view (magicPanel.ts), where it is asked - the bar on the one with the
  // most spells they could cast here and now (the port's). With a controller, where nobody could cast a thing, it is
  // said why rather than the choice offered, every spell of every caster grey (the Avatar's no mana, at the start).
  const ready = (m: number): number => EVERY_SPELL.filter((sp) => able(g, m, sp) && worksHere(g, sp) !== false).length;
  if (!preset && g.options.input === 'controller' && s.mapId < 0x80) {
    const casters = [...Array(s.partySize).keys()].filter((m) => isCaster(g, m));
    if (casters.length && !casters.some((m) => ready(m) > 0)) {
      const mixedHere = EVERY_SPELL.some((sp) => s.mixtures[sp] !== 0 && worksHere(g, sp) !== false);
      if (mixedHere) g.print('Not enough mana!\n');
      else g.say(0x463a); // "None mixed!\n"
      g.cancelled = true;
      return 0;
    }
  }
  const caster = preset ? preset.caster : await withManaPanel(g, () => whoActs(g, (m) => isCaster(g, m), ready));
  if (caster < 0) return caster;
  if (!preset)
    g.say(0x4603); // "Spell name:\n:"
  else if (!g.inCombat) {
    // Chosen from the command menu, the caster and the spell said as the asking would have them: who casts it, and
    // what (the port's - "Cast..." and the one healed said nothing of who had healed them). In a fight the turn's
    // own line names them.
    g.say(0xa3c4); // "Player: "
    g.print(`${s.members[preset.caster].name}\n${SPELL_EFFECTS[preset.spell]}\n`);
  }
  const spell = preset ? preset.spell : await selectSpell(g, true, caster);
  if (spell === -1) {
    g.say(0x4611); // "None!\n"
    g.cancelled = true;
    return turn;
  }
  if (spell === -2) {
    g.say(0x4618); // "No effect!\n"
    return turn;
  }
  const circle = Math.trunc(spell / 6) + 1;
  s.d588f = circle;
  const where = g.data.bytes(0x1c90, 0x30)[spell];
  let allowed: boolean;
  if (s.mapId === 0) allowed = (where & 8) !== 0;
  else if (s.mapId > 0x7f) allowed = (where & 1) !== 0;
  else {
    if ((s.mapId === 0x12 && s.crown === 0) || s.mapId === 0x1d) {
      g.say(0x4624); // "Absorbed!\n"
      if (!g.soundOff) await g.sound.pulse(0x2648, 1, 28000, 1000, 2);
      return turn;
    }
    allowed = (where & (s.mapId < 0x21 ? 4 : 2)) !== 0;
  }
  if (!allowed) {
    g.say(0x462f); // "Not here!\n"
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
    return turn;
  }
  if (s.mixtures[spell] === 0) {
    g.say(0x463a); // "None mixed!\n"
    return turn;
  }
  s.mixtures[spell]--;
  if (s.mapId > 0x80) g.lastSpell.set(caster, spell);
  const p = s.members[caster];
  let result: number;
  let spent = false;
  if (p.mp < circle) {
    g.say(0x4647); // "M.P. too low!\n"
    // The mixture kept for when the mana is there (the port's: 1988 wasted it, spent before the mana was counted).
    s.mixtures[spell]++;
    result = 0;
  } else {
    p.mp -= circle;
    spent = true;
    result = -1;
    if (p.level < circle) result = 0;
    else {
      const me = s.combatTurn;
      switch (spell) {
        case 0x00: // In Lor
          s.d58a6 = 100;
          await castEffect(g, 1);
          break;
        case 0x01: // Grav Por
          await attackSpell(g, 0x30);
          break;
        case 0x02:
          result = await anZu(g);
          break;
        case 0x03:
          result = await anNox(g);
          break;
        case 0x04:
          result = await mani(g);
          break;
        case 0x05:
          result = await anYlem(g);
          break;
        case 0x06:
          result = await anSanct(g);
          break;
        case 0x07:
          await anCorpXen(g);
          break;
        case 0x08: {
          // Rel Hur
          const dir = await castDirection(g);
          await changeWind(g, dir, false);
          break;
        }
        case 0x09: // In Wis
          await castEffect(g, 2);
          position(g);
          break;
        case 0x0a:
          result = await kalXen(g);
          break;
        case 0x0b: // In Mani Xen: food
          await castEffect(g, 2);
          s.food = upTo(s.food, g.random(1, 3), 9999);
          g.vitalsDirty = 1;
          result = 1;
          break;
        case 0x0c: // Vas Lor
          s.d58a6 = 0xff;
          await castEffect(g, 3);
          break;
        case 0x0d: // Flam Por
          await attackSpell(g, 0x31);
          break;
        case 0x0e:
        case 0x0f:
        case 0x10:
          result = await fieldSpell(g, spell - 0x0e);
          break;
        case 0x11:
          result = await inPor(g);
          break;
        case 0x12:
          result = await dispelField(g, true);
          break;
        case 0x13: // In Sanct
          await lasting(g, 0x50, 0x14, 4);
          break;
        case 0x14:
          result = await fieldSpell(g, 3);
          break;
        case 0x15: // Uus Por
        case 0x16: // Des Por
          if (s.mapId === 40) {
            result = 0;
            break;
          }
          await castEffect(g, 4);
          {
            const { dungeonKlimb, dungeonExit } = await import('./dungeon.ts');
            if (await dungeonKlimb(g, spell === 0x15 ? -1 : 1, true)) await dungeonExit(g);
          }
          break;
        case 0x17:
          await quasWis(g);
          break;
        case 0x18:
          result = await betInXen(g);
          break;
        case 0x19:
          result = await anExPor(g);
          break;
        case 0x1a:
          result = await unlockMagic(g);
          if (result !== -1) await castEffect(g, 5);
          break;
        case 0x1b:
          result = await maniVas(g);
          break;
        case 0x1c: // In Zu
          await waveSpell(g, me, 1, Colour.magenta);
          break;
        case 0x1d: // Rel Tym
          await lasting(g, 0x51, 0x1e, 5);
          break;
        case 0x1e:
          await inPorVasYlem(g, caster);
          break;
        case 0x1f: // Quas An Wis
          await lasting(g, 0x43, 0x14, 6);
          break;
        case 0x20: // In An: negate magic
          await lasting(g, 0x4e, 10, 6);
          break;
        case 0x21:
          await castEffect(g, 6);
          await seeAll(g);
          break;
        case 0x22:
          result = await anExXen(g);
          break;
        case 0x23:
          result = await betRelXen(g);
          break;
        case 0x24:
          result = await lorSanct(g);
          break;
        case 0x25: // Corp Por
          await attackSpell(g, 0x32);
          break;
        case 0x26:
          result = await inQuasXen(g);
          break;
        case 0x27: // In Quas Wis: view
          await castEffect(g, 7);
          if (s.mapId < 0x21) await viewGem(g, s.x, s.y);
          else {
            const { dungeonView } = await import('./dungeon.ts');
            await dungeonView(g);
          }
          break;
        case 0x28: // In Nox Hur
          await waveSpell(g, me, 2, Colour.green);
          break;
        case 0x29:
          await corpInQuas(g);
          break;
        case 0x2a: // In Mani Corp
          result = resurrect(g, await onWho(g, 'dead'), false);
          if (result === 1) await castEffect(g, 8);
          drawVitals(g);
          break;
        case 0x2b:
          result = await summonDaemon(g, false);
          break;
        case 0x2c: // In Corp Hur
          await waveSpell(g, me, 4, Colour.blue);
          break;
        case 0x2d: // In Flam Hur
          await waveSpell(g, me, 3, Colour.red);
          break;
        case 0x2e:
          result = await porRelVas(g);
          if (result !== 0) turn = 0;
          break;
        case 0x2f:
          result = await anTym(g);
          break;
      }
    }
  }
  // A spell backed out of at its own prompt - whom, which way - was never cast: the mixture and the magic points
  // are the caster's still, and no turn is spent (the ultima3 port's; the original kept both).
  if (g.cancelled) {
    s.mixtures[spell]++;
    if (spent) p.mp += circle;
    return turn;
  }
  if (result === 1)
    g.say(0x4656); // "Success!\n"
  else if (result === 0) {
    g.say(0x4660); // "Failed!\n"
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
  }
  return turn;
}

/** CAST2_040a_ChangeWindDirection: the wind turns to blow toward `dir` (0 calm), by spell or scroll. */
async function changeWind(g: Game, dir: number, scroll: boolean): Promise<void> {
  if (dir === 0 && !scroll) return;
  await castEffect(g, scroll ? 1 : 2);
  const to: Record<number, number> = { [K.Up]: 1, [K.Down]: 2, [K.Right]: 3, [K.Left]: 4, 0: 0 };
  if (to[dir] !== undefined) setWind(g, to[dir]);
}

// --- Mixing ---------------------------------------------------------------------------------------

/** CMDS_18be: tick reagents in a list in the stats window; the mask of those chosen, -1 if cancelled. */
async function chooseReagents(g: Game): Promise<number> {
  const s = g.s;
  const t = g.text;
  const held: number[] = [];
  for (let i = 0; i < 8; i++) if (s.reagents[i] !== 0) held.push(i);
  const names = g.data.table(0x19d2, 8);
  t.select(1);
  t.setWindow(1, 0x18, 1, 0x26, 9);
  g.printChar(0xff);
  t.setWindow(1, 0x18, 1, 0x27, 9);
  g.draw.pen = 15;
  g.draw.line(0xbf, 0x38, 0xbf, 0x3f);
  g.draw.line(0x138, 0x38, 0x138, 0x3f);
  g.draw.pen = 0;
  g.draw.fill(0xc0, 0x38, 0x137, 0x3f);
  borderTitle(g, g.t(0x8f64)); // "Reagents:"
  for (const r of held) {
    g.printChar('\n');
    g.printChar(' ');
    g.printNumber(s.reagents[r], 2, '0');
    g.printChar(' ');
    g.print(names[r]);
  }
  // M mixes what is ticked. A controller has no M: it gets a last line to choose instead (the port's).
  const mixRow = g.options.input === 'controller' && held.length < 9 ? held.length : -1;
  if (mixRow >= 0) {
    g.printChar('\n');
    g.print('    Mix');
  }
  const last = mixRow >= 0 ? mixRow : held.length - 1;
  let row = 0;
  let mask = 0;
  invertMember(g, 1);
  for (let done = false; !done; ) {
    t.select(2);
    switch (await getChar(g)) {
      case K.Left:
      case K.Up:
        if (row > 0) {
          invertMember(g, row + 1);
          row--;
          invertMember(g, row + 1);
        }
        break;
      case K.Right:
      case K.Down:
        if (row < last) {
          invertMember(g, row + 1);
          row++;
          invertMember(g, row + 1);
        }
        break;
      case 0x4d:
        done = true;
        g.say(0x8f6e); // "\n\n"
        break;
      case K.Enter:
      case K.Space: {
        if (row === mixRow) {
          done = true;
          t.select(2);
          g.say(0x8f6e); // "\n\n"
          break;
        }
        const bit = 0x80 >> held[row];
        mask ^= bit;
        t.select(1);
        t.moveTo(3, row + 1);
        g.printChar(0xfd);
        g.printChar(mask & bit ? 0xf : 0x20);
        g.printChar(0xfd);
        break;
      }
      case K.Escape:
        mask = -1;
        done = true;
        g.printChar('\n');
        break;
    }
  }
  invertMember(g, row + 1);
  t.select(2);
  return mask;
}

/** CMDS_1a70: how many mixtures (enough of every reagent chosen). */
async function howMuch(g: Game, mask: number): Promise<number> {
  const s = g.s;
  for (;;) {
    g.say(0x8f72); // "How much? "
    const n = await getNumber(g, 2);
    let ok = true;
    if (n !== 0) {
      for (let i = 0; i < 8; i++) {
        if (mask & (0x80 >> i) && s.reagents[i] < n) {
          g.say(0x8f7e); // "Insufficient reagents!\n\n"
          ok = false;
          break;
        }
      }
    }
    if (ok) return n;
  }
}

/**
 * Mix on a controller (the port's): the spell, then how many - the reagents are the spell's own recipe, read from the
 * player's files, so a mixture is never wrong; the spinner goes no higher than the party's reagents make (a spell
 * they make none of is greyed in the list). The keyboard keeps the 1988 way: the reagents ticked by hand.
 */
async function mixBySpell(g: Game): Promise<void> {
  const s = g.s;
  // Spell after spell (the port's): the list again after each mixing, the bar on the spell just mixed, until B.
  let mixed = false;
  for (;;) {
    const spell = await selectSpell(g, false, -1, true);
    if (spell === -1) {
      if (mixed) return;
      g.say(0x8fbe); // "\nNone!\n"
      g.cancelled = true; // nothing mixed: no turn spent, as a command backed out of spends none
      return;
    }
    const most = makeable(g, spell);
    if (most === 0) {
      g.say(0x8f7e); // "Insufficient reagents!\n\n"
      continue;
    }
    g.say(0x8f72); // "How much? "
    const { amount } = await import('./menu.ts');
    const n = await amount(g, 1, most, 1, { title: 'How many?', caption: () => `Can make ${most}` });
    if (n <= 0) {
      // None (B): said, where "How much?" was left unanswered - and nothing mixed, back to the list.
      g.say(0x94fe); // "None!"
      g.printChar('\n');
      continue;
    }
    g.print(String(n));
    g.printChar('\n');
    g.say(0x8ff0); // "Mixing...\n"
    if (s.mapId > 0x20) await g.p.sleep(TICK_MS * 10);
    else await sleepTicks(g, 10);
    for (const r of recipe(g, spell)) s.reagents[r] -= n;
    g.say(0x8ffc); // "\nDone!\n"
    s.mixtures[spell] = Math.min(s.mixtures[spell] + n, 99);
    g.lastMix = spell;
    mixed = true;
    drawVitals(g);
    // Nothing left that the reagents make: done, rather than a list all grey.
    if (!EVERY_SPELL.some((sp) => makeable(g, sp) > 0)) return;
  }
}

/** CMDS_1ad8_MixCmd: Mix: the spell, its reagents, how many; the wrong recipe blows up in the mixer's face. */
export async function mixCommand(g: Game): Promise<number> {
  const s = g.s;
  if (s.reagents.every((r) => r === 0)) {
    g.say(0x8f98); // "No reagents owned!\n"
    return 1;
  }
  g.say(0x8fac); // "For what spell?\n:"
  // A controller mixes by the spell alone (mixBySpell); the keyboard ticks the reagents, as in 1988.
  if (g.options.input === 'controller') {
    await mixBySpell(g);
    clearBorderTitle(g);
    clearSpellBar(g);
    drawVitals(g);
    return 1;
  }
  const spell = await selectSpell(g);
  if (spell === -1) {
    g.say(0x8fbe); // "\nNone!\n"
  } else {
    g.printChar('\n');
    for (const c of [0x1b, 0x2c, 0x1a, 0x2c, 0x18, 0x2c, 0x19]) g.printChar(c);
    g.say(0x8fc6); // " to move,\nRETURN selects.\nType M to mix:"
    const mask = await withFullPanel(g, () => chooseReagents(g)); // its list needs the panel's nine rows (layout.ts)
    if (mask >= 0) {
      const n = await howMuch(g, mask);
      if (n > 0) {
        if (mask === 0) {
          g.say(0x9004); // "\nNothing to mix!\n"
        } else {
          g.say(0x8ff0); // "Mixing...\n"
          if (s.mapId > 0x20) await g.p.sleep(TICK_MS * 10);
          else await sleepTicks(g, 10);
          for (let i = 0; i < 8; i++) if (mask & (0x80 >> i)) s.reagents[i] -= n;
          if (spell >= 0 && g.data.bytes(0x1cc0, 0x30)[spell] === mask) {
            g.say(0x8ffc); // "\nDone!\n"
            s.mixtures[spell] = Math.min(s.mixtures[spell] + n, 99);
          } else {
            g.printChar('\n');
            const { firstActive } = await import('./time.ts');
            const { springTrap } = await import('./items.ts');
            await springTrap(g, firstActive(g));
          }
        }
      }
    }
  }
  clearBorderTitle(g);
  clearSpellBar(g);
  drawVitals(g);
  return 1;
}

// --- Items ----------------------------------------------------------------------------------------

/** CAST_11de_UseScroll. */
async function useScroll(g: Game, n: number): Promise<number> {
  const s = g.s;
  let ok = 1;
  s.scrolls[n]--;
  g.say(0x466a); // "Scroll\n\n"
  // The port names the scroll by what it does; its words are spoken here as it is read.
  g.print(scrollWords(g, n));
  g.printChar('\n');
  switch (n) {
    case 0:
      s.d58a6 = 0xf0;
      g.say(0x4673); // "Light!\n"
      await castEffect(g, 0);
      break;
    case 1: {
      g.say(0x467b); // "Wind change!\n"
      const dir = await castDirection(g);
      // Passed (B, X): the scroll is not read after all, and kept (the port's, as a backed-out cast keeps its mana).
      if (dir === 0) {
        s.scrolls[n]++;
        ok = -1;
      } else if (s.mapId < 0x21) await changeWind(g, dir, true);
      else ok = 0;
      break;
    }
    case 2:
      g.say(0x4689); // "Protection!\n"
      await lasting(g, 0x50, 100, 2);
      break;
    case 3:
      g.say(0x4696); // "Negate magic!\n"
      await lasting(g, 0x4e, 0x14, 3);
      break;
    case 4:
      g.say(0x46a5); // "View!\n"
      if (s.mapId > 0x7f) {
        g.say(0x46ac); // "Not here!\n"
      } else {
        await castEffect(g, 4);
        if (s.mapId < 0x21) await viewGem(g, s.x, s.y);
        else {
          const { dungeonView } = await import('./dungeon.ts');
          await dungeonView(g);
        }
      }
      break;
    case 5:
      g.say(0x46b7); // "Summon Daemon!\n"
      if (s.mapId > 0x7f) ok = await summonDaemon(g, true);
      else g.say(0x46c7); // "Not here!\n"
      break;
    case 6:
      g.say(0x46d2); // "Resurrection!\n"
      if (s.mapId < 0x80) {
        const who = await onWho(g, 'dead');
        if (who < 0) {
          // On nobody (B): kept, and no turn spent.
          s.scrolls[n]++;
          g.cancelled = true;
          ok = -1;
          break;
        }
        ok = resurrect(g, who, true);
        if (ok === 1) await castEffect(g, 6);
        drawVitals(g);
      } else {
        g.say(0x46e1); // "Not here!\n"
      }
      break;
    case 7:
      if (s.mapId === 0x1d || s.mapId === 0x28) {
        g.say(0x46ec); // "No effect!\n"
        if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
        break;
      }
      g.say(0x46f8); // "Negate time!\n"
      await lasting(g, 0x54, 0x14, 7);
      break;
  }
  return ok;
}

/** CAST_135a_UsePotion: by colour, though now and then a potion is not what it seemed. */
export async function usePotion(g: Game, n: number): Promise<number> {
  const s = g.s;
  let ok = 1;
  s.potions[n]--;
  g.say(0x4706); // "Potion\n"
  // Given to whoever the potion is for (blue to the sleeping, yellow to the hurt, red to the poisoned).
  const m = s.mapId > 0x7f ? g.combat[s.combatTurn].who : await onWho(g, (['asleep', 'hurt', 'poisoned'] as const)[n]);
  if (m < 0) {
    // Given to nobody (B): not drunk, and no turn spent.
    s.potions[n]++;
    g.cancelled = true;
    return m;
  }
  await castEffect(g, n);
  const r = g.random(0, 0xf);
  if (r === 0) n = 4;
  else if (r === 1) n = g.random(0, 7);
  const p = s.members[m];
  const me = g.combat[s.combatTurn];
  const noEffect = (): void => g.say(0x474c); // "\nNo noticeable effect now!\n"
  switch (n) {
    case 0: // blue: awaken
      if (p.status !== Status.Sleeping) ok = 0;
      else {
        p.status = Status.Good;
        if (s.mapId > 0x7f) {
          if (m === me.who && (me.flags & (CF.Player | CF.Monster | CF.Dead | CF.Asleep)) === (CF.Player | CF.Asleep))
            wake(g, s.combatTurn);
          else ok = 0;
        } else {
          drawVitals(g);
        }
      }
      break;
    case 1: // yellow: heal
      ok = heal(g, m);
      if (ok) {
        g.say(0x470e); // "Healed!\n"
        drawVitals(g);
      }
      break;
    case 2: // red: cure
      if (p.status !== Status.Poisoned) ok = 0;
      else {
        p.status = Status.Good;
        g.say(0x4717); // "Poison cured!\n"
        drawVitals(g);
      }
      break;
    case 3: // green: poison
      if (p.status !== Status.Good) ok = 0;
      else {
        p.status = Status.Poisoned;
        g.say(0x4726); // "POISONED!\n"
        drawVitals(g);
      }
      break;
    case 4: // orange: sleep
      if (p.status !== Status.Good) ok = 0;
      else {
        // The original passes the member where the combatant is meant; the sleeper is found by member here.
        if (s.mapId < 0x80) p.status = Status.Sleeping;
        else {
          const i = g.combat.findIndex((c) => (c.flags & CF.Player) !== 0 && c.who === m);
          if (i >= 0) putToSleep(g, i);
        }
        g.say(0x4731); // "Slept!\n"
        drawVitals(g);
      }
      break;
    case 5: // purple: the drinker becomes a rat
      if (s.mapId > 0x7f) {
        g.say(0x4739); // "Poof!\n"
        const a = s.actors[me.actor];
        a.tile = a.anim = 0x90;
      } else noEffect();
      break;
    case 6: // black: invisibility
      if (s.mapId > 0x7f) {
        me.flags |= CF.Invisible;
        g.say(0x4740); // "Invisible!\n"
        const a = s.actors[me.actor];
        a.tile = a.anim = A.Invisible;
      } else noEffect();
      break;
    case 7: // white: see all
      if (s.mapId < 0x21) await seeAll(g);
      else noEffect();
      break;
  }
  return ok;
}

/** CAST_153c_UseMoonstone: buried where the party stands, outdoors or in a town, in soft ground. */
function useMoonstone(g: Game, n: number): void {
  const s = g.s;
  const t = tileAt(g, s.x, s.y);
  g.say(0x4768); // "Moonstone "
  if (s.mapId < 0x21 && (t === T.CropsPicked || t === T.Crops || (t > 3 && t < 0xb))) {
    g.say(0x4773); // "buried!\n"
    s.moonstoneX[n] = s.x;
    s.moonstoneY[n] = s.y;
    s.moonstoneHeld[n] = s.mapId;
    s.moonstoneZ[n] = s.level;
  } else {
    g.say(0x477c); // "cannot be buried here!\n"
  }
}

/** CAST_15b4_UseGemShard: held up before a Shadowlord at its flame, the shard destroys it. */
async function useShard(g: Game, n: number): Promise<void> {
  const s = g.s;
  g.say(0x4794); // "Gem Shard\n\nThou dost hold above thee the evil Shard of "
  g.say([0x47cc, 0x47d9, 0x47e3][n]); // "Falsehood..." "Hatred..." "Cowardice..."
  if (!g.soundOff) {
    for (let f = 2000; f < 25000; f += 0x32) await g.sound.pulse(0xa50, 1, 200, f, 0);
    for (let f = 25000; f > 2000; f -= 0x32) await g.sound.pulse(0xa50, 1, 200, f, 0);
  }
  if (
    g.data.bytes(0x4882, 3)[n] !== s.x ||
    g.data.bytes(0x4886, 3)[n] !== s.y ||
    g.data.bytes(0x488a, 3)[n] !== s.mapId ||
    g.data.bytes(0x488e, 3)[n] !== s.level
  ) {
    g.say(0x47f0); // "\n\nNo effect!\n"
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
    return;
  }
  await sleepTicks(g, 7);
  g.say(0x47fe); // "\n\n...and cast it into the Flame of "
  g.say([0x4822, 0x482a, 0x4831][n]); // "Truth!\n" "Love!\n" "Courage!\n"
  for (let i = 0; i < 3; i++) await shakeScreen(g);
  await sleepTicks(g, 3);
  if (actorTileAt(g, s.x, s.y - 1, s.level) !== 0xfc || n !== s.d58cb) return;
  const { removeNpc, npcOfActor } = await import('./town.ts');
  removeNpc(g, npcOfActor(g, s.dx));
  for (let i = 0; i < 7; i++) await explosion(g, s.x, s.y - 1);
  s.shadowlords[n] = 0xff;
  s.shards[n] = 0;
  s.npcKilled[0x70] |= g.data.bytes(0x4892, 3)[n];
  g.say(0x483b); // "\nThe doom of the Shadowlord "
  g.say([0x4858, 0x4861, 0x486a][n]); // "Faulinei" "Astaroth" "Nosfentor"
  g.say(0x4874); // " is wrought!\n"
  if (!g.soundOff) {
    for (let i = 0; i < 3; i++) await g.sound.pulse(0x11f8, 1, 0x2a30, 300, 6);
    await g.sound.pulse(0x17d4, 1, 0x5460, 300, 3);
  }
}

/** CAST_1764: taking off a worn item of the regalia; false if it was worn (and is now removed). */
function notWorn(g: Game, icon: number): boolean {
  if (icon !== g.regalia) return true;
  g.say(0x4895); // "Removed!\n"
  setRegalia(g, 0);
  return false;
}

/**
 * The regalia worn, in a slot of their own (the port's; 1988 kept them in the lasting spell's, where a spell cast or a
 * night's rest took their power away without a word). One at a time: another put on takes the last one's place.
 */
async function wearRegalia(g: Game, item: number, effect = 0): Promise<void> {
  if (effect) await castEffect(g, effect);
  setRegalia(g, item);
}

/** The regalia slot set, and shown: the party box's top border names what is worn (Standard), the letter slot (EGA). */
function setRegalia(g: Game, item: number): void {
  g.regalia = item;
  drawVitals(g);
  clearBorderTitle(g);
}

/** CAST_1792_UseCmd: Use an item: scrolls, potions, moonstones, the regalia, shards, and the rest. */
/**
 * Wielding the Sceptre (Use, item 0x14): the strange walls in the squares round the party dissolve (not in a
 * dungeon's passages); where there are none, a field is dispelled.
 */
export async function wieldSceptre(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x495a); // "Wielding the Sceptre"
  g.say(0x4a84); // " of Lord British...\n"
  if (!g.soundOff) await g.sound.pulse(0x1450, 1, 50000, 5000, 1);
  let dissolved = 0;
  if (s.mapId < 0x21 || s.mapId > 0x28) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const [map, i] = tileCell(g, dx + s.x, dy + s.y);
        if ((map[i] & 0xf0) === T.T70) {
          map[i] = T.Grass;
          g.viewDirty |= 2;
          updateFrame(g);
          if (!g.soundOff) await g.sound.noise(10, 3000, 2000);
          dissolved++;
        }
      }
    }
  }
  if (dissolved !== 0) return;
  const r = await dispelField(g, false);
  if (r === 1)
    g.say(0x496f); // "Field dissolved!\n"
  else if (r === 0) g.say(0x4981); // "No effect!\n"
}

export async function useCommand(g: Game): Promise<number> {
  // The list of items needs the panel's nine rows (layout.ts).
  return withFullPanel(g, () => useItem(g));
}

async function useItem(g: Game): Promise<number> {
  const s = g.s;
  let ok = 1;
  const counts = itemCounts(g);
  const first = nextHeld(g, -1, 0x26, counts, 0xff);
  if (first === -1) {
    g.say(0x489f); // "No usable items!\n"
    return 1;
  }
  g.say(0x48b1); // "Item: "
  let item: number;
  if (g.options.input === 'controller') {
    // A pad player's list is a menu over the map (zstats.ts pickFromMenu); the stats pane stays as it is.
    item = await pickItem(g, first, 0xff, 0x55);
  } else {
    g.draw.pen = 15;
    g.draw.line(0xbf, 0x38, 0xbf, 0x3f);
    g.draw.line(0x138, 0x38, 0x138, 0x3f);
    g.draw.pen = 0;
    g.draw.fill(0xc0, 0x38, 0x137, 0x3f);
    g.text.select(1);
    borderTitle(g, g.t(0x48b8)); // "Items:"
    listBox(g, 8);
    item = await pickItem(g, first, 0xff, 0x55);
    clearBorderChar(g);
    clearBorderTitle(g);
    clearSpellBar(g);
    drawVitals(g);
  }
  if (item < 0) return 1;
  if (item < 8) ok = await useScroll(g, item);
  else if (item < 0x10) ok = await usePotion(g, item - 8);
  else if (item > 0x14 && item < 0x1d) useMoonstone(g, item - 0x15);
  else {
    switch (item) {
      case 0x10:
        g.say(0x48bf); // "Carpet\n\n"
        if (s.mapId < 0x21 && tileAt(g, s.x, s.y) !== 0xc) {
          if (s.partyTile === A.Avatar) {
            g.say(0x48c8); // "Boarded!\n"
            s.partyTile = g.random(0, 1) + A.FlyingCarpet;
            s.carpets--;
          } else if ((s.partyTile & 0xf8) === 0x20) {
            g.say(0x48d2); // "X-it ship first!\n"
          } else {
            g.say(0x48e4); // "Only on foot!\n"
          }
        } else {
          g.say(0x48f3); // "Not here!\n"
        }
        break;
      case 0x11:
        s.skullKeys--;
        g.say(0x48fe); // "Skull Key\n"
        if (s.mapId < 0x21 || s.mapId > 0x7f) {
          ok = await unlockMagic(g);
          // Passed at its direction: kept, and nothing bursts on the party's own square.
          if (ok < 0) s.skullKeys++;
          else if (ok !== 0 && s.mapId < 0x80) await explosion(g, s.dx, s.dy);
        } else {
          g.say(0x4909); // "Not here!\n"
        }
        break;
      case 0x12:
        g.say(0x4914); // "Amulet\n\n"
        if (!notWorn(g, 0xe)) break;
        g.say(0x491d); // "Wearing the Amulet"
        g.say(0x4a84); // " of Lord British...\n"
        await wearRegalia(g, 0xe, 9);
        break;
      case 0x13:
        g.say(0x4930); // "Crown\n\n"
        if (!notWorn(g, 0x1c)) break;
        g.say(0x4938); // "Thou dost don the Crown"
        g.say(0x4a84); // " of Lord British...\n"
        await wearRegalia(g, 0x1c, 9);
        break;
      case 0x14:
        g.say(0x4950); // "Sceptre\n\n"
        await wieldSceptre(g);
        break;
      case 0x1d:
      case 0x1e:
      case 0x1f:
        await useShard(g, item - 0x1d);
        break;
      case 0x20:
        g.say(0x498d); // "Spyglass\n\n"
        if (s.mapId < 0x21 && s.level < 0x80) {
          if (s.hour < 6 || s.hour > 0x12) {
            g.say(0x4998); // "Looking...\n"
            await nightSky(g);
          } else {
            g.say(0x49a4); // "No stars!\n"
          }
        } else {
          g.say(0x49af); // "Not here!\n"
        }
        break;
      case 0x21:
        g.say(0x49ba); // "Plans\n\n"
        if ((s.partyTile & 0xf8) === 0x20) {
          s.hmsCapePlans |= 0x80;
          g.say(0x49c2); // "Ship rigged for double speed!\n"
        } else {
          g.say(0x49e1); // "Only usable on shipboard!\n"
        }
        break;
      case 0x22:
        g.say(0x49fc); // "Sextant\n\n"
        if (s.level > 0x7f || s.mapId !== 0)
          g.say(0x4a06); // "Only outdoors!\n"
        else if (s.hour > 5 && s.hour < 0x13)
          g.say(0x4a16); // "Only at night!\n"
        else {
          g.say(0x4a26); // "Position:"
          position(g);
        }
        break;
      case 0x23: {
        g.say(0x4a30); // "Watch\n\nThe pocket watch reads "
        const h = s.hour % 12 || 12;
        g.printNumber(h, 1, ' ');
        g.printChar(':');
        g.printNumber(s.minute, 2, '0');
        g.say(s.hour > 0xb ? 0x4a4f : 0x4a55); // " PM.\n" : " AM.\n"
        break;
      }
      case 0x24:
        g.say(0x4a5b); // "Badge\n\n"
        if (notWorn(g, 0x1d)) {
          g.say(0x4a63); // "Badge worn!\n"
          await wearRegalia(g, 0x1d);
        }
        break;
      case 0x25:
        g.say(0x4a70); // "Box\n\nHow?\n"
        break;
    }
  }
  if (ok === 0) {
    g.say(0x4a7b); // "Failed!\n"
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
  }
  return 1;
}
