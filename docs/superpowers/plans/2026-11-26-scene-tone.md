# Scene tone ('scene' picture kind) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A picture kind `'scene'` for `fx.image`: in the Standard look with Remastered's tiles, a scene's own pixels in
`TONED` (ui/originals.ts), hard-edged square blocks at the colour page's size; elsewhere drawn as now.

**Architecture:** `standardPictures.ts` gains a pure `toned(v)` (a picture's pixels as `TONED`, RGBA memory order, at
its own size, clear where masked). `Screen.styled` returns it as an `'rgba'` over at scale 1 for `'scene'` under the
same gate as the corridor's kinds (`portDungeon(look, tiles)` and the Standard art loaded). Ultima V never passes it.

**Tech Stack:** TypeScript, Vitest.

**Spec:** Ultima IV's short design `docs/superpowers/specs/2026-11-26-u4-toned-scenes-design.md` (in the ultima4 repo),
approach 1; this is its upstream half.

## Global Constraints

- Ultima V's screens byte-for-byte unchanged: its snapshot tests pass untouched; no Ultima V caller passes `'scene'`.
- Game-neutral wording in shared code ("a game that asks for it"); no Ultima IV specifics.
- Only the Standard look with Remastered's set ('modern-pc') changes; any other look, or no Standard art, unchanged.
- Each pixel kept where it is: no blend, no outline restyling.

## Review Focus

- A masked (see-through) pixel of a scene: left showing what is under it, as now (`fb.image` skips masked pixels; test).
- A flipped scene (flags 1/2): the rgba over follows the flip (fb.image handles it at scale 1; test one hflip).
- A picture with no style in Standard: unchanged (test).
- The corridor's kinds: `restyle` never sees `'scene'` (type: `Exclude<PictureKind, 'scene'>`).
- Caching: a scene's toned pixels kept per resource and picture, apart from the corridor's restyled ones.

---

### Task 1: `'scene'` toned in Standard

**Files:**
- Modify: `web/src/game/io.ts` (Effects.image `style` union + doc), `web/src/ui/standardPictures.ts` (PictureKind,
  `toned`, header comment, `restyle` kind type), `web/src/ui/screen.ts` (`styled`)
- Test: `web/tests/sceneTone.test.ts`

**Interfaces:**
- Produces: `PictureKind = 'dungeon' | 'thing' | 'creature' | 'scene'`; `toned(v: Picture): Uint32Array` (width*height,
  `abgr(TONED[c])`, 0 where masked); `Effects.image(..., style?: 'dungeon' | 'thing' | 'creature' | 'scene', name?)`.

- [ ] Step 1: tests (Screen made with `Object.create(Screen.prototype)`, its look/tiles/standard/caches set; a small
  picture of all 16 colours, part masked, drawn on a real Framebuffer with `styled`'s over):
  - Standard + modern-pc + art: every colour-page pixel of the picture is `abgr(TONED[c])`, masked ones untouched; hflip too.
  - Original look, and Standard + pc-ega, and Standard with no art: `styled` gives undefined, pixels `EGA_RGBA[c]`.
  - Standard + modern-pc, no style: undefined (as now).
- [ ] Step 2: run `npx vitest run tests/sceneTone.test.ts` - FAIL (`'scene'` not handled / `toned` missing).
- [ ] Step 3: implement `toned`; `styled` branches on `'scene'` before `restyle`, caching in its own WeakMap.
- [ ] Step 4: run the test - PASS; then the checks (lint, build, prettier, npm test, test:nodata).
- [ ] Step 5: commit `feat(screen): a 'scene' picture kind, drawn in Remastered's toned colours in the Standard look`.
