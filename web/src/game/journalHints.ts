/**
 * journalHints.ts
 *
 * The journal's hints (the port's own words, journal.ts): where each shrine, dungeon and Flame is, and who knows what
 * opens it - never the mantra or the Word itself. Y on a line of the journal prints its hint in the log. The places
 * and the people were found in the game's own files: the map's coordinates and the townsfolk's conversations.
 */

/** By virtue, in the game's order: Honesty, Compassion, Valour, Justice, Sacrifice, Honor, Spirituality, Humility. */
export const SHRINE_HINTS: string[] = [
  "On an isle north of Moonglow, by Deceit's mouth. Malifora, Moonglow's gypsy, knows its mantra.",
  'Just west of Cove, east of Britain. Greyson in Britain knows its mantra.',
  'On an islet just south of Jhelom. Thorne in Jhelom knows its mantra.',
  'North and a little east of Yew. Chamfort in Yew knows its mantra: name Jeremy to him.',
  'In the eastern desert, southeast of Minoc. Rew in Minoc gives its mantra in a rhyme.',
  'Southwest of Trinsic. Gruman in Trinsic tells its mantra to the honourable.',
  'Beyond the moongates: enter one at midnight. Lady Janell at the Lycaeum tells how; Kindor in Skara Brae knows its mantra.',
  'On the Isle of the Avatar, north of Hythloth: a ship is needed. Wartow in New Magincia knows its mantra.',
];

/** By dungeon, in the game's order: Deceit, Despise, Destard, Wrong, Covetous, Shame, Hythloth, Doom. */
export const DUNGEON_HINTS: string[] = [
  'North of Moonglow, by the Shrine of Honesty. Malifora in Moonglow knows its Word.',
  'North of Britain. Annon in Britain knows its Word.',
  'West of Trinsic. Goeth in Jhelom knows its Word, though he says it backwards.',
  "West of Minoc. Felespar in Yew knows its Word, once told the Resistance's password.",
  'Just south of Minoc, on Lost Hope Bay. Fiona in Minoc knows its Word.',
  'West of Britain. Sindar in Trinsic knows its Word.',
  "At the southeast corner of the Isle of the Avatar. Hassad in Blackthorn's palace knows its Word.",
  "On an isle at the heart of the Underworld, beyond Shame's egress. Peaks wall it off: Blink (In Por) crosses them, landing on the farthest grass in its line. Round it lies a darkness no party can walk without Lord British's Amulet worn. Its Word is the Codex's to give, once every shrine's quest is answered; its gate holds against the party until all three Shadowlords are destroyed",
];

/**
 * By Shadowlord, in the saved game's order (DATA.OVL 0x444a): Falsehood, Hatred, Cowardice. Who knows each one's name,
 * not the name: it must be found to call the Shadowlord up at its flame.
 */
export const SHADOWLORD_HINTS: string[] = [
  'Undone by the Shard of Falsehood at the Flame of Truth, in the Lycaeum; Lord Shalineth there knows its name. The shard lies below Deceit, and the twins in Cove know the way.',
  "Undone by the Shard of Hatred at the Flame of Love, in Empath Abbey. Sin'Vraal, in his hut in the east, knows its name and the way in by Lost Hope Bay.",
  "Undone by the Shard of Cowardice at the Flame of Courage, in Serpent's Hold; Lord Malone there knows its name, and Gardner, keeper of the Flame, the way.",
];

/** The shards, together. */
export const SHARD_HINT =
  'The three shards lie deep in the Underworld, down from a dungeon. Its waters are crossed on a magic carpet, and where peaks wall a chamber off, the Blink spell (In Por) crosses them. Sutek, in his hut, tells of the shards.';

/**
 * The equipment the journal lists, in its order: its name, what it is for (A) - for the quest's own things only a
 * rumour (`rumored`, how the rumour names it), or a dream - and where it is to be had (Y). The Sandalwood box's
 * harpsichord is the one in Lord British's chamber, two floors up: the castle's other, below, opens nothing. A thing
 * with a `gate` is a mystery until heard of or held (journal.ts heardOfThings).
 */
