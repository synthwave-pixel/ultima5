# Standard look: the original actors and furniture

*This is the Modern PC tile set (Settings' Tiles). Apple ][ is
`web/src/ui/appleArt.ts`.*

The Standard look draws the original EGA actors and town furniture, their
ground knocked out so the Standard floor or grass shows through, toned to
the Standard palette. No outline is put into the tiles themselves: the
Outlines setting (Settings, on to begin with) draws a fine black line
round each figure as the screen draws it. The tiles are derived at load
time from the player's own TILES.16 (the port ships no game art), and those
the EGA animator changes (flags, clock, ladders by time of day) are derived
again each tick.

Decided 2026-09-28: actors plus furniture; no outline in the tiles (the
outline, later, became the Outlines setting); toned to Standard;
waterfalls redrawn in the water's colours.

The ground a tile was drawn on is found from its edge: of plain black and
the EGA's brick floor, grass, mountains, wooden floor and hexagonal floor,
the one its edge matches most; then every pixel matching it that joins the
edge is taken away, so black inside a figure (an eye, a gap) stays.

## Checklist

### Tiles page (tiles.html)
- [x] UX (PC EGA, Standard, or both side by side), Tiles and Outlines
      pop-ups, as Settings has them
- [x] A map tile clicked opens the game in a new window beside its best
      example (Britannia, the Underworld or a town's level: the one with
      most of its kind round it), in a new game that is never saved
      (?peek); the game takes ?at=world:X,Y, under:X,Y and town:N:X,Y:L
- [x] Tiles with see-through parts drawn on their real ground, not black
- [x] A creature's four animation frames shown as one entry, animating
- [x] Tile names corrected from the game's Look text (142 guillotine, 164
      sign, 179 meat on a spit, 191 hot stove, 132 stocks, 139 rack, ...)

### Actors (256-511): the originals
- [x] All actors from the original tiles, ground knocked out
- [x] Kept Standard: key (263), gem (264), ring (266) - the helm, armour
      and torch the originals since the deltas page
- [x] Gold (258): the bag, no $ sign
- [x] Food (271): the original shape, coloured brown not gold
- [x] Climbing ladders (279, 280): brown not gold
- [x] Skiffs (276, 277, 296-299): browns, not white/gold/teal
- [x] Pirate ship (300-303): near-black sails, a black and white flag
- [x] Seated and eating (304-315): the chairs brown, not gold
- [x] Trapped souls in the mirror (316-319): silver frame, crown removed

### Map tiles: the originals
- [x] Castle (21), dungeon (24), shrine (25), ruins (26)
- [x] Bright light (42), crystal sphere (41), lectern (65)
- [x] Cell doors (151, 152)
- [x] Chairs (144-147) brown like the seated ones, so a chair does not
      change colour when someone sits in it
- [x] Doors (184-187) and cell doors kept whole: the dark between their
      planks and bars is not knocked out
- [x] Furniture: mast (66), pillar (70), anvil (88), telescope (89),
      window shelf (90), potted plant (91), bookshelves (92, 93),
      pendulums (128-131), stocks (132), manacles (133), grate (134),
      cannonballs (136), grave (137), tombstone (138), rack (139),
      harpsichord (141), guillotine (142), chairs (144-147),
      tables (148-150), portcullis (153), tables with food (154-156),
      signpost (160), well (161), hitching post (162), logs (163),
      sign (164), desk (165), barrel (166), wine cask (167), vanity (168),
      pitcher (169), carpet (170), bed (171, 172), chest of drawers (173),
      end table (174), footlocker (175), brazier (178), spit (179),
      cannons (180-183), doors (184-187), street lamp (189),
      candelabrum (190), stove (191), wooden fences (202, 203),
      fountains (216-219), the Flame (222), collapsed entrance (223),
      lamp post (224), hourglass (232-235), standards (236-239),
      shop signs (240-249), clocks (250, 251), bellows (252, 253)
- [x] Mirrors (157-159): silver not gold
- [x] Ladders (200, 201): brown not gold
- [x] Moongate (220): the original square, a glow inside it

### The land out in the world (added 2026-09-28)
- [x] The original tiles, whole: water (1-3), swamp, grass, scrub, desert,
      brush, the forests, hills, mountains, peaks, shrub, rocky grass
      (4-15), parched desert (28), flowers (30, 31), roads and worn earth
      (32-38, 48-51), the coast's corners (52-55, 228-231), rivers (96-105,
      108-111), crops (44, 45), lava (143), lawn (227). The shores, the worn
      earth and the edges between grounds are still drawn from the map over
      them, in their own colours.
