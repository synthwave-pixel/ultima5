/**
 * main.ts
 *
 * Browser entry point: find the player's game files (installed, or the
 * installer), then start the game.
 */

import { egaTileArt } from './ui/egaTiles.ts';
import { CARVE_STYLES, type CarveStyle } from './ui/carve.ts';
import { drawCombatMarks } from './game/combat.ts';
import { gameFiles } from './boot.ts';
import { loadAppleArt, loadStandardArt, loadStandardFont } from './ui/loadArt.ts';
import { HI_HEIGHT, HI_WIDTH } from './ui/framebuffer.ts';
import { readFont } from './data/font.ts';
import { lzwDecompress } from './data/lzw.ts';
import { GameData } from './game/data.ts';
import { Game } from './game/game.ts';
import { journeyOnward, runGame } from './game/run.ts';
import { Save } from './game/save.ts';
import { currentCharacter, localSave, restore } from './game/storage.ts';
import { watchOtherWindows } from './game/otherWindows.ts';
import { Intro, unmadeAvatar } from './game/intro.ts';
import { Screen } from './ui/screen.ts';
import { installPageHooks } from './ui/pageHooks.ts';
import { SCANLINE_LEVEL, scanlineBands } from './ui/scanlines.ts';
import { PcSound } from './ui/sound.ts';
import { loadOptions } from './game/settings.ts';
import { chromeTone } from './game/chromeTone.ts';
import { appQuit, launchWarning, warningDue, type CapacitorLike } from './ui/platform.ts';
import { showNotice } from './ui/notice.ts';
import { installCrashHandler, reportCrash } from './ui/crash.ts';
import { registerSW } from 'virtual:pwa-register';

const WARNED_KEY = 'ultima5.iosWarned';

// Whatever breaks from here on is said, with a way out (crash.ts): the apps have no reload button of the browser's.
installCrashHandler();

// The installed app: a new version downloads in the background and waits; the title menu offers the restart
// (intro.ts). A page left running looks again every hour. The desktop app (an app:// origin) and the Android app
// (Capacitor) ship their own files and have no service worker; their updates are new builds.
const capacitor = (window as { Capacitor?: CapacitorLike }).Capacitor;
const native = Boolean(capacitor?.isNativePlatform?.());
let updateReady = false;
const applyUpdate =
  location.protocol.startsWith('http') && !native && !import.meta.env.DEV
    ? registerSW({
        onNeedRefresh() {
          updateReady = true;
        },
        onRegisteredSW(_url, registration) {
          // Offline, the look fails, and is tried again the next hour: nothing broke.
          if (registration) setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
        },
      })
    : () => Promise.resolve();

/**
 * What the page keeps is kept: ask the browser not to evict it, and warn an iOS tab of WebKit's seven days - in the
 * page (notice.ts), read before the game starts.
 */
async function keepStorage(): Promise<void> {
  // Refused or not, the game goes on: asking is all it can do.
  if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
  const warning = launchWarning(navigator, (q) => window.matchMedia(q));
  if (!warning) return;
  let last: number | null = null;
  try {
    const raw = localStorage.getItem(WARNED_KEY);
    last = raw === null ? null : Number(raw);
  } catch {
    /* storage refused: the warning shows again */
  }
  if (!warningDue(last, Date.now())) return;
  await showNotice('Keeping your game', warning);
  try {
    localStorage.setItem(WARNED_KEY, String(Date.now()));
  } catch {
    /* as above */
  }
}

/**
 * A line on the screen before the game can draw one (Loading...; a failure to start has the crash box): at the game's
 * own size, in the Standard lettering once it has come (it needs none of the game's files), until then in the
 * browser's.
 */
