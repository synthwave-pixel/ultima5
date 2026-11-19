/**
 * companions.ts
 *
 * The companions' looks (the port's, for the Standard look's Modern PC tiles): each of the fourteen who may join the
 * party in colours of their own, as the Avatar is in the player's (appearance.ts). The game's figures are by trade, not
 * by person - every bard the same bard - so each is dressed by name: the eight of Ultima IV in the colour of the
 * virtue each stood for, the six since by where they are found or who they are. Skin is the people of Sosaria's,
 * for every one: the books give none. A mirror lets the player change a companion's colours (appearanceMenu.ts), kept
 * with the saved game - never the trade or the sex, which are the roster's: a woman who walks as a mage has no beard.
 *
 * A companion is dressed wherever they are drawn: in the party, in a fight, and where they wait in their town to join,
 * known there by the name their conversation begins with.
 */

import { type Appearance, LADY } from './appearance.ts';
import { preset } from './companionLooks.ts';
import { CF, type Game } from './game.ts';
import type { Dressing } from './io.ts';
import { CLASSES } from './zstats.ts';

// Each companion's colours to begin with (companionLooks.ts: apart from this module's Game, so another game can dress
// its own people in them).
export { PRESETS, preset } from './companionLooks.ts';

/** The figure roster member `m` walks as (its first frame, an actor tile): their trade's, as the party is drawn. */
export function figureOf(g: Game, m: number): number {
  const classTiles = g.data.bytes(0x1ade, 9);
  return 0x100 + (classTiles[Math.max(0, CLASSES.indexOf(String.fromCharCode(g.s.members[m].cls)))] & 0xfc);
}

/** Roster member `m`'s look: as the player left it at a mirror, else as they begin. (The figure is the trade's.) */
export function companionLook(g: Game, m: number): Appearance {
  const p = g.s.members[m];
  return g.companionLooks.get(p.name) ?? preset(p.name, p.cls);
}

/** How roster member `m` is drawn: their look, and whether a woman. None for the Avatar, whose look is the player's own. */
export function dressingOf(g: Game, m: number): Dressing | null {
  if (m <= 0 || m >= g.s.members.length) return null;
  return { look: companionLook(g, m), lady: g.s.members[m].gender === LADY };
}

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** The names the conversations of a settlement's file begin with, by conversation number: made once for each file. */
const names = new WeakMap<object, Map<number, string>[]>();

/** The name conversation `talk` of the settlement `mapId`'s file begins with ("Jaana"), or ''. */
export function talkName(g: Game, mapId: number, talk: number): string {
  let byFile = names.get(g.data);
  if (!byFile) names.set(g.data, (byFile = []));
  const f = (mapId - 1) >> 3;
  let byTalk = byFile[f];
  if (!byTalk) {
    byTalk = byFile[f] = new Map<number, string>();
    const file = g.data.files.get(TLK[f]);
    const count = file[0] | (file[1] << 8);
    for (let i = 0; i < count; i++) {
      const n = file[2 + i * 4] | (file[3 + i * 4] << 8);
      let at = file[4 + i * 4] | (file[5 + i * 4] << 8);
      let name = '';
      while (at < file.length && file[at] >= 0xa0) name += String.fromCharCode(file[at++] & 0x7f);
      byTalk.set(n, name.trim());
    }
  }
  return byTalk.get(talk) ?? '';
}

/**
 * The roster member called `name`, by their whole name - not the three letters joining goes by, which only a
 * companion's own conversation asks (Mario of Yew is not Mariah); -1 for none, and none for the Avatar.
 */
function memberNamed(g: Game, name: string): number {
  const it = name.toLowerCase();
  return it ? g.s.members.findIndex((m, i) => i > 0 && m.name.toLowerCase() === it) : -1;
}

/** How actor `i` is drawn, if a companion: one of the party in a fight, or one waiting in their town; else none. */
export function dressingOfActor(g: Game, i: number): Dressing | null {
  const s = g.s;
  if (i === 0 && s.mapId < 0x80) return null; // the party, drawn as its members (world.ts partyFigures)
  if (s.mapId >= 0x80) {
    const c = g.combat.find((k) => k.actor === i && k.flags !== 0 && (k.flags & CF.Dead) === 0);
    return c && c.flags & CF.Player ? dressingOf(g, c.who) : null;
  }
  if (s.mapId === 0 || s.mapId > 0x20) return null;
  const npc = s.npcs.findIndex((n) => n.actor === i);
  const talk = npc >= 0 ? s.npcs[npc].fa : 0;
  return talk > 0 && talk < 0x80 ? dressingOf(g, memberNamed(g, talkName(g, s.mapId, talk))) : null;
}
