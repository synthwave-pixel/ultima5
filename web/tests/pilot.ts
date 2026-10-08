/**
 * A player with a controller, for the tests: it sees what a player sees
 * (the menu on screen, whether the game is waiting for a command) and
 * answers with the pad's keys alone, a step of a script at a time.
 */

import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import type { FakePlatform } from './helpers.ts';

/** A step gives the next key, or undefined when it has nothing more to press. */
export type Step = (g: Game) => number | undefined;

export class Landed extends Error {}

/** Play `steps` in order; when they are spent, the game is stopped by throwing Landed out of the key wait. */
export function fly(g: Game, p: FakePlatform, steps: Step[], budget = 2000): void {
  g.options.input = 'controller';
  let at = 0;
  p.next = () => {
    if (--budget < 0)
      throw new Error(
        `the pilot ran out of keys at step ${at} (menu ${g.menuShown?.title ?? 'none'}): ${p.log.slice(-600).replace(/\s+/g, ' ')}`,
      );
    for (;;) {
      if (at >= steps.length) throw new Landed();
      const k = steps[at](g);
      if (k !== undefined) return k;
      at++;
    }
  };
}

/** Keys, pressed once each. */
export function press(...ks: number[]): Step {
  let i = 0;
  return () => (i < ks.length ? ks[i++] : undefined);
}

/** Choose the line of the menu `title` whose label matches: open nothing, only steer the bar and press A. */
export function pick(title: string, label: string | RegExp): Step {
  let chosen = false;
  return (g) => {
    if (chosen) return undefined;
    const m = g.menuShown;
    if (!m || m.title !== title) throw new Error(`expected the ${title} menu, found ${m?.title ?? 'none'}`);
    const want = m.labels.findIndex((l) => (typeof label === 'string' ? l === label : label.test(l)));
    if (want < 0) throw new Error(`no ${String(label)} in ${title}: ${m.labels.join(' | ')}`);
    if (m.at === want) {
      chosen = true;
      return Pad.A;
    }
    // Across first where the line is in the other column of a two-column list (menu.ts chooseTwoColumns), up and down
    // a row there; in a list of one column, up and down (left and right turn a page in a long one).
    if (m.columns === 2 && (m.at ^ want) & 1) return m.at < want ? K.Right : K.Left;
    return m.at < want ? K.Down : K.Up;
  };
}

/** A command from the command menu: A opens it, then the line is chosen. */
export function command(label: string | RegExp): Step {
  let opened = false;
  const choose = pick('Commands', label);
  return (g) => {
    if (!opened) {
      if (g.commandPrompt === '') throw new Error('not at a command prompt');
      opened = true;
      return Pad.A;
    }
    return choose(g);
  };
}

/** A step made afresh and played again and again, until the game is as wanted (looked at between the plays). */
export function until(done: (g: Game) => boolean, again: () => Step): Step {
  let step: Step | null = null;
  return (g) => {
    for (;;) {
      if (!step) {
        if (done(g)) return undefined;
        step = again();
      }
      const k = step(g);
      if (k !== undefined) return k;
      step = null;
    }
  };
}
