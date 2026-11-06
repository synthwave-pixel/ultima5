# Steam's Ultima V with this engine: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pressing Play on Steam's Ultima V (app 3067520) starts this engine on Linux and SteamOS, Windows and macOS,
reading the game from Steam's install and keeping its saves where Steam Cloud syncs them.

**Architecture:** the Electron main process gains small CommonJS modules:
- Steam discovery: `steam.cjs`.
- The binary cache editor: `appinfo.cjs`.
- Per-system setup: `steamSetup.cjs`.
- The save files: `steamSaves.cjs`.

The page reaches them only through new `u5native.steam` calls in `preload.cjs`. In the page, every save, character
and per-character settings key goes through one storage seam (`keyStore.ts`). It is `localStorage` normally, and a
file-backed store in a Steam launch. Boot reads the game files from Steam's folder in a Steam launch, and Settings
gains a Steam line.

**Tech stack:** Electron (CommonJS, `desktop/*.cjs` with `.d.cts` types), TypeScript game in `web/`, vitest tests in
`web/tests` (desktop modules are tested from there, as `desktopScan.test.ts` and `steamArt.test.ts` do), GitHub
Actions (`.github/workflows/desktop.yml`, `pages.yml`).

**Spec:** `docs/superpowers/specs/2026-11-05-steam-release-design.md`. Read it first; this plan argues from it.

## Global constraints

