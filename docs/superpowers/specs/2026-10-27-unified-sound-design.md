# One Sound setting: effects that match the music

## Why

Several of the Standard effects are shockingly loud or piercing: the apparition arriving at camp worst of all, then
the bard's lute, the harpsichord, the clock chime, a failed spell, a fight beginning, a vanishing, the first part of
the victory tune, the shrine vision, and one part each of the trapdoor and of falling. The Standard set began as
chip-tune voices in the spirit of the originals (the ultima3 port's, `web/src/audio/chip.ts`, `chip3.ts`): bare
pulse waves, much of their energy where the ear is most sensitive. Some later effects (the waterfall) are real sounds,
softened above 3 kHz, and they sit well. The set is uneven, part "Nintendo", part real.

The music, meanwhile, is excellent, the Classical soundtrack above all, and it is closer to the original game's
intent. So the effects should belong to the music: one choice of sound for the whole game, the effects in the same
instruments and the same room as the tunes under them, easy on the ear for hours, as the music already is.

## What changes

### One Sound setting

The Audio menu's **Music** line (Classical, Electronic, Ambient, Upgrade (2001)) and **Sound FX** line (Standard,
Original) become one line:

> **Sound: Classical** / **Electronic** / **Ambient** / **Upgrade (2001)**

The choice sets both the soundtrack and the effects:

| Sound          | Music (as today)                  | Effects                                     |
| -------------- | --------------------------------- | ------------------------------------------- |
| Classical      | the Classical soundtrack          | a new Classical suite                       |
| Electronic     | the Electronic soundtrack         | a new Electronic suite                      |
| Ambient        | the Ambient soundtrack            | a new Ambient suite                         |
| Upgrade (2001) | the Upgrade's MIDI (`original`)   | the PC speaker effects (today's Original), unchanged |

Upgrade (2001) pairs with the speaker because that is what its players heard: the 2001 Upgrade added MIDI music
to a game whose effects stayed on the PC speaker.

**Music level** and **Sound FX level** stay separate lines, unchanged, so a player can still turn either down or off.

The line's note says what the choice is, as the Music line's notes do now, now covering the effects too.

The Standard chip set is retired as a choice. Code from it that a new suite reuses (the waterfall's and fountain's
voices, say) stays; what nothing uses goes.

**Saved settings** (builder's call, marked as such): the Sound choice is taken from the saved `musicVoice`; the
saved `soundSet` is dropped. A player who had chosen the Original effects with another soundtrack gets that
soundtrack's suite.

### The three new suites

Each suite voices **every effect that has a pitch** (the instruments, the jingles, the spells, the story's tones,
the deny/blip tones, the sweeps) in its soundtrack's palette:

- **Classical**: the Classical styles' instruments (`tools/music/styles/orchestrate.ts`, through MuseScore General):
  a real lute for the bard, a real harpsichord, a clock's bell, strings, harp, woodwinds, timpani. Not every effect
  needs the same ensemble. A shrine might be strings and harp, a fight's start low strings and timpani; what
  matters is that each sounds like it belongs in the Classical soundtrack.
- **Electronic**: the Electronic styles' analog synths (`styles/engine.ts`): soft filtered leads, pads, arpeggios,
  a deep bass, never a bare square.
- **Ambient**: the Ambient soundtrack's voices (`web/src/audio/remaster.ts`): soft pads, glass bells, mallets, a
  long room, calm.

Effects with no pitch (footsteps, bumps, blows, hits, thunder, the waterfall, the fountain, doors and the like)
are shared by all three suites. Those that are sharp are softened by the same rules; the rest stay as they are.

**What carries over.** Each effect keeps its role and its moment: a spell still rises by circle, a harpsichord key
still plays its note, Blackthorn's six notes are still his theme, the melodies already liked (the spells') are kept
and re-voiced, not replaced. Where a melody is the original's (the lute's, the harpsichord's, the apparition's), its
notes stay; only the voice changes, except as below.

**Durations stay roughly as they are now.** An effect's length should be close to today's Standard one. Where the
picture follows the sound (`TIMED` in `web/src/ui/sound.ts`: the harpsichord, the lute, the chants, Blackthorn's
and the apparition's notes, the shrine and gem shimmers, the whirlpool, the earthquake, a spirit's coming), the
game's timing must not change. A sampled note's natural ring may run past its old length if it is faded so that
nothing waits on it.

