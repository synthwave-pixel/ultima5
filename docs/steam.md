# Steam

The desktop app works with Steam in two ways:

- **You own [Ultima V on Steam](https://store.steampowered.com/app/3067520/)**:
  Steam's Play button can start this engine instead of the 1988 DOS game,
  using Steam's copy of the game files, with your saves in Steam Cloud. This
  is a beta, off until you turn it on in the title screen's Steam (beta)
  menu.
- **Your copy is from GOG or elsewhere**: add the app to Steam as a
  Non-Steam game, to play it from your library and in a Steam Deck's Game
  Mode.

The web game and the Android app have no Steam support.

## At a glance

| System | Build | Play from Steam | Cloud saves |
| --- | --- | --- | --- |
| Windows | Installer | Paste the launch line the app gives you into Steam's Launch Options | Yes, reaching a Mac too (see macOS Sync below) |
| Windows | Portable `.exe` | Not available (no fixed place for Steam to start) | - |
| macOS | App in Applications | The app adds a Mac launch to Steam's settings, closing Steam to do it | Yes |
| SteamOS and Linux | AppImage | The compatibility tool, Ultima V SP, chosen in Steam's Compatibility settings | Yes, reaching a Mac too (see macOS Sync below) |
| SteamOS and Linux | Flatpak | Works, but the AppImage is recommended: it reaches SD-card libraries, and its saves reach a Mac | Yes, but saves made here don't reach a Mac |

## macOS Sync

Steam only sends a game's Cloud saves to the systems its cloud rules name,
and EA's rules for Ultima V name Windows alone. On Windows and Linux (where
Steam runs the game as its Windows version), saves uploaded without a fix
never reach a Mac. A Mac's own Play from Steam fixes its own rules, so a
Mac's saves reach every system.

**macOS Sync** (Steam (beta) menu) checks this. It is on by default, and
takes effect once Play from Steam is on. With it on, the app looks at two
things each time:

- **Steam's settings for Ultima V on this computer:** do the cloud rules
  include macOS? If Steam's settings can't be read, it says so instead of
  assuming all is well.
- **What Steam actually did:** how many of your Cloud saves Steam sent to
  Windows alone. On a Mac, it counts the saves made elsewhere that can't
  reach it.

While something is wrong, the title says so **every time you play**, and
offers **Fix now** where the fix can be made. The Steam (beta) menu shows
**Fix Cloud for Mac** under macOS Sync. The fix:

- adds macOS to Steam's cloud rules for Ultima V. Steam has to be closed for
  that, so it only works with the app started outside Steam (on a Steam
  Deck, in Desktop Mode); the app asks first, then closes and reopens Steam.
  The Flatpak can't close Steam: use the AppImage.
- marks the saves Steam already sent to Windows alone so that Steam uploads
  them again, for a Mac too, when Ultima V next closes in Steam. Where the
  rules already include macOS, this is all the fix does, and it works
  anywhere, Game Mode included.

Steam may undo the rules change when it refreshes Ultima V's details; the
app puts it back the next time it starts outside Steam with Steam closed,
and warns until then. Turn macOS Sync off to stop the checks and warnings.
Copy report shows what it found.

## As a Non-Steam game

