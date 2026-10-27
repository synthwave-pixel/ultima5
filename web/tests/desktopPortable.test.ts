import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA, portableData } from '../../desktop/portable.cjs';

describe('the portable .exe keeps its data beside itself', () => {
  let root = '';
  const fresh = () => (root = mkdtempSync(join(tmpdir(), 'u5-portable-')));
  afterEach(() => {
    if (!root) return;
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('is nothing for any other copy', () => {
    expect(portableData({ env: {}, old: '/nowhere' })).toBeNull();
  });

  it('makes a folder next to the .exe', () => {
    const exeDir = join(fresh(), 'games');
    mkdirSync(exeDir);
    const data = portableData({ env: { PORTABLE_EXECUTABLE_DIR: exeDir }, old: join(root, 'none') });
    expect(data).toBe(join(exeDir, DATA));
    expect(existsSync(data!)).toBe(true);
  });

  it('brings over the save from AppData the first time, without the caches, and leaves AppData as it was', () => {
    const old = join(fresh(), 'Roaming', 'Ultima V');
    mkdirSync(join(old, 'Local Storage', 'leveldb'), { recursive: true });
    writeFileSync(join(old, 'Local Storage', 'leveldb', '000003.log'), 'the save');
    writeFileSync(join(old, 'window.json'), '{"fullScreen":false}');
    mkdirSync(join(old, 'Code Cache'));
    mkdirSync(join(old, 'GPUCache'));
    writeFileSync(join(old, 'SingletonLock'), '');
    const exeDir = join(root, 'stick');
    mkdirSync(exeDir);
    const data = portableData({ env: { PORTABLE_EXECUTABLE_DIR: exeDir }, old })!;
    expect(readFileSync(join(data, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('the save');
    expect(existsSync(join(data, 'window.json'))).toBe(true);
    for (const gone of ['Code Cache', 'GPUCache', 'SingletonLock']) expect(existsSync(join(data, gone))).toBe(false);
    expect(existsSync(join(old, 'window.json'))).toBe(true);
    expect(existsSync(`${data}.part`)).toBe(false);
  });

  it('copies only once: later the folder beside the .exe is the data', () => {
    const old = join(fresh(), 'old');
    mkdirSync(old);
    const exeDir = join(root, 'exe');
    mkdirSync(join(exeDir, DATA), { recursive: true });
    writeFileSync(join(old, 'window.json'), 'stale');
    const data = portableData({ env: { PORTABLE_EXECUTABLE_DIR: exeDir }, old })!;
    expect(existsSync(join(data, 'window.json'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('falls back when the folder cannot be written', () => {
    const exeDir = join(fresh(), 'readonly');
    mkdirSync(exeDir);
    chmodSync(exeDir, 0o555);
    chmodSync(root, 0o555);
    expect(portableData({ env: { PORTABLE_EXECUTABLE_DIR: exeDir }, old: '/nowhere' })).toBeNull();
    chmodSync(exeDir, 0o755);
  });
});
