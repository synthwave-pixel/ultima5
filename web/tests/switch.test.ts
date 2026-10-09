import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { handsOf, planSwitch, rememberArms, styleOf, switchWeapon } from '../src/game/switchWeapon.ts';
import { readyFromPack, unequip } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

const SMALL_SHIELD = 0x04;
const LARGE_SHIELD = 0x05;
const MAGIC_SHIELD = 0x07;
const JEWEL_SHIELD = 0x08;
const DAGGER = 0x10;
const SLING = 0x11;
const CLUB = 0x12;
const FLAMING_OIL = 0x13;
const MAIN_GAUCHE = 0x14;
const SPEAR = 0x15;
const SHORT_SWORD = 0x17;
const MACE = 0x18;
const BOW = 0x1a;
const ARROWS = 0x1b;
const CROSSBOW = 0x1c;
const QUARRELS = 0x1d;
const LONG_SWORD = 0x1e;
const TWO_HANDED_SWORD = 0x21;
const CHAOS_SWORD = 0x23;
const MAGIC_BOW = 0x24;
const GLASS_SWORD = 0x27;
const JEWELED_SWORD = 0x28;

type G = ReturnType<typeof newGame>['g'];

/** The game begun, member `m` with nothing in hand, the party's pack empty, and strong enough for anything. */
function bare(m = 0, str = 40): G {
  const { g } = newGame();
  journeyOnward(g);
  g.s.equipment.fill(0);
  g.s.members[m].equips[2] = g.s.members[m].equips[3] = 0xff;
  g.s.members[m].str = str;
  return g;
}

/** Member `m` holding `items`, as Ready would leave them, and remembered so. */
async function holding(g: G, m: number, ...items: number[]): Promise<void> {
  for (const i of items) {
    g.s.equipment[i]++;
    await readyFromPack(g, m, i, () => {});
  }
  rememberArms(g, m, true);
}

const sorted = (items: number[]): number[] => [...items].sort((a, b) => a - b);

describe('Switch Weapon', () => {
  it('swaps between the melee and ranged arms last held, whatever better lies in the pack', async () => {
    const g = bare();
    await holding(g, 0, LONG_SWORD, SMALL_SHIELD);
    g.s.equipment[ARROWS] = 50;
    await holding(g, 0, BOW); // the sword and shield back to the pack
    g.s.equipment[TWO_HANDED_SWORD] = 1; // harder hitting, and never held
    g.s.equipment[MAGIC_BOW] = 1;
    expect(switchWeapon(g, 0)).toEqual({ said: 'Long Sword and Small Shield!', done: true });
    expect(sorted(handsOf(g, 0))).toEqual(sorted([LONG_SWORD, SMALL_SHIELD]));
    expect(switchWeapon(g, 0)).toEqual({ said: 'Bow!', done: true });
    expect(handsOf(g, 0)).toEqual([BOW]);
    expect(g.s.equipment[LONG_SWORD]).toBe(1); // back in the pack
    expect(switchWeapon(g, 0).said).toBe('Long Sword and Small Shield!');
  });

  it('goes back to the sword and shield once the glass sword has shattered - the glass sword never remembered', async () => {
    const g = bare();
    await holding(g, 0, LONG_SWORD, SMALL_SHIELD);
    await holding(g, 0, GLASS_SWORD); // in the sword's hand
    expect(sorted(handsOf(g, 0))).toEqual(sorted([GLASS_SWORD, SMALL_SHIELD]));
    unequip(g, 0, GLASS_SWORD); // "Thy sword hath shattered!"
    expect(switchWeapon(g, 0)).toEqual({ said: 'Long Sword and Small Shield!', done: true });
  });

  it('says why the bow is not taken up, and draws the next best that can shoot', async () => {
    const g = bare();
    g.s.equipment[ARROWS] = 10;
    await holding(g, 0, BOW);
    await holding(g, 0, MACE);
    g.s.equipment[ARROWS] = 0; // the last loosed
    g.s.equipment[CROSSBOW] = 1;
    g.s.equipment[QUARRELS] = 9;
    expect(switchWeapon(g, 0)).toEqual({ said: 'No arrows - Crossbow!', done: true });
    // With nothing else that shoots, nothing taken up, and no turn spent
    const h = bare();
    h.s.equipment[ARROWS] = 10;
    await holding(h, 0, BOW);
    await holding(h, 0, MACE);
    h.s.equipment[ARROWS] = 0;
    expect(switchWeapon(h, 0)).toEqual({ said: 'No arrows!', done: false });
    expect(handsOf(h, 0)).toEqual([MACE]);
  });

  it('takes up melee arms from a bow with no arrows, bare hands, or a shield alone', async () => {
    const g = bare();
    await holding(g, 0, MACE);
    g.s.equipment[ARROWS] = 1;
    await holding(g, 0, BOW);
    g.s.equipment[ARROWS] = 0;
    expect(switchWeapon(g, 0).said).toBe('Mace!');
    unequip(g, 0, MACE);
    g.s.equipment[MACE]++;
    expect(switchWeapon(g, 0).said).toBe('Mace!');
  });

  it('keeps what is left of the melee arms remembered, and chooses the rest by style', async () => {
    const g = bare();
    await holding(g, 0, LONG_SWORD, LARGE_SHIELD);
    g.s.equipment[ARROWS] = 9;
    await holding(g, 0, BOW);
    g.s.equipment[LARGE_SHIELD] = 0; // given to another of the party
    g.s.equipment[SMALL_SHIELD] = 1;
    expect(switchWeapon(g, 0).said).toBe('No Large Shield - Long Sword and Small Shield!');
  });

  it('says there is nothing to switch to, and spends no turn', () => {
    const g = bare();
    expect(switchWeapon(g, 0)).toEqual({ said: 'Nothing to switch to!', done: false });
    g.s.equipment[CLUB] = 1;
    g.s.members[0].equips[2] = CLUB;
    g.s.equipment[CLUB] = 0;
    expect(switchWeapon(g, 0)).toEqual({ said: 'No ranged weapon!', done: false });
  });

  it('counts a weapon to throw as melee, and flaming oil as ranged', async () => {
    const g = bare();
    await holding(g, 0, SPEAR);
    g.s.equipment[FLAMING_OIL] = 3;
    expect(switchWeapon(g, 0).said).toBe('Flaming Oil!');
    expect(switchWeapon(g, 0).said).toBe('Spear!');
  });

  it('leaves Iolo his two blades: no ranged weapon to take up, and nothing put away', () => {
    const { g } = newGame();
    journeyOnward(g);
    for (const i of [SLING, FLAMING_OIL, BOW, CROSSBOW, MAGIC_BOW]) g.s.equipment[i] = 0;
    const iolo = g.s.members.findIndex((m) => m.name === 'Iolo');
    expect(sorted(handsOf(g, iolo))).toEqual(sorted([MAIN_GAUCHE, SHORT_SWORD]));
    expect(switchWeapon(g, iolo)).toEqual({ said: 'No ranged weapon!', done: false });
    expect(sorted(handsOf(g, iolo))).toEqual(sorted([MAIN_GAUCHE, SHORT_SWORD]));
  });
});

