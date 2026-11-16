# Machine Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Tiles setting picks the machine's whole look while playing - map tiles, the dungeon's first-person pictures and the frame - in both layouts, with debug pages to check every set side by side.

**Architecture:** A *skin* per tile set (none for Modern PC and PC EGA) supplies dungeon pieces from a shipped sheet laid out on the PC's own piece list (DNG1-3, ITEMS, MON0-7), an ink map for the corridor's drawn lines and signs, and frame colours. The game's dungeon composition is untouched: `Screen`'s picture hook draws a skin's piece over the PC piece's place, and the framebuffer recolours the frame's EGA blue and white by the skin.

**Tech Stack:** TypeScript, Vite, Vitest, Node tools in `web/tools/art/` run with `node` (or `npx tsx` where a module has parameter properties).

**Spec:** `docs/superpowers/specs/2026-11-13-machine-skins-design.md`

## Global Constraints

- Players need no new files: every skin's art ships pre-rendered in `web/public/graphics/`, built by a tool from the original.
- Modern PC and PC EGA must render pixel-identically to before, in both layouts (dungeon view and frame).
- Text colours unchanged on every set; story, title, creation and ending pictures unchanged.
- Fallback is per piece: a piece a machine lacks is the EGA piece recoloured to that machine's palette; each tool's header lists them, and `docs/features.md` says so.
- Modern-look behaviours (engraved sign plate, signs two squares off, glow in the dark) stay on every set; plate and lines take the skin's palette. `standardPictures.ts`'s restyle applies to Modern PC only.
- Sources: PC CGA `../gamedata/ultima5/{DNG1-3,ITEMS,MON0-7}.4`; C64 `../ultima5-private/c64/Ultima V - Disk 2.d64` (`DNG1A`-`DNG3C`, `MS0`-`MS7`); Apple `../ultima5-private/apple2/UltimaV-WarriorsofDestiny(Dungeon)(Disk7of8).zip`; X68k recoloured EGA in its tile sheet's eight colours.
- Repo rules: commit only when the user asks; one release at the end with everything; `outputs/` untracked; no Prettier on `docs/features.md` or desktop `*.cjs`; release notes on the GitHub release, never the README; full `npm run lint`, `format:check`, tests and build before release.

## Review Focus

1. **Silhouettes:** a thing or monster drawn over a wall shows the wall through its clear pixels in every set - the skin's own alpha decides, not the EGA mask. Test in Task 2.
2. **Flips:** right-side walls (`flags & 2`) and ceiling things (`flags & 1`) come out mirrored and flipped exactly as the EGA piece is. Test in Task 2.
3. **The three dungeon kinds:** DNG1 (earth), DNG2 (rock), DNG3 (stone) pick their own skin pieces by `g.s.dungeonLook`. Test in Task 2.
4. **Switching sets mid-game:** changing Tiles in a dungeon redraws the view and frame in the new skin at once, with no stale cached piece. Test in Task 2.
5. **Dark and signs:** the Modern look's darkness (`darkenUnlit`) and the sign plate (near, two off, beside) render over skin pieces in every set. Checked on `dungeon.html` (Task 8) and by a test in Task 2 that a sign square draws with a skin set.

---

### Task 1: Baselines for Modern PC and PC EGA

**Files:**
- Modify: `web/src/dev/dungeon.ts`, `web/dungeon.html`
- Create: `web/tests/skinBaseline.test.ts`

**Interfaces:**
- Produces: `dungeon.html?hashes` prints one line per (look, set, case): `look set case fnv1a32(hx)`; `web/tests/skinBaseline.test.ts` holds the same for the framebuffer-level cases Task 2 can render in node.

- [ ] **Step 1:** Add a `?hashes` mode to `dev/dungeon.ts`: for each look ('standard', 'original') with tiles 'modern-pc' / 'pc-ega', every case the page already draws, an FNV-1a 32 hash of the corridor's colour-page pixels, printed into a `<pre id="hashes">`.
- [ ] **Step 2:** Open it with Playwright (game files uploaded from `../gamedata`), save the text to the scratchpad as `baseline-hashes.txt`. Also save full-page frame screenshots (world, town, dungeon) in both looks with Modern PC and PC EGA.
- [ ] **Step 3:** In `skinBaseline.test.ts`, a test that draws every DNG1-3 wall piece, ITEMS thing and MON frame through `Framebuffer.image` with no `over` and with today's Modern `styled` path, hashes the colour page, and compares to constants recorded now. Run: `npx vitest run tests/skinBaseline.test.ts` - PASS.

