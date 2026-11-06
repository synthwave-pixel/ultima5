// web/tests/steamFind.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountId, APP_ID, findGame, isSteamLaunch, libraryPaths, parseVdf, saveDir, steamRoots } from '../../desktop/steam.cjs';

// The shape of a Mac's libraryfolders.vdf: the Steam folder itself, then a library on an external disk.
const LIBRARIES = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"/Users/will/Library/Application Support/Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"22320"\t\t"1142479546"
\t\t\t"3067520"\t\t"33458335"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"/Volumes/Endurance/SteamLibrary"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"8930"\t\t"7716100293"
\t\t}
\t}
}
`;
const MAC_ROOT = '/Users/will/Library/Application Support/Steam';
const EXTERNAL = '/Volumes/Endurance/SteamLibrary';
const MANIFEST = '"AppState"\n{\n\t"appid"\t\t"3067520"\n\t"installdir"\t\t"Ultima V"\n}\n';
const LOGINS = `"users"
{
\t"76561197992819951"
\t{
\t\t"AccountName"\t\t"wiverson"
\t\t"MostRecent"\t\t"0"
\t}
\t"76561198000000001"
\t{
\t\t"AccountName"\t\t"someone else"
\t\t"MostRecent"\t\t"1"
\t}
}
`;

/** A fake disk: the files it has, by path. */
const disk = (files: Record<string, string>, dirs: string[] = []) => ({
  read: (p: string): string | null => files[p] ?? null,
  exists: (p: string): boolean => p in files || dirs.includes(p),
});

describe("Steam's libraries, Ultima V's folder and the account that launched it", () => {
  it('knows a Steam launch of Ultima V and nothing else', () => {
    expect(APP_ID).toBe('3067520');
    expect(isSteamLaunch({ SteamAppId: '3067520' })).toBe(true);
    expect(isSteamLaunch({ SteamGameId: '3067520' })).toBe(true);
    expect(isSteamLaunch({})).toBe(false);
    expect(isSteamLaunch({ SteamAppId: '22320' })).toBe(false);
    expect(isSteamLaunch({ SteamGameId: '12345678901234567890' })).toBe(false);
  });

  it("reads Steam's text format", () => {
    const vdf = parseVdf(LIBRARIES) as Record<string, Record<string, Record<string, unknown>>>;
    expect(vdf.libraryfolders['0'].path).toBe(MAC_ROOT);
    expect(vdf.libraryfolders['1'].path).toBe(EXTERNAL);
    expect((vdf.libraryfolders['0'].apps as Record<string, string>)['3067520']).toBe('33458335');
    expect(parseVdf('"a"\n{\n"path"\t"C:\\\\Program Files (x86)\\\\Steam"\n"q"\t"say \\"hi\\""\n}')).toEqual({
      a: { path: 'C:\\Program Files (x86)\\Steam', q: 'say "hi"' },
    });
    expect(parseVdf('')).toEqual({});
  });

  it('gives the places Steam lives for each system', () => {
    const base = { home: '/home/deck', env: {} };
    expect(steamRoots({ ...base, platform: 'darwin', home: '/Users/will', registrySteamPath: null })).toEqual([
      '/Users/will/Library/Application Support/Steam',
    ]);
    expect(steamRoots({ ...base, platform: 'linux', registrySteamPath: null })).toEqual([
      '/home/deck/.steam/root',
      '/home/deck/.local/share/Steam',
      '/home/deck/.var/app/com.valvesoftware.Steam/data/Steam',
    ]);
    expect(steamRoots({ ...base, platform: 'win32', registrySteamPath: 'D:\\Steam' })).toEqual([
      'D:\\Steam',
      'C:\\Program Files (x86)\\Steam',
    ]);
    expect(steamRoots({ ...base, platform: 'win32', registrySteamPath: null })).toEqual(['C:\\Program Files (x86)\\Steam']);
  });

  it("lists Steam's own folder and each library, once", () => {
    const { read } = disk({ [`${MAC_ROOT}/steamapps/libraryfolders.vdf`]: LIBRARIES });
    expect(libraryPaths(MAC_ROOT, read)).toEqual([MAC_ROOT, EXTERNAL]);
    expect(libraryPaths('/nowhere', () => null)).toEqual(['/nowhere']);
  });

  it('finds the game in a library on another disk', () => {
    const d = disk(
      {
        [`${MAC_ROOT}/steamapps/libraryfolders.vdf`]: LIBRARIES,
        [`${EXTERNAL}/steamapps/appmanifest_3067520.acf`]: MANIFEST,
      },
      [`${EXTERNAL}/steamapps/common/Ultima V`],
    );
    expect(findGame([MAC_ROOT], d.read, d.exists)).toEqual({
      library: EXTERNAL,
      folder: `${EXTERNAL}/steamapps/common/Ultima V`,
    });
  });

  it('says which library was expected when the folder is gone, and null with no manifest', () => {
    const files = {
      [`${MAC_ROOT}/steamapps/libraryfolders.vdf`]: LIBRARIES,
      [`${EXTERNAL}/steamapps/appmanifest_3067520.acf`]: MANIFEST,
    };
    const gone = disk(files);
    expect(findGame([MAC_ROOT], gone.read, gone.exists)).toEqual({ missing: EXTERNAL });
    const none = disk({ [`${MAC_ROOT}/steamapps/libraryfolders.vdf`]: LIBRARIES });
    expect(findGame([MAC_ROOT], none.read, none.exists)).toBeNull();
    expect(findGame([], none.read, none.exists)).toBeNull();
  });

  it('joins a Windows library with its own separator', () => {
    const lib = 'D:\\Games\\SteamLibrary';
    const d = disk({ [`${lib}\\steamapps\\appmanifest_3067520.acf`]: MANIFEST }, [`${lib}\\steamapps\\common\\Ultima V`]);
    expect(findGame([lib], d.read, d.exists)).toEqual({
      library: lib,
      folder: `${lib}\\steamapps\\common\\Ultima V`,
    });
  });

  it('names the account that launched the game', () => {
    const { read } = disk({ [`${MAC_ROOT}/config/loginusers.vdf`]: LOGINS });
    expect(accountId(MAC_ROOT, { SteamUser: 'wiverson' }, read)).toBe('32554223');
    expect(accountId(MAC_ROOT, { SteamUser: 'nobody' }, read)).toBe('39734273');
    expect(accountId(MAC_ROOT, {}, read)).toBe('39734273');
    const noRecent = disk({ [`${MAC_ROOT}/config/loginusers.vdf`]: LOGINS.replace('"1"', '"0"') });
    expect(accountId(MAC_ROOT, {}, noRecent.read)).toBeNull();
    expect(accountId(MAC_ROOT, { SteamUser: 'wiverson' }, () => null)).toBeNull();
  });

  it('reads an older loginusers.vdf, whose keys are written in lower case', () => {
    const older = LOGINS.replaceAll('"AccountName"', '"accountname"').replaceAll('"MostRecent"', '"mostrecent"');
    const { read } = disk({ [`${MAC_ROOT}/config/loginusers.vdf`]: older });
    expect(accountId(MAC_ROOT, { SteamUser: 'wiverson' }, read)).toBe('32554223');
    expect(accountId(MAC_ROOT, {}, read)).toBe('39734273');
  });

  it('asks the Flatpak for no new permission to reach a library: /run/media is not in its permissions', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'desktop', 'package.json'), 'utf8')) as {
      build: { flatpak: { finishArgs: string[] } };
    };
    expect(pkg.build.flatpak.finishArgs.filter((a) => a.includes('/run/media'))).toEqual([]);
  });

  it('keeps saves in <game folder>/ultima5-sp/<account id>', () => {
    expect(saveDir('/lib/steamapps/common/Ultima V', '1234')).toBe(join('/lib/steamapps/common/Ultima V', 'ultima5-sp', '1234'));
    expect(saveDir('/lib/x', '1234')).toMatch(/ultima5-sp[\\/]1234$/);
  });
});
