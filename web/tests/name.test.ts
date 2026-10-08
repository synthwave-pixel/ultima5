import { describe, expect, it } from 'vitest';
import { askName } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { amount } from '../src/game/menu.ts';
import { keys, newGame } from './helpers.ts';

/**
 * Asking the player something with no button named (the controller's rule: a prompt is a menu, never a key to be
 * guessed at). The Avatar's name is typed, or taken from the device's own keyboard in a box of the page's, or one of
 * the port's; a number is dialled.
 */
describe('the name', () => {
  const ready = (askText?: (title: string, value: string, max: number) => Promise<string | null>) => {
    const { g, p } = newGame();
    g.hooks.askText = askText;
    g.text.select(0);
    g.recording = '';
    return { g, p };
  };

  it('is typed on a keyboard, straight onto its line, over the name it begins with', async () => {
    const { g, p } = ready();
    p.keys.push(...keys('R', 'o', 'w', 'a', 'n', K.Enter));
    expect(await askName(g, 8, 15)).toBe('Rowan');
  });

  it('begins with one of the port’s names, the bar on "Suggest a name", and keeps it there as names are rolled', async () => {
    const { g, p } = ready();
    const names: string[] = [];
    let n = 0;
    p.next = () => {
      names.push(p.rows[0x13].join('').slice(15, 23).trim()); // the name on its line, as each key is waited for
      const bar = p.rows.slice(0x15, 0x18).map((r) => r.join('').trim());
      expect(bar).toContain('Suggest a name');
      // A, twice, rolls; then down to "Continue" and A takes it.
      return [Pad.A, Pad.A, K.Down, Pad.A][n++];
    };
    const name = await askName(g, 8, 15);
    expect(names[0].length).toBeGreaterThan(0); // a name there from the start
    expect(names[1]).not.toBe(names[0]); // each roll a different one
    expect(names[2]).not.toBe(names[1]);
    expect(name).toBe(names[3]);
  });

  it("comes from the device's own keyboard, in the box the page puts up, and is kept", async () => {
    const asked: [string, number][] = [];
    const { g, p } = ready(async (_title, value, max) => {
      asked.push([value, max]);
      return 'Mirelle';
    });
    p.keys.push(K.Up, Pad.A, Pad.A); // up to Type a name; then Continue, where the bar has gone
    expect(await askName(g, 8, 15)).toBe('Mirelle');
    expect(asked).toHaveLength(1);
    expect(asked[0][0].length).toBeGreaterThan(0); // the box offered the name there, to change
    expect(asked[0][1]).toBe(8);
  });

  it('is one of the port’s at a press, and a box put by leaves the name as it was', async () => {
    const { g, p } = ready(async () => null);
    p.keys.push(K.Up, Pad.A, K.Down, Pad.A, K.Down, Pad.A); // Type a name, the box put by; Suggest a name; kept
    const name = await askName(g, 8, 15);
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toBe('Mirelle');
  });

  it('offers what it can do as a menu, and names no button', async () => {
    const { g, p } = ready(async () => 'Iolanthe');
    p.keys.push(Pad.X, K.Down, Pad.A);
    await askName(g, 8, 15);
    expect(g.recording).toMatch(/Type a name/);
    expect(g.recording).toMatch(/Suggest a name/);
    expect(g.recording).toMatch(/Continue/);
    expect(g.recording).not.toMatch(/\b[ABXY]: |\b[ABXY] (yes|no|none)/);
  });

  it('is typed on the letter picker where the page has no box, or the player has only a gamepad', async () => {
    // The picker: E (the grid's fifth letter), then Done - up past the case's row (a name's) to Space's, right twice.
    const E_DONE = [K.Right, K.Right, K.Right, K.Right, Pad.A, K.Up, K.Up, K.Right, K.Right, Pad.A];
    let asked = 0;
    for (const box of [false, true]) {
      const { g, p } = ready(
        box
          ? async () => {
              asked++;
              return 'Page';
            }
          : undefined,
      );
      if (box) g.lastSource = 'gamepad';
      p.keys.push(K.Up, Pad.A, ...E_DONE, Pad.A); // up to Type a name, the picker's E and Done; Continue
      expect(await askName(g, 8, 15)).toBe('E');
    }
    expect(asked).toBe(0); // the gamepad's player was not handed the page's box
  });

  it('goes back with B where there is no name to rub out: no character made', async () => {
    const { g, p } = ready();
    p.keys.push(...keys('E'), Pad.B, Pad.B);
    expect(await askName(g, 8, 15)).toBe('');
  });
});

describe('a number', () => {
  it('is dialled up, down and by tens, and said with A, the box naming no button', async () => {
    const { g, p } = newGame();
    let shown = '';
    p.next = () => {
      shown = p.rows.map((r) => r.join('')).join('\n'); // the box as it stands, before it is taken down
      return Pad.A;
    };
    p.keys.push(K.Up, K.Up, K.Right, K.Down);
    expect(await amount(g, 1, 99, 1)).toBe(12);
    expect(shown).toMatch(/How many\?/);
    expect(shown).toMatch(/12/);
    expect(shown).not.toMatch(/A yes|B none/);
  });
});

describe('the name in Controller input', () => {
  it('takes Enter as A: on "Suggest a name" it rolls another, and only "Continue" keeps it', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.text.select(0);
    const names: string[] = [];
    let n = 0;
    p.next = () => {
      names.push(p.rows[0x13].join('').slice(15, 23).trim());
      return [K.Enter, K.Down, K.Enter][n++];
    };
    const name = await askName(g, 8, 15);
    expect(names[1]).not.toBe(names[0]); // Enter rolled
    expect(name).toBe(names[2]); // then down to Keep, and Enter kept it
  });
});
