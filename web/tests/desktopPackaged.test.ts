import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DESKTOP = join(__dirname, '../../desktop');

/** The desktop folder's own modules `file` loads (`require('./x.cjs')`). */
const localRequires = (file: string): string[] =>
  [...readFileSync(join(DESKTOP, file), 'utf8').matchAll(/require\('\.\/([^']+\.cjs)'\)/g)].map((m) => m[1]);

/** Every module the app loads from its entry points, near or far. */
function loaded(entries: string[]): string[] {
  const seen = new Set<string>();
  const todo = [...entries];
  while (todo.length > 0) {
    const file = todo.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    todo.push(...localRequires(file));
  }
  return [...seen].sort();
}

/** The packaged app holds only the files electron-builder's `build.files` lists (desktop/package.json). */
describe('the packaged desktop app', () => {
  it('ships every module main.cjs and preload.cjs load', () => {
    const pkg = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as { build: { files: string[] } };
    const files = pkg.build.files;
    const missing = loaded(['main.cjs', 'preload.cjs']).filter((f) => !files.includes(f));
    expect(missing).toEqual([]);
  });
});
