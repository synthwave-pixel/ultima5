/**
 * soundtracks.ts
 *
 * The four soundtracks the Music setting chooses among, and which of the
 * tunes' arrangements each plays where. Original and Remastered are each one
 * arrangement of every tune; Electronic and Classical were chosen tune by
 * tune from the arrangements rendered in many styles (tools/music/styles),
 * and play the Original's or the Remastered's own file where it was chosen.
 *
 * A tune heard over and over has several: one is picked at random each time
 * it starts (ui/sound.ts). An occasion - the title, a shrine, a story, the
 * night - may have its own; where it has none, the tune's usual ones play.
 * The render makes what this names (tools/music/render.ts).
 */

/** An arrangement of a tune: the Original's, the Remastered's, or one of the styles'. */
export const ARRANGEMENTS = [
  'original',
  'remastered',
  'celtic',
  'consort',
  'orchestra',
  'piano',
  'strings',
  'grid',
  'newwave',
  'upsidedown',
  'juno',
] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];

/** The soundtracks (the Music setting), Classical the default. */
export const SOUNDTRACKS = ['classical', 'electronic', 'remastered', 'original'] as const;
export type Soundtrack = (typeof SOUNDTRACKS)[number];

/**
 * Where a tune is asked for, where that has arrangements of its own: the title screen, a shrine (and the Codex's
 * chamber), the introduction's story, the closing story, and Britannia by night.
 */
export type Occasion = 'title' | 'shrine' | 'introduction' | 'closing' | 'night';

/** A soundtrack's arrangements of a tune: its usual ones, and an occasion's own. */
export type Choices = { usual: Arrangement[] } & Partial<Record<Occasion, Arrangement[]>>;

const ALL_CLASSICAL: Arrangement[] = ['celtic', 'consort', 'orchestra', 'piano', 'strings'];
const BUT_PIANO: Arrangement[] = ['celtic', 'consort', 'orchestra', 'strings'];
const ALL_ELECTRONIC: Arrangement[] = ['grid', 'newwave', 'upsidedown'];

/** Electronic's and Classical's arrangements of each tune (game/music.ts TUNE_FILES), as chosen. */
export const PICKS: Record<string, Record<'classical' | 'electronic', Choices>> = {
  // The character's making, the reunion with Lord British, the proclamation of victory: heard once, each one.
  'AMIGA.XMI': { classical: { usual: ['original'] }, electronic: { usual: ['remastered'] } },
  'REUNION.XMI': { classical: { usual: ['piano'] }, electronic: { usual: ['remastered'] } },
  'RULEBRIT.XMI': { classical: { usual: ['piano'] }, electronic: { usual: ['upsidedown'] } },
  // Blackthorn's castle: the tyrant's, played ominous.
  'BLCKTHRN.XMI': { classical: { usual: ['orchestra'] }, electronic: { usual: ['grid'] } },
  // Britannia, by day and by night.
  'BRITLAND.XMI': {
    classical: { usual: ['original', 'celtic', 'consort'], night: ['orchestra', 'strings'] },
    electronic: { usual: ['remastered', 'newwave'], night: ['grid', 'upsidedown'] },
  },
  // Every fight.
  'ENGGMNT.XMI': { classical: { usual: BUT_PIANO }, electronic: { usual: ['original', 'remastered', ...ALL_ELECTRONIC] } },
  // The Lycaeum, Empath Abbey, Serpent's Hold: restful places.
  'FANFARE.XMI': { classical: { usual: ['piano'] }, electronic: { usual: ['juno'] } },
  // The huts and villages; the introduction's last pages.
  'GREYSON.XMI': {
    classical: { usual: ['original', ...ALL_CLASSICAL], introduction: ['consort'] },
    electronic: { usual: ['remastered', 'newwave'], introduction: ['remastered'] },
  },
  // The dungeons; the introduction's middle pages.
  'HALLS.XMI': {
    classical: { usual: ['original', ...BUT_PIANO], introduction: ['consort'] },
    electronic: { usual: ['remastered', ...ALL_ELECTRONIC], introduction: ['remastered'] },
  },
  // Aboard a frigate.
  'HORNPIPE.XMI': { classical: { usual: ['original', ...ALL_CLASSICAL] }, electronic: { usual: ['remastered', 'newwave'] } },
  // The lighthouses and keeps; the closing story's last pages.
  'LADYNAN.XMI': {
    classical: { usual: ['original', 'consort', 'piano'], closing: ['piano'] },
    electronic: { usual: ['remastered', 'newwave'], closing: ['remastered'] },
  },
  // Lord British's castle.
  'MONARCH.XMI': {
    classical: { usual: ['orchestra', 'piano', 'strings'] },
    electronic: { usual: ['remastered', 'newwave', 'upsidedown'] },
  },
  // Every camp; every shrine; the introduction's first pages and the closing story's.
  'STONES.XMI': {
    classical: { usual: ['celtic', 'orchestra', 'strings'], shrine: ['piano'], introduction: ['consort'], closing: ['piano'] },
    electronic: {
      usual: ['original', 'remastered', 'newwave'],
      shrine: ['upsidedown'],
      introduction: ['remastered'],
      closing: ['remastered'],
    },
  },
  // The eight towns.
  'TRNTLLA.XMI': { classical: { usual: ALL_CLASSICAL }, electronic: { usual: ['remastered', ...ALL_ELECTRONIC] } },
  // After a won battle; the title screen.
  'U5THEME.XMI': {
    classical: { usual: BUT_PIANO, title: ['consort'] },
    electronic: { usual: ['remastered', ...ALL_ELECTRONIC], title: ['upsidedown'] },
  },
  // The Underworld.
  'WRLDBLW.XMI': { classical: { usual: BUT_PIANO }, electronic: { usual: ['remastered', ...ALL_ELECTRONIC] } },
};

/** The arrangements soundtrack `soundtrack` may play of tune `name` on `occasion`. */
export function arrangementsFor(soundtrack: Soundtrack, name: string, occasion?: Occasion): Arrangement[] {
  if (soundtrack === 'original' || soundtrack === 'remastered') return [soundtrack];
  const choices = PICKS[name]?.[soundtrack];
  if (!choices) return ['remastered'];
  return (occasion && choices[occasion]) || choices.usual;
}

/** Every arrangement of tune `name` some soundtrack plays: what the render makes of it. */
export function arrangementsOf(name: string): Arrangement[] {
  const all = new Set<Arrangement>(['original', 'remastered']);
  for (const soundtrack of ['classical', 'electronic'] as const)
    for (const list of Object.values(PICKS[name]?.[soundtrack] ?? {})) for (const a of list ?? []) all.add(a);
  return ARRANGEMENTS.filter((a) => all.has(a));
}

/** One of `choices` at random (`random` 0 to 1), not `last` where there is another. */
export function pick(choices: Arrangement[], last: Arrangement | undefined, random: () => number): Arrangement {
  const fresh = choices.length > 1 ? choices.filter((c) => c !== last) : choices;
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
}
