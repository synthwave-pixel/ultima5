/**
 * sfxCatalogue.ts
 *
 * What each sound effect is, when the game plays it, how often, and where
 * (for the sound test page, sounds.html). Keyed by the effect's name - u5d's
 * for the DOS game's own effects (audio/effects.ts RULES and the families),
 * the cue's for the port's own (game/cues.ts). Our words, not the game's.
 */

export type Often = 'every step' | 'every blow' | 'often' | 'now and then' | 'rare' | 'once';

export interface About {
  /** What it is, in a few words. */
  what: string;
  /** When the game plays it. */
  when: string;
  often: Often;
  /** Where in the code it is played: file and function. */
  where: string;
  /** The section of the page. */
  group: Group;
}

export type Group = 'Moving about' | 'Combat' | 'Magic' | 'Places and events' | 'The story' | 'Music and instruments' | 'The menus';

export const GROUPS: Group[] = ['Moving about', 'Combat', 'Magic', 'Places and events', 'The story', 'Music and instruments', 'The menus'];

const a = (what: string, when: string, often: Often, where: string, group: Group): About => ({ what, when, often, where, group });

/** The DOS game's effects, by u5d's name. */
export const ABOUT: Record<string, About> = {
  // Moving about.
  step0: a(
    'Footstep (left)',
    'Every step on foot in the world and in towns, alternating with step1; a member’s step in a fight.',
    'every step',
    'town.ts footstep, story.ts footstepSound, combat.ts movePlayer',
    'Moving about',
  ),
  step1: a(
    'Footstep (right)',
    'Every other step on foot, the second of the pair.',
    'every step',
    'town.ts footstep, story.ts footstepSound',
    'Moving about',
  ),
  dunstep0: a(
    'Dungeon footstep, near',
    'Walking a dungeon passage: the echo of the first step.',
    'every step',
    'dungeon.ts footsteps',
    'Moving about',
  ),
  dunstep1: a(
    'Dungeon footstep, fading',
    'The next echo of a dungeon step, a little lower.',
    'every step',
    'dungeon.ts footsteps',
    'Moving about',
  ),
  dunstep2: a('Dungeon footstep, fainter', 'The third echo of a dungeon step.', 'every step', 'dungeon.ts footsteps', 'Moving about'),
  dunstep3: a('Dungeon footstep, last', 'The last, lowest echo of a dungeon step.', 'every step', 'dungeon.ts footsteps', 'Moving about'),
  blocked: a(
    'Blocked',
    'Walking into a wall, water or anything else that stops the party; an arena edge a member cannot leave by.',
    'often',
    'town.ts move, outdoors.ts mayMove, combat.ts leaveArena',
    'Moving about',
  ),
  drip0: a(
    'Stalactite drip',
    'In a dungeon, a drip falling from the ceiling in view, fainter the farther off.',
    'now and then',
    'dungeon.ts drip',
    'Moving about',
  ),
  whirl: a(
    'Whirlpool, ship sinking',
    'The ship caught by a whirlpool, or sinking when its hull gives out.',
    'rare',
    'outdoors.ts creatureReaches, hullDamage',
    'Moving about',
  ),
  fall: a('Falling', 'Falling down a hole or a pit.', 'rare', 'outdoors.ts falls', 'Moving about'),
  trapfall: a('Trapdoor', 'The Stonegate trapdoor dropping the party into the lava.', 'rare', 'town.ts (Stonegate)', 'Moving about'),
  shiphit: a('Ship runs aground', 'Sailing into the shore or a rock.', 'now and then', 'outdoors.ts mayMove', 'Moving about'),
  shake: a('Earthquake', 'The screen shakes: an earthquake or a great blow.', 'rare', 'effects.ts shakeScreen', 'Moving about'),

  // Combat.
  attack: a(
    "The party's swing",
    'A member swings a weapon (the Original also uses it for a monster’s swing).',
    'every blow',
    'combat.ts swing',
    'Combat',
  ),
  damage: a(
    'A member hurt',
    'A party member takes damage anywhere: a blow, a trap, poison, lava.',
    'every blow',
    'time.ts damageMember',
    'Combat',
  ),
  burst1: a(
    'A blow lands on the party',
    'A monster’s blow or missile hits a member; a trap goes off on the opener.',
    'every blow',
    'combat.ts hitFlash, items.ts springTrap',
    'Combat',
  ),
  burst2: a(
    'A blow lands on a monster',
    'The party hits a monster; a thing vanishes in a puff.',
    'every blow',
    'combat.ts hitFlash, effects.ts explosion, look.ts',
    'Combat',
  ),
  foefire: a(
    'A monster shoots',
    'A monster fires an arrow, a bolt or a spell at the party (Standard: a spell has its own sound).',
    'every blow',
    'combat.ts monsterShoots',
    'Combat',
  ),
  launch: a(
    'A missile loosed',
    'A member throws or shoots at range; an enemy ship firing a broadside at sea.',
    'every blow',
    'combat.ts rangedAttack, outdoors.ts broadside',
    'Combat',
  ),
  cannon: a('Cannon', "The party's ship firing its cannons.", 'now and then', 'cmds.ts fireCommand, broadside', 'Combat'),
  victory1: a('Victory, first part', 'A fight won: the rising notes.', 'often', 'combat.ts victoryTune', 'Combat'),
  victory2: a(
    'Victory, last note',
    'The held note that ends the victory tune (Standard folds it into the fanfare).',
    'often',
    'combat.ts victoryTune',
    'Combat',
  ),
  vanish: a(
    'Vanish',
    'Something disappears: a magic ring lost, a member absorbed by the Mirror of Truth, furniture undone by Negate Matter; and a graze, one leaving the field, one dragged under. Standard gives each its own.',
    'often',
    'combat.ts, zstats.ts, magic.ts',
    'Combat',
  ),
  regurgit: a('Regurgitated', 'A creature spits out a member it had swallowed.', 'rare', 'combat.ts regurgitate', 'Combat'),
  possess: a('Possessed', 'A member possessed by a creature, or passing out.', 'rare', 'combat.ts monsterMagic, passOut', 'Combat'),
  gatein: a('A daemon gated in', 'A monster summons a daemon onto the field.', 'rare', 'combat.ts monsterMagic', 'Combat'),
  denyhi: a(
    'Refused, high',
    'A command that cannot be used in a fight: the high note of the pair.',
    'now and then',
    'combat.ts notInCombat',
    'Combat',
  ),
  denylo: a('Refused, low', 'The low note that follows the high one.', 'now and then', 'combat.ts notInCombat', 'Combat'),

  // Magic.
  absorb: a('Magic absorbed', 'A spell swallowed: cast where magic fails, or at a Shadowlord.', 'rare', 'magic.ts castCommand', 'Magic'),
  failure: a(
    'Failed',
    'A spell, a key or a trick fails; something stolen; a torch borrowed.',
    'often',
    'magic.ts, items.ts jimmy, talk.ts',
    'Magic',
  ),
  summon: a('Summoning', 'A summoning spell brings a creature to fight for the party.', 'rare', 'magic.ts summonDaemon', 'Magic'),
  artifact: a('An artifact used', 'Casting with the regalia (a spell’s effect at its greatest).', 'rare', 'magic.ts castEffect', 'Magic'),
  sceptuse: a('The Sceptre wielded', "Lord British's Sceptre used against the strange walls.", 'rare', 'magic.ts wieldSceptre', 'Magic'),
  spell1: a(
    'Spell, first circle',
    'A first-circle spell cast. Original: each circle higher. Standard: a resonant synth sweep and a note blooming out of it at the first, each circle longer and richer to a dramatic phrase at the eighth; a little different every cast.',
    'often',
    'magic.ts castEffect',
    'Magic',
  ),
  spell2: a('Spell, second circle', 'The sparkle of a second-circle spell.', 'often', 'magic.ts castEffect', 'Magic'),
  spell3: a('Spell, third circle', 'The sparkle of a third-circle spell.', 'often', 'magic.ts castEffect', 'Magic'),
  spell4: a('Spell, fourth circle', 'The sparkle of a fourth-circle spell.', 'now and then', 'magic.ts castEffect', 'Magic'),
  spell5: a('Spell, fifth circle', 'The sparkle of a fifth-circle spell.', 'now and then', 'magic.ts castEffect', 'Magic'),
  spell6: a('Spell, sixth circle', 'The sparkle of a sixth-circle spell.', 'now and then', 'magic.ts castEffect', 'Magic'),
  spell7: a('Spell, seventh circle', 'The sparkle of a seventh-circle spell.', 'rare', 'magic.ts castEffect', 'Magic'),
  spell8: a('Spell, eighth circle', 'The sparkle of an eighth-circle spell.', 'rare', 'magic.ts castEffect', 'Magic'),

  // Places and events.
  moongate: a('Moongate', 'A moongate rising or sinking, and stepping through one.', 'now and then', 'moongate.ts', 'Places and events'),
  shock: a('Electric field', 'Walking into an electric field in a dungeon.', 'rare', 'dungeon.ts electricField', 'Places and events'),
  status: a('Put to sleep', 'A dungeon’s sleep trap putting members to sleep.', 'rare', 'dungeon.ts sleepSpell', 'Places and events'),
  watrfall: a(
    'Waterfall',
    'Standing near a waterfall: its roar and babble, on and on, louder nearer (and in the introduction).',
    'often',
    'frame.ts ambientSound, intro.ts',
    'Places and events',
  ),
  fountain: a('Fountain', 'Standing near a fountain: its splash, over and over.', 'often', 'frame.ts ambientSound', 'Places and events'),
  tickhigh: a(
    'Clock tick',
    'Near a clock: the tick (and the introduction’s clock).',
    'often',
    'frame.ts ambientSound, intro.ts',
    'Places and events',
  ),
  ticklow: a('Clock tock', 'Near a clock: the tock after the tick.', 'often', 'frame.ts ambientSound, intro.ts', 'Places and events'),
  chime: a(
    'Clock chime',
    'A clock striking the hour when the party stands near it.',
    'now and then',
    'frame.ts ambientSound',
    'Places and events',
  ),
  air: a('An air of evil', 'A town under a Shadowlord’s shadow: the air named on entering.', 'rare', 'town.ts airOf', 'Places and events'),
  shadowin: a(
    'A Shadowlord appears',
    'Yelling a Shadowlord’s true name in a town, and one appearing.',
    'rare',
    'cmds.ts yellInTown',
    'Places and events',
  ),
  shop0: a(
    'Healing light, rising',
    "A healer's cure: the light's first notes.",
    'now and then',
    'shops.ts healingLight',
    'Places and events',
  ),
  shop1: a('Healing light, turning', "A healer's cure: the middle notes.", 'now and then', 'shops.ts healingLight', 'Places and events'),
  shop2: a(
    'Healing light, settling',
    "A healer's cure: the last notes (also the menus' back-out note).",
    'now and then',
    'shops.ts healingLight, menu.ts',
    'Places and events',
  ),
  introhit: a('Introduction blow', 'In the opening story, the blow that strikes.', 'once', 'intro.ts', 'Places and events'),

  // The story.
  sceptre: a(
    'The Sceptre reclaimed',
    'Fighting a Shadowlord with the Sceptre in hand: it is taken back.',
    'rare',
    'combat.ts attackCombat',
    'The story',
  ),
  blackapp: a('Blackthorn appears', 'Captured and brought before Blackthorn.', 'rare', 'story.ts captured', 'The story'),
  revive: a('Healed at the end', 'In the endgame, the party made whole.', 'once', 'story.ts endgame', 'The story'),
  endmoon: a('The ending', 'The endgame’s last sound.', 'once', 'story.ts endgame', 'The story'),
  spiritin: a(
    'The apparition arrives',
    'At camp, the old man’s apparition appearing (its first note).',
    'now and then',
    'combat.ts apparition',
    'The story',
  ),
  raise: a('A level gained', 'At camp, the apparition raising a member a level.', 'now and then', 'combat.ts apparition', 'The story'),
};

