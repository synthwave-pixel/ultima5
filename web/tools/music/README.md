# The music render

`npm run music` renders the Ultima V Upgrade's sixteen tunes (`web/public/music/*.XMI`) in every arrangement a
soundtrack plays (`web/src/audio/soundtracks.ts`) to `web/public/music/<arrangement>/`, and writes
`web/src/audio/musicManifest.json` (where each file's loop lies). Run it when an arrangement's sound changes, or
the soundtracks' picks do, and commit what it writes.

```bash
npm run music                                  # every tune, every arrangement
npm run music -- remastered                    # one arrangement
npm run music -- strings piano BRITLAND.XMI STONES.XMI
```

The styles (`styles/`: `orchestrate.ts` for the sampled ones, `engine.ts` for the synthesized, `arrange.ts` for how
each tune is treated) are Electronic's and Classical's; `npx vite-node tools/music/styles/render.ts` renders any of
them to `screenshots/styles-v2/` to listen to, and `fatigue.ts` measures every render for what tires the ear.

**Original** needs MuseScore General (MIT; 40 MB) in `tools/music/.cache/` (git-ignored, never shipped):

```bash
mkdir -p tools/music/.cache && curl -L -o tools/music/.cache/MuseScore_General.sf3 https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3
```

It plays each tune's events through SpessaSynth (`spessasynth_core`, a dev dependency) - `original.ts`.

**Remastered** is `web/src/audio/remaster.ts` (its voices, the room, the arrangement table: what to change to change
its sound), rendered on an offline Web Audio context in Node (`node-web-audio-api`) - `remastered.ts`.

Every arrangement then goes through `pcm.ts`: the tail of the last notes folded onto the loop's start (a tune heard
once - `HEARD_ONCE` - first given five seconds' rest after it), the loop set at one loudness
(-20 dBFS RMS, peaks under -1 dBFS), and laid out as a file: the first four seconds as they sound the first time
through (the end of the last turn not yet ringing under them), then the loop on round, its marked span half a second
in from the file's head and half a second short of its end (so a decoder's priming or padding never makes a seam). It is
encoded by ffmpeg (Homebrew) as 48 kbps Opus and named for a hash of its bytes (`BRITLAND.3fa9c01d.ogg`), so a tune
rendered again is a new URL to every player and the service worker never serves the old; the old file of the tune is
deleted, and the manifest says where each file is.
