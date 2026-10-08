/**
 * switchWeapon.ts
 *
 * Switch Weapon (the port's): a fight's quick change between a member's melee arms and their ranged. Each member
 * remembers the last melee arms and the last ranged arms they held - a sling, bow, crossbow, magic bow or flask of oil
 * is ranged, every other weapon melee (a dagger, spear or axe to throw among them) - and Switch Weapon takes up the
 * other of the two: from melee to ranged, and from ranged, or from no weapon at all (bare hands, a shield alone, a bow
 * with no arrows), to melee.
 *
 * Where what was remembered is gone - the arrows spent, a spear thrown away, the party's only bow in another's hands -
 * what is still there is taken up and the rest chosen, and it is said why ("No arrows - Crossbow!"). The choice goes
 * by the member's style: two weapons, weapon and shield, or both hands to one weapon. A style is the member's
 * starting arms (INIT.GAM) - Iolo's two blades, Shamino's sword and shield - or, where those leave a hand empty, their
 * class's (a bard's two weapons, a fighter's or a mage's weapon and shield; the Avatar weapon and shield); and what
 * the player readies by hand becomes it. Melee is the most damage, then the most defence, then the lightest; ranged
 * the magic bow, crossbow, bow, sling, then oil, as there is ammunition for them.
 *
 * Never remembered nor chosen: the glass sword and the Chaos sword, nor the jewelled sword and shield, which do
 * nothing in a fight. The memory is the session's, by member (the party's order changes as companions come and go):
 * a game loaded begins it afresh.
 */

import type { Game } from './game.ts';
import { Save } from './save.ts';
import { hasAmmo, isShield, unequip } from './zstats.ts';

/** How a member fights hand to hand. */
export type Style = 'dual' | 'shield' | 'twoHanded';

/** What a member's hands hold: melee arms, ranged arms, or no weapon at all (null). */
export type ArmsKind = 'melee' | 'ranged';

/** What Switch Weapon would do: the arms it takes up, and why it is not what was remembered (or null). */
export interface SwitchPlan {
  to: ArmsKind;
  items: number[];
  missing: string | null;
}

/** The ranged weapons, and the order they are chosen in where none is remembered: magic bow, crossbow, bow, sling, oil. */
const RANGED_ORDER = [0x24, 0x1c, 0x1a, 0x11, 0x13];
/** The shields chosen for a weapon and shield, best first: magic, spiked (a blow besides), large, small. */
const SHIELD_ORDER = [0x07, 0x06, 0x05, 0x04];
/** Never remembered nor chosen: the Chaos sword, the glass sword, the jewelled sword (no harm done) and shield (no guard). */
const IGNORED = [0x23, 0x27, 0x28, 0x08];

const HAND = 0x20;
const HANDS = 0x30;

const kindOf = (g: Game, item: number): number => g.data.bytes(0x1a7e, 0x30)[item];
const damageOf = (g: Game, item: number): number => g.data.bytes(0x15fc, 0x38)[item];
const defenceOf = (g: Game, item: number): number => g.data.bytes(0x1634, 0x30)[item];
const weightOf = (g: Game, item: number): number => g.data.bytes(0x1aae, 0x30)[item];

/** A weapon held in the hands (not a shield, not ammunition). */
const isWeapon = (g: Game, item: number): boolean =>
  !isShield(item) && damageOf(g, item) > 0 && (kindOf(g, item) === HAND || kindOf(g, item) === HANDS);
const isRanged = (item: number): boolean => RANGED_ORDER.includes(item);

/** What member `m` holds in their hands. */
export function handsOf(g: Game, m: number): number[] {
  const e = g.s.members[m].equips;
  return [e[2], e[3]].filter((v) => v !== 0xff);
}

/**
 * The kind of arms in these hands: ranged where a ranged weapon there can shoot (a bow with no arrows cannot), melee
 * where a weapon there strikes, else none (null) - bare hands, a shield alone, the jewelled sword.
 */
export function armsKind(g: Game, hands: number[]): ArmsKind | null {
  if (hands.some((i) => isRanged(i) && hasAmmo(g, i))) return 'ranged';
  if (hands.some((i) => isWeapon(g, i) && !isRanged(i) && i !== 0x28)) return 'melee';
  return null;
}

/** The style these hands show, or null where they show none (one weapon and a hand empty, or a ranged weapon). */
function styleShown(g: Game, hands: number[]): Style | null {
  const weapons = hands.filter((i) => isWeapon(g, i) && !isRanged(i));
  if (weapons.some((i) => kindOf(g, i) === HANDS)) return 'twoHanded';
  if (weapons.length === 2) return 'dual';
  if (weapons.length === 1 && hands.some(isShield)) return 'shield';
  return null;
}

