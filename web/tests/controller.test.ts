import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/** What a player with no letters to press needs in order to finish the game. */
describe('playing with a controller alone', () => {
  it('dials a number: up and down by one, right and left by ten', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { getNumber } = await import('../src/game/input.ts');
    p.keys.push(K.Right, K.Right, K.Up, K.Up, K.Up, K.Down, Pad.A);
    expect(await getNumber(g, 2)).toBe(23); // from one: a player buying wants at least that
    p.keys.push(K.Down, K.Left, Pad.A); // never below nothing
    expect(await getNumber(g, 2)).toBe(0);
    p.keys.push(...Array<number>(12).fill(K.Right), Pad.A); // nor past what the digits allow
    expect(await getNumber(g, 2)).toBe(99);
  });

  it("offers a shopkeeper's lettered list as a menu", async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.text.select(2);
    g.print('"Fine! We sell:\n\nA...Ginseng\nB...Garlic\nC...Spider Silk\n\nThy interest?" ');
    const { getChar, letteredChoices } = await import('../src/game/input.ts');
    expect(letteredChoices(g).map((c) => c.label)).toEqual(['Ginseng', 'Garlic', 'Spider Silk']);
    p.keys.push(K.Down, K.Down, Pad.A);
    expect(await getChar(g, undefined, false, true)).toBe(0x43); // C
    // B out of the list is the prompt's "none" (Space, which every such prompt takes for leaving).
    p.keys.push(Pad.B);
    expect(await getChar(g, undefined, false, true)).toBe(K.Space);
  });

  it('offers no list at a prompt a letter does not answer - a wait, a direction - though one is still in the log', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.text.select(2);
    g.print('"We sell:\n\nA...Ginseng\nB...Garlic\n\nThy interest?"\nThou canst not carry any more!\n');
    const { getChar } = await import('../src/game/input.ts');
    p.keys.push(Pad.A);
    expect(await getChar(g)).toBe(K.Enter);
    expect(g.menuShown).toBeNull();
  });

  it("reads a guild's list, its dots however many", async () => {
    const { g } = newGame();
    g.text.select(2);
    g.print('"We sell:\n\na.........Keys\nb.........Gems\nc......Torches\n\nThy concern?" ');
    const { letteredChoices } = await import('../src/game/input.ts');
    expect(letteredChoices(g).map((c) => c.label)).toEqual(['Keys', 'Gems', 'Torches']);
  });

  it('names the choices of a question put in words, from the words themselves', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.text.select(2);
    g.print(
      '"May I help thee?" Yes\n\n"What\'ll it be... a leg of our tender roast Mutton, a tankard of Ale, or Rations for thy travels?" ',
    );
    const { getLetter } = await import('../src/game/input.ts');
    p.keys.push(K.Down, Pad.A);
    const chosen = getLetter(g, [0x4d, 0x41, 0x52, 0x43]);
    expect(await chosen).toBe(0x41); // Ale: the second line, Chat not being on offer yet
    expect(g.menuShown).toBeNull();
  });

  it("can yell a Shadowlord's name once it has been heard, and not before", async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { askWord } = await import('../src/game/menu.ts');
    const names = g.data.table(0x444a, 3);
    p.keys.push(Pad.A);
    expect(await askWord(g, 0x1e, 'Yell', names)).toBe(''); // only "Say nothing" to choose
    g.words.learn(g, `They call him ${names[1].charAt(0)}${names[1].slice(1).toLowerCase()}, lord of hatred.`);
    p.keys.push(Pad.A);
    expect((await askWord(g, 0x1e, 'Yell', names)).toUpperCase()).toBe(names[1]);
  });

  it('answers a question with a word it listens for that has been heard, or else that it knows not', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { answerMenu } = await import('../src/game/menu.ts');
    // The password is not a yes-or-no question: nothing heard fits it, so there is only knowing not.
    p.keys.push(Pad.A);
    expect(await answerMenu(g, ['dawn'])).toBe('I KNOW NOT');
    expect(g.menuShown).toBeNull();
    g.words.learn(g, 'The password is Dawn, friend.');
    p.keys.push(Pad.A);
    expect((await answerMenu(g, ['dawn'])).toUpperCase()).toBe('DAWN');
    p.keys.push(Pad.B);
    expect(await answerMenu(g, ['dawn'])).toBe('I KNOW NOT'); // backed out of
    p.keys.push(Pad.A);
    expect(await answerMenu(g, [], 'Tester')).toBe('Tester'); // asked their name, they give it
  });

  it('offers yes and no where a question listens for either, and a way out of one asked again', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { answerMenu, LEAVE } = await import('../src/game/menu.ts');
    let labels: string[] = [];
    p.next = () => {
      labels = g.menuShown?.labels ?? labels;
      return Pad.A;
    };
    expect(await answerMenu(g, ['y', 'n'])).toBe('YES');
    expect(labels).toEqual(['Yes', 'No']);
    g.words.learn(g, 'The password is Dawn, friend.');
    expect(await answerMenu(g, ['n', 'dawn'])).toBe('YES');
    expect(labels).toEqual(['Yes', 'No', 'Dawn']);
    // Asked until answered rightly, and the answer heard: it, knowing not, or walking away.
    p.next = () => {
      labels = g.menuShown?.labels ?? labels;
      return labels.length && g.menuShown ? (g.menuShown.at === 2 ? Pad.A : K.Down) : Pad.A;
    };
    expect(await answerMenu(g, ['dawn'], undefined, undefined, true)).toBe(LEAVE);
    expect(labels).toEqual(['Dawn', 'I know not', 'Take leave']);
  });

  it('does not take a longer word for a short mantra', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { askWord } = await import('../src/game/menu.ts');
    const mantras = g.data.table(0x1f5e, 8);
    g.words.learn(g, 'There is much to summon, and a rat behind.'); // much, rat, summon: none of them Mu, Ra or Summ
    p.keys.push(Pad.A);
    expect(await askWord(g, 0xc, 'Mantra', mantras)).toBe(''); // nothing to offer but silence
  });

  it("learns Destard's word from Goeth, who says it backwards, and Doom's from the page it is read on", async () => {
    const { g } = newGame();
    const words = g.data.table(0x4502, 8);
    const back = [...words[2]].reverse().join('');
    expect(g.words.knows(words[2])).toBe(false);
    g.words.learn(g, `Drow of Rewop thou seeketh; remember ${back} htod I.`);
    expect(g.words.knows(words[2])).toBe(true);
    // The Codex is read, not heard: what is printed for the player is learnt from as speech is.
    g.text.select(2);
    g.print(`WHEN@[OU@ART\nR^DY@[OU@MU_\nCALL@FOR[\n${words[7]}@TO UNLOCK@[E@GATE`);
    expect(g.words.knows(words[7])).toBe(false);
    g.learnRead();
    expect(g.words.knows(words[7])).toBe(true);
  });

  it('offers Goeth the words he listens for, which are words heard said backwards', async () => {
    const { g } = newGame();
    g.words.learn(g, 'He knows the Word of Power for the dungeon Destard.');
    expect(g.words.forStub('drow')).toBe('drow');
    expect(g.words.forStub('rewo')).toBe('rewop');
    expect(g.words.forStub('drat')).toBe('dratsed');
    // A word heard the right way round is still preferred, and the game's own lists are never read backwards.
    expect(g.words.forStub('word')).toBe('word');
    expect(g.words.forStub('drow', true)).toBeNull();
  });

  it("hears a word in quotation marks, and one the line's end ran into the word before it", async () => {
    const { g } = newGame();
    const mantras = g.data.table(0x1f5e, 8);
    const cah = mantras.find((m) => /^cah$/i.test(m))!;
    g.words.learn(g, `And in the corn He sayeth '${cah}'!`);
    expect(g.words.forStub(cah, true)).toBe(cah.toLowerCase() === cah ? cah : cah.toLowerCase());
    // A word that ends exactly at the line's end has its space swallowed by the screen, but not by the listener.
    g.text.select(2);
    g.recording = '';
    g.recordWindow = 2;
    g.print('I see the runes');
    g.gap();
    g.print('FALLAX inscribed');
    expect(g.recording).toBe('I see the runes FALLAX inscribed');
    g.learnRead();
    expect(g.words.knows('FALLAX')).toBe(true);
  });
});

