/**
 * cheats.ts
 *
 * The cheats, in the pause menu under Help (the ultima3 port keeps them
 * behind Help's Y): small changes to the world to spare the grind, for
 * testing and for anyone who wants them. None of this was in the 1988 game. The ones that skip the
 * story or the climb (levels, unsealing the dungeons, the quest's items, leaving a dungeon, going anywhere, above
 * or below) are
 * offered only in development builds.
 */

import { CF, Game } from './game.ts';
import { Status } from './save.ts';

export interface Cheat {
  label: string;
  /** Whether it makes sense now (e.g. Exit dungeon only in a dungeon). */
  available(g: Game): boolean;
  /** Do it; a line saying what happened. May throw Relocate to move the party. */
  apply(g: Game): Promise<string> | string;
}

/** Thrown to move the party to another map: the main loop (run.ts) catches it and goes on from the new place. */
export class Relocate extends Error {
  constructor() {
    super('relocate');
  }
}

const cap = (v: number, n: number, max: number): number => Math.min(max, v + n);
const members = (g: Game): number[] => Array.from({ length: g.s.partySize }, (_, i) => i);
const notInCombat = (g: Game): boolean => g.s.mapId !== 0xff;

/** A member's magic points when full (as camping restores them). */
function fullMp(g: Game, m: number): number {
  const p = g.s.members[m];
  if (p.cls === 0x41 || p.cls === 0x4d) return p.int;
  if (p.cls === 0x42) return p.int >> 1;
  return p.mp;
}

/**
 * Move the party to (x, y) on the surface of Britannia (or into map `mapId`
 * at its level 0), as an entrance or exit would, then hand over to the
 * main loop. The world's actors are put aside when leaving the surface (or one world for the other, Britannia and
 * the Underworld) and those of the world arrived in brought back - by the level arrived on, not the one left (a
 * dungeon's or a town's floor is no world's).
 */
export async function relocate(g: Game, mapId: number, x: number, y: number, level = 0): Promise<never> {
  const s = g.s;
  const { stashWorldActors, unstashWorldActors } = await import('./outdoors.ts');
  const onSurface = s.mapId === 0;
  const otherWorld = onSurface && mapId === 0 && level !== s.level;
  if (onSurface && (mapId !== 0 || otherWorld)) stashWorldActors(g);
  s.mapId = mapId;
  s.x = x;
  s.y = y;
  s.level = level;
  if (mapId === 0 && (!onSurface || otherWorld)) unstashWorldActors(g);
  if (mapId > 0x20) {
    const i = mapId - 0x21;
    s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(i * 0x200, i * 0x200 + 0x200));
    s.x = s.y = 1;
    s.facing = 1;
    s.d6602 = 5;
  }
  throw new Relocate();
}

/** A place's name as a sentence has it (the game keeps most in capitals: IOLO'S HUT, Iolo's Hut). */
const cased = (n: string): string =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()) : n;

/** Outside the entrance of place `id` (1-40). */
function outside(g: Game, id: number): Promise<never> {
  const loc = g.data.locations[id - 1];
  return relocate(g, 0, loc.x, loc.y, 0);
}

