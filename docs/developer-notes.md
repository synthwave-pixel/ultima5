# Developer notes

Building, testing and finding your way round the code. For playing the
game, see the [README](../README.md).

- [Quick start](#quick-start)
- [Where things are](#where-things-are)
- [Tests](#tests)
- [Development starts](#development-starts)
- [Development pages](#development-pages)
- [Tools](#tools)
- [Dev cheats](#dev-cheats)
- [Finding the game files](#finding-the-game-files)
- [Builds and releases](#builds-and-releases)
- [More reading](#more-reading)

## Quick start

```sh
cd web
npm install
npm run dev          # http://localhost:5173/ - install the game once with Scan for game files...
npm run dev:https    # the same over HTTPS, for a phone on the network
npm test             # every test, with your copy of the game in gamedata/ultima5/
npm run test:nodata  # only the tests that need no game files
npm run lint && npm run format:check
npm run build
```

- **Your copy of the game** goes in `gamedata/ultima5/` (see
  [gamedata/README.md](../gamedata/README.md)). It is never committed.
- **`npm run dev:https`** serves the game over HTTPS on a self-signed
  certificate (the browser warns once), for another device on the network.
  A phone's browser lets only a secure page use the clipboard.
- **Node 26.** The tools run on it; `web/tools/node-ts.mjs` compiles the
  TypeScript that Node's own type stripping cannot.

## Where things are

| Path | What it holds |
|---|---|
| `web/src/data/` | Reads the game's files: maps, tiles, images, DATA.OVL. |
| `web/src/game/` | The rules, ported routine by routine from [u5d](https://github.com/wonst719/u5d). Comments name the original routine (e.g. `ULTIMA_5910_UpdateFrame`). |
| `web/src/ui/` | Drawing: the framebuffer, the Enhanced interface's art (`standardArt.ts`), the Remastered tiles (`originals.ts`) and dungeon (`standardPictures.ts`), each look's dungeon and frame (`skins.ts`), the shores, the text layer. |
| `web/src/install/` | The installer and the known copies' fingerprints. |
| `web/src/dev/` | The development pages. |
| `web/tests/` | The tests (vitest, in Node). |
| `web/tools/` | Art, music, install and simulation tools (see [Tools](#tools)). |
| `desktop/` | The Electron app ([its README](../desktop/README.md)). |
| `mobile/` | The Capacitor Android app ([its README](../mobile/README.md)). |
| `gamedata/` | Your own copy of the game, for the tests and the dev server (git-ignored). |

## Tests

```sh
npm test             # everything; needs gamedata/ultima5/
npm run test:nodata  # only the tests that need no game files
```

- The rules' tests read the game itself, so they need your own copy in
  `gamedata/ultima5/`. Without it, `npm test` stops and says so.
- In CI, the site's deploy runs every test when the repository's
  `GAMEDATA_TOKEN` secret can fetch the game's files from a private
  repository; without it, only the tests that need none.

## Development starts

On the dev server, query parameters start the game wherever you need it.
Each browser origin installs the game once, either with Scan for game
files... (the dev server serves `gamedata/ultima5/` to it) or with
`&autoscan=true` on the address, which scans as the installer opens.

| Parameter | Effect |
|---|---|
| `&play` | Skip the title, into the saved game or a new one. |
| `&new` | With `&play`, start a new game whatever is saved. |
| `&peek` | Save nothing. |
| `&at=...` | Start somewhere (see below). |
| `&ux=standard` / `&ux=original` | The Enhanced or the Retro interface, for this page alone. |
| `&tiles=...` | The look, for this page alone: `modern-pc` (Remastered, Enhanced only), `pc-ega`, `pc-cga`, `apple2` (Apple Color), `apple2e`, `apple2c`, `x68k` or `c64`. |
| `&autoscan=true` | Scan for game files as the installer opens. |

**Where `&at=` starts:**

| Value | Where |
|---|---|
| `world:X,Y` | Britannia, at X, Y. |
| `under:X,Y` / `under:N` | The Underworld, at X, Y, or beneath dungeon N. |
| `town:N` / `town:N:X,Y:L` | Town N, optionally at X, Y on level L. |
| `dungeon:N` / `dungeon:N:under` | Dungeon N, or its last level, as from the Underworld. |
| `arena:N` | A battle in BRIT.CBT's arena N. |
| `room:D:R` / `room:D:R:L` | Dungeon D's room R (on level L), entered from its door. |
| `ending` | The ending. |

For example, `?play&peek&at=dungeon:1&ux=original&tiles=apple2`, or Hythloth in
the Remastered look, `?play&peek&ux=standard&tiles=modern-pc&at=dungeon:7`.

**For comparing styles:**

| Parameter | Effect |
|---|---|
| `&carve=` | How a dungeon sign's letters are cut: `paint`, `groove`, `vcut` or `fresh`. |
| `&signscale=` | How much larger than 1988's a sign is carved (1.5 if not given). |
| `&signplate=off` | The sign cut into the wall, not onto a plate. |
| `&scale=smooth` | The picture enlarged smoothed and sharpened, rather than by the nearest pixel. |

The dev server also puts the game on `window.u5`, for the console.

## Development pages

`debug.html` links every start above and these pages:

| Page | What it shows |
|---|---|
| `tiles.html` | Every tile in every set, and the game at any place, arena or room. |
| `appearance.html` | The Avatar's regions and colours. |
| `grass.html` | Remastered's grass colours, tuned by hue, saturation and value, with everything grass is in redrawn as they change. |
| `deltas.html` | Every tile Remastered still draws from the Standard art, beside the original and the original as Remastered would draw it, with a choice for each. |
| `sounds.html` | Every sound the game makes, by name: what it is, when and how often it plays, and where in the code. |
| `pictures.html` | Every picture in the game's picture files, Original and Standard side by side; `?show=skins`, each look's dungeon pieces, its recoloured ones outlined. |
| `dungeon.html` | The first-person corridor for every sort of cell a party may face, each dungeon's walls, in the Retro and the Enhanced interface (the Enhanced one the whole square the view fills), Remastered and PC EGA or every look side by side. |
| `frames.html` | Each look's frame at a place, in the Retro and the Enhanced interface, side by side: the game itself, in a frame of the page. |
| `mapcells.html` | Every dungeon cell as each dungeon map draws it, and what Look says of it. |
| `runes.html` | Every dungeon sign carved and read, and printed in the log, with the carve style and face to compare; and every other place runes are printed (the signs Look reads, the words spoken in runes, the Codex, a position, ALAKAZAM, the ending), in either look. |

## Tools

Run in `web/` unless the path says otherwise.

| Command | What it does |
|---|---|
| `npm run known` | Rebuilds the known copies' fingerprints from `gamedata/ultima5/`. |
| `npm run tiles` | Redraws the Standard tile sheet from code (`web/tools/art/`). |
| `npm run pictures` | Makes the sheet of the game's pictures. |
| `npm run runes` | Makes the runes sheet. |
| `npm run apple2 -- <disk>` | Reads the Apple tiles off the Apple II version's Program disk (disk 1 of 8: a `.dsk`, `.po` or its `.zip`): the colour sheet (Apple Color) and the monochrome one (Apple //e, //c). |
| `npm run cga -- <TILES.4>` | Draws the PC CGA tiles from the MS-DOS game's `TILES.4` into `cga-u5-tiles.png`. |
| `npm run c64 -- <disk>` | Reads the C64 tiles off the Commodore 64 version's disk 1 (a `.d64`, or the `.zip` of the six). |
| `npm run x68k -- <world> <npc>` | Makes the Sharp X68k sheet from the Ultima Codex's two X68000 tile images (`Ultima_V_Sharp_X68000_World_Tiles.png`, `..._NPC_Tiles.png`). |
| `npm run cga-dungeon -- <game folder>` | Draws the PC CGA look's dungeon (`pc-cga-u5-dungeon.png`) from the MS-DOS game's `DNG1-3.4`, `ITEMS.4` and `MON0-7.4`. |
| `npm run apple2-dungeon -- <disk> <game folder>` | Reads the Apple looks' dungeon (`apple2-u5-dungeon.png`, `apple2-u5-dungeon-mono.png`) off the Apple II version's Dungeon disk (disk 7 of 8: a `.dsk`, `.po` or its `.zip`); the PC game's folder for the pieces the Apple has none of. |
| `npm run c64-dungeon -- <disk 2> <game folder>` | Reads the C64 look's dungeon (`c64-u5-dungeon.png`) off the Commodore 64 version's disk 2 (a `.d64`); the PC game's folder for its colours and the pieces it has none of. |
| `npm run x68k-dungeon -- <disk 1> <game folder>` | Reads the Sharp X68k look's dungeon (`x68k-u5-dungeon.png`) off the Sharp X68000 version's disk 1 (a `.dim` image, a Human68k disk): its walls, things and creatures (`MON0-7.DAT`, packed with the PC's LZW), at twice the PC's size; the PC game's folder for the two doorways it has none of. |
| `npm run music` | Renders the soundtracks (`web/tools/music/`). |
| `npm run sfx` | Renders the effects suites and checks them (`web/tools/sfx/`). |
| `npm run saves` | Writes the showcase saves to [`showcase/`](../showcase/README.md): a dozen exported games at the game's interesting places (Britain, the harpsichord, a shrine, the carpet, a frigate, Deceit, the Underworld, Blackthorn's palace, Doom...), each with a party of the level and gear for it. Import them from Settings; they all share one Avatar, Showcase, so each replaces the last. The places and parties are listed in `web/tools/saves/showcase.ts`. |
| `node tools/icons.mjs` | Redraws the icons. |
| `node tools/key-art.mjs` | Draws the key art from the box's painting: Steam's library artwork, the boot screen, the README's banner, and each at its native size in `art/`. |
| `node tools/promo.mjs` | Puts together the README's sheets of screenshots (`promo/`) from the dev server's screenshots in `screenshots/` (the script lists the scenes). |
| `sips -s format jpeg -s formatOptions 82 -Z 1280` | Makes `docs/screens/`, the pictures in [What is new, in full](features.md), from the same screenshots: JPEGs 1280 wide, one to a section. |

**The pilot** (`web/tools/pilot/`) is a bot that plays the development
build using only the controller's keys. It played the game along the
GameFAQs walkthrough, start to proclamation, to find what a controller
could not do.

**The fight simulator** (`web/tools/sim/`) plays fights headless:

- `armour.ts` weighs the rules: parties at four stages of a game against
  creatures from rats to dragons, many fights each, measuring how often
  they're won and at what cost.
- `fuzz.ts` plays thousands of careless fights (random rules, party, arena
  or room, loot strewn, keys), checking after every key what must hold of
  a fight:

  ```sh
  node --import ./tools/node-ts.mjs tools/sim/fuzz.ts fights=1000
  ```

## Dev cheats

The cheats that skip the climb and the story, shown in red under Cheats.
**They can break a game.**

- Raise every level
- Exit dungeon
- Auto kill
- Slay every foe
- Mix 10 of every spell
- Unseal the dungeons
- The quest's items
- Go to...
- Go to Underworld...

The dev server always has them. Any other build turns them on for the
session in one of three ways:

| Where | How |
|---|---|
| The web game | `?dev` (or `?dev=true`) on its address. |
| The desktop app | Launch with `--dev` (a Steam launch option too). |
| Anywhere, Android included | The Konami code in the Cheats menu: up, up, down, down, left, right, left, right, B, A. On a keyboard use the arrows or WASD, then the letters B and A. |

The log then says "Dev cheats enabled - CAN BREAK YOUR GAME!" and the
list shows them.

## Finding the game files

The installer's Scan for game files... looks in different places on each
platform:

- **Desktop app** (`desktop/scan.cjs`): beside the app, at home, and where
  GOG and the Linux launchers install games, for folders named like `u5`,
  `Ultima 5` or `Ultima V™.app`, a few levels down.
- **Web**: it reads the site's `gamedata/index.json`, a JSON list of the
  file names in `gamedata/` beside the page, and fetches each (`webCopy` in
  `web/src/install/sources.ts`).
  - The dev server makes that index itself from `gamedata/ultima5/`
    (`devGameData` in `web/vite.config.ts`).
  - A site hosted elsewhere has one only if whoever hosts it puts the files
    and the index there ([Hosting it yourself](advanced.md#hosting-it-yourself)).
- **Android**: Choose folder..., the system's own picker, instead.

A copy whose every file is a known one is installed at once; anything
else is named, for the player to decide. Remove game files (Manage Saves,
on the title menu) forgets the installed copy.

## Builds and releases

`desktop/` (Electron) and `mobile/` (Capacitor, Android) wrap the web
build; see their READMEs.

The workflows in `.github/workflows/`:

| Trigger | What happens |
|---|---|
| A push to `main`, or a pull request | Checks only (`ci.yml`): formatting, lint (including `desktop/*.cjs`), the tests and the web build. Nothing is built for players and the site is not deployed. |
| A push to `release` (`git push origin main:release`) | One release to every platform, in one run: the checks, then every app and the web game built, then the GitHub release published and the site deployed. A failure anywhere stops it before anything is published, and the web game changes only with a release. |
| Redeploy the latest release, run by hand from the Actions tab | Puts the newest full release back on GitHub Pages (`pages.yml`), for when a release's deploy failed. It builds that release's tag and nothing else. |
| Desktop and Android builds, run by hand from the Actions tab | Runs the checks, then builds by "kind": `dev-builds` (the default) keeps the builds as artifacts, with nothing published and the Mac app not notarized; `prerelease` publishes a pre-release for testers, without the site; `release` is a release, site included. "Android only" builds just the APK. |

## More reading

- [features.md](features.md): everything new, in full, including how the
  Enhanced interface is drawn.
- [fixing-1988.md](fixing-1988.md): how the 1988 game's bugs were found and
  fixed.
- [text-overlays.md](text-overlays.md): the text layer's overlays.
- [flatpak-updates.md](flatpak-updates.md): how the Flatpak updates itself
  through Flatpak's update portal (Game Mode included), as a pattern for
  other Electron apps shipped as Flatpaks.
- [standard-originals.md](standard-originals.md): the Remastered tiles,
  tile by tile.
- [art-brief.md](art-brief.md) and [key-art-brief.md](key-art-brief.md):
  briefs for the art.
