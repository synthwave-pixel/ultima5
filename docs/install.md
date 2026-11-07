# Installing Ultima V

Every build asks, the first time, for your own copy of the game: its
folder, its files or a `.zip` (from GOG's
[Ultima 4+5+6](https://www.gog.com/en/game/ultima_456), which the
installer links to, or the Internet Archive). The files stay on your device. The desktop app's Scan for game files... finds the
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
     password that first time. Updates also arrive in Discover with every
     other Flatpak's, with no prompt.
  4. Start Ultima V once, still in Desktop Mode (Discover's Launch
     button, or the application menu). Flatpak asks "Update Ultima V?";
     choose Update. That lets the game update itself from then on, Game
     Mode included, where the question can't be asked. You can quit
     straight away.
  5. Open Steam, still in Desktop Mode. Click Add a Game at the bottom
     left, then Add a Non-Steam Game, tick Ultima V in the list, and click
     Add Selected Programs.
  6. Return to Game Mode with the icon on the desktop, or restart. The
     game is in your library under Non-Steam. If the controls do not
     respond, open the shortcut's controller settings and pick a Gamepad
     template.
  7. The first time you play it from Steam, the game gives its library
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
- **Linux without Flatpak**: the AppImage, `ultima5-sp-x86_64.AppImage`, from
  the [Releases page](https://github.com/synthwave-pixel/ultima5/releases/latest/download/ultima5-sp-x86_64.AppImage).
  It is also the build to use for Steam; see Steam's Ultima V below.

## Steam's Ultima V

If you own Ultima V on Steam, the desktop app can be what Steam's Play
starts, in place of the 1988 DOS game. This is a beta: it lives in the
title screen's **Steam (beta)** entry (desktop builds only; the web and
Android have none), and every option in it is **off until you turn it on**.
With all of them off the app writes nothing for Ultima V in Steam's folders and keeps
its saves in its own store. Turning an option off undoes it.

The menu always shows the same six lines: Back, **Play from Steam**,
**Cloud Saves**, **Copy report**, **Report an issue** and **Paths**. The
note at the foot says what the line under the bar does and, for an option
that is on, how it stands. A line that can't be used here is greyed (the
bar still rests on it, and its note says why). **Paths** shows where the app
found Steam, Ultima V and its Steam saves, and this copy's launch line; they
are shown only when you choose it. On a Mac, Play from Steam is the option
itself. On Windows and Linux it opens its own menu: Launch line, Copy launch
line and, on Linux, Compat. tool (and on the Flatpak, Get the AppImage).

While a Play from Steam option is on, the title screen expects the game to
be started from Steam: run outside Steam, it shows **Launch From Steam**,
greyed, in place of Journey Onward, Create New Character and Settings, so
there is one place to play from. Manage Saves and Steam (beta) stay, so the
option can be turned off there. Cloud saves alone does not change the title.

The options differ by system:

| System | Option | On | Off |
| --- | --- | --- | --- |
| Windows | Play from Steam → Launch line | Shows the launch line to copy | Tells you to clear the line in Steam |
| Linux | Play from Steam → Launch line | Shows the launch line to copy | Tells you to clear the line in Steam |
| Linux | Play from Steam → Compat. tool | Installs the compatibility tool, Ultima V SP | Removes it |
| macOS | Play from Steam | Warns that it closes Steam and asks you to confirm, then edits Steam's settings | Asks to quit Steam if it is running, then puts Steam's settings back |
| All | Cloud Saves | Copies this computer's saves into Steam's folder | Copies Steam's saves back |

- **Windows**: Steam's files are never edited, and Steam must have
  installed Ultima V first. In Play from Steam, turn Launch line on and choose Copy launch
  line, then in Steam open Ultima V → ⚙ → Properties → Launch Options and
  paste. This needs the installed app: the portable `.exe` has no fixed
  place for Steam to point at, so it has no line.
- **Linux and SteamOS**: the AppImage is the build to use (see below); the
  Flatpak works less well with Steam, and its Steam (beta) menu says so and
  links the AppImage's download. The two options are separate on purpose,
  since which works best on a Deck is what the beta is finding out: either,
  both or neither may be on. Compat. tool installs a compatibility tool
  named Ultima V SP. Restart Steam, then in Ultima V → ⚙ → Properties →
  Compatibility, choose it: Steam downloads the game if it has not yet, and
  Play starts this engine. Launch line is the other way: copy the line and
  paste it as on Windows. If both are on, Steam runs the launch line and the
  tool goes unused, and the tool's note says so. Steam installed as a Flatpak
  cannot run the game's Flatpak until it is allowed to, with one line in a
  terminal, after which Steam needs a restart:

      flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam

