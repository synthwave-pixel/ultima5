/**
 * autocombat.ts
 *
 * Auto combat (the Pause menu's line): each turn on the party's side is
 * played for the player, as keys the combat code reads like any other:
 * strike a foe in reach (with the weapon's reach), aim a missile at the
 * nearest in range, else close with the nearest foe, stepping round
 * whatever blocks the way; with the field won, leave it. All plays every
 * such turn, and any key pressed hands the party back. Allies plays every
 * one but the Avatar's - the other members, and the creatures summoned or
 * charmed to the party's side - while the player plays the Avatar: keys
 * are the player's then, and one pressed in an ally's turn is let go; the
 * field won, the allies wait for the Avatar to leave it. One of the party
 * charmed against it is struck as a foe with the Classic rules, as in
 * 1988, and let alone with the Modern, the charm wearing off.
 */

import { actorTileAtRev, treasureLies } from './actors.ts';
import { arenaFree, autoPlaysTurn, avatarAt, canStrike, combatantAt, distance, keepsLastThrown, onMonsterSide } from './combat.ts';
import { CF, Game } from './game.ts';
import { K } from './io.ts';
import { eased, saveOptions } from './settings.ts';
import { armsKind, handsOf, planSwitch } from './switchWeapon.ts';
import { THROWN } from './zstats.ts';
import { T } from './tiles.ts';
import { tileAt } from './world.ts';

/** How long each automatic key waits, so the fight can be followed. */
const PACE_MS = 120;

let lastPlace = '';
let stuck = 0;
/**
 * Party turns in a row with no foe hurt and none down (Game.autoIdle): past this the fight is going nowhere - foes
 * out of reach, blows that never land, an ally striking at a wall - and the player takes over.
 */
const MAX_IDLE = 30;
/** Keys in a row spent moving the crosshair. */
let aiming = 0;
/** Whether the player has been told, this fight, that the field is won and there is treasure on it. */
let toldOfTreasure = false;
const MAX_AIMING = 40;

/** How far apart two squares are for a weapon: the game's own measure (combat.ts distance), as the crosshair is held to. */
const reach = (x1: number, y1: number, x2: number, y2: number): number => distance(x1, y1, x2, y2);
/** Beside: next to it, the diagonals too. */
const beside = (x1: number, y1: number, x2: number, y2: number): boolean => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= 1;

/** How far a creature's own blow reaches (combat.ts attackWith, D_159c): a neighbour, or its missile's range. */
function creatureReach(g: Game, kind: number): number {
  return Math.max(1, g.data.bytes(0x159c, 0x30)[kind] ?? 1);
}

/** Where auto combat last took up other arms: not again from the same place and the same hands (switchWanted). */
let lastSwitch = '';

/**
 * Whether member combatant `me` should Switch Weapon now: from a ranged weapon with a foe beside them (where a
 * ranged attack is interrupted), or from no weapon at all (the last arrow loosed puts the bow away), to their melee
 * arms; from melee arms with no foe within their reach nor within 3 squares (a switch is a turn each way, a foe so
 * near closed with sooner), to their ranged - a dagger, spear or axe to throw reaching only as far as the arm here, so
 * that a bow is drawn before the stock is thrown away. Only where Switch Weapon would
 * take up the arms wanted, and not twice from the same place with the same hands.
 */
function switchWanted(g: Game, me: (typeof g.combat)[number], foes: { x: number; y: number }[]): boolean {
  const hands = handsOf(g, me.who);
  const kind = armsKind(g, hands);
  const ranges = g.data.bytes(0x1664, 0x38);
  const arm = Math.max(1, ...hands.filter((i) => !THROWN.includes(i)).map((i) => ranges[i] ?? 0));
  const near = Math.min(...foes.map((f) => reach(f.x, f.y, me.x, me.y)));
  const besideMe = foes.some((f) => beside(f.x, f.y, me.x, me.y));
  const want = kind === null || (kind === 'ranged' && besideMe) ? 'melee' : kind === 'melee' && near > Math.max(3, arm) ? 'ranged' : null;
  if (!want) return false;
  const plan = planSwitch(g, me.who);
  if (typeof plan === 'string' || plan.to !== want) return false;
  // Not of itself to arms that are used up as they are thrown - the party's flasks of oil: the player's to spend.
  if (want === 'ranged' && plan.items.some((i) => THROWN.includes(i))) return false;
  const place = `${g.s.combatTurn},${me.x},${me.y},${hands.join('.')}`;
  if (place === lastSwitch) return false;
  lastSwitch = place;
  return true;
}

/** Whether the Avatar is on the field and can take a turn: alive, awake, and not charmed or possessed against the party. */
function avatarActs(g: Game): boolean {
  const i = avatarAt(g);
  return i >= 0 && (g.combat[i].flags & (CF.Dead | CF.Asleep | CF.Charmed)) === 0 && !onMonsterSide(g, i);
}

