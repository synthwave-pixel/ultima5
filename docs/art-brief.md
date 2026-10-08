# The Standard tile set: a brief for an artist

*What the set is, what is already good, what is weak, and exactly which
tiles to draw. Sheets to look at are in `docs/art/`.*

## 0. Art direction (September 2026)

*This section is the rule. Where anything below it disagrees - the passes
that drew furniture on a grid of 32 and smoothed it, or painted it - this
wins, and those passages are kept only as the record of how the set got
here.*

**Since 2026-09-28 the actors and the town furniture are the original EGA
tiles** - lifted off their ground, toned to the Standard palette, a few
recoloured - derived as the game runs from the player's own tiles
(`web/src/ui/originals.ts`; the list and what was decided in
`docs/standard-originals.md`). The sheet's own drawings of them are kept
only where the originals cannot be had; what follows about drawing
figures and furniture is the record of that set.

Side by side with the ultima3 port's Standard set, ours fell short in
play, and not tile by tile: the countryside (which is largely that port's
own art) held up, while the towns, castles and the things Ultima V has and
Ultima III had not did not. Six reasons, and the rules they give:

1. **One grain for everything that stands.** People are the ultima3
   figures, on a grid of sixteen (four screen pixels a square). Furniture,
   fittings, signs, doors and the buildings and things on the world map
   were drawn on a grid of 32 and doubled with their edges smoothed (two
   screen pixels), and the ground is painted at 64 (one). Three grains in
   one view read as three different games. **Everything that stands on the
   ground - figure, chair, brazier, hut, boulder - is drawn on the grid of
   sixteen**, as the ultima3 port draws its castle, chest and ship, and as
   the EGA tile it stands in for was drawn. Only the ground itself (floor,
   grass, water, wall faces) is painted finer.
2. **Things stand on the floor that is actually there.** Furniture had a
   floor painted into its tile, so wherever the real floor differed - the
   braziers of Lord British's cobbled hall - each piece sat on a square of
   the wrong floor. **Anything that stands is drawn on a clear ground**,
   and the game lays under it the floor of the squares around it.
3. **Floors are quiet.** Town brick and castle cobble were dark,
   high-contrast repeats that filled the view, and what stood on them sank
   into them. **Interior stone floors are the ultima3 port's blue-grey
   town floor**: low contrast, so a person or a chair is seen at once.
4. **Fill the square.** Chairs, sconces, lamps and the fountain filled
   about 40% of their square; the ultima3 chest, castle and ship fill
   80-90%. **A standing thing fills its square** as its shape allows.
5. **One point of view.** The EGA seats, tables and beds are seen from
   above, the people and braziers from the side. **Everything is drawn in
   the front three-quarter view** of the ultima3 figures: from the front
   and a little above. A chair shows its seat and back (facing us), its
   back (facing away) or its side; a bed its head, pillow and blanket; a
   table its top and its front and legs. **The exception**: where the EGA
   tile is seen from above and the three-quarter view would mislead, keep
   the EGA's view - a cannon pointed at us reads as pointed up at the
   player, so the cannons, and the fallen logs, are drawn from above.
6. **An outline on everything that stands.** The build rims every drawn
   pixel with a half-black line (`Sprite.rim()`); a piece is not finished
   until it carries it. Painted ground carries none.

