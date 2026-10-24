import { describe, expect, it } from 'vitest';

/**
 * The page going away and coming back: the engine's waits hold, and a key's wait draws nothing, so nothing runs on in a
 * tab nobody is watching - nor, with Battery saver, on a screen nobody has touched for a minute.
 */
describe('holding while the page is away', () => {
  it('a wait does not finish until the page is back', async () => {
    const { Screen } = await import('../src/ui/screen.ts');
    const screen = Object.create(Screen.prototype) as InstanceType<typeof Screen>;
    screen.setAwake(false);
    let done = false;
    const wait = screen.sleep(1).then(() => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(done).toBe(false);
    screen.setAwake(true);
    await wait;
    expect(done).toBe(true);
  });

  /** A screen bare of its page (no canvas): what waitKey and push need, set by hand. */
  const bare = async () => {
    const { Screen } = await import('../src/ui/screen.ts');
    const screen = Object.create(Screen.prototype) as InstanceType<typeof Screen>;
    Object.assign(screen, {
      keys: [],
      waiter: null,
      lastInput: performance.now(),
      restAfter: () => null,
      fb: { runes: { active: false } },
    });
    return screen;
  };
  const ms = (n: number) => new Promise((r) => setTimeout(r, n));

  it("a key's wait does nothing while the page is away - no frame drawn - and takes up again when it is back", async () => {
    const screen = await bare();
    let ticks = 0;
    screen.setAwake(false);
    const wait = screen.waitKey(() => void ticks++);
    await ms(400);
    expect(ticks).toBe(0); // (the first tick waits for the page too)
    screen.setAwake(true);
    await ms(400);
    expect(ticks).toBeGreaterThan(0);
    screen.push(0x20);
    expect(await wait).toBe(0x20);
  });

  it('a key ends the wait while the page is away, not lost', async () => {
    const screen = await bare();
    screen.setAwake(false);
    const wait = screen.waitKey(() => undefined);
    screen.push(0x41);
    expect(await wait).toBe(0x41);
  });

  it('with Battery saver, rests a while after the last press - no frame drawn - until the next', async () => {
    const screen = await bare();
    screen.restAfter = () => 200;
    let ticks = 0;
    const wait = screen.waitKey(() => void ticks++);
    await ms(600);
    const rested = ticks;
    await ms(400);
    expect(ticks).toBe(rested); // at rest: nothing more
    expect(rested).toBeGreaterThan(0); // (it went on until the rest came)
    screen.push(0x20);
    expect(await wait).toBe(0x20);
    ticks = 0;
    const again = screen.waitKey(() => void ticks++);
    await ms(150);
    expect(ticks).toBeGreaterThan(0); // the press woke it
    screen.push(0x20);
    await again;
  });
});
