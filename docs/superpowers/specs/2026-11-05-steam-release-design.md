# Playing Steam's Ultima V with this engine: design

Date: 2026-11-05. Status: agreed in conversation, written for planning.

## Intent

EA put Ultima V on Steam on 2026-11-05 (app **3067520**). It is the MS-DOS game in DOSBox, Windows only, with
Steam Cloud. Someone who bought it there should be able to press **Play in Steam** and get this engine instead
of DOSBox, on Linux and SteamOS, Windows and macOS. While Steam launched the game, their saves should follow them
between machines through Steam Cloud.

The why: the Steam Deck is a natural home for this engine. "Bought it on Steam, press Play, it just works, saves
sync" beats "add a non-Steam shortcut and pick a folder". The player's Steam copy is also the easiest legitimate
source of the game files the engine needs.

## Goals

- Steam's own Play button for Ultima V starts this engine on all three systems, after a one-time setup.
- A Steam launch reads the game files from Steam's install. The player never sees the installer screen.
- A Steam launch keeps its saves as files Steam Cloud syncs.
- Setup is reachable from the app itself, explained in its own words, with a button that copies the launch line.

## Non-goals

- Shared saves between Steam and non-Steam launches. **A Steam launch uses Steam saves only; any other launch uses
  the app's own saves only, even on a machine with a Steam copy.** Moving a game between the two uses the existing
  Export and Import.
- Syncing settings. Settings stay per machine.
- Using Valve's Steamworks library (licensed to a game's own developer; this would use EA's app id).
- Patching or injecting into Steam's program (the NotProton approach).
- Android. The Capacitor app is not part of this.

## Anti-goals: failure even if it technically works

- **Damaging anything of the player's in Steam:** EA's own `SAVED.GAM` and `PARTY.SAV`, the DOSBox version's
  ability to run, other games, other accounts, the player's artwork, or their non-Steam shortcuts. Every edit is to
  Ultima V's own entries and our own files, and can be undone.
- **Saves that seem to vanish.** The first Steam launch has no saves, and the game must say why (see "Saves").
- **Editing Steam's files while Steam runs.** Steam keeps its own copy in memory and writes it back over ours.
- **Overwriting Steam's artwork.** The existing steamArt.cjs already does nothing for a real Steam app id, and that
  must stay true.

## Background: what was tested (on the developer's Mac, 2026-11-05)

Steam's settings for the app, from `https://api.steamcmd.net/v1/info/3067520`:

- `common.oslist` is `windows`.
- `config.installdir` is `Ultima V`.
- There is one launch entry: `DOSBOX\Ultima V.exe`, working directory `DOSBOX`, no OS restriction.
- There is one depot: 3067521.
- The cloud rules (`ufs.savefiles`) are `SAVED.GAM` and `PARTY.SAV`, root `gameinstall`, path empty, recursive,
  platforms Windows only. The quota is 10 GB and the limit is 10,000 files.

The download:

- On a Mac, writing `steamapps/appmanifest_3067520.acf` (AppID, Universe 1, StateFlags 1026, installdir `Ultima V`)
  with Steam closed made Steam download the Windows depot (33 MB) when it reopened.
- 121 files are byte-identical to the copy the engine already supports. `SAVED.GAM` and `BRIT.OOL` differ (shipped
  save state).
- The Upgrade's music is not included.
- There is an `Extras/` folder of PDFs (manual, map, cluebook, spellbook, Book of Lore, reference card, journey log).

Launching on a Mac:

- Play gives "Invalid platform" (log: `AppError_29`) until there is a macOS launch entry.
- Steam keeps app settings in a binary cache, `appcache/appinfo.vdf` (version 29: keys index a string table at the
  end of the file).
- Adding a macOS launch entry there, with Steam closed, gave Ultima V a Play button.
- Each entry carries a SHA-1 of its binary key-value block, which must be recomputed after an edit. A round trip
  of the unedited entry is byte-identical. The test tool is `appinfo_mac.py` in the session's scratch folder; it
  follows the same approach as Neutron (Apache-2.0).
