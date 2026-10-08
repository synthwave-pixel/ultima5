// web/tests/desktopScan.test.ts
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCopies, gameFolderName, roots } from '../../desktop/scan.cjs';

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

  it('knows the game by its folders’ names', () => {
    for (const n of [
      'u5',
      'U5',
      'ultima5',
      'ULTIMA5',
      'Ultima 5',
      'Ultima V',
      'Ultima V™.app',
      'Ultima_V',
      'ultima-5',
      'Ultima V - Warriors of Destiny',
    ])
      expect(gameFolderName(n), n).toBe(true);
    for (const n of ['Ultima VI', 'Ultima 4', 'u6', 'Documents', 'ultima55', 'u5x']) expect(gameFolderName(n), n).toBe(false);
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
    const drive = (prefix: string): string => join(home, prefix, 'drive_c', 'GOG Games', 'Ultima 5');
    for (const prefix of ['Games/lutris-game', 'Games/Heroic/Prefixes/default/gogprefix', 'Games/Heroic/Prefixes/plainprefix']) {
      mkdirSync(drive(prefix), { recursive: true });
      writeFileSync(join(drive(prefix), 'DATA.OVL'), 'data');
    }
    const at = { platform: 'linux', home, env: {}, appDir: join(home, 'app'), drives: [] as string[] };
    const list = (dir: string): string[] => {
      try {
        return readdirSync(dir).map((n) => join(dir, n));
      } catch {
        return [];
      }
    };
    const got = findCopies(roots({ ...at, list }), ['DATA.OVL']);
    expect(got.map((c) => c.where).sort()).toEqual(
      ['Games/lutris-game', 'Games/Heroic/Prefixes/default/gogprefix', 'Games/Heroic/Prefixes/plainprefix'].map(drive).sort(),
    );
  });

  it('does not list inside the home folders macOS guards, but does inside the others', () => {
    const home = temp();
    for (const dir of ['Desktop', 'Documents', 'Downloads', 'Library', 'Pictures', 'Movies', 'Music', 'Stuff']) {
      mkdirSync(join(home, dir, 'u5'), { recursive: true });
      writeFileSync(join(home, dir, 'u5', 'DATA.OVL'), 'data');
    }
    mkdirSync(join(home, 'u5'), { recursive: true });
    writeFileSync(join(home, 'u5', 'DATA.OVL'), 'data');
    const mac = findCopies([home], ['DATA.OVL'], { platform: 'darwin', home });
    expect(mac.map((c) => c.where).sort()).toEqual([`~${sep}Stuff${sep}u5`, `~${sep}u5`].sort());
    // Elsewhere nothing is guarded, and a root that is not home is listed in full even on macOS.
    expect(findCopies([home], ['DATA.OVL'], { platform: 'linux', home })).toHaveLength(9);
    expect(findCopies([join(home, 'Desktop')], ['DATA.OVL'], { platform: 'darwin', home })).toHaveLength(1);
  });

  it('names a copy under home as ~/..., and leaves any other as it is', () => {
    const home = temp();
    const other = temp();
    for (const dir of [join(home, 'u5'), join(other, 'u5')]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'DATA.OVL'), 'data');
    }
    const got = findCopies([home, other], ['DATA.OVL'], { platform: 'linux', home });
    expect(got.map((c) => c.where)).toEqual([`~${sep}u5`, join(other, 'u5')]);
    expect(got[0].files.map((f) => f.path)).toEqual(['DATA.OVL']);
  });

  it('finds a copy in a u5 folder at home and in the GOG macOS app, reading only the files wanted', () => {
    const home = temp();
    const put = (path: string, text = 'x'): void => {
      mkdirSync(join(home, path, '..'), { recursive: true });
      writeFileSync(join(home, path), text);
    };
    put('u5/DATA.OVL', 'data');
    put('u5/TILES.16');
    put('u5/upgrade/MUSIC.XMI');
    put('u5/SAVED.GAM.bak'); // not wanted
    put('Apps/Ultima V™.app/Contents/Resources/game/DATA.OVL');
    put('Apps/Ultima VI.app/Contents/Resources/game/DATA.OVL'); // not the game
    put('Documents/notes/DATA.OVL'); // not a game folder's name
    const got = findCopies([home, join(home, 'Apps')], ['DATA.OVL', 'TILES.16']);
    expect(got.map((c) => c.where)).toEqual([join(home, 'u5'), join(home, 'Apps/Ultima V™.app/Contents/Resources/game')]);
    expect(got[0].files.map((f) => f.path).sort()).toEqual(['DATA.OVL', 'TILES.16', 'upgrade/MUSIC.XMI']);
    expect(new TextDecoder().decode(got[0].files.find((f) => f.path === 'DATA.OVL')!.data)).toBe('data');
  });

  it('still reports a copy whose entries cannot be read, with the files that did', () => {
    const home = temp();
    mkdirSync(join(home, 'u5'), { recursive: true });
    writeFileSync(join(home, 'u5/DATA.OVL'), 'data');
    symlinkSync(join(home, 'missing'), join(home, 'u5/BAD.XMI')); // a broken link, named like the music
    symlinkSync(join(home, 'missing'), join(home, 'u5/TILES.16')); // and like a wanted file
    const got = findCopies([home], ['DATA.OVL', 'TILES.16']);
    expect(got.map((c) => c.where)).toEqual([join(home, 'u5')]);
    expect(got[0].files.map((f) => f.path)).toEqual(['DATA.OVL']);
  });
});