### Task 2: Skin plumbing

**Files:**
- Create: `web/src/ui/skins.ts`, `web/tests/skins.test.ts`
- Modify: `web/src/ui/framebuffer.ts` (`ImageOver`, `image`), `web/src/ui/screen.ts` (`styled`, `setTileArt`, a `makeSkin` hook), `web/src/main.ts`, `web/src/game/dungeon.ts` (line ink only, through `g.p.fx`)

**Interfaces:**
- Produces, in `skins.ts`:
  - `type PieceFile = 'DNG1' | 'DNG2' | 'DNG3' | 'ITEMS' | \`MON${0|1|2|3|4|5|6|7}\``
  - `const PIECES: readonly { file: PieceFile; i: number; w: number; h: number; x: number; y: number }[]` - the PC's 28 + 28 + 28 wall pieces, 20 things, 8 x 6 monster frames at their EGA sizes (DNG pieces 24x164 ... 28x114, ITEMS 40x80 ... 16x16, MON 24x66, 16x25, 8x6), packed into one sheet `SKIN_SHEET_W` (512) wide, row by row; `pieceAt(file, i)`.
  - `interface Skin { name: Tiles; piece(file: PieceFile, i: number): Uint32Array | null /* RGBA memory order, w x h of PIECES, alpha 0 clear */; ink: Uint32Array /* 16: EGA index -> RGBA, for the corridor's lines and plain plots */; sign: { plate: number; ink: number } /* 0xRRGGBB */; frame: FrameSkin }`
  - `interface FrameSkin { blue: number; white: number /* 0xRRGGBB the frame's EGA blue and white become */ }`
  - `function skinFromSheet(name: Tiles, sheet: Uint32Array, width: number, palette: Pick<Skin, 'ink' | 'sign' | 'frame'>): Skin`
  - `function recolouredPiece(v: Picture, palette: readonly number[]): Uint32Array` - an EGA picture in the nearest of `palette`'s colours (by perceived distance), clear where its mask is: the per-piece fallback.
