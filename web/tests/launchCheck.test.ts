// web/tests/launchCheck.test.ts
import { describe, expect, it } from 'vitest';
import { lineState } from '../../desktop/launchCheck.cjs';

const EXE = '/home/me/My Games/ultima5-sp-x86_64.AppImage';
const EXPECTED = `"${EXE}" %command%`;

/** A localconfig.vdf with Ultima V's entry holding `options`; `key` and `path` let a test vary the case. */
const config = (
  options: string | null,
  { path = ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps'], opt = 'LaunchOptions' } = {},
): string => {
  const escaped = options === null ? '' : `\t"${opt}"\t\t"${options.replace(/[\\"]/g, '\\$&')}"\n`;
  const inner = `"3067520"\n{\n\t"cloud"\t\t"x"\n${escaped}}\n`;
  return `${path.map((p) => `"${p}"\n{\n`).join('')}${inner}${path.map(() => '}\n').join('')}`;
};

describe('lineState', () => {
  it('is correct when the line is the one the app gives', () => {
    expect(lineState(config(EXPECTED), EXPECTED, EXE, false)).toBe('correct');
  });

  it('compares the path, not how it is quoted', () => {
    expect(lineState(config(`'${EXE}' %command%`), EXPECTED, EXE, false)).toBe('correct');
    const plain = '/opt/ultima5-sp-x86_64.AppImage';
    expect(lineState(config(`${plain} %command%`), `"${plain}" %command%`, plain, false)).toBe('correct');
    expect(lineState(config(`"${plain}"   %command%`), `"${plain}" %command%`, plain, false)).toBe('correct');
  });

  it('reads a path whose quotes were escaped for the shell', () => {
    const odd = '/home/me/a "b" $c/app.AppImage';
    const line = `"/home/me/a \\"b\\" \\$c/app.AppImage" %command%`;
    expect(lineState(config(line), line, odd, false)).toBe('correct');
  });

  it('finds the entry whatever the case of its keys', () => {
    const c = config(EXPECTED, { path: ['userlocalconfigstore', 'software', 'valve', 'STEAM', 'Apps'], opt: 'launchoptions' });
    expect(lineState(c, EXPECTED, EXE, false)).toBe('correct');
  });

  it('is missing when the file or the entry has no line and Steam has had time to write it', () => {
    expect(lineState(null, EXPECTED, EXE, false)).toBe('missing');
    expect(lineState('"UserLocalConfigStore"\n{\n}\n', EXPECTED, EXE, false)).toBe('missing');
    expect(lineState(config(null), EXPECTED, EXE, false)).toBe('missing');
    expect(lineState(config(''), EXPECTED, EXE, false)).toBe('missing');
    expect(lineState(config('   '), EXPECTED, EXE, false)).toBe('missing');
  });

  it('is not seen yet, rather than missing, when the option was only just turned on', () => {
    expect(lineState(null, EXPECTED, EXE, true)).toBe('not-seen');
    expect(lineState(config(null), EXPECTED, EXE, true)).toBe('not-seen');
    expect(lineState('"UserLocalConfigStore"\n{\n}\n', EXPECTED, EXE, true)).toBe('not-seen');
  });

  it('trusts a line that is there, however recently the option was turned on', () => {
    expect(lineState(config(EXPECTED), EXPECTED, EXE, true)).toBe('correct');
    expect(lineState(config('"/old/place/app.AppImage" %command%'), EXPECTED, EXE, true)).toBe('stale');
  });

  it('is stale when %command% is there once but another engine runs', () => {
    expect(lineState(config('"/home/me/Ultima V-1.0.1.AppImage" %command%'), EXPECTED, EXE, false)).toBe('stale');
    expect(lineState(config('-windowed %command%'), EXPECTED, EXE, false)).toBe('stale');
  });

  it('is stale when this engine is named but %command% is not', () => {
    expect(lineState(config(`"${EXE}"`), EXPECTED, EXE, false)).toBe('stale');
  });

  it('is twice when %command% is pasted more than once', () => {
    expect(lineState(config(`${EXPECTED} %command%`), EXPECTED, EXE, false)).toBe('twice');
    expect(lineState(config('%command% %command%'), EXPECTED, EXE, false)).toBe('twice');
  });

  it('is twice when this engine is named more than once', () => {
    expect(lineState(config(`"${EXE}" '${EXE}' %command%`), EXPECTED, EXE, false)).toBe('twice');
  });

  it('keeps a line the player added to as correct', () => {
    expect(lineState(config(`"${EXE}" -fullscreen %command%`), EXPECTED, EXE, false)).toBe('correct');
  });

  it('works for the Flatpak line, named by its id', () => {
    const flatpak = 'flatpak run com.synthwavepixel.ultima5 %command%';
    expect(lineState(config(flatpak), flatpak, 'com.synthwavepixel.ultima5', false)).toBe('correct');
    expect(lineState(config('%command%'), flatpak, 'com.synthwavepixel.ultima5', false)).toBe('stale');
  });

  it('keeps a \\ that ends a line inside an open quote as it is', () => {
    const odd = '/opt/odd\\';
    expect(lineState(config(`%command% "${odd}`), `"${odd}" %command%`, odd, false)).toBe('correct');
  });

  it('is not fooled by a broken file', () => {
    expect(lineState('"UserLocalConfigStore" { "Software"', EXPECTED, EXE, false)).toBe('missing');
  });
});
