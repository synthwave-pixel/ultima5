# Object stores: vehicles, items and creatures kept apart

Issue #69 ("disappearing carpet, frigate and skiff").

## Why

Everything that stands on a map lives in one 32-slot actor table (`Save.actors`, the bytes at 0x5c5a, the world's copy
in BRIT.OOL and UNDER.OOL). When something new needs a slot and none is empty, `freeActor` (actors.ts, ULTIMA_38e4)
scans slots 1-23 in tiers and takes the lowest-numbered match: found items out of sight, then creatures, horses and
other things out of sight, then the same in sight, and at last slot 1 whatever it holds. Nothing ranks by distance.

Vehicles and pirate ships are never reused before that last step. Near the Codex (233, 233), on open ocean at night,
pirate ships fill all 23 slots in about 250 turns; from then on every new creature overwrites slot 1, and every X-it
puts the vehicle left behind there too. Measured on the game's data: a parked frigate replaced by a sea monster, a
carpet left one step away replaced 33 turns later. The same reuse loses items: a chest found in a towne and walked
away from is the first thing taken to make room for townsfolk, and since it is already marked found, it is gone for
good.

The intent is broader than the bug: to be kinder to players by making what they leave in the world stay there.

## Goals

- A vehicle left anywhere (horse, magic carpet, skiff, frigate) stays where it was left, up to three of each kind in
  each place; it is never taken for a creature, an item or anything else.
- A thing lying about to be taken (food, gold, equipment, a chest, a body to search) stays, up to 24 in each place; it
  is never taken for a creature or a vehicle.
- Creatures, townsfolk and pirates keep a store of their own; when it is full, the farthest goes first.
- The actor array is gone. Every reader and writer goes through a set of functions, so a scan that bypasses the
  stores is a compile error, not a latent bug.

## Non-goals

- No change to combat's rules. A fight still sets up its arena's combatants, corpses, fields and loot and restores
  the world afterwards; it only moves onto the new functions. The arena is not a place with stores: it keeps one flat
  table of its own behind the functions, where a combatant's slot becomes its body or its chest in place, as now (my
  call: splitting it would rework combat and put battle loot under the item cap).
- No change to how many creatures appear, how they move or what they do, beyond which one is let go when the store is
  full.
- No change to the moongates, the moonstones' rules, the Amulet or the shards, beyond where they are kept.

## Anti-goals

- A vehicle or an item vanishing for any reason other than the rules below.
- A player able to litter the world with unlimited ships, skiffs or carpets.
- Any part of the game reading or writing the old array by index behind the functions' back.

## The stores

Each place has its own stores: the surface, the Underworld, each settlement (all its levels), and each dungeon. The
vehicles' and items' stores persist across visits and in the saved game; the creatures' as described under Creatures.

| Store | Holds | Size per place | When full |
| --- | --- | --- | --- |
| Party | the party (today's slot 0) | 1 | - |
| Creatures | monsters, pirate ships, townsfolk, guards, Smith and the people's horses, Shadowlords | 31 (as now) | the farthest creature goes |
| Vehicles | horses, carpets, skiffs and frigates left by the party | 3 of each kind | the farthest of that kind goes |
| Items | food, gold, equipment, chests, bodies to search | 24 | by tier, farthest first (below) |
| Unique finds | one-of-a-kind hidden things (below) | one slot each | never full |
| Moonstones | the eight stones (their existing save record) | 8 | never full |
| Regalia | the Amulet and the three shards where they lie in the Underworld | 4 | never full |

### Vehicles

- Kinds: horse (tiles 0x10-0x11, facing kept), magic carpet (0x1b), skiff (0x28-0x2b), frigate (0x24-0x27, with its
  hull and its skiffs aboard).
- A vehicle enters the store when the party X-its, when a ship bought in port waits at the dock, and when a pirate ship
  is captured (it leaves the creatures' store and becomes a frigate in the vehicles').
- A vehicle leaves the store when the party boards it, when it sinks, or when a fourth of its kind is left in that
  place: then the one of that kind farthest from the party goes, never one in sight; if all three are in sight, the
  oldest goes.
- In a settlement, a horse the party rode in and left there is a vehicle, kept across visits. A horse that belongs to
  the place (Smith, the stables' horses) is a creature, as now.

### Items

- What counts: the hidden things found by Search (the game's 113: chests, gold, potions, scrolls, weapons, shields,
  keys, gems, helms, rings, armour, amulets, torches, food, bodies), the food and gold a searched body gives up, and
  the bodies themselves.
- When a 25th is placed, the store lets one go by tier, and within a tier the farthest from the party:
  1. bodies (my call: they are the least of what lies about, and yield only a chance of food or gold)
  2. food
  3. gold
  4. equipment (potions, scrolls, weapons, shields, keys, gems, helms, rings, armour, amulets, torches)
  5. chests

  All of a tier goes before any of the next, whether in sight or not.
- Unique finds are kept apart and never let go: each has a slot of its own, outside the 24, so no other item can
  push one out. A unique find is a one-of-a-kind thing among the 113 hidden things, whose loss could not be undone:
  one no shop sells and the game does not put back. There are seventeen: the twelve Mystic Arms beneath Hythloth,
  the HMS Cape plans, the Sword of Chaos, the Jeweled Sword in Blackthorn's palace, and the Ankh in Cove (the plan
  lists them). The skull keys and the Glass Sword come back when searched for again, and the rings and amulets are
  sold, so they are ordinary items. An item record says whether it is unique.
- Items in settlements and dungeons persist across visits like everything else (my call: 1988 kept a found thing only
  while the party stayed; keeping them fits the intent).

### Creatures

- The creatures' store keeps today's slot numbers, because townsfolk records point at their creature by slot
  (`npc.actor`), and today's capacity for new arrivals: slots 1-23, as `freeActor` hands out now (my call: the spec's
  first draft said 31, which would have let a third more monsters and pirates about). Slots 24-31 held chest
  contents, the Underworld's regalia and the endgame's Lord British; the regalia and chest contents move to their
  stores, and the rest keep their slots.