describe('Switch Weapon with nothing remembered', () => {
  const by = (name: string, g: G): number => g.s.members.findIndex((m) => m.name === name);

  it('reads each member’s style from their starting arms, or their class, the Avatar weapon and shield', () => {
    const { g } = newGame();
    const styles = Object.fromEntries(
      ['Shamino', 'Iolo', 'Dupre', 'Gwenno', 'Katrina', 'Mariah', 'Julia'].map((n) => [n, styleOf(g, by(n, g))]),
    );
    expect(styleOf(g, 0)).toBe('shield');
    expect(styles).toEqual({
      Shamino: 'shield', // sword and shield
      Iolo: 'dual', // main gauche and short sword
      Dupre: 'twoHanded', // the 2H sword
      Gwenno: 'dual', // a sling, ranged: a bard's
      Katrina: 'shield', // a club and a hand empty: a fighter's
      Mariah: 'shield', // a dagger and a hand empty: a mage's
      Julia: 'dual', // a spear and a hand empty: a bard's
    });
  });

  it('chooses by style: two weapons, weapon and shield, or both hands to one', () => {
    for (const [name, want] of [
      ['Iolo', [MACE, LONG_SWORD]],
      ['Shamino', [MACE, LARGE_SHIELD]],
      ['Dupre', [TWO_HANDED_SWORD]],
    ] as const) {
      const { g } = newGame();
      journeyOnward(g);
      const m = by(name, g);
      g.s.equipment.fill(0);
      Object.assign(g.s.members[m], { str: 40 });
      g.s.members[m].equips[2] = g.s.members[m].equips[3] = 0xff;
      for (const i of [LONG_SWORD, MACE, TWO_HANDED_SWORD, LARGE_SHIELD]) g.s.equipment[i] = 1;
      const plan = planSwitch(g, m);
      expect(typeof plan === 'string' ? plan : sorted(plan.items)).toEqual(sorted([...want]));
    }
  });

  it('weighs the most damage, then the most defence - the main gauche over the club - then the lightest', () => {
    const g = bare(2); // Iolo: two weapons
    for (const i of [SHORT_SWORD, CLUB, MAIN_GAUCHE]) g.s.equipment[i] = 1;
    const plan = planSwitch(g, 2);
    expect(typeof plan === 'string' ? plan : sorted(plan.items)).toEqual(sorted([SHORT_SWORD, MAIN_GAUCHE]));
  });

  it('takes two of one weapon where two are had', () => {
    const g = bare(2);
    g.s.equipment[LONG_SWORD] = 2;
    expect(switchWeapon(g, 2).said).toBe('Long Sword and Long Sword!');
    expect(g.s.equipment[LONG_SWORD]).toBe(0);
  });

  it('takes the shields best first, and never the jewel shield', () => {
    const g = bare();
    g.s.equipment[MACE] = 1;
    for (const i of [SMALL_SHIELD, MAGIC_SHIELD, JEWEL_SHIELD]) g.s.equipment[i] = 1;
    const plan = planSwitch(g, 0);
    expect(typeof plan === 'string' ? plan : sorted(plan.items)).toEqual(sorted([MACE, MAGIC_SHIELD]));
  });

  it('never chooses the glass, Chaos or jewelled sword, and counts the jewelled sword in hand as no weapon', () => {
    const g = bare();
    for (const i of [GLASS_SWORD, CHAOS_SWORD, JEWELED_SWORD, DAGGER]) g.s.equipment[i] = 1;
    g.s.members[0].equips[2] = JEWELED_SWORD;
    g.s.equipment[JEWELED_SWORD] = 0;
    expect(switchWeapon(g, 0).said).toBe('Dagger!');
  });

  it('draws the magic bow, then the crossbow, the bow, the sling and last the oil, as there is ammunition', async () => {
    const g = bare();
    await holding(g, 0, MACE);
    for (const i of [MAGIC_BOW, CROSSBOW, BOW, SLING, FLAMING_OIL]) g.s.equipment[i] = 1;
    g.s.equipment[ARROWS] = 0;
    g.s.equipment[QUARRELS] = 5;
    const first = planSwitch(g, 0);
    expect(typeof first === 'string' ? first : first.items).toEqual([CROSSBOW]); // no arrows for either bow
    g.s.equipment[ARROWS] = 5;
    const next = planSwitch(g, 0);
    expect(typeof next === 'string' ? next : next.items).toEqual([MAGIC_BOW]);
  });

  it('takes as its style the melee arms the player readies by hand', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const shamino = by('Shamino', g);
    expect(styleOf(g, shamino)).toBe('shield');
    g.s.members[shamino].str = 40;
    g.s.members[shamino].equips[2] = g.s.members[shamino].equips[3] = 0xff;
    await holding(g, shamino, MACE, CLUB);
    expect(sorted(handsOf(g, shamino))).toEqual(sorted([MACE, CLUB]));
    expect(styleOf(g, shamino)).toBe('dual');
  });
});

