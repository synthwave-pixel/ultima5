/**
 * time.ts
 *
 * Time passing (u5d 4000.c ULTIMA_4f7c): minutes, hours, days, months and
 * years, the Shadowlords' wandering at midnight, the light by the hour, and
 * the end of every turn (2000.c ULTIMA_2ae8): poison, hunger, the
 * protection spell running out, and the ring of regeneration.
 */

import { drawMoons, drawVitals, invertMember } from './frame.ts';
import { Game } from './game.ts';
import { Status } from './save.ts';
import { cue, deathCue } from './cues.ts';
import { poisonKills, starvation } from './settings.ts';

const decrease = (v: number, n: number): number => (v > n ? v - n : 0);

/** ULTIMA_4f7c: `minutes` pass (0 just refreshes the light). */
/** The day of the game's calendar, counted from its first: thirteen months of 28 days a year (passTime). */
export function gameDay(s: Game['s']): number {
  return s.year * 13 * 28 + (s.month - 1) * 28 + (s.day - 1);
}

export function passTime(g: Game, minutes: number): void {
  const s = g.s;
  if (minutes !== 0) {
    // 'Q': Quickness halves time.
    if (s.icon === 0x51) {
      minutes >>= 1;
      if (minutes === 0) minutes = 1;
    }
    s.lastHour = s.hour;
    if (s.icon !== 0x54) {
      s.minute += minutes;
      s.d58a7 = decrease(s.d58a7, minutes);
      s.d58a6 = decrease(s.d58a6, minutes);
    }
    if (s.minute > 59) {
      s.minute -= 60;
      s.d588c = decrease(s.d588c, 1);
      s.hour++;
      if (s.hour > 23) {
        s.hour = 0;
        // Each Shadowlord still loose moves to another towne (1-8), not this one and not another's.
        for (let i = 0; i < 3; i++) {
          if (s.shadowlords[i] >= 0x80) continue;
          let town: number;
          do {
            town = g.random(1, 8);
            if (s.mapId === town) town = 0;
            for (let j = 0; j < 3; j++) if (s.shadowlords[j] === town) town = 0;
          } while (town === 0);
          s.shadowlords[i] = town;
        }
        s.day++;
        if (s.day > 28) {
          s.harvestDays.fill(0);
          s.skullKeyDay = 0;
          s.day = 1;
          s.d5959 = 0;
          for (const m of s.members) if (m.x17 < 0x19) m.x17++;
          s.month++;
          if (s.month > 13) {
            s.month = 1;
            s.year++;
          }
        }
        drawVitals(g);
      }
    }
  }

  // The light: full by day, dim at night, underground and in the Underworld; spells and torches keep some.
  if (s.light < 0x33) {
    const before = s.light;
    if (s.mapId === 0x19 || s.level > 0x7f || s.hour < 5 || s.hour > 0x13) {
      s.light = 2;
    } else if (s.hour === 5) {
      s.light = g.data.twilight()[Math.trunc(s.minute / 10)];
    } else if (s.hour === 19) {
      s.light = g.data.twilight()[Math.trunc((59 - s.minute) / 10)];
    } else {
      s.light = 0x32;
    }
    if (s.d58a6 !== 0 && s.light < 0x12) s.light = 0x12;
    if (s.d58a7 !== 0 && s.light < 10) s.light = 10;
    if (before !== s.light) g.viewDirty = 1;
  }

  if (s.hour !== s.lastHour) {
    if (s.mapId < 0x21 && s.level < 0x80) drawMoons(g);
    s.d5884 = s.hour === 0 ? 0xc : s.hour > 0xc ? s.hour - 0xc : s.hour;
  }
  if (g.inTown) g.p.setClock(s.hour, s.minute);
}

/** ULTIMA_400c: a ring of regeneration heals a point now and then. */
function regenerate(g: Game): void {
  const s = g.s;
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.status !== Status.Dead && m.equips[4] === 0x2c && g.random(0, 7) === 7) {
      m.hp = Math.min(m.hp + 1, m.maxHp);
      g.vitalsDirty = 1;
    }
  }
}

