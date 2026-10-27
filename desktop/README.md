# Ultima V desktop app

A thin Electron shell around the built game in `../web`. See
[Developer notes](../docs/developer-notes.md) for how it
fits together, and [Desktop app, and the Steam Deck](../docs/install.md#desktop-app-and-the-steam-deck)
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

Builds for all three platforms come from the "Desktop and Android builds"
workflow under Actions. It runs when started by hand (Actions > Run
workflow), with "publish" deciding between a release and artifacts. The
version comes from `version.cjs`: the major.minor of `version` in
`package.json` with the run number as the patch in Actions, or a
timestamped pre-release (`1.0.0-dev.20260915.2214`) for a build made
anywhere else; `BUILD_VERSION` overrides both. `npm run dist` passes it
to electron-builder as metadata, so `package.json` is never edited.
macOS builds are Apple Silicon only. A manual run with "publish" off
keeps the builds as artifacts instead of making a release.

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

One copy runs at a time (`app.requestSingleInstanceLock()` in
`main.cjs`): a second launch brings the first window forward and quits,
since two copies would share one save. Under Flatpak the lock holds across
launches because electron-builder's wrapper points `TMPDIR`, where
Chromium keeps the lock's socket, at a directory the instances share. The
game offers Quit on its title menu when it sees the `app:` scheme the
window loads it from, and quits by closing that window.

Linux gets an AppImage and a Flatpak bundle. The Flatpak is built only
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
acceleration and the Chromium sandbox, which have hung other Electron
apps there.

The site also serves the newest release as a Flatpak repository, at
`/flatpak/` under the Pages address: the Pages workflow runs
`flatpak-repo.sh`, which downloads the release's bundle, imports it into
a fresh OSTree repository, signs it with the key in the `FLATPAK_GPG_KEY`
and `FLATPAK_GPG_KEY_ID` secrets, and writes the `.flatpakrepo` and
`.flatpakref` files beside it. The release job starts a Pages deploy
after publishing, so the repository follows each release; a pruned
repository holds one commit, so nothing is kept between deploys. The
service worker leaves `/flatpak/` alone (`navigateFallbackDenylist` in
`../web/vite.config.ts`), or a browser that had played the game would be
handed the game instead of the `.flatpakref`.