/** The memory's key for member `m`: the Avatar is always the first; a companion goes by name, wherever they stand. */
const keyOf = (g: Game, m: number): string => (m === 0 ? '\u0000Avatar' : g.s.members[m].name);

function memoryOf(g: Game, m: number): { melee?: number[]; ranged?: number[]; style?: Style } {
  const key = keyOf(g, m);
  let mem = g.armsMemory.get(key);
  if (!mem) g.armsMemory.set(key, (mem = {}));
  return mem;
}

/** INIT.GAM's party, as the game begins it, for the starting arms each member's style is read from. */
const initial = new WeakMap<object, Save>();
function startingRoster(g: Game): Save | null {
  const file = g.data.files.get('INIT.GAM');
  if (!file) return null;
  let save = initial.get(file);
  if (!save) initial.set(file, (save = new Save(file)));
  return save;
}

/**
 * Member `m`'s style: what they last readied by hand, else what their starting arms show, else their class's - a
 * bard's two weapons, anyone else's weapon and shield. The Avatar begins with weapon and shield.
 */
export function styleOf(g: Game, m: number): Style {
  const mem = memoryOf(g, m);
  if (mem.style) return mem.style;
  const member = g.s.members[m];
  if (m !== 0) {
    const roster = startingRoster(g);
    const start = roster?.members.find((p) => p.name === member.name);
    if (start) {
      const shown = styleShown(
        g,
        [start.equips[2], start.equips[3]].filter((v) => v !== 0xff),
      );
      if (shown) return shown;
    }
    if (member.cls === 0x42) return 'dual';
  }
  return 'shield';
}

/**
 * What member `m` holds now, remembered as their melee or ranged arms - not where the glass sword, the Chaos sword
 * or the jewelled sword or shield is among them, nor where there is no weapon. After Ready (`readied`), a melee
 * set that shows a style becomes the member's style.
 */
export function rememberArms(g: Game, m: number, readied = false): void {
  const hands = handsOf(g, m);
  if (hands.some((i) => IGNORED.includes(i))) return;
  const kind = armsKind(g, hands);
  if (!kind) return;
  const mem = memoryOf(g, m);
  mem[kind] = [...hands];
  if (readied && kind === 'melee') {
    const shown = styleShown(g, hands);
    if (shown) mem.style = shown;
  }
}

/** How many of `item` member `m` could take up: the party's pack, and what is in their own hands. */
const have = (g: Game, m: number, item: number): number => g.s.equipment[item] + handsOf(g, m).filter((i) => i === item).length;

/** The weight member `m` wears where no weapon goes, carried whatever the hands take up. */
function wornElsewhere(g: Game, m: number): number {
  const e = g.s.members[m].equips;
  let kept = 0;
  for (const k of [0, 1, 4, 5]) if (e[k] !== 0xff) kept += weightOf(g, e[k]);
  return kept;
}

/** Whether member `m` could hold `items` now: each to be had (two of one where two are wanted), and not too heavy. */
function canHold(g: Game, m: number, items: number[]): boolean {
  for (const i of new Set(items)) if (have(g, m, i) < items.filter((j) => j === i).length) return false;
  if (items.some((i) => IGNORED.includes(i) || (isRanged(i) && !hasAmmo(g, i)))) return false;
  return wornElsewhere(g, m) + items.reduce((n, i) => n + weightOf(g, i), 0) <= g.s.members[m].str;
}

/** Why remembered arms cannot be taken up: "No arrows", "No quarrels", "No Spear" - or that one is too heavy. */
function whyNot(g: Game, m: number, items: number[]): string {
  const names = g.data.table(0x17f6, 0x30);
  for (const i of items) {
    if ((i === 0x1a || i === 0x24) && !hasAmmo(g, i)) return 'No arrows';
    if (i === 0x1c && !hasAmmo(g, i)) return 'No quarrels';
    if (have(g, m, i) < items.filter((j) => j === i).length) return `No ${(names[i] ?? '').trim()}`;
  }
  return 'Too heavy';
}

/** Melee weapons best first: the most damage, then the most defence (the main gauche's parry), then the lightest. */
function ranked(g: Game, items: number[]): number[] {
  return [...items].sort((a, b) => damageOf(g, b) - damageOf(g, a) || defenceOf(g, b) - defenceOf(g, a) || weightOf(g, a) - weightOf(g, b));
}

/**
 * Every melee set member `m` could take up, in the order their style prefers them: for two weapons the pairs, then a
 * weapon and shield, then a two-handed weapon; for weapon and shield those first, then pairs; for two hands the
 * two-handed weapons first, then pairs - and one weapon alone last of all. Within each, the most damage first, then
 * the most defence, then the lightest; a shield the magic, spiked, large, then small.
 */
