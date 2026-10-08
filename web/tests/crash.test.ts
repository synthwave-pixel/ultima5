import { describe, expect, it } from 'vitest';
import { CrashLog, crashDetails, faultOf, isNoise, type Setting } from '../src/ui/crash.ts';

const SETTING: Setting = {
  version: '0.1.0 (index-abc123.js)',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Steam Deck',
  query: '?autoscan=true',
  when: new Date('2026-10-01T12:00:00Z'),
};

/** An error with the stack a browser would give it. */
function thrown(message: string, stack: string, name = 'Error'): Error {
  const e = new Error(message);
  e.name = name;
  e.stack = stack;
  return e;
}

describe('crash box: what is noise', () => {
  it('lets another origin’s hidden error be', () => {
    expect(isNoise({ error: null, message: 'Script error.' })).toBe(true);
    expect(isNoise({ error: undefined, message: 'Script error.', filename: '' })).toBe(true);
  });

  it('lets an extension’s errors be, by its file or its stack', () => {
    expect(isNoise({ error: new Error('x'), filename: 'chrome-extension://abc/content.js' })).toBe(true);
    expect(isNoise({ error: thrown('x', 'Error: x\n    at f (moz-extension://abc/inject.js:1:2)') })).toBe(true);
  });

  it('lets the ResizeObserver loop and a call called off be', () => {
    expect(isNoise({ error: undefined, message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true);
    expect(isNoise({ error: thrown('The user aborted a request.', '', 'AbortError'), rejection: true })).toBe(true);
    expect(isNoise({ error: { name: 'AbortError', message: 'aborted' }, rejection: true })).toBe(true);
  });

  it('counts the game’s own errors and refusals', () => {
    expect(isNoise({ error: new TypeError("Cannot read properties of undefined (reading 'x')") })).toBe(false);
    expect(isNoise({ error: 'bad', rejection: true })).toBe(false);
    expect(isNoise({ error: undefined, rejection: true })).toBe(false);
  });
});

describe('crash box: what went wrong', () => {
  it('names the error and keeps its stack, not saying the message twice (V8)', () => {
    const f = faultOf({ error: thrown('boom', 'TypeError: boom\n    at go (main.ts:3:4)', 'TypeError') });
    expect(f).toEqual({ message: 'TypeError: boom', stack: '    at go (main.ts:3:4)' });
  });

  it('keeps a stack without the message as it is (Firefox, WebKit)', () => {
    const f = faultOf({ error: thrown('boom', 'go@main.ts:3:4\n') });
    expect(f.message).toBe('Error: boom');
    expect(f.stack).toBe('go@main.ts:3:4');
  });

  it('says a refused promise is one, and what it was refused with', () => {
    expect(faultOf({ error: new Error('x'), rejection: true }).message).toBe('Unhandled rejection: Error: x');
    expect(faultOf({ error: 'no', rejection: true }).message).toBe('Unhandled rejection: no');
    expect(faultOf({ error: { code: 7 }, rejection: true }).message).toBe('Unhandled rejection: {"code":7}');
    expect(faultOf({ error: undefined, rejection: true }).message).toBe('Unhandled rejection: A promise was refused, with no reason given');
  });

  it('gives the place an error event names where there is no stack', () => {
    const f = faultOf({ error: 'thrown string', filename: 'https://x/assets/index.js', lineno: 10, colno: 2 });
    expect(f).toEqual({ message: 'thrown string', stack: 'https://x/assets/index.js:10:2' });
  });
});

describe('crash box: one box, its details added to', () => {
  it('opens on the first fault, adds others, and counts one seen again', () => {
    const log = new CrashLog();
    expect(log.add({ message: 'Error: a', stack: 'at a' })).toBe('new');
    expect(log.add({ message: 'Error: b', stack: 'at b' })).toBe('more');
    expect(log.add({ message: 'Error: a', stack: 'at a' })).toBe('again');
    expect(log.faults.map((f) => [f.message, f.times])).toEqual([
      ['Error: a', 2],
      ['Error: b', 1],
    ]);
  });

  it('keeps twenty, counting the rest', () => {
    const log = new CrashLog();
    for (let i = 0; i < 25; i++) log.add({ message: `Error: ${i}`, stack: '' });
    expect(log.faults).toHaveLength(20);
    expect(log.dropped).toBe(5);
    expect(log.add({ message: 'Error: 99', stack: '' })).toBe('more');
    expect(crashDetails(log, SETTING)).toContain('(6 more not kept)');
  });

  it('writes the details: version, time, browser, query, then each fault and its stack', () => {
    const log = new CrashLog();
    log.add(faultOf({ error: thrown('boom', 'TypeError: boom\n    at go (main.ts:3:4)\n    at run (run.ts:9:1)', 'TypeError') }));
    log.add(faultOf({ error: thrown('later', 'next@x.ts:1:1'), rejection: true }));
    log.add(faultOf({ error: thrown('later', 'next@x.ts:1:1'), rejection: true }));
    expect(crashDetails(log, SETTING)).toBe(
      [
        'Ultima V - crash details',
        'Version: 0.1.0 (index-abc123.js)',
        'When: 2026-10-01T12:00:00.000Z',
        'Browser: Mozilla/5.0 (X11; Linux x86_64) Steam Deck',
        'Query: ?autoscan=true',
        '',
        'TypeError: boom',
        '    at go (main.ts:3:4)',
        '    at run (run.ts:9:1)',
        '',
        'Unhandled rejection: Error: later (x2)',
        '    next@x.ts:1:1',
      ].join('\n'),
    );
  });

  it('says there was no query', () => {
    expect(crashDetails(new CrashLog(), { ...SETTING, query: '' })).toContain('Query: (none)');
  });
});
