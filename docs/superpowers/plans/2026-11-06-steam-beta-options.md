# Steam Integration as Beta Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the `steam-release` branch so the Steam integration ships in a regular release as beta options on
the title menu, each off until turned on, with game files found in Steam's libraries on every start.

**Architecture:** The branch already has Steam discovery (`desktop/steam.cjs`), the appinfo editor
(`desktop/appinfo.cjs`), setup and removal per system (`desktop/steamSetup.cjs`), a file-backed save store
(`desktop/steamSaves.cjs`, `web/src/game/keyStore.ts`), the one-copy and update rules, and a Steam line in Settings.
This plan changes when each runs (behind per-machine options instead of on every Steam launch), moves the menu to the
title, adds the Cloud saves copy with clash handling, a launch-line check and a tester report, and renames the
AppImage so it updates in place.

**Tech Stack:** Electron (CommonJS in `desktop/`), TypeScript game engine (`web/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-steam-release-design.md` (revised 2026-11-06). Supersedes
`docs/superpowers/plans/2026-11-05-steam-release.md`, whose Tasks 1 and 3-10 are built on this branch.

## Global Constraints

- In-game strings drawn in the game's font are ASCII only (`printChar` masks with `&0x7f`).
- With every option off, nothing is written to Steam's folders and saves stay in the app's own store.
- Never edit Steam's `localconfig.vdf`; only read it. Edit `appinfo.vdf` only with Steam closed.
- Steam app id 3067520. Save folder `<game folder>/ultima5-sp/<account id>/`, each key a subfolder holding one
  `SAVED.GAM`.
- Steam-facing names: compatibility tool and Mac launch entry description **"Ultima V SP"**.
- AppImage artifact name `ultima5-sp-${arch}.${ext}` (no version); other builds' names unchanged.
- Options are kept per machine in the app's data; Cloud saves is kept per Steam account.
- Checks, run in `web/`: `npx tsc --noEmit -p .`, `npx eslint src tests`, `npx prettier --check src tests`,
  `npx vitest run`. Don't run prettier on `desktop/*.cjs`.
- Comments explain why, in plain English, in the code's existing voice.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only; never push.

## Review Focus

1. Every option off: a Steam launch writes nothing under the game folder and uses the app's own saves.
2. Turning Cloud saves on or off when a write fails part way: the option stays as it was, the player is told, and
   no save on either side is lost.
3. A clash dialog cancelled: nothing copied, option unchanged.
4. `localconfig.vdf` missing, unreadable, without Ultima V's entry, or with keys in odd case: the launch-line state
   is "missing" or "not seen yet", never a crash.
5. A player on a versioned AppImage name updating once: the new file is `ultima5-sp-x86_64.AppImage`, and nothing
   still tries to maintain the old stable link.

---

### Task 1: The AppImage updates in place; the stable link goes

**Files:**
- Modify: `desktop/package.json` (`appImage.artifactName`)
- Modify: `desktop/updates.cjs`, `desktop/updates.d.cts` (drop the `appimage-filename-updated` relink and the
  `appImageLink` parameter)
- Modify: `desktop/steamSetup.cjs`, `desktop/steamSetup.d.cts` (drop `appImageLink`, `relinkAppImage`; the launch
  line and the compatibility tool point at the AppImage file itself)
- Modify: `desktop/main.cjs` (callers)
- Test: `web/tests/desktopUpdates.test.ts`, `web/tests/steamSetup.test.ts`

**Interfaces:**
- Produces: `launchLine(build: { platform; exe; appImage: string | null; flatpak; portable }): string | null` where
  `appImage` is `process.env.APPIMAGE` (the file's own path); `installCompatTool(fs, roots, launcher: { flatpak:
  boolean; appImage: string | null }): string[]`.

- [ ] **Step 1: Write failing tests**
  - `desktopUpdates.test.ts`: "the AppImage's file name carries no version" — read `desktop/package.json`, assert
    `build.appImage.artifactName === 'ultima5-sp-${arch}.${ext}'` and that it doesn't contain `${version}`.
  - `desktopUpdates.test.ts`: the update path registers no `appimage-filename-updated` handler (assert the fake
    updater's listener list lacks it).
  - `steamSetup.test.ts`: `launchLine({ platform: 'linux', exe: '/x/electron', appImage:
    '/home/a/Apps/ultima5-sp-x86_64.AppImage', flatpak: false, portable: false })` is
    `'"/home/a/Apps/ultima5-sp-x86_64.AppImage" %command%'`; with `appImage: null` and not Flatpak, null.
  - `steamSetup.test.ts`: the compatibility tool's launcher script for an AppImage runs that path.
- [ ] **Step 2: Run them; they fail.** `npx vitest run tests/desktopUpdates.test.ts tests/steamSetup.test.ts`
- [ ] **Step 3: Implement.** Remove `appImageLink`, `relinkAppImage` and their tests; delete the link-making in
  `main.cjs`. Keep everything else in updates.cjs (Steam-launch update deferral stays).
- [ ] **Step 4: Run all checks; green.**
- [ ] **Step 5: Commit** "The AppImage keeps one name, so updates overwrite it and Steam's line holds"

### Task 2: SP names, the launcher's app id, and no new Flatpak permission

**Files:**
- Modify: `desktop/main.cjs` (save folder `ultima5-sp` instead of `Ultima V Engine`)
- Modify: `desktop/steamSetup.cjs` (compatibility tool display name and Mac launch entry description "Ultima V SP";
  the Linux launcher script exports `SteamAppId=3067520` before starting the engine)
- Modify: `desktop/package.json` (revert commit 9904d4d: remove `--filesystem=/run/media` from the Flatpak's
  `finishArgs`)
- Modify: `web/src/game/menu.ts` strings naming "Ultima V (new engine)" (they move in Task 8; rename now)
- Test: `web/tests/steamSetup.test.ts`, `web/tests/steamBoot.test.ts`

- [ ] **Step 1: Failing tests**: the tool's `compatibilitytool.vdf` display name is `Ultima V SP`; `macPatch` adds a
  launch entry with `description` `Ultima V SP`; the launcher script contains `export SteamAppId=3067520`; the save
  dir from `steamLaunch()`'s shape ends in `ultima5-sp/<account>`; `desktop/package.json` Flatpak `finishArgs` has no
  `/run/media` entry.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "Steam knows this engine as Ultima V SP; its saves go in ultima5-sp"

### Task 3: Find the game in Steam's libraries on every start, and take the files once

**Files:**
- Modify: `desktop/main.cjs` (split discovery from launch detection), `desktop/preload.cjs`
- Modify: `web/src/install/sources.ts`, `web/src/boot.ts`
- Test: `web/tests/steamBoot.test.ts`

**Interfaces:**
- Produces (main, cached once per run): `steamFind(): { steam: boolean; game: 'ok' | 'missing' | 'none'; where:
  string; folder: string | null; root: string | null }` — Steam's location and Ultima V's folder, whether or not
  Steam launched the app. `steamLaunch()` keeps its role (was it a Steam launch, which account) and uses it.
- Produces (preload): `u5native.steam.find()` (sync IPC `steam-find`), and `gameFiles(names)` works from
  `steamFind().folder` whether or not Steam launched.
- Produces (web): `steamFound(): (() => Promise<FoundCopy | null>) | null` in `sources.ts`, replacing `steamCopy`.
- Produces (web, boot.ts): the one-time note "Found Ultima V in your Steam library." kept under
  `ultima5.steamFoundNoted`.

`gameFiles()` order: the installed copy; else, where Steam's copy is found and complete, `saveInstalled` it (as the
installer does after a scan) and show the note once; else in a Steam launch the plain notice (`steamNotice`); else
the installer. A Steam launch no longer reads Steam's folder in place.

- [ ] **Step 1: Failing tests (steamBoot.test.ts)**: no installed copy + Steam copy found (not a Steam launch) →
  files saved through `saveInstalled` and the note offered once; installed copy present → Steam not asked for files;
  Steam copy missing files → installer; Steam launch with nothing found → installer with the existing notice text.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "The game is found in Steam's libraries on any start, and kept once"

### Task 4: The options, kept per machine, and which store a Steam launch uses

**Files:**
- Create: `desktop/steamOptions.cjs`, `desktop/steamOptions.d.cts`
- Modify: `desktop/main.cjs`, `desktop/preload.cjs`, `web/src/install/sources.ts` (`SteamNative`), `web/src/boot.ts`
- Test: create `web/tests/steamOptions.test.ts`; modify `web/tests/steamBoot.test.ts`

**Interfaces:**
- Produces: `readOptions(file): SteamOptions`, `writeOptions(file, o): void` (atomic, as `instanceMode.cjs`
  `noteMode` writes), with `SteamOptions = { playLine: boolean; compatTool: boolean; macPlay: boolean; cloud:
  Record<string /* account id */, boolean> }`, all off by default; file `<userData>/steam-options.json`. A missing
  or unreadable file reads as all off.
- Produces (preload): `u5native.steam.options()` (sync) and `setOption(name, on)` (invoke; Task 8 wires effects).
- `chooseStore()` uses Steam's folder only when it is a Steam launch, the account is known, `cloud[account]` is on,
  and the folder loads; when on but unusable, the app's own store and the once-a-launch note
  "Steam's saves can't be reached; using this computer's saves." The refusing store and `NO_ACCOUNT` go.
- The first-launch note becomes: "Saves made while playing from Steam stay with Steam. Turning Steam Cloud saves off
  copies them back." (shown once per account, first Steam launch with Cloud saves on).

- [ ] **Step 1: Failing tests**: options default all off and survive a corrupt file; Steam launch with Cloud saves
  off → app store, nothing written to the folder (Review Focus 1); on with account → Steam store; on, account
  unknown or folder unreadable → app store plus the note (never a refusing store).
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "Steam options are off until turned on, kept per machine; saves follow Cloud saves alone"

### Task 5: Copying saves when Cloud saves is turned on or off

**Files:**
- Create: `web/src/game/cloudCopy.ts`
- Modify: `web/src/game/storage.ts` (export what the copy needs to read a character's keys and history, nothing
  more)
- Test: create `web/tests/cloudCopy.test.ts`

**Interfaces:**
- Consumes: storage.ts's key scheme (`saveKeys`, the character index, `EARLIER`, `SaveData.written`, the settings
  block key `ultima5.char.<id>.settings`), `isSteamKey`.
- Produces: `planCopy(from: Record<string, string>, to: Record<string, string>): { writes: Record<string, string>;
  clashes: Clash[] }` where `Clash = { id: string; from: SaveData; to: SaveData }`, and
  `applyChoice(plan, id, keep: 'from' | 'to'): Record<string, string>` (the writes for one clash).
- Rules (spec "Steam Cloud saves"): identical → nothing; one side only → copied with its settings block; one side's
  latest among the other's saves → the newer side's saves replace the older's; both moved on → a clash. After a
  clash choice, on the receiving side the picked version is latest, the other is the newest earlier save, the rest
  of that side's earlier saves stay (trimmed to `EARLIER`). The source is never written.

- [ ] **Step 1: Failing tests**: one test per rule above, plus "source map unchanged", "settings block travels",
  "history trimmed to EARLIER keeps the newest".
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement `planCopy` and `applyChoice` as pure functions over key maps.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "Saves copied between Steam and this computer; only real clashes ask"

### Task 6: The launch-line check

**Files:**
- Create: `desktop/launchCheck.cjs`, `desktop/launchCheck.d.cts`
- Modify: `desktop/main.cjs` (IPC `steam-line-state`), `desktop/preload.cjs`
- Test: create `web/tests/launchCheck.test.ts`

**Interfaces:**
- Consumes: `parseVdf` (steam.cjs), the account id, `launchLine`.
- Produces: `lineState(localconfig: string | null, expected: string, exePath: string):
  'correct' | 'missing' | 'not-seen' | 'stale' | 'twice'`, reading `UserLocalConfigStore/Software/Valve/Steam/apps/3067520/LaunchOptions`
  case-insensitively. `'not-seen'` when the file or entry is absent and the option was turned on less than a Steam
  restart ago (the caller passes that fact; the function takes `recentlyTurnedOn: boolean`). `'stale'` when the line
  has `%command%` once but runs another path. `'twice'` when `%command%` or `exePath` appears more than once.
- Produces (main): `steam-line-state` returns the state plus `bothLinux: boolean` (launch line and compatibility
  tool both on).

- [ ] **Step 1: Failing tests**: each state, quoting variants (`"…" %command%`, unquoted path), odd key case, file
  absent, app entry absent (Review Focus 4).
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "Steam's launch line read back: correct, missing, stale or pasted twice"

### Task 7: The tester report

**Files:**
- Create: `desktop/steamReport.cjs`, `desktop/steamReport.d.cts`
- Modify: `desktop/main.cjs` (IPC `steam-report`), `desktop/preload.cjs`
- Test: create `web/tests/steamReport.test.ts`

**Interfaces:**
- Produces: `report(facts): string`, plain text, with the fields listed in the spec's "The report". Masking: the home
  directory in any path becomes `~`; user names in `/home/<name>`, `/Users/<name>`, `C:\Users\<name>` become
  `<user>`; account names and persona names are left out; the account id is shown only as "known" or "unknown".
- The last on/off result of each option is recorded by Task 8 into the options file (`results: Record<option,
  string>`) and read here.

- [ ] **Step 1: Failing tests**: a report from fixed facts matches expected lines; a home path, a `/run/media/<user>/…`
  library and a Windows `C:\Users\<user>\…` path are masked; no account name appears.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "A report of what Steam's side looks like, for testers to paste"

### Task 8: The Steam (beta) title menu

**Files:**
- Modify: `web/src/game/intro.ts` (a title menu line `Steam (beta)`, desktop only, from `g.hooks.steam`)
- Modify: `web/src/game/menu.ts` (move the Steam box out of Settings into a function the title calls; rebuild it
  per the spec: what was found, the options for this system with on/off, Mac warning, Copy report, Report an issue)
- Modify: `web/src/game/game.ts` (`SteamHook`, `SteamStatus` grow to options, line state and report)
- Modify: `web/src/ui/pageHooks.ts`, `desktop/preload.cjs`, `desktop/main.cjs` (one IPC `steam-option` doing the
  on and off effects with the existing setup/removal functions, recording each result)
- Modify: the Cloud saves switch uses `cloudCopy.ts`; clashes shown one by one with `choose` (each version's name,
  level, place and `savedWhen` written time), Cancel abandons all
- Test: `web/tests/steamMenu.test.ts` (rewrite), `web/tests/intro*.test.ts` where the title's lines are counted

**Interfaces:**
- Consumes: Tasks 4-7.
- Option rows by system: Windows `Play from Steam`; Linux `Play from Steam: launch line`, `Play from Steam:
  compatibility tool`; Mac `Play from Steam (changes Steam's settings)`; all `Steam Cloud saves`.
- Cloud saves greyed outside a Steam launch ("Start Ultima V from Steam to change this.") and, on a Mac, while
  `macPlay` is off. The option is set for the launch's account only after every write succeeded (Review Focus 2).
- Report an issue opens `https://github.com/synthwave-pixel/ultima5/issues` (the app's existing external-link path).
- The Flatpak build's menu adds the line "The AppImage works better with Steam." with the download link.

- [ ] **Step 1: Failing tests**: title menu has `Steam (beta)` only when `hooks.steam` exists; Settings no longer has
  a Steam line; each option toggles through the hook and redraws; Cloud saves greyed outside a Steam launch and on a
  Mac with Play off; cancel in the clash dialog writes nothing (Review Focus 3); a failed write leaves the option off
  and says so; every in-menu string is ASCII.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "Steam (beta) on the title: each option off until turned on"

### Task 9: Showing the SP edition and its version

**Files:**
- Modify: `desktop/main.cjs` (window title `Ultima V SP <version>`), `web/index.html` (`<title>` Ultima V SP)
- Modify: `web/src/game/menu.ts` (Settings ends with a greyed, unselectable line `Ultima V SP <version>`)
- Modify: `web/src/game/game.ts` / `pageHooks.ts` (a `version` hook: the desktop app's `app.getVersion()` through
  preload, the Android app's own version as its update check knows it; the web shows `Ultima V SP` alone)
- Modify: `web/src/game/intro.ts` (the title screen shows `Ultima V SP <version>` greyed where it doesn't overlap the
  menu)
- Test: `web/tests/steamMenu.test.ts` or the settings test that lists lines

- [ ] **Step 1: Failing tests**: Settings' last line is `Ultima V SP 1.1.200` (disabled) when the hook gives
  `1.1.200`; `Ultima V SP` without one.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Checks green.**
- [ ] **Step 5: Commit** "The SP edition says its name and version"

### Task 10: Docs

**Files:**
- Modify: `docs/install.md` (the Steam section rewritten for the beta menu; the AppImage recommended for Steam on
  Linux and the Deck, with why, its new name and the permanent link
  `https://github.com/synthwave-pixel/ultima5/releases/latest/download/ultima5-sp-x86_64.AppImage`; every other
  mention of the versioned AppImage name updated), `docs/features.md`, `desktop/README.md`
- Modify: the site's or workflow's links to the AppImage, if any name the old pattern (`grep -rn "Ultima-V-" .github
  docs web/public`)

- [ ] **Step 1: Update the docs; check no stale `Ultima V Engine`, `new engine`, `Settings > Steam` or versioned
  AppImage name remains** (`grep -rn`).
- [ ] **Step 2: Commit** "Docs: Steam (beta), and the AppImage for Steam on Linux"

### Task 11: Verify on the Mac, then release (with the user)

Not dispatched: done in the session, with the user present.

- [ ] **Step 1:** Clean the dev Mac per the spec's "Cleanup before verification" (Steam closed).
- [ ] **Step 2:** Build the desktop app locally; with every option off, start it: the game is found in Steam's
  library and kept, nothing written under Steam's folders.
- [ ] **Step 3:** Turn on Mac Play: warning, Steam quit, Play in Steam starts the engine; turn on Cloud saves during
  that launch; save; quit; `cloud_log.txt` shows the upload of `ultima5-sp/<account>/…/SAVED.GAM`.
- [ ] **Step 4:** Turn both off: saves copied back, cache restored, Play gives Invalid platform again.
- [ ] **Step 5:** Copy report; check it reads well and masks paths.
- [ ] **Step 6:** With the user's go-ahead: merge to main, release, and post the Discussion's tester checklist.