1. Install the app (see [Installation](../README.md#installation)).
2. In Steam: Add a Game → Add a Non-Steam Game, tick Ultima V (or Browse
   to it) and choose Add Selected Programs.
3. On a Steam Deck, if the controls don't respond, open the shortcut's
   controller settings and pick a Gamepad template.

The first time you play it from Steam, the game gives its library entry its
own artwork (cover, banner and logo), which Steam shows the next time it
starts. Artwork you set yourself is never replaced; when an update brings
new artwork, only the pictures the game put there are updated. Started by
Steam, the app always starts full screen, and switches to controller mode
at the first press. In Game Mode it also turns off GPU acceleration, which
has hung other Electron apps under gamescope.

## Play from Steam

If you own Ultima V on Steam, the desktop app can be what Steam's Play
starts, in place of the 1988 DOS game. This is a beta: it lives in the
title screen's **Steam (beta)** entry (desktop builds only; the web and
Android have none). Play from Steam is **off until you turn it on**, and
until it is on the app writes nothing for Ultima V in Steam's folders and keeps
its saves in its own store. Cloud Saves comes on by itself the first time Steam
starts the game (see Cloud saves below). Turning an option off undoes it.

The menu always shows the same seven lines: Back, **Play from Steam**,
**Cloud Saves**, **macOS Sync**, **Copy report**, **Report an issue** and
**Paths**, with **Fix Cloud for Mac** under macOS Sync while there is
something to fix (see [macOS Sync](#macos-sync)). The
note at the foot says what the line under the bar does and, for an option
that is on, how it stands. A line that can't be used here is greyed (the
bar still rests on it, and its note says why). **Paths** shows where the app
found Steam, Ultima V and its Steam saves, and this copy's launch line; they
are shown only when you choose it. On a Mac, Play from Steam is the option
itself. On Windows it opens its own menu, Launch line and Copy launch line;
on Linux, Compat. tool (and on the Flatpak, Get the AppImage).

While a Play from Steam option is on, the title screen expects the game to
be started from Steam: run outside Steam, it shows **Launch From Steam**,
greyed, in place of Journey Onward, Create New Character and Settings, so
there is one place to play from. Manage Saves and Steam (beta) stay, so the
option can be turned off there. Cloud saves alone does not change the title.

The options differ by system:

| System | Option | On | Off |
| --- | --- | --- | --- |
| Windows | Play from Steam → Launch line | Shows the launch line to copy | Tells you to clear the line in Steam |
| Linux | Play from Steam → Launch line, kept from 1.1.196–1.1.198 | No longer offered | Tells you to clear the line in Steam |
| Linux | Play from Steam → Compat. tool | Installs the compatibility tool, Ultima V SP | Removes it |
| macOS | Play from Steam | Warns that it closes Steam and asks you to confirm, then edits Steam's settings | Asks to quit Steam if it is running, then puts Steam's settings back |
| All | Cloud Saves | Copies this computer's saves into Steam's folder | Copies Steam's saves back |

- **Windows**: Play from Steam edits none of Steam's files (only macOS
  Sync's fix does, when you choose it), and Steam must have
  installed Ultima V first. In Play from Steam, turn Launch line on and choose Copy launch
  line, then in Steam open Ultima V → ⚙ → Properties → Launch Options and
  paste. This needs the installed app: the portable `.exe` has no fixed
  place for Steam to point at, so it has no line.
- **Linux and SteamOS**: the AppImage is the build to use (see [The AppImage](#the-appimage-for-steam-on-linux-and-the-deck)); the
  Flatpak works less well with Steam, and its Steam (beta) menu says so and
  links the AppImage's download. Compat. tool installs a compatibility tool
  named Ultima V SP. Restart Steam, then in Ultima V → ⚙ → Properties →
  Compatibility, choose it, and leave Launch Options empty: Steam downloads
  the game if it has not yet, and Play starts this engine, in Desktop Mode
  and in a Steam Deck's Game Mode. The tool runs the engine as Steam's own
  launch of the game, which is how Game Mode knows its window is the game's,
  and starts it without Steam's runtime libraries and overlay, which hung
  and crashed it. Each start of the app brings the tool up to date. Linux
  has no launch line any more: pasted into Launch Options, it ran the engine
  outside Steam's launch, and Game Mode never showed its window. A line
  turned on in 1.1.196–1.1.198 is still listed, to be turned off; clear
  Launch Options in Steam too.

  Steam marks each Cloud save it uploads with the systems it may go to, from
  the game's cloud rules, and EA's rules for Ultima V name Windows alone. On
  Linux, Steam runs the game as its Windows version, so without a change,
  saves uploaded from here never reach a Mac. From 1.1.205, Compat. tool also
  adds macOS to those rules in Steam's own settings. Steam must be closed for
  that, so the app asks first, closes Steam and opens it again, which also
  makes Steam see the tool. Saves already uploaded from here are changed
  slightly, without changing what they hold, so that Steam sends them again
  marked for a Mac too.

  With the tool already on from an earlier version, or if Steam undoes the
  change, macOS Sync warns and offers Fix Cloud for Mac (see
  [macOS Sync](#macos-sync)).

  On a Steam Deck, Steam's own controller layout for Ultima V is keyboard
  and mouse, made for the DOS game, and the buttons then do nothing here:
  press the Steam button, open the controller settings and choose the
  Gamepad template, once. The game says so the first time Steam starts it
  on a Deck, until a gamepad has reached it.

  Steam installed as a Flatpak
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
the Windows launch line. The app says which edition it is itself:
the window title and the title screen show **Ultima V SP** and its version,
and Settings ends with the same, greyed. The Mac launch entry and the Linux
compatibility tool are named Ultima V SP in Steam.

**Checking the launch line.** Where Play uses a pasted line (Windows), the
menu reads back what Steam has saved for Ultima V
(it only ever reads that file) and, in the option's note, says one of: found and right; missing;
out of date (it starts an engine somewhere else, such as an older AppImage
name or a moved app); pasted twice; or not seen yet. Steam writes the line
when it closes, so one pasted moments ago may not be there yet, and the menu
says "not seen yet" rather than "wrong". Each comes with what to do, and
Copy launch line. In a game Steam started, the line is known to work.

**Cloud saves.** It comes on by itself at the title the first time Steam
starts the game for a Steam account, on a computer first set up for Steam with 1.1.203 or
later: this computer's saves are copied into Steam's folder, and a box says
so. Where a character was played both here and in Steam apart, the box
offers it instead: Turn on keeps the newer save of each as the last save and
the other as an earlier save, so nothing is lost; Leave off copies nothing.
Turned off, here or in the menu, it stays off. A computer set up before
then keeps Cloud saves as it was. The option can be switched only in a game Steam
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
quietly, it reaches libraries on an SD card, and the compatibility tool
points straight at its file, which keeps one name and place across updates. The Flatpak stays the easy store install for those who
prefer it. Against the AppImage: you download it in Desktop Mode, mark it
executable and add it to the application menu by hand.

Download
[`ultima5-sp-x86_64.AppImage`](https://github.com/synthwave-pixel/ultima5/releases/latest/download/ultima5-sp-x86_64.AppImage)
(this link always gives the newest), save it somewhere permanent, such as
`~/Applications`, and make it executable (right-click → Properties →
Permissions → Is executable, or `chmod +x`). Run it, open Steam (beta) on
the title screen and turn on Play from Steam → Compat. tool. Move the file
afterwards and start it once from its new place: each start points the tool
at the file that was started.

The file has no version in its name, so an update replaces it in place and
its path never changes. If you already use the AppImage under its old,
versioned name, your next update brings the new name by itself (the old file
is removed); after that every update overwrites it in place, and the
compatibility tool follows it.
