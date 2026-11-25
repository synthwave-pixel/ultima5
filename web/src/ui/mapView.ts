/**
 * mapView.ts
 *
 * The maps over the game, two pixels a square.
 *
 * Inside a town, keep or castle the map opens on that level, drawn from
 * the tiles standing there; in a dungeon, on that level as the Enhanced
 * map draws it, in the look's tiles, its passages unrolled from where the
 * party stands. Either shows only what the party has seen (interiorMap.ts).
 *
 * Britannia opens on the map the party set out with: coasts drawn in ink
 * on paper (parchment.ts), the places the mapmaker knew marked in brown,
 * and painted over it, as it is seen, what the party has found for
 * itself - every square the viewport has shown, in the colours of the
 * tiles standing there. The Underworld has no drawn map: it is dark
 * until it is walked, and the player cannot turn to it at all until the
 * party has been down there.
 *
 * The marks on the paper are the mapmaker's, the cloth map's names for
 * the land among them, each named from DATA.OVL once the party knows it
 * (mapMarks.ts); the cloth map from the box, where the player has put it
 * beside the page, is one of the maps too.
 *
 * The map itself, its controls and its legend, is any game's
 * (worldMapView.ts showWorldMap); showMap gives it Ultima V's worlds,
 * party, names and pages as a WorldMapSource.
 */

import { readFont } from '../data/font.ts';
import { readBritannia, readLocations, readUnderworld, SETTLEMENTS } from '../data/maps.ts';
import type { Game } from '../game/game.ts';
import { asPad } from '../game/input.ts';
import { knowsPlace } from '../game/placeNames.ts';
import { CELL_NAMES, cellKind, dungeonPicture, INTERIOR_PIXELS, townPicture } from './interiorMap.ts';
import { marksFor } from './mapMarks.ts';
import { drawParchment } from './parchment.ts';
import type { StandardArt } from './standardArt.ts';
import { showWorldMap, type WorldMapHere } from './worldMapView.ts';

/** The controller's and touch pad's way into the map while it shows (worldMapView.ts), as the game reaches it. */
export { mapKey } from './worldMapView.ts';

/** A name as a line is printed: IOLO'S HUT becomes Iolo's Hut. */
function titled(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Ultima V's cloth map's picture, where the player has put one beside the page. */
const CLOTH = 'U5map.jpg';

/**
 * Show Ultima V's maps until closed: on the place where the party is, or - `focus`, a mark's key ("place:<id>",
 * "shrine:<n>": the journal's View) - on that place, chosen, on whichever world has it, shown though not yet seen.
 * Britannia, drawn on paper, and the Underworld, dark till walked and offered once the party has been down there; the
 * town, keep, castle or dungeon the party is in; and the cloth map, where the player has put one beside the page.
 */
export function showMap(
  g: Game,
  tiles: Uint8Array,
  underworld: boolean,
  onClose: () => void,
  art: StandardArt | null = null,
  focus = '',
): Promise<void> {
  const brit = readBritannia(g.data.files, g.data.ovl).tiles;
  const under = readUnderworld(g.data.files).tiles;
  // Where the party is standing, if that is a place with a map of its own.
  const inside = g.s.mapId > 0 && g.s.mapId < 0x80;
  const dungeon = inside && g.s.mapId > SETTLEMENTS;
  const where = inside && !dungeon ? (readLocations(g.data.ovl).find((l) => l.id === g.s.mapId) ?? null) : null;
  // The place nearest the party chosen from the start, so a place is always marked: from where the party stands
  // outdoors, or from the entrance of the town or dungeon it is in.
  const entrance = inside ? (readLocations(g.data.ovl).find((l) => l.id === g.s.mapId) ?? null) : null;
  /** Where the party is on Britannia (or the Underworld): its square outdoors, or the square of the place it is inside. */
  const partyOn = (below: boolean): { x: number; y: number } | null => {
    const s = g.s;
    if (s.mapId === 0) return (s.level === 0xff) === below ? { x: s.x, y: s.y } : null;
    return entrance && !below ? { x: entrance.x, y: entrance.y } : null;
  };
  /** Where the party stands, said plainly: the cell it is in underground, the level it is on above. */
  const hereName = (): string => {
    if (dungeon) return CELL_NAMES[cellKind(g.s.dungeon[g.s.level * 0x40 + (g.s.y & 7) * 8 + (g.s.x & 7)])];
    return where ? titled(where.name) : '';
  };
  const here: WorldMapHere | undefined =
    dungeon || where
      ? {
          picture: (lit) =>
            dungeon ? dungeonPicture(g, g.s.mapId, g.s.level, tiles, art) : townPicture(g, where!, g.s.level, tiles, art, lit),
          size: INTERIOR_PIXELS,
          name: hereName(),
          blinks: !dungeon,
        }
      : undefined;
  return showWorldMap({
    worlds: [
      {
        tiles: brit,
        paper: drawParchment(brit),
        seen: g.fog.of(false),
        marks: marksFor(g.data.ovl, g.s, brit, false, g.fog),
        party: partyOn(false),
        offered: true,
      },
      {
        tiles: under,
        paper: null,
        seen: g.fog.of(true),
        marks: marksFor(g.data.ovl, g.s, under, true, g.fog),
        party: partyOn(true),
        offered: g.fog.knowsUnderworld,
      },
    ],
    opensOn: underworld && g.fog.knowsUnderworld ? 1 : 0,
    from: entrance ? { x: entrance.x, y: entrance.y } : { x: g.s.x, y: g.s.y },
    partyName: g.s.members[0].name || 'Avatar',
    knows: (key) => knowsPlace(g, key),
    font: readFont(g.data.files.get('IBM.CH')),
    tiles,
    // A square is a byte, so the map tiles are the first 256 (the actors' tiles above them stand on no square).
    tileCount: 256,
    art,
    focus,
    cloth: `${import.meta.env.BASE_URL}${CLOTH}`,
    ...(here ? { here } : {}),
    // A keyboard read as a controller is one here too (input.ts asPad): Z names, X the other page, a letter that is no
    // button nothing.
    keyOf: (code) => (g.options.input === 'controller' ? asPad(g, code) : code),
    onClose,
  });
}
