# A controller-only player for the browser

`bot.js` plays the development build with nothing but the keys a keyboard
read as a controller has - W A S D, Z and X, and Escape for the Pause
menu, sent as `keydown` events, the same path a player's presses take. It reads the game's state through the
development hook (`window.u5`) to plan - where the townsfolk stand, which
line of a menu the bar is on, the map - and never writes it.

It is for playing the game through to find what a controller cannot do.
With the dev server running (`npm run dev`), open
`/?dev&play&autoscan=true` (the game files installed by the scan, the first
time), and in the console:

    (0, eval)(await (await fetch('/tools/pilot/bot.js')).text())
    bot.bg(() => bot.tour2([[58, 43, 'Yew'], [81, 106, 'Britain']]))
    await bot.poll()

`bot.tour2(places)` goes to each place in turn, by carpet where the party
has one and on foot, waits for morning, and plays it through with
`bot.doPlace()`; `bot.cruise(places)` does the same by ship, finding the
ship again after each. Both keep what happened in `bot.tourLog`.
`bot.doPlace()` enters the place underfoot, talks to everyone on every
floor its ladders reach (every word the Say menu offers, a question's named
answers before yes and no), and leaves by the south gate; `bot.trek(x, y)`
walks the open country, letting auto combat fight what bars the way and
looting the field after; `bot.camp(h)`, `bot.buyFood(n)`, `bot.jimmy(dir)`,
`bot.heal()`, `bot.save()` and `bot.shot(name)` (a PNG of the canvas, posted
to a local server) are the rest. A Shadowlord in a towne ("An air of...")
sends it straight out again.

`bot.cheat('Gold +500', ...)` reaches the cheats as a player does (Pause,
Cheats) and takes only what grinding would give - gold, food, levels,
reagents, mixtures, keys and torches, Glass Swords, a full restore - never an item of
the quest, a word, an unsealed dungeon or a journey: those are what a
playthrough is there to test. At sea, `bot.trek` routes by the game's own
rule for the craft in hand (a skiff's heading matters at a shore). In a
dungeon, `bot.dng.follow(goal)` plans through all eight levels - squares,
ladders, and rooms with a ladder inside them - and walks it in the first
person, lighting a torch, fighting rooms with auto combat and leaving them
by the side or ladder the plan wants; `bot.dng.map(level)` prints a level.

Later in the game the bot has what the quest asks: `bot.reach(x, y)` gets
there by ship and carpet together (a skiff walked off at the last step),
`bot.backToShip()` finds the craft again, `bot.shrine(v)`, `bot.codex()` and
`bot.spirituality()` (the moongate ride at midnight) do the shrine cycle,
and `bot.blinkTo(x, y)` crosses the Underworld's sealed chambers by Blink,
in the map's 32-wide window. Underground, `bot.dng.walk(goal)` is `follow`
with the rooms worked out: a room's sides from DUNGEON.CBT, the sides it
really offers on its live field (a river may cut one off), what each room
gave when entered the same way before, pits and holes with the grapple,
and ladders inside rooms; in a room `bot.dng.roomExit` fires triggers -
shot with a missile weapon when out of reach, stepped on, or pushed - and
wields the Sceptre at a magical barrier on the way. `bot.skipLoot = true`
leaves chests shut; `bot.fight()` comes back the moment the field changes
to a new room. It took the party from the title to the Codex's chamber
and the proclamation without a keyboard.

`extra.js`, evaluated after it, holds what a guided playthrough with only
the player's cheats wants: `bot.addWord(word)` (the Add word cheat, the
letter picker steered), `bot.mixSpell(/Blink/, n)`, `bot.unmake(name,
shard)` (a Shadowlord yelled up at its keep's flame and the shard cast in),
`bot.grind(done)` (fights met, a camp for the old man whenever someone has
the experience) and `bot.glassMode = true`, which plays every turn of a
fight by hand: a Glass Sword readied in the free hand when the last one
shatters, and the nearest foe walked into. `bot.restoreAt = 0.5` takes the
player's Full restore mid-fight; `bot.fleeAtOnce = true` runs from every
fight, and `bot.fleeAfter` (90 000 ms) is how long a fight goes on before it
runs - a dungeon room left is met afresh when walked back into, so a room too
strong for the party is fled and fought again for ever unless this is raised;
`bot.goTo(name)` is the development Go to.

Editing `bot.js` while a game runs reloads the page (it is under the dev
server's watch). A working copy kept elsewhere - under `node_modules`, which
it does not watch - is served from the dev server's cache: fetch it with a
query that changes (`?v=${Date.now()}`), or the copy before the edit runs.

`bot.shot(name)` posts the canvas to `node web/tools/pilot/shots.mjs`,
which writes `screenshots/<name>.png` at the repository's root (kept out
of git by that folder's own `.gitignore`).