let noticeFont: Uint8Array | null = null;
function canvasNotice(canvas: HTMLCanvasElement, text: string): void {
  canvas.width = HI_WIDTH;
  canvas.height = HI_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const G = 32; // a glyph's cell, as the game draws its text
  const lines = wrap(text, Math.floor(canvas.width / G) - 2);
  const top = Math.round(canvas.height / 2 - (lines.length * G) / 2);
  if (!noticeFont) {
    ctx.fillStyle = '#fff';
    ctx.font = `${G * 0.8}px monospace`;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, (canvas.width - ctx.measureText(l).width) / 2, top + i * G));
    return;
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  lines.forEach((l, i) => {
    const left = Math.round((canvas.width - l.length * G) / 2);
    [...l].forEach((ch, k) => {
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code > 0x7f) return;
      const glyph = noticeFont!.subarray((code - 0x20) * G * G, (code - 0x1f) * G * G);
      for (let y = 0; y < G; y++)
        for (let x = 0; x < G; x++) if (glyph[y * G + x]) px[(top + i * G + y) * canvas.width + left + k * G + x] = 0xffffffff;
    });
  });
  ctx.putImageData(img, 0, 0);
}

/**
 * The boot screen while the game loads (web/public/boot.png, tools/key-art.mjs): the game screen's own 320 by 200,
 * grown to the display's size unsmoothed as the game's picture is, with the game's scanlines over it in the display's
 * own pixels as the Scanlines setting draws them (scanlines.ts), whatever the setting. Drawn again as the window is
 * resized, until `stop` is called (the game about to draw) - which waits until it has been up BOOT_MS, so that a quick
 * start does not flash it. It has a moment to come (it is cached with the page); if it does not, or cannot, the
 * Loading notice stays, and nothing is waited for.
 */