- Produces, in `framebuffer.ts`: `ImageOver` gains `{ kind: 'skin'; px: Uint32Array; width: number }` - drawn over the picture's whole rectangle, opaque where `px`'s alpha is, EGA mask ignored; flips as `rgba` does. `Framebuffer.lineInk: Uint32Array | null` used by `line`/`plot` for the colour page.
- Produces, in `screen.ts`: `makeSkin: ((kind: Tiles) => Promise<Skin | null>) | null`; skins cached by kind; `styled` returns a `skin` over in either look when a skin is set (keyed by the resource's file name), else today's behaviour.

- [ ] **Step 1: Write failing tests** in `skins.test.ts`:
  - `PIECES` covers DNG1-3 (28 each), ITEMS (20), MON0-7 (6 each) at the EGA sizes read from `gamedata` `.16` files; no two overlap; all inside `SKIN_SHEET_W`.
  - A skin piece with a clear hole draws the wall beneath through it, where the EGA mask is opaque (Review Focus 1).
  - `flags` 2 and 1 mirror and flip a skin piece exactly as the EGA piece (compare against the EGA path with a one-to-one palette) (Review Focus 2).
  - With a skin whose DNG1/2/3 pieces are three flat colours, `refresh` in a dungeon of each kind shows that kind's colour (Review Focus 3).
  - `setTileArt` to another kind mid-dungeon then `refresh` shows the new skin's colour (Review Focus 4).
  - A sign square refreshes with a skin set without throwing, plate in `skin.sign.plate` (Review Focus 5).
  - `recolouredPiece` uses only `palette`'s colours and is clear exactly where the mask is.
- [ ] **Step 2:** Run `npx vitest run tests/skins.test.ts` - FAIL (module missing).
- [ ] **Step 3:** Implement as the Interfaces say. `main.ts`: `screen.makeSkin` loads `public/graphics/<kind>-u5-dungeon.png` via the skins table (empty for 'modern-pc' and 'pc-ega').
- [ ] **Step 4:** Run the new tests and `tests/skinBaseline.test.ts` - PASS.

### Task 3: PC CGA skin

**Files:**
- Create: `web/tools/art/cgaDungeon.ts`, `web/public/graphics/pc-cga-u5-dungeon.png`
- Modify: `web/package.json` (`"cga-dungeon": "node tools/art/cgaDungeon.ts"`), `web/src/ui/skins.ts` (CGA palette entry), `web/tests/skins.test.ts`

**Interfaces:**
- Consumes: `PIECES`, `SKIN_SHEET_W` (Task 2); `CGA_COLOURS` (`tools/art/cga.ts`).
- Produces: `cgaPicture(res: Uint8Array, i: number): { width; height; px: Uint32Array }` - a `.4` picture (offsets as `.16`; 2 bits a pixel, high bits leftmost, rows padded as the `.16`'s; its mask as the `.16`'s), and `sheet(files: Record<PieceFile, Uint8Array>): Image`.

- [ ] **Step 1: Failing tests:** `cgaPicture` reads `DNG1.4` piece 0 as 24x164 in only `CGA_COLOURS`; the shipped sheet equals `sheet()` of the `.4` files byte for byte; every `PIECES` entry is non-blank.
- [ ] **Step 2:** Run - FAIL.
- [ ] **Step 3:** Implement; generate with `npm run cga-dungeon -- ../gamedata/ultima5`. CGA ink: EGA lines to the CGA's white/cyan/magenta as the CGA game drew them (check `DNG*.4` and a CGA dungeon screenshot); frame blue to cyan, white to white.
- [ ] **Step 4:** Run - PASS.

### Task 4: X68k skin and the recolour fallback

**Files:**
- Create: `web/tools/art/recolourDungeon.ts`, `web/public/graphics/x68k-u5-dungeon.png`
- Modify: `web/package.json` (`"recolour-dungeon"`), `web/src/ui/skins.ts`, `web/tests/skins.test.ts`

**Interfaces:**
- Consumes: `recolouredPiece` (Task 2); the X68k tile sheet's colours.
- Produces: `npm run recolour-dungeon -- <set> <palette json>` writes `<set>-u5-dungeon.png` from the player's-copy `.16`s; `X68K_PALETTE` (its tile sheet's eight colours).

- [ ] **Step 1: Failing tests:** the shipped X68k sheet equals the tool's output from `gamedata`'s `.16`s and holds only `X68K_PALETTE` colours.
- [ ] **Step 2:** Run - FAIL. **Step 3:** Implement and generate. **Step 4:** Run - PASS.

### Task 5: C64 skin

**Files:**
- Create: `web/tools/art/c64Dungeon.ts`, `web/public/graphics/c64-u5-dungeon.png`
- Modify: `web/package.json` (`"c64-dungeon"`), `web/src/ui/skins.ts`, `web/tests/skins.test.ts`

