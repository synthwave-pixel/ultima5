// web/tests/desktopBrand.test.ts
import * as realFs from 'node:fs';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import brand from '../../desktop/brand.cjs';
import { builderConfig } from '../../desktop/builderConfig.cjs';
import type * as Appinfo from '../../desktop/appinfo.cjs';
import type * as BuilderConfig from '../../desktop/builderConfig.cjs';
import type * as InstanceMode from '../../desktop/instanceMode.cjs';
import type * as Metainfo from '../../desktop/metainfo.cjs';
import type * as Portable from '../../desktop/portable.cjs';
import type * as Scan from '../../desktop/scan.cjs';
import type * as Steam from '../../desktop/steam.cjs';
import type * as SteamOptions from '../../desktop/steamOptions.cjs';
import type * as SteamReport from '../../desktop/steamReport.cjs';
import type * as SteamSaves from '../../desktop/steamSaves.cjs';
import type * as SteamSetup from '../../desktop/steamSetup.cjs';
import type * as Updates from '../../desktop/updates.cjs';

/** The modules the copies are loaded as. */
interface Modules {
  './brand.cjs': typeof brand;
  './builderConfig.cjs': typeof BuilderConfig;
  './metainfo.cjs': typeof Metainfo;
  './steam.cjs': typeof Steam;
  './steamSaves.cjs': typeof SteamSaves;
  './steamSetup.cjs': typeof SteamSetup;
  './appinfo.cjs': typeof Appinfo;
  './steamReport.cjs': typeof SteamReport;
  './instanceMode.cjs': typeof InstanceMode;
  './steamOptions.cjs': typeof SteamOptions;
  './portable.cjs': typeof Portable;
  './updates.cjs': typeof Updates;
  './scan.cjs': typeof Scan;
}

const DESKTOP = join(import.meta.dirname, '..', '..', 'desktop');
const pkg = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as {
  name: string;
  productName: string;
  description: string;
  repository: { url: string };
  build: Record<string, unknown>;
};

/** Ultima V's names and ids, none of which a module may give another game. */
const ULTIMA5 = /Ultima V|ultima5|3067520|SAVED\.GAM|DATA\.OVL|com\.synthwavepixel|Warriors|u5\b/;

