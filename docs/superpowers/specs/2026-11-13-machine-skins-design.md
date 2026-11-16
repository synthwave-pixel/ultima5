# Machine skins: dungeons and frame follow the tile set

## Intent

Ultima V SP now offers eight tile sets: Modern PC, PC EGA, PC CGA, Apple Color, Apple //e, Apple //c, Sharp X68k and
C64. Today a set changes only the map's tiles. The first-person dungeon pictures and the frame round the screen stay the
PC's (or Modern's) whatever set is chosen, so a C64 map sits in a PC dungeon inside a PC border. The goal is that
choosing a set makes the game look like that machine's Ultima V while playing: map, dungeons and frame together.

## The rule

- **Tiles picks the skin:** the map tiles, the dungeon's first-person pictures (walls, things, monsters), and the
  frame's colours and border style.
- **UX picks the layout and behaviour,** exactly as today: Modern (the port's screen and conveniences) or PC (1988)
  (the 1988 screen). Nothing in UX's behaviour changes. (Renamed Interface: Enhanced / Retro, and moved to Gameplay:
  see "Interface and tiles" below.)
- Modern PC keeps today's Modern frame and Modern dungeon pictures; PC EGA keeps 1988's. A player who stays on those
  sees no change.

## Goals

- Every set's skin works in both layouts (but Modern PC, which is Modern only, as today).
- Dungeon view complete in every set: every wall piece, door, ladder, fountain, field, chest, sign, trap, item and
  wandering monster, at every depth, both sides, ceiling and floor; the corridor's drawn lines; darkness.
- Signs in the dungeon render correctly in every set and both looks (the Modern look's engraved plate, 1988's plate).
- Debug pages show every set side by side, for the user to check by eye.
- One release with all sets done.

## Non-goals

- Story, title, character creation and ending pictures stay as they are (a later round).
- Text colours stay ours on every set (status colours keep their meaning).
- No change to rules, layout or any UX behaviour.

## Anti-goals

- Players must not need any file beyond what they have today: every machine's art ships pre-rendered in
  `web/public/graphics/`, built by a tool from the original, as the tile sheets are (the PC CGA decision).
- Modern PC and PC EGA must look exactly as before.
- Nothing presented as a machine's own art that is not; a recoloured fallback is described as recoloured in the docs.

## The art for each set (best source first)

| Set | Dungeon pictures | Frame |
|---|---|---|
| PC CGA | The game's own `DNG1-3.4`, `ITEMS.4`, `MON0-7.4` (in `gamedata/ultima5/`) | The CGA game's own colours |
| C64 | Its own: disk 2's `DNG1A`-`DNG3C`, `MS0`-`MS7` (`.d64`s in hand) | Styled after the C64 version's |
| Apple Color, //e, //c | Its own, from the Apple dungeon disk (Internet Archive, same set as the Program disk); //e green, //c white | Styled after the Apple version's (green/white on the monochrome sets) |
| Sharp X68k | Recoloured EGA (no disks available) | In the X68000 palette |

**Fallback** wherever a machine's own art is missing or cannot be decoded: the EGA picture recoloured to that
machine's palette (the user's choice), described as such in the docs.

## How it fits the game

- The dungeon view is composed by the game's own code from numbered pieces (`game/dungeon.ts` `piece`,
  `drawMonster`): wall pieces of `DNGn`, things of `ITEMS` by depth, monsters of `MON0-7`, each at fixed positions, plus
  drawn lines (`hline`/`vline`) for the corridor. A set's dungeon art is that same set of pieces; the composition does
  not change.
- PC CGA's `.4` files are expected to hold the same pieces as the `.16`s. The C64's and Apple's may be organised
  differently (other piece lists, sizes, a different view box). Mapping them onto the PC's pieces is the main risk:
  a piece with a counterpart uses it, fitted to the PC's position and size; one without uses the fallback. Each
  machine's mapping is recorded in its tool's header comment.
- The corridor's drawn lines and the dark take the set's palette.
- The rooms of a dungeon are drawn with tiles and already follow the set.
- Modern layout: today its corridor pictures are the EGA's restyled (`ui/standardPictures.ts`); with a non-PC set
  they become that set's pictures at the Modern scale.

## The frame

- PC (1988) layout: the 1988 frame in the machine's colours / style.
- Modern layout, non-PC sets: two candidate styles, both built for every set and shown on the debug pages:
  1. the Modern bevelled frame recoloured to the machine;
  2. the machine's own thin-line border drawn at the Modern scale.

  The user picks one by eye; the other is then removed.

  **Decided (2026-11-14):** the frame follows the tile set alone. Remastered keeps the copper frame with its place and
  Shadowlord tones; every other set has its machine's fixed, flat frame (candidate 2) in both interfaces. Candidate 1
  and its `?frame=line` switch are removed.