- Steam on a Mac would not start a shell script, or even a symlink to `/bin/sh` ("Failed to start process… OS
  Error 0", `AppError_46`). It did start a **`.app` bundle** whose executable was a shell script.
- Steam tracked that process as the game: `SteamAppId`, `SteamGameId` and `SteamOverlayGameId` were 3067520, the
  overlay variables were set, and the working directory was `/`.
- The original launch entry has no OS restriction, so once macOS was added Steam offered two identically named
  choices. Restricting the original to `windows` and giving ours a `description` fixed it.

Cloud on a Mac:

- With the rules as EA set them, Steam skipped both ("does not run on our platform").
- Adding `MacOS` to each rule's `platforms` made Steam upload `Shards Test/SAVED.GAM` from a subfolder after the
  game exited (result OK).
- The cache edit survived a Steam restart. Steam will replace it whenever Valve's servers send Ultima V's settings
  again (an EA update to the app).

Launch options:

- They're stored per account in `userdata/<account>/config/localconfig.vdf` (`apps/3067520/LaunchOptions`).
- On a Mac, a launch option `X %command%` was applied, with `%command%` expanded to the chosen launch entry. The
  option is the player's to paste (decided: we copy it, they paste). Steam rewrites that file from memory, so we
  never edit it.

Not yet tested, and to be verified on real machines: the Linux compatibility tool route, Cloud under Proton on
Linux, the Windows launch line, `flatpak run` from Steam's launch chain in Game Mode, and Flatpak Steam's sandbox.
See "When an untested route fails" for the plan.

## The design

### One-time setup, by system

All of it is offered from a **Steam** line in Settings (desktop builds only). It explains the steps for this system,
has a **Copy launch line** button where one applies, and includes the troubleshooting note below.

**Linux and SteamOS (Flatpak and AppImage).** The main route is a Steam compatibility tool, as
[Boxtron](https://github.com/dreamer/boxtron) does for DOS games.

- Our app writes a folder under `compatibilitytools.d` holding `compatibilitytool.vdf`, `toolmanifest.vdf` and a
  launcher script.
  - `compatibilitytool.vdf`: display name, `from_oslist` windows, `to_oslist` linux.
  - `toolmanifest.vdf`: `commandline` runs the launcher with `%verb%`.
  - Where: `~/.steam/root/compatibilitytools.d/`, and the Steam Flatpak's
    `~/.var/app/com.valvesoftware.Steam/data/Steam/compatibilitytools.d/` if present.
- After a Steam restart, the player chooses it in Ultima V's Properties → Compatibility. That also makes Steam
  download the Windows depot.
- Adding a folder never edits Steam's files, so a plain restart picks it up.
- The launcher runs the Flatpak (`flatpak run com.synthwavepixel.ultima5`) or the AppImage, passing Steam's
  environment through. It ignores Steam's arguments.
- The launcher only acts for Steam app 3067520. If chosen for any other game, it says so and exits rather than
  running Ultima V.
- Fallback: the copied launch line, with Proton chosen for the download.
- For the AppImage, the line or launcher must point at a **stable path** (a link the app re-points to its current
  file each time it starts). The file name carries the version, and each automatic update replaces the file.

**Windows (installed build).**

- The player installs Ultima V from Steam normally, then pastes the copied launch line into Properties → General →
  Launch Options.
- The line is `"<the installed exe>" %command%`. The installer's path is stable across updates.
- The portable `.exe` is not offered this, since its path is wherever the player put it.

**macOS.**

- Setup needs Steam closed. The app offers to quit Steam and waits for it to exit. Then it:
  1. writes `appmanifest_3067520.acf` if Ultima V isn't installed;
  2. edits Ultima V's entry in `appinfo.vdf`:
     - add `macos` to `common.oslist`;
     - restrict the existing launch entries to `windows`;
     - add a macOS launch entry with a description, executable = our launcher `.app`;
     - add `MacOS` to each `ufs.savefiles` rule's platforms;
     - recompute the entry's SHA-1;
  3. places the small launcher `.app` in the game folder.
- After the manifest, Steam downloads the game when it reopens.
- The launcher `.app` runs our installed app's executable directly and stays running until the game closes. It must
  not hand off and exit. Steam ties play time, the overlay and the after-game Cloud sync to that process.
- Each time our app starts, it checks the cache entry. If Steam has replaced it, it re-applies the edit when Steam
  isn't running, or says it will once Steam is closed.
- No launch line is needed on a Mac. The entry is the launch.

**Troubleshooting note (Mac), shown in the Steam line and in the docs.** Steam rebuilds Ultima V's settings when
the game's Steam settings change, which is rare for this title. If Play then says "Invalid platform", open our app
once outside Steam with Steam closed (or let it quit Steam) and it puts things back.

### A Steam launch

How the engine tells it was launched by Steam:

- `SteamAppId` or `SteamGameId` is 3067520 in the environment. The launcher passes them through.
- The Mac `.app` sets nothing extra, since Steam's environment reaches it.
- Steam's own command-line arguments are ignored.

Then:

- **Game files.** Find Steam's library folders:
  - the Steam root on each system, then `steamapps/libraryfolders.vdf`, which on the test Mac listed an external
    disk;
  - on SteamOS, an SD card under `/run/media/…`.
  - Use `<library>/steamapps/common/Ultima V`. Load the game from there, without the installer screen. If the files
    are missing or incomplete, say so plainly rather than falling back to the installer silently.
- **Saves.** Saves are files under `<game folder>/Ultima V Engine/<Steam account id>/`, each named `SAVED.GAM` so
  EA's cloud rules match them. The account subfolder keeps two Steam accounts on one machine apart, since the game
  folder and its Cloud root are shared. The account comes from Steam's environment (`SteamUser`) mapped through
  `config/loginusers.vdf`; this needs verifying on each system. Because Cloud keeps whatever layout ships first,
  the layout must be settled before release. Inside each is the engine's ordinary save (storage.ts's JSON), not the DOS format. Every character and
  slot is a subfolder, so each save is one `SAVED.GAM`.
  - The layout mirrors what storage.ts keeps in local storage: a character's latest save and the seven before it.
  - An index of characters can be its own `SAVED.GAM` in the top folder, or be derived from the folders.
  - EA's `SAVED.GAM` in the game folder itself is never read or written. Steam may sync it, as it would for any
    player.
- **First Steam launch.** There are no saves yet. The engine says, once, in its own way, that Steam saves are kept
  apart from saves made outside Steam, and that Export and Import move a game across.
- **Steamworks and art.** None of the Steamworks library is used. steamArt.cjs keeps doing nothing for a real app
  id.

### Already open (decided)

- The app allows one copy at a time (main.cjs single-instance lock). If Play in Steam is pressed while the app is
  open outside Steam, the Steam launch doesn't hand over to the open window. It says the game is already open
  outside Steam and asks the player to close it first, then exits.
- The reverse is the same: opening the app outside Steam during a Steam session says so and exits, leaving the
  Steam session alone.
- The Mac launcher `.app` and the Linux launcher pass this message through, so Steam sees a short failed session
  rather than a session silently given to the wrong window.

### Flatpak Steam on desktop Linux (best effort)

- Steam from Flathub (`com.valvesoftware.Steam`) runs everything it launches inside its own sandbox: games, launch
  options, compatibility tools. There, `flatpak` and host paths, including an AppImage, are out of reach.
- The documented fix is one command the player runs once:
  `flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam`. Our launcher then uses
  `flatpak-spawn --host flatpak run com.synthwavepixel.ultima5`. The launcher detects the sandbox (`FLATPAK_ID` set
  to Steam's) and, without that permission, says what to run.
- Flatpak Steam's files are under `~/.var/app/com.valvesoftware.Steam/…`. Whether our Flatpak's home access reaches
  another app's `~/.var/app` folder is untested; if not, it needs an explicit `--filesystem` entry for that path.
- The Deck and Bazzite use Steam installed the normal way, so this is a desktop-Linux variant only. It must not
  hold up the release.

### When an untested route fails (decided)

- Before any app code, run quick throwaway tests on a Steam Deck and on Windows:
  - the compatibility tool;
  - Cloud under it and under Proton;
  - `flatpak run` from Game Mode;
  - the Windows launch line.
- A route that fails falls back to the pasted launch line. Flatpak Steam gets the documented command. No system
  holds up the release.
- What "done" means on each system is what those tests show works, as listed in the Steam line's text for that
  system.

### Testing with players: pre-releases (decided)

- There are too many combinations to test alone: Deck, desktop Linux with native or Flatpak Steam, Windows, Mac
  Intel and Apple Silicon, and internal, SD-card or external libraries. So builds go to volunteer testers.
- `.github/workflows/desktop.yml` gets a manual-run **pre-release** input. It publishes the same files as a GitHub
  release marked Pre-release, with a tester checklist in its notes.
- A pre-release run must **not** start the Pages deploy. The site and its Flatpak repository follow full releases
  only.
- Nothing updates to a pre-release:
  - updates.cjs reads `releases/latest`, which skips pre-releases;
  - confirm electron-updater (`allowPrerelease` off for our plain version numbers) and `gh release view` in
    pages.yml skip them too.
- A full release reaches testers on the AppImage and Windows builds through the usual updates.
- A Deck tester installs the `.flatpak` bundle by hand and reinstalls the normal Flatpak afterwards. The checklist
  says so.
- Testers are found through a GitHub Discussion holding the checklist for each combination.
- A full in-app beta channel ("Beta updates") is out of scope unless testing outgrows pre-releases.

### Undoing setup

- The Steam line offers **Remove Steam setup** on each system:
  - **Linux:** remove our compatibility tool folders and the AppImage's stable link.
  - **Mac:** with Steam closed, restore Ultima V's original cache entry and remove the launcher `.app`, plus the
    manifest if we wrote it.
  - **Windows:** tell the player to clear the launch line, since we never edit Steam's files there.
- On a Mac, setup keeps a copy of Ultima V's original cache entry in the app's own data, so removal, or a later
  re-apply, starts from EA's settings, not from ours.
- **If our app is moved or deleted on a Mac:** the launcher `.app` can't find it and says so. It shows the
  Invalid-platform note's fix: reinstall, or remove setup.

### Updates during a Steam launch

- The app never restarts itself while Steam launched it, so Steam's tracking and the after-game Cloud sync aren't
  cut short. That covers electron-updater's `quitAndInstall` and the Flatpak portal's relaunch.
- An update found during a Steam launch installs when the game quits. The Flatpak deploys on the next start, as it
  already can.

### Permissions and packaging

- **Flatpak.** It already has `--filesystem=home`, which covers `~/.steam` and `~/.local/share/Steam`. An SD-card
  library needs read and write access to `/run/media`, and the compatibility tool folder is under home. Check
  Flathub's view of any new permission.
- **Mac.** The cache, the manifest and the game folder are under `~/Library/Application Support/Steam` or an
  external library path. The desktop scan deliberately skips `~/Library` (MAC_GUARDED in scan.cjs); Steam's paths
  are read explicitly, not scanned.
- **Windows.** The Steam root comes from the registry (`HKCU\Software\Valve\Steam\SteamPath`), then the libraries
  from `libraryfolders.vdf`.

## Cleanup before verification (do first)

The test left the developer's Mac changed. Restore it before verifying the built feature, keeping the download:

- restore `appcache/appinfo.vdf` from `appinfo.vdf.backup` in the session scratch folder, with Steam closed;
- remove `u5launch.sh`, `u5sh` (if present), `ShardsTest.app` and `Shards Test/` from `steamapps/common/Ultima V`;
- delete the test save from Steam Cloud. Deleting `Shards Test/SAVED.GAM` locally before a launch that syncs
  should remove it remotely; confirm with `cloud_log.txt`, or the Steam Cloud page for the account if it lingers.

## Left to the builder

- How the app's save layer gains a second store (local storage, or Steam files through the desktop's preload
  bridge) without the game code knowing which. storage.ts is the seam.
- Whether game files are read in place from Steam's folder each launch or installed from it once and re-checked.
- The exact wording of the Steam line, the first-launch note and the troubleshooting note, in the game's voice.
- The compatibility tool's name as shown in Steam (proposal below).
- Tests: the appinfo reader and writer (round trip, SHA-1, idempotent re-apply, v28 and v29),
  `libraryfolders.vdf` parsing, Steam-launch detection, the save store's file layout. Real-machine checks on a
  Steam Deck, Windows and the Mac.

## Calls made in writing this (check these)

- The save subfolder is **`Ultima V Engine/`**, and the compatibility tool is shown as **"Ultima V (new engine)"**.
  Both are placeholders until you pick names.
- Setup lives in a **Steam** line in Settings, desktop builds only.
- On Linux the compatibility tool is the main route and the pasted line the fallback; on Windows the pasted line is
  the only route; on a Mac the cache edit is the route.
- The Windows portable `.exe` is left out of setup.
- The Linux launcher refuses to act for any app other than 3067520.
- Game files missing in a Steam launch are reported, not silently sent to the installer.
- Steam saves are kept per Steam account (an account-id subfolder).
- Setup has a Remove option on each system, and on a Mac the original cache entry is kept to restore.
- No self-restart for updates during a Steam launch; they install when the game quits.