/** The families of notes, by the name the page gives each. */
export const FAMILY: Record<string, About> = {
  harpsichord: a(
    'Harpsichord note',
    'Playing the harpsichord in a town: one note a key (0-9).',
    'now and then',
    'town.ts numberKey',
    'Music and instruments',
  ),
  lute: a(
    "A bard's lute",
    'A bard playing nearby in town: the tune, note by note.',
    'often',
    'frame.ts ambientSound',
    'Music and instruments',
  ),
  'cast circle': a(
    'Spell hum',
    'The two long hums after a spell’s sparkle, by circle (Standard folds them into the spell).',
    'often',
    'magic.ts castEffect',
    'Magic',
  ),
  'chant (shrine)': a('Shrine chant', 'Meditating at a shrine: the mantra’s notes.', 'now and then', 'shrine.ts', 'The story'),
  blackthorn: a(
    'The party’s rest disturbed',
    'When the whole party has died: the tune as its rest is disturbed, before it is raised again (u5d names it for Blackthorn).',
    'rare',
    'story.ts dying',
    'The story',
  ),
  apparition: a('Apparition', 'The old man’s apparition at camp: its notes.', 'now and then', 'combat.ts apparition', 'The story'),
  gemshard: a('Gem shard', 'Holding up one of the evil shards.', 'rare', 'magic.ts useShard', 'The story'),
  shrine1: a('Shrine vision', 'At a shrine, the vision’s long rising and falling tone.', 'now and then', 'shrine.ts chime', 'The story'),
  shrine2: a('Shrine, quest given', 'At a shrine, the quest’s tone.', 'now and then', 'shrine.ts chime', 'The story'),
};

