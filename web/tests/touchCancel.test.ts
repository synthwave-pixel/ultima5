import { describe, expect, it } from 'vitest';
import { cancelsTouch } from '../src/ui/touch.ts';

/** A stand-in for an element: `closest` finds it when it, or one it is inside, is one of `tags`. */
const inside = (...tags: string[]) => ({
  closest: (selector: string) => (selector.split(',').some((s) => tags.includes(s.trim())) ? {} : null),
});

/**
 * The touch pad cancels the page's touches (iOS's double-tap zoom), which on a touch screen cancels the click a tap
 * would make too: never on the page's own controls, or the paste box's Import (Import's From the clipboard, where the
 * clipboard cannot be read: the Android app, a phone's browser) and the name box's OK could not be tapped.
 */
describe('touch pad: which touches it cancels', () => {
  it("leaves a tap on the page's buttons and boxes to make its click", () => {
    expect(cancelsTouch(inside('button'))).toBe(false);
    expect(cancelsTouch(inside('textarea'))).toBe(false);
    expect(cancelsTouch(inside('input'))).toBe(false);
    expect(cancelsTouch(inside('a'))).toBe(false);
  });

  it('cancels the rest: the game, and the pad drawn over it', () => {
    expect(cancelsTouch(inside())).toBe(true);
    expect(cancelsTouch(null)).toBe(true);
    expect(cancelsTouch({})).toBe(true); // a target that is no element (the document)
  });
});
