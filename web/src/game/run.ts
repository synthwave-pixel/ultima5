/**
 * run.ts
 *
 * The game from Journey Onward (u5d ultima.c main): Britannia and the
 * Underworld, settlements and dungeons in turn, each world's actors kept
 * aside while the party is elsewhere.
 */

import { Colour } from '../ui/colours.ts';
import { clearBorderTitle, drawColumn, drawVitals, panelWindows, setWind } from './frame.ts';
import { Game } from './game.ts';
import { outdoorsEntry, unstashWorldActors } from './outdoors.ts';
import { enterTown, townLoop } from './town.ts';
import { Relocate } from './cheats.ts';
import { dungeonLoop } from './dungeon.ts';
import { autosave } from './storage.ts';

/** ULTIMA_637e_DrawFrame: the border around the map and the stats. */
export function drawFrame(g: Game): void {
  const d = g.draw;
  d.chrome?.(true);
  d.pen = Colour.black;
  d.fill(0, 0, 319, 199);
  d.pen = Colour.blue;
  d.fill(0, 0, 319, 6);
  d.fill(0, 185, 191, 191);
  d.fill(0, 0, 6, 191);
  d.fill(185, 0, 191, 191);
  const t = g.text;
  t.select(0);
  t.win.fg = Colour.blue;
  t.moveTo(0, 0);
  g.printChar(0x7b);
  t.moveTo(39, 0);
  g.printChar(0x7c);
  t.moveTo(0, 23);
  g.printChar(0x7d);
  d.pen = Colour.brightWhite;
  d.line(7, 7, 7, 184);
  d.line(7, 184, 184, 184);
  d.line(184, 184, 184, 7);
  d.line(184, 7, 7, 7);
  // The right-hand column at the panel's height: 1988's two boxes, or the Standard look's one (frame.ts).
  drawColumn(g);
  t.win.fg = Colour.brightWhite;
  clearBorderTitle(g); // the regalia worn, on the party box's top border (Standard)
}

/** The text windows of the game screen (u5d intro.c). */
export function gameWindows(g: Game): void {
  const t = g.text;
  t.setWindow(0, 0, 0, 0x27, 0x18);
  panelWindows(g); // the party's and the log's, at the panel's height (frame.ts)
}

/** The screen as Journey Onward leaves it. */
export function journeyOnward(g: Game): void {
  g.inPlay = true;
  gameWindows(g);
  drawFrame(g);
  setWind(g, 0);
  g.text.select(2);
  g.text.moveTo(0, 0xc);
  setWind(g, -1);
  drawVitals(g);
  // A new game's first turn: where the Tips are, once (the port's).
  if (!g.tipsNudged) {
    g.print('New to Britannia? See Tips, in the pause menu.\n');
    g.tipsNudged = true;
  }
}

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
