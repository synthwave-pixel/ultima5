// web/tests/steamSetup.test.ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appEntry, isMacPatched, readAppinfo, type KvNode } from '../../desktop/appinfo.cjs';
import { parseVdf } from '../../desktop/steam.cjs';
import {
  installCompatTool,
  launchLine,
  macPatched,
  macReapply,
  macStatus,
  macRestore,
  macSetup,
  removeCompatTool,
} from '../../desktop/steamSetup.cjs';

const MAP = 0;
const STR = 1;
const INT32 = 2;
const ULTIMA = 3067520;
const OTHER = 22320;
const LAUNCHER = 'Ultima V SP.app';
// Every path the tests make has a space and a ' in it (Review focus 1).
const ODD = "it's a test";

const str = (key: string, value: string): KvNode => [STR, key, value];
const map = (key: string, value: KvNode[]): KvNode => [MAP, key, value];

/** Ultima V's entry as Steam has it: one DOSBox launch with no OS of its own, and two save rules for Windows. */
function ultimaKv(name = 'Ultima V: Warriors of Destiny'): KvNode[] {
  const rule = (pattern: string): KvNode[] => [
    str('root', 'gameinstall'),
    str('path', ''),
    str('pattern', pattern),
    map('platforms', [str('1', 'Windows')]),
    [INT32, 'recursive', 1],
  ];
  return [
    map('appinfo', [
      [INT32, 'appid', ULTIMA],
      map('common', [str('name', name), str('oslist', 'windows')]),
      map('config', [
        str('installdir', 'Ultima V'),
        map('launch', [map('0', [str('executable', 'DOSBOX\\Ultima V.exe'), str('workingdir', 'DOSBOX')])]),
      ]),
      map('ufs', [map('savefiles', [map('0', rule('SAVED.GAM')), map('1', rule('PARTY.SAV'))])]),
    ]),
  ];
}

const otherKv = (): KvNode[] => [map('appinfo', [[INT32, 'appid', OTHER], map('common', [str('name', 'Other')])])];

/** A version 29 appinfo.vdf of the given apps (keys in a string table at the end), each with a change number. */
function cache(apps: { appid: number; kv: KvNode[]; change?: number }[]): Buffer {
  const strings: string[] = [];
  const encode = (kv: KvNode[]): Buffer => {
    const out: number[] = [];
    const walk = (nodes: KvNode[]): void => {
      for (const [type, k, v] of nodes) {
        out.push(type);
        let i = strings.indexOf(k);
        if (i < 0) i = strings.push(k) - 1;
        out.push(...new Uint8Array(new Uint32Array([i]).buffer));
        if (type === MAP) {
          walk(v as KvNode[]);
          out.push(8);
        } else if (type === STR) out.push(...Buffer.from(`${v as string}\0`));
        else out.push(...new Uint8Array(new Int32Array([v as number]).buffer));
      }
    };
    walk(kv);
    out.push(8);
    return Buffer.from(out);
  };
  const entries = apps.map(({ appid, kv, change = 1 }) => {
    const block = encode(kv);
    const header = Buffer.alloc(60, appid & 0xff);
    header.writeUInt32LE(change, 36);
    createHash('sha1').update(block).digest().copy(header, 40);
    const size = Buffer.alloc(8);
    size.writeUInt32LE(appid, 0);
    size.writeUInt32LE(header.length + block.length, 4);
    return Buffer.concat([size, header, block]);
  });
  const head = Buffer.alloc(16);
  head.writeUInt32LE(0x07564429, 0);
  head.writeUInt32LE(1, 4);
  const body = Buffer.concat([...entries, Buffer.alloc(4)]);
  head.writeBigInt64LE(BigInt(head.length + body.length), 8);
  const table = Buffer.concat([Buffer.from(new Uint32Array([strings.length]).buffer), ...strings.map((s) => Buffer.from(`${s}\0`))]);
  return Buffer.concat([head, body, table]);
}

/** Splits a line as a POSIX shell would, one argument per line. */
const shellWords = (line: string): string[] =>
  spawnSync('/bin/sh', ['-c', `printf '%s\\n' ${line}`], { encoding: 'utf8' })
    .stdout.split('\n')
    .slice(0, -1);