export const EQUIPMENT: { name: string; use?: string; rumored?: string; where: string; gate?: string }[] = [
  {
    name: 'Grapple',
    use: 'Climbs mountains on foot, and up through a hole in a dungeon ceiling.',
    where: 'Lord Michael at Empath Abbey, west of Yew, gives one: ask him of the grapple.',
  },
  {
    name: 'Sextant',
    use: 'Outdoors at night, tells where the party is.',
    where: "David, Greyhaven's lighthouse keeper, gives one; find him by night. Scally, the bard in Buccaneer's Den, knows its name.",
  },
  {
    name: 'Gems',
    use: 'View: a map of the land about, or of a dungeon level. Each is spent.',
    where: "Sold by the guilds, in Paws, New Magincia and Buccaneer's Den; a few lie hidden in towns.",
  },
  {
    name: 'Torches',
    use: 'Ignite: light in a dungeon or the night. Each burns out.',
    where: "Sold by the guilds, in Paws, New Magincia and Buccaneer's Den; a few lie hidden in towns.",
  },
  {
    name: 'Keys',
    use: "Jimmy a locked door or chest, or a prisoner's stocks. A key may break.",
    where: "Sold by the guilds, in Paws, New Magincia and Buccaneer's Den. Jeremy, the chef in Yew, has some.",
  },
  {
    name: 'Skull keys',
    gate: 'skullkeys',
    use: 'Open a magically locked door. Each is spent.',
    where: "Kristi, the cook at Serpent's Hold, sells them; she says Minoc's armourer made them.",
  },
  {
    name: 'Magic carpet',
    gate: 'carpet',
    use: 'Flies over water, and serves as a lifeboat if the ship sinks.',
    where:
      'Lord British kept it in his private chamber, atop his castle, behind a magic lock. Its guard goes below at one in the afternoon and at eleven at night. Bandaii in Paws tells of it.',
  },
  {
    name: 'Spyglass',
    use: 'Outdoors at night, shows the moons and the planets.',
    where: 'Lord Seggallion at Farthing, the keep in the far south, gives it to one who knows the virtues.',
  },
  { name: 'Pocket watch', use: 'Tells the time.', where: 'The party set out with it.' },
  {
    name: 'Black Badge',
    gate: 'badge',
    rumored: 'Black Badge',
    where: "Elistaria at Windemere, the keep in the far northeast, gives it for Blackthorn's password. Flain in Skara Brae knows the word.",
  },
  {
    name: 'Sandalwood box',
    use: 'In a dream, a sandalwood box, precious to Lord British: he will need it at the last.',
    where: "Play the harpsichord in Lord British's chamber. Learn the tune in Greyhaven.",
  },
  {
    name: 'Moonstones',
    where: 'Each lies buried under its moongate. Goeth in Jhelom tells how: search where a gate sank, by day.',
  },
  // Lord British's regalia.
  {
    name: 'Crown',
    gate: 'crown',
    use: 'Worn, it wards off enemy spells.',
    where:
      "In Blackthorn's palace, behind a magically locked door on its top floor, among gargoyles that split when struck. Wear the Black Badge and give its guards the password, or be taken before Blackthorn; no spell works within, so bring skull keys. Worn, it wards off enemy spells.",
  },
  {
    name: 'Amulet',
    gate: 'amulet',
    use: 'Worn, it keeps a light in the darkness of Doom.',
    where: 'In the Underworld, among the graves of fallen warriors below Destard. Worn, it keeps a light in the darkness of Doom.',
  },
  {
    name: 'Sceptre',
    gate: 'sceptre',
    use: 'Used, it dissolves force fields.',
    where: "In Stonegate, the Shadowlords' fortress north of Cove, among mountains a grapple climbs. Used, it dissolves force fields.",
  },
];
