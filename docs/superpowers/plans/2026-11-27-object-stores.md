# Object Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vehicles, items and unique finds kept in stores of their own, per place, so nothing the party leaves in the
world is overwritten by a creature (issue #69); the actor array removed behind functions.

**Architecture:** `actors.ts` becomes the only owner of the 32-slot table (party, creatures, townsfolk, the combat
arena), reached through functions; `Save.actors` and `Game.savedActors` are deleted so any bypass is a compile error.
A new `objectStores.ts` keeps vehicles (3 per kind), items (24, tiered) and unique finds (one slot each) for every
place, saved in a new optional field of the save record. Moonstones and the Underworld's regalia are drawn from the
state that already records them. Creature slots are reused farthest-first.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Vitest, ESLint, Prettier. All commands run in
`web/`.

**Spec:** `docs/superpowers/specs/2026-11-27-object-stores-design.md`

## Global Constraints

- Vehicles: horse (tiles 0x10-0x11), magic carpet (0x1b), skiff (0x28-0x2b), frigate (0x24-0x27, hull and skiffs
  kept); **3 of each kind per place**.
- Items: **24 per place**; let go by tier, all of a tier before any of the next, farthest first within a tier:
  bodies (0x1e, 0x1f) → food (0x0f) → gold (0x02) → equipment (0x03-0x0d) → chests (0x01).
- Unique finds: one slot each, outside the 24, never let go.
- Creatures: new arrivals use slots 1-23 only (as `freeActor` today); slot numbers are kept (`npc.actor` points at
  them); the people of a place are never let go.
- Places: the surface, the Underworld, each settlement (all levels), each dungeon. The combat arena (mapId ≥ 0x80) is
  not a place: it keeps its flat table, a combatant's slot becoming its body or chest in place.
- Vehicles and items persist across visits and in the save; creatures in settlements and dungeons are placed afresh on
  entry, as now; the world's creatures persist in its table, as now.
- Older saves (no `objects` field) are migrated on load; a new game migrates INIT.OOL.
- No change to combat's rules, to how creatures appear or move (beyond which one is let go), to the moongates or
  moonstones' rules.
- Never run Prettier on `docs/features.md` or `desktop/*.cjs`; edit them by hand.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and tag `#69`.
- Before any task's commit: `npx tsc --noEmit && npm run lint && npm run format:check && npm test` pass.

## Unique finds (checked against the data and the Ultima Codex walkthrough)

Among the 113 hidden things (DATA.OVL tables 0x3e78 tile, 0x3eea amount), a find is unique when no arms shop sells
it (the wares at 0x3ae2, eight per shop, shops 0-8) and the game does not put it back. Seventeen are:

| Hidden # | Where | What |
| --- | --- | --- |
| 0x00-0x0b | Underworld (233, 233), beneath Hythloth | six Mystic Armour (tile 0x0b, 0x0f) and six Mystic Swords (tile 0x05, 0x29), one per Search, on one square |
| 0x0c | East Britanny (map 0x15) (15, 2) | the HMS Cape plans (tile 0x04, amount 0xff) |
| 0x10 | Blackthorn's palace (map 0x12) level 1 (7, 6) | the Sword of Chaos (0x23) |
| 0x11 | Blackthorn's palace (map 0x12) level 1 (23, 6) | the Jeweled Sword (0x28) |
| 0x5d | Cove (map 0x17) (15, 1) | the Ankh (tile 0x0c, 0x2f) |

Not unique, though the first draft had them:
- They come back: the key 0x0d (when the party has none), the skull keys 0x0e (a day after they were taken; also
  sold in Yew and Serpent's Hold), the Glass Sword 0x0f (when the party has none). If one is let go, Search finds it
  again.
- The shops sell them: every ring (Invisibility, Protection, Regeneration), the Amulet of Turning, the Spiked
  Collar, the Silver Sword, the Magic Axe, the Magic Shield and the Magic Bow.
- Not hidden things at all: the Jewel Shield and the Magic Bow are never among the 113.

The rule in code: `isUnique(hidden, tile, amount)` is true when `hidden` is 0x00-0x0c, 0x10, 0x11 or 0x5d. A test
derives the same set from the data (hidden, not 0x0d-0x0f, and either the plans or an arm no shop sells) so a
mismatch fails. Items not from the hidden list (a body's food and gold, a chest's contents) are never unique.

## Review Focus

1. A vehicle left on one level of a settlement, or on the surface, must not show on another level or in the
   Underworld at the same x, y (place key and z both match) - Task 5 test `keeps a vehicle to its own level and world`.
2. A creature standing on a vehicle's or item's square: Attack, Talk and the bump hit the creature, Board and Get the
   thing beneath, and both are drawn (creature over it) - Task 5 test `a creature over a parked skiff`.
3. A save made inside a settlement or mid-voyage (the live table holding the place's own things) migrates them into
   that place's stores, not the surface's - Task 9 test `migrates a towne save's own table`.
4. A fourth frigate captured while three are parked in sight: the oldest goes, never the one the party sails (the
   party's ship is not in the store) - Task 5 test `a prize taken with three frigates in sight`.
5. The cheats' relocate, the falls, the whirlpool and moongates put the world's creature table aside and back without
   touching the stores - Task 8 test `relocating keeps the stores`.

---

### Task 1: Functions in front of the actor table

**Files:**
- Modify: `web/src/game/actors.ts`
- Test: `web/tests/actorTable.test.ts`

**Interfaces:**
- Produces, in `actors.ts`:
  - `actor(g: Game, i: number): Actor` - the record in slot `i` (0-31); 0 is the party.
  - `party(g: Game): Actor` - `actor(g, 0)`.
  - `actorSlots(g: Game, from = 0, to = 32): IterableIterator<[number, Actor]>` - slots in order, empty ones included.
  - `clearActors(g: Game, from = 1): void` - every slot from `from` up emptied (`Actor.clear()`).
  - `copyActorTable(g: Game): Uint8Array` - a 256-byte copy of the table.
  - `restoreActorTable(g: Game, bytes: Uint8Array): void` - the table set from such a copy.
  - `ACTOR_SLOTS = 32`.
- The `Actor` class stays in `save.ts`; these functions read `g.s.actors` for now (Task 3 removes it).

- [ ] **Step 1: Write the failing tests** in `tests/actorTable.test.ts`: `actor(g, 3)` is the same record as slot 3
  (setting `tile` through it is read back by `actor(g, 3).tile`); `party(g) === actor(g, 0)`; `actorSlots(g)` yields
  32 entries `[0, …]` to `[31, …]`, `actorSlots(g, 1, 0x18)` 23; `clearActors(g)` leaves slot 0 and zeroes 1-31;
  `restoreActorTable(g, copyActorTable(g))` after changing a slot restores it; the copy is independent of the table.
- [ ] **Step 2: Run** `npx vitest run tests/actorTable.test.ts` - Expected: FAIL, the functions are not exported.
- [ ] **Step 3: Implement** the functions in `actors.ts` (the copy and restore use the bytes at 0x5c5a - 0x55a6 in
  `g.s.b`, as `stashWorldActors` does today).
- [ ] **Step 4: Run** the test - Expected: PASS.
- [ ] **Step 5: Commit** `Functions in front of the actor table (#69)`.

### Task 2: Every caller in src onto the functions

**Files:**
- Modify: every file under `web/src` that reads `.actors`, `savedActors`, `savedActorBytes` or copies the bytes at
  0x5c5a (30 files; the list is `grep -rln "\.actors\b\|savedActor\|0x5c5a" src`), except `save.ts` and `actors.ts`.

**Interfaces:**
- Consumes: Task 1's functions.

- [ ] **Step 1: Rewrite the uses mechanically**, with no change of behaviour:
  - `s.actors[e]` / `g.s.actors[e]` → `actor(g, e)`; `s.actors[0]` → `party(g)`.
  - `for (const a of s.actors)` → `for (const [, a] of actorSlots(g))`; `s.actors.some/find/findIndex/forEach(...)` →
    the same over `[...actorSlots(g)]` (index from the pair, not the array).
  - The raw copies (`outdoors.ts` stash/unstash and the falls, `shrine.ts`, `combat.ts` `specialMap`/`afterCombat`,
    `town.ts:665`) → `copyActorTable` / `restoreActorTable`; `Game.savedActorBytes` becomes a local copy held by
    `specialMap` and passed to `afterCombat` (or a module-level variable in `combat.ts`).
- [ ] **Step 2: Verify none are left:** `grep -rn "\.actors\b\|savedActor\|0x5c5a" src | grep -v "src/game/save.ts\|src/game/actors.ts"`
  - Expected: no output.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm test && npm run test:nodata` - Expected: all pass, the same counts as
  before (2,654 and 669 at the time of writing, plus Task 1's).
- [ ] **Step 4: Commit** `The game reaches its actors through actors.ts (#69)`.

### Task 3: Tests onto the functions; the array removed

**Files:**
- Modify: the 73 test files using `.actors` (`grep -rln "\.actors\b" tests`), `tools/` likewise.
- Modify: `web/src/game/save.ts` (`Save.actors` removed), `web/src/game/game.ts` (`savedActors`, `savedActorBytes`
  removed).
- Modify: `web/src/game/actors.ts` (its functions build their `Actor` views over `g.s.b` themselves, cached per `Save`
  in a `WeakMap`).
- Test: `web/tests/actorTable.test.ts` (add the isolation test).

- [ ] **Step 1: Write the failing test** `no code reaches the table but actors.ts`: read every `.ts` under `src`,
  `tests` and `tools`, and expect no match of `/\.actors\b|savedActor|0x5c5a/` outside `src/game/actors.ts`,
  `src/game/save.ts` (its field map) and this test file.
- [ ] **Step 2: Run** it - Expected: FAIL, listing the test files.
- [ ] **Step 3: Rewrite the tests' uses** as Task 2 did; remove `Save.actors`, `Game.savedActors`,
  `Game.savedActorBytes`; move the views into `actors.ts`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint && npm test && npm run test:nodata` - Expected: all pass.
- [ ] **Step 5: Commit** `The actor array is gone: only actors.ts holds the table (#69)`.

### Task 4: The stores, their rules and their save field

**Files:**
- Create: `web/src/game/objectStores.ts`, `web/src/game/ultima5Objects.ts`
- Modify: `web/src/game/game.ts` (holds the stores), `web/src/game/ultima5Saves.ts` (`SaveData.objects?`, written and
  read)
- Test: `web/tests/objectStores.test.ts`

**Interfaces:**
- Produces, in `objectStores.ts`:
  - `type PlaceKey = 'surface' | 'under' | \`town:${number}\` | \`dungeon:${number}\``;
    `placeKey(g: Game): PlaceKey | null` (mapId 0 by level; 1-0x20 town; 0x21-0x28 dungeon; ≥ 0x80 null).
  - `type VehicleKind = 'horse' | 'carpet' | 'skiff' | 'frigate'`.
  - `interface Vehicle { kind: VehicleKind; tile: number; x: number; y: number; z: number; hull: number; skiffs: number; serial: number }`
  - `type ItemTier = 'body' | 'food' | 'gold' | 'equipment' | 'chest'`.
  - `interface Item { tile: number; x: number; y: number; z: number; amount: number; b6: number; b7: number; unique: boolean; hidden: number /* -1 if not from the list */ }`
  - `interface ObjectRules { vehicleKind(tile: number): VehicleKind | null; itemTier(tile: number): ItemTier | null; isUnique(hidden: number, tile: number, amount: number): boolean }`
  - `vehiclesHere(g): readonly Vehicle[]`, `vehicleAt(g, x, y, z): Vehicle | undefined`,
    `leaveVehicle(g, v: Omit<Vehicle, 'serial'>): Vehicle`, `takeVehicle(g, v: Vehicle): void`.
  - `itemsHere(g): readonly Item[]`, `itemAt(g, x, y, z): Item | undefined`, `placeItem(g, it: Item): Item`,
    `takeItem(g, it: Item): void`.
  - `encodeObjects(g): ObjectsData`, `decodeObjects(g, d: ObjectsData): void`, `type ObjectsData` (version 1; per
    place its vehicles and items; the serial counter; the moonstones' uncovered bits).
  - `MAX_PER_KIND = 3`, `MAX_ITEMS = 24`.
- Produces, in `ultima5Objects.ts`: `ULTIMA5_OBJECTS: ObjectRules` (the constraints' tiles; `isUnique` as the unique-finds table
  above, once the owner has confirmed it).
- "In sight" everywhere in this plan means within the 11×11 view: `((x - s.x + 5) & 0xff) <= 10 && ((y - s.y + 5) & 0xff) <= 10`
  and the same z; "distance" is the wrapped Chebyshev distance on the 256-square worlds, plain in settlements.

- [ ] **Step 1: Write the failing tests:**
  - `keeps three of a kind`: leave four skiffs out of sight at distances 10, 20, 30, 40 → the one at 40 is gone.
  - `never lets go of one in sight`: three frigates in sight, one out of sight at 50 → leaving a fourth (in sight)
    lets the one at 50 go; four in sight → the lowest `serial` goes.
  - `lets items go by tier, then distance`: 24 items (bodies at 5 and 9, food, gold, equipment, chests) and a 25th →
    the body at 9 goes; with no bodies left, the farthest food; and so on to chests.
  - `keeps unique finds outside the 24`: 24 items and a unique → 25 stored, none let go; 24 more → the unique remains.
  - `keeps each place's own`: a skiff left at `surface` is not in `under`'s or `town:5`'s lists.
  - `saves and restores`: `decodeObjects(g2, encodeObjects(g))` gives the same lists; a save record round-trips
    through `ultima5Saves.ts` with `objects`.
- [ ] **Step 2: Run** `npx vitest run tests/objectStores.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** the stores as a `Map<PlaceKey, { vehicles: Vehicle[]; items: Item[] }>` on `Game`
  (`g.objects`), and the save field; `serial` from a counter saved with them.
- [ ] **Step 4: Run** the test, then the full suite - Expected: PASS (nothing uses the stores yet).
- [ ] **Step 5: Commit** `Stores for vehicles and items, per place, saved with the game (#69)`.

### Task 5: Vehicles live in their store

**Files:**
- Modify: `web/src/game/actors.ts` (`thingAt`), `cmds.ts` (Board, X-it, the cannon), `outdoors.ts` (`mayMove`,
  `creatureCanGo`, `outdoorsEntry`'s bought ship, the hull warning), `combat.ts` (`afterCombat`'s captured pirate),
  `shops.ts` (stables), `look.ts` (the wished-for horse), `offers.ts` (`canBoard`), `world.ts` (`overlayActors`,
  `actorMap`), `town.ts`/`npc.ts` (a horse left in a settlement), `cheats.ts`, `frame.ts` (figures), `targets.ts`.
- Test: `web/tests/vehicleStore.test.ts`; move the existing tests that put a vehicle in a slot by hand
  (`grep -rln "0x1b\|0x24\|0x28\|0x10" tests | xargs grep -l "actor("`) onto `leaveVehicle`.

**Interfaces:**
- Consumes: Task 4's vehicle functions.
- Produces, in `actors.ts`:
  - `type Thing = { kind: 'creature'; slot: number; tile: number } | { kind: 'vehicle'; v: Vehicle; tile: number } | { kind: 'item'; it: Item; tile: number } | { kind: 'moonstone'; stone: number; tile: number } | { kind: 'regalia'; which: number; tile: number }`
  - `thingsAt(g, x, y, z): Thing[]` - top first: creature, vehicle, moonstone or regalia, item.
  - `actorTileAt` keeps its name and contract (the top thing's tile, `s.dx` its creature slot or 32) for the callers
    that only ask "is anything there"; callers that act on what they find use `thingsAt`.
- A horse belonging to a place (a townsfolk record points at its slot) stays a creature.

- [ ] **Step 1: Write the failing tests:**
  - `survives a sea full of pirates` (the #69 case): surface, party in a skiff at (225, 226), hour 1, slots 1-23 full
    of pirate ships out of sight, a frigate left at (224, 226) with `leaveVehicle`, then 3,000 calls to
    `monstersTurn` → the frigate is still in `vehiclesHere`.
  - `leaves the carpet where it was`: carpet X-it'd at (225, 227) beside land with slots 1-23 full → in the store;
    after 500 night turns still there; Board from it takes it (party tile 0x14, store empty).
  - `boards and leaves each kind`: horse, carpet, skiff, frigate (hull 77, skiffs 2) left and boarded again keep
    their facing, hull and skiffs.
  - `keeps a vehicle to its own level and world` (Review Focus 1).
  - `a creature over a parked skiff` (Review Focus 2).
  - `a prize taken with three frigates in sight` (Review Focus 4): the captured pirate is a frigate in the store, the
    oldest of the three gone, the pirate's creature slot empty.
  - `a horse bought at the stables, and one ridden into a towne, are there on the next visit`.
  - `Smith is a creature still`: Board beside him says "Nay!" (the existing smith tests pass unchanged).
- [ ] **Step 2: Run** `npx vitest run tests/vehicleStore.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement:** X-it, the bought ship, the stables, the wish and the captured pirate call
  `leaveVehicle`; Board takes what `thingsAt` finds (`takeVehicle`); `mayMove`'s "other" and `creatureCanGo` see
  vehicles through `thingsAt`; `overlayActors` draws the place's vehicles (under creatures, over items) and marks them
  in `actorMap` as it marks actors now.
- [ ] **Step 4: Run** the new test and the full suite - Expected: PASS.
- [ ] **Step 5: Commit** `Vehicles keep their own store: never taken for a creature (#69)`.

### Task 6: Items and unique finds live in their store

**Files:**
- Modify: `web/src/game/items.ts` (`findHidden`, `searchBody`, `searchChest`, `openChest`, the chest's contents at
  ~485, Get), `loot.ts`, `bumpAct.ts`, `actors.ts` (`anyItemsAbout` at ~137, `freeActor`'s item tiers removed),
  `world.ts` (drawing), `targets.ts`, `offers.ts`, `ultima5Objects.ts` (`isUnique`).
- Test: `web/tests/itemStore.test.ts`.

**Interfaces:**
- Consumes: Task 4's item functions, Task 5's `thingsAt`.
- Outside the arena, every thing lying about is an `Item`; inside the arena (mapId ≥ 0x80) bodies, chests and loot
  stay in the flat table as now.

- [ ] **Step 1: Write the failing tests:**
  - `a chest found in a towne is there on the next visit`: Search reveals hidden 0x12 (map 1, (8, 5)); leave the
    settlement and enter it again → `itemAt` finds it; Get takes it.
  - `a searched body's food or gold stays where the body lay` (the record changes tile, not place).
  - `the HMS Cape plans survive 24 finds around them`: hidden 0x0c revealed, then 24 more items placed in sight and out
    → the plans still there; Get gives the plans.
  - `a 25th item lets the farthest body go` (and the tier order through to chests, as Task 4, now via Search).
  - `townsfolk never take a found thing's place`: a settlement's people all placed, items revealed in every free
    square → none lost.
- [ ] **Step 2: Run** `npx vitest run tests/itemStore.test.ts` - Expected: FAIL.
- [ ] **Step 3: Implement** the finds, Get, Search and the drawing through the item store; `isUnique` per the table
  above.
- [ ] **Step 4: Run** the test and the full suite - Expected: PASS.
- [ ] **Step 5: Commit** `Found things keep their own store, unique finds a slot each (#69)`.

### Task 7: Moonstones and the regalia drawn from their own records

**Files:**
- Modify: `web/src/game/items.ts` (`findMoonstone`, Get of 0x19), `outdoors.ts` (`placeTreasures` removed; the bump
  at `mayMove` for 0xb4-0xb7), `world.ts`, `objectStores.ts` (the uncovered bits), `actors.ts` (`thingsAt`).
- Test: `web/tests/moonstoneStore.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `a moonstone dug up shows where it lies, and stays`: Search at a stone's square → `thingsAt` has it (tile 0x19);
    after 500 night turns with slots 1-23 full, still there; Get takes it (held set, uncovered cleared).
  - `the Amulet and the shards lie in the Underworld until taken`, at the places `placeTreasures` used (0x69, 0xe1)
    and DATA.OVL 0x3a06/0x3a0a, and slots 28-31 are free for creatures.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement**: the stones from `moonstoneX/Y/Z/Held` and the uncovered bit; the regalia from
  `s.amulet`, `s.shards`, `s.shadowlords`, as `placeTreasures` decides today.
- [ ] **Step 4: Run** the test and the full suite - Expected: PASS.
- [ ] **Step 5: Commit** `Moonstones and the regalia need no actor (#69)`.

### Task 8: Creature slots reused farthest first

**Files:**
- Modify: `web/src/game/actors.ts` (`freeActor`), `outdoors.ts` (`spawn`), and the callers that must place a creature
  (`outdoors.ts` trolls and the entrance ambush, `town.ts` Shadowlord, `npc.ts`, `devStarts.ts`).
- Test: `web/tests/creatureSlots.test.ts`.

**Interfaces:**
- Produces: `freeActor(g: Game, must = false): number` - an empty slot in 1-23; else the creature farthest from the
  party out of sight, never one a townsfolk record points at; with `must`, the farthest even in sight; 0 when none.
  `spawn` passes `must = false` and places nothing on 0; the others pass `true`.

- [ ] **Step 1: Write the failing tests:**
  - `lets the farthest out-of-sight creature go`: slots 1-23 full, distances varied → the slot of the farthest is
    returned, not slot 1.
  - `a wandering monster does not appear when every creature is in sight`.
  - `the trolls' toll still comes with every creature in sight` (must).
  - `never takes one of the place's people`.
  - `relocating keeps the stores` (Review Focus 5): cheats' relocate, the falls, a whirlpool and a moongate leave the
    vehicle and item stores as they were.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement** `freeActor` and its callers.
- [ ] **Step 4: Run** the test and the full suite - Expected: PASS.
- [ ] **Step 5: Commit** `Creature slots go to the farthest first (#69)`.

### Task 9: Old saves and new games migrated

**Files:**
- Modify: `web/src/game/objectStores.ts` (`migrateActorTables(g: Game): void`), `ultima5Saves.ts` (called on loading
  a save without `objects`), the new-game path (`run.ts` / wherever INIT.OOL is first read).
- Test: `web/tests/objectMigration.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `moves an old save's vehicles and items into their stores`: live table and BRIT.OOL/UNDER.OOL with frigates,
    skiffs, a carpet, a horse, food and a chest → each in its place's store, none left in the tables.
  - `keeps the nearest three of a kind`: five frigates on the surface → the three nearest the party kept.
  - `migrates a towne save's own table` (Review Focus 3): a save made in Britain (map 2) with a horse not tied to a
    record and a chest → in `town:2`'s store; anything a townsfolk record points at (Smith and the stables' horses,
    the Crown, the Sceptre, the sandalwood box, the townsfolk carpet) stays a creature.
  - `a new game's Underworld skiff and bodies` (INIT.OOL slots 23-27) are in `under`'s store.
  - a moonstone stub (0x19) sets its uncovered bit; regalia tiles (0xb4-0xb7) are simply dropped.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement** the migration.
- [ ] **Step 4: Run** the test and the full suite - Expected: PASS.
- [ ] **Step 5: Commit** `Old saves bring their vehicles and finds into the stores (#69)`.

### Task 10: The player's documentation, and the full check

**Files:**
- Modify: `docs/features.md` (by hand, no Prettier): where the port's changes to 1988 are listed, a paragraph saying
  vehicles (three of each kind in each place), found things (24, unique finds always) stay where left, and creatures
  make room farthest first.

- [ ] **Step 1: Edit** `docs/features.md`.
- [ ] **Step 2: Run** `npx tsc --noEmit && npm run lint && npm run format:check && npm test && npm run test:nodata && npm run build`
  - Expected: all pass.
- [ ] **Step 3: Play it** with the dev server ("ultima5-web"): leave a skiff and a carpet by the Codex at night, wait,
  come back; a chest found in Britain, leave and return. Screenshots of both.
- [ ] **Step 4: Commit** `Features: what the party leaves stays (#69)`.