**Interfaces:**
- Consumes: `d64File` (`tools/art/c64.ts`), `C64` palette, `PIECES`, `recolouredPiece`.
- Produces: `c64Dungeon.ts` header documenting the format of `DNG1A`-`DNG3C` and `MS0`-`MS7` and the mapping onto `PIECES` (which pieces are the C64's own, which recoloured).

- [ ] **Step 1:** Decode disk 2's files into images; write each raw to the scratchpad and compare by eye with C64 dungeon screenshots (MobyGames) until they read right. Record the format in the header.
- [ ] **Step 2: Failing tests:** the shipped sheet equals the tool's output from the `.d64` (skipped with a note if `../ultima5-private` is absent); only `C64` colours; every piece non-blank.
- [ ] **Step 3:** Implement the mapping: each C64 piece fitted to its PC counterpart's rectangle (centred, not squeezed); the rest recoloured. Generate.
- [ ] **Step 4:** Run - PASS.

### Task 6: Apple skins (Color, //e, //c)

**Files:**
- Create: `web/tools/art/apple2Dungeon.ts`, `web/public/graphics/apple2-u5-dungeon.png`, `web/public/graphics/apple2-u5-dungeon-mono.png`
- Modify: `web/package.json` (`"apple2-dungeon"`), `web/src/ui/skins.ts`, `web/tests/skins.test.ts`

**Interfaces:**
- Consumes: the disk reading in `tools/art/apple2.ts`, its colour decoding, `appleMono`, `GREEN_SCREEN`, `WHITE_SCREEN` (`src/ui/appleArt.ts`), `PIECES`, `recolouredPiece`.
- Produces: the Apple dungeon format and mapping in the tool's header; //e and //c skins from the mono sheet tinted, as their tiles are.

- [ ] **Step 1:** Find the dungeon pictures on Disk 7 (and Disk 1 if they live there); decode; compare by eye with Apple dungeon screenshots. Record the format.
- [ ] **Step 2: Failing tests:** both sheets equal the tool's output (skipped without `../ultima5-private`); mono lit pixels exactly the colour sheet's lit bits; every piece non-blank.
- [ ] **Step 3:** Implement and generate. **Step 4:** Run - PASS.

### Task 7: Frame skins

**Files:**
- Modify: `web/src/ui/framebuffer.ts` (frame recolour, Modern candidates), `web/src/ui/screen.ts`, `web/src/ui/skins.ts` (each set's `FrameSkin`), `web/tests/skins.test.ts`

**Interfaces:**
- Consumes: `Skin.frame` (Task 2); the chrome regions (`chrome`, `chromeFrom`, `chromeBox`, `chromeSpeech`, `chromeHole`).
- Produces: `Framebuffer.frameSkin: FrameSkin | null`; `Framebuffer.modernFrame: 'bevel' | 'line'` (a dev-only choice until the user picks; then the loser and this field go).
  - PC (1988) layout: the frame's EGA blue and white within the chrome regions shown as `frameSkin.blue` / `.white`.
  - Modern layout, 'bevel': the copper bevel toned to `frameSkin.blue` (`chromeTone` from its hue, saturation and value), the place tones off while a skin is set.
  - Modern layout, 'line': no bevel; blue and white flat as in the PC layout.

- [ ] **Step 1: Failing tests:** with no skin, frame pixels identical to Task 1's baseline; with the CGA skin in the PC layout, frame pixels only cyan/white/black; Modern 'bevel' with a skin draws no copper-hue pixel; 'line' draws only the skin's two colours plus black.
- [ ] **Step 2:** Run - FAIL. **Step 3:** Implement; each machine's colours from screenshots of its version. **Step 4:** Run - PASS.

### Task 8: Debug pages

**Files:**
- Modify: `web/src/dev/dungeon.ts`, `web/dungeon.html`, `web/src/dev/pictures.ts`, `web/pictures.html`, `web/debug.html` (links)
- Create: `web/frames.html`, `web/src/dev/frames.ts`

- [ ] **Step 1:** `dungeon.html?sets=all`: for each case already drawn (every cell sort, things, signs near/two off/beside, the eight creatures one, two and three squares off, dark and lit), a row of all eight sets, in a chosen layout (`look=standard|original|both`).
- [ ] **Step 2:** `pictures.html?skins`: every `PIECES` entry for every set side by side, recoloured pieces marked.
- [ ] **Step 3:** `frames.html`: a world, town and dungeon screen per set, in the PC layout and in Modern 'bevel' and 'line', side by side.
- [ ] **Step 4:** Open each page in the browser pane; read console for errors; screenshot.

### Task 9: User review, frame choice, docs, release

**Files:**
- Modify: `web/src/ui/framebuffer.ts`, `web/src/dev/frames.ts` (remove the losing candidate), `docs/features.md`, `README.md` (credits), `docs/developer-notes.md` (the new commands)

- [ ] **Step 1:** Send the user the pages' screenshots and links; wait for their check and frame pick.
- [ ] **Step 2:** Remove the losing candidate and `modernFrame`; fix anything the user flags.
- [ ] **Step 3:** Docs: features.md (each set's dungeons and frame, which pieces are recoloured), README credits (CGA/C64/Apple dungeon art Origin Systems; X68k recoloured), developer-notes rows for the new commands.
- [ ] **Step 4:** Re-run `dungeon.html?hashes` for Modern PC and PC EGA; compare with `baseline-hashes.txt` - identical.
- [ ] **Step 5:** `npm run lint`, `npm run format:check`, `npm test`, `npm run build` - all pass. Then, on the user's word, commit and release per the usual flow.
