import { describe, expect, it } from 'vitest';
import { PadWatch } from '../src/dev/padWatch.ts';

/**
 * The controller page's record (controllers.html): what the browser lists, what changed, a pad standing still with something
 * down (one that has stopped answering), and the pad the game would read - as plain text to copy into an issue.
 */
const pad = (index: number, id: string, down: number[] = [], axes = [0, 0, 0, 0], timestamp = 0): Gamepad =>
  ({
    index,
    id,
    connected: true,
    mapping: 'standard',
    timestamp,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
  }) as unknown as Gamepad;

const lines = (w: PadWatch): string => w.log.join('\n');

describe('the controller page’s record', () => {
  it('logs a slot filled, buttons down and up, and a stick pushed and back', () => {
    const w = new PadWatch();
    w.step([pad(0, 'Xbox pad')], 0);
    w.step([pad(0, 'Xbox pad', [0], [0, 0, 0, 0], 16)], 16);
    w.step([pad(0, 'Xbox pad', [], [0, -0.9, 0, 0], 32)], 32);
    w.step([pad(0, 'Xbox pad', [], [0, 0, 0, 0], 48)], 48);
    const log = lines(w);
    expect(log).toContain('slot 0: filled by "Xbox pad" (index 0, standard mapping, connected)');
    expect(log).toContain('slot 0: A down');
    expect(log).toContain('slot 0: A up');
    expect(log).toContain('slot 0: axis 1 pushed - (-0.90)');
    expect(log).toContain('slot 0: axis 1 back to the middle');
  });

  it('logs a pad frozen with a way down - its timestamp standing still - and another listed in a new slot', () => {
    const w = new PadWatch();
    for (let t = 0; t <= 3000; t += 100) {
      // The pad dropped at 500 ms, Up down, and listed again in slot 1 at 1000 ms.
      const ghost = pad(0, 'Xbox pad', [12], [0, 0, 0, 0], Math.min(t, 500));
      w.step(t < 1000 ? [ghost] : [ghost, pad(1, 'Xbox pad', t >= 2000 ? [0] : [], [0, 0, 0, 0], t)], t);
    }
    const log = lines(w);
    expect(log).toContain('slot 1: filled by "Xbox pad" (index 1, standard mapping, connected)');
    expect(log).toMatch(/slot 0: timestamp still for \d+ ms with something down/);
    expect(log).toContain('slot 1: now the pad the game reads');
    const report = w.report(3000, ['Browser: test']);
    expect(report).toContain('slot 0: "Xbox pad"\n');
    expect(report).toContain('slot 1: "Xbox pad"  <- the pad the game reads');
    expect(report).toContain('(still, with something down)');
    expect(report).toContain('down: Up');
  });

  it('logs a slot emptied, and a frame that came late', () => {
    const w = new PadWatch();
    w.step([pad(0, 'pad')], 0);
    w.step([null], 16);
    w.step([], 900);
    const log = lines(w);
    expect(log).toContain('slot 0: emptied (was pad)');
    expect(log).toContain('no frame for 884 ms (the page held up, or hidden)');
    expect(w.report(900, [])).toContain('No pads listed by the browser.');
  });
});