describe('Y in a dungeon', () => {
  it('casts, dark or lit (Look is in the menu, where a torch is lit)', async () => {
    const { getCommandKey } = await import('../src/game/input.ts');
    const { Pad } = await import('../src/game/io.ts');
    const { newGame } = await import('./helpers.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    Object.assign(g.s, { d58a6: 0, d58a7: 0, torches: 2 });
    p.keys.push(Pad.Y);
    expect(await getCommandKey(g, 'dungeon')).toBe(0x43);
    g.s.d58a6 = 50;
    p.keys.push(Pad.Y);
    expect(await getCommandKey(g, 'dungeon')).toBe(0x43);
  });
});

describe('Enter in a dungeon', () => {
  it('opens the command menu with Controller input, and turns the party about with Classic, as in 1988', async () => {
    const { getCommandKey } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    const shown: (string | undefined)[] = [];
    const script = [K.Enter, Pad.B, Pad.Y]; // the menu opened and closed, then Y: Cast
    p.next = () => {
      shown.push(g.menuShown?.title);
      return script.shift() ?? Pad.B;
    };
    expect(await getCommandKey(g, 'dungeon')).toBe(0x43);
    expect(shown[1]).toBe('Commands'); // what was up when B was pressed
    p.next = undefined;
    g.options.input = 'letters';
    p.keys.push(K.Enter);
    expect(await getCommandKey(g, 'dungeon')).toBe(K.Enter);
  });
});

describe('X and Y at the command prompt', () => {
  it('attacks with X and casts with Y, wherever the party is', async () => {
    const { getCommandKey } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0;
    g.s.partyTile = 0x1c; // on foot
    for (const where of ['combat', 'town', 'outdoors', 'dungeon'] as const) {
      p.keys.push(Pad.X);
      expect(await getCommandKey(g, where), where).toBe(0x41);
      p.keys.push(Pad.Y);
      expect(await getCommandKey(g, where), where).toBe(0x43);
    }
  });

  it("fires with X aboard a frigate, or beside a castle's cannon: the guns are the attack there", async () => {
    const { getCommandKey } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0;
    g.s.partyTile = 0x21; // a frigate
    p.keys.push(Pad.X);
    expect(await getCommandKey(g, 'outdoors')).toBe(0x46);
    p.keys.push(Pad.X);
    expect(await getCommandKey(g, 'combat')).toBe(0x41); // a fight's X is the blow, aboard or not
    g.s.mapId = 1; // a towne, a cannon east of the party
    g.view[5 * 32 + 6] = 0xb4;
    p.keys.push(Pad.X);
    expect(await getCommandKey(g, 'town')).toBe(0x46);
    g.view[5 * 32 + 6] = 0x05;
    p.keys.push(Pad.X);
    expect(await getCommandKey(g, 'town')).toBe(0x41);
  });

  it("marks X's attack to find its own foes with Auto aim on, and to be aimed with it off", async () => {
    const { getCommandKey } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    expect(g.options.autoAim).toBe(true); // how the game starts
    p.keys.push(Pad.X);
    await getCommandKey(g, 'combat');
    expect(g.autoAim).toBe(true);
    p.keys.push(Pad.A, Pad.A); // the menu's Attack (or whatever heads it) never finds its own foes
    await getCommandKey(g, 'combat');
    expect(g.autoAim).toBe(false);
    g.options.autoAim = false;
    p.keys.push(Pad.X);
    await getCommandKey(g, 'combat');
    expect(g.autoAim).toBe(false);
  });
});

describe('the spell list in a fight', () => {
  it("starts on the caster's last spell, so it is cast again at a press", async () => {
    const { selectSpell } = await import('../src/game/magic.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mixtures.fill(0);
    // Heal, Fire bolt and Sleep: spells a fight allows.
    g.s.mixtures[4] = g.s.mixtures[13] = g.s.mixtures[28] = 2;
    Object.assign(g.s.members[0], { level: 8, mp: 50 });
    g.s.mapId = 0xff;
    g.s.combatTurn = 0;
    g.combat[0].who = 0;
    g.lastSpell.set(0, 13);
    p.keys.push(Pad.A);
    expect(await selectSpell(g, true, 0)).toBe(13);
    // With no last spell, the list starts at the first the caster can cast (Magic missile before it is unmixed).
    g.lastSpell.clear();
    p.keys.push(Pad.A);
    expect(await selectSpell(g, true, 0)).toBe(4);
  });
});

describe("Y at the game's prompts, on a controller", () => {
  // The letter picker, typing A then B and choosing Done: A at the grid's first letter, right to B, up to the row of
  // Space, Del, Done and Cancel (at the second, Del, as the column was), right to Done.
  const AB_DONE = [Pad.A, K.Right, Pad.A, K.Up, K.Right, Pad.A];

  it('goes on with Y where any key does, and opens no letter picker there', async () => {
    const { getChar } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    p.keys.push(Pad.Y);
    expect(await getChar(g)).toBe(Pad.Y);
    expect(g.menuShown?.title).not.toBe('Letters');
  });

  it("answers a letter's prompt with the picker's first letter, and leaves nothing of the word for the next command", async () => {
    const { getChar, getCommandKey } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    p.keys.push(Pad.Y, ...AB_DONE);
    expect(await getChar(g, undefined, false, true)).toBe(0x41);
    // The B the word went on with is no Board at the next prompt: B the button there, a pass.
    p.keys.push(Pad.B);
    expect(await getCommandKey(g, 'town')).toBe(K.Space);
  });

  it("types the picker's word into a line, its Done ending the line", async () => {
    const { getString } = await import('../src/game/input.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    p.keys.push(Pad.Y, ...AB_DONE);
    expect(await getString(g, 15)).toBe('AB');
  });
});
