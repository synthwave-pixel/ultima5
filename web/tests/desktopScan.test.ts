// web/tests/desktopScan.test.ts
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import brand from '../../desktop/brand.cjs';
import { findCopies, gameFolderName, readCopy, roots } from '../../desktop/scan.cjs';

/** A folder named like the game, and the file a copy is known by (brand.cjs: Ultima V's folder in Steam, DATA.OVL). */
const G = brand.steam.installDir;
const M = brand.scan.marker;

describe('the desktop scan', () => {
  const made: string[] = [];
  /** A fresh temporary folder, removed after the test. */
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'u5scan-'));
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('knows the game by its folder in Steam (brand.cjs), and nothing else by it', () => {
    expect(gameFolderName(G)).toBe(true);
    expect(gameFolderName(`${G}™.app`)).toBe(true);
    for (const n of ['Documents', 'Other Game', 'notes']) expect(gameFolderName(n), n).toBe(false);
  });

  it('looks beside the app, at home, then where GOG and the launchers put games, per platform', () => {
    const at = { home: '/h', env: {}, appDir: '/app', drives: [] as string[] };
    expect(roots({ ...at, platform: 'darwin' })).toEqual(['/app', '/h', '/Applications', '/h/Applications']);
    expect(roots({ ...at, platform: 'linux', env: { APPIMAGE: '/dl/Ultima-V.AppImage' } })).toEqual([
      '/dl',
      '/h',
      '/h/GOG Games',
      '/h/Games',
      '/h/Games/Heroic',
      '/h/.wine/drive_c/GOG Games',
      '/h/Games/Heroic/Prefixes',
    ]);
    const win = roots({ ...at, platform: 'win32', home: 'C:\\Users\\a', appDir: 'D:\\u5app', drives: ['C:', 'D:'] });
    expect(win.slice(0, 2)).toEqual(['D:\\u5app', 'C:\\Users\\a']);
    expect(win).toContain('C:\\GOG Games');
    expect(win).toContain('D:\\GOG Games');
    expect(win).toContain('C:\\Program Files (x86)\\GOG Galaxy\\Games');
  });

  it("looks in every Steam library's games, last, on each platform", () => {
    const at = { home: '/h', env: {}, appDir: '/app', drives: [] as string[] };
    const win = roots({
      ...at,
      platform: 'win32',
      home: 'C:\\Users\\a',
      appDir: 'D:\\u5app',
      drives: ['C:'],
      steamLibraries: ['C:\\Program Files (x86)\\Steam', 'E:\\SteamLibrary'],
    });
    expect(win.slice(-2)).toEqual(['C:\\Program Files (x86)\\Steam\\steamapps\\common', 'E:\\SteamLibrary\\steamapps\\common']);
    expect(roots({ ...at, platform: 'darwin', steamLibraries: ['/h/Library/Application Support/Steam'] }).at(-1)).toBe(
      '/h/Library/Application Support/Steam/steamapps/common',
    );
    expect(roots({ ...at, platform: 'linux', steamLibraries: ['/h/.local/share/Steam'] }).at(-1)).toBe(
      '/h/.local/share/Steam/steamapps/common',
    );
  });

  it("finds Steam's copy in a library's games, through the real folders", () => {
    const library = temp();
    const game = join(library, 'steamapps', 'common', G);
    mkdirSync(join(game, 'DOSBOX'), { recursive: true });
    writeFileSync(join(game, M), 'data');
    const got = findCopies(
      roots({ platform: 'linux', home: '/nowhere', env: {}, appDir: '/nowhere', drives: [], steamLibraries: [library] }),
      [M],
    );
    expect(got.map((c) => c.where)).toEqual([game]);
  });

  it('takes the Wine prefixes of Lutris and Heroic games as roots on Linux, from the folders it is told are there', () => {
    const at = { platform: 'linux', home: '/h', env: {}, appDir: '/app', drives: [] as string[] };
    const folders: Record<string, string[]> = {
      '/h/Games': ['/h/Games/ultima-5', '/h/Games/Heroic'],
      '/h/Games/Heroic/Prefixes': ['/h/Games/Heroic/Prefixes/direct'],
      '/h/Games/Heroic/Prefixes/default': ['/h/Games/Heroic/Prefixes/default/u5prefix'],
    };
    const got = roots({ ...at, list: (dir: string) => folders[dir] ?? [] });
    expect(got).toContain('/h/Games/ultima-5/drive_c/GOG Games');
    expect(got).toContain('/h/Games/Heroic/Prefixes/direct/drive_c/GOG Games');
    expect(got).toContain('/h/Games/Heroic/Prefixes/default/u5prefix/drive_c/GOG Games');
    expect(roots({ ...at, platform: 'darwin', list: (dir: string) => folders[dir] ?? [] })).toEqual([
      '/app',
      '/h',
      '/Applications',
      '/h/Applications',
    ]);
  });

  it('finds a copy in a Lutris-style and a Heroic-style Wine prefix, through the real folders', () => {
    const home = temp();
    const drive = (prefix: string): string => join(home, prefix, 'drive_c', 'GOG Games', G);
    for (const prefix of ['Games/lutris-game', 'Games/Heroic/Prefixes/default/gogprefix', 'Games/Heroic/Prefixes/plainprefix']) {
      mkdirSync(drive(prefix), { recursive: true });
      writeFileSync(join(drive(prefix), M), 'data');
    }
    const at = { platform: 'linux', home, env: {}, appDir: join(home, 'app'), drives: [] as string[] };
    const list = (dir: string): string[] => {
      try {
        return readdirSync(dir).map((n) => join(dir, n));
      } catch {
        return [];
      }
    };
    const got = findCopies(roots({ ...at, list }), [M]);
    expect(got.map((c) => c.where).sort()).toEqual(
      ['Games/lutris-game', 'Games/Heroic/Prefixes/default/gogprefix', 'Games/Heroic/Prefixes/plainprefix'].map(drive).sort(),
    );
  });

  it('does not list inside the home folders macOS guards, but does inside the others', () => {
    const home = temp();
    for (const dir of ['Desktop', 'Documents', 'Downloads', 'Library', 'Pictures', 'Movies', 'Music', 'Stuff']) {
      mkdirSync(join(home, dir, G), { recursive: true });
      writeFileSync(join(home, dir, G, M), 'data');
    }
    mkdirSync(join(home, G), { recursive: true });
    writeFileSync(join(home, G, M), 'data');
    const mac = findCopies([home], [M], { platform: 'darwin', home });
    expect(mac.map((c) => c.where).sort()).toEqual([`~${sep}Stuff${sep}${G}`, `~${sep}${G}`].sort());
    // Elsewhere nothing is guarded, and a root that is not home is listed in full even on macOS.
    expect(findCopies([home], [M], { platform: 'linux', home })).toHaveLength(9);
    expect(findCopies([join(home, 'Desktop')], [M], { platform: 'darwin', home })).toHaveLength(1);
  });

  it('names a copy under home as ~/..., and leaves any other as it is', () => {
    const home = temp();
    const other = temp();
    for (const dir of [join(home, G), join(other, G)]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, M), 'data');
    }
    const got = findCopies([home, other], [M], { platform: 'linux', home });
    expect(got.map((c) => c.where)).toEqual([`~${sep}${G}`, join(other, G)]);
    expect(got[0].files.map((f) => f.path)).toEqual([M]);
  });

  it('finds a copy in a folder named like the game at home and in the GOG macOS app, reading only the files wanted', () => {
    const home = temp();
    const put = (path: string, text = 'x'): void => {
      mkdirSync(join(home, path, '..'), { recursive: true });
      writeFileSync(join(home, path), text);
    };
    put(`${G}/${M}`, 'data');
    put(`${G}/TILES.16`);
    put(`${G}/upgrade/MUSIC.XMI`);
    put(`${G}/SAVED.GAM.bak`); // not wanted
    put(`Apps/${G}™.app/Contents/Resources/game/${M}`);
    put(`Apps/Other Game.app/Contents/Resources/game/${M}`); // not the game
    put(`Documents/notes/${M}`); // not a game folder's name
    const got = findCopies([home, join(home, 'Apps')], [M, 'TILES.16'], { extra: '\\.XMI$' });
    expect(got.map((c) => c.where)).toEqual([join(home, G), join(home, `Apps/${G}™.app/Contents/Resources/game`)]);
    expect(got[0].files.map((f) => f.path).sort()).toEqual([M, 'TILES.16', 'upgrade/MUSIC.XMI']);
    expect(new TextDecoder().decode(got[0].files.find((f) => f.path === M)!.data)).toBe('data');
  });

  it('reads beside the names only the files the page says, by their path in the copy', () => {
    const home = temp();
    const put = (path: string): void => {
      mkdirSync(join(home, path, '..'), { recursive: true });
      writeFileSync(join(home, path), 'x');
    };
    for (const f of ['A.DAT', 'B.DAT', 'sub/C.DAT', 'sub/D.XMI', 'other/E.DAT', 'sub/deeper/F.DAT']) put(f);
    const read = (extra?: string) =>
      readCopy(home, ['A.DAT'], extra)
        .map((f) => f.path)
        .sort();
    expect(read('^sub/[^/]+\\.dat$')).toEqual(['A.DAT', 'sub/C.DAT']);
    expect(read('\\.XMI$')).toEqual(['A.DAT', 'sub/D.XMI']);
    expect(read()).toEqual(['A.DAT']);
    expect(read('(')).toEqual(['A.DAT']); // no pattern: the names alone
    const [copy] = findCopies([home], ['A.DAT'], { extra: '^other/' });
    expect(copy).toBeUndefined(); // home is no game folder
    mkdirSync(join(home, G));
    put(`${G}/${M}`);
    put(`${G}/upgrade/MUSIC.XMI`);
    put(`${G}/upgrade/MUSIC.TXT`);
    const found = findCopies([home], [M], { extra: '\\.XMI$' });
    expect(found[0].files.map((f) => f.path).sort()).toEqual([M, 'upgrade/MUSIC.XMI']);
    expect(findCopies([home], [M])[0].files.map((f) => f.path)).toEqual([M]);
  });

  it('still reports a copy whose entries cannot be read, with the files that did', () => {
    const home = temp();
    mkdirSync(join(home, G), { recursive: true });
    writeFileSync(join(home, `${G}/${M}`), 'data');
    symlinkSync(join(home, 'missing'), join(home, `${G}/BAD.XMI`)); // a broken link, named like the music
    symlinkSync(join(home, 'missing'), join(home, `${G}/TILES.16`)); // and like a wanted file
    const got = findCopies([home], [M, 'TILES.16'], { extra: '\\.XMI$' });
    expect(got.map((c) => c.where)).toEqual([join(home, G)]);
    expect(got[0].files.map((f) => f.path)).toEqual([M]);
  });
});