describe('auto combat and Switch Weapon', () => {
  /** The Avatar's turn in a fight on open grass, a rat `away` squares north. */
  async function fight(away: number, ...arms: number[]) {
    const g = bare();
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    g.combatMap.fill(0x04);
    for (const c of g.combat) c.flags = 0;
    await holding(g, 0, ...arms);
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 9, actor: 0 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: 0x14, x: 5, y: 9 - away, actor: 9, hp: 30 });
    Object.assign(g.s, { mapId: 0xff, combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    return g;
  }

  it('draws a bow at a foe four squares off or more, and walks to one nearer', async () => {
    const far = await fight(5, MACE);
    far.s.equipment[BOW] = 1;
    far.s.equipment[ARROWS] = 20;
    expect(await autoKey(far)).toBe(0x57);
    const near = await fight(3, MACE);
    near.s.equipment[BOW] = 1;
    near.s.equipment[ARROWS] = 20;
    expect(await autoKey(near)).not.toBe(0x57);
  });

  it('takes up melee arms with a foe beside a member holding a bow, and with the last arrow loosed', async () => {
    const beside = await fight(1, MACE);
    beside.s.equipment[ARROWS] = 20;
    await holding(beside, 0, BOW);
    expect(await autoKey(beside)).toBe(0x57);
    const spent = await fight(5, MACE);
    spent.s.equipment[ARROWS] = 1;
    await holding(spent, 0, BOW);
    spent.s.equipment[ARROWS] = 0;
    unequip(spent, 0, BOW); // put away with the last arrow (combat.ts spendAmmo)
    spent.s.equipment[BOW]++;
    expect(await autoKey(spent)).toBe(0x57);
  });

  it('leaves the magic axe in hand: it reaches as far as any bow', async () => {
    const g = await fight(6, 0x26);
    g.s.equipment[BOW] = 1;
    g.s.equipment[ARROWS] = 20;
    expect(await autoKey(g)).not.toBe(0x57);
  });
});

describe('Switch Weapon’s card', () => {
  it('shows the arms it would take up, marked against those in hand, and why where it cannot', async () => {
    const { switchCardLines, drawSwitchCard } = await import('../src/game/readyCard.ts');
    const g = bare();
    await holding(g, 0, MACE);
    g.s.equipment[BOW] = 1;
    g.s.equipment[ARROWS] = 23;
    const { top, foot } = switchCardLines(g, 0, planSwitch(g, 0));
    expect(top[0].trim()).toBe('Bow');
    expect(top.slice(1).map((l) => l.replace(/\s+/g, ' ').trim())).toEqual(['Attack 10 -', 'Defence 0', 'Range 7 +', 'Weight 8 -']);
    expect(foot).toEqual(['Ranged', 'Arrows 23']);
    for (const line of [...top, ...foot]) expect(line.length).toBeLessThanOrEqual(15);
    g.s.equipment[BOW] = 0;
    expect(switchCardLines(g, 0, planSwitch(g, 0)).foot).toEqual(['No ranged weapon!']);
    g.s.mapId = 0xff;
    expect(() => drawSwitchCard(g, 0)).not.toThrow();
  });
});
