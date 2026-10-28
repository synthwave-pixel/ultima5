# One Sound Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new effects suites (Classical, Electronic, Ambient) that match the soundtracks, heard first on the
sound test page, then made the game's one Sound setting.

**Architecture:** Every effect with a pitch is written once as a short score (GM programs, notes, a length) and
rendered offline through each soundtrack's own renderer (MuseScore General for Classical, `remaster.ts` for Ambient,
a new `engine.ts` export for Electronic) into one Opus file per suite, an atlas of slices with a manifest. The page
plays a slice of the decoded atlas; family notes (harpsichord, lute, chant) are a rendered note bank played at the
call's exact pitch. Effects with no pitch keep their chip voices, softened, shared by all three suites.

**Tech Stack:** TypeScript, Web Audio, vitest, `node-web-audio-api` and `spessasynth_core` (render only), ffmpeg
(Homebrew, Opus), MuseScore General in `web/tools/music/.cache/`.

**Spec:** `docs/superpowers/specs/2026-10-27-unified-sound-design.md`

**Staging (the user's):** Tasks 1-7 build the suites and the test page only; the game's settings and sound are
untouched. **Task 7 ends with a stop**: the user listens on `sounds.html` and approves or asks for changes (changes
are edits to Task 3's scores or Task 2's voices, re-rendered). Tasks 8-11 change the game and start only after that
approval.

## Global Constraints

- Upgrade (2001) plays today's Original (PC speaker) effects exactly as now, at `EFFECT_LEVEL.original` = 0.3.
- The game's timing does not change: what `PcSound.effect` waits (`TIMED` ? whole length : `PACE`) stays computed
  from the speaker call (`runsLength`), never from a suite's slice.
- Apparition: the game still waits 1.7 s (spiritin 0.43 s + six notes of 0.215 s); the phrase may run to about 3.5 s.
- Loudness at the defaults (Sound FX 80%, Music 60%): the music averages -20 dBFS RMS × `levelGain(6)` = about
  -28.9 dBFS. An effect's loudest 100 ms RMS may be at most 6 dB above that (-22.9 dBFS); the standouts (victory1,
  spiritin, raise, shrine1, shrine2, gemshard, revive, endmoon) at most 10 dB above (-18.9 dBFS). Peaks under -1 dBFS.
- Harshness: each slice's presence and sibilance (`tools/music/spectrum.ts` `measure`) no higher, and tilt no less
  steep, than the gentlest file of its soundtrack (`public/music/<arrangement>/` for the arrangements that soundtrack
  plays); slices shorter than 8192 samples measured zero-padded to 8192. Shared no-pitch effects pass against the
  strictest of the three.
- Size: the three suites together ≤ 10 MB.
- MuseScore General is never shipped (build-time only).
- Durations: a score's `length` within 0.8×-1.25× of the effect's current Standard length (its sound's samples /
  44100); a slice may ring up to 0.5 s past `length`, faded.
