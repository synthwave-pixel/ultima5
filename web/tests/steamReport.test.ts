import { describe, expect, it } from 'vitest';
import { mask, report } from '../../desktop/steamReport.cjs';
import type { ReportFacts } from '../../desktop/steamReport.cjs';

/** The tester report (desktop/steamReport.cjs): every field the spec lists, with nothing that names the player. */
describe('the Steam report', () => {
  const facts: ReportFacts = {
    version: '1.1.195',
    system: 'linux',
    arch: 'x64',
    build: 'AppImage',
    home: '/home/alice',
    bySteam: true,
    env: { SteamAppId: '3067520', SteamGameId: '3067520', SteamUser: 'alice99', FLATPAK_ID: undefined },
    steamRoot: '/home/alice/.local/share/Steam',
    libraries: ['/home/alice/.local/share/Steam', '/run/media/alice/SD/SteamLibrary'],
    game: 'ok',
    where: '/run/media/alice/SD/SteamLibrary/steamapps/common/Ultima V',
    filesFrom: 'steam',
    steamMissing: 0,
    options: { playLine: true, compatTool: false, macPlay: false, results: { playLine: 'done', compatTool: 'ENOSPC' } },
    cloud: true,
    accountKnown: true,
    lineState: 'correct',
    macPatched: null,
    macReapplied: null,
    cloudCharacters: 3,
  };
  const lines = report(facts).split('\n');

  it('says each thing the spec lists', () => {
    expect(lines).toContain('Version: 1.1.195');
    expect(lines).toContain('System: linux (x64)');
    expect(lines).toContain('Build: AppImage');
    expect(lines).toContain('Started by Steam: yes');
    expect(lines).toContain('SteamAppId: 3067520');
    expect(lines).toContain('SteamGameId: 3067520');
    expect(lines).toContain('STEAM_COMPAT_APP_ID: not set');
    expect(lines).toContain('SteamUser: set');
    expect(lines).toContain('FLATPAK_ID: not set');
    expect(lines).toContain('Steam folder: ~/.local/share/Steam');
    expect(lines).toContain('Library: ~/.local/share/Steam');
    expect(lines).toContain('Library: /run/media/<user>/SD/SteamLibrary');
    expect(lines).toContain('Ultima V: installed in /run/media/<user>/SD/SteamLibrary/steamapps/common/Ultima V');
    expect(lines).toContain('Ultima V files: complete');
    expect(lines).toContain("Game files from: Steam's library");
    expect(lines).toContain('Account: known');
    expect(lines).toContain('Play from Steam, launch line: on; last result: done');
    expect(lines).toContain('Play from Steam, compatibility tool: off; last result: ENOSPC');
    expect(lines).toContain('Launch line seen in Steam: correct');
    expect(lines).toContain('Cloud saves: on');
    expect(lines).toContain("Characters in Steam's folder: 3");
  });

  it('leaves out options that do not exist on the system, and the Mac lines off a Mac', () => {
    const text = report(facts);
    expect(text).not.toContain('Mac');
    expect(text).not.toContain('Play from Steam, Mac');
  });

  it('says the Mac cache entry on a Mac', () => {
    const mac = report({ ...facts, system: 'mac', macPatched: true, macReapplied: false }).split('\n');
    expect(mac).toContain('Play from Steam, Mac launch entry: off; last result: none');
    expect(mac).toContain('Ultima V cache entry patched: yes');
    expect(mac).toContain('Cache entry re-applied at this start: no');
    expect(mac).not.toContain('Play from Steam, launch line: on; last result: done');
  });

  it('says what is missing', () => {
    const text = report({
      ...facts,
      bySteam: false,
      steamRoot: null,
      libraries: [],
      game: 'none',
      where: '',
      filesFrom: 'unknown',
      steamMissing: null,
      accountKnown: false,
      cloud: null,
      lineState: null,
      cloudCharacters: null,
    });
    expect(text).toContain('Started by Steam: no');
    expect(text).toContain('Steam folder: not found');
    expect(text).toContain('Ultima V: not installed');
    expect(text).toContain('Game files from: unknown');
    expect(text).not.toContain('Ultima V files');
    expect(text).toContain('Account: unknown');
    expect(text).toContain('Cloud saves: not available');
    expect(text).not.toContain("Characters in Steam's folder");
  });

  it("says where the files came from, and whether Steam's copy is whole", () => {
    expect(report({ ...facts, filesFrom: 'installer' })).toContain('Game files from: the installer');
    expect(report({ ...facts, filesFrom: 'unknown' })).toContain('Game files from: unknown');
    expect(report({ ...facts, filesFrom: 'steam', steamMissing: 2 })).toContain('Ultima V files: incomplete (2 missing)');
  });

  it('keeps the player out of it', () => {
    const text = report(facts);
    expect(text).not.toContain('alice');
    expect(text).not.toContain('alice99');
  });

  it('masks a home path, a /run/media library and a Windows user folder', () => {
    expect(mask('/home/bob/.steam/root', '/home/bob')).toBe('~/.steam/root');
    expect(mask('/run/media/bob/SD/Lib', '/home/bob')).toBe('/run/media/<user>/SD/Lib');
    expect(mask('/Users/carol/Library/Application Support/Steam', '/Users/carol')).toBe('~/Library/Application Support/Steam');
    expect(mask('C:\\Users\\dave\\AppData\\Local', 'C:\\Users\\dave')).toBe('~\\AppData\\Local');
    expect(mask('C:/Users/dave/AppData', 'C:\\Users\\dave')).toBe('~/AppData');
    expect(mask('D:\\Users\\erin\\Games', 'C:\\Users\\dave')).toBe('D:\\Users\\<user>\\Games');
    expect(mask('/home/frank/x and /Users/gina/y', '/home/zed')).toBe('/home/<user>/x and /Users/<user>/y');
  });

  it('masks an error result that names a path', () => {
    const text = report({ ...facts, options: { ...facts.options, results: { playLine: 'EACCES: /home/alice/.steam/x' } } });
    expect(text).toContain('last result: EACCES: ~/.steam/x');
  });

  it('shows no account name even when a path or result has one in a Steam user folder', () => {
    const text = report({ ...facts, env: { SteamUser: 'alice99' } });
    expect(text).toContain('SteamUser: set');
    expect(text).not.toContain('alice99');
  });
});
