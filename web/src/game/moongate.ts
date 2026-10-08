/**
 * moongate.ts
 *
 * Moongates (u5d 4000.c ULTIMA_48a8, ULTIMA_47f4): stepping into a risen
 * gate carries the party to the moonstone buried for the moon in the
 * sky (Trammel before noon, Felucca after), wherever it lies; at midnight
 * the gate leads to the Shrine of Spirituality.
 */

import { reveal, sleepTicks, TICK_MS } from './effects.ts';
import { Game } from './game.ts';
import { musicForMap } from './music.ts';
import { enterWorld, stashWorldActors, unstashWorldActors } from './outdoors.ts';
import { T } from './tiles.ts';
import { enterTown } from './town.ts';
import { tileAt, setTileAt } from './world.ts';

/** ULTIMA_47f4: to moonstone `i`'s place; false if the party carries that stone. */
export async function toMoonstone(g: Game, i: number): Promise<boolean> {
  const s = g.s;
  if (s.moonstoneHeld[i] === 0xff) return false;
  if (s.mapId === 0) stashWorldActors(g);
  const from = s.mapId;
  s.mapId = s.moonstoneHeld[i];
  s.x = s.moonstoneX[i];
  s.y = s.moonstoneY[i];
  s.level = s.moonstoneZ[i];
  if (s.mapId !== 0 && from !== 0 && s.mapId < 0x21 && from < 0x21) {
    await enterTown(g, true);
  } else if (s.mapId === 0 && from === 0) {
    g.sound.music(0);
    unstashWorldActors(g);
    enterWorld(g);
    musicForMap(g);
  }
  return true;
}

/** ULTIMA_48a8: through a moongate under the party; true when it leads to the shrine. */
export async function moongateTravel(g: Game): Promise<boolean> {
  const s = g.s;
  if (tileAt(g, s.x, s.y) !== T.Moongate) return false;
  let toShrine = false;
  await sleepTicks(g, 1);
  if (!g.soundOff) void g.sound.pulse(0x170c, 1, 30000, 2000, 2);
  const tile = s.partyTile;
  s.partyTile = 0x16;
  await reveal(g, 0xdc, 5, 5);
  s.partyTile = 0;
  await sleepTicks(g, 1);
  for (s.moongateHeight = 0xf; s.moongateHeight !== 0; s.moongateHeight--) {
    g.draw.moongate(s.moongateHeight, 'grass', 5, 5);
    await g.p.sleep(TICK_MS * 2);
  }
  setTileAt(g, s.x, s.y, T.Grass);
  g.viewDirty |= 2;
  g.draw.tile(5, 5, 5);
  const gateX = s.x;
  const gateY = s.y;
  if (s.hour === 0 && s.minute < 10) toShrine = true;
  else await toMoonstone(g, (s.hour < 0xc ? s.trammel : s.felucca) - 0x30);
  // Where that gate led is the player's to keep: the map shows it once it has been ridden.
  if (s.mapId === 0) g.fog.learnGate(gateX, gateY, s.x, s.y);
  s.partyTile = tile;
  return toShrine;
}