- In settlements and dungeons the creatures are placed afresh on entry, as now (my call: keeping them would change
  where townsfolk and monsters stand, against the non-goals). There, only the vehicles and items persist across
  visits. The world's creatures persist as they do now, in its saved table.
- The people of a place are creatures whatever their tile, and are never let go to make room: Smith and the stables'
  horses, the Crown, the Sceptre, the sandalwood box and the carpet that townsfolk records place. They stay tied to
  their records (`putNpc`, `removeNpc`) as now (my call: taking one is a townsfolk record's business).
- When it is full and a creature is to appear, the farthest creature out of sight goes. If every creature is in sight,
  a wandering monster simply does not appear. A creature the game must place - the trolls' toll, a Shadowlord at the
  gate, an ambush at a dungeon's entrance - takes the farthest creature's slot even in sight (my call: these start a
  fight at once, and dropping them would change the story).
- The Underworld's slots 28-31 stop being reserved: the regalia have their own store.

### Moonstones and regalia

- Moonstones are drawn and taken from their own save record (position, level, held). A stone dug up and not taken is
  marked uncovered in that record (a new field, my call), so it shows where it lies without an actor standing for it.
- The Amulet and the shards are drawn and taken from the regalia store, placed as `placeTreasures` places them now.

## The functions

The array (`Save.actors`, `Game.savedActors`, and the raw byte copies at 0x5c5a in combat, the falls, the moongates,
`stashWorldActors` and `unstashWorldActors`) is removed. In its place, one module owns every store and exposes
functions; nothing else holds a reference to a store's records. The shape is the builder's, but it must answer at
least:

- what stands at a square (a creature, a vehicle, an item, a moonstone, a regalia piece, the party), with enough to act
  on it: board it, take it, attack it, talk to it, search it;
- every thing of a kind in the place, or in sight, for drawing, for the creatures' turn, for culling, for the journal;
- placing, moving, changing (a horse's facing, a frigate's hull and skiffs, a chest opened) and removing each kind;
- the creatures' store by slot, for townsfolk records and combat;
- the world's stores put aside and brought back, for towns, dungeons, the Underworld, combat, moongates and cheats.

Drawing keeps 1988's layering: the party over creatures over vehicles over items, with combat's own field layers as
now (world.ts `overlayActors`).

## Saved games

- The new stores are saved as a new optional field of the save record (ultima5Saves.ts `SaveData`), one entry per
  place, alongside `save`, `brit` and `under`.
- Migration, on loading a save without the field, and on a new game from INIT.GAM and INIT.OOL: everything in the
  32-slot tables (live, BRIT.OOL, UNDER.OOL) that is a vehicle, an item, a moonstone or a regalia piece moves to its
  store. Where more than a store holds were in one place, the ones nearest the party are kept (in the world the party
  is not in, the nearest to where it last stood there, or the first found if that is unknown). What remains in the
  tables is the creatures' store.
- A save written by this build and loaded by an older one shows no vehicles or items in the world. Accepted.

## Ultima IV

`web/` is shared with the Ultima IV port, which uses the actor array too. The functions are the shared engine's;
which tiles are vehicles, items and their tiers is each game's own (Ultima V's as above). The Ultima IV session moves
its own code onto the functions; it has been told this is coming.

## Tests that must exist

- With every creature slot full of pirate ships, a carpet, a skiff and a frigate left by the party survive X-it and
  hundreds of world turns at night by the Codex (the #69 case).
- A fourth vehicle of a kind lets the farthest of that kind go, never one in sight; with all in sight, the oldest.
- A 25th item lets go by tier and distance, all bodies before food, all food before gold, and so on.
- A unique find (the HMS Cape plans) survives 24 other items found around it, in sight and out.
- A chest found in a towne is still there after the party leaves and comes back.
- A horse ridden into a towne and left there is still there on the next visit.
- A full creature store lets the farthest out-of-sight creature go; a wandering monster with every creature in sight
  does not appear; the trolls' toll still happens.
- Migration: an old save with vehicles and items in its tables loads with them in their stores, the excess the
  farthest dropped.
- The whole existing suite passes on the functions, the tests that set up actors by hand moved onto them.

## Left to the builder

- The module's name, the functions' names and signatures, the records' shapes.
- The order of the work, provided the game runs and the suite passes after each step.
- How the save field is encoded.
