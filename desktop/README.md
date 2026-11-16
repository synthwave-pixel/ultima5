# Ultima V desktop app

A thin Electron shell around the built game in `../web`. See
[Developer notes](../docs/developer-notes.md) for how it
fits together, and [The desktop app](../docs/advanced.md#the-desktop-app)
for how to install the builds on Windows, macOS, Linux and the Steam Deck.

```sh
npm install
npm run bundle     # builds ../web with relative paths and copies dist/ into app/
npm start          # runs the app; its flags go after -- (npm start -- --dev): --fullscreen, --windowed, --dev
npm run smoke      # launches it, screenshots the running game, exits 0 on success
npm run dist       # installers for this platform into dist/ (dist:linux, dist:win, dist:mac)
```

Electron's own binary is downloaded the first time `npm start` or `npm
run smoke` runs, not at `npm install`. `npm run smoke` fails while a copy
of the app is already running, since the second copy quits at once (see
the single-instance lock below). The macOS build needs macOS 13 (Ventura)
or later. If the page's renderer crashes, the window reloads it, at most
three times a minute.

`--dev` turns on the development build's cheats (shown in red under
Cheats: levels, leaving a dungeon, the quest's items, going anywhere, Auto
kill) in any build of the app, from `npm start` to an installed release
(a Steam launch option included). It is passed on as `?dev`, which does
the same for the web game added to its address.

The installer's Scan for game files... finds the game on the disk: `scan.cjs`
looks beside the app, at home and where GOG and the Linux launchers install
games (folders named like `u5`, `Ultima 5` or `Ultima V™.app`, a few levels
down), and `preload.cjs` is the page's one bridge to it.

Playing Steam's Ultima V with this engine (see
[Steam](../docs/steam.md)) is a few modules:
`steam.cjs` finds Steam, the game's folder in its libraries and the
account that launched it; `appinfo.cjs` reads and writes Steam's app cache,
to give the game a Mac launch entry; `steamSaves.cjs` keeps a Steam
launch's saves as `SAVED.GAM` files for Steam Cloud; `steamSetup.cjs` sets
Steam up and takes that away again on each system; and `instanceMode.cjs`
tells a second copy whether the open one is a Steam launch or not.

Builds for all three platforms come from the "Desktop and Android builds"
workflow under Actions. It runs for a push to the `release` branch, which
is a release, and when started by hand (Actions > Run workflow), where
"kind" chooses: `dev-builds` (the default) keeps the builds as workflow
artifacts to try, with the Mac app signed but not notarized;
`prerelease` publishes a pre-release for testers; `release` publishes a
release. A release goes to every platform in one run: the apps and the
web game are built, then the GitHub release is published and the site
deployed, so a failure anywhere stops it before anything is published.
It never runs for a push to `main`, which gets only the checks
(the "Checks" workflow: formatting, lint, tests and the web build); every
run of the builds passes those checks first. The version comes from
`version.cjs`: the major.minor of `version` in `package.json` with the
run number as the patch in Actions, or a timestamped pre-release
(`1.0.0-dev.20260915.2214`) for a build made anywhere else;
`BUILD_VERSION` overrides both. Dev builds use up run numbers as releases
do, so every build is numbered above the last; the builds must stay in
this one workflow, as another would count from 1. `npm run dist` passes
the version to electron-builder as metadata, so `package.json` is never
edited. macOS builds are Apple Silicon only.

A release's notes are GitHub's generated ones, the compare link with
the release before it. The release job first runs `release-notes.cjs`,
which looks in the root README for a section headed with the release's
version (`### v1.0.27`, or `### v1.0.27, September 18, 2026`) and prints
it with each wrapped item joined onto one line; the README has no such
section, so the job warns and the release goes out with the generated
notes alone. Adding a section headed `### v<version>` to the README
before the run would put its text above them; since the patch is the run
number, the heading must name the number the run will get, one more than
the last run's, which `gh run list --workflow desktop.yml` shows.

Updates are `updates.cjs`: electron-updater for the Windows installer
and the AppImage, a notice of the release for macOS and the portable
`.exe`, and for the Flatpak, Flatpak's update portal (`flatpakUpdates.cjs`;
see [flatpak-updates.md](../docs/flatpak-updates.md)), so the game updates
itself under Steam's Game Mode, where Discover never runs.

One copy runs at a time (`app.requestSingleInstanceLock()` in
`main.cjs`): a second launch brings the first window forward and quits,
since two copies would share one save. Under Flatpak the lock holds across
launches because electron-builder's wrapper points `TMPDIR`, where
Chromium keeps the lock's socket, at a directory the instances share. The
game offers Quit on its title menu when it sees the `app:` scheme the
window loads it from, and quits by closing that window.

Linux gets an AppImage and a Flatpak bundle. The AppImage is published as
`ultima5-sp-<arch>.AppImage` (`appImage.artifactName`), with no version in
the name: electron-updater then overwrites the file in place, so its path
never changes and the Steam compatibility tool can point at it (each start
with the tool on points it at the AppImage started, `refreshCompatTool`). It is the build the docs recommend for Steam on Linux and the Deck;
the permanent link is `releases/latest/download/ultima5-sp-x86_64.AppImage`.
The window title is `Ultima V Enhanced Edition <version>`; the page reads the version
through `u5native.version()`. The Flatpak is built only
where `flatpak-builder` and the Freedesktop 25.08 runtime, SDK and
Electron base app are installed, which the Linux job does (on a Linux
machine: `flatpak install flathub org.freedesktop.Platform//25.08
org.freedesktop.Sdk//25.08 org.electronjs.Electron2.BaseApp//25.08`), so
`npm run dist:linux` elsewhere builds the AppImage alone and the workflow
asks for both (`--linux AppImage flatpak`). Its permissions are the
`flatpak` block in `package.json`: display, sound, the home folder for
Export and Import, every device, and read access to udev's device
database, which Chromium needs before it lists a gamepad. In Desktop Mode under Wayland
the app runs on Wayland itself; under gamescope (Steam's Game Mode)
`main.cjs` still makes the window X11 (XWayland), and turns off GPU
acceleration, which has hung other Electron apps there. The Chromium sandbox
can only be turned off on the command line: Chromium starts its zygote before
`main.cjs` runs, and `--no-sandbox` appended later reached only the page
processes, which then crashed one after another in the zygote's sandbox (a
black window in Game Mode). The AppImage's menu entry and the Steam
compatibility tool pass it on the command line.

The site also serves the newest release as a Flatpak repository, at
`/flatpak/` under the Pages address. The release run's site job runs
`flatpak-repo.sh` on that run's own Flatpak build: it imports the bundle
into a fresh OSTree repository, signs it with the key in the
`FLATPAK_GPG_KEY` and `FLATPAK_GPG_KEY_ID` secrets, and writes the
`.flatpakrepo` and `.flatpakref` files beside it. The site is built, the
Flatpak repository included, before the release is published, and
deployed after it in the same run, so the repository follows each
release; a pruned repository holds one commit, so nothing is kept
between deploys. "Redeploy the latest release" (`pages.yml`, by hand)
puts the newest release back on the site, downloading its bundle. The
service worker leaves `/flatpak/` alone (`navigateFallbackDenylist` in
`../web/vite.config.ts`), or a browser that had played the game would be
handed the game instead of the `.flatpakref`.
