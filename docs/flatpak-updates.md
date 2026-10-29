# A Flatpak that updates itself

How the desktop app's Flatpak keeps itself up to date, written up as a
pattern for any Electron app shipped as a Flatpak, including the Ultima III
port. The code is
[`desktop/flatpakUpdates.cjs`](../desktop/flatpakUpdates.cjs) (about 120
lines), wired in by [`desktop/updates.cjs`](../desktop/updates.cjs).

## The problem

A Flatpak is normally updated from outside: GNOME Software, KDE Discover,
or `flatpak update`. On a Steam Deck that means Discover, which runs only
in Desktop Mode, so a player who stays in Game Mode, which is most of them,
never sees a release until they switch to the desktop to look. Other
builds of the game (the Windows installer, the AppImage) update themselves
with electron-updater, which can't replace a Flatpak's files.

## The answer: Flatpak's update portal

Flatpak gives every sandboxed app a D-Bus service for updating itself:
the update portal, `org.freedesktop.portal.Flatpak` at
`/org/freedesktop/portal/Flatpak`. This is not part of
xdg-desktop-portal: it is flatpak's own `flatpak-portal`, started on
demand. It works under Steam's Game Mode, and it needs no extra
permission. A Flatpak's filtered session bus always reaches
`org.freedesktop.portal.*`, so nothing changes in `finishArgs`, and there
is no sandbox escape.

With it, the app asks for its own newer commit to be pulled from the
remote it was installed from and deployed beside the running one. Flatpak
verifies it exactly as it would any update (here, the GPG-signed
repository the site serves; see `desktop/flatpak-repo.sh`). The running
copy carries on, and the next start is the new version.

### The calls

| Call | What it does |
|---|---|
| Property `version` | The portal's version. Update monitors arrived in version 4 (flatpak 1.6). Check before using them. |
| `CreateUpdateMonitor(a{sv} options) → o handle` | An `org.freedesktop.portal.Flatpak.UpdateMonitor` object for this app. |
| Signal `UpdateAvailable(a{sv})` | The portal noticed a newer commit on the remote. It checks on its own from time to time. |
| `UpdateMonitor.Update(s parent_window, a{sv} options)` | Pull and deploy it. Pass `''` and `{}`. Returns at once; progress comes as signals. |
| Signal `Progress(a{sv} info)` | `status` (uint): 0 running, 1 empty (nothing to do), 2 done, 3 error (`error`, `error_message`). Also `n_ops`, `op`, `progress`. |
| `Spawn(ay cwd, aay argv, a{uh} fds, a{ss} env, u flags, a{sv} options)` | With flag 2 (`FLATPAK_SPAWN_FLAGS_LATEST_VERSION`), starts the newest deployed version in a sandbox of its own: the restart. |

### The flow (`flatpakUpdates.cjs`)

1. A few seconds after the window is up, look at GitHub's newest release
   (the same check the other builds make).
2. Connect to the portal, check its version, and create an update
   monitor.
3. Call `Update` when `UpdateAvailable` arrives, or at once if GitHub
   already has a newer release; the portal's own check may be minutes away.
   Only one update at a time; nothing more once installed.
4. On `Progress`:
   - **2 (done):** tell the game. Its title screen says "Ultima V 1.1.165
     is installed. Restart to play it now", in the same box and menu line
     the other builds use (`web/src/ui/updates.ts`, `intro.ts`).
   - **1 (empty):** do nothing yet. The release is out but the repository
     doesn't have it, because the Pages deploy runs a few minutes after
     the release job. The portal's `UpdateAvailable` comes once it does.
   - **3 (error):** fall back (below).
5. Restart: `Spawn` the newest version with the app's own command, then
   quit. **Under Steam's Game Mode, only quit.** A process started outside
   Steam isn't shown in Game Mode, so the box says "Quit, and start the
   game again" and Steam's next launch runs the new version.

### The fallback

If the portal can't be had (no session bus, a flatpak older than 1.6) or
the update fails, the app tells the player about the release instead.
Outside Game Mode that's the release's page, as the macOS build does.
Under Game Mode it's only the way to update ("Update it in Desktop Mode,
from Discover"), since a browser there would leave the game behind.

## Gotchas

- **The signals are unicast.** The portal sends `UpdateAvailable` and
  `Progress` only to the connection that created the monitor, and
  `Update` is accepted only from that connection. So `gdbus call` and
  `gdbus monitor` in separate processes can't drive it; the D-Bus client
  has to live in the app. We use
  [`@particle/dbus-next`](https://www.npmjs.com/package/@particle/dbus-next),
  a maintained, pure-JavaScript fork of `dbus-next`. It needs no native
  module, so it doesn't complicate electron-builder's cross-platform
  builds, and it's only `require`d when the portal is actually used.
- **The command to spawn.** electron-builder's flatpak target runs the
  app as `electron-wrapper` (in `/app/bin`, which wraps `zypak-wrapper`
  around Electron), so that is the `argv` given to `Spawn`. Each `ay`
  argument is NUL-terminated.
- **Self-hosted repository, not Flathub.** Flathub builds and serves the
  updates itself, and any app installed from it updates the same way. The
  portal pulls from whatever remote the app came from: here the signed
  OSTree repository the Pages deploy builds from each release.
- **The release lags the repository.** The release job publishes first,
  and the Pages deploy builds the repository after. "Empty" from the
  portal in that window is expected, not an error.
- **The variants.** dbus-next hands `a{sv}` values back as
  `{ signature, value }`; `plain()` in `flatpakUpdates.cjs` unwraps them.

## Testing

The D-Bus side is injected, so the tests run anywhere:

- `web/tests/flatpakUpdates.test.ts` drives the flow with a fake portal
  (an update at once, the repository behind, Game Mode's quit, no portal,
  a failed update). It also checks the exact D-Bus calls against a fake
  bus: the version check, `CreateUpdateMonitor`, `Update`, and `Spawn`'s
  arguments.
- `web/tests/characters.test.ts` checks the title screen's wording for
  each offer.

What the tests can't show is the real portal. Check that on a Steam Deck:
install a release, publish a newer one, wait for the Pages deploy, and
start the game in Game Mode. The box should say the update is installed;
quit, and start the game again from the library.

## To use it elsewhere

1. Copy `flatpakUpdates.cjs` and add `@particle/dbus-next` as a
   dependency (listed in electron-builder's `files` so it's packaged).
2. Detect the Flatpak (`FLATPAK_ID` set, or `container=flatpak`) and run
   `connect()`, then `watch({ portal, newer, installed, failed })` a few
   seconds after start.
3. Say "installed, restart to play it" in your own UI. Restart with
   `spawnLatest()` then quit, or just quit under gamescope
   (`GAMESCOPE_WAYLAND_DISPLAY` set).
4. Keep a fallback notice for when `connect()` returns null or the update
   fails.
5. Change `COMMAND` if your Flatpak's command isn't electron-builder's
   `electron-wrapper`.
