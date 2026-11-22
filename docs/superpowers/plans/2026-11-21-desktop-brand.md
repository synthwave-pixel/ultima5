# The desktop app's brand: one place for its names and ids (no change for Ultima V)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every name and id the desktop app, its packages, its Steam setup, its scan and the release workflows give the
game comes from one module, `desktop/brand.cjs`, so that a fork for another game on this engine changes values there
and nothing else; Ultima V's builds, ids, files and messages stay byte for byte as they are.

**Architecture:** `desktop/brand.cjs` holds a few values (id, name, title, app id, repository, the page's global,
store text, Steam app id, install folder and save file, the scan's folder pattern and marker) and the names derived
from them as the engine always has (`<name> Enhanced Edition`, `<id>-sp`, `<id>_sp`, `<name> SP`, `<appId>.steam`,
`Ultima-V` from the name, the Pages address from the repository). Every desktop module reads it. `package.json` keeps
only what is no game's: `desktop/builderConfig.cjs` fills electron-builder's game fields from the brand and `dist.cjs`
hands electron-builder the filled config on every platform. The files the page wants read beside the required names
(Ultima V: `*.XMI`) become the page's to say (`GameSpec.extra`), passed through both bridges. The workflows take the
site's path and the artifacts' prefix from the repository's name.

**Tech Stack:** Electron 44, electron-builder 26 (CommonJS `.cjs` with `.d.cts` types), vitest in `web/`, GitHub
Actions, Capacitor's Java plugin.

**Spec:** the downstream fork's release audit, section 5's ultima5 rows and 7.2 (not in this repository); the brief
here is this header.

## Global Constraints

- Ultima V unchanged: the filled electron-builder config equals `package.json`'s `build` of before, key for key, for
  `--mac`, `--linux` and `--win`; every message, path, id and file name the same.
- No other game's names, text or values anywhere in this repository; a test's second brand is invented.
- The internal names no player sees stay: `u5native`, `ULTIMA5_SMOKE`, the `app://ultima5` host (the page's origin:
  moving it would lose every player's storage), the Java package.
- Checks: `npm run format:check`, `npm run lint`, `npm test` in `web/`.

## Review Focus

- A module still naming Ultima V by a literal: the swapped-brand test (Task 1) loads every desktop module under an
  invented brand and fails on any `Ultima V`, `ultima5`, `3067520` or `SAVED.GAM` in what they produce.
- electron-builder given a config file reading it differently from `package.json`'s `build`: the effective configs
  (`dist/builder-effective-config.yaml`) of origin/main and this branch compared for all three platforms.
- `brand.cjs` left out of the packaged app: `desktopPackaged.test.ts` already fails on a module loaded but not listed.
- A page that passes no `extra`: the bridges read the required names only (no throw); the page always passes its own.
- An `extra` that is no valid pattern, or not a string, from the page: refused as the names are (no copies), never thrown.

---

### Task 1: `desktop/brand.cjs`, and every desktop module reading it

**Files:**
- Create: `desktop/brand.cjs`, `desktop/brand.d.cts`, `desktop/builderConfig.cjs`, `desktop/builderConfig.d.cts`
- Modify: `desktop/package.json` (game fields out of `build`; `brand.cjs` into `build.files`), `dist.cjs`,
  `smoke-built.cjs`, `main.cjs`, `steam.cjs`, `steamSaves.cjs`, `steamSetup.cjs`, `steamOptions.cjs`,
  `steamReport.cjs`, `appinfo.cjs`, `instanceMode.cjs`, `portable.cjs`, `updates.cjs`, `metainfo.cjs`, `scan.cjs`,
  `flatpak-repo.sh`
- Test: `web/tests/desktopBrand.test.ts` (any brand), `web/tests/desktopBrand.ultima5.test.ts` (Ultima V's values)

**Interfaces:**
- Produces: `brand.cjs` exports a frozen object: `id`, `name`, `title`, `appId`, `repo`, `global`, `about`
  (string[]), `steam: { appId, installDir, saveFile, saves, tool, launcher }`, `scan: { folder: RegExp, marker }`, and
  derived `edition`, `summary`, `artifact`, `appImage`, `portableData`, `launcherId`, `owner`, `repoName`, `site`.
- Produces: `builderConfig(build, version) -> object` (`builderConfig.cjs`): a copy of `build` with `appId`,
  `productName`, `artifactName`, `publish`, `mac.extendInfo`, `nsis`/`portable` `artifactName`,
  `linux.desktop.entry`, `appImage.artifactName`, `flatpak.files` and `extraMetadata.version` filled.
- Produces: `flatpakRepoFiles({ site, id, branch, key }) -> { repo, ref, title }` (`metainfo.cjs`): the
  `.flatpakrepo`/`.flatpakref` texts and their file names, which `flatpak-repo.sh` writes through `node`.

- [ ] **Step 1: Write the failing tests.** `desktopBrand.ultima5.test.ts`: the brand's every value as Ultima V's
  (`ultima5`, `Ultima V`, `Ultima V: Warriors of Destiny`, `com.synthwavepixel.ultima5`, `synthwave-pixel/ultima5`,
  `u5`, `3067520`, `Ultima V`, `SAVED.GAM`, `ultima5-sp`, `ultima5_sp`, `Ultima V SP`, the scan pattern and `DATA.OVL`,
  `Ultima-V`, `Ultima V Data`, `com.synthwavepixel.ultima5.steam`, `https://synthwave-pixel.github.io/ultima5/`);
  `builderConfig(pkg.build, '1.1.241')` equal to origin/main's `build` (pinned as literals) plus
  `extraMetadata.version`; the metainfo and the Flatpak repository's files for 1.1.241 exactly as before.
  `desktopBrand.test.ts`: `package.json`'s `name` is `<id>-desktop`, `productName` the name, `repository` the repo;
  `build` names no game value; and the swapped brand - every `desktop/*.cjs` copied to a temporary folder (its
  `node_modules` linked) with an invented brand, the modules loaded there - says only the invented names in
  `report()`, `clashMessage`, `switchOption`'s messages, `metainfo`, `flatpakRepoFiles`, `builderConfig`, `APP_ID`,
  `saveDir`, the saves' file, `launchScript`/the Mac launcher, `macPatch`'s description, `portable`'s `DATA`,
  `gameFolderName`/`findCopies` (a folder named like the invented game holding its marker).
- [ ] **Step 2: Run them, to see them fail** (`npx vitest run tests/desktopBrand`): no `brand.cjs`.
- [ ] **Step 3: Write `brand.cjs` and `builderConfig.cjs`; every module reads the brand** in place of its literal;
  `dist.cjs` writes `builderConfig(...)` (through `macBuildConfig` on a Mac) to `.build.json` and passes `--config` on
  every platform; `smoke-built.cjs` takes the product from the brand and the Linux executable from `package.json`'s
  `name`; `main.cjs`'s window title, clash dialog, the kept cache copy (`steam-appinfo-<steam app id>.bin`), the report's
  `<id>.characters` and the smoke hook's `window[<global>]` from the brand.
- [ ] **Step 4: Run the tests and the checks** (`npm test`, lint, format): all pass, the old tests unchanged.
- [ ] **Step 5: Commit.**

### Task 2: the desktop tests read the brand

**Files:** `web/tests/appinfo`, `desktopPortable`, `desktopUpdates`, `desktopScan`, `flatpakUpdates`, `launchCheck`,
`steamReport`, `steamFind`, `steamOptions`, `steamSaves`, `steamSetup`, `instanceMode`, `steamArt` `.test.ts`.

- [ ] **Step 1:** each test that pins a value the desktop app takes from the brand (`3067520`, `Ultima V` as the game's
  name or install folder, `ultima5-sp`, `ultima5_sp`, `SAVED.GAM`, `DATA.OVL`, the app id, the AppImage's name) reads
  it from `desktop/brand.cjs`; what is only a fixture's (a folder's name made up for the test) stays. Ultima V's values
  stay pinned in `desktopBrand.ultima5.test.ts`.
- [ ] **Step 2:** `npm test` passes with the same counts as before.
- [ ] **Step 3: Commit.**

### Task 3: the files read beside the names are the page's to say

**Files:** `web/src/install/gameFiles.ts` (`GameSpec.extra`, Ultima V's `'\\.XMI$'`), `web/src/install/sources.ts`
(`desktopScan`, `androidFolder`, `SteamNative.gameFiles` pass it), `desktop/preload.cjs`, `desktop/main.cjs` (the two
handlers check it), `desktop/scan.cjs` (`readCopy(dir, wanted, extra)`, `findCopies(..., { extra })`,
`scanForGameFiles(wanted, steamLibraries, extra)`), `mobile/.../GameFolderPlugin.java`; tests `desktopScan.test.ts`,
`sources.test.ts`.

- [ ] **Step 1: Failing tests.** `readCopy` with `extra` `'^sub/[^/]+\\.DAT$'` reads `sub/A.DAT` and not `B.DAT` at
  the top or `sub/X.XMI`; with no `extra`, the names alone; an invalid pattern reads the names alone. `desktopScan()`
  and `androidFolder()` pass `gameSpec().extra`; Ultima V's spec's `extra` reads `MUSIC.XMI` and `upgrade/MUSIC.XMI`.
- [ ] **Step 2:** they fail.
- [ ] **Step 3:** implement: a pattern tested case-insensitively against the path from the copy's folder (`/`
  between folders); Java `Pattern.compile(extra, CASE_INSENSITIVE).matcher(path).find()`.
- [ ] **Step 4:** `npm test`, lint, format pass; the Java compiles where an Android SDK is at hand (else said so).
- [ ] **Step 5: Commit.**

### Task 4: the workflows' names from the repository

**Files:** `.github/workflows/desktop.yml`, `.github/workflows/pages.yml`.

- [ ] **Step 1:** `VITE_BASE: /${{ github.event.repository.name }}/`, `SITE:
  https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}`, the artifacts
  `${{ github.event.repository.name }}-<target>` (`-android`, and the download's pattern `-*`).
- [ ] **Step 2:** `actionlint` clean; for synthwave-pixel/ultima5 every value reads as before.
- [ ] **Step 3: Commit.**

### Task 5: the docs, and proof Ultima V is unchanged

- [ ] **Step 1:** `desktop/README.md`: a paragraph on `brand.cjs` and `builderConfig.cjs`.
- [ ] **Step 2:** `BUILD_VERSION=1.1.241 npm run dist:mac`, `--linux AppImage`, `--win` on origin/main and on this
  branch: the effective configs identical; the artifacts' names identical, and as `v1.1.241`'s release files; the
  Mac app's `Info.plist` (`CFBundleIdentifier`, `CFBundleName`, `CFBundleExecutable`) and the asar's `package.json`
  identical.
- [ ] **Step 3:** the whole branch reviewed afresh; Critical and Important findings fixed, test first.