## Interface and tiles (added 2026-11-14)

The user's words: the tile set drives the frame chrome and the rest of the tiles; the UX switch controls how the game
plays, and belongs in Gameplay.

- **Interface: Enhanced / Retro** replaces Appearance's "UX: Modern / PC (1988)" and moves to the Gameplay menu. The
  saved values stay `standard` / `original`, so settings carry over. Enhanced is the port's screen and conveniences
  (smooth motion, the combat aids, the full-screen dungeon, carved signs, the compact panel); Retro is the 1988
  screen and its square-by-square play. The names avoid Rules' Story / Modern / Classic and Input's Classic.
- **The Modern PC tile set is renamed Remastered.**
- **One Tiles setting**, in Appearance, for both interfaces (no longer a choice kept by each). A saved Retro player's
  PC set becomes their one choice.
- **Remastered is Enhanced only.** Switching Enhanced to Retro while on Remastered asks first, OK / Cancel, that the
  tiles change to PC EGA (the set Remastered is drawn from): OK switches both; Cancel changes nothing. On Retro the
  Tiles setting skips Remastered. Back on Enhanced the tiles stay as they are; the player may choose Remastered again.
- **Tiles is renamed Look** (it is more than tiles: the dungeon and the frame come with it).
- **Outlines is no longer a setting:** Remastered's people and creatures always have them.
- **Native resolution (2026-11-14):** the Apple's and the C64's own pieces ship at their own size (7 and 8 pixels a
  screen byte, 144 rows to the PC's 164) and are drawn into the PC piece's place on the colour page's finer grid, each
  of their pixels 4 or 5 of the grid's - none lost or drawn twice, the pieces meeting as on the machine - in place of
  enlarging them to the PC's grid in the tools.
- **Settings slimmed:** Snap targets moves to Gameplay (beside Snap attacks); Dialog moves to Appearance.

## Debug pages

- `tiles.html` already shows all eight sets side by side.
- `dungeon.html`: every cell type, thing and monster (one, two and three squares off), in all eight sets, in both
  layouts, side by side - signs included, near and far.
- `pictures.html`: each set's raw dungeon pieces side by side.
- A frame page (or a section of an existing one): each set's frame in both layouts, and the two Modern candidates.

## Validation

- Tests: each shipped sheet equals its tool's extraction from the original (as the CGA tiles test does); every set
  supplies every piece the view asks for (none missing or blank); Modern PC and PC EGA output unchanged.
- The user checks the debug pages by eye before release.

## Calls made in writing this up (Claude's, for the user to check)

- **Apple source:** the Apple dungeon disk is already on hand with the rest of the set the Program disk came from
  (`../ultima5-private/apple2/UltimaV-WarriorsofDestiny(Dungeon)(Disk7of8).zip`); nothing is fetched. Apple Color, //e and //c share one decoded source, as their tiles do: //e and //c are its lit pixels
  tinted green and white.
- **Fallback is per piece, not per set.** A machine piece that maps is used; one that does not is the EGA piece
  recoloured to that machine's palette. Each tool's header lists which pieces are recoloured, and the docs say so
  (for example "C64: its own walls and monsters; doors recoloured from the PC's"). If a set's mix looks wrong on the
  debug page, the user decides then.
- **The Modern look's behaviours stay on every set:** the engraved sign plate, signs seen two squares off, glow in the
  dark. They are layout and behaviour, not skin. The plate and the drawn lines take the set's palette. The Modern
  restyle of the pictures (`standardPictures.ts`: smoothing, toned colours) is the Modern PC skin's only: other sets
  show their machine's own pixels enlarged, as their tiles are.
- **Unchanged baseline:** if no pixel snapshot of the dungeon view and the frame exists, one is made for Modern PC and
  PC EGA, in both layouts, before anything is changed; those must stay identical.
- **Release waits on the frame choice.** Both Modern-layout frame candidates are built for every set, the user picks
  one on the debug page, the other is removed, and then the release goes out with everything.
- **Aspect:** a machine's pictures are fitted to the view box as its tiles are fitted to a cell, from its own pixel
  grid to the game's, without correcting the machine's non-square pixels beyond that.
- **X68k palette:** its eight colours, as its tile sheet has them.

## Left to the builder

- File and module names, sheet layouts, the tools' structure.
- Decoding each machine's formats.
- Exact frame colours per machine (from screenshots of each version).
- Where a machine's picture size differs, how it is fitted (scaled, centred) as long as it is not squeezed.