describe('the desktop brand (brand.cjs)', () => {
  it("is package.json's name, product, description and repository", () => {
    expect(pkg.name).toBe(`${brand.id}-desktop`);
    expect(pkg.productName).toBe(brand.name);
    expect(pkg.description.startsWith(`${brand.title}, `)).toBe(true);
    expect(pkg.repository.url).toBe(`https://github.com/${brand.repo}.git`);
  });

  it("leaves package.json's build naming no game: the brand fills it", () => {
    const build = JSON.stringify(pkg.build);
    for (const v of [brand.appId, brand.name, brand.artifact, brand.appImage, brand.repoName]) expect(build).not.toContain(v);
    const c = builderConfig(pkg.build, '1.0.3');
    for (const [k, v] of Object.entries(pkg.build)) if (typeof v !== 'object') expect(c[k], k).toEqual(v);
    expect(c.files).toEqual(pkg.build.files);
    expect(c.win).toEqual(pkg.build.win);
    expect(c.flatpak.finishArgs).toEqual((pkg.build.flatpak as { finishArgs: string[] }).finishArgs);
    expect(c.mac.target).toEqual((pkg.build.mac as { target: unknown }).target);
    expect(c.extraMetadata.version).toBe('1.0.3');
  });

  it('refuses values that would break a file it is written into, and keeps the scan pattern stateless', () => {
    const ok = {
      id: 'testgame',
      name: 'Test Game',
      title: 'Test Game: A Quest Made Up',
      appId: 'org.example.testgame',
      repo: 'someone/testgame',
      global: 'tg',
      about: ['A game made up for this test.'],
      steam: { appId: '1000010', installDir: 'Test Game', saveFile: 'PLAY.DAT' },
      scan: { folder: /^tg/i, marker: 'START.DAT' },
    };
    expect(() => brand.brandOf(ok)).not.toThrow();
    for (const name of ['Test & Game', 'Test "Game"', 'Test $Game', 'Test `Game`', 'Test: Game', '']) {
      expect(() => brand.brandOf({ ...ok, name }), name).toThrow(/name/);
    }
    for (const id of ['Test', 'test game', 'test/game']) expect(() => brand.brandOf({ ...ok, id }), id).toThrow(/id/);
    for (const repo of ['testgame', 'a/b/c', '/testgame']) expect(() => brand.brandOf({ ...ok, repo }), repo).toThrow(/repo/);
    expect(() => brand.brandOf({ ...ok, appId: 'org.example.test game' })).toThrow(/appId/);
    expect(() => brand.brandOf({ ...ok, title: 'Test\nGame' })).toThrow(/title/);
    expect(() => brand.brandOf({ ...ok, global: 'window.tg' })).toThrow(/global/);
    expect(() => brand.brandOf({ ...ok, steam: { ...ok.steam, appId: '10a' } })).toThrow(/steam.appId/);
    expect(() => brand.brandOf({ ...ok, steam: { ...ok.steam, installDir: 'Test "Game"' } })).toThrow(/installDir/);
    expect(() => brand.brandOf({ ...ok, steam: { ...ok.steam, saveFile: 'a/PLAY.DAT' } })).toThrow(/saveFile/);
    expect(() => brand.brandOf({ ...ok, scan: { ...ok.scan, marker: '../START.DAT' } })).toThrow(/marker/);
    const global = brand.brandOf({ ...ok, scan: { ...ok.scan, folder: /^tg/giy } });
    expect(global.scan.folder.flags).toBe('i');
    expect([global.scan.folder.test('tg'), global.scan.folder.test('tg')]).toEqual([true, true]);
  });

  it("keeps package.json's own Flatpak files beside the metainfo", () => {
    const c = builderConfig({ ...pkg.build, flatpak: { files: [['a', '/b']] } }, '1.0.3');
    expect(c.flatpak.files).toEqual([
      ['a', '/b'],
      [`build-meta/${brand.appId}.metainfo.xml`, `/share/metainfo/${brand.appId}.metainfo.xml`],
    ]);
  });

  it('names no game in any module but itself: only the internal names stay', () => {
    // Code, not comments: a line comment, or a comment block, is left out.
    const code = (text: string) =>
      text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');
    const internal = (l: string) => /const HOST = 'ultima5';|ULTIMA5_SMOKE|u5native/.test(l);
    for (const f of readdirSync(DESKTOP).filter((n) => /\.(cjs|sh)$/.test(n) && n !== 'brand.cjs')) {
      // A shell script's comments too; a .cjs file's # lines are the scripts it writes, and are checked.
      const text = readFileSync(join(DESKTOP, f), 'utf8');
      const found = code(f.endsWith('.sh') ? text.replace(/^\s*#.*$/gm, '') : text)
        .split('\n')
        .filter((l) => ULTIMA5.test(l) && !internal(l));
      expect(found, f).toEqual([]);
    }
  });
});

/**
 * Every desktop module loaded beside an invented game's brand: what each says and writes is that game's, with nothing
 * of Ultima V's left. The modules are copies, in a folder of their own, so the brand they load is the invented one.
 */
describe("the desktop modules, under another game's brand", () => {
  let dir: string;
  let load: <K extends keyof Modules>(file: K) => Modules[K];
  const other = brand.brandOf({
    id: 'testgame',
    name: 'Test Game',
    title: 'Test Game: A Quest Made Up',
    appId: 'org.example.testgame',
    repo: 'someone/testgame',
    global: 'tg',
    about: ['A game made up for this test.'],
    steam: { appId: '1000010', installDir: 'Test Game', saveFile: 'PLAY.DAT' },
    scan: { folder: /^(tg|test[\s_-]*game)(?![a-z0-9])/i, marker: 'START.DAT' },
  });
  const clean = (s: unknown) => expect(JSON.stringify(s)).not.toMatch(ULTIMA5);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'brand-'));
    for (const f of readdirSync(DESKTOP).filter((n) => n.endsWith('.cjs') && n !== 'brand.cjs'))
      copyFileSync(join(DESKTOP, f), join(dir, f));
    copyFileSync(join(DESKTOP, 'package.json'), join(dir, 'package.json'));
    symlinkSync(join(DESKTOP, 'node_modules'), join(dir, 'node_modules'), 'junction');
    writeFileSync(
      join(dir, 'brand.cjs'),
      `module.exports = require(${JSON.stringify(join(DESKTOP, 'brand.cjs'))}).brandOf({
  id: 'testgame', name: 'Test Game', title: 'Test Game: A Quest Made Up', appId: 'org.example.testgame',
  repo: 'someone/testgame', global: 'tg', about: ['A game made up for this test.'],
  steam: { appId: '1000010', installDir: 'Test Game', saveFile: 'PLAY.DAT' },
  scan: { folder: /^(tg|test[\\s_-]*game)(?![a-z0-9])/i, marker: 'START.DAT' },
});\n`,
    );
    const req = createRequire(join(dir, 'index.cjs'));
    load = <K extends keyof Modules>(file: K) => req(file) as Modules[K];
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('is the brand the copies load', () => {
    const loaded = load('./brand.cjs');
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(other));
    expect(String(loaded.scan.folder)).toBe(String(other.scan.folder));
    expect(other.edition).toBe('Test Game Enhanced Edition');
    expect(other.site).toBe('https://someone.github.io/testgame/');
  });

  it("fills electron-builder's config with the game's ids and names", () => {
    const c = load('./builderConfig.cjs').builderConfig(pkg.build, '1.0.3');
    clean(c);
    expect(c.appId).toBe('org.example.testgame');
    expect(c.productName).toBe('Test Game');
    expect(c.artifactName).toBe('Test-Game-${version}-${os}-${arch}.${ext}');
    expect(c.appImage.artifactName).toBe('testgame-sp-${arch}.${ext}');
    expect(c.publish[0]).toMatchObject({ owner: 'someone', repo: 'testgame' });
    expect(c.mac.extendInfo.NSCameraUsageDescription.startsWith('Test Game never')).toBe(true);
  });

  it("writes the game's metainfo and Flatpak repository", () => {
    const m = load('./metainfo.cjs');
    const xml = m.metainfo('1.0.3', '2026-01-02');
    clean(xml);
    expect(xml).toContain('<id>org.example.testgame</id>');
    expect(xml).toContain('<p>A game made up for this test.</p>');
    expect(xml).toContain('https://raw.githubusercontent.com/someone/testgame/main/promo/features.jpg');
    const files = m.flatpakRepoFiles({
      site: 'https://someone.github.io/testgame',
      id: 'org.example.testgame',
      branch: 'master',
      key: 'K',
    });
    clean(files);
    expect(files.repo.name).toBe('testgame.flatpakrepo');
    expect(files.ref.text).toContain('SuggestRemoteName=testgame\n');
  });

  it("knows the game's Steam launch, folder and saves", () => {
    const steam = load('./steam.cjs');
    expect(steam.APP_ID).toBe('1000010');
    expect(steam.isSteamLaunch({ SteamAppId: '1000010' })).toBe(true);
    expect(steam.isSteamLaunch({ SteamAppId: '3067520' })).toBe(false);
    expect(steam.saveDir('/g', '7')).toBe(join('/g', 'testgame-sp', '7'));
    const saves = mkdtempSync(join(dir, 'saves-'));
    expect(load('./steamSaves.cjs').writeKey(saves, 'testgame.save', 'x')).toBe(true);
    expect(readdirSync(join(saves, 'testgame.save'))).toEqual(['PLAY.DAT']);
  });

  it("writes the game's compatibility tool and launch line", () => {
    const setup = load('./steamSetup.cjs');
    expect(setup.FLATPAK_ID).toBe('org.example.testgame');
    expect(setup.launchLine({ platform: 'linux', exe: '/x', appImage: null, flatpak: true, portable: false })).toBe(
      'flatpak run org.example.testgame %command%',
    );
    const root = mkdtempSync(join(dir, 'steam-'));
    const [tool] = setup.installCompatTool(realFs, [root], { flatpak: false, appImage: '/opt/testgame-sp-x86_64.AppImage' });
    expect(tool).toBe(join(root, 'compatibilitytools.d', 'testgame_sp'));
    for (const f of readdirSync(tool)) clean(readFileSync(join(tool, f), 'utf8'));
    expect(readFileSync(join(tool, 'compatibilitytool.vdf'), 'utf8')).toContain('"Test Game Enhanced Edition"');
    expect(readFileSync(join(tool, 'launch.sh'), 'utf8')).toContain('only plays Test Game (Steam app 1000010)');
  });

  it("gives the game's Mac launch its edition's name", () => {
    const { macPatch } = load('./appinfo.cjs');
    const str = (k: string, v: string): Appinfo.KvNode => [1, k, v];
    const map = (k: string, kids: Appinfo.KvNode[]): Appinfo.KvNode => [0, k, kids];
    const kv = [
      map('appinfo', [
        map('common', [str('oslist', 'windows')]),
        map('config', [map('launch', [map('0', [str('executable', 'GAME.EXE')])])]),
        map('ufs', [map('savefiles', [])]),
      ]),
    ];
    const patched = macPatch(kv, 'Test Game SP.app');
    clean(patched);
    expect(JSON.stringify(patched)).toContain('Test Game Enhanced Edition');
  });

  it("says the game's name in every message", async () => {
    const report = load('./steamReport.cjs').report({
      version: '1.0.3',
      system: 'mac',
      arch: 'arm64',
      build: 'dmg',
      home: '/Users/a',
      bySteam: false,
      env: {},
      steamRoot: null,
      libraries: [],
      game: 'ok',
      where: '/s/Test Game',
      filesFrom: 'steam',
      steamMissing: 0,
      options: { playLine: false, compatTool: false, macPlay: true, results: {} },
      cloud: null,
      accountKnown: false,
      lineState: null,
      macPatched: true,
      macReapplied: false,
      cloudCharacters: null,
      sync: { rules: 'not-owned', why: null, ruleList: [], stuck: null, canFix: false, on: false },
    });
    clean(report);
    expect(report).toContain('Test Game Enhanced Edition report');
    expect(report).toContain('Test Game: installed in /s/Test Game');
    expect(report).toContain('Test Game cache entry patched: yes');

    const instance = load('./instanceMode.cjs');
    const note = join(dir, 'instance.json');
    instance.noteMode(note, true);
    expect(instance.clashMessage(note, false)).toBe('Test Game is already open through Steam. Close it there first.');
    instance.noteMode(note, false);
    expect(instance.clashMessage(note, true)).toMatch(/^Test Game is already open outside Steam/);

    const options = load('./steamOptions.cjs');
    for (const r of ['done', 'restarted', 'steam-running', 'not-owned', 'fixed', 'not-here', 'flatpak']) clean(options.cloudRuleMessage(r));
    const fresh = {
      playLine: false,
      compatTool: false,
      macPlay: false,
      macSync: true,
      cloud: {},
      results: {},
      lineOnAt: 0,
      cloudDefault: false,
    };
    const effects = {
      line: () => null,
      installTool: () => ['/s/compatibilitytools.d/testgame_sp'],
      removeTool: () => undefined,
      macSetup: async () => 'done' as const,
      macRestore: async () => 'done' as const,
    };
    const said: string[] = [];
    for (const [name, on, system] of [
      ['playLine', true, 'windows'],
      ['playLine', true, 'linux'],
      ['playLine', false, 'linux'],
      ['compatTool', true, 'linux'],
      ['compatTool', false, 'linux'],
      ['macPlay', true, 'mac'],
      ['macPlay', false, 'mac'],
    ] as const) {
      const r = await options.switchOption({ options: fresh, name, on, system, account: null, now: 1, effects });
      said.push(r!.message);
    }
    clean(said);
    expect(said.join('\n')).toContain('Test Game > Properties > Compatibility, choose Test Game Enhanced Edition.');
    expect(said[0]).toBe(
      'The portable Test Game has no fixed place for Steam to start it from. Play from Steam with the installed Test Game.',
    );

    expect(load('./portable.cjs').DATA).toBe('Test Game Data');
    expect(load('./updates.cjs').RELEASES).toBe('https://github.com/someone/testgame/releases/latest');
  });

  it("finds a copy by the game's folder names and marker", () => {
    const scan = load('./scan.cjs');
    expect(['tg', 'Test Game', 'testgame', 'Test_Game.app'].map(scan.gameFolderName)).toEqual([true, true, true, true]);
    expect(['Ultima V', 'u5', 'tgx', 'Testgames'].map(scan.gameFolderName)).toEqual([false, false, false, false]);
    const home = mkdtempSync(join(dir, 'home-'));
    mkdirSync(join(home, 'Test Game'));
    writeFileSync(join(home, 'Test Game', 'START.DAT'), 'x');
    mkdirSync(join(home, 'tg'));
    writeFileSync(join(home, 'tg', 'DATA.OVL'), 'x'); // Ultima V's marker: not this game's copy
    const got = scan.findCopies([home], ['START.DAT']);
    expect(got.map((c: { where: string }) => c.where)).toEqual([join(home, 'Test Game')]);
    expect(existsSync(join(home, 'tg'))).toBe(true);
  });
});
