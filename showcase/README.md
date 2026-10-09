# Showcase saves

Saved games at some of Ultima V's best sights, each with a party of the
level, gear, spells and quest items a player would have there. They are for
trying the game out, taking screenshots and video, and testing.

**To play one:** download its `.json` file, then in the game open
**Settings → Import saved game → From a file** and pick it. Choose
**Add Showcase** the first time, or **Replace Showcase's game** after
that, then **Journey Onward**. They all belong to the same Avatar,
*Showcase*, so they take up one of the game's eight character places, and
each game replaced is kept among Showcase's earlier saves. They use the
game's default settings.

| File | Where | The party |
|---|---|---|
| [01-new-game](01-new-game.json) | Iolo's hut: a new game, as 1988 begins it (Shamino is wounded) | as the game starts |
| [02-britain-market](02-britain-market.json) | Britain at noon, a few steps inside the gate | level 2, leather, 400 gold |
| [03-buccaneers-den](03-buccaneers-den.json) | Buccaneer's Den, the pirates' town, Dupre along | level 3, 1500 gold for the shops |
| [04-harpsichord](04-harpsichord.json) | On the stool at Lord British's harpsichord, Lord Kenneth's lesson in the journal: walk south and play | level 3 |
| [05-lycaeum](05-lycaeum.json) | The Lycaeum, the mages' hall, Mariah along | level 4, chain, reagents, spells mixed |
| [06-shrine](06-shrine.json) | Beside a Shrine of Virtue, in the morning | level 4 |
| [07-magic-carpet](07-magic-carpet.json) | Flying the magic carpet by Lord British's castle | level 5 |
| [08-frigate](08-frigate.json) | Aboard a frigate off Buccaneer's Den, its hull whole | level 5 |
| [09-dungeon-deceit](09-dungeon-deceit.json) | The top of Deceit, a light spell cast | level 5, a party of six |
| [10-underworld](10-underworld.json) | The Underworld, out of Deceit's depths | level 6, plate and magic arms |
| [11-stonegate](11-stonegate.json) | Stonegate, the Shadowlords' keep | level 6 |
| [12-blackthorns-palace](12-blackthorns-palace.json) | Blackthorn's palace, the Black Badge in hand | level 7 |
| [13-doom](13-doom.json) | Doom: its first room's fight begins at once | level 8, mystic arms, the quest's items, every spell |

They are made by `npm run saves` in `web/`, from a copy of the game's own
files (see [the developer notes](../docs/developer-notes.md)); the places
and parties are in `web/tools/saves/showcase.ts`.
