# Installing Ultima V

Every build asks, the first time, for your own copy of the game: its
folder, its files or a `.zip` (from GOG's
[Ultima 4+5+6](https://www.gog.com/en/game/ultima_456), or the Internet Archive). The files
stay on your device. The desktop app's Scan for game files... finds the
copy itself: beside the app, at home, and where GOG and the Linux
launchers install games. The web game's Scan looks for a copy put on
the site beside it, which suits anyone hosting it themselves (see Hosting
it yourself below), and on Android Choose folder... opens the system's
folder picker.

- **Browser**: <https://synthwave-pixel.github.io/ultima5/>. Nothing to
  install. Chrome, Edge and Android offer to add it as an app, and it
  works offline after the first visit.
- **Steam Deck**: the game installs as a Flatpak from Desktop Mode, in a
  few minutes, and then lives in your Game Mode library.
  1. Switch to Desktop Mode: press the Steam button, choose Power, then
     Switch to Desktop.
  2. If the Deck has never had a password, give it one: open Konsole and
     run `passwd`, choosing any password you like. Discover needs it once,
     when it registers the game's repository, and it is also what `sudo`
     asks for; nothing else changes.
  3. Open this page in a browser there (if the Deck has none yet,
     Discover, its app store, installs Firefox) and tap
     [install Ultima V](https://synthwave-pixel.github.io/ultima5/flatpak/ultima5.flatpakref).
     The browser saves a small file; open it from the browser's downloads
     and Discover shows Ultima V with an Install button, and asks for the
     password that first time. Install once: later updates arrive in
     Discover with every other Flatpak's, with no prompt.
  4. Open Steam, still in Desktop Mode. Click Add a Game at the bottom
     left, then Add a Non-Steam Game, tick Ultima V in the list, and click
     Add Selected Programs.
  5. Return to Game Mode with the icon on the desktop, or restart. The
     game is in your library under Non-Steam. If the controls do not
     respond, open the shortcut's controller settings and pick a Gamepad
     template.
  6. The first time you play it from Steam, the game gives its library
     entry its own artwork (cover, banner and logo); Steam shows it the
     next time Steam starts. Artwork you have set yourself is never
     replaced; when an update brings new artwork, the pictures the game
     put there itself are brought up to date the same way.

  The same link works on any Linux desktop with Flatpak, and the
  terminal line under Installing from a terminal installs per user with
  no password at all.
- **Windows and macOS**: the installers on the
  [Releases page](https://github.com/synthwave-pixel/ultima5/releases/latest),
  a Windows installer or portable `.exe` and an Apple Silicon `.dmg`.
  They are unsigned; see Desktop app, and the Steam Deck below for the one-time step each
  system asks for.
- **Android**: the APK on the Releases page, or
  [Obtainium](https://github.com/ImranR98/Obtainium) to keep it updated;
  see Android handhelds below.
- **Linux without Flatpak**: the `AppImage` on the Releases page.

## Desktop app, and the Steam Deck

The same game is packaged as a desktop app with Electron, for players who
want a plain window, an icon in the dock, or a Steam shortcut. The
desktop app keeps its saved game in its own storage, separate from the
browser's; Export and Import move a game between them. It starts full screen, or as
a window if that is how it was last left: the system's own controls (the
green button on macOS, the window manager's elsewhere), F11 or Alt+Enter,
and the full-screen switch at the upper right of the touch pad (a click
anywhere shows the pad) go between the two. Its title menu has
a Quit, for a full screen or Steam's Game Mode where the window has no
close button, and only one copy runs at a time: launching it again brings
the open one forward, so two copies never write over each other's save.

**Updates.** A few seconds after it starts, the app looks for a newer
release on the Releases page. Installed with the Windows installer, or
run as the AppImage, it downloads the new version in the background and
installs it when you quit the game (or at once, if you choose Restart now
when it says it is ready). On macOS, and as the Windows portable `.exe`,
it says once that a newer version is out and offers the Releases page:
macOS installs updates only into apps signed by an Apple developer, which
this one is not yet ([#1](https://github.com/synthwave-pixel/ultima5/issues/1)). The Flatpak updates with every other Flatpak's, the
Android app through Obtainium. `--no-update-check` on the command line
turns the check off; under Steam's Game Mode nothing is asked, and a
downloaded update is installed when the game quits.

- **Windows**: an installer and a portable `.exe`. Both are unsigned, so
  SmartScreen asks once; choose More info, then Run anyway.
- **macOS**: an Apple Silicon `.dmg`, for macOS 13 (Ventura) or later
  (Intel Macs: use the web version). Signed by no Apple developer, so the first launch is refused. Try to open the app
  once, then open System Settings, choose Privacy & Security, scroll down
  to Security, click Open Anyway beside Ultima V, and confirm with your
  password or Touch ID; it opens normally from then on. Or, in Terminal,
  once: `xattr -dr com.apple.quarantine "/Applications/Ultima V.app"`.
- **Linux and SteamOS**: the Flatpak repository, installed as above, is
  the way on a Steam Deck and on any Linux with Flatpak: one click or one
  line, and updates arrive with every other Flatpak's. Add the game to
  Steam from the Non-Steam Game list, and in the shortcut's controller
  settings pick a Gamepad template. The first launch from that shortcut
  puts the game's artwork in Steam's library folder for it (never over
  artwork already there), which Steam shows once it restarts. The app sees the controller as a
  gamepad and switches to controller mode on the first press, and always
  starts full screen when Steam launches it. In Game Mode it also turns off GPU
  acceleration and the browser sandbox, which have hung other Electron
  apps under gamescope. The `.flatpak` bundle on the Releases page is the
  same build for an offline install (`flatpak install --user <file>`,
  which then never updates), and the `AppImage` suits a Linux without
  Flatpak: make it executable and run it.

## Android handhelds

For Android handhelds like the AYN Odin or the Retroid Pocket, and for
phones and tablets, the same workflow builds an APK
(`Ultima-V-<version>-android.apk`), published in the same release as the
desktop installers. Copy it to the device and open it; Android asks once
to allow installs from that source. Or let
[Obtainium](https://github.com/ImranR98/Obtainium) install it and keep it
updated from the releases: add `https://github.com/synthwave-pixel/ultima5`
in Obtainium.

The app runs full screen in landscape, the status and navigation bars
hidden - again whenever they come back, as on waking from sleep (where
they may flicker once, a second after), and at the next button press or
touch should they still show (a swipe from an edge shows them for a
moment). The Back button opens the Pause
menu as Escape does, and so does sending the app to the background; the
title menu has a Quit that closes the app. Built-in controls that Android
reports as a gamepad switch the game to controller mode on the first
press. The APK is signed with a key kept in the repository, so a new
build installs over the old one and keeps the saved game. iOS has no such
build on purpose: install the web version from Safari's Share menu with
Add to Home Screen instead.

## Installing from a terminal

On a Steam Deck (Konsole, in Desktop Mode) or any Linux with Flatpak, the
same as the link above, in one line:

    flatpak install --user https://synthwave-pixel.github.io/ultima5/flatpak/ultima5.flatpakref

It registers the game's repository, so `flatpak update` then updates the
game with everything else. To remove the game and its saved data:

    flatpak uninstall --user --delete-data com.synthwavepixel.ultima5

The `.flatpak` bundle on the Releases page is the same build for an
offline install (`flatpak install --user <file>`), which then never
updates. A bundle opened in Discover installs system-wide instead, and
asks for the password (step 2 under Steam Deck above); the link and the
`flatpak install --user` lines install per user.

## How the installer checks your files

The files you give the installer stay in the browser (or the app's own
storage). Each is checked against the known copies - its size and CRC-32,
kept in `web/src/install/known.ts` as fingerprints, not the game - and
against a zip's own checks. A file that differs, edited or damaged, is
named, and a modded copy is installed if you say so. The copy kept is
checked again at each start, and one damaged in keeping sends you back to
the installer, saying which file.

## Hosting it yourself

The web game is a static site: `npm run build` in `web/` leaves it in
`web/dist/`, to be served from any web server (set `VITE_BASE` to the
path it is served under, `/ultima5/` say, when that is not the root).
To have Scan for game files... find a copy there, put the game's files
in a `gamedata/` folder beside the site's `index.html`, loose (`DATA.OVL`,
`BRIT.DAT` and the rest, and the Upgrade's `*.XMI` music if you have it),
and beside them an `index.json` naming them, a JSON list of their names
relative to `gamedata/`:

    ["DATA.OVL", "BRIT.DAT", "TOWNE.TLK", "TILES.16", ...]

The scan reads `gamedata/index.json` and fetches each file it names, then
checks them as any other copy. A site with no index, or one that answers
with its own page there, offers nothing to the scan. The dev server
(`npm run dev`) makes its index itself, from the developer's copy in
`gamedata/ultima5/` (see [gamedata/README.md](../gamedata/README.md)).
Each player's browser still keeps its own copy once installed. Whatever
is in `gamedata/` is served to anyone who can open the site.
