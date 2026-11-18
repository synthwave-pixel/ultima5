/**
 * ultima5Speaker.ts
 *
 * Ultima V's play screen as the speech box needs it (speech.ts Speaker): the townsman talked to, where the party's
 * actors stand; the frame drawn again (frame.ts updateFrame); the map's animation round a page (frame.ts animating).
 * The calls speech.ts made itself before it took any game.
 */

import { animating, updateFrame } from './frame.ts';
import type { Game } from './game.ts';
import type { Speaker } from './speech.ts';

export function ultima5Speaker(g: Game): Speaker {
  return {
    at: () => {
      const s = g.s;
      const a = s.actors[s.npcs[g.talk.npc]?.actor ?? -1];
      return { dx: a ? a.x - s.x : 0, dy: a ? a.y - s.y : 0 };
    },
    redraw: () => updateFrame(g),
    animate: () => animating(g),
  };
}