/**
 * The fight going nowhere, or somewhere only the player can take it: All is turned off (saved so), and the player
 * plays from here; Allies is held for the rest of this fight, and is there for the next.
 */
function handBack(g: Game): void {
  if (g.options.autoCombat === 'allies') {
    g.autoHeld = true;
    return;
  }
  g.options.autoCombat = 'off';
  saveOptions(g.options);
}

/** The key auto combat presses now, or 0 to leave it to the player. */
export async function autoKey(g: Game): Promise<number> {
  const s = g.s;
  const allies = g.options.autoCombat === 'allies';
  // With Allies the player plays the Avatar, the keys theirs: nothing is taken from them on the Avatar's turn.
  if (allies && (s.combatTurn > 0x1f || !autoPlaysTurn(g))) return 0;
  if (g.p.pollKey() !== 0 && !allies) {
    g.options.autoCombat = 'off';
    saveOptions(g.options);
    return 0;
  }
  if (s.combatTurn > 0x1f) return 0;
  const me = g.combat[s.combatTurn];
  // The party's own - its members, and the creatures summoned or charmed to its side, whose turns are asked as a
  // member's are (they waited on a press, every one of them, where auto combat played the members).
  if (onMonsterSide(g, s.combatTurn)) return 0;
  const member = (me.flags & CF.Player) !== 0;
  // One of the party charmed against it: a foe with the Classic rules, as 1988's player had to strike them; with the
  // Modern let alone - the charm wears off (combat.ts shakeCharm), and a blow could kill the Avatar.
  const spared = (i: number): boolean =>
    eased(g.options) && (g.combat[i].flags & (CF.Player | CF.Charmed | CF.Dead)) === (CF.Player | CF.Charmed);
  const foes = g.combat.filter(
    (c, i) => c.flags !== 0 && (c.flags & CF.Dead) === 0 && (c.flags & CF.Invisible) === 0 && onMonsterSide(g, i) && !spared(i),
  );
  foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
  await g.p.sleep(PACE_MS);
  if (s.crosshair !== 0) {
    // Aiming that goes nowhere (a foe the crosshair cannot be brought to) is given up, and the fight handed back.
    if (++aiming > MAX_AIMING) {
      aiming = 0;
      handBack(g);
      return K.Escape;
    }
    // Loosed only at a foe: not at a creature summoned or charmed to the party's side the crosshair lies on or passes.
    const on = combatantAt(g, s.crossX, s.crossY);
    if (on >= 0 && on !== s.combatTurn && onMonsterSide(g, on) && !spared(on)) return K.Enter;
    const range = !member
      ? creatureReach(g, me.who)
      : s.weapon === 0xff || s.weapon === 0 || keepsLastThrown(g, s.weapon)
        ? 1
        : Math.max(1, g.data.bytes(0x1664, 0x38)[s.weapon] ?? 1);
    const f = foes.find((c) => reach(c.x, c.y, me.x, me.y) <= range);
    if (!f) return K.Escape;
    const dx = Math.sign(f.x - s.crossX);
    const dy = Math.sign(f.y - s.crossY);
    // On the foe already - one of the party's own, turned against it, whom the first test does not know for a foe.
    if (!dx && !dy) return K.Enter;
    if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
    return dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down;
  }
  aiming = 0;
  if (g.commandPrompt !== 'combat') return 0;
  // Only friends charmed left, with the eased rules: the turn passed while the charm wears off - unless a foe still
  // stands unseen (a Shadow Lord that disappears): the charm is held by one that cannot be struck, the charmed strike on,
  // and passing would only wait for them to kill the party, so the fight is handed back to the player.
  if (foes.length === 0 && g.combat.some((_, i) => spared(i))) {
    const unseen = g.combat.some(
      (c, i) => c.flags !== 0 && (c.flags & (CF.Dead | CF.Invisible)) === CF.Invisible && onMonsterSide(g, i) && !spared(i),
    );
    if (!unseen) return K.Space;
    handBack(g);
    return 0;
  }
  if (foes.length === 0) {
    // With Allies, the field won is the Avatar's to leave - by Leave combat, Loot and Leave, or a room's exit - and the
    // allies pass till their turn comes; with no Avatar to take it (fallen, asleep, charmed), as All does.
    if (allies && avatarActs(g)) return K.Space;
    if ((s.combatFlags & 0x80) !== 0) {
      // A dungeon room is left by its exits, which the player chooses: hand the party back.
      handBack(g);
      return 0;
    }
    // Treasure on the field is the player's to open or to leave (a chest may be trapped): the party waits for
    // them, and auto combat is still on for the next fight.
    if (s.battleWon !== 0 && treasureLies(g)) {
      if (!toldOfTreasure) g.print('(treasure lies here)\n');
      toldOfTreasure = true;
      return 0;
    }
    return s.battleWon !== 0 ? K.Escape : K.Space;
  }
  toldOfTreasure = false;
  // The fight going anywhere: the foes' hit points and number lower than at the last party turn that lowered them.
  // Where they have not fallen for long - the foes out of reach, or blows that never land, a member's or an ally's -
  // the fight is handed back, whoever is striking at what.
  const left = foes.reduce((n, c) => n + 1000 + (c.flags & CF.Player ? s.members[c.who].hp : c.hp), 0);
  if (left < g.autoProgress) {
    g.autoProgress = left;
    g.autoIdle = 0;
  } else if (++g.autoIdle > MAX_IDLE) {
    g.autoIdle = 0;
    g.autoProgress = Infinity;
    handBack(g);
    return 0;
  }
  const f = foes[0];
  const d = reach(f.x, f.y, me.x, me.y);
  // The arms in hand the wrong ones for the fight as it stands: Switch Weapon (switchWeapon.ts), its turn spent.
  if (member && switchWanted(g, me, foes)) return 0x57;
  // A member strikes where Attack would find a foe for one of their hands (combat.ts canStrike: a shot or a throw
  // only along a clear line) - else, as with a weapon reaching no foe, its aim backed out of again and again; a
  // creature on the party's side by its reach.
  const targets = foes.map((c) => g.combat.indexOf(c));
  if (member ? canStrike(g, s.combatTurn, targets) : beside(f.x, f.y, me.x, me.y) || d <= creatureReach(g, me.who)) return 0x41;
  // The way to the nearest foe that can be reached, round whatever is in between (a ship's rail, a plank, a
  // wall): the first step of it. Where no foe can be reached, the greedy step of old, which at least keeps moving.
  const step = firstStep(g, me.x, me.y, s.actors[me.actor].tile, foes, member);
  if (step !== 0) {
    stuck = 0;
    const [dx, dy] = STEPS.get(step) ?? [0, 0];
    if (!rubble(g, me.x + dx, me.y + dy)) return step;
    // Over the rocks a fallen gargoyle leaves: climbed, that way (input.ts bumpInto).
    g.bumpDir = step;
    return KLIMB;
  }
  const place = `${s.combatTurn},${me.x},${me.y}`;
  stuck = place === lastPlace ? stuck + 1 : 0;
  lastPlace = place;
  // Hemmed in (the party's own on every side, water beyond): each way tried once, a blocked step costing no turn,
  // then the turn passed - else the same member tries the four ways for ever.
  if (stuck > 4) {
    stuck = 0;
    return K.Space;
  }
  if (stuck > 0) return [K.Up, K.Right, K.Down, K.Left][stuck % 4];
  const dx = Math.sign(f.x - me.x);
  const dy = Math.sign(f.y - me.y);
  return Math.abs(f.y - me.y) >= Math.abs(f.x - me.x) && dy ? (dy < 0 ? K.Up : K.Down) : dx < 0 ? K.Left : K.Right;
}

