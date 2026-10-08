import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { CF } from '../src/game/game.ts';
import { getChar, getCommandKey, selectDirection, selectMember } from '../src/game/input.ts';
import { K, Pad } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/**
 * The buttons' one meaning each (the port's): A chooses and B backs out everywhere; X attacks and Y casts; Start or
 * Select holds the game from anywhere; and the keyboard, read as a controller, gives either hand all of them.
 */
const controller = () => {
  const { g, p } = newGame();
  g.options.input = 'controller';
  g.inPlay = true;
  return { g, p };
};

describe('Start and Select, wherever the game waits', () => {
  it('pause at a prompt inside a command - its saving greyed - and the prompt waits on after', async () => {
    for (const button of [Pad.Start, Pad.Select]) {
      const { g, p } = controller();
      let paused: { title: string; save?: boolean; quit?: boolean } | null = null;
      p.keys.push(button);
      p.next = () => {
        const m = g.menuShown;
        if (m?.title === 'Paused' && !paused)
          paused = { title: m.title, save: m.enabled[m.labels.indexOf('Save game')], quit: m.enabled[m.labels.indexOf('Save and quit')] };
        return m ? Pad.B : Pad.A;
      };
      expect(await getChar(g)).toBe(K.Enter); // the key after the pause is the prompt's
      expect(paused).toEqual({ title: 'Paused', save: false, quit: false });
      expect(g.paused).toBe(false);
    }
  });

  it('pause from a menu, which is there again after; and back out of the Pause menu itself', async () => {
    const { g, p } = controller();
    const seen: string[] = [];
    p.keys.push(Pad.Start);
    p.next = () => {
      const m = g.menuShown;
      seen.push(m?.title ?? '');
      if (m?.title === 'Paused') return Pad.Start; // Start in the Pause menu closes it
      return seen.filter((t) => t === 'Pick').length > 1 ? Pad.A : K.Down;
    };
    const at = await choose(g, 'Pick', [{ label: 'One' }, { label: 'Two' }]);
    expect(seen.slice(0, 2)).toEqual(['Paused', 'Pick']);
    expect(at).toBe(1); // the menu, drawn again, took its keys as before
  });

  it('pause at the command prompt with saving there, as ever', async () => {
    const { g, p } = controller();
    let save: boolean | undefined;
    p.keys.push(Pad.Start);
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'Paused') {
        save = m.enabled[m.labels.indexOf('Save game')];
        return Pad.B;
      }
      return Pad.Y;
    };
    g.s.mapId = 0;
    expect(await getCommandKey(g, 'outdoors')).toBe(0x43);
    expect(save).toBe(true);
  });
});

describe('X and Y inside a command', () => {
  it('do nothing at a direction - B backs out of it, saying no "Pass" - and a keyboard read as a controller: Space and Escape B', async () => {
    const { g, p } = controller();
    p.keys.push(Pad.X, Pad.Y, 0x71 /* q */, 0x2e /* . */, K.Up);
    expect(await selectDirection(g)).toBe(true);
    expect(g.s.dy).toBe(-1);
    for (const b of [0x20 /* Space */, K.Escape]) {
      p.log = '';
      p.keys.push(Pad.X, b);
      expect(await selectDirection(g)).toBe(false);
      expect(p.log).not.toMatch(/Pass/); // no turn passed, and none said
      expect(g.cancelled).toBe(true);
    }
  });

  it('choose a member only by A - and by Y, where a spell asks whom it is for', async () => {
    const { g, p } = controller();
    p.keys.push(Pad.X, Pad.Y, K.Down, Pad.A);
    expect(await selectMember(g)).toBe(1);
    g.casting = true;
    p.keys.push(Pad.X, K.Down, Pad.Y);
    expect(await selectMember(g)).toBe(1);
  });
});

describe('auto combat', () => {
  it("plays a creature summoned or charmed to the party's side, as it plays the members: a foe beside it struck", async () => {
    const { g } = controller();
    const s = g.s;
    s.mapId = 0xff;
    g.options.autoCombat = true;
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    const ours = g.combat[6];
    Object.assign(ours, { flags: CF.Monster | CF.Charmed, who: 0, x: 5, y: 5, hp: 20 });
    const foe = g.combat[7];
    Object.assign(foe, { flags: CF.Monster, who: 0, x: 5, y: 4, hp: 20 });
    s.combatTurn = 6;
    s.crosshair = 0;
    expect(await autoKey(g)).toBe(0x41);
  });
});

describe('the keyboard in Classic', () => {
  it('keeps every letter a command, Space the pass and Escape the Pause menu - none of them buttons', async () => {
    const { g, p } = newGame();
    g.options.input = 'letters';
    g.inPlay = true;
    for (const ch of ['A', 'C', 'Q', 'E', 'X', 'Z', 'L']) {
      p.keys.push(ch.charCodeAt(0));
      expect(await getCommandKey(g, 'town'), ch).toBe(ch.charCodeAt(0));
    }
    p.keys.push(0x20);
    expect(await getCommandKey(g, 'town')).toBe(K.Space);
    let paused = false;
    p.keys.push(K.Escape);
    p.next = () => {
      paused ||= g.menuShown?.title === 'Paused';
      return g.menuShown ? K.Escape : 0x41;
    };
    expect(await getCommandKey(g, 'town')).toBe(0x41);
    expect(paused).toBe(true);
    // And at a prompt, the letters are letters; / and . are what they are.
    p.next = undefined;
    p.keys.push(0x2f, 0x2e, 0x71);
    expect([await getChar(g), await getChar(g), await getChar(g)]).toEqual([0x2f, 0x2e, 0x51]);
  });
});

