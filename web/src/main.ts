/**
 * main.ts
 *
 * Browser entry point: find the player's game files (installed, or the
 * installer), then start the game.
 */

import { useSaves } from './game/saveCodec.ts';
import { ultima5Saves } from './game/ultima5Saves.ts';
import { egaTileArt } from './ui/egaTiles.ts';
import { CARVE_STYLES, type CarveStyle } from './ui/carve.ts';
import { drawCombatMarks } from './game/combat.ts';
import { chooseStore, gameFiles, steamNote } from './boot.ts';
import { loadAppleArt, loadSheetArt, loadSkin, loadStandardArt, loadStandardFont } from './ui/loadArt.ts';
import { readFont } from './data/font.ts';
import { lzwDecompress } from './data/lzw.ts';
import { GameData } from './game/data.ts';
import { Game } from './game/game.ts';
import { runGame } from './game/run.ts';
import { journeyOnward } from './game/playScreen.ts';
import { Save } from './game/save.ts';
import { currentCharacter, localSave } from './game/storage.ts';
import { restore } from './game/ultima5Saves.ts';
import { watchOtherWindows } from './game/otherWindows.ts';
import { Intro, unmadeAvatar } from './game/intro.ts';
import { Screen } from './ui/screen.ts';
import { installPageHooks } from './ui/pageHooks.ts';
import { mapKey, showMap } from './ui/mapView.ts';
import { PcSound } from './ui/sound.ts';
import { loadOptions } from './game/settings.ts';
import { chromeTone } from './game/chromeTone.ts';
import { appQuit, appVersion } from './ui/platform.ts';
import { installCrashHandler, reportCrash } from './ui/crash.ts';
import {
  bootScreen,
  bootScreenShown,
  canvasNotice,
  capacitor,
  keepStorage,
  updateHook,
  useNoticeFont,
  watchForUpdates,
} from './appStart.ts';
import { actor, actorList, actorSlots } from './game/actors.ts';

// Whatever breaks from here on is said, with a way out (crash.ts): the apps have no reload button of the browser's.
installCrashHandler();
// The installed app's newer versions looked for (appStart.ts).
watchForUpdates();

async function start(): Promise<void> {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  canvasNotice(canvas, 'Loading...');
  // The boot screen over the notice, as soon as it comes.
  const boot = bootScreen(canvas);
  // The lettering comes in a moment, from the port's own files; the notice is drawn again in it (where the boot screen
  // did not come).
  const font = loadStandardFont();
  const lettering = font.then(async (f) => {
    useNoticeFont(f);
    if (f && !bootScreenShown() && !(window as unknown as { u5?: unknown }).u5) canvasNotice(canvas, 'Loading...');
  });
  // The tile art, while the game's files are found: all of it is had before the notice goes.
  const art = loadStandardArt(font);
  // Where the saves are kept, before anything reads one.
  // How Ultima V's saves are kept (ultima5Saves.ts), before anything reads one; Game sets the same.
  useSaves(ultima5Saves);
  chooseStore();
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
  // (originals.ts). The others are made when first chosen: PC EGA from the tiles, PC CGA and the other computers' from
  // their sheets.
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
        : kind === 'modern-pc' || kind === 'pc-vga' // (Upgrade VGA: never Ultima V's, settings.ts TILES)
          ? Promise.resolve(null)
          : loadSheetArt(kind, tiles, modern);
  // Each set's skin (skins.ts): its dungeon and frame, made when its set is first chosen.
  screen.makeSkin = loadSkin;
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
  installPageHooks(g, screen, canvas, sound, {
    show: (underworld, focus) => showMap(g, tiles, underworld, () => screen.flushKeys(), screen.standardArt, focus),
    key: mapKey,
  });
  g.hooks.update = updateHook(capacitor);
  const version = await appVersion(capacitor);
  g.hooks.version = () => version;
  g.hooks.note = steamNote;
  // The desktop app closes its window to quit (its last window closing quits it), the Android app exits; a browser
  // tab gets no Quit.
  g.hooks.quit = appQuit(location.protocol, () => window.close(), capacitor);
  g.ool.under.set(files.get('INIT.OOL').subarray(0, 256));
  g.drawCombatMarks = () => drawCombatMarks(g);
  // The console's and the pilot bot's way in (tools/pilot); the actor table only through actors.ts's functions.
  (window as unknown as { u5: unknown }).u5 = { g, screen, table: { actor, actorList, actorSlots } };
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
  let relocated = false;
  if (battle) {
    const dev = await import('./game/devStarts.ts');
    if (battle[1] === 'arena') {
      // A save loaded in the fight (the Pause menu's) is gone on from, as the main loop goes on from it (run.ts).
      const { Relocate } = await import('./game/relocate.ts');
      try {
        await dev.startArena(g, Number(battle[2]));
      } catch (e) {
        if (!(e instanceof Relocate)) throw e;
        relocated = true;
      }
    } else {
      const { stashWorldActors } = await import('./game/outdoors.ts');
      stashWorldActors(g);
      const level = battle[4] === undefined ? undefined : Number(battle[4]);
      room = dev.startRoom(g, files.get('DUNGEON.DAT'), Number(battle[2]), Number(battle[3] ?? 0), level);
    }
  }
  // A dungeon start is met as an arrival from outside (its creature placed), a town's as enterTown has met it above; a
  // room's door, so entered, is gone through.
  await runGame(g, at?.[1] === 'dungeon' || room || relocated);
}

// A game that cannot start, or that breaks in its running (runGame's loop is start's own), gets the crash box.
start().catch((error: unknown) => {
  console.error(error);
  reportCrash({ error });
});