const KLIMB = 0x4b;
const STEPS = new Map<number, [number, number]>([
  [K.Up, [0, -1]],
  [K.Right, [1, 0]],
  [K.Down, [0, 1]],
  [K.Left, [-1, 0]],
]);

/** The rocks a fallen gargoyle leaves at (x, y), with no one on them: a member Klimbs onto them (combat.ts klimb). */
function rubble(g: Game, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= 0xa && y <= 0xa && tileAt(g, x, y) === T.T4C && actorTileAtRev(g, x, y, 0) === 0;
}

/**
 * A breadth-first search of the arena from (x, y), over the squares this
 * member can enter - or climb, the party's own over rocks - to any square next
 * to one of the foes: the key of the first step along the shortest such way,
 * or 0 when no foe can be reached.
 */
function firstStep(g: Game, x: number, y: number, tile: number, foes: { x: number; y: number }[], climbs: boolean): number {
  const N = 11;
  const key = (cx: number, cy: number): number => cy * N + cx;
  const nextTo = (cx: number, cy: number): boolean => foes.some((f) => beside(f.x, f.y, cx, cy));
  const from = new Int8Array(N * N).fill(-1);
  const start = key(x, y);
  from[start] = 4;
  const queue = [start];
  const dirs: [number, number, number][] = [
    [0, -1, K.Up],
    [1, 0, K.Right],
    [0, 1, K.Down],
    [-1, 0, K.Left],
  ];
  for (let at = 0; at < queue.length; at++) {
    const c = queue[at];
    const cx = c % N;
    const cy = Math.trunc(c / N);
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const n = key(nx, ny);
      if (from[n] !== -1 || !(arenaFree(g, tile, nx, ny) || (climbs && rubble(g, nx, ny)))) continue;
      from[n] = c === start ? d : from[c];
      if (nextTo(nx, ny)) return dirs[from[n]][2];
      queue.push(n);
    }
  }
  return 0;
}