const BOOT_MS = 1200;
let bootShown = false;
function bootScreen(canvas: HTMLCanvasElement): Promise<() => Promise<void>> {
  let shownAt = 0;
  let live = true;
  const art = new Image();
  const draw = (): void => {
    if (!live || !art.complete || !art.naturalWidth) return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    [canvas.width, canvas.height] = [Math.round(r.width * devicePixelRatio), Math.round(r.height * devicePixelRatio)];
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(0,0,0,${1 - SCANLINE_LEVEL})`;
    for (const [y, rows] of scanlineBands(canvas.height)) ctx.fillRect(0, y, canvas.width, rows);
    bootShown = true;
    shownAt ||= performance.now();
  };
  const stop = async (): Promise<void> => {
    if (shownAt) await new Promise((r) => setTimeout(r, Math.max(0, shownAt + BOOT_MS - performance.now())));
    live = false;
    window.removeEventListener('resize', draw);
  };
  window.addEventListener('resize', draw);
  return new Promise((done) => {
    const settle = (): void => done(stop);
    art.onload = () => {
      draw();
      settle();
    };
    art.onerror = settle;
    setTimeout(settle, 1500);
    art.src = `${import.meta.env.BASE_URL}boot.png`;
  });
}

/** A line broken into lines of at most `width` characters, at spaces where it can be. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word;
    while (line.length > width) {
      out.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line) out.push(line);
  return out;
}

async function start(): Promise<void> {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  canvasNotice(canvas, 'Loading...');
  // The boot screen over the notice, as soon as it comes.
  const boot = bootScreen(canvas);
  // The lettering comes in a moment, from the port's own files; the notice is drawn again in it (where the boot screen
  // did not come).
  const font = loadStandardFont();
  const lettering = font.then(async (f) => {
    noticeFont = f;
    if (f && !bootShown && !(window as unknown as { u5?: unknown }).u5) canvasNotice(canvas, 'Loading...');
  });
  // The tile art, while the game's files are found: all of it is had before the notice goes.
  const art = loadStandardArt(font);
  const files = await gameFiles();
  await lettering;
  const data = new GameData(files);
  const tiles = lzwDecompress(files.get('TILES.16'));
  // The boot screen stays as it is, and is not drawn again, until the game draws over it.
  await (
    await boot
  )();
  const screen = new Screen(canvas, tiles, [readFont(files.get('IBM.CH')), readFont(files.get('RUNES.CH'))]);
  const g = new Game(data, screen, new Save(files.get('INIT.GAM')));
  // The latest character's settings (characters.ts): the title shows their look and plays their music.
  currentCharacter();
  g.options = loadOptions();
  // ?ux= and ?tiles= in development (the tiles page's view of a place): the look for this page alone, not saved.
  if (import.meta.env.DEV) {
    const { lookAsked } = await import('./game/devStarts.ts');
    lookAsked(g.options, new URLSearchParams(location.search));
  }
  // Modern PC, the Standard look's first set: the actors and furniture the game's own tiles, lifted off their ground
  // (originals.ts). The others are made when first chosen: Apple ][ and PC EGA from the tiles.
  const modern = await art;
  if (modern) {
    modern.useOriginals(tiles);
    screen.addTiles('modern-pc', modern);
  }
  screen.makeTiles = (kind) =>
    kind === 'apple2'
      ? loadAppleArt(tiles, modern)
      : kind === 'pc-ega'
        ? Promise.resolve(egaTileArt(tiles, modern))
        : Promise.resolve(null);
  // The lettering's faces before the game draws a letter, so none is drawn the old way first (a few seconds at most).
  await Promise.race([screen.lettersLoaded, new Promise((r) => setTimeout(r, 4000))]);
  // How a dungeon sign's letters are cut into the wall: ?carve=paint, groove, vcut or fresh (for choosing among them).
  const carveStyle = new URLSearchParams(location.search).get('carve');
  if (CARVE_STYLES.includes(carveStyle as CarveStyle)) screen.fb.carve = carveStyle as CarveStyle;
  // How much larger than 1988's a sign is carved on the wall (1.5 unless ?signscale= says), reflowed to fit.
  const signScale = Number(new URLSearchParams(location.search).get('signscale'));
  if (signScale > 0) screen.fb.signScale = signScale;
  // A sign cut into the wall itself, not its bolted plate (?signplate=off).
  if (new URLSearchParams(location.search).get('signplate') === 'off') screen.fb.signPlate = false;
  const sound = new PcSound(data.ovl);
  screen.sound = sound;
  screen.onKey = () => sound.unlock();
  window.addEventListener('pointerdown', () => sound.unlock());
  // The iOS warning first: closing it is pressed before the game's own keys and gamepad are listened to.
  await keepStorage();
  installPageHooks(g, screen, canvas, tiles, sound);
  g.hooks.update = { ready: () => updateReady, apply: () => void applyUpdate(true) };
  // The desktop app closes its window to quit (its last window closing quits it), the Android app exits; a browser
  // tab gets no Quit.
  g.hooks.quit = appQuit(location.protocol, () => window.close(), capacitor);
  g.ool.under.set(files.get('INIT.OOL').subarray(0, 256));
  g.drawCombatMarks = () => drawCombatMarks(g);
  (window as unknown as { u5: unknown }).u5 = { g, screen };
  canvas.focus();
  const params = new URLSearchParams(location.search);
  // ?peek (the tiles page's, looking at a place): nothing this window does is saved over the player's game.
  if (import.meta.env.DEV && params.has('peek')) localSave.off = true;
  // ?play skips the title in development: the saved game, or a new one.
  const saved = localSave.read();
  if (import.meta.env.DEV && params.has('play')) {
    if (saved && !params.has('new')) restore(g, saved);
    else unmadeAvatar(g);
  } else {
    const intro = new Intro(g);
    intro.prepare();
    await intro.run();
  }
  journeyOnward(g);
  // The same character played in another window: watched for from here on (otherWindows.ts).
  const playing = currentCharacter();
  if (playing !== null && !localSave.off) watchOtherWindows(g, playing);
  // The frame in the colour of where the party is (the Standard look's, chromeTone.ts), from now on.
  screen.toneOf = () => chromeTone(g);
  // In development, ?at=dungeon:N (1-8) starts in that dungeon at its entrance from Britannia (?at=dungeon:N:under,
  // from the Underworld: its last level, as enterDungeon puts a party coming up), ?at=town:N (1-32) at that place's
  // south gate - or
  // ?at=town:N:X,Y and ?at=town:N:X,Y:L at that square of its level L - ?at=world:X,Y and ?at=under:X,Y on that square of
  // Britannia or the Underworld (?at=under:N beneath dungeon N), and ?at=ending shows the ending's pictures: for looking
  // at them. ?at=arena:N (0-15) fights in that arena of BRIT.CBT, ?at=room:D:R (or room:D:R:L, on level L) enters
  // dungeon D's room R from its door (devStarts.ts).
  if (import.meta.env.DEV && params.get('at') === 'ending') {
    const { endingPages } = await import('./game/story.ts');
    await endingPages(g);
  }
  const outside = import.meta.env.DEV ? /^(world|under):(\d+)(?:,(\d+))?$/.exec(params.get('at') ?? '') : null;
  if (outside?.[3] !== undefined)
    Object.assign(g.s, { mapId: 0, level: outside[1] === 'under' ? 0xff : 0, x: Number(outside[2]), y: Number(outside[3]) });
  else if (outside?.[1] === 'under') {
    // ?at=under:N (1-8): in the Underworld beneath dungeon N's entrance, where its lowest ladder lets a party out
    // (dungeon.ts dungeonExitNow); Doom's own door, which is down there.
    const loc = g.data.locations[0x20 + Number(outside[2]) - 1];
    if (loc) Object.assign(g.s, { mapId: 0, level: 0xff, x: loc.x, y: loc.y });
  }
  const at = import.meta.env.DEV ? /^(dungeon|town):(\d+)(?::(\d+),(\d+)(?::(-?\d+))?|:(under))?$/.exec(params.get('at') ?? '') : null;
  if (at) {
    const { stashWorldActors } = await import('./game/outdoors.ts');
    const n = Number(at[2]);
    stashWorldActors(g);
    if (at[1] === 'dungeon') {
      g.s.dungeon.set(files.get('DUNGEON.DAT').subarray((n - 1) * 0x200, n * 0x200));
      // Doom, whose door is in the Underworld, is entered on its first level whichever way (as enterDungeon).
      if (at[6] && n !== 8) Object.assign(g.s, { mapId: 0x20 + n, level: 7, x: 7, y: 7, facing: 3, d6602: 4 });
      else Object.assign(g.s, { mapId: 0x20 + n, level: 0, x: 1, y: 1, facing: 1, d6602: 5 });
    } else {
      Object.assign(g.s, { mapId: n, level: Number(at[5] ?? 0) & 0xff, x: Number(at[3] ?? 15), y: Number(at[4] ?? 30) });
      const { enterTown } = await import('./game/town.ts');
      await enterTown(g, true);
    }
  }
  const battle = import.meta.env.DEV ? /^(arena|room):(\d+)(?::(\d+))?(?::(\d+))?$/.exec(params.get('at') ?? '') : null;
  let room = false;
  if (battle) {
    const dev = await import('./game/devStarts.ts');
    if (battle[1] === 'arena') await dev.startArena(g, Number(battle[2]));
    else {
      const { stashWorldActors } = await import('./game/outdoors.ts');
      stashWorldActors(g);
      const level = battle[4] === undefined ? undefined : Number(battle[4]);
      room = dev.startRoom(g, files.get('DUNGEON.DAT'), Number(battle[2]), Number(battle[3] ?? 0), level);
    }
  }
  // A dungeon start is met as an arrival from outside (its creature placed), a town's as enterTown has met it above; a
  // room's door, so entered, is gone through.
  await runGame(g, at?.[1] === 'dungeon' || room);
}

// A game that cannot start, or that breaks in its running (runGame's loop is start's own), gets the crash box.
start().catch((error: unknown) => {
  console.error(error);
  reportCrash({ error });
});