- [x] The stump (43), fruit tree (46) and cactus (47), lifted onto it.
- [x] The paths (32-38) and the dirt edges (48-51) keep the original's
      specks pixel for pixel, nothing filled in: each speck one of three
      browns (the lighter two kept dark, so a path is not too sharp), one
      in ten a dark grey stone; the blades the grass's; between
      them the grass's ground, but in a path's band (where the original has
      no blades) a dark bare earth, so a path is a speckled track
- [x] The shores, still drawn from the map (shore.ts), settled on the
      originals' grid - the waterline, the shallows, the lines on the water
      and the damp bank in whole EGA pixels, the lines fewer and wider
- [x] A fringe of sand specks along every grass coast, lake and river bank,
      drawn from the map: thick at the waterline, thinning over two or three
      pixels inland; a dirt edge whose specks face the water is plain grass,
      the fringe in its place
- [x] A bank's land is the grass, never a path or a dirt edge carried out to
      the water (they made broken blobs of track at the lake's corners)
- [x] The roads, the worn earth and the edges between swamp, sand, lava and
      grass drawn tile by tile, as the originals draw them - the Standard
      land's dithered edges (wear.ts, soils.ts), on its grid of 32, only
      muddled the originals' coarser, speckled pixels. The shores are still
      drawn from the map.
- [x] The grass's two colours chosen on the grass page (grass.html): its
      ground #162416 (the EGA's black) and its blades #1f361b. Where a
      tile has its own scatter of grass (the hills, the keep), its blades
      are found by their shape - a green dash, black round it - and the
      open black round them is the grass's ground; a stray blade left on
      a lifted place is lifted with its ground. Below the world the land,
      grass and all, is drawn darker and colder.
- [x] (Before the grass page) the grass a fifth darker and a fifth greyer wherever it shows: the
      grass itself, and between the bushes and trees, beside the roads, on
      the river banks and the coast, in the crops - a green pixel is grass
      where it is as the grass tile is and so is what is round it, so the
      leaves keep their light. What stands on it, and the shores and edges
      drawn over it, take it from there.

### Chosen on the deltas page (deltas.html, 2026-09-28)
- [x] Lifted: the hut (16), the Codex's shrine (17), keep (18), village
      (19), towne (20), cave (22), mine (23), lighthouse (27), bridge (29),
      the gargoyle's mouth (56), Blackthorn's palace (57), Lord British's
      castle (58-63), pile of rocks (76), stone wall (77), bridges (106,
      107), the pier (71, lifted onto water, its planks and posts standing in
      the lake), loose brick (140), wall torches (176, 177), stairs (196-199),
      arches (225, 226), the burst (0), blood (204), dark spark (205), eyes
      (206), and the helm (265), armour (267) and torch (269)
- [x] Whole: wood floor (64), planks (72, 73), arrow slit (74),
      window (75), hidden door (78), wall (79), crenellations (80-87), the
      Guardian windows (94, 95), fireplace (188), black (255)
- [x] The nails in the wood floor and planks a grey as light as the wood
      round them (0x606060), not the EGA's light grey
- [x] The crenellations' white tops a fifth darker (0xc0bdb3)
- [x] Archway (135): built from the wall, an arch cut through it
- [x] Rail (67), the ship's rail: redrawn on the originals' grid - a beam
      along the deck, lit west and shaded east, its shadow on the deck, a
      bolted post cap every eight rows - lifted onto the deck

### Kept Standard
The roofs (39, 40), cobbles (68), hexagonal floor (69), white stone (254),
fire field (221), the corner pieces
(208-211), the key (263), gem (264) and ring (266); the waterfall (drawn
over the river, in the original water's colours).

### Waterfalls
- [x] Waterfalls (212-215) redrawn in the Standard water's colours, so
      they meet the water round them without a seam: each is drawn over the
      north-south river, its banks and shore the river's own (shore.ts), the
      fall laid over it - a foam lip, streaks falling, foam at the foot

### The Avatar's appearance (Modern PC)
- [x] Five figures - fighter (332), mage (320), bard (324), rogue (the
      jester, 344), shepherd (the townsman, 336) - their skin (8 tones),
      hair (8 colours), main clothes and trim (12 named hues, or as
      drawn) recoloured through region rules (avatarRegions.ts)
- [x] Chosen after the name and how the Avatar is addressed, in the
      title's bedroom before its mirror; kept in the save
- [x] The original's "Art thou Male or Female?" asked as "How art thou
      addressed?" - Lady or Sir: it only ever chose the words the Avatar
      is spoken to with ("lady", "sir"), a death cue and the stats
      screen's symbol, never the Avatar's look or powers
- [x] Changed at any mirror: Look at one, or bump one (157, 158) out of a
      fight, and the Appearance screen opens; B leaves the Avatar as it was
- [x] The walking and standing Avatar (332-335, 284) and the reflecting
      mirror (158) drawn as the player made the Avatar
- [x] The people of Sosaria: one light brown skin (#c89868, #b07c50,
      #825a36) in Modern PC, the rest of their brown left
      alone

## Review of 2026-09-28 (second pass)
- [x] Rubble (192-194) redrawn on the originals' grid - where the EGA has a
      small grey arc, a heap of broken stones lit on top, shaded below, a
      different heap each - lifted onto their ground
- [x] Bones (207) redrawn - a skull, two bones crossed beside it, in old
      bone - lifted (unused in the game's maps; Look has no name)
- [x] Gem (264) and ring (266) the originals, lifted; key (263) kept Standard;
      the key, gem, helm, ring and armour outlined as every actor is
- [x] Desert (7): its black a sand colour at the grass ground's
      saturation and value
- [x] Mountains and peak (12, 13): their black a grey at the grass
      ground's value
- [x] Flowers (30, 31): the grass, and single pixels of red, yellow and
      blue at the blades' saturation and value (dark: to be seen by eye)
- [x] Paths and worn earth (32-38, 48-51): their black a darker brown
- [x] Plowed patch (44): a darker brown behind it
- [x] Wall, hidden door, crenellations (79, 78, 80-87): black a dark grey
- [x] Corner pieces (208-211): the wall's stone where they are white
- [x] Archway (135): an arch drawn on the wall
- [x] Roofs (39, 40) on the originals' grid, same colours
- [x] Loose brick (140): the cobbles with a single pixel out of place
- [x] Lava (143) in its original colours, not darkened below the world
- [x] Tables (148-150, 154-156): the brick floor left under them lifted
- [x] Wine cask (167): its yellow a light brown
- [x] Original colours, not toned: invisible (285), ghost (372-375), sea
      horse (384-387), Shard, crown, sceptre, amulet (436-439), fields
      (488-491), Shadowlords (508-511)
- [x] Avatar (284): the hilt silver
- [x] Shadowlords (508-511): their black bodies kept
- [x] Deltas page: actors outlined as in the game
- [x] Grave marker (137) a small round-topped headstone with an
      inscription's line, not the EGA's cross, in all three tile sets
- [x] The walking Avatar (332-335) with a silver hilt too
- [x] The rivers and bridges (96-111): behind their light blue lines two
      darker blues of its hue and saturation (value 0.24 where they were
      black, 0.34 where the grass's greens were), not black and dark green;
      the waterfall's face the deeper blue. Only the channel round the
      lines is water: the banks are grass, their specks the shores' sand -
      the tiles as they are drawn on their own (the tiles page). Out in the
      world the map draws its rivers (shore.ts), with the lake's water, and
      the tiles' own pixels are never seen there
- [x] A bridge on its own lies over its river (106 over 96, 107 over 97),
      not a square of the lake's water
- Explained, unchanged: grave marker (137) is readable, as a sign is;
  stove top (195), dark spark, eyes (205, 206) and 221 are unused; 221's
  Look text is "parched desert", not a fire field

## Review of 2026-09-28 (third pass)
- [x] Chest (257), open chest (270) and mimics (424-427) in wood; the gold
      (258) a leather bag - brown, not gold
- [x] Crops (45) on the plowed patch's brown, not black
- [x] Deep water, water, shallow water (1-3): blues of the light blue's
      hue behind their lines, darker the deeper (value 0.17, 0.24, 0.31);
      under some of the deep's lines a darker blue, under some of the
      shallows' a lighter; the water's the rivers' deep, so they meet as one
- [x] Bridges (29, 106, 107): their own water lifted, the water beneath
      rolling under them
- [x] Modern PC's cobbles (and the loose brick): their two lighter tones a
      fifth darker
- [x] Barrel (166): its gold light a paler shade of its brown
- [x] White stone (254): the walls' plain dressed stone, darker
- [x] Corpse (287): its light red inside nearer the red round it
- [x] Trapped soul (316-319): the ghost (372-375) in a silver mirror - the
      mirror (157) its frame, the ghost filling its glass in its own
      colours, a ghost's frame to each of the soul's
- [x] Prisoner (352-355), child (360-363): the one light brown skin of the
      people of Sosaria (see the Avatar's appearance above), the rest of
      their brown left alone