**Easy on the ear.** Every effect in every suite is measured as the music is (`tools/music/spectrum.ts`:
presence 2 to 5 kHz, sibilance 5 to 10 kHz, tilt, harshest), and none should measure harsher than the soundtrack it
sits on. Softer attacks, nothing bare and bright, peaks set so that no effect jumps out at the default levels
(Sound FX 80%, Music 60%). The effects a turn repeats stay quiet, short and a little varied, as now.

The test (designer's call):

- **Harshness:** each effect's presence, sibilance and tilt are no worse than the gentlest arrangement its
  soundtrack plays (as `spectrum.ts` measures it). The shared effects without pitch must pass against the strictest
  of the three. Effects shorter than `spectrum.ts`'s frame are measured over their whole length, zero-padded to one
  frame, instead of being left out.
- **Loudness:** at the default levels, no effect's short-term loudness (its loudest 100 ms) is more than 6 dB above
  the music's average loudness, except the moments meant to stand out (a victory, the apparition, a level gained, a
  shrine), which may be up to 10 dB above it. Today's apparition is the case this rule exists for.
- Both are checked by a script over every effect in every new suite, which reports the worst first, as
  `fatigue.ts` does for the music. Upgrade (2001) is exempt: its speaker effects and their level stay as they are.

### The apparition

When the old man's apparition comes to a camp (`combat.ts` `apparition`: today its first note, `spiritin`, then six
notes from the game's data), the seven notes are replaced, in the three new suites, by one brief phrase: a minor-key
turn on Lord British's theme (`MONARCH.XMI`), inspiring rather than ominous, in the suite's voices. Upgrade (2001)
keeps the speaker's notes.

Its length (designer's call): the seven notes now last about 1.7 s (`spiritin` 0.43 s, six notes of 0.215 s), and
the game waits that out before the reveal. The game still waits 1.7 s; the phrase may run to about 3.5 s, its end
ringing on under the reveal, so it can be a real phrase of the theme without slowing the camp.

The shrine vision (`shrine1`) gets the same care: no longer a long pulse whose width sweeps, but a held, rising and
falling tone the suite makes beautiful (strings and harp, a pad and bells), its length as now.

### The sound test page

`sounds.html` (`web/src/dev/sounds.ts`) shows the effects by the four Sound choices instead of Standard and Original,
each effect playable in each. It gains the **music**: every tune, in every soundtrack and every arrangement that
soundtrack plays (`web/src/audio/soundtracks.ts`), playable from the page, so an effect can be heard against the
tune it will sit on.

## Goals

- One Sound setting, the effects matching the music.
- No effect piercing, shrill or jumping out; every suite as easy on the ear as its soundtrack.
- The apparition's arrival a short minor-key phrase on Lord British's theme.
- The game's pace unchanged.
- The music on the sound test page.

## Non-goals

- Changing the music, its soundtracks or arrangements.
- Changing the Original (PC speaker) effects: Upgrade (2001) plays them exactly as now.
- New effects for moments that have none.

## Anti-goals (a failure even if it works)

- An effect that still makes a player wince, in any suite.
- Effects that sound pasted over the music: wrong room, wrong instruments, clashing.
- The game waiting longer on its sounds than now, or an effect starting late.
- Effects that need the network to play when the music does not (the apps carry their sound; the web keeps it
  offline).

## Constraints

- An effect starts at once. However the suites are made (rendered ahead like the music, synthesized in the page as
  the Standard set is, or both), playing one must not wait on a fetch or a decode at that moment.
- Offline and the apps: the effects travel as the music does (the service worker on the web, the bundle in the
  apps).
- Download size (designer's call): the three suites together add no more than about 10 MB. Unlike the music, which
  is cached when a tune first plays, the effects are cached when the game is installed (every suite, so changing
  Sound never waits on the network), so this limit is also what the first install adds. Where rendering every note
  would go over, the Electronic and Ambient suites are synthesized in the page (as `remaster.ts` already does for
  Ambient) and only Classical's sampled instruments are rendered.
- MuseScore General is a build-time tool only (`tools/music/.cache/`, never shipped), as for the music.
- The repo's usual checks (tests, tsc, lint, prettier) pass; the docs (`docs/features.md`, `README.md`, the Audio
  menu's notes) are updated to say Sound.

## Left to the builder

- How each suite is made: rendered offline (the music's pipeline, `tools/music`) to files the game plays, or
  synthesized in the page, or a mix. Effects called with many pitches (the harpsichord's keys, the lute, the chime,
  the spells by circle, Blackthorn's notes) suggest rendering each note ahead.
- Which instruments each effect takes, within its suite's palette.
- The apparition phrase's exact notes, from MONARCH's theme turned minor.
- How the sound test page lays out the music.
- How the shared effects without pitch are softened.
