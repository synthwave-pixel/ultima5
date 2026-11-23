import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import { K, Pad, type Platform } from '../src/game/io.ts';
import { anything, PAD, pageHarness } from './pageHarness.ts';

afterEach(() => vi.unstubAllGlobals());

/** A game on the engine that says, by its own rules, where the page's controller features apply. */
class Asks extends GameCore {
  pairs = false;
  passes = false;
  sails = false;
  override get pairsWays(): boolean {
    return this.pairs;
  }
  override get passRepeats(): boolean {
    return this.passes;
  }
  override get sailsInTwos(): boolean {
    return this.sails;
  }
}

const game = (): Asks => new Asks(anything as Platform);
const codes = (pushed: { code: number }[]): number[] => pushed.map((p) => p.code);

/**
 * The page's controller features (issue #40) ask the game whether they apply now - GameCore.pairsWays, passRepeats,
 * sailsInTwos, each the game's own to say - not Ultima V's prompt by name, which another game's play need not set.
 */
describe('the page asks the game', () => {
  it("pairs the d-pad's two ways where the game says, one way where it does not", async () => {
    const g = game();
    g.pairs = true;
    const run = await pageHarness(g);
    const sent = codes(run.hold([PAD.Up, PAD.Right], 0, 1000));
    expect(sent.slice(0, 4)).toEqual([K.Up, K.Right, K.Up, K.Right]);
    const one = await pageHarness(game());
    expect(new Set(codes(one.hold([PAD.Up, PAD.Right], 0, 1000)))).toEqual(new Set([K.Right]));
  });

  it('passes again with B held where the game says, once where it does not', async () => {
    const g = game();
    g.passes = true;
    const run = await pageHarness(g);
    const sent = run.hold([PAD.B], 0, 1000);
    expect(sent.length).toBeGreaterThan(2);
    expect(sent.every((p) => p.code === Pad.B)).toBe(true);
    const once = await pageHarness(game());
    expect(codes(once.hold([PAD.B], 0, 1000))).toEqual([Pad.B]);
  });

  it("repeats the keyboard's Pass - Space, X or B held in Controller input - where the game says B passes again", async () => {
    const g = game();
    g.options.input = 'controller';
    const { screen } = await pageHarness(g);
    const drop = (screen as unknown as { dropRepeat: (k: number) => boolean }).dropRepeat;
    const [space, x, X, b, z] = [0x20, 0x78, 0x58, 0x62, 0x7a];
    // Asked at each repeat: where B passes again, the keys that are B repeat; elsewhere (a fight, a question) they do not.
    g.passes = true;
    expect([space, x, X, b].map(drop)).toEqual([false, false, false, false]);
    expect(drop(z)).toBe(true);
    g.passes = false;
    expect([space, x, X, b, z].map(drop)).toEqual([true, true, true, true, true]);
  });

  it('goes two at a time where the game says it sails', async () => {
    const g = game();
    g.pairs = g.sails = true;
    const run = await pageHarness(g);
    expect(codes(run.hold([PAD.Up, PAD.Right], 0, 1000)).slice(0, 6)).toEqual([K.Up, K.Up, K.Right, K.Right, K.Up, K.Up]);
  });

  it('reads W and D as the ways they are in Controller input, for the two at a time', async () => {
    const g = game();
    g.sails = true;
    g.options.input = 'controller';
    const { screen } = await pageHarness(g);
    const [W, D] = [0x77, 0x64];
    const sent = [W, D, W, D, W, D].map((k, i) => screen.inTwos!.take(k, i > 0, i * 150));
    expect(sent).toEqual([W, K.Up, K.Right, D, W, K.Up]);
  });

  it("asks nothing of Ultima V's prompt names: a core game that names them gets none of the three", async () => {
    const g = new GameCore(anything as Platform);
    Object.assign(g, { inPlay: true, awaitingCommand: true, commandPrompt: 'outdoors', lastCommandPrompt: 'outdoors' });
    expect([g.pairsWays, g.passRepeats, g.sailsInTwos]).toEqual([false, false, false]);
    const run = await pageHarness(g);
    expect(new Set(codes(run.hold([PAD.Up, PAD.Right], 0, 1000)))).toEqual(new Set([K.Right]));
    expect(codes(run.hold([], 1016, 1100))).toEqual([]);
    expect(codes(run.hold([PAD.B], 1116, 2000))).toEqual([Pad.B]);
  });
});