describe('Ready', () => {
  /** Ready for the first member: `ready` the armament whose line begins so (or nothing), then the list closed. */
  const readyThen = async (ready: string | null): Promise<{ cancelled: boolean; readied: boolean }> => {
    const { readyCommand } = await import('../src/game/zstats.ts');
    const { g, p } = controller();
    const s = g.s;
    s.equipment[0x10] = 1; // a dagger in the pack
    s.members[0].str = 99; // strong enough to carry it
    const was = s.members[0].equips.join();
    let done = ready === null;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'Ready' && !done) {
        const at = m.labels.findIndex((l) => l.startsWith(ready!));
        if (m.at === at) done = true;
        return m.at === at ? Pad.A : m.at < at ? K.Down : K.Up;
      }
      return m?.title === 'Ready' ? Pad.B : Pad.A; // the member asked for (the first), then the list closed
    };
    await readyCommand(g);
    return { cancelled: g.cancelled, readied: s.members[0].equips.join() !== was };
  };

  it('spends the turn, as in 1988, when something was readied - and none when the list is closed as it was', async () => {
    const readied = await readyThen('Dagger');
    expect(readied.readied).toBe(true);
    expect(readied.cancelled).toBe(false);
    const nothing = await readyThen(null);
    expect(nothing.readied).toBe(false);
    expect(nothing.cancelled).toBe(true);
  });
});

describe('found in play', () => {
  it("chooses with Y in a spell's lists, as the button that began the cast; and in no other menu", async () => {
    const { g, p } = controller();
    g.casting = true;
    p.keys.push(K.Down, Pad.Y);
    expect(await choose(g, 'Spells', [{ label: 'Light' }, { label: 'Heal' }])).toBe(1);
    g.casting = false;
    p.keys.push(K.Down, Pad.Y, Pad.B);
    expect(await choose(g, 'Commands', [{ label: 'Look' }, { label: 'Cast' }])).toBe(-1);
  });

  it("names the cheats' places as a sentence would, not in the game's capitals", async () => {
    const { cheatsFor } = await import('../src/game/cheats.ts');
    const { g, p } = controller();
    let labels: string[] = [];
    p.next = () => {
      labels = g.menuShown?.labels ?? labels;
      return Pad.B;
    };
    await cheatsFor(g, true)
      .find((c) => c.label === 'Go to...')!
      .apply(g);
    expect(labels).toContain("Iolo's Hut");
    expect(labels).toContain("Serpent's Hold");
    expect(labels).toContain("Lord British's castle"); // kept as the game has it, being cased already
    expect(labels.filter((l) => l.length > 3 && l === l.toUpperCase())).toEqual([]);
  });
});

describe('Ztats on a controller', () => {
  it('turns the page with A, as Help does - and Classic keeps its Enter doing nothing', async () => {
    const { processCommand } = await import('../src/game/commands.ts');
    const pages = async (mode: 'controller' | 'letters'): Promise<string[]> => {
      const { g, p } = controller();
      g.options.input = mode;
      const seen: string[] = [];
      const script = [K.Enter, K.Enter, K.Enter, K.Escape];
      p.next = () => {
        seen.push(p.rows.map((r) => r.join('')).join('\n'));
        return script.shift() ?? K.Escape;
      };
      await processCommand(g, 0x5a);
      return seen;
    };
    const pad = await pages('controller');
    expect(pad[2]).not.toBe(pad[1]); // A, on a page: the next
    expect(pad[2]).toMatch(/Arms/);
    const classic = await pages('letters');
    expect(classic[2]).toBe(classic[1]); // Enter, in Classic: the page as it was
  });
});

describe('All is lost', () => {
  it('offers the last save and the earlier ones greyed and said where there are none, takes no B for an answer, and Lord British raises the party', async () => {
    const { death } = await import('../src/game/story.ts');
    const { g, p } = controller();
    g.s.mapId = 0;
    for (const m of g.s.members.slice(0, g.s.partySize)) m.hp = 0;
    let shown: { labels: string[]; enabled: boolean[]; at: number } | null = null;
    let bs = 0;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'All is lost') {
        shown ??= { labels: m.labels, enabled: m.enabled, at: m.at };
        if (bs < 2) {
          bs++;
          return Pad.B; // no answer: the menu stays
        }
        return Pad.A;
      }
      return Pad.A;
    };
    await death(g);
    expect(shown).toEqual({
      labels: ['Load the last save', 'Load an earlier save', "Lord British's aid"],
      enabled: [false, false, true],
      at: 2,
    });
    expect(bs).toBe(2);
    expect(g.s.mapId).toBe(0x11); // in his castle
    expect(g.s.members[0].hp).toBe(g.s.members[0].maxHp);
  });
});

describe('Mix, on a controller', () => {
  it('says "None!" when B is pressed at how many, and spends no turn', async () => {
    const { mixCommand } = await import('../src/game/magic.ts');
    const { g, p } = controller();
    g.s.reagents.fill(9);
    // The first spell, then none of it - and, back at the list, none at all.
    let asked = false;
    p.next = () => (g.menuShown?.title === 'How many?' ? ((asked = true), Pad.B) : asked ? Pad.B : Pad.A);
    await mixCommand(g);
    expect(p.log.lastIndexOf('None!')).toBeGreaterThan(p.log.lastIndexOf('How much?'));
    expect(g.cancelled).toBe(true);
  });
});