7. **A square that is part one thing and part another is two layers.**
   Where a tile is stone over water, a bank over a river, a bridge over
   the sea, it is drawn as the part that stands, clear elsewhere, over the
   ground beneath it - which keeps moving (the manifest's `under`, and the
   floor-under rule 2 for what stands on a floor). Nothing is drawn with a
   still copy of a moving ground painted into it. On Britannia and in
   the Underworld, in towns and on the combat map, the shores are drawn
   from the map (`web/src/ui/shore.ts`):
   the waterline wanders by the world's own noise, unbroken from square to
   square, along the coasts as well as the rivers - soft ground bulging
   into the water squares, little bays biting into the land - with a paler
   shelf of shallows, the bank damp beside it, and on the water the old
   charts' stipple of sand where a river runs through swamp, the engraved
   map's lines following the shore everywhere else. The sea's depths are
   blended from square to square. Elsewhere (combat, the tile sheets) a
   bank tile is three: the water beneath, the ground round the square laid
   through its land (the manifest's `land`), and its shallows.
8. **Land and pieces: two manners, and every tile is one or the other.**
   This is the rule the others answer to (settled September 2026, after
   mockups of the alternatives: one grid of sixteen for everything, and a
   meeting at thirty-two).
   - **Land** is what the party moves across: grass, water and its shores,
     woods, mountains, hills, swamp, sand, the worn earth, floors and
     walls. It is drawn on the grid of thirty-two, each pixel a block of
     four on the sheet (revised September 2026: the land painted at the
     screen's own 64 read as blurred beside the hills and mountains drawn
     on it, and the figures on it): a few flat tones, lit from the upper
     left, in quiet colours - no green of the land as bright as a green
     figure on it - and never the fine black line, which is the figures'
     alone. Grass is patches of two close greens with tufts of blades,
     its greens held a fifth darker and a fifth greyer than the palette's
     so what stands on it is seen (`pixelGrass()` and `grassTone()` in
     `web/tools/art/terrain.ts`); the woods inked as the high country
     is - lumpy crowns of one flat leaf, hatched on the lower right in a
     deeper one, no line drawn round them, on trunks, a dotted foot
     trailing off to the right (`woods()`); floors and
     walls courses, planks, cobbles and hexagonal flags on the grid,
     their joints a darker tone of the surface
     (`web/tools/art/surfaces.ts`). Every background tile is drawn 32 a
     side and doubled, and the build stops if one is not (`GRIDDED` and
     `onGrid()` in `build.ts`: each block of four one colour, for the
     tile and its versions). Out in the world the worn earth, the soils'
     edges and the shores are drawn from the map on the grid too, a
     block at a time - one ground or the other dithered where two meet,
     never a colour between (`wear.ts`, `soils.ts`); the waterline
     wandering by whole blocks, the shallows, the lines on the water and
     the damp bank a block at a time (`shore.ts`), only the water's own
     ripples finer. For now the swamp and the sand are still painted. The high country is drawn so as well, a square at a time too (`highCountry()` in
     `web/tools/art/terrain.ts`, after the player's ink drawings and the
     ultima3 port's C64 and Apple II mountains): the hill a low arch on
     the grass, hatched along its foot, a dotted foot trailing off - three
     to a square, big and small, in six layouts (`HILL_LAYOUTS`), one to
     each square by an integer hash of its place (`variantOf` in
     `standardArt.ts`: always the same, no pattern to the eye), and
     rocky grass the two small hills of each layout as grey stones; the
     mountain and the snow-capped peak whole squares of rock - a darker
     weave of small peaks across the square, running on into the squares
     beside, and before it three peaks filling the square (the mountain)
     or one great peak (the peak). Flat colours, dark outlines, hatching on
     the shaded right flank, and dark: near the ground's own brightness.
     Below the world they are grey stone, the peak capped with darker
     stone, not snow (the manifest's `below`). Everywhere alike: the
     overworld, towns and fights (`RANGES_OVERWORLD` and `RANGES_CLOSE`
     in `standardArt.ts` bring back the ranges drawn from the map).
   - **Pieces** are what stands on a square and matters: creatures, the
     party, the townsfolk, what lies about to be taken, furniture, doors,
     signs, the buildings on the world map. They are drawn on the grid of
     sixteen (rule 1), outlined (rule 6), and in their own full colours.
   - The eye reads the two as backdrop and board: quiet flat tones on the
     grid of thirty-two are ground to cross; bright, on the grid of
     sixteen and finely outlined, is something to meet. A piece is never
     quieted to sit in the land, and the land never finely outlined to
     stand like a piece.
   - **Scale.** Out in the world a square is a stretch of country: a range
     is its peaks, a wood its crowns. In a towne and on the combat map a
     square is a few paces: a tree is a tree, and a mountain square a mass
     of rock (`ranges.ts` draws both, by where it is).
   - **Below the world** the land is darker and colder (no sun lies on it),
     its peaks dark stone with no snow; the pieces keep their colours.
   - **The one exception:** the party out in the world is its first four
     members at half size in a grid of two by two (the ultima3 port's), so
     pieces at thirty-two pixels a square. It is kept for what it tells the
     player at a glance.

   **Audit (September 2026)** - every tile now keeps rule 8:
   - *Pieces:* everything that stands on a square is drawn on the grid of
     sixteen, outlined, on a clear ground (`fittings.ts`) - the caves,
     mines and dungeon mouths (standing in the mountains drawn from the
     map), the crystal and its motes, the Codex's sigil, the bridges and
     the dock (over the water), the rubble and the stones lying about -
     but for the towne and castle, the ultima3 port's own at 64, cut from
     that port's grass. Whatever stands on a clear ground is drawn over
     that ground as the map would draw it (`standardArt.ts` standing:
     worn earth, flowers and the woods' edge run on under it; its shore
     stays the map's, a built edge to the water).
   - *Land:* drawn from the map wherever it meets other land - the shores
     (`shore.ts`), mountains and hills (`ranges.ts`),
     worn earth and flowering grass (`wear.ts`: blended centre to
     centre), and swamp, sand and lava (`soils.ts`: their edges with
     other ground wandering by the world's noise). The dungeon rooms'
     rock (0x4d) fills its square, and is land: a fieldstone wall
     (`drystone()` in `web/tools/art/stones.ts`) - rounded stones of
     uneven size in rough courses, lighter than the floor and soft-edged
     so a person before it reads at once, six versions by the square's
     place, grey below the world; the huts' and towns' rough walls too.
     Rubble on the ground (0x4c) is a piece: a heap of rounded rocks on the
     grid of sixteen, lit and shaded as the figures are, outlined, filling
     most of its square (`rubble()`), six versions. The interior stone
     floor is the ultima3 town floor darkened. A bank's land goes on as
     the ground beside it. The grass's rows and columns are evened, so no
     line runs along the squares.

**Where it stands (September 2026).** Everything that stands has been
redrawn to these rules in `web/tools/art/fittings.ts`: the rooms'
furniture and fittings, every shop sign, the doors, the ladders and the
banner; the world map's huts, villages, keep, lighthouse, shrine, ruins,
the Codex's dome, trees, cactus, crops, boulder and arch; and Lord
British's castle and Blackthorn's palace, drawn whole and cut into their
six tiles. The interiors' stone floors are the ultima3 blue-grey; the
worn earth of tracks and clearings is one pattern at every step, and is
drawn from the map (`web/src/ui/wear.ts`): each square's wear runs to
its neighbours' from centre to centre, the sheet's own steps of wear
dithered between a block of the grid at a time, so a track or a clearing
has no square edge where it meets grass; woods and hills keep their own
picture, the wear running up to them. The swamp is a fen: dark peat water
with tussocks of sedge standing in it, seen from the front and mirrored
below. The woods are drawn on the grid of thirty-two, a square at a time
(`woods()` in `web/tools/art/terrain.ts`), inked as the high country is:
lumpy crowns of one flat leaf hatched on their lower right, no highlights
and no outline, a dotted foot trailing off to the right as a hill's does - brush four bushes
and scrub two, forest three trees on their trunks and light forest two -
where they were the ultima3 port's painted brush and forest, which read as
soft beside the high country. (Planting the woods tree by tree from the
map, `web/src/ui/woods.ts`, is kept behind `PLANTED_WOODS` in
`standardArt.ts`; its trees overlapped into a mass.) Shrub (0x0e) is clumps
of blades fanned from their roots on the grass, in the same ink (one
flat green, the right of each fan the deeper), a square at a time
(`shrub()` in `web/tools/art/terrain.ts`). Of the creatures, only the sand trap and the insects
needed redrawing (`beasts.ts`). The older sheets (`sheet-rooms.ts` and
the rest) now hold only the ground: floors, walls, windows, water,
mountains, and the decals of the dark.

Two consequences for anyone drawing:

- Draw on the character grids of sixteen (`beast()` in
  `web/tools/art/beasts.ts`, the format the creatures already use), with a
  clear background, and let the build rim and double it. Do not draw at
  32, and do not rely on the build to smooth or grain it: that path is for
  the painted ground only.
- Keep the EGA silhouette. A player who knows the 1988 tile must still
  know ours at a glance; the view and the grain change, not what the
  thing is.

## 1. What you are drawing for

This is a new engine for **Ultima V: Warriors of Destiny** (Origin, 1988)
that plays the player's own copy of the DOS game in a browser. The
player can choose between two looks:

- **Original** — the game's own EGA tiles, 16×16 pixels, sixteen fixed
  colours, read out of the player's files. Untouchable; it is the 1988
  game.
- **Standard** — our set. All 512 tiles redrawn at **32×32**, in the flat
  style of our earlier **Ultima III** port. This is the default, and it
  is what this brief is about.

Standard's job is not to modernise Ultima V. It is to look like a
slightly better-funded 1988: the same silhouettes, the same reading at a
glance, more room for tone. A player who knows the EGA tile must
recognise ours instantly.

## 2. The house style, in seven rules

These come from the Ultima III port's figure set, which is the standard
to match. Sheet: **`docs/art/01-ultima3-figures.png`**.

0. **Figures and ground are two different manners.** The Ultima III
   figures are flat and blocky; its ground - water, grass, trees,
   mountains, lava - is *painted*: soft, shaded, hundreds of colours,
   made at 64 pixels and halved. Rules 1-5 below are for figures and
   objects. Ground follows rule 7 and the Ultima III grounds themselves
   (`web/art/standard/u3/terrain.png`).
1. **Draw on a 16×16 grid.** On the 32-grid a figure is drawn on, every
   pixel is a 2×2 block aligned to even coordinates (four screen pixels). This is the single most important
   rule and the one our weakest tiles break - and, since §0, it holds for
   furniture, fittings and everything else that stands, not only figures. Measured across the set:
   art that came from Ultima III is **83%** aligned to the 2×2 grid;
   the tiles we drew ourselves are **36%**, and they read as mush next
   to it. Terrain and floor textures are the exception — they may use
   the full 32×32 grid, because they are texture rather than figure.
2. **Three tones per material: light, base, shade.** They differ in
   *luminance*, not only hue. The working palette is
   `web/tools/art/palette.ts` — skin, leather, steel, cleric blue,
   wizard blue, teal, olive, red, gold, bone, snake green, daemon,
   dragon, coral, tan, lilac, stone, slate, charcoal, iron, guard blue,
   royal purple, wood, water, magic, fire. Use these before inventing a
   colour; a new material means a new light/base/shade triple added
   there.
3. **About 8–10 colours in a creature.** Our own creatures average 4.6
   and look bald. Flat does not mean two-tone.
4. **No anti-aliasing, no dithering, no gradients.** Hard edges only.
5. **The outline is added for you.** The build puts a one-pixel
   50%-black rim around every opaque pixel (`Sprite.rim()`). Do not
   draw a black outline yourself.
6. **Creatures stand on the ground, not in a black box.** The EGA
   originals were opaque squares; ours are cut out, with transparency
   around them, so the grass shows through. Leave the background clear.
7. **Light comes from the upper left**, weakly. Highlight the top and
   left faces, shade the bottom and right. Don't overdo it — this is
   not a rendered look.

Two more, specific to this game:

- **Two frames per creature**, alternating about every 350 ms. Keep the
  change small and legible at 32 px: a wing beat, a step, a blade
  raised. Not a pose change.
- **Read at a glance on a busy map.** A tile sits in a grid of 11×13
  others. Silhouette first, detail second.

## 3. How tiles are delivered and consumed

- The screen is **1280×800**, four times the EGA's 320×200 each way,
  and a tile on it is **64×64** - the Ultima III port's scale exactly.
- One sheet, `web/public/graphics/standard-tiles.png`, **2048×1280
  RGBA** — 32 columns × 20 rows of **64×64** cells.
- Two kinds of art share a cell. **Painted** art (the ground) is made at
  the full 64. **Drawn** art (figures, objects, walls, furniture) is made
  on a grid of 32 and doubled, so a figure's 16-grid block is four screen
  pixels, as in Ultima III. A tile can be both: painted ground with
  something drawn on it keeps the painting's pixels wherever the drawing
  did not touch (`Sprite.big` in `tools/art/draw.ts`).
- Tile *n* sits at column `n % 32`, row `n / 32`. Tiles **0–255** are
  the map (terrain, buildings, furniture); **256–511** are the actors
  (objects, people, creatures, effects), which is why this brief writes
  actor tiles as `0x1xx`. Cells from **512** on are the extra cells the
  manifest points to: animation frames, banks' land, the Underworld's
  versions, a tile's variants, the palace's squares and the woods' pieces.
- A manifest, `standard-tiles.json`, says how a tile moves:
  - `scroll: {tile: pixels-per-tick}` — the art rolls downward (water,
    lava). Such a tile must **tile seamlessly top to bottom**.
  - `frames: {tile: [cell, cell, …]}` — cells shown in turn.
  - `under: {tile: other}` — that other tile is painted first and this
    one over it (a shore over running water, a chair over a floor), so
    this tile needs transparency where the ground should show.
  - `land: {tile: cell}` — a bank's land: where that cell is opaque,
    the ground round the square is laid, between the water and the bank.
  - `pieces: {name: {cell, w, h}}` — pieces the game sets down itself
    (the woods' oak and bush): the cell each is on, from its top-left,
    and its size.
  - `below: {tile: cell}` — the tile as it is drawn below the world
    (the Underworld's grey high country).
  - `variants: {tile: [cell, …]}` — a tile drawn in several versions
    (the hill's layouts), one to a square by its place, the tile's own
    cell first; `variantsBelow` the same versions below the world.
  - `palace: {tile: [cell, …]}` — Blackthorn's palace's own versions of
    the castle's squares where they differ, frames in turn.
  - `pc: {tile: cell}` — Modern PC's own versions of tiles it keeps from
    this sheet, on the originals' grid.
  - `clock: [tile, …]` — the engine draws the hands itself.
- A creature occupies **four consecutive tiles** — the game's own layout
  is frame-0 and frame-1 twice over, so in practice you draw **two**
  and the build repeats them.

Today every Standard tile is **generated in code** by TypeScript drawing
routines in `web/tools/art/` (`npm run tiles` rebuilds the sheet). Hand
art can enter that pipeline as PNGs; the practical hand-off is **one PNG
per frame, RGBA, no outline - 64×64 for painted art, 32×32 (or a
16-grid) for figures and objects**, named by tile number and
frame — `0x180-0.png`, `0x180-1.png`. There is also a plain-text grid
format (`grid()` in `tools/art/draw.ts`: rows of characters, one per
colour, 16 wide and doubled) if you would rather work that way.

To see everything as it stands: `cd web && npm run dev`, then
`http://localhost:5173/tiles.html?dev` shows all 512 tiles in both sets
side by side.

## 4. What is already good — and where it came from

**Sheet: `docs/art/02-already-reused.png`.**

Ultima V reuses much of Ultima III's bestiary, so our port already
borrows that port's figures directly. The townsman, merchant, jester,
guard, Avatar, mage, bard, fighter, child, beggar, peasant, ghost, Lord
British, Blackthorn, skeleton, daemon, dragon, balron, gargoyle, sea
serpent, troll, ettin, headless, gremlin, whirlpool, horse and chest are
all Ultima III art, some recoloured or reshaped — the ettin is the
giant, the headless is the zombie with its head removed, the gremlin is
the goblin shrunk, the beggar is the cutpurse in rags, the child is the
thief at 72%, Blackthorn is Lord British in red and black.

**These are the quality bar, and they are not the problem.** The problem
is everything beside them.

### Ultima III art still going spare

The Ultima III atlases hold 62 figures and 11 classes; we use 25. What
is left, and what it could become:

| Ultima III figure | Could become | Why |
|---|---|---|
| `snake-58` / `snake-59` | **snake `0x1c8`** | A proper S-curve in two greens; ours is a tube with a head. Straight swap. |
| `wyvern` | **mongbat `0x1d0`** | A small winged reptile — almost exactly what a mongbat is. Shrink to ~80%. |
| `griffon` | **bat `0x194`** | Wing shapes and the way they read at two frames. |
| `bradle` | **gazer `0x1b0`** | A pink brain-thing with an eye; the gazer is a floating eye with stalks. Closest thing we have. |
| `mane` | **slime `0x1a0`** | A squat yellow-green blob-creature. |
| `man-o-war` | **squid `0x184`** | A tentacled sea creature, the EGA squid's silhouette almost exactly. *Done: recoloured green, red eyes.* |
| `pincher` | reference only | Limbs radiating from a body, solved at this size. |
| `golem` / `titan` / `snatch` | reference only | No Ultima V equivalent, but useful for how bulk is drawn. |
| `frigate`, `pirate-ship` | **ships `0x120`–`0x12f`** | Ours are top-down and flat; these are the same rigging drawn well. At minimum steal the hull and sail colours. |
| `moon-gate` | **moongate `0xdc`** | Ours is a blue rectangle; theirs is a proper oval gate. |
| `shrine`, `towne`, `castle` | **`0x19`, `0x14`, `0x15`** | Worth comparing side by side before redrawing ours. |
| `board` | **wood floor `0x40`, tables `0x94`–`0x96`** | A plank texture that already works. |
| classes `cleric`, `barbarian`, `illusionist`, `alchemist`, `ranger` | NPC variety | Ultima V has no tile slots for new people, but these are good recolour sources for the harpsichord player `0x160` and the weaver `0x164`, which currently reuse the bard and merchant. |
| `orc`, `brigand`, `orcus`, `devil`, `exodus` | nothing | Not in Ultima V. |

**Reuse before redrawing.** If an Ultima III figure is within reach of a
recolour, a shrink or a limb moved, do that — it keeps the set coherent
and costs a tenth of the time.

## 5. The work, in priority order

### Priority 1 — the 19 creatures with no Ultima III source

**Sheet: `docs/art/03-creatures-to-redraw.png`** (two frames each).

These are the weakest tiles in the game and the ones a player sees most
in combat. All were drawn in code with ellipses and rectangles at full
32×32 resolution, which is exactly why they sit wrong beside the Ultima
III figures — too fine, too few colours, too soft.

| Tile | Creature | Note |
|---|---|---|
| `0x180` | sea horse | Currently a flat teal outline. Needs a body, a curl, a fin. |
| `0x184` | squid | A green blob with strings. See `pincher`. |
| `0x18c` | shark | A grey triangle. Needs a body under the fin and a wake. |
| `0x190` | giant rat | Reads as a potato. Needs legs, a snout, a proper tail. |
| `0x194` | bat | Acceptable silhouette, but two frames barely differ. See `griffon`. |
| `0x198` | spider | Legs are 1 px and vanish at size. Rebuild on the 2×2 grid. |
| `0x19c` | wisp | A smooth blue gradient — breaks every rule. Make it a hard-edged flicker in two frames. |
| `0x1a0` | slime | A green lozenge. See `mane`. |
| `0x1a8` | mimic | Almost works (it is the chest); wants a mouth and teeth that read. |
| `0x1ac` | reaper | A brown tree. Needs a face, roots, waving limbs. |
| `0x1b0` | gazer | Eye stalks are too thin. See `bradle`. |
| `0x1bc` | insects | Loose yellow dots on nothing. Needs a swarm shape. |
| `0x1c8` | snake | See `snake-58`. Straight swap. |
| `0x1d0` | mongbat | See `wyvern`. |
| `0x1e0` | sand trap | A mouth in the sand; the two frames should open and close. |
| `0x1f3` | winged gargoyle | One tile only; the wings need to read against the gargoyle. |
| `0x1f4` | corpser | Three pink tentacles on black. Needs earth, a mouth, motion. |
| `0x1f8` | water lurker | A stalk in water; ours is a green line. |
| `0x1fc` | Shadowlord | A blue hood — the game's three great villains. Should be genuinely frightening: Falsehood, Hatred and Cowardice. |

**A first pass has been made at these** — sheet
`docs/art/08-creatures-first-pass.png`, before and after. They are now
drawn as character grids of sixteen in `web/tools/art/beasts.ts`, toned
the way the Ultima III figures are (the first square of a run light, the
last in shade), and the squid is that port's man-o-war in green. Treat
them as a floor to improve on, not as finished: edit the grids, or
replace them with PNGs.

### Priority 2 — terrain

**Sheet: `docs/art/04-terrain.png`** (tiles `0x01`–`0x1f`).

Terrain is 70% of what is on screen and none of it came from Ultima III.
The specific complaints:

- **Grass, scrub, brush `0x05`–`0x08`** are the same noise at three
  densities. They need to differ in *shape*, not only in how many blades.
- **Forest and light forest `0x09`, `0x0a`** are the same tree stamped
  in a grid; the repetition is visible across a whole screen of it.
- **Water `0x01`–`0x03`** scrolls (`scroll` in the manifest) so it must
  tile seamlessly top to bottom; the bands currently read as stripes.
- **Mountains and peak `0x0c`, `0x0d`** are flat grey triangles with no
  rock face.
- **Swamp `0x04`** is nearly black and unreadable. *(Redrawn as a fen of
  tussocks in peat water, September 2026.)*
- **Desert `0x07`** is a dune pattern that repeats too obviously.
- **Buildings on the world map — hut, keep, village, towne, castle,
  lighthouse, ruins `0x10`–`0x1b`** — are the strongest terrain tiles
  and probably only need a pass, not a redraw. Compare against Ultima
  III's `towne` and `castle`.

**A first pass has been made at the ground** — sheets
`docs/art/09-terrain-first-pass.png` and
`docs/art/10-britannia-before-after.png`. Water, grass, brush, forest,
mountains and lava are now the Ultima III port's own paintings
(`web/art/standard/u3/terrain.png`, 64 pixels a tile, halved); the three
depths of water are that sea graded to three blues, the peaks its
mountains under snow, scrub and the dense forest its bushes and oaks cut
out and planted again. What Ultima III never had - sand, earth and worn
paths, swamp, hills, boulders - is made in the same soft manner by
`web/tools/art/paint.ts`. What stands on the ground has had its pass too (sheet
`docs/art/11-places-first-pass.png`). The rule that came out of it:
**nature is painted, masonry is drawn.** Thatch, rock, timber, leaf and
earth are shaded softly on the 64-pixel canvas - the huts, the cave and
the mine cut into the Ultima III mountains, the dungeon's skull, the
boulder, the cactus, the dead tree, the crops in their furrows, the
ruins, the Codex's dome. Walls, towers and the Ultima III towne and
castle stay crisp, as they are in that port, but every one now sits in a
soft shadow (`seat()` in `paint.ts`) instead of floating on the grass.
Since then (sheet `docs/art/12-fields-craft-banks-town.png`): the
rivers' banks run down to the water through dry and wet mud with a soft,
wandering edge; the mountains are mended so range meets range; the
lighthouse is round; the four magic fields are four elements in two
frames each (`fields.ts`); the skiff is drawn on the figures' grid from
the side and end on; brick floors and stone walls are laid a brick at a
time, no two the same tone. Still wanted from a hand: the swamp, the
dense forest, the keep, and the interiors' furniture, which is sound but
plain.

### Priority 3 — objects, ships and effects

**Sheet: `docs/art/05-objects.png`.**

The loose objects (`0x101`–`0x11f`), the regalia and the spells in flight
have been redrawn on the figures' grid of sixteen
(`docs/art/13-things-on-the-grid.png`; the grids are `THINGS` in
`web/tools/art/beasts.ts`), so they sit with the chest and the creatures
rather than beside them. Of the rest:

- **Ships `0x120`–`0x12f`** — on a closer look these already are the
  Ultima III frigate and pirate ship from the side, with matching bow
  and stern views; they need nothing. The skiff has been redrawn.
- **Magic fields `0x1e8`–`0x1eb`** (poison, sleep, fire, energy) are
  four recolours of one blobby texture. They should each look like their
  element.
- **The regalia `0x1b4`–`0x1b7`** — moonstone, crown, sceptre, amulet —
  are quest objects the player sees perhaps five times. Low priority but
  they deserve to feel like treasure.

### Priority 4 — buildings and interiors

*Superseded by §0: furniture and fittings go back to the grid of sixteen,
on a clear ground, in the front three-quarter view, and interior stone
floors to the ultima3 blue-grey. What follows records the passes before.*

*Sheets 04-07 are the set as it stands now, at 64 pixels; 08-16 record
the passes that got it there.* The interiors have had theirs: floors and
walls are painted at 64 (`web/tools/art/surfaces.ts` - brick, dressed
stone, planks, flags, cobbles, each stone its own tone, no seam between
tiles), and `masonry()` builds the keep and Lord British's castle from
the same stone. Furniture, doors, signs and towers are still drawn on
the grid of 32, but the build now doubles them with their edges followed
(EPX), lifts a pixel's width along every top and left, shades one along
every foot and right, and lays a little grain in the flats
(`Sprite.full()` in `draw.ts`) - so they stand in the same light as the
painted ground. **This is where a hand would show most**: the furniture
is sound and consistent but plain, and any piece of it redrawn at 64
(a PNG per tile) would lift a whole town.

What follows is the original assessment, kept for the record.

**Sheets: `docs/art/06-buildings.png`, `docs/art/07-town-fittings.png`.**

Around 160 tiles: castle walls, floors, furniture, doors, stairs,
fountains, waterfalls, the ten shop signs. Honestly, **this is the
strongest part of the set** — the furniture, the shop signs and the
castle walls all work. Treat it as a polish pass at the end, not a
redraw. Two things do want attention:

- **Stone and brick walls `0x44`, `0x4f`, `0x50`–`0x57`** repeat
  visibly when a room is walled in them.
- **Floors `0x40`, `0x48`–`0x4a`** are flat; they are also the most
  common tile in every building in the game.

Since then (`docs/art/17-furniture-with-grain.png`): what is drawn on the
grid of 32 and laid on a painted floor is no longer a fill. The builder
doubles it with its edges followed, rounds the light over three pixels
from every edge, and gives each flat the surface its colour names - a
grain along a board's length, a weave to cloth, a sheen to metal and
linen (`material()` in `web/tools/art/draw.ts`). An artist redrawing a
piece at 64 replaces this; until then it stands in the same light as the
floor. On the same sheet: the party aloft on the carpet (tiles `0x114`,
`0x115`, which had been drawn as a skiff by mistake), mounted (horse and
rider one figure, whole within the tile), the sleeper, the carpet and
the crescent moon, all on the grid of sixteen. And
`docs/art/18-swamp-and-deep-forest.png`: the swamp as rounded hummocks
in standing water with reeds and lily pads, and the deep forest with its
trunks in shade so the crowns are what is seen.

## 6. Scope

| Group | Frames | Priority |
|---|---|---|
| Creatures with no Ultima III source | 19 creatures × 2 frames = 38 | 1 |
| Terrain | ~31 tiles, a few animated | 2 |
| Ships, fields, regalia | ~28 | 3 |
| Buildings, interiors, fittings | ~160, polish only | 4 |

**Start with the nineteen creatures.** They are a self-contained job,
they are what a player looks at when it matters, and half of them have
an Ultima III figure within reach.

## 7. Questions to settle before starting

1. Working format — 32×32 RGBA PNGs per frame, or the character-grid
   text format?
2. Do you want the Ultima III atlases (`web/art/standard/u3/`) to work
   from directly, or the contact sheets?
3. Should terrain keep the full 32×32 grid, or move to 2×2 blocks like
   the figures, for a more uniform look? (Our recommendation: keep the
   full grid for texture, blocks for anything with a silhouette.)

## 8. The corridor

The first-person dungeon is not tile art: it is the player's own
DNG1-3.16 and ITEMS.16, restyled as it is drawn (grey stone under each
dungeon's light, `web/src/ui/standardPictures.ts`). What stands in a
corridor keeps its colours. A ladder or a chest is a picture of its own;
a door, an archway, a cave-in or a skeleton in chains is drawn into the
wall's picture, and is found there by where that picture differs from
the same wall drawn plain and by the colours plain stone never uses
(`docs/art/14-corridor-doors.png`). There is nothing here for an artist
to draw, but the palette (`DUNGEON_EGA`) and the eight tints
(`DUNGEON_TINTS`) are theirs to tune.