export const CHEATS: Cheat[] = [
  {
    label: 'Full restore',
    available: () => true,
    async apply(g) {
      for (const m of members(g)) {
        const p = g.s.members[m];
        p.status = Status.Good;
        p.hp = p.maxHp;
        p.mp = fullMp(g, m);
      }
      // In a fight, a sleep or a charm is the fighter's as well as the member's (combat.ts CF): woken, and the charm
      // broken, as the Awaken potion and An Ex Xen do, or the member whole again would still sleep, or fight for
      // the foe. (One fallen in the fight stays fallen until it is over.)
      if (g.s.mapId > 0x7f) {
        const { released, wake } = await import('./combat.ts');
        g.combat.forEach((c, i) => {
          if ((c.flags & CF.Player) === 0 || c.flags & CF.Dead) return;
          wake(g, i);
          if (c.flags & CF.Charmed) released(g, i);
          c.flags &= ~CF.Charmed;
          g.charmedBy.delete(i);
        });
      }
      g.vitalsDirty = 1;
      return 'Everyone is whole again.';
    },
  },
  {
    label: 'Gold +500',
    available: () => true,
    apply(g) {
      g.s.gold = cap(g.s.gold, 500, 9999);
      g.vitalsDirty = 1;
      return `Gold: ${g.s.gold}.`;
    },
  },
  {
    label: 'Food +100',
    available: () => true,
    apply(g) {
      g.s.food = cap(g.s.food, 100, 9999);
      g.vitalsDirty = 1;
      return `Food: ${g.s.food}.`;
    },
  },
  {
    label: 'Gems, keys, torches',
    available: () => true,
    apply(g) {
      const s = g.s;
      s.gems = cap(s.gems, 10, 99);
      s.keys = cap(s.keys, 10, 99);
      s.torches = cap(s.torches, 10, 99);
      return 'Ten of each more.';
    },
  },
  {
    label: 'Glass swords +5',
    available: () => true,
    apply(g) {
      // Each strikes once, surely and to the death, and shatters (combat.ts damageRoll).
      g.s.equipment[0x27] = cap(g.s.equipment[0x27], 5, 99);
      return `Glass swords: ${g.s.equipment[0x27]}.`;
    },
  },
  {
    label: 'Reagents',
    available: () => true,
    apply(g) {
      for (let i = 0; i < 8; i++) g.s.reagents[i] = cap(g.s.reagents[i], 30, 99);
      return 'Thirty of every reagent more.';
    },
  },
  {
    label: 'Renew virtue',
    available: () => true,
    apply(g) {
      // Karma up to 75, where the party's death would put it (story.ts): every word the townsfolk keep for the virtuous
      // is given at 75 (Annon's VILIS; Gruman's SUMM at 50). Never down. Said in the game's own words - the old man's
      // (KARMA.DAT: "Seek now to renew a life of Virtue") - with no number: the game never shows one.
      const s = g.s;
      if (s.karma >= 75) return 'Thou walkest the path of the Avatar already.';
      s.karma = 75;
      return 'Thy life of Virtue is renewed.';
    },
  },
  {
    label: 'Add word',
    available: () => true,
    async apply(g) {
      // A word from a guide, or remembered from another game, made known as if heard, so the lists offer it where
      // it may be said (the Say menu, a shrine's mantra, a dungeon's word of power). Only a word the game answers to
      // is kept, and the player is told so: the lists are no place to guess, and this is no way to make them one.
      const { letterPicker } = await import('./menu.ts');
      const typed = String.fromCharCode(...(await letterPicker(g, false, true, true)).filter((c) => c >= 0x20 && c < 0x7f)).trim();
      if (!typed) return 'No word added.';
      const before = new Set(g.words.all());
      g.words.learn(g, typed);
      const added = g.words.all().filter((w) => !before.has(w));
      if (added.length)
        return `Known now: ${added.join(', ')}. ${added.length === 1 ? 'It is offered where it' : 'They are offered where they'} may be said.`;
      return g.words.knows(typed) ? `${typed} is known already.` : `Nobody in Britannia answers to ${typed}.`;
    },
  },
];

/** The story's shortcuts, for development builds only. */
/**
 * Every foe on the field falls at once: the ones a blow can kill as a
 * blow of 99 kills them (corpse, chest and all); the ones no blow can
 * (a Shadowlord) simply are no more. No experience is earned for it.
 */
export async function slayAll(g: Game): Promise<number> {
  const { CF } = await import('./game.ts');
  const { damage, onMonsterSide } = await import('./combat.ts');
  let slain = 0;
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (c.flags === 0 || (c.flags & CF.Dead) !== 0 || !onMonsterSide(g, i)) continue;
    await damage(g, i, 99);
    if ((c.flags & CF.Dead) === 0) {
      c.flags = CF.Dead;
      c.hp = 0;
      const a = g.s.actors[c.actor];
      a.tile = a.anim = 0;
    }
    slain++;
  }
  g.viewDirty = 1;
  return slain;
}