/**
 * ULTIMA_2a52: member `i` takes `damage` (the line flashes); death at
 * zero. `floor` is how low that damage may take them - the settings for
 * poison and starvation pass one, so that those alone can be made to
 * wound without killing. Every other blow in the game leaves it at 0 and
 * kills as it always did.
 */
export async function damageMember(g: Game, i: number, damage: number, floor = 0): Promise<void> {
  const s = g.s;
  invertMember(g, i);
  if (!g.soundOff) await g.sound.noise(10, 0x640, 2000);
  invertMember(g, i);
  const m = s.members[i];
  m.hp = Math.max(m.hp - damage, floor);
  if (m.hp <= 0) {
    m.hp = 0;
    m.status = Status.Dead;
    void cue(g, deathCue(m.gender));
    if (i === s.activeMember) s.activeMember = 0xff;
  }
  drawVitals(g);
}

/** ULTIMA_2aa8: everyone standing takes 1-8 damage. */
export async function damageParty(g: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    if (i < g.s.partySize && g.s.members[i].status !== Status.Dead) await damageMember(g, i, g.random(1, 8));
  }
}

/** Half a member's hit points, rounded up: as low as starvation takes them when it only damages. */
const halfOf = (m: { maxHp: number }): number => Math.ceil(m.maxHp / 2);

/**
 * Going hungry, by the Starvation setting: 1 to 8 hit points from every
 * member standing, every hour the party has no food. Where it only
 * damages, it takes nobody below half their hit points - and says
 * nothing at all when there is nobody left for it to hurt, so a party
 * living at half strength is not told of it every hour.
 */
async function starve(g: Game): Promise<void> {
  const s = g.s;
  const setting = starvation(g.options);
  if (setting === 'harmless') return; // the Story rules: not a word said - only the armour's bonus lower (armourBonus)
  const floor = (i: number): number => (setting === 'damage' ? halfOf(s.members[i]) : 0);
  const hurts = (i: number): boolean => i < s.partySize && s.members[i].status !== Status.Dead && s.members[i].hp > floor(i);
  let any = false;
  for (let i = 0; i < 6; i++) if (hurts(i)) any = true;
  if (!any) return;
  g.say(0x54c8); // "Starving!\n"
  for (let i = 0; i < 6; i++) if (hurts(i)) await damageMember(g, i, g.random(1, 8), floor(i));
}

/** ULTIMA_2ae8: the end of a turn. */
export async function endTurn(g: Game): Promise<void> {
  const s = g.s;
  const spare = poisonKills(g.options) ? 0 : 1;
  let awake = 0;
  for (let i = 0; i < s.partySize; i++) {
    const st = s.members[i].status;
    if (st === Status.Dead && i === s.activeMember) s.activeMember = 0xff;
    if (st !== Status.Dead && st !== Status.Sleeping) {
      if (st === Status.Poisoned && s.members[i].hp > spare) await damageMember(g, i, 1, spare);
      awake++;
    }
  }
  if (s.hour !== s.lastHour) {
    if (s.food === 0) {
      await starve(g);
    } else if (s.hour === 6 || s.hour === 12 || s.hour === 18) {
      s.food = decrease(s.food, awake);
    }
    s.lastHour = s.hour;
  }
  if (s.turn < 0xff) s.turn++;
  if (s.protection !== 0 && s.protection !== 0xff) {
    s.protection--;
    if (s.protection === 0) {
      s.icon = 0;
      drawVitals(g);
    }
  }
  regenerate(g);
}

/** ULTIMA_39fc: 0 if someone can act (their index goes in dx), 1 if all are asleep, -1 if all are dead. */
export function firstActive(g: Game): number {
  const s = g.s;
  let sleeping = 0;
  for (let i = 0; i < s.partySize; i++) {
    const st = s.members[i].status;
    if (st === Status.Good || st === Status.Poisoned) {
      s.dx = i;
      return 0;
    }
    if (st === Status.Sleeping) sleeping++;
  }
  return sleeping !== 0 ? 1 : -1;
}
