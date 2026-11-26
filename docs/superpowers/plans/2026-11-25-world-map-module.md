# The world map in a module of its own (PR #57's review)

Goal: the neutral world map (`showWorldMap` and what it needs) in files that
import nothing of Ultima V's, a byte with no tile drawn as unseen instead of
throwing, and the journal's tests pointed at the code the game runs. Ultima
V's map unchanged: `tests/worldMapSnapshot.test.ts`'s 15 snapshots pass as
they are.

## Files

- New `web/src/ui/worldMarks.ts`: the marks' neutral half, moved from
  `mapMarks.ts` - `Mark`, `MarkKind`, `GLYPHS`, `GLYPH_SIZE`, `labelOf`,
  `named`, `spread`, `nearestMark`, `wrapped`, `stepTo`, and `focusOf`, the
  helper `showWorldMap` now calls to find the journal's focus (it replaces
  the inline `findIndex`). No imports.
- New `web/src/ui/worldMapView.ts`: `showWorldMap`, `mapKey`, `tileQuads`,
  `inkOf` (exported), the types `WorldMapSource`, `WorldMapWorld`,
  `WorldMapHere`, `TileFigures`, `RGB`, and the drawing helpers. Imports only
  `data/font.ts`, `data/ega.ts` (the EGA palette, moved out of `data/tiles.ts`,
  which re-exports it, so TILES.16's LZW reader stays behind), `game/io.ts`
  (key codes), `parchment.ts`, `worldMarks.ts`.
- `parchment.ts`: declares `WORLD_SIZE` (256) itself instead of importing
  `data/maps.ts`, which brings DATA.OVL's and the files' readers.
- `mapView.ts`: Ultima V's `showMap` only, importing the neutral modules;
  `markInk` goes. It re-exports `mapKey`, so `main.ts` and the snapshot test
  reach the map as before.
- `mapMarks.ts`: Ultima V's `marksFor`, `REGIONS`, `Gates`; imports the
  neutral half; the old `focusOf` goes.

## Steps

1. RED: `tests/worldMapModule.test.ts` - (a) the new modules' imports, and
   theirs in turn, reach none of `data/maps.ts`, `game/game.ts`,
   `placeNames`, `interiorMap`, `mapMarks`, `mapView`, `dataOvl`, `files`,
   `save`, `tiles`, `lzw` (type-only imports bring nothing when it runs, so
   only the module's own are checked for those); (b) a seen square whose byte has no tile draws as an unseen one
   (today: TypeError). Fails: modules missing.
2. Move the code (steps above). `tileQuads` takes an optional palette
   (default EGA); `WorldMapSource` gets an optional `palette` and documents
   the 256-square world and the tile sheet's format.
3. Bounds: `worldPicture` skips a square whose byte has no quad.
4. Ultima V passes `tileCount: 256` (a square is a byte), if the snapshots
   hold.
5. `journalView.test.ts`: `focusOf` (the one `showWorldMap` calls) over
   `[brit, under]`, and `inkOf` with the `knows` `showMap` passes
   (`knowsPlace`). Old `focusOf`, `markInk` removed. Other tests' imports
   follow the names to their new home.
6. Checks: lint, build, prettier, `npm test`, `test:nodata`; the snapshot
   file untouched (`git diff --stat` shows no `.snap`).
7. Review by a fresh subagent; one fix pass; commit.