- **macOS**: Steam has no Mac launch for Ultima V, so Play from Steam gives
  it one. The app must be in Applications and opened from there: it refuses
  a copy still in Downloads, or a development run. Before it does anything
  it warns that it closes Steam and changes Steam's own settings for Ultima
  V, that Steam may undo the change when EA updates the game (the app puts
  it back), and that turning the option off puts Steam's settings back as
  they were; nothing happens unless you confirm, and confirming lets it
  close Steam. Turning it off edits Steam's files too, so if Steam is
  running the app asks to quit it first. In a game Steam started it can't
  be turned off (quitting Steam would end the game): quit, and turn it off
  from outside Steam. Steam then downloads the game if it has not yet, and
  Play starts this engine. If Play ever says "Invalid
  platform", Steam has refreshed Ultima V's settings: open the app once
  with Steam closed (or let it quit Steam) and it puts them back. EA seldom
  updates Ultima V, so this is rarely needed.

Steam names the game "Ultima V" wherever the app cannot rename it, which is
the Windows and Linux launch line. The app says which edition it is itself:
the window title and the title screen show **Ultima V SP** and its version,
and Settings ends with the same, greyed. The Mac launch entry and the Linux
compatibility tool are named Ultima V SP in Steam.

**Checking the launch line.** Where Play uses a pasted line (Windows, and
Linux's Launch line), the menu reads back what Steam has saved for Ultima V
(it only ever reads that file) and, in the option's note, says one of: found and right; missing;
out of date (it starts an engine somewhere else, such as an older AppImage
name or a moved app); pasted twice; or not seen yet. Steam writes the line
when it closes, so one pasted moments ago may not be there yet, and the menu
says "not seen yet" rather than "wrong". Each comes with what to do, and
Copy launch line. In a game Steam started, the line is known to work.

**Cloud saves.** The option can be switched only in a game Steam
started (Steam's folder is known only then), with Ultima V's folder present and
the Steam account known; on a Mac it is turned on only with Play from
Steam on, but can always be turned off. Turning it
on copies this computer's saves into Steam's folder
(`ultima5-sp/<your Steam account id>/` inside the game's folder, each save a
subfolder holding one `SAVED.GAM`), and saves made in a Steam launch then stay
with Steam, which syncs them with Steam Cloud. Turning it off copies them
back. If a character was played here and in Steam apart, the app shows both
versions and asks which to keep; Cancel leaves everything as it was, and
if any copy fails the option stays as it was. The option is kept per Steam
account; the other options are kept per machine. Export and Import carry a
game between Steam and other launches while the option is on. If a game
Steam started can't tell which account is playing while Cloud saves is on
for one, or Steam's folder can't be read or written, the app uses this
computer's saves for that launch and says so (the menu shows Cloud saves
as Unknown where the account isn't known). Turning a Play option off while
Cloud saves is on asks first: saves made from Steam stay with Steam until
Cloud saves is turned off from a game Steam started.

Testers: the menu ends with **Copy report**, a plain-text report of what was
found (system, build, Steam, the game, the launch line, the options) to
paste into an issue, and **Report an issue**, which opens
[the issues page](https://github.com/synthwave-pixel/ultima5/issues) in your
browser.

The game is played from its folder in Steam, wherever its library is: a
second drive or an external disk (an SD card too, with the AppImage; the
Flatpak does not reach SD-card libraries yet,
[#16](https://github.com/synthwave-pixel/ultima5/issues/16)). Only one copy
runs at a time, so starting one while another is open says which is open and
quits. A Steam launch never restarts itself into an update: the Windows
installer's copy and the AppImage download it in the background and install
it when the game quits; the Flatpak installs it through Flatpak's update
service, and you start the new version from Steam again; the other builds
say a newer release is out.

### The AppImage, for Steam on Linux and the Deck

For Steam on a Steam Deck or any Linux, use the AppImage. It updates itself
quietly, it reaches libraries on an SD card, and the launch line and
compatibility tool point straight at its file, which keeps one name and
place across updates. The Flatpak stays the easy store install for those who
prefer it. Against the AppImage: you download it in Desktop Mode, mark it
executable and add it to the application menu by hand.

Download
[`ultima5-sp-x86_64.AppImage`](https://github.com/synthwave-pixel/ultima5/releases/latest/download/ultima5-sp-x86_64.AppImage)
(this link always gives the newest), save it somewhere permanent, such as
`~/Applications`, and make it executable (right-click → Properties →
Permissions → Is executable, or `chmod +x`). Run it, open Steam (beta) on
the title screen and turn on a Play option. Move the file afterwards and a
launch line or tool pointing at it goes stale.

The file has no version in its name, so an update replaces it in place and
its path never changes. If you already use the AppImage under its old,
versioned name, your next update brings the new name by itself (the old file
is removed); after that every update overwrites it in place. A launch line
that names the old file is then out of date: the menu says so, and Copy
launch line gives the new one.

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

**Updates.** As soon as it starts, the app looks for a newer
release on the Releases page, and says so in the game itself: a box over
the title screen, once for each version, and an Update line in the title
menu (Update (1.1.44)) until it is taken. Installed with the Windows
installer, or run as the AppImage, it downloads the new version in the
background and installs it when you quit the game (or at once, with
Restart now). On macOS, and as the Windows portable `.exe`, it offers the
release's page instead - to read what changed and download it yourself:
macOS installs updates only into apps signed by an Apple developer, which
this one is not yet ([#1](https://github.com/synthwave-pixel/ultima5/issues/1)). The Android app does the same,
opening the release's page in your browser; Obtainium can update it for
you instead. The Flatpak updates itself through Flatpak's own update
service, so a Steam Deck kept in Game Mode stays up to date without a trip
to Discover: the new version is installed in the background, the title
screen says so (in play, a line in the message log), and Restart now plays
it (under Game Mode, Quit now, and start the game again from your library).
Quitting while one is still coming down waits for it to finish, a minute at
most, and the first start of a new version says what is new in it. Flatpak
asks once whether the game may update itself, and can ask only at the
desktop, so start the game once in Desktop Mode after installing and
choose Update. If you chose Deny, allow it again from Konsole with
`flatpak permission-set flatpak updates com.synthwavepixel.ultima5 yes`.
Where that service can't be had, it tells you of the release instead, and
Discover updates it with every other Flatpak's
([how it works](flatpak-updates.md)).
`--no-update-check` on the command line turns the check off; under
Steam's Game Mode no page is offered, and a downloaded update is
installed when the game quits.

- **Windows**: an installer and a portable `.exe`. Both are unsigned, so
  SmartScreen asks once; choose More info, then Run anyway. The installed
  game keeps its save and settings in `AppData\Roaming\Ultima V`; the
  portable `.exe` keeps them in an `Ultima V Data` folder beside itself,
  so the two move together (a portable copy that last ran from AppData
  brings its save along the first time). Where that folder cannot be
  written, as on a read-only drive, it falls back to AppData.
- **macOS**: an Apple Silicon `.dmg`, for macOS 13 (Ventura) or later
  (Intel Macs: use the web version). Signed by no Apple developer, so the first launch is refused. Try to open the app
  once, then open System Settings, choose Privacy & Security, scroll down
  to Security, click Open Anyway beside Ultima V, and confirm with your
  password or Touch ID; it opens normally from then on. Or, in Terminal,
  once: `xattr -dr com.apple.quarantine "/Applications/Ultima V.app"`.
  If the game's sound plays through a device that is also a microphone (a
  USB microphone with a headphone jack, a headset), macOS may ask whether
  Ultima V may use the microphone when the sound first starts. The game
  never uses it: choose Don't Allow, and the sound plays on.
- **Linux and SteamOS**: the Flatpak repository, installed as above, is
  the way on a Steam Deck and on any Linux with Flatpak: one click or one
  line, and the game then updates itself, Game Mode included (Discover
  updates it too, with every other Flatpak's). Add the game to
  Steam from the Non-Steam Game list, and in the shortcut's controller
  settings pick a Gamepad template. The first launch from that shortcut
  puts the game's artwork in Steam's library folder for it (never over
  artwork already there), which Steam shows once it restarts. The app sees the controller as a
  gamepad and switches to controller mode on the first press, and always
  starts full screen when Steam launches it. In Game Mode it also turns off GPU
  acceleration and the browser sandbox, which have hung other Electron
  apps under gamescope. The `.flatpak` bundle on the Releases page is the
  same build for an offline install (`flatpak install --user <file>`,
  which then never updates). The AppImage
  (`ultima5-sp-x86_64.AppImage`) suits a Linux without Flatpak, and is the
  build to recommend for playing through Steam, on a Deck too (see Steam's
  Ultima V above): make it executable and run it.

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