- Steam app id **3067520**; `installdir` **`Ultima V`**; Steam's own launch entry `DOSBOX\Ultima V.exe`.
- A Steam launch is one where the environment's `SteamAppId` or `SteamGameId` is `3067520`. Nothing else counts.
- Saves in a Steam launch: `<game folder>/Ultima V Engine/<Steam account id>/<key folder>/SAVED.GAM`. Every file is
  named exactly `SAVED.GAM` (EA's cloud rule). EA's own `<game folder>/SAVED.GAM` and `PARTY.SAV` are never read or
  written.
- A Steam launch uses Steam saves only; any other launch uses the app's own saves only. A character's whole settings
  block (`ultima5.char.<id>.settings`) travels with their saves. Only `ultima5.settings` (the no-character fallback)
  and other non-character keys stay per machine.
- Names: the compatibility tool is shown as **`Ultima V (new engine)`**, with internal name
  `ultima5_engine`. The Mac launch entry's description is **`Ultima V (new engine)`**. The launcher bundle is
  **`Ultima V Engine.app`**.
- Steam's files (`appinfo.vdf`, `appmanifest_*.acf`) are edited only while Steam is not running.
  `localconfig.vdf` is never edited.
- `steamArt.cjs` keeps doing nothing for a real app id. No Steamworks library. No Android changes.
- The Flatpak id is `com.synthwavepixel.ultima5`. Flatpak Steam is `com.valvesoftware.Steam`.
- Checks, run in `web/`: `npx tsc --noEmit -p .`, `npx eslint src tests`, `npx prettier --check src tests`,
  `npx vitest run`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `outputs/`. Push or
  release only when the user asks. Release notes go on the GitHub release, never in a README section.
- Code comments follow the repo's voice: plain sentences about what the code is for, as in `steamArt.cjs`.

## Review focus

1. **Paths with spaces and odd characters:** `~/Library/Application Support/Steam`,
   `C:\Program Files (x86)\Steam`, an account name with a space. Launch lines and generated scripts must quote
   every path, and a test feeds each one a path with spaces and a `'` (Tasks 7, 8).
2. **The game on another drive:** an external disk, an SD card under `/run/media`, or a second Windows drive, found
   only through `libraryfolders.vdf`. With the manifest present but the folder missing, the result says which
   library was expected, not a generic failure (Tasks 3, 6).
3. **Re-applying the Mac edit:** applying twice must not add a second launch entry or a second `MacOS` platform.
   After Steam has replaced the entry with a newer one, re-applying must start from that newer entry, not the kept
   original (Task 4).
4. **A save that can't be written** (read-only SD card, full disk): it must fail the way `localStorage` quota
   failure does, so `storage.ts`'s existing "not kept" path reports it. Writes are synchronous for this reason
   (Task 5).
5. **Account detection when `SteamUser` is absent or unknown:** fall back to `loginusers.vdf`'s `MostRecent`. If
   neither gives an account, the Steam launch says so and uses no saves, rather than mixing accounts (Tasks 3, 6).

---

### Task 1: Pre-release builds

Testers need builds without auto-updates reaching anyone.

**Files:**
- Modify: `.github/workflows/desktop.yml` (inputs at lines 26-36; release job at 168-195)
- Modify: `desktop/updates.cjs`, wherever electron-updater's `autoUpdater` is set up
- Test: `web/tests/desktopUpdates.test.ts`

**Interfaces:**
- Produces: a manual-run input `prerelease` (boolean, default false). With it on, `gh release create` gets
  `--prerelease` and the job does not run `gh workflow run pages.yml`.

- [ ] **Step 1:** Write a failing test in `desktopUpdates.test.ts`:
  `it('never offers a pre-release: electron-updater is told so')`. It asserts that `autoUpdater.allowPrerelease` is
  set to `false` when updates start. Follow the file's existing way of stubbing `electron-updater`.
- [ ] **Step 2:** Run `npx vitest run tests/desktopUpdates.test.ts`. Expected: FAIL.
- [ ] **Step 3:** In `updates.cjs`, set `autoUpdater.allowPrerelease = false` explicitly, beside its other setup.
  `LATEST_API` (`releases/latest`) already skips pre-releases.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** In `desktop.yml`:
  - add the input `prerelease` ("Publish as a pre-release, for testers: nothing updates to it, the site is not
    deployed").
  - in the release step, add `--prerelease` to `gh release create` when `inputs.prerelease` is true.
  - make the "start the Pages deploy" step `if: ${{ !inputs.prerelease }}`.
  - update the header comment to describe pre-releases.
  - In `pages.yml`, confirm the Flatpak step's `gh release view` (no tag) resolves the latest full release, which
    skips pre-releases. Note it in that step's comment.
- [ ] **Step 6:** Run the full checks, then commit: "Pre-release builds for testers: published, never updated to,
  the site left alone".
- [ ] **Step 7 (needs the user's go-ahead to push):** start a manual run with `prerelease` on. Confirm:
  - the release page shows Pre-release;
  - no Pages run starts;
  - `gh api repos/synthwave-pixel/ultima5/releases/latest` still names the last full release.

### Task 2: Real-machine tests of the untested routes (throwaway)

This decides the Linux and Windows routes before app code depends on them. It needs the user's Deck and a Windows
machine. Prepare everything, then ask the user to run it.

**Files:**
- Create (throwaway, in the session scratch folder, not the repo):
  - `spike/compat/compatibilitytool.vdf`
  - `spike/compat/toolmanifest.vdf`
  - `spike/compat/launch.sh`
  - a one-page checklist
- Modify: `docs/superpowers/specs/2026-11-05-steam-release-design.md` ("Background: what was tested") with the
  results.

- [ ] **Step 1:** Write the spike compatibility tool:
  - `compatibilitytool.vdf`: `compat_tools/ultima5_engine` with `install_path "."`, `display_name`, `from_oslist
    "windows"`, `to_oslist "linux"`.
  - `toolmanifest.vdf`: `version "2"`, `commandline "/launch.sh %verb%"`.
  - `launch.sh`:
    - appends `$0 $*`, `pwd` and every `Steam*` variable to `~/u5-spike.log`;
    - on verbs `waitforexitandrun` and `run`, runs `flatpak run com.synthwavepixel.ultima5`;
    - on other verbs, exits 0.
- [ ] **Step 2:** Write the checklist for the user. Steps:
  - Copy the folder to `~/.steam/root/compatibilitytools.d/ultima5_engine/` on the Deck, restart Steam, and choose
    the tool under Ultima V → Properties → Compatibility. Does the Windows depot download?
  - Press Play in Desktop Mode and in Game Mode. Did the app start, and what did the log record?
  - Put a test `Ultima V Engine/test/SAVED.GAM` in the game folder, quit, and check Steam's `cloud_log.txt` for an
    upload.
  - Repeat with Proton chosen instead, plus the launch line `flatpak run com.synthwavepixel.ultima5 %command%`.
  - On Windows: install the game normally, set the launch line `"<installed Ultima V.exe>" %command%`, press Play,
    and check `cloud_log.txt` for a test save.
- [ ] **Step 3:** Record the results in the spec's Background section. Where a route failed, mark its fallback as
  the route in the spec's "When an untested route fails". Commit: "Spec: what the Deck and Windows tests showed".
- [ ] **Gate:** Tasks 7 and 8 follow what this task found. If the compatibility tool failed, Task 8's Linux setup is
  the launch line only.

### Task 3: Finding Steam and the game (`steam.cjs`)

**Files:**
- Create: `desktop/steam.cjs`, `desktop/steam.d.cts`
- Test: `web/tests/steamFind.test.ts`

**Interfaces:**
- Produces, all pure, with filesystem reads injected as `read(path): string | null` and `exists(path): boolean`:
  - `APP_ID = '3067520'`.
  - `isSteamLaunch(env: Record<string, string | undefined>): boolean`.
  - `parseVdf(text: string): Record<string, unknown>`: text KeyValues; nested objects, string values, keys
    case-sensitive; unescapes `\\` and `\"`.
  - `steamRoots({ platform, home, env, registrySteamPath }): string[]`. Candidates in order:
    - darwin: `~/Library/Application Support/Steam`.
    - linux: `~/.steam/root`, `~/.local/share/Steam`, `~/.var/app/com.valvesoftware.Steam/data/Steam`.
    - win32: `registrySteamPath` (from `HKCU\Software\Valve\Steam\SteamPath`, read by the caller), then
      `C:\Program Files (x86)\Steam`.
  - `libraryPaths(root, read): string[]`: `root`, plus each `path` in `steamapps/libraryfolders.vdf`, deduplicated.
  - `findGame(roots, read, exists): { library: string; folder: string } | { missing: string } | null`:
    - the first library holding `steamapps/appmanifest_3067520.acf` gives `folder` = `<library>/steamapps/common/` +
      the manifest's `installdir`;
    - `{ missing: library }` when the manifest is there but the folder is not;
    - null when no library has the manifest.
  - `accountId(root, env, read): string | null`: the 32-bit account id as a decimal string. It is the low 32 bits of
    the 64-bit SteamID key in `config/loginusers.vdf`:
    - the user whose `AccountName` equals `env.SteamUser`;
    - otherwise the one with `MostRecent` `"1"`;
    - otherwise null.

- [ ] **Step 1:** Write failing tests:
  - `isSteamLaunch`: true for `{SteamAppId:'3067520'}` and for `{SteamGameId:'3067520'}`. False for `{}`, for
    `{SteamAppId:'22320'}`, and for a non-Steam shortcut id `{SteamGameId:'12345678901234567890'}`.
  - `parseVdf`: parses the Mac test's `libraryfolders.vdf`, two libraries, the second `/Volumes/Endurance/SteamLibrary`.
    Unescapes `"C:\\\\Program Files (x86)\\\\Steam"` to `C:\Program Files (x86)\Steam`.
  - `findGame`: game in the second library; `{ missing }` when the folder is absent; null with no manifest.
  - `accountId`: `SteamUser=wiverson` with SteamID `76561197992819951` gives `32554223`. Unknown user falls back to
    `MostRecent`. Neither gives null.
  - `steamRoots` gives the paths above for each platform.
- [ ] **Step 2:** Run `npx vitest run tests/steamFind.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `desktop/steam.cjs` and `steam.d.cts` with the signatures above. Use BigInt for the
  account id.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the full checks.
- [ ] **Step 5:** Commit: "Steam's libraries, Ultima V's folder and the account that launched it".

### Task 4: Steam's app cache on a Mac (`appinfo.cjs`)

**Files:**
- Create: `desktop/appinfo.cjs`, `desktop/appinfo.d.cts`
- Test: `web/tests/appinfo.test.ts`

**Interfaces:**
- Produces:
  - `readAppinfo(buf: Buffer): Appinfo`, handling magic `0x07564428` (v28) and `0x07564429` (v29).
  - `appEntry(info, appid: number): { header: Buffer; kv: KvNode[] } | null`. `KvNode = [type: number, key: string,
    value]`.
  - `writeAppinfo(info, appid, header, kv): Buffer`. It recomputes the entry's binary SHA-1 (header bytes 40-60) as
    SHA-1 of the encoded block. Other apps keep their bytes. v29 keys are appended to the string table, never
    reindexed.
  - `macPatch(kv, launcherName: string): { kv: KvNode[]; changed: boolean }`:
    - adds `macos` to `appinfo/common/oslist`;
    - gives every launch entry without a `config` the config `oslist windows`;
    - appends a launch entry `{ description: 'Ultima V (new engine)', executable: launcherName, type: 'default',
      config: { oslist: 'macos' } }` unless an entry with that executable exists;
    - adds `MacOS` to each `ufs/savefiles/*/platforms` lacking it.
  - `isMacPatched(kv, launcherName): boolean`.
- The test tool `appinfo_mac.py` from the Mac test (session scratch folder, `tools/`) is the reference for the byte
  layout. Read it; don't port Neutron's code.

- [ ] **Step 1:** Write failing tests against a synthetic file built in the test: v29 with two apps (3067520 with the
  real launch and ufs shape from the spec's Background, and one other app), plus a v28 variant.
  - Round trip: `writeAppinfo` of an unchanged entry equals the input bytes exactly.
  - After `macPatch` and write:
    - re-reading gives `oslist` `windows,macos`;
    - the DOSBox entry has `config/oslist windows`;
    - there is one entry with executable `Ultima V Engine.app`;
    - both savefiles rules list `MacOS`;
    - the entry's SHA-1 matches its block;
    - the other app is byte-identical.
  - Idempotence (Review focus 3): patching the patched entry returns `changed: false`, and the file has the same
    bytes.
  - `isMacPatched` is false on the original and true after patching.
- [ ] **Step 2:** Run `npx vitest run tests/appinfo.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `appinfo.cjs` and `appinfo.d.cts`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run the full checks.
- [ ] **Step 5:** Run an extra check against a copy of the real cache, never the live file. Copy
  `~/Library/Application Support/Steam/appcache/appinfo.vdf` to the scratch folder and confirm a round trip of
  3067520 is byte-identical. The backup from the Mac test is at `scratchpad/appinfo.vdf.backup`.
- [ ] **Step 6:** Commit: "Steam's app cache read and written, Ultima V given a Mac launch and Cloud".

### Task 5: Saves through one storage seam, files in a Steam launch

**Files:**
- Create: `web/src/game/keyStore.ts`, `desktop/steamSaves.cjs`, `desktop/steamSaves.d.cts`
- Modify:
  - `web/src/game/storage.ts`, `web/src/game/characters.ts`, `web/src/game/transfer.ts:98`, and
    `web/src/game/settings.ts` (its reads and writes of `settingsKey()`, e.g. line 344): every `localStorage`
    access to a save, character or character-settings key goes through `kept()`.
  - `desktop/main.cjs`, `desktop/preload.cjs`: IPC.
- Test: `web/tests/keyStore.test.ts`, `web/tests/steamSaves.test.ts`; existing save tests must still pass.

**Interfaces:**
- Produces, web:
  - `kept(): Storage`, the current store (default `globalThis.localStorage`).
  - `useStore(s: Storage): void`.
  - `isSteamKey(key: string): boolean`: true for `ultima5.save`, `ultima5.saves*`, `ultima5.characters*` and
    `ultima5.char.*`; false for `ultima5.settings` and every other key.
  - `steamStore(initial: Record<string,string>, bridge: { set(k,v): boolean; remove(k): boolean }): Storage`:
    - Steam keys live in an in-memory map seeded from `initial`;
    - `setItem` calls `bridge.set` synchronously, and on `false` throws a `DOMException` named
      `QuotaExceededError`, leaving the map unchanged (Review focus 4);
    - every non-Steam key passes through to `localStorage`;
    - `key(i)` and `length` cover both.
- Produces, desktop:
  - `steamSaves.cjs` gives `loadAll(dir): Record<string,string>`, `writeKey(dir, key, value): boolean` and
    `removeKey(dir, key): boolean`.
  - A key's folder is `encodeURIComponent(key)`, holding `SAVED.GAM`. Writes go to a temporary file in the same
    folder, then are renamed into place.
  - `dir` is `<game folder>/Ultima V Engine/<account id>`.
- Produces, preload: `u5native.steam.saves = { all(): Record<string,string> | null, set(k, v): boolean, remove(k):
  boolean }`. These use `ipcRenderer.sendSync` (`steam-saves-all`, `-set`, `-remove`). Main answers only for the
  game's own page, as `scan-game-files` does, and only in a Steam launch with a game folder and account; otherwise
  `all` gives `null`.

- [ ] **Step 1:** Write failing tests:
  - `keyStore.test.ts`:
    - `isSteamKey` for each listed prefix and for `ultima5.settings`;
    - a `steamStore` round trip;
    - a failed `bridge.set` throws `QuotaExceededError` and the old value remains;
    - a settings key lands in `localStorage`, not the bridge.
  - `steamSaves.test.ts` (temp dir):
    - `writeKey` then `loadAll` round trip for `ultima5.char.k3x.last`;
    - the file on disk is `<dir>/ultima5.char.k3x.last/SAVED.GAM`;
    - `removeKey` deletes the folder;
    - a read-only dir makes `writeKey` return `false` without throwing;
    - nothing outside `dir` is touched.
- [ ] **Step 2:** Run both tests. Expected: FAIL.
- [ ] **Step 3:** Implement `keyStore.ts` and `steamSaves.cjs` and its `.d.cts`. Then replace the `localStorage`
  calls in `storage.ts`, `characters.ts` and `transfer.ts` with `kept()`.
  - Run `grep -rn "localStorage" web/src/game/storage.ts web/src/game/characters.ts web/src/game/transfer.ts`.
    Expected: no hits.
  - In `settings.ts`, the `settingsKey()` reads and writes go through `kept()` too; `kept()` passes
    `ultima5.settings` on to `localStorage` itself. Add a test: in a Steam store, a chosen character's settings are
    read from the store, and the no-character fallback from `localStorage`.
  - `otherWindows.ts`, `main.ts` and `ui/*` keep `localStorage`, since their keys are per machine.
- [ ] **Step 4:** Add the IPC handlers in `main.cjs` and the bridge in `preload.cjs`. The store's directory is
  decided at startup from `steam.cjs`: Steam launch, `findGame`, `accountId`.
- [ ] **Step 5:** Run the full checks. All existing save tests must pass unchanged.
- [ ] **Step 6:** Commit: "Saves kept through one seam: files Steam Cloud syncs, when Steam launched the game".

### Task 6: A Steam launch: game files, saves and the first-launch note

**Files:**
- Modify: `web/src/boot.ts`, `web/src/install/sources.ts`, `web/src/main.ts` (select the store before anything reads
  saves), `desktop/main.cjs`, `desktop/preload.cjs`
- Test: `web/tests/steamBoot.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `findGame`, `accountId`, `isSteamLaunch`.
  - Task 5: `steamStore`, `useStore`, `u5native.steam.saves`.
- Produces:
  - preload `u5native.steam.launch(): { steam: false } | { steam: true; game: 'ok' | 'missing' | 'none'; where:
    string; account: boolean }`, via `sendSync('steam-launch')`;
  - preload `u5native.steam.gameFiles(names: string[]): Promise<FoundCopy | null>`, reading `names` from the folder
    `findGame` gave, with `scan.cjs`'s `readCopy`;
  - web `steamCopy(): (() => Promise<FoundCopy | null>) | null` in `sources.ts`.
- `boot.gameFiles()` in a Steam launch:
  - `steamCopy` → `scanOutcome([copy], …)`; on `install`, return `found.files` without saving them to the browser's
    store, so Steam's folder stays the source.
  - Otherwise `runInstaller(notice)`, where the notice text names what was wrong:
    - `missing`: "Steam lists Ultima V in <library>, but its folder is not there. Install it in Steam, then press
      Play again."
    - `none`: "Steam launched the game, but no Steam library holds Ultima V."
    - files incomplete: the existing scan outcome text.
- With no account (Review focus 5): the store is a `steamStore` whose bridge refuses every write. The note says
  "Steam launched the game, but which Steam account did is unknown, so nothing can be saved." The game can still be
  played.
- First-launch note: in a Steam launch with no saves, once per machine (a non-Steam `localStorage` flag
  `ultima5.steamNoted`), the title shows: "Playing through Steam: your saves here are kept with Steam, apart from any
  made outside it. Export and Import carry a game across." Use the same box the update news uses at the title
  (`ui/updates.ts` news box).

- [ ] **Step 1:** Write failing tests in `steamBoot.test.ts`, with the bridge stubbed on `globalThis.u5native`:
  - a Steam launch with `game: 'ok'` returns the Steam copy's files and calls neither `runInstaller` nor
    `saveInstalled`;
  - `game: 'missing'` calls `runInstaller` with the notice naming the library;
  - no `u5native.steam` keeps today's path;
  - the store selected for a Steam launch is a `steamStore`, and for any other launch is `localStorage`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the main-side `steam-launch` and `steam-game-files` handlers (only for the game's page),
  the preload calls, `steamCopy`, the `boot.ts` branch, the store selection in `main.ts` and the first-launch note.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5:** Commit: "A Steam launch plays Steam's copy, with its own saves, and says so once".

### Task 7: One copy at a time across modes, and no restarts in a Steam launch

**Files:**
- Modify: `desktop/main.cjs:141-155`, `desktop/updates.cjs` (`applyUpdate` at line 248, `relaunch` at line 196)
- Create: `desktop/instanceMode.cjs`, `desktop/instanceMode.d.cts`
- Test: `web/tests/instanceMode.test.ts`, `web/tests/desktopUpdates.test.ts`

**Interfaces:**
- Produces:
  - `instanceMode.cjs`: `noteMode(file, steam: boolean)` writes `{ steam, pid }` atomically to
    `<userData>/instance.json`. `clashMessage(file, steam: boolean): string | null` reads it and gives the message
    when the running copy's mode differs, else null.
  - Messages:
    - Steam launch while open outside: "Ultima V is already open outside Steam. Close it, then press Play in Steam
      again."
    - The reverse: "Ultima V is already open through Steam. Close it there first."
- `main.cjs`:
  - the primary copy calls `noteMode` once it has the lock;
  - a second copy whose `clashMessage` is non-null shows it with `dialog.showMessageBoxSync` and quits, without
    signalling the first;
  - a second copy in the same mode keeps today's behaviour (focus the first).
- `updates.cjs`, in a Steam launch:
  - the offer's kind `restart` is reported as "installs when the game quits";
  - `applyUpdate` never calls `quitAndInstall` or the Flatpak `spawnLatest`;
  - electron-updater's `autoInstallOnAppQuit` stays on.

- [ ] **Step 1:** Write failing tests:
  - `clashMessage` gives null for the same mode, each message for the other mode, and null for a missing or
    unreadable file;
  - `noteMode` writes JSON that `clashMessage` reads;
  - in `desktopUpdates.test.ts`, `applyUpdate` in a Steam launch with a `restart` offer does not call the stubbed
    `quitAndInstall`, and with the Flatpak does not call `spawnLatest`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `instanceMode.cjs`, and pass `isSteamLaunch(process.env)` into the updates setup. Change
  `main.cjs` as above.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5:** Commit: "Steam and non-Steam copies never share a window or a restart".

### Task 8: Setup and removal on each system (`steamSetup.cjs`)

**Files:**
- Create: `desktop/steamSetup.cjs`, `desktop/steamSetup.d.cts`
- Modify: `desktop/main.cjs`: re-apply on a Mac at startup; IPC `steam-status`, `steam-setup`, `steam-remove`,
  `steam-launch-line`.
- Test: `web/tests/steamSetup.test.ts`

**Interfaces:**
- Consumes: Task 3 (`steamRoots`, `findGame`), Task 4 (`readAppinfo`, `appEntry`, `writeAppinfo`, `macPatch`,
  `isMacPatched`).
- Produces (filesystem injected as `fs` for tests; process checks injected as `steamRunning(): boolean` and
  `quitSteam(): Promise<void>`):
  - `launchLine({ platform, exe, appImageLink, flatpak }): string | null`:
    - Windows installed build: `"<exe>" %command%`;
    - Linux Flatpak: `flatpak run com.synthwavepixel.ultima5 %command%`;
    - AppImage: `"<appImageLink>" %command%`;
    - Mac or the Windows portable build: null.
  - `appImageLink(home): string` = `~/.local/share/ultima5/Ultima-V.AppImage`. `relinkAppImage(fs, link, current)`
    re-points it at startup when running as an AppImage.
  - `installCompatTool(fs, roots, launcher: { flatpak: boolean; appImageLink: string }): string[]`:
    - writes `compatibilitytools.d/ultima5_engine/{compatibilitytool.vdf, toolmanifest.vdf, launch.sh}` under each
      existing root; returns the folders written;
    - `launch.sh` exits with a message unless `SteamAppId` is `3067520`;
    - inside Flatpak Steam (`FLATPAK_ID` is `com.valvesoftware.Steam`) it uses `flatpak-spawn --host`, and if that
      fails, prints the `flatpak override` command from the spec;
    - it handles `waitforexitandrun` and `run` by exec-ing the app, and other verbs by exiting 0.
    - This follows what Task 2 found; if the compatibility tool failed there, skip this function.
  - `macSetup({ fs, steamRoot, appExe, keptOriginal, steamRunning, quitSteam }): Promise<'done' | 'steam-running' |
    'not-owned'>`. With Steam not running, or once `quitSteam()` resolves, it:
    1. writes `appmanifest_3067520.acf` if absent;
    2. writes the launcher `Ultima V Engine.app` into the game folder (or, before the download, after the next Steam
       start). Its `Contents/Info.plist` executable is a shell script that `exec`s `appExe` with `"$@"`, or prints
       "Ultima V's engine app is not at <appExe>: reinstall it, or remove Steam setup" and exits 1 when that's
       missing;
    3. saves the untouched 3067520 entry's bytes to `keptOriginal`, unless `isMacPatched`;
    4. applies `macPatch` and writes `appinfo.vdf` atomically.
  - `macRestore(...)` writes `keptOriginal` back, if present, with Steam closed, and removes the launcher and any
    manifest we wrote (we record that in the app's data).
  - `macReapply(...)` runs at startup: if the entry isn't patched and Steam isn't running, patch it (starting from
    the entry now in the cache); if Steam is running, report `'steam-running'` for the Steam line to show.
  - `removeCompatTool(fs, roots)`.

- [ ] **Step 1:** Write failing tests with a temp-dir fake Steam root:
  - `launchLine` for each platform, with a Windows exe under `C:\Program Files\Ultima V (test)\` and an AppImage
    link with a space and a `'`. Each is a single argument when parsed by a shell, and is null for a Mac and
    portable builds (Review focus 1).
  - `installCompatTool`: both vdfs parse with `parseVdf` to the spec's values; `launch.sh` is executable; running it
    with `SteamAppId=22320` exits non-zero with the message.
  - `macSetup`:
    - with `steamRunning` true and `quitSteam` resolving, it writes only after quitting;
    - the result: the manifest, the launcher `.app` with an executable script, `keptOriginal`, and a patched cache
      that `isMacPatched` accepts;
    - a second run changes nothing.
  - `macRestore` brings the cache entry back byte-identical, and removes the launcher and our manifest.
  - `macReapply`, after the cache entry was replaced with a newer change number, patches that newer entry (Review
    focus 3).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `steamSetup.cjs` and `.d.cts`. In `main.cjs`:
  - `steamRunning`: `pgrep -x steam_osx` on a Mac, `pgrep -x steam` on Linux.
  - `quitSteam` on a Mac: `osascript -e 'quit app "Steam"'`, then polls for up to 40 s. The Mac test showed it
    quits despite reporting "User canceled".
  - Wire the IPC handlers (game page only), call `relinkAppImage` and `macReapply` at startup, and keep the original
    entry under `<userData>/steam-appinfo-3067520.bin`.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5:** Commit: "Steam setup and removal: a compatibility tool, a launch line, the Mac's cache entry".

### Task 9: The Steam line in Settings

**Files:**
- Modify: `web/src/game/game.ts` (`GameHooks`), `web/src/ui/pageHooks.ts`, `web/src/game/menu.ts` (Settings lines,
  near "Smooth motion", around line 1943), `desktop/preload.cjs`
- Test: `web/tests/steamMenu.test.ts`

**Interfaces:**
- Consumes: Task 8's IPC through preload, as `u5native.steam.status()`, `setup()`, `remove()` and `launchLine()`.
- Produces:
  - `GameHooks.steam?: SteamHook`, with:
    - `status(): Promise<{ system: 'linux' | 'windows' | 'mac'; state: 'ready' | 'not-set-up' | 'steam-running' |
      'no-steam' | 'not-owned'; line: string | null }>`;
    - `setup(): Promise<string>` (the message to show);
    - `remove(): Promise<string>`;
    - `copyLine(): Promise<boolean>`.
  - `pageHooks.ts` sets it only when `u5native.steam` exists, so web and Android have no Steam line.
- The line is labelled **Steam**. It opens a box with:
  - the steps for this system;
  - **Set up**: Linux installs the tool; a Mac asks to quit Steam ("Steam must be closed for this. Quit Steam
    now?");
  - **Copy launch line** (Windows and Linux): copied with `transfer.copy`, then "Copied. In Steam: Ultima V → ⚙ →
    Properties → Launch Options, and paste.";
  - **Remove Steam setup**;
  - on a Mac, the note: "If Play in Steam ever says 'Invalid platform', Steam has refreshed Ultima V's settings.
    Open this app once with Steam closed (or let it quit Steam) and it puts things back."
- Wording beyond the strings above is the builder's, in the game's voice.

- [ ] **Step 1:** Write failing tests, following `pausemenu.test.ts`'s pattern:
  - the Settings menu lists **Steam** only when `g.hooks.steam` is set;
  - choosing Copy launch line on `windows` calls `copyLine` and shows the Copied text;
  - a Mac with `steam-running` asks the quit question before calling `setup`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the line and box in `menu.ts`, the hook in `pageHooks.ts` and the preload calls.
- [ ] **Step 4:** Update `web/tests/pausemenu.test.ts` if it pins the Settings lines. Run the full checks.
  Expected: PASS.
- [ ] **Step 5:** Commit: "Settings: a Steam line to set up, copy the launch line, or remove".

### Task 10: Docs, the dev Mac cleaned, verification, the pre-release

**Files:**
- Modify: `docs/install.md` (a "Steam's Ultima V" section beside "Desktop app, and the Steam Deck"),
  `docs/features.md`, `desktop/README.md` (the Steam modules)

- [ ] **Step 1:** Write the docs:
  - each system's setup;
  - the Flatpak Steam `flatpak override` command;
  - the Mac "Invalid platform" note;
  - that Steam saves and other saves are kept apart, and Export and Import carry a game across.
  Commit: "Docs: playing Steam's Ultima V".
- [ ] **Step 2:** Clean the dev Mac, as in the spec's "Cleanup before verification", with Steam closed:
  - restore `appcache/appinfo.vdf` from `scratchpad/appinfo.vdf.backup` (check that Steam hasn't refreshed the
    entry since; if it has, restore by deleting the cache file instead, which Steam rebuilds);
  - remove `u5launch.sh`, `ShardsTest.app` and `Shards Test/` from the game folder;
  - delete the test save from Steam Cloud. Confirm in `cloud_log.txt` after the next launch, or ask the user to
    check the account's Steam Cloud page;
  - keep the download and its manifest.
- [ ] **Step 3:** Verify on the dev Mac with a local build: Settings → Steam → Set up. Then:
  - Play in Steam starts the engine;
  - a save lands at `Ultima V Engine/32554223/…/SAVED.GAM`;
  - `cloud_log.txt` shows its upload;
  - Remove Steam setup restores the cache entry.
- [ ] **Step 4 (with the user's go-ahead):** publish a pre-release (Task 1). Draft the GitHub Discussion with the
  tester checklist for each combination in the spec's "Testing with players", for the user to post.

## Self-review notes

- **Spec coverage:**
  - setup on each system: Tasks 8, 9;
  - Steam launch: Task 6;
  - saves per account: Tasks 3, 5;
  - already open: Task 7;
  - updates: Task 7;
  - Flatpak Steam: Task 8;
  - untested routes: Task 2;
  - pre-releases: Tasks 1, 10;
  - undo: Task 8;
  - cleanup: Task 10.
- Per-character settings (`ultima5.char.<id>.settings`) travel with the character in the Steam store, as the user
  decided on 2026-11-05.
