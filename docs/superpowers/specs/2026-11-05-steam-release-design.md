# Playing Steam's Ultima V with this engine: design

Date: 2026-11-05, revised 2026-11-06. Status: agreed in conversation, written for planning.

**Revision of 2026-11-06.** The Steam integration ships in the regular releases as **beta options, each off until
the player turns it on**, instead of through pre-releases and a throwaway test kit. The release is the experiment:
the options do what the kit would have done, on testers' own machines, and a report button collects what they saw.
Finding the game files in Steam's libraries is not an option; it is always on. Sections changed by the revision are
marked *(revised)*.

## Intent

EA put Ultima V on Steam on 2026-11-05 (app **3067520**). It is the MS-DOS game in DOSBox, Windows only, with
Steam Cloud. Someone who bought it there should be able to press **Play in Steam** and get this engine instead
of DOSBox, on Linux and SteamOS, Windows and macOS. While Steam launched the game, their saves can follow them
between machines through Steam Cloud.

The why: the Steam Deck is a natural home for this engine. "Bought it on Steam, press Play, it just works, saves
sync" beats "add a non-Steam shortcut and pick a folder". The player's Steam copy is also the easiest legitimate
source of the game files the engine needs.

Why beta options *(revised)*: there are too many combinations to test alone (Deck, desktop Linux with native or
Flatpak Steam, Windows, Mac Intel and Apple Silicon, internal, SD-card or external libraries), and none of the
Linux or Windows routes has been tried on a real machine. Shipping each piece switched off, in the normal release
channel, lets testers turn on one piece at a time with no second update channel to manage, while every other
player sees no change beyond the engine finding their Steam copy of the game.

## Goals

- *(revised)* The engine finds Ultima V in Steam's libraries on every start, on all three systems, and takes its
  game files from there once, when it has no copy of its own. Always on.
- *(revised)* A **Steam (beta)** entry on the title screen's main menu (desktop builds only) holds the Steam options.
  Each is off until the player turns it on, and turning it off undoes it.
- With the Play option for the player's system on, Steam's own Play button for Ultima V starts this engine.
- With the Steam Cloud saves option on, a Steam launch keeps its saves as files Steam Cloud syncs.
- *(revised)* A tester can copy a report of what the engine found and did, and open the project's GitHub issues
  page to file it.

## Non-goals

- Keeping Steam saves and the app's own saves in step continuously. *(revised)* With Steam Cloud saves on, a Steam
  launch uses Steam's saves and any other launch uses the app's own; they are copied across only when the option
  is turned on or off (see "Steam Cloud saves").
- Syncing machine-wide settings. The game keeps a full block of settings with each character
  (`ultima5.char.<id>.settings`), and with Steam Cloud saves that block travels with the character's saves, sound,
  Input and Battery saver included (decided 2026-11-05; splitting device settings off is a possible later
  refinement). Only the no-character fallback (`ultima5.settings`), the app's own bookkeeping and the Steam options
  themselves stay per machine.
