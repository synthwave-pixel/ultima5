// web/tests/steamArt.test.ts
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ART, installSteamArt, listsShortcut, SHIPPED, shortcutId, steamRoots } from '../../desktop/steamArt.cjs';

const ID = 0xa1b2c3d4; // a shortcut's id: its top bit set
const gameId = (id: number): string => ((BigInt(id) << 32n) | 0x02000000n).toString();
const asRoot = process.getuid?.() === 0; // root writes where a mode says no: the permission tests mean nothing

/** A binary shortcuts.vdf listing shortcuts by id (as Steam writes it: "shortcuts", then each by its index). */
function vdf(ids: number[], key = 'appid'): Buffer {
  const parts: Buffer[] = [Buffer.from('\0shortcuts\0', 'latin1')];
  ids.forEach((id, i) => {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(id);
    parts.push(Buffer.from(`\0${i}\0`, 'latin1'), Buffer.from(`\x02${key}\0`, 'latin1'), n);
    parts.push(Buffer.from('\x01AppName\0Ultima V\0\x01Exe\0"flatpak"\0\x08', 'latin1'));
  });
  parts.push(Buffer.from('\x08\x08', 'latin1'));
  return Buffer.concat(parts);
}

describe("Steam's artwork, put in place by the game", () => {
  const made: string[] = [];
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'u5steam-'));
    made.push(dir);
    return dir;
  };
  /** Every folder under `dir` opened again (the tests lock some), links left alone. */
  const unlock = (dir: string): void => {
    chmodSync(dir, 0o755);
    for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) unlock(join(dir, e.name));
  };
  afterEach(() => {
    for (const dir of made.splice(0)) {
      unlock(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A home with Steam in it (accounts: id -> the shortcuts they list), the art, and where the note goes. */
  function setUp(accounts: Record<string, number[]> = { '111': [ID] }) {
    const home = temp();
    const steam = join(home, '.local', 'share', 'Steam');
    for (const [user, ids] of Object.entries(accounts)) {
      mkdirSync(join(steam, 'userdata', user, 'config'), { recursive: true });
      writeFileSync(join(steam, 'userdata', user, 'config', 'shortcuts.vdf'), vdf(ids));
    }
    const artDir = join(home, 'art');
    mkdirSync(artDir);
    for (const [name] of ART) writeFileSync(join(artDir, name), `picture ${name}`);
    const noteFile = join(home, 'steam-art.json');
    const run = (env: Record<string, string> = { SteamGameId: gameId(ID) }) =>
      installSteamArt({ env, home, platform: 'linux', artDir, noteFile });
    return { home, steam, artDir, noteFile, run, grid: (user = '111') => join(steam, 'userdata', user, 'config', 'grid') };
  }

  it("reads the shortcut's id from Steam's game id, and nothing else as one", () => {
    expect(shortcutId({ SteamGameId: gameId(ID) })).toBe(ID);
    expect(shortcutId({ SteamOverlayGameId: gameId(ID) })).toBe(ID);
    expect(shortcutId({})).toBeNull();
    expect(shortcutId({ SteamGameId: '0' })).toBeNull();
    expect(shortcutId({ SteamGameId: '1091500' })).toBeNull(); // a Steam app's own id
    expect(shortcutId({ SteamGameId: 'abc' })).toBeNull();
    expect(shortcutId({ SteamGameId: '99999999999999999999999' })).toBeNull();
    expect(shortcutId({ SteamGameId: ((BigInt(0x12345678) << 32n) | 0x02000000n).toString() })).toBeNull(); // top bit clear
    expect(shortcutId({ SteamGameId: (BigInt(ID) << 32n).toString() })).toBeNull(); // not a shortcut's type
  });

  it("finds the shortcut's id in shortcuts.vdf, by its appid field in either case", () => {
    expect(listsShortcut(vdf([5, ID]), ID)).toBe(true);
    expect(listsShortcut(vdf([ID], 'AppId'), ID)).toBe(true);
    expect(listsShortcut(vdf([5, 6]), ID)).toBe(false);
    expect(listsShortcut(Buffer.alloc(0), ID)).toBe(false);
    expect(listsShortcut(vdf([ID]).subarray(0, 24), ID)).toBe(false); // cut short, in the id
  });

  it('knows where Steam keeps its data on each system', () => {
    expect(steamRoots({ platform: 'linux', home: '/home/deck', env: {} })).toContain('/home/deck/.local/share/Steam');
    expect(steamRoots({ platform: 'darwin', home: '/Users/a', env: {} })[0]).toBe('/Users/a/Library/Application Support/Steam');
    expect(steamRoots({ platform: 'win32', home: 'C:\\Users\\a', env: { 'ProgramFiles(x86)': 'D:\\Apps' } })[0]).toMatch(/Apps.Steam$/);
  });

  it("puts the artwork in the grid of the account whose shortcut launched it, and no other's", async () => {
    const { run, grid } = setUp({ '111': [ID], '222': [7] });
    const r = await run();
    expect(r.result).toBe('installed');
    expect(readdirSync(grid()).sort()).toEqual([`${ID}.json`, `${ID}.png`, `${ID}_hero.png`, `${ID}_logo.png`, `${ID}p.png`].sort());
    expect(readFileSync(join(grid(), `${ID}p.png`), 'utf8')).toBe('picture capsule.png');
    expect(
      (JSON.parse(readFileSync(join(grid(), `${ID}.json`), 'utf8')) as { logoPosition: { pinnedPosition: string } }).logoPosition
        .pinnedPosition,
    ).toBe('BottomLeft');
    expect(existsSync(grid('222'))).toBe(false);
  });

  it('does nothing unless a non-Steam shortcut launched it', async () => {
    const { run, grid, noteFile } = setUp();
    expect((await run({})).result).toBe('not from a shortcut');
    expect((await run({ SteamGameId: '1091500' })).result).toBe('not from a shortcut');
    expect(existsSync(grid())).toBe(false);
    expect(existsSync(noteFile)).toBe(false);
  });

  it("never replaces the player's own artwork", async () => {
    const { run, grid } = setUp();
    mkdirSync(grid());
    writeFileSync(join(grid(), `${ID}p.png`), 'mine');
    symlinkSync('/nowhere', join(grid(), `${ID}_hero.png`)); // even a link that points nowhere
    const r = await run();
    expect(r).toMatchObject({ result: 'installed', written: 3, kept: 2, failed: 0 });
    expect(readFileSync(join(grid(), `${ID}p.png`), 'utf8')).toBe('mine');
    expect(readdirSync(grid()).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('runs once for a shortcut: the next launch does nothing, even with the artwork since removed', async () => {
    const { run, grid } = setUp();
    expect((await run()).result).toBe('installed');
    rmSync(grid(), { recursive: true });
    expect((await run()).result).toBe('done before');
    expect(existsSync(grid())).toBe(false);
  });

  it("brings its own pictures up to date when the artwork it carries changes, and leaves the player's", async () => {
    const { run, grid, artDir } = setUp();
    expect((await run()).result).toBe('installed');
    // The player changes the cover, and clears the logo (Steam's Clear custom artwork deletes the file).
    writeFileSync(join(grid(), `${ID}p.png`), 'mine');
    rmSync(join(grid(), `${ID}_logo.png`));
    // A new version's artwork: every picture changed.
    for (const [name] of ART) writeFileSync(join(artDir, name), `new picture ${name}`);
    const r = await run();
    expect(r).toMatchObject({ result: 'updated', replaced: 2, failed: 0 }); // the wide capsule and the hero
    expect(readFileSync(join(grid(), `${ID}_hero.png`), 'utf8')).toBe('new picture hero.png');
    expect(readFileSync(join(grid(), `${ID}.png`), 'utf8')).toBe('new picture wide.png');
    expect(readFileSync(join(grid(), `${ID}p.png`), 'utf8')).toBe('mine');
    expect(existsSync(join(grid(), `${ID}_logo.png`))).toBe(false);
    expect(readdirSync(grid()).some((f) => f.endsWith('.tmp'))).toBe(false);
    // Up to date: the next launch does nothing.
    expect((await run()).result).toBe('done before');
  });

  it('updates the pictures an earlier version put there, by their fingerprints, though it noted none', async () => {
    const { home, grid, artDir, noteFile } = setUp();
    const { createHash } = await import('node:crypto');
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
    // As v1.0.38 to v1.0.41 left it: the pictures in place, a note with no fingerprints.
    mkdirSync(grid());
    writeFileSync(join(grid(), `${ID}_hero.png`), 'old hero');
    writeFileSync(join(grid(), `${ID}p.png`), "a cover of the player's own");
    writeFileSync(noteFile, JSON.stringify({ [ID]: { done: true, tries: 1, result: 'installed' } }));
    const r = await installSteamArt({
      env: { SteamGameId: gameId(ID) },
      home,
      platform: 'linux',
      artDir,
      noteFile,
      shipped: { '_hero.png': [sha('old hero')], 'p.png': [sha('an old cover')] },
    });
    expect(r).toMatchObject({ result: 'updated', replaced: 1 });
    expect(readFileSync(join(grid(), `${ID}_hero.png`), 'utf8')).toBe('picture hero.png');
    expect(readFileSync(join(grid(), `${ID}p.png`), 'utf8')).toBe("a cover of the player's own");
  });

  it('knows the pictures it shipped before: one fingerprint for each it puts in place', () => {
    for (const [, suffix] of [...ART, ['', '.json']]) expect(SHIPPED[suffix], suffix).toHaveLength(1);
  });

  it('tries again (three launches at most) where no account lists the shortcut yet', async () => {
    const { run, grid, steam } = setUp({ '111': [7] });
    for (let i = 0; i < 3; i++) expect((await run()).result).toBe('no account lists the shortcut');
    expect((await run()).result).toBe('done before');
    writeFileSync(join(steam, 'userdata', '111', 'config', 'shortcuts.vdf'), vdf([7, ID]));
    expect((await run()).result).toBe('done before'); // given up on
    expect(existsSync(grid())).toBe(false);
  });

  it('comes to no harm without Steam, with a broken note, or with shortcuts.vdf not a file', async () => {
    const home = temp();
    const noteFile = join(home, 'steam-art.json');
    const none = await installSteamArt({ env: { SteamGameId: gameId(ID) }, home, platform: 'linux', artDir: home, noteFile });
    expect(none.result).toBe('no account lists the shortcut');

    const { run, noteFile: note, steam, grid } = setUp();
    writeFileSync(note, '{ not json');
    expect((await run()).result).toBe('installed');

    const odd = setUp({});
    mkdirSync(join(odd.steam, 'userdata', '333', 'config', 'shortcuts.vdf'), { recursive: true });
    mkdirSync(join(odd.steam, 'userdata', 'notanaccount'), { recursive: true });
    expect((await odd.run()).result).toBe('no account lists the shortcut');
    expect(existsSync(join(steam, 'userdata'))).toBe(true);
    expect(existsSync(grid())).toBe(true);
  });

  it('counts each Steam once, though reached by more than one path (~/.steam/steam is a link)', async () => {
    const { run, steam, home, grid } = setUp();
    mkdirSync(join(home, '.steam'));
    symlinkSync(steam, join(home, '.steam', 'steam'));
    const r = await run();
    expect(r).toMatchObject({ result: 'installed', written: 5, kept: 0 });
    expect(r.grids).toHaveLength(1);
    expect(existsSync(grid())).toBe(true);
  });

  it('comes to no harm where the art is missing', async () => {
    const { run, artDir, grid } = setUp();
    rmSync(join(artDir, 'hero.png'));
    const r = await run();
    expect(r.notes.join(' ')).toMatch(/hero\.png: ENOENT/);
    expect(existsSync(join(grid(), `${ID}_hero.png`))).toBe(false);
    expect(existsSync(join(grid(), `${ID}p.png`))).toBe(true);
  });

  it.skipIf(asRoot)("comes to no harm where Steam's folders cannot be read or written, and leaves nothing behind", async () => {
    // A config folder the game may not write in: no grid made, nothing thrown.
    const locked = setUp();
    chmodSync(join(locked.steam, 'userdata', '111', 'config'), 0o555);
    const r = await locked.run();
    expect(r.result).toBe('partly installed');
    expect(r.failed).toBe(5);
    expect(r.notes.join(' ')).toMatch(/EACCES|EPERM/);
    expect(existsSync(locked.grid())).toBe(false);

    // A grid the game may not write in: each picture refused, no file aside left.
    const grid = setUp();
    mkdirSync(grid.grid());
    chmodSync(grid.grid(), 0o555);
    const g = await grid.run();
    expect(g).toMatchObject({ result: 'partly installed', written: 0, failed: 5 });
    expect(readdirSync(grid.grid())).toEqual([]);

    // userdata that cannot be read: no account found, nothing thrown.
    const hidden = setUp();
    chmodSync(join(hidden.steam, 'userdata'), 0o000);
    expect((await hidden.run()).result).toBe('no account lists the shortcut');

    // A note that cannot be written: done all the same, and the next launch keeps what is there.
    const unnoted = setUp();
    chmodSync(unnoted.home, 0o555);
    expect((await unnoted.run()).result).toBe('installed');
    expect(await unnoted.run()).toMatchObject({ result: 'already there', written: 0, kept: 5 });
  });
});
