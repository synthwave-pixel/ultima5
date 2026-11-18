/**
 * playHooks.ts
 *
 * Ultima V's play screen in the menus (gameCore.ts PlayHooks): after a menu, the corridor or the map drawn again, a
 * townsman's words over it and the stats; beside a merchant's words, the talk's rows; and the map's animation while
 * a menu waits by the talk; after a setting changes, the dungeon's small map in the look as it now is, and after a
 * new interface, the screen laid out again.
 */

import { addressedAsLady } from './appearance.ts';
import { animating, drawVitals, updateFrame } from './frame.ts';
import { redrawSideMap } from './dungeonMap.ts';
import { pauseHere } from './input.ts';
import type { Game } from './game.ts';
import type { PlayHooks } from './gameCore.ts';
import { merchantSpeaking } from './merchantSpeech.ts';
import { redrawBox, talkMenu } from './speech.ts';

export function ultima5Play(g: Game): PlayHooks {
  return {
    restore: async () => {
      if (g.inDungeon) {
        const { refresh } = await import('./dungeon.ts');
        // The corridor's picture is smaller than the map's square: what a menu drew in the margin round it goes first.
        g.draw.pen = 0;
        g.draw.fill(8, 8, 0xb7, 0xb7);
        refresh(g);
      } else {
        g.viewDirty = 1;
        updateFrame(g);
        redrawBox(g); // a townsman's words, where the menu was over them (the Pause menu's, in a talk)
      }
      drawVitals(g);
    },
    talkRows: () => (merchantSpeaking(g) ? talkMenu(g) : undefined),
    animating: () => animating(g),
    pause: () => pauseHere(g),
    settingChanged: () => redrawSideMap(g),
    avatarLady: () => addressedAsLady(g),
    relayout: async () => {
      const { relayout } = await import('./layout.ts');
      await relayout(g);
    },
  };
}
