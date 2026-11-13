# Advanced

For players who want more control over the desktop app: the command-line
options it takes, and how each build keeps itself up to date.

## Command-line options

| Option | What it does |
| --- | --- |
| `--no-auto-update` | Tells you when a newer release is out and offers its page, but downloads and installs nothing. You choose when to update. |
| `--no-update-check` | Never looks for updates, and says nothing. |
| `--fullscreen` | Starts full screen. |
| `--windowed` | Starts in a window, even on a Steam Deck (which otherwise always starts full screen). |
| `--dev` | Turns on the dev cheats for the session ([developer notes](developer-notes.md)). They can break your game. |

The web game takes no options, except `?dev` on its address.

### Where to put them

- **Steam** (a Non-Steam shortcut, or Ultima V with the compatibility tool):
  Properties → Launch Options, after `%command%`:

      %command% --no-auto-update

- **Windows**: right-click the shortcut → Properties, and add the option at
  the end of Target, after the closing quote.
- **macOS**, from Terminal:

      open -a "Ultima V" --args --no-auto-update

- **AppImage**, from a terminal, or on the `Exec=` line of its menu entry:

      ./ultima5-sp-x86_64.AppImage --no-auto-update

- **Flatpak**:

      flatpak run com.synthwavepixel.ultima5 --no-auto-update

## Updates

Each build looks for a newer release a few seconds after it starts. Most
update themselves; a few only tell you and point you at the release page.

| Build | Finds it | Gets it | Takes it up |
| --- | --- | --- | --- |
| Windows installer | Reads `latest.yml` on GitHub | Downloads in the background | Installs when you quit, or at once with Restart |
| AppImage | Reads `latest-linux.yml` | Downloads in the background | Replaces the file when you quit; same name, so shortcuts keep working |
| macOS, in Applications | Reads `latest-mac.yml` | Downloads the `.zip` in the background | Installs when you quit or restart; if it fails, tells you instead |
| Flatpak | Flatpak's update service checks the game's repository every 30 minutes, and GitHub at start | Installed beside the running copy (asks once, in Desktop Mode) | Restart plays it; in Game Mode, quit and start it again |
| Web | Checks at load and every hour | Fetches the new build in the background | The title offers Restart |
| Windows portable `.exe`, macOS outside Applications | Asks GitHub for the newest release | A notice on the title, once per version | Opens the release page; you download it |
| Android | Asks GitHub for the newest release | A notice on the title, once per version | Opens the release page; you install it (or let [Obtainium](https://github.com/ImranR98/Obtainium) do it) |

With `--no-auto-update`, every desktop build behaves like the last two rows.

- **Started by Steam**, the game never restarts itself, so Steam keeps
  track of it: a downloaded update installs when you quit, and a Flatpak
  update is played when you start the game again from Steam.
- **In Steam's Game Mode**, no release page is opened (a browser would
  leave the game). A notice only says how to update.
- **Flatpak on a Steam Deck**: Flatpak asks once, "Update Ultima V?", and can
  only ask in Desktop Mode. Start the game there once after installing and
  choose Update; after that it updates itself in Game Mode too. If you chose
  Deny, allow it again from Konsole:

      flatpak permission-set flatpak updates com.synthwavepixel.ultima5 yes

  Discover updates it too, with your other Flatpaks
  ([how the Flatpak updates itself](flatpak-updates.md)).
- **After an update**, the first start shows what's new in that release.
- **Test builds** (pre-releases) are never offered as updates.
- **Offline**, or with GitHub down, nothing is shown; the game tries again
  next time.

## Builds that never update themselves

- The Windows portable `.exe`.
- The macOS app run from anywhere but Applications.
- The Android APK (unless you use Obtainium).
- The `.flatpak` file installed by hand (`flatpak install --user <file>`).
- Any build started with `--no-auto-update` (told of releases) or
  `--no-update-check` (silent).

## The desktop app

- **Full screen or a window.** It starts full screen, or as a window if
  that is how you last left it. F11 or Alt+Enter switch between them, as
  do the system's own controls and the switch at the upper right of the
  touch pad (click anywhere to show it).
- **Quit.** The title menu has a Quit, for full screen and Steam's Game
  Mode, where the window has no close button.
- **One copy at a time.** Starting it again brings the open one forward,
  so two copies never write over each other's save.
- **Its own saves.** The desktop app keeps its saves apart from the
  browser's; Export and Import move a game between them.
- **Windows: where saves are kept.** The installed game keeps its saves and
  settings in `AppData\Roaming\Ultima V`. The portable `.exe` keeps them in
  an `Ultima V Data` folder beside itself, so the two move together (a
  portable copy that last ran from AppData brings its save along the first
  time). Where that folder can't be written, as on a read-only drive, it
  falls back to AppData.
- **macOS**: from 1.1.203 the app is signed and notarized by Apple. Earlier
  versions were not, and macOS refused their first launch until allowed in
  System Settings → Privacy & Security → Open Anyway.
- **The AppImage** has no version in its name, so an update replaces it in
  place and its path never changes. Move it if you like, then start it once
  from its new place: Steam's compatibility tool follows the file that was
  started.
- **The `.flatpak` file** on the Releases page is the same build for an
  offline install (`flatpak install --user <file>`), which never updates.
  Opened in Discover it installs system-wide instead, and asks for your
  password; the install link and `flatpak install --user` install it per
  user.

## The Android app

It runs full screen in landscape, with the status and navigation bars
hidden, again whenever they come back (on waking from sleep they may
flicker once). The Back button opens the Pause menu, as does sending the
app to the background, and the title menu has a Quit. Built-in controls
that Android reports as a gamepad switch the game to controller mode at the
first press. The APK is signed with a key kept in the repository, so a new
build installs over the old one and keeps your saved game. iOS has no app
on purpose: add the web game to the Home Screen instead.

## Finding the game files

The desktop app's Scan for game files... looks beside the app, in your
home folder, and where GOG and the Linux launchers install games, and it
finds Steam's copy of Ultima V by itself wherever Steam has installed it. The web game's Scan looks for a copy
put on the site beside it (see Hosting it yourself below). On Android,
Choose folder... opens the system's folder picker.

## Showcase saves

To jump straight to one of the game's sights - Britain, a frigate at sea,
the Underworld, Doom - import one of the
[showcase saves](../showcase/README.md) (Manage Saves → Import saved game).

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