/** The development build's own: those that skip the climb or the story. */
export const DEV_CHEATS: Cheat[] = [
  {
    label: 'Raise every level',
    available: () => true,
    apply(g) {
      // What the old man's visit gives, to everyone at once: enough experience for the next level, and its hit points.
      for (const m of members(g)) {
        const p = g.s.members[m];
        if (p.level >= 8) continue;
        p.exp = Math.max(p.exp, p.level === 1 ? 100 : 100 << (p.level - 1));
        p.level++;
        p.maxHp = p.hp = p.level * 30;
        p.mp = fullMp(g, m);
      }
      g.vitalsDirty = 1;
      return 'The party is stronger.';
    },
  },
  {
    label: 'Exit dungeon',
    available: (g) => g.inDungeon,
    apply(g) {
      const loc = g.data.locations[g.s.mapId - 1];
      return relocate(g, 0, loc.x, loc.y, 0);
    },
  },
  {
    label: 'Auto kill: Off',
    available: (g) => !g.autoKill,
    apply(g) {
      g.autoKill = true;
      return 'Every foe will fall at the start of each turn of the party, until this is turned off.';
    },
  },
  {
    label: 'Auto kill: On',
    available: (g) => g.autoKill,
    apply(g) {
      g.autoKill = false;
      return 'The party fights its own fights again.';
    },
  },
  {
    label: 'Slay every foe',
    available: (g) => g.s.mapId === 0xff,
    async apply(g) {
      const n = await slayAll(g);
      return n === 0 ? 'No foe stands.' : `${n} ${n === 1 ? 'foe' : 'foes'} slain.`;
    },
  },
  {
    label: 'Mix 10 of every spell',
    available: () => true,
    apply(g) {
      for (let i = 0; i < 0x30; i++) g.s.mixtures[i] = cap(g.s.mixtures[i], 10, 99);
      return 'Every spell mixed.';
    },
  },
  {
    label: 'Unseal the dungeons',
    available: () => true,
    apply(g) {
      g.s.d58d0.fill(1);
      g.viewDirty = 1;
      return 'Every Word of Power spoken.';
    },
  },
  {
    label: "The quest's items",
    available: () => true,
    apply(g) {
      const s = g.s;
      // Held as the game holds them, 0xff (items.ts, talk.ts give): Ztats lists them by name, with no count.
      for (let i = 0; i < 3; i++) s.shards[i] = 0xff;
      s.crown = s.sceptre = s.amulet = s.sandalwoodBox = 0xff;
      s.grapple = 1;
      s.skullKeys = cap(s.skullKeys, 5, 99);
      s.carpets = cap(s.carpets, 1, 99);
      s.spyglasses = s.sextants = s.pocketWatch = s.blackBadge = 0xff;
      return 'Shards, regalia, box and tools.';
    },
  },
  {
    label: 'Go to...',
    available: notInCombat,
    async apply(g) {
      const { choose } = await import('./menu.ts');
      const places = g.data.locations.map((l) => ({ label: cased(l.name) }));
      const i = await choose(g, 'Go to', places);
      if (i < 0) return 'Stayed.';
      // A dungeon is gone into (its first level); anywhere else, the party stands at its entrance.
      if (i + 1 > 0x20) return relocate(g, i + 1, 1, 1, 0);
      return outside(g, i + 1);
    },
  },
  {
    // The Underworld beneath each dungeon's entrance, where its lowest ladder lets a party out (dungeon.ts
    // dungeonExitNow); Doom's own door, which is down there.
    label: 'Go to Underworld...',
    available: notInCombat,
    async apply(g) {
      const { choose } = await import('./menu.ts');
      const below = g.data.locations.slice(0x20, 0x28);
      const i = await choose(
        g,
        'Beneath',
        below.map((l) => ({ label: cased(l.name) })),
      );
      if (i < 0) return 'Stayed.';
      return relocate(g, 0, below[i].x, below[i].y, 0xff);
    },
  },
];

/** The cheats offered here and now. */
export function cheatsFor(g: Game, dev: boolean): Cheat[] {
  return (dev ? [...CHEATS, ...DEV_CHEATS] : CHEATS).filter((c) => c.available(g));
}