const made: string[] = [];
const temp = (): string => {
  const dir = fs.mkdtempSync(join(tmpdir(), `u5 setup ${ODD}-`));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A script that says how it was run: its arguments and the Steam app id it was given. */
function fakeProgram(path: string): string {
  fs.mkdirSync(join(path, '..'), { recursive: true });
  fs.writeFileSync(path, '#!/bin/sh\necho "ran $SteamAppId: $*"\n', { mode: 0o755 });
  return path;
}

describe('the launch line', () => {
  it('quotes the installed Windows exe as one argument before %command%', () => {
    const exe = "C:\\Program Files\\Ultima V (test)\\it's\\Ultima V.exe";
    const line = launchLine({ platform: 'win32', exe, appImage: null, flatpak: false, portable: false });
    expect(line).toBe(`"${exe}" %command%`);
    expect(shellWords(line!.replace(' %command%', ''))).toEqual([exe]);
  });

  it('runs the Flatpak by its id', () => {
    expect(launchLine({ platform: 'linux', exe: '/app/ultima5', appImage: null, flatpak: true, portable: false })).toBe(
      'flatpak run com.synthwavepixel.ultima5 %command%',
    );
  });

  it("points at the AppImage's own file, quoted as one argument", () => {
    for (const file of [`/home/${ODD}/Apps/ultima5-sp-x86_64.AppImage`, '/home/a "b" $HOME `c`\\d/ultima5-sp-x86_64.AppImage']) {
      const line = launchLine({ platform: 'linux', exe: '/tmp/.mount/ultima5', appImage: file, flatpak: false, portable: false });
      expect(line).toMatch(/^".*" %command%$/);
      expect(shellWords(line!.replace(' %command%', ''))).toEqual([file]);
    }
    expect(
      launchLine({
        platform: 'linux',
        exe: '/x/electron',
        appImage: '/home/a/Apps/ultima5-sp-x86_64.AppImage',
        flatpak: false,
        portable: false,
      }),
    ).toBe('"/home/a/Apps/ultima5-sp-x86_64.AppImage" %command%');
  });

  it('is none for a Linux build that is neither the Flatpak nor the AppImage', () => {
    expect(launchLine({ platform: 'linux', exe: '/x/electron', appImage: null, flatpak: false, portable: false })).toBeNull();
  });

  it('is not given on a Mac or for the portable Windows build', () => {
    expect(
      launchLine({ platform: 'darwin', exe: '/Applications/Ultima V.app', appImage: null, flatpak: false, portable: false }),
    ).toBeNull();
    expect(launchLine({ platform: 'win32', exe: 'D:\\Games\\Ultima V.exe', appImage: null, flatpak: false, portable: true })).toBeNull();
  });
});

describe('the Linux compatibility tool', () => {
  const setUp = (launcher: { flatpak: boolean; appImage: string | null }) => {
    const home = temp();
    const native = join(home, '.local', 'share', 'Steam');
    const viaLink = join(home, '.steam', 'root');
    const absent = join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam');
    fs.mkdirSync(native, { recursive: true });
    fs.mkdirSync(join(home, '.steam'));
    fs.symlinkSync(native, viaLink);
    const written = installCompatTool(fs, [viaLink, native, absent], launcher);
    return { home, native, viaLink, absent, written };
  };
  const run = (script: string, verb: string, env: Record<string, string>) =>
    spawnSync('/bin/sh', [script, verb, 'Z:\\DOSBOX\\Ultima V.exe'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', ...env } });

  it('is written once under each Steam that is there, and parses as Steam reads it', () => {
    const { viaLink, written } = setUp({ flatpak: true, appImage: null });
    const tool = join(viaLink, 'compatibilitytools.d', 'ultima5_sp');
    expect(written).toEqual([tool]);
    const compat = parseVdf(fs.readFileSync(join(tool, 'compatibilitytool.vdf'), 'utf8'));
    expect(compat).toEqual({
      compatibilitytools: {
        compat_tools: {
          ultima5_sp: { install_path: '.', display_name: 'Ultima V SP', from_oslist: 'windows', to_oslist: 'linux' },
        },
      },
    });
    const manifest = parseVdf(fs.readFileSync(join(tool, 'toolmanifest.vdf'), 'utf8')) as { manifest: Record<string, string> };
    expect(manifest.manifest.commandline).toBe('/launch.sh %verb%');
    expect(fs.statSync(join(tool, 'launch.sh')).mode & 0o111).toBe(0o111);
  });

  it('refuses any game but Ultima V, saying so', () => {
    const { written } = setUp({ flatpak: true, appImage: null });
    const r = run(join(written[0], 'launch.sh'), 'waitforexitandrun', { SteamAppId: '22320' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('only plays Ultima V');
  });

  it('runs the AppImage file itself for run and waitforexitandrun, without Steam arguments, and does nothing else', () => {
    const home = temp();
    const link = fakeProgram(join(home, 'Apps', 'ultima5-sp-x86_64.AppImage'));
    const { written } = setUp({ flatpak: false, appImage: link });
    const script = join(written[0], 'launch.sh');
    for (const verb of ['run', 'waitforexitandrun']) {
      const r = run(script, verb, { SteamAppId: '3067520' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('ran 3067520: \n');
    }
    const other = run(script, 'getcompatpath', { SteamAppId: '3067520' });
    expect(other.status).toBe(0);
    expect(other.stdout).toBe('');
  });

  it("exports Ultima V's app id before starting the engine, so the engine knows it is Steam's game", () => {
    const { written } = setUp({ flatpak: false, appImage: fakeProgram(join(temp(), 'ultima5-sp-x86_64.AppImage')) });
    const script = fs.readFileSync(join(written[0], 'launch.sh'), 'utf8');
    expect(script).toContain('export SteamAppId=3067520');
    // Steam may name the game only in SteamGameId; the engine still gets SteamAppId.
    const r = run(join(written[0], 'launch.sh'), 'run', { SteamGameId: '3067520' });
    expect(r.stdout).toBe('ran 3067520: \n');
  });

  it('takes the app id from whichever of its names Steam gives', () => {
    const home = temp();
    const link = fakeProgram(join(home, 'Apps', 'ultima5-sp-x86_64.AppImage'));
    const { written } = setUp({ flatpak: false, appImage: link });
    const script = join(written[0], 'launch.sh');
    for (const name of ['SteamAppId', 'SteamGameId', 'STEAM_COMPAT_APP_ID']) {
      expect(run(script, 'run', { [name]: '3067520' }).status, name).toBe(0);
      expect(run(script, 'run', { [name]: '22320' }).status, name).not.toBe(0);
    }
  });

  it("inside Flatpak Steam, goes through flatpak-spawn, or says what to run when it can't", () => {
    const { written, home } = setUp({ flatpak: true, appImage: null });
    const bin = join(home, 'bin');
    fs.mkdirSync(bin);
    const env = { SteamAppId: '3067520', FLATPAK_ID: 'com.valvesoftware.Steam', PATH: `${bin}:/usr/bin:/bin` };
    fs.writeFileSync(join(bin, 'flatpak-spawn'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const refused = run(join(written[0], 'launch.sh'), 'run', env);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam');
    fs.writeFileSync(join(bin, 'flatpak-spawn'), '#!/bin/sh\necho "spawn $*"\n', { mode: 0o755 });
    const allowed = run(join(written[0], 'launch.sh'), 'run', env);
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toContain('spawn --host');
    expect(allowed.stdout).toContain('--env=SteamAppId=3067520');
    expect(allowed.stdout).toContain('flatpak run com.synthwavepixel.ultima5');
  });

  it('is removed from every Steam', () => {
    const { native, absent } = setUp({ flatpak: true, appImage: null });
    removeCompatTool(fs, [native, absent]);
    expect(fs.existsSync(join(native, 'compatibilitytools.d', 'ultima5_sp'))).toBe(false);
  });
});

describe("the Mac's cache entry", () => {
  /** A Steam folder with a cache of Ultima V and another app, and the app's data folder beside it. */
  function mac(kv = ultimaKv()) {
    const home = temp();
    const steamRoot = join(home, 'Library', 'Application Support', 'Steam');
    fs.mkdirSync(join(steamRoot, 'appcache'), { recursive: true });
    fs.mkdirSync(join(steamRoot, 'steamapps'));
    fs.writeFileSync(
      join(steamRoot, 'appcache', 'appinfo.vdf'),
      cache([
        { appid: ULTIMA, kv },
        { appid: OTHER, kv: otherKv() },
      ]),
    );
    const data = join(home, 'data');
    fs.mkdirSync(data);
    const appExe = fakeProgram(join(home, 'Applications', 'Ultima V.app', 'Contents', 'MacOS', 'Ultima V'));
    const where = {
      fs,
      steamRoot,
      appExe,
      packaged: true,
      keptOriginal: join(data, 'steam-appinfo-3067520.bin'),
      noteFile: join(data, 'steam-setup.json'),
    };
    return {
      ...where,
      home,
      cacheFile: join(steamRoot, 'appcache', 'appinfo.vdf'),
      manifest: join(steamRoot, 'steamapps', 'appmanifest_3067520.acf'),
      launcher: join(steamRoot, 'steamapps', 'common', 'Ultima V', LAUNCHER),
    };
  }
  const closed = { steamRunning: () => false, quitSteam: () => Promise.resolve() };
  const ultimaIn = (file: string) => appEntry(readAppinfo(fs.readFileSync(file)), ULTIMA)!;
  /** An app's entry as it lies in the file; the string table after the entries only ever grows. */
  const entryBytes = (bytes: Buffer, appid: number): Buffer => {
    const e = readAppinfo(bytes).entries.find((x) => x.appid === appid)!;
    return bytes.subarray(e.start, e.stop);
  };
  const sameEntries = (a: Buffer, b: Buffer): boolean =>
    entryBytes(a, ULTIMA).equals(entryBytes(b, ULTIMA)) && entryBytes(a, OTHER).equals(entryBytes(b, OTHER));

  it('quits Steam first, and writes nothing until it has', async () => {
    const m = mac();
    const before = fs.readFileSync(m.cacheFile);
    let running = true;
    let atQuit: boolean | null = null;
    const result = await macSetup({
      ...m,
      steamRunning: () => running,
      quitSteam: () => {
        atQuit = fs.readFileSync(m.cacheFile).equals(before) && !fs.existsSync(m.manifest) && !fs.existsSync(m.keptOriginal);
        running = false;
        return Promise.resolve();
      },
    });
    expect(atQuit).toBe(true);
    expect(result).toBe('done');
    expect(isMacPatched(ultimaIn(m.cacheFile).kv, LAUNCHER)).toBe(true);
  });

  it('says so when Steam would not quit, having written nothing', async () => {
    const m = mac();
    const before = fs.readFileSync(m.cacheFile);
    expect(await macSetup({ ...m, steamRunning: () => true, quitSteam: () => Promise.resolve() })).toBe('steam-running');
    expect(fs.readFileSync(m.cacheFile).equals(before)).toBe(true);
    expect(fs.existsSync(m.manifest)).toBe(false);
  });

  it('writes the manifest, the launcher, the kept entry and the patched cache; a second run changes nothing', async () => {
    const m = mac();
    const original = ultimaIn(m.cacheFile);
    expect(await macSetup({ ...m, ...closed })).toBe('done');

    const manifest = parseVdf(fs.readFileSync(m.manifest, 'utf8')) as { AppState: Record<string, string> };
    expect(manifest.AppState).toEqual({ appid: '3067520', Universe: '1', StateFlags: '1026', installdir: 'Ultima V' });

    const plist = fs.readFileSync(join(m.launcher, 'Contents', 'Info.plist'), 'utf8');
    const exeName = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)![1];
    const script = join(m.launcher, 'Contents', 'MacOS', exeName);
    expect(fs.statSync(script).mode & 0o111).toBe(0o111);
    const ran = spawnSync(script, ['-steam'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', SteamAppId: '3067520' } });
    expect(ran.stdout).toBe('ran 3067520: -steam\n');

    const kept = appEntry(readAppinfo(fs.readFileSync(m.keptOriginal)), ULTIMA)!;
    expect(kept.kv).toEqual(original.kv);
    expect(kept.header.equals(original.header)).toBe(true);
    const patched = ultimaIn(m.cacheFile);
    expect(isMacPatched(patched.kv, LAUNCHER)).toBe(true);
    expect(appEntry(readAppinfo(fs.readFileSync(m.cacheFile)), OTHER)!.kv).toEqual(otherKv());

    const files = [m.cacheFile, m.keptOriginal, m.manifest, script].map((f) => fs.readFileSync(f));
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    expect([m.cacheFile, m.keptOriginal, m.manifest, script].map((f) => fs.readFileSync(f))).toEqual(files);
  });

  it("leaves a manifest Steam wrote alone, and puts the launcher in the game's folder", async () => {
    const m = mac();
    const theirs = '"AppState"\n{\n\t"appid"\t\t"3067520"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"Ultima V"\n}\n';
    fs.writeFileSync(m.manifest, theirs);
    fs.mkdirSync(join(m.steamRoot, 'steamapps', 'common', 'Ultima V'), { recursive: true });
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    expect(fs.existsSync(m.launcher)).toBe(true);
    expect(await macRestore({ ...m, ...closed })).toBe('done');
    expect(fs.readFileSync(m.manifest, 'utf8')).toBe(theirs);
    expect(fs.existsSync(m.launcher)).toBe(false);
  });

  it("says the launcher can't find the app when it has gone", async () => {
    const m = mac();
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    fs.rmSync(m.appExe);
    const plist = fs.readFileSync(join(m.launcher, 'Contents', 'Info.plist'), 'utf8');
    const exeName = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)![1];
    const ran = spawnSync(join(m.launcher, 'Contents', 'MacOS', exeName), [], { encoding: 'utf8' });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain(`Ultima V's engine app is not at ${m.appExe}: reinstall it, or remove Steam setup`);
  });

  it('reports an account without Ultima V, or an entry it does not know, and writes nothing', async () => {
    const m = mac([map('appinfo', [[INT32, 'appid', ULTIMA], map('common', [str('name', 'Ultima V')])])]);
    const before = fs.readFileSync(m.cacheFile);
    expect(await macSetup({ ...m, ...closed })).toBe('not-owned');
    expect(fs.readFileSync(m.cacheFile).equals(before)).toBe(true);
    fs.writeFileSync(m.cacheFile, cache([{ appid: OTHER, kv: otherKv() }]));
    expect(await macSetup({ ...m, ...closed })).toBe('not-owned');
    expect(fs.existsSync(m.manifest)).toBe(false);
  });

  it('removal brings the entry back byte for byte, and takes away the launcher, its folder and our manifest', async () => {
    const m = mac();
    const before = fs.readFileSync(m.cacheFile);
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    expect(await macRestore({ ...m, ...closed })).toBe('done');
    expect(sameEntries(fs.readFileSync(m.cacheFile), before)).toBe(true);
    expect(fs.existsSync(m.launcher)).toBe(false);
    expect(fs.existsSync(join(m.launcher, '..'))).toBe(false);
    expect(fs.existsSync(m.manifest)).toBe(false);
    expect(fs.existsSync(m.keptOriginal)).toBe(false);
  });

  it('keeps our manifest and the game once Steam has downloaded it, taking only the launcher', async () => {
    const m = mac();
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    const game = join(m.launcher, '..');
    fs.mkdirSync(join(game, 'DOSBOX'));
    fs.writeFileSync(join(game, 'DOSBOX', 'Ultima V.exe'), 'MZ');
    expect(await macRestore({ ...m, ...closed })).toBe('done');
    expect(fs.existsSync(m.launcher)).toBe(false);
    expect(fs.existsSync(join(game, 'DOSBOX', 'Ultima V.exe'))).toBe(true);
    expect(fs.existsSync(m.manifest)).toBe(true);
  });

  it('leaves the kept entry and our edit when the kept file has no Ultima V, and says so', async () => {
    const m = mac();
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    const patched = fs.readFileSync(m.cacheFile);
    fs.writeFileSync(m.keptOriginal, cache([{ appid: OTHER, kv: otherKv() }]));
    expect(await macRestore({ ...m, ...closed })).toBe('kept-unusable');
    expect(fs.existsSync(m.keptOriginal)).toBe(true);
    expect(fs.readFileSync(m.cacheFile).equals(patched)).toBe(true);
  });

  it('says what is wrong with a cache it cannot read, rather than calling the game not owned', async () => {
    const m = mac();
    fs.writeFileSync(m.cacheFile, 'not a cache');
    await expect(macSetup({ ...m, ...closed })).rejects.toThrow(/not an appinfo file/);
  });

  it('never aims Play at a development run or a copy macOS runs from Downloads', async () => {
    for (const where of [
      { packaged: false },
      { appExe: '/private/var/folders/x/AppTranslocation/AB12/d/Ultima V.app/Contents/MacOS/Ultima V' },
    ]) {
      const m = mac();
      const before = fs.readFileSync(m.cacheFile);
      expect(await macSetup({ ...m, ...closed, ...where })).toBe('app-not-in-place');
      expect(fs.readFileSync(m.cacheFile).equals(before)).toBe(true);
      expect(fs.existsSync(m.manifest)).toBe(false);
      expect(fs.existsSync(m.launcher)).toBe(false);
    }
  });

  it('re-applies the cache edit from such a copy, but keeps the launcher on the installed app', async () => {
    const m = mac();
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    const script = join(m.launcher, 'Contents', 'MacOS', 'Ultima V SP');
    const aimed = fs.readFileSync(script, 'utf8');
    fs.writeFileSync(
      m.cacheFile,
      cache([
        { appid: ULTIMA, kv: ultimaKv(), change: 2 },
        { appid: OTHER, kv: otherKv() },
      ]),
    );
    expect(
      macReapply({ ...m, packaged: false, appExe: '/Users/dev/ultima5/node_modules/electron/Electron', steamRunning: () => false }),
    ).toBe('ready');
    expect(isMacPatched(ultimaIn(m.cacheFile).kv, LAUNCHER)).toBe(true);
    expect(fs.readFileSync(script, 'utf8')).toBe(aimed);
    fs.rmSync(m.launcher, { recursive: true });
    macReapply({ ...m, appExe: '/private/var/folders/x/AppTranslocation/AB12/d/Ultima V', steamRunning: () => false });
    expect(fs.existsSync(m.launcher)).toBe(false);
  });

  it('re-applies to the newer entry Steam put in its place, and keeps that one to restore', async () => {
    const m = mac();
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    // Steam is sent Ultima V's settings again: a newer change number, a new name, our edit gone.
    fs.writeFileSync(
      m.cacheFile,
      cache([
        { appid: ULTIMA, kv: ultimaKv('Ultima V (2027)'), change: 7 },
        { appid: OTHER, kv: otherKv() },
      ]),
    );
    const newer = fs.readFileSync(m.cacheFile);
    expect(macReapply({ ...m, steamRunning: () => true })).toBe('steam-running');
    expect(fs.readFileSync(m.cacheFile).equals(newer)).toBe(true);

    expect(macReapply({ ...m, steamRunning: () => false })).toBe('ready');
    const patched = ultimaIn(m.cacheFile);
    expect(isMacPatched(patched.kv, LAUNCHER)).toBe(true);
    expect(patched.header.readUInt32LE(36)).toBe(7);
    const common = (patched.kv[0][2] as KvNode[]).find((n) => n[1] === 'common')![2] as KvNode[];
    expect(common.find((n) => n[1] === 'name')![2]).toBe('Ultima V (2027)');

    expect(await macRestore({ ...m, ...closed })).toBe('done');
    expect(sameEntries(fs.readFileSync(m.cacheFile), newer)).toBe(true);
  });

  it('tells the Steam line whether Steam is running, set up or not, and that a cache without Ultima V is not owned', async () => {
    const m = mac();
    expect(macStatus({ ...m, steamRunning: () => true })).toEqual({ state: 'not-set-up', steamRunning: true });
    expect(macStatus({ ...m, steamRunning: () => false })).toEqual({ state: 'not-set-up', steamRunning: false });
    expect(macPatched(m)).toBe(false);
    expect(await macSetup({ ...m, ...closed })).toBe('done');
    expect(macPatched(m)).toBe(true);
    expect(macStatus({ ...m, steamRunning: () => true })).toEqual({ state: 'ready', steamRunning: true });
    const other = mac();
    fs.writeFileSync(other.cacheFile, cache([{ appid: OTHER, kv: otherKv() }]));
    expect(macStatus({ ...other, steamRunning: () => false })).toEqual({ state: 'not-owned', steamRunning: false });
    expect(macPatched(other)).toBeNull();
  });

  it('does nothing at startup for a Mac that never set it up', () => {
    const m = mac();
    const before = fs.readFileSync(m.cacheFile);
    expect(macReapply({ ...m, steamRunning: () => false })).toBe('not-set-up');
    expect(fs.readFileSync(m.cacheFile).equals(before)).toBe(true);
  });
});