function meleeSets(g: Game, m: number, style: Style): number[][] {
  const at = (i: number): boolean => have(g, m, i) > 0 && !IGNORED.includes(i) && isWeapon(g, i) && !isRanged(i);
  const all = Array.from({ length: 0x30 }, (_, i) => i).filter(at);
  const one = ranked(
    g,
    all.filter((i) => kindOf(g, i) === HAND),
  );
  const two = ranked(
    g,
    all.filter((i) => kindOf(g, i) === HANDS),
  );
  const shields = SHIELD_ORDER.filter((i) => have(g, m, i) > 0);
  const score = (set: number[]): [number, number, number] => [
    set.reduce((n, i) => n + damageOf(g, i), 0),
    set.reduce((n, i) => n + defenceOf(g, i), 0),
    -set.reduce((n, i) => n + weightOf(g, i), 0),
  ];
  const pairs: number[][] = [];
  one.forEach((a, k) => one.slice(k).forEach((b) => (a !== b || have(g, m, a) > 1) && pairs.push([a, b])));
  pairs.sort((x, y) => {
    const [a, b] = [score(x), score(y)];
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  });
  const shielded = one.flatMap((w) => shields.map((sh) => [w, sh]));
  const twoHanded = two.map((w) => [w]);
  const alone = one.map((w) => [w]);
  const order: Record<Style, number[][][]> = {
    dual: [pairs, shielded, twoHanded, alone],
    shield: [shielded, pairs, twoHanded, alone],
    twoHanded: [twoHanded, pairs, shielded, alone],
  };
  return order[style].flat().filter((set) => canHold(g, m, set));
}

/** Whether `set` holds everything in `keep`, two of one where two are kept. */
const holdsAll = (set: number[], keep: number[]): boolean =>
  keep.every((i) => set.filter((j) => j === i).length >= keep.filter((j) => j === i).length);

/**
 * What Switch Weapon would do for member `m` now - the arms it would take up, or the reason it can take up none
 * ("No ranged weapon!", "Nothing to switch to!"). Nothing is changed.
 */
export function planSwitch(g: Game, m: number): SwitchPlan | string {
  const now = armsKind(g, handsOf(g, m));
  const to: ArmsKind = now === 'melee' ? 'ranged' : 'melee';
  const remembered = memoryOf(g, m)[to];
  if (remembered && canHold(g, m, remembered)) return { to, items: remembered, missing: null };
  const missing = remembered ? whyNot(g, m, remembered) : null;
  if (to === 'ranged') {
    const ranged = RANGED_ORDER.find((i) => canHold(g, m, [i]));
    if (ranged !== undefined) return { to, items: [ranged], missing };
    return missing ? `${missing}!` : 'No ranged weapon!';
  }
  // What is still there of the melee arms remembered is kept, and the rest chosen by the member's style.
  const sets = meleeSets(g, m, styleOf(g, m));
  const keep = (remembered ?? []).filter((i, _, all) => have(g, m, i) >= all.filter((j) => j === i).length && !IGNORED.includes(i));
  const set = sets.find((s) => holdsAll(s, keep)) ?? sets[0];
  if (!set) return 'Nothing to switch to!';
  return { to, items: set, missing };
}

/** Member `m`'s hands made to hold `items`: what is not wanted back to the pack, then the rest from it. */
function takeUp(g: Game, m: number, items: number[]): void {
  const s = g.s;
  const e = s.members[m].equips;
  const wanted = [...items];
  for (const k of [2, 3]) {
    const old = e[k];
    if (old === 0xff) continue;
    const at = wanted.indexOf(old);
    if (at >= 0 && !items.some((i) => kindOf(g, i) === HANDS && i !== old)) {
      wanted.splice(at, 1);
      continue;
    }
    unequip(g, m, old);
    if (s.equipment[old] < 99) s.equipment[old]++;
  }
  for (const item of wanted) {
    const k = kindOf(g, item) === HANDS || e[2] === 0xff ? 2 : 3;
    e[k] = item;
    s.equipment[item]--;
  }
}

/**
 * Switch Weapon for member `m`: the other of their melee and ranged arms taken up (planSwitch). What is said, and
 * whether anything changed - where nothing did, no turn is spent.
 */
export function switchWeapon(g: Game, m: number): { said: string; done: boolean } {
  rememberArms(g, m);
  const plan = planSwitch(g, m);
  if (typeof plan === 'string') return { said: plan, done: false };
  takeUp(g, m, plan.items);
  rememberArms(g, m);
  const names = g.data.table(0x17f6, 0x30);
  const took = `${plan.items.map((i) => (names[i] ?? '').trim()).join(' and ')}!`;
  return { said: plan.missing ? `${plan.missing} - ${took}` : took, done: true };
}