/** The port's own sounds, where the DOS game had none or one sound served two things (game/cues.ts). */
export const CUES: Record<string, About & { original?: string }> = {
  DoorOpen: a('Door opened', 'Opening a door: a latch and a soft knock.', 'often', 'items.ts openCommand', 'Places and events'),
  DoorClose: a(
    'Door swings shut',
    'An open door closing by itself four turns later, where it is in view.',
    'often',
    'town.ts (turn timer)',
    'Places and events',
  ),
  TorchIgnite: a('Torch lit', 'Lighting a torch.', 'now and then', 'cmds.ts igniteCommand', 'Moving about'),
  Upwards: a('Ladder up', 'Climbing a ladder up in a town.', 'now and then', 'town.ts klimbInTown', 'Moving about'),
  Downwards: a('Ladder down', 'Climbing a ladder down in a town.', 'now and then', 'town.ts klimbInTown', 'Moving about'),
  MountHorse: a('Horse mounted', 'Boarding a horse.', 'now and then', 'cmds.ts boardCommand', 'Moving about'),
  HorseWalk: {
    ...a('Hooves', 'Every step on horseback (each a little different).', 'every step', 'town.ts footstep', 'Moving about'),
    original: 'step0',
  },
  Graze: {
    ...a(
      'A blow glances off',
      'A blow that lands but does no harm: "grazed!" (the Original sounds its vanishing).',
      'every blow',
      'combat.ts report',
      'Combat',
    ),
    original: 'vanish',
  },
  Withdraw: {
    ...a(
      'One leaves the field',
      'A monster fleeing, a member stepping off the field, the party leaving a won fight (the Original sounds its vanishing).',
      'often',
      'combat.ts monsterTurn, leaveArena, escape',
      'Combat',
    ),
    original: 'vanish',
  },
  DraggedUnder: {
    ...a(
      'Dragged under',
      'A member pulled under the water by a sea creature (the Original sounds its vanishing).',
      'rare',
      'combat.ts report',
      'Combat',
    ),
    original: 'vanish',
  },
  Dissolve: {
    ...a(
      'Magic undone',
      'A magic ring vanishing (as a fight begins, or when readied), or a thing unmade by Negate Matter after its spell (the Original sounds its vanishing).',
      'rare',
      'combat.ts prepareCombat, zstats.ts, magic.ts anYlem',
      'Combat',
    ),
    original: 'vanish',
  },
  Absorbed: {
    ...a(
      'Absorbed by the Mirror',
      'A member stepping before the Mirror of Truth and absorbed: the dissolve, slower (the Original sounds its vanishing).',
      'rare',
      'combat.ts checkMirror',
      'Combat',
    ),
    original: 'vanish',
  },
  DeathMale: a("A man's death", 'A male member dying.', 'rare', 'combat.ts, time.ts', 'Combat'),
  DeathFemale: a("A woman's death", 'A female member dying.', 'rare', 'combat.ts, time.ts', 'Combat'),
  BigDeath: a('The party falls', 'The whole party dead.', 'rare', 'story.ts', 'Combat'),
  CombatStart: a('A fight begins', 'Entering a fight.', 'often', 'combat.ts prepareCombat', 'Combat'),
  Attack: {
    ...a(
      "A monster's blow",
      'A monster swinging at a member (the Original uses the party’s swing).',
      'every blow',
      'combat.ts swing',
      'Combat',
    ),
    original: 'attack',
  },
  MonsterSpell: {
    ...a(
      "A monster's spell",
      'A monster casting at the party (the Original uses its missile).',
      'now and then',
      'combat.ts monsterShoots',
      'Combat',
    ),
    original: 'foefire',
  },
  Ouch: a('A cactus', 'Walking into a cactus.', 'rare', 'outdoors.ts mayMove', 'Moving about'),
  Immolate: a('Fire field', 'Standing in a fire field in a fight.', 'now and then', 'combat.ts squareEffect', 'Combat'),
  Alarm: a('The guards called', 'The guards summoned in a town after a crime.', 'rare', 'town.ts callGuards', 'Places and events'),
  ForceField: a(
    'Force field',
    'Walking into an electric field in a dungeon (Standard only; the Original has its shock).',
    'rare',
    'dungeon.ts electricField',
    'Places and events',
  ),
  Invocation: a('The Codex speaks', 'The Codex of Ultimate Wisdom answering.', 'once', 'shrine.ts', 'The story'),
};
