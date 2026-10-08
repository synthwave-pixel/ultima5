import { describe, expect, it } from 'vitest';

/** The page going away and coming back: the engine's waits hold, so nothing runs on in a tab nobody is watching. */
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
});