- Repo checks pass: `npm test`, `npx tsc --noEmit -p .`, `npm run -s lint`, `npm run -s format:check` (in `web/`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A suite's atlas not yet decoded (first sound after unlock, slow device): the effect is silent, never the old chip
  voice, and the game's pace is unchanged. Test in Task 5.
- An unnamed call (`identify` → null) in a suite: plays its chip voice, softened, not silence. Test in Task 5.
- A family note whose pitch lies outside the bank (36-96): played from the nearest end note at the exact rate,
  rate clamped to 0.5-2. Test in Task 5.
- The suite changed while a long effect sounds or the atlas loads: the old load's result is not used for the new
  suite. Test in Task 5.
- An effect started repeatedly (repeated pitched blips): `MIN_INTERVAL_MS` and the long-effect rule still apply to
  slices; a varied effect picks among its variants. Test in Task 5.

---

## Stage 1: the suites, heard on the test page

### Task 1: Suites and effect keys

**Files:**
- Create: `web/src/audio/sfxKeys.ts`
- Test: `web/tests/sfxKeys.test.ts`

**Interfaces:**
- Produces:
  - `export const SUITES = ['classical', 'electronic', 'ambient'] as const; export type Suite = (typeof SUITES)[number];`
  - `export const NOTE_BANK = { low: 36, high: 96 }` and `export const BANKED = ['harpsichord', 'lute', 'chant'] as const`
  - `export type SfxKey = { key: string; hz?: number } | 'silent' | null` — `null` means "no suite sound: play the
    shared chip voice, softened"; `'silent'` means "folded into another sound".
  - `export function sfxKey(effect: Effect | null, kind: Kind, args: number[]): SfxKey`
  - `export const cueKey = (name: string): string => \`cue:${name}\``
  - `export const noteKey = (family: string, midi: number): string => \`${family}:${midi}\``

Rules for `sfxKey`: `effect` null → null. `effect.continued` → 'silent'. `victory2`, `cast`, `apparition` → 'silent'
(victory2 folds into victory1, cast into the spell, the six apparition notes into spiritin's phrase). A `BANKED`
family → `{ key: noteKey(name, nearest midi to hz), hz }`, `hz` from the call as `chip.ts` `pulseShape` computes it
(export `pulseShape` from `chip.ts` for this). `blackthorn` → `blackthorn${note}`. Otherwise `{ key: name }`.

- [ ] **Step 1: Write the failing tests** (`sfxKeys.test.ts`, using `newGame()` for the data)
  - `it('folds the apparition notes, the second victory note and a spell\'s hums')`: `sfxKey({name:'apparition', note:2}, 'pulse', …)` → `'silent'`; same for `victory2`, `{name:'cast', note:3}`, and `{name:'gemshard', continued:true}`.
  - `it('banks a harpsichord key at its own pitch')`: for each of the 10 harpsichord words, the key is `harpsichord:<m>` with 36 ≤ m ≤ 96 and `Math.abs(12*Math.log2(hz/440)+69 - m) <= 0.5`.
  - `it('names Blackthorn\'s notes and every other effect by name')`: `{name:'blackthorn', note:4}` → `{key:'blackthorn4'}`; `{name:'moongate'}` → `{key:'moongate'}`.
  - `it('leaves an unnamed call to the shared voice')`: `sfxKey(null, 'pulse', [1234,1,5,6,7])` → `null`.
- [ ] **Step 2: Run** `cd web && npx vitest run tests/sfxKeys.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `sfxKeys.ts` as above; export `pulseShape` from `chip.ts`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Name each effect's sound in the new suites"`

### Task 2: Electronic's effect voice

**Files:**
- Modify: `web/tools/music/styles/engine.ts` (new export after `playKeyboard`)
- Test: `web/tests/sfxRender.test.ts` (created here; Task 4 adds to it)

**Interfaces:**
- Produces: `export function playSfx(ctx: BaseAudioContext, out: AudioNode, seq: XmiSequence): void` — each note on
  the engine voice for its GM program, in one calm mix `mix(ctx, out, { room: 3, wet: 0.3, bright: 3500, wow: 2 })`.

Program → voice (as `remaster.ts` `voiceFor` groups them): 0-5, 7 `keys`; 6, 24-31, 46 `arpPluck`; 8-15 `glass`;
32-39 and 43 `sub`; 40-42, 44-45, 48-55 `pad`; 47 `boom`; 56-79 `airLead`; 80-103 `pad`; 119 `swell`; else `glass`.

- [ ] **Step 1: Write the failing test** `it('plays an effect\'s notes on the Electronic voices')`: a two-note
  `XmiSequence` (program 14 at 0 s, program 47 at 0.2 s), rendered on `new OfflineAudioContext(2, 44100, 44100)`
  from `node-web-audio-api`: every sample finite, peak > 0.01 and < 1, and the second half not silent.
- [ ] **Step 2: Run** `npx vitest run tests/sfxRender.test.ts` — Expected: FAIL (`playSfx` not exported).
- [ ] **Step 3: Implement** `playSfx` with the existing voice functions (`notesOf` for the notes).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Give the Electronic engine a voice for effects"`

### Task 3: The scores

**Files:**
- Create: `web/tools/sfx/scores.ts`
- Test: `web/tests/sfxScores.test.ts`

**Interfaces:**
- Consumes: `Suite`, `noteKey`, `cueKey`, `NOTE_BANK`, `BANKED` (Task 1).
- Produces:
  - `export interface SfxNote { at: number; note: number; length: number; velocity: number; program: number }`
  - `export interface Score { length: number; notes: SfxNote[]; standout?: boolean }`
  - `export const SCORES: Record<string, (variant: number) => Score>` — keyed by effect key (`moongate`,
    `blackthorn0`-`5`, `spell1`-`8`, `cue:CombatStart`, …); one entry per voiced effect.
  - `export const VARIANTS: Record<string, number>` — how many variants a key renders (3 for `REPEATED` pitched
    effects and `spell1`-`8`; 1 otherwise).
  - `export const BANK_PROGRAMS: Record<(typeof BANKED)[number], number>` — harpsichord 6, lute 24, chant 52 (choir).
  - `export function bankScore(family: (typeof BANKED)[number], midi: number): Score` — one note, 0.7 s.

What the scores are (the creative work; the user judges it by ear in Task 7):
- Every effect with a pitch in `audio/effects.ts` `RULES` and every pitched cue in `dev/sfxCatalogue.ts` `CUES`
  gets a score, except `victory2`, `cast`, `apparition` (silent) and the banked families. No-pitch effects (steps,
  bumps, blows, hits, bursts, shiphit, waterfall, fountain, shake, shock, regurgit, introhit, doors and the like) get
  none: they stay shared.
- Sweeps (`failure`, `vanish`, `fall`, `trapfall`, `cannon`, `foefire`, `launch`, `attack`, `whirl`, `drip0`) become
  runs of notes (a harp glissando, a falling string figure) over the same span and direction, no pitch bends.
- Melodies kept: `blackthorn0`-`5` take `chip3.ts`'s BlackthornNote pitches; `spell1`-`8` keep that port's rising
  pentatonic figure by circle (`variant` seeds which notes, as `sparkle` picks).
- `spiritin`: the apparition phrase, `standout`, about 3.5 s: MONARCH's opening phrase (read with
  `readXmiEvents(public/music/MONARCH.XMI)`, its melody channel's first notes up to 3.5 s) moved to its relative minor
  (lower the 3rd, 6th and 7th of the key `tools/music/styles/harmony.ts` finds), strings (48) and harp (46), a
  timpani roll (47) under the first beat.
- `shrine1`/`shrine2`/`gemshard`: a held swell, rising and falling, strings (49) and harp (46), length as now.
- `chime`: tubular bells (14), one strike.
- `CombatStart`: low strings (48, 42) and a timpani hit (47), not bright.
- The instruments for each are chosen from the Classical palette; Ambient and Electronic play the same programs
  through their own voices.

- [ ] **Step 1: Write the failing tests** (`sfxScores.test.ts`):
  - `it('scores every pitched effect the user named')`: keys `spiritin`, `shrine1`, `chime`, `failure`,
    `cue:CombatStart`, `vanish`, `victory1`, `trapfall`, `fall` are all in `SCORES`; `bankScore` exists for
    harpsichord and lute.
  - `it('keeps each effect about as long as it is now')`: for each `SCORES` key that is a `RULES` name (not TIMED),
    `score.length / currentLength` in [0.8, 1.25], `currentLength = standard({name}, kind, args, () => 0.5).length /
    44100`; for a `cue:` key, `u3Effect(name)!.length / 44100`.
  - `it('lets the apparition phrase run to about three and a half seconds')`: `SCORES.spiritin(0).length` in [3, 3.6];
    `standout` true; every note's `at + length` ≤ `length`.
  - `it('writes notes a synthesizer can play')`: every note of every variant of every score: 0 ≤ program ≤ 127,
    24 ≤ note ≤ 100, 1 ≤ velocity ≤ 127, `at` ≥ 0, `length` > 0.
- [ ] **Step 2: Run** `npx vitest run tests/sfxScores.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write** `scores.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Score the effects for the new suites"`

### Task 4: The render, and the check

**Files:**
- Create: `web/tools/sfx/render.ts`, `web/tools/sfx/check.ts`
- Create (by running): `web/public/sfx/<suite>.<hash8>.ogg`, `web/src/audio/sfxManifest.json`
- Modify: `web/package.json` (script `"sfx": "node --import ./tools/node-ts.mjs tools/sfx/render.ts"`),
  `web/tools/music/README.md` (a short section on `npm run sfx`)
- Test: `web/tests/sfxRender.test.ts`

**Interfaces:**
- Consumes: `SCORES`, `VARIANTS`, `bankScore`, `BANK_PROGRAMS` (Task 3); `playSfx` (Task 2); `renderOriginal`
  (`tools/music/original.ts`); `playRemaster` (`src/audio/remaster.ts`, tune `'sfx'`, calm); `encode`
  (`tools/music/pcm.ts`); `measure` (`tools/music/spectrum.ts`).
- Produces:
  - `export type SfxManifest = Record<Suite, { file: string; slices: Record<string, [at: number, length: number][]> }>`
    (seconds into the file; one entry per variant; note-bank keys `harpsichord:36`…`:96`).
  - `export function toSequence(score: Score): XmiSequence` (channel per program, `on`/`off` events, a `program`
    event first on each channel).
  - `export function levelSlice(pcm: Stereo, targetDb: number, peakDb = -1): void` — scales so the loudest 100 ms
    RMS (mono sum) is `targetDb`, then lowers it further if the peak would pass `peakDb`.
  - `export function finish(pcm: Stereo, length: number): Stereo` — cut at `length` + 0.5 s, the last 0.5 s faded.
  - `export function layOutAtlas(slices: { key: string; pcm: Stereo }[], gap = 0.1): { pcm: Stereo; slices: SfxManifest[Suite]['slices'] }`
  - `check.ts`: `export function checkSuite(suite, slices): string[]` (failures) using the Global Constraints'
    loudness and harshness rules; render.ts writes every suite's report, worst first, to `screenshots/sfx-check.md`
    and exits 1 if any fail (files still written).

Level targets (loudest 100 ms RMS): standouts -20 dBFS; effects in `REPEATED` -27; the rest -24.
Encoding: Opus 64 kbps stereo (`['-c:a','libopus','-b:a','64k']`), file named for its hash as `tools/music/render.ts`
does, old files of the suite deleted.

- [ ] **Step 1: Write the failing tests** (in `sfxRender.test.ts`):
  - `it('turns a score into a sequence with a program per channel')`: two programs → two channels, each starting
    with its `program` event; `on` count equals notes.
  - `it('levels a slice by its loudest moment, under the peak')`: a 0.5 s sine at 0.5 then levelled to -24: loudest
    100 ms RMS within 0.1 dB of -24, peak ≤ db(-1).
  - `it('ends a slice faded, half a second past its length at most')`.
  - `it('lays slices end to end with gaps and says where each is')`: two slices → offsets 0 and len1+0.1.
  - `it('fails a slice louder than the rule allows')`: `checkSuite` on a slice at -15 dBFS RMS returns one failure
    naming it.
- [ ] **Step 2: Run** `npx vitest run tests/sfxRender.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `render.ts` (exports above, then a `main()` run when invoked directly) and `check.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (tools only; the render itself is Task 7) `git commit -m "Render the effects suites, and check them"`

### Task 5: Playing a suite

**Files:**
- Create: `web/src/ui/sfxBank.ts`
- Modify: `web/src/ui/sound.ts`
- Test: `web/tests/sfxBank.test.ts`

**Interfaces:**
- Consumes: `sfxKey`, `cueKey`, `Suite` (Task 1); `SfxManifest` shape via `src/audio/sfxManifest.json` (Task 4).
- Produces:
  - `export class SfxBank { constructor(manifest: SfxManifest, fetchFile: (file: string) => Promise<ArrayBuffer>); load(ctx: BaseAudioContext, suite: Suite): Promise<AudioBuffer | null>; slice(suite: Suite, key: string, r: () => number): { buffer: AudioBuffer; at: number; length: number } | null }` — one decoded atlas kept (the current suite's); `slice` null until loaded or for an unknown key.
  - `export type EffectsSet = SoundSet | Suite` in `sound.ts`; `PcSound.setEffects(set: EffectsSet, level: number)`
    (Settings still passes only `SoundSet` until Task 8). `EFFECT_LEVEL` gains `classical`/`electronic`/`ambient`: 1.
  - In a suite, `PcSound.start` and `cue`: `sfxKey` → 'silent' plays nothing; a key → the slice from its `at`, for
    its `length`, `playbackRate = hz / noteHz(midi)` clamped 0.5-2 for a bank note, a varied key picking its
    variant by `Math.random` and detuned ±0.4 semitone as `REPEATED` are now; null (or a key with no slice: an
    effect with no score) → the chip voice (`chip`/`u3Effect`) through `soften(pcm)` = one-pole low-pass at 3 kHz.
  - Water (`WATERS`) keeps sounding in the suites as in Standard.

- [ ] **Step 1: Write the failing tests** (`sfxBank.test.ts`, a fake `AudioContext` recording sources started, as
  `sound.test.ts`'s hold test fakes one):
  - `it('is silent until the suite has loaded, and keeps the pace')`: suite set, atlas fetch pending; `pulse(moongate)`
    starts no source and resolves after `PACE`.
  - `it('plays an effect from its slice once loaded')`: source started with offset = manifest `at`, duration = length.
  - `it('plays a harpsichord key from the bank at the call\'s pitch')`: `playbackRate` = hz / noteHz(key midi), ±0.001.
  - `it('clamps a note far outside the bank')`: rate within [0.5, 2].
  - `it('plays an unnamed call on its softened chip voice')`: a source started from a 44100 Hz buffer.
  - `it('plays nothing for a folded call')`: the six apparition notes start no source.
  - `it('drops a load that finishes after the suite changed')`: load classical, switch to ambient before it
    resolves; a classical slice is never played for an ambient effect.
  - `it('does not restart a long slice still sounding')`: two `pulse(moongate)` 100 ms apart start one source.
- [ ] **Step 2: Run** `npx vitest run tests/sfxBank.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `sfxBank.ts` and the `sound.ts` changes; generalize `sound()` to take an AudioBuffer
  with offset, duration and rate (the chip path wraps its Float32Array in one, as now).
- [ ] **Step 4: Run** `npx vitest run tests/sfxBank.test.ts tests/sound.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Play the new suites' effects"`

### Task 6: The test page

**Files:**
- Modify: `web/src/dev/sounds.ts`, `web/sounds.html`

**Interfaces:**
- Consumes: `PcSound.setEffects(EffectsSet)` (Task 5); `MUSIC`, `MusicPlayer`, `musicGain`; `SOUNDTRACKS`,
  `arrangementsFor` (`audio/soundtracks.ts`); `TUNE_FILES`.

Changes:
- "Play as": **Standard (today)**, **Classical**, **Electronic**, **Ambient**, **Upgrade (2001)** (= Original).
  Standard stays only for comparison until Task 10. The voice column says the suite's voice: "score", "bank note",
  "shared (softened chip)", "folded".
- A **Music** section above the effects: a row per tune (`TUNE_FILES`), a column per soundtrack (`SOUNDTRACKS`,
  named as the menu names them), a button per arrangement it plays there (`arrangementsFor` over the occasions
  undefined, `'title'`, `'shrine'`, `'introduction'`, `'closing'`, `'night'`, deduplicated, kept only where `MUSIC`
  has the file), and a Stop. Played on the page's own `AudioContext` and `MusicPlayer` at `musicGain(6)`, so an effect
  can be played over it.
- The page comment and `sounds.html`'s comment say so.

- [ ] **Step 1: Run the dev server** (`preview_start` name `web`) and open `/sounds.html`.
- [ ] **Step 2: Implement** the changes.
- [ ] **Step 3: Verify in the browser:** console free of errors; the five Play-as buttons; the Music table has 16
  rows; a Classical arrangement plays and Stop stops it; an effect plays over it.
- [ ] **Step 4: Run** `npx tsc --noEmit -p . && npm run -s lint && npm run -s format:check` — Expected: clean.
- [ ] **Step 5: Commit** `git commit -m "Hear the new suites and the music on the sound test page"`

### Task 7: Render, check, and hand over to listen

**Files:**
- Create (by running): `web/public/sfx/*.ogg`, `web/src/audio/sfxManifest.json`, `screenshots/sfx-check.md`

- [ ] **Step 1: Run** `cd web && npm run sfx` — Expected: exit 0, three files in `public/sfx/`, total ≤ 10 MB
  (`du -ch public/sfx/*.ogg`). On exit 1, read `screenshots/sfx-check.md`, adjust the failing scores or Task 2's mix,
  re-run.
- [ ] **Step 2: Run** the whole suite `npm test` and the checks — Expected: all pass.
- [ ] **Step 3: Verify** on `/sounds.html`: every effect plays in each of the three suites, the apparition phrase
  among them.
- [ ] **Step 4: Commit** `git commit -m "Render the Classical, Electronic and Ambient effects"`
- [ ] **Step 5: STOP.** Tell the user the page is ready (the LAN address of the dev server), with the check report's
  summary. Wait for their verdict; their changes go back through Task 3 (scores) or Task 2 (voices) and this task.
  Do not start Task 8 without their approval.

## Stage 2: the game (after the user approves the suites)

### Task 8: One Sound setting

**Files:**
- Modify: `web/src/game/settings.ts`, `web/src/game/menu.ts`, `web/src/ui/sound.ts`, the game's call of
  `setEffects`/`setMusicVoice`, `web/src/game/cues.ts` and `web/src/game/magic.ts` (their `soundSet` checks)
- Test: `web/tests/settings.test.ts` (or the file that tests settings loading), `web/tests/menu*.test.ts` as found

**Interfaces:**
- Produces: `export type SoundChoice = 'classical' | 'electronic' | 'ambient' | 'upgrade'`; `Options.sound:
  SoundChoice` (default `'classical'`), replacing `musicVoice` and `soundSet`; `export const SOUND_CHOICES`;
  `soundtrackOf(c)` (`upgrade` → `'original'`, `ambient` → `'remastered'`, else itself) and `effectsOf(c)`
  (`upgrade` → `'original'`, else itself).
- Migration in the settings load: `sound` from the saved `musicVoice` (`original` → `upgrade`, `remastered` →
  `ambient`, else the same); `soundSet` dropped.
- Menu: one line `Sound: Classical` / `Electronic` / `Ambient` / `Upgrade (2001)` (cycling, `listen: true`), its
  note naming the music and the effects, e.g. "Classical (2026): strings, orchestra, consort, Celtic and piano; the
  effects in the same instruments."; the Music and Sound FX lines go; Music level and Sound FX level stay.

- [ ] **Step 1: Write the failing tests:** a saved `{musicVoice:'remastered', soundSet:'original'}` loads as
  `sound:'ambient'` with no `soundSet`; `{musicVoice:'original'}` → `'upgrade'`; nothing saved → `'classical'`; the
  Audio menu lists `Sound: Classical` and no `Music:` or `Sound FX:` line; choosing Upgrade (2001) calls
  `setEffects('original', …)` and plays the `original` arrangement.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "One Sound setting: the music and its effects together"`

### Task 9: The effects offline

**Files:**
- Modify: `web/vite.config.ts` (workbox), the apps' bundling if it filters `public/` (check `mobile/` and
  `desktop/bundle.cjs`)

- [ ] **Step 1:** Precache `public/sfx/*.ogg` (add `sfx/*.ogg` to `globPatterns`; each file is under 8 MB) with a
  comment saying why the effects are fetched with the page and the music is not.
- [ ] **Step 2: Verify:** `npm run build`, then `ls dist/sfx` and grep `dist/sw.js` for the three file names.
  Confirm the desktop and Android bundles include `sfx/`.
- [ ] **Step 3: Commit** `git commit -m "Keep the effects offline with the page"`

### Task 10: Retire the Standard set

**Files:**
- Modify: `web/src/ui/sound.ts`, `web/src/audio/chip.ts`, `web/src/audio/chip3.ts`, `web/src/dev/sounds.ts`,
  `web/src/game/settings.ts` (`SoundSet`), tests that use `'standard'`

- [ ] **Step 1:** Remove `'standard'` as an effects set. What the shared no-pitch effects and the softened fallback
  use stays; voices nothing calls go (find with `npx tsc` and grep after removal). The test page loses "Standard
  (today)".
- [ ] **Step 2: Run** `npm test`, tsc, lint, format — Expected: clean.
- [ ] **Step 3: Commit** `git commit -m "Retire the chip-tune effects"`

### Task 11: Docs

**Files:**
- Modify: `docs/features.md`, `README.md` (only where they name the Music or Sound FX settings), the Audio menu
  notes already done in Task 8

- [ ] **Step 1:** Say Sound: four choices, each the music and its effects; Upgrade (2001) the PC speaker's effects.
- [ ] **Step 2: Commit** `git commit -m "Docs: the Sound setting"`