- Using Valve's Steamworks library (licensed to a game's own developer; this would use EA's app id).
- Patching or injecting into Steam's program (the NotProton approach).
- Android and the web build. The Steam entry is not shown there.
- *(revised)* SD-card libraries in the **Flatpak** build. They need a new Flatpak permission (`/run/media`), which
  stops existing Flatpak installs from updating automatically; it ships later in a release of its own
  ([#16](https://github.com/synthwave-pixel/ultima5/issues/16)). The AppImage already reaches `/run/media`.
- *(revised)* Pre-releases. The pre-release input added to `.github/workflows/desktop.yml` stays but goes unused.

## Anti-goals: failure even if it technically works

- **Damaging anything of the player's in Steam:** EA's own `SAVED.GAM` and `PARTY.SAV`, the DOSBox version's
  ability to run, other games, other accounts, the player's artwork, or their non-Steam shortcuts. Every edit is to
  Ultima V's own entries and our own files, and can be undone.
- **Saves that seem to vanish.** Turning Steam Cloud saves on or off copies saves across, never moves or drops
  them, and a clash is the player's choice (see "Steam Cloud saves").
- **Editing Steam's files while Steam runs.** Steam keeps its own copy in memory and writes it back over ours.
- **Overwriting Steam's artwork.** The existing steamArt.cjs already does nothing for a real Steam app id, and that
  must stay true.
- *(revised)* **A beta option that changes anything while off.** With every option off, the only difference a
  player sees is the engine finding the Steam copy of the game files.

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

Not yet tested, and to be learned from the beta *(revised)*: the Linux compatibility tool route, Cloud under Proton
on Linux, the Windows launch line, `flatpak run` from Steam's launch chain in Game Mode, and Flatpak Steam's
sandbox.

## The design

### Finding the game files (always on) *(revised)*

- On every start of a desktop build, before the installer screen, the engine looks for Steam's libraries:
  - the Steam root on each system (on Windows from the registry, `HKCU\Software\Valve\Steam\SteamPath`), then
    `steamapps/libraryfolders.vdf`, which on the test Mac listed an external disk;
  - on Linux, SD cards under `/run/media/…` where the build can reach them (the AppImage; not the Flatpak, see
    Non-goals).
- It uses `<library>/steamapps/common/Ultima V` when every required file is there.
- **Once is enough.** The engine needs one copy of the game files and does not care where it came from. If it
  already has one (from the installer, a folder the player picked, or an earlier Steam find), nothing changes and
  Steam is not consulted for files. If it has none and finds Steam's, it takes them as the installer would, once,
  and says so in a one-time note ("Found Ultima V in your Steam library"). After that, the Steam folder may move or
  be uninstalled without affecting the engine.
- If it finds nothing, the installer screen appears as today.
- A Steam launch with no copy and no Steam copy found says so plainly rather than falling back to the installer
  silently, since the player pressed Play in Steam expecting the game.
- Reading Steam's folders only reads. Nothing in Steam's folders is written by this.

### The Steam (beta) menu *(revised)*

- An entry **Steam (beta)** on the title screen's main menu, in desktop builds only. Not in Settings, and not in the
  web or Android builds.
- It is shown whether or not Steam is installed. *(revised after Mac testing)* It always shows the same six lines, so
  that it reads the same each time: Back, Play from Steam, Cloud Saves, Copy report, Report an issue, Paths. No paths
  and no explanations in its body; the note at the foot says what the line under the bar does and how an option that
  is on stands. A line that can't be used here is greyed, its note saying why. Paths shows where Steam, the game and
  its Steam saves were found, and the launch line, only when chosen. On a Mac Play from Steam is the option itself; on
  Windows and Linux it opens its own menu (Launch line, Copy launch line, Linux's Compat. tool, the Flatpak's Get the
  AppImage).
- *(revised after Mac testing)* While a Play from Steam option is on and the game was not started by Steam, the title
  menu shows **Launch From Steam**, greyed, in place of Journey Onward, Create New Character and Settings, so that
  players are not left wondering where to play from. Manage Saves and Steam (beta) stay, so the option can be turned
  off. Cloud saves alone does not count.
- Below that, the options for this system, each with a short explanation, each **off until turned on**, and each
  undone when turned off:

| System | Option | Turning it on | Turning it off |
| --- | --- | --- | --- |
| Windows | Play from Steam | Shows the launch line, with a Copy button | Tells the player to clear the line (we never edit Steam's files on Windows) |
| Linux | Play from Steam: launch line | Shows the launch line, with a Copy button | Tells the player to clear the line |
| Linux | Play from Steam: compatibility tool | Installs the compatibility tool folders | Removes them |
| Mac | Play from Steam (edits Steam's settings) | Warns, offers to quit Steam, then edits the cache (see below) | With Steam closed, restores Ultima V's original cache entry and removes the launcher `.app` |
| All | Steam Cloud saves | Copies the app's saves into Steam's folder (see below) | Copies Steam's saves back into the app's saves |

- The two Linux options are separate on purpose: nobody yet knows which works on a Deck, and the beta is how we find
  out. Either, both or neither may be on.
- **Mac warning**, shown before the Mac option does anything: it closes Steam, and it changes Steam's own settings
  for Ultima V; Steam may undo the change when EA updates the game (then the engine puts it back, see below); turning
  the option off restores Steam's original settings. The player confirms, or nothing happens.
- Then two tester buttons:
  - **Copy report**: copies a plain-text report to the clipboard (see "The report").
  - **Report an issue**: opens `https://github.com/synthwave-pixel/ultima5/issues` in the player's browser.
- In-game text in the game's font is plain ASCII (the font is 7-bit). The menu works with a controller, keyboard,
  mouse and touch, as the game's other menus do.
- The options' on and off state is kept per machine, in the app's own settings, never in saves or Steam Cloud.

### The report *(revised)*

Plain text a tester pastes into an issue. It replaces the test kit's log and checklist. It says:

- the engine's version, the system and the build (installed, portable, AppImage or Flatpak);
- how this run was started: by Steam or not, and the Steam variables seen (`SteamAppId`, `SteamGameId`,
  `STEAM_COMPAT_APP_ID`, `SteamUser`, `FLATPAK_ID`), with values that identify the player (account names, user
  names in paths) left out or masked;
- Steam's location, its libraries, whether Ultima V is installed and in which library, and whether its files are
  complete;
- where the engine's game files came from;
- each option's state and the result of the last time it was turned on or off (done, or the error);
- on a Mac, whether Ultima V's cache entry is currently patched, and whether it had to be re-applied;
- with Steam Cloud saves on, how many characters are in Steam's folder.

The report contains no save contents and no file contents.

### Play from Steam, by system

**Linux and SteamOS (Flatpak and AppImage).** Two routes, offered as separate options.

- *Compatibility tool*, as [Boxtron](https://github.com/dreamer/boxtron) does for DOS games:
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
  - *(revised)* The launcher sets `SteamAppId=3067520` before starting the engine, so a launch where Steam set only
    `STEAM_COMPAT_APP_ID` is still recognised as a Steam launch.
- *Launch line*: the copied line, pasted into Properties → General → Launch Options, with Proton chosen for the
  download.
- For the AppImage, the line or launcher points at the AppImage file itself (`$APPIMAGE`). Its path is stable
  because its name carries no version (see "The AppImage"); there is no separate link to keep.

**Windows (installed build).**

- The player installs Ultima V from Steam normally, then pastes the copied launch line into Properties → General →
  Launch Options.
- The line is `"<the installed exe>" %command%`. The installer's path is stable across updates.
- The portable `.exe` is not offered this, since its path is wherever the player put it; the option says so.

**macOS.**

- Setup needs Steam closed. After the warning, the app offers to quit Steam and waits for it to exit. Then it:
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
- While the option is on, each time our app starts it checks the cache entry. If Steam has replaced it, it re-applies
  the edit when Steam isn't running, or says it will once Steam is closed.
- No launch line is needed on a Mac. The entry is the launch.
- Setup keeps a copy of Ultima V's original cache entry in the app's own data, so turning the option off, or a later
  re-apply, starts from EA's settings, not from ours.
- **If our app is moved or deleted on a Mac:** the launcher `.app` can't find it and says so, with the fix: reinstall,
  or turn the option off.

**Troubleshooting note (Mac), shown with the Mac option and in the docs.** Steam rebuilds Ultima V's settings when
the game's Steam settings change, which is rare for this title. If Play then says "Invalid platform", open our app
once outside Steam with Steam closed (or let it quit Steam) and it puts things back.

### Checking the launch line *(revised)*

Where the Play option uses a pasted launch line (Windows, and Linux's launch-line option), the Steam menu reads
Ultima V's launch options from `userdata/<account>/config/localconfig.vdf` (`apps/3067520/LaunchOptions`), only
ever reading it, and shows one of:

- **found and correct**: the line runs this copy of the engine;
- **missing**;
- **out of date**: it runs an engine at another path (an old versioned AppImage name, a moved app);
- **pasted twice**: more than one `%command%`, or this engine's path more than once;
- **both Linux options in use**: Steam runs the launch line, and the compatibility tool goes unused.

Each comes with what to do and the Copy button. Steam writes that file from memory, sometimes only when it closes,
so a line pasted moments ago may not be there yet: the menu says "not seen yet" rather than "wrong". In a Steam
launch the line is known to work, since Steam started the engine. The Mac edit is idempotent (never a second entry),
and the compatibility tool is one folder, overwritten.

### Telling the SP edition apart *(revised)*

- Steam can be told our name in only two places: the Mac launch entry's description and the Linux compatibility
  tool's display name, both **"Ultima V SP"**. A launch line can't rename EA's game, so Windows and Linux with a
  launch line still show "Ultima V" in Steam.
- So the engine says it itself: the window title and the title screen show **"Ultima V SP"** with the version.
- The version is not put into Steam's names, since changing them means editing Steam's settings with Steam closed
  on every update.
- Settings shows the running version, greyed, as its last line ("Ultima V SP 1.1.195"), in every build.

### The AppImage, and which Linux build to recommend *(revised)*

- The AppImage already updates itself (electron-updater): it downloads a newer release in the background and
  installs it when the game quits (at once outside a Steam launch).
- electron-updater keeps the file's path when the current file's name has no version number in it (its
  AppImageUpdater overwrites the file in place; a versioned name is instead replaced by a file of the new name, the
  old deleted). So the AppImage is published as **`ultima5-sp-<arch>.AppImage`** (lowercase, no spaces, no
  version), e.g. `ultima5-sp-x86_64.AppImage`. Its path then never changes across updates, and the launch line and
  compatibility tool point at it directly. The branch's stable link (`appImageLink`, `relinkAppImage`, the
  `appimage-filename-updated` handler) is removed.
- Existing players move over by themselves: their next update writes the new, version-less name once (the old
  versioned file deleted), and every update after that overwrites it in place.
- The docs and site link to the permanent `releases/latest/download/ultima5-sp-x86_64.AppImage`.
- **For Steam on Linux and the Deck, the docs recommend the AppImage**: it updates itself quietly, reaches SD-card
  libraries, and its launch line is its own path. The Flatpak stays for those who prefer a store install; its Steam
  menu says the AppImage works better with Steam. Against the AppImage: it is downloaded in Desktop Mode, marked
  executable, and added to the app menu by hand.
- Other builds' file names are unchanged.

### A Steam launch

How the engine tells it was launched by Steam:

- `SteamAppId` or `SteamGameId` is 3067520 in the environment. The launchers pass them through (and the Linux
  launcher sets `SteamAppId`, above).
- The Mac `.app` sets nothing extra, since Steam's environment reaches it.
- Steam's own command-line arguments are ignored.

Then:

- **Game files** as in "Finding the game files".
- **Saves** *(revised)*: Steam's folder if Steam Cloud saves is on, else the app's own saves as in any other launch.
- **Steamworks and art.** None of the Steamworks library is used. steamArt.cjs keeps doing nothing for a real app
  id.

### Steam Cloud saves *(revised)*

**Where.** Saves are files under `<game folder>/ultima5-sp/<Steam account id>/`, each named `SAVED.GAM` so
EA's cloud rules match them. The account subfolder keeps two Steam accounts on one machine apart, since the game
folder and its Cloud root are shared. The account comes from Steam's environment (`SteamUser`) mapped through
`config/loginusers.vdf`. The folder name is final once released (lowercase, no spaces, SP marking this
engine's version). Because Cloud keeps whatever layout ships first, the layout must be settled
before release. Inside each is the engine's ordinary save (storage.ts's JSON), not the DOS format. Every character
and slot is a subfolder, so each save is one `SAVED.GAM`.

- The layout mirrors what storage.ts keeps in local storage: a character's latest save and the seven before it.
- An index of characters can be its own `SAVED.GAM` in the top folder, or be derived from the folders.
- EA's `SAVED.GAM` in the game folder itself is never read or written. Steam may sync it, as it would for any
  player.

**Switching it** on or off is possible only during a Steam launch, when Steam has just synced the folder and has
named the account. Outside one, the option is greyed with "Start Ultima V from Steam to change this". On a Mac it is
also greyed until Play from Steam is on there, since Steam syncs these saves on a Mac only because that option adds
`MacOS` to the cloud rules.

**Per account.** The option is on or off for each Steam account on the machine, not for the machine: a second
account launching Ultima V on the same machine starts with it off, and its own folder.

**Use.** While the option is on, a Steam launch reads and writes only Steam's folder; any other launch reads and
writes only the app's own saves. While it is off, every launch uses the app's own saves.

**Turning it on** copies every character in the app's own saves into Steam's folder, with the character's settings
block. **Turning it off** copies every character in Steam's folder back into the app's own saves. Nothing is
deleted on either side; the source keeps its copy.

**A clash** is a character whose two sides have each moved on separately (played on two machines, say): neither
side's latest save is among the other side's saves. Every other case is settled without asking:

- identical on both sides: passed over;
- present on one side only: copied;
- one side's latest save already among the other side's saves (that side simply played on): the newer side's
  saves are copied over the older side's.

- For each clash the player is shown both versions side by side, each as the character's card: name, level, where
  they are, and when it was saved ("Saved 2 hours ago" and the date, from the save's `written` time; storage.ts
  `savedWhen`). The player picks which to keep.
- After a choice, on the receiving side the picked version is the latest save, the version not picked becomes its
  newest earlier save, and the rest of that side's earlier saves stay as they were (within storage.ts's limit).
- The side copied from is never changed.
- Cancelling the dialog leaves the option as it was and copies nothing.
- The dialog works with a controller, keyboard, mouse and touch, like the page's other menus.

**When Steam's folder can't be used.** If, in a Steam launch with the option on, the account can't be identified
or the folder can't be read or written, the engine uses the app's own saves for that launch and says so once at the
start ("Steam's saves can't be reached; using this computer's saves"). It never runs with saving refused.

**First Steam launch with the option on.** The engine says, once, in its own way, that saves made in a Steam
launch stay in Steam's folder, and that turning the option off copies them back.

### Already open (decided)

- The app allows one copy at a time (main.cjs single-instance lock). If Play in Steam is pressed while the app is
  open outside Steam, the Steam launch doesn't hand over to the open window. It says the game is already open
  outside Steam and asks the player to close it first, then exits.
- The reverse is the same: opening the app outside Steam during a Steam session says so and exits, leaving the
  Steam session alone.
- The Mac launcher `.app` and the Linux launcher pass this message through, so Steam sees a short failed session
  rather than a session silently given to the wrong window.
- This is always on: it only acts in a Steam launch, and turning it off could only do harm.

### Flatpak Steam on desktop Linux (best effort)

- Steam from Flathub (`com.valvesoftware.Steam`) runs everything it launches inside its own sandbox: games, launch
  options, compatibility tools. There, `flatpak` and host paths, including an AppImage, are out of reach.
- The documented fix is one command the player runs once:
  `flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam`. Our launcher then uses
  `flatpak-spawn --host flatpak run com.synthwavepixel.ultima5`. The launcher detects the sandbox (`FLATPAK_ID` set
  to Steam's) and, without that permission, says what to run.
- Flatpak Steam's files are under `~/.var/app/com.valvesoftware.Steam/…`. Whether our Flatpak's home access reaches
  another app's `~/.var/app` folder is untested; if not, it needs an explicit `--filesystem` entry for that path.
- The Deck and Bazzite use Steam installed the normal way, so this is a desktop-Linux variant only.

### Updates during a Steam launch

- The app never restarts itself while Steam launched it, so Steam's tracking and the after-game Cloud sync aren't
  cut short. That covers electron-updater's `quitAndInstall` and the Flatpak portal's relaunch.
- An update found during a Steam launch installs when the game quits. The Flatpak deploys on the next start, as it
  already can.
- This is always on, for the same reason as the one-copy rule.

### Permissions and packaging

- **Flatpak.** It already has `--filesystem=home`, which covers `~/.steam` and `~/.local/share/Steam` and the
  compatibility tool folder. No new permission in this release *(revised)*: `/run/media` waits for #16.
- **Mac.** The cache, the manifest and the game folder are under `~/Library/Application Support/Steam` or an
  external library path. The desktop scan deliberately skips `~/Library` (MAC_GUARDED in scan.cjs); Steam's paths
  are read explicitly, not scanned.
- **Windows.** The Steam root comes from the registry, then the libraries from `libraryfolders.vdf`.

### Release *(revised)*

- The beta ships in a regular release. Its notes say what the Steam (beta) menu is, that every option is off until
  turned on, and ask testers to use Copy report and Report an issue.
- A GitHub Discussion holds the tester checklist for each combination, pointing at the report.
- An option graduates (on by default, or its beta label dropped) in a later release, once reports show it works.

## Cleanup before verification (do first)

The test left the developer's Mac changed. Restore it before verifying the built feature, keeping the download:

- restore `appcache/appinfo.vdf` from `appinfo.vdf.backup` in the session scratch folder, with Steam closed;
- remove `u5launch.sh`, `u5sh` (if present), `ShardsTest.app` and `Shards Test/` from `steamapps/common/Ultima V`;
- delete the test save from Steam Cloud. Deleting `Shards Test/SAVED.GAM` locally before a launch that syncs
  should remove it remotely; confirm with `cloud_log.txt`, or the Steam Cloud page for the account if it lingers.

## Left to the builder

- How the app's save layer gains a second store (local storage, or Steam files through the desktop's preload
  bridge) without the game code knowing which. storage.ts is the seam.
- How "take the files once" reuses the installer's import (the found folder handed to it as a picked folder would
  be).
- Whether the clash dialog is drawn by the game (as the save list is) or is one of the page's HTML menus.
- The exact wording of the menu, its explanations, the Mac warning, the notes and the report, in the game's voice.
- Tests: the appinfo reader and writer (round trip, SHA-1, idempotent re-apply, v28 and v29),
  `libraryfolders.vdf` parsing, Steam-launch detection, the save store's file layout, the copy on turning Cloud
  saves on and off (clash, identical, one-sided, cancel), each option's undo, every option off changing nothing,
  and the report's masking. Real-machine checks on the Mac before release; the rest from beta reports.

## Calls made in writing this (check these)

- *(revised)* Names use the **SP** marker: the save folder is **`ultima5-sp/`** (decided), and the compatibility tool
  and the Mac launch entry are both shown in Steam as **"Ultima V SP"**.
- The Windows portable `.exe` is left out of Play from Steam.
- The Linux launcher refuses to act for any app other than 3067520.
- Steam saves are kept per Steam account (an account-id subfolder), and the Cloud saves option is set per account.
- No self-restart for updates during a Steam launch; they install when the game quits.
- *(revised)* The one-copy rule and the update rule are always on, not options.
- *(revised)* The menu is shown even where Steam isn't installed, saying so, with its options greyed.
- *(revised)* The report masks account names and user names in paths.
- *(revised)* The AppImage's name is `ultima5-sp-<arch>.AppImage` (decided); other builds keep their names.
- *(revised)* On a Mac, Cloud saves is greyed until Play from Steam is on.
