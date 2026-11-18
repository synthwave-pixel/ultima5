/**
 * run.ts
 *
 * The game from Journey Onward (u5d ultima.c main): Britannia and the
 * Underworld, settlements and dungeons in turn, each world's actors kept
 * aside while the party is elsewhere.
 */

import { Game } from './game.ts';
import { outdoorsEntry, unstashWorldActors } from './outdoors.ts';
import { enterTown, townLoop } from './town.ts';
import { Relocate } from './relocate.ts';
import { dungeonLoop } from './dungeon.ts';
import { autosave } from './storage.ts';

/** The play screen's set-up (playScreen.ts), where its callers have long found it. */
export { drawFrame, gameWindows, journeyOnward } from './playScreen.ts';

/**
 * The main loop: never returns while the game goes on. `arrived`: the party put straight into a dungeon (a development
 * start, main.ts ?at=dungeon), to be met there as if it had come down from outside - the level's creature placed anew,
 * not the save's actor taken for it.
 */
export async function runGame(g: Game, arrived = false): Promise<void> {
  const s = g.s;
  // MID.DRV 0f after the introduction: from here the music follows the map.
  g.musicFollowsMap = true;
  let fromDungeon = false;
  for (;;) {
    let fromOutside = arrived;
    arrived = false;
    try {
      if (s.mapId === 0) {
        // Saved as the journey starts, and each time the party comes out of a place (storage.ts autosave).
        autosave(g);
        await outdoorsEntry(g);
        fromOutside = true;
        fromDungeon = false;
      }
      if (s.mapId !== 0) {
        if (s.mapId < 0x21) {
          await enterTown(g, fromOutside || fromDungeon);
          await townLoop(g);
          fromDungeon = false;
        } else {
          await dungeonLoop(g, fromOutside);
          fromDungeon = true;
        }
        unstashWorldActors(g);
      }
    } catch (e) {
      // A cheat moved the party (cheats.ts relocate, which put the world's actors aside or back): go on from there.
      if (!(e instanceof Relocate)) throw e;
      g.commandPrompt = '';
      arrived = true;
    }
  }
}
