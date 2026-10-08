import { describe, expect, it } from 'vitest';
import { journalLines, journalTop, noteConversation } from '../src/game/journal.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** The journal's clues: who said it and where, and what was said - not the prompts the player answered. */
describe('a clue in the journal', () => {
  it('names the speaker and the place, and leaves out the prompt and its echo', () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 4;
    noteConversation(
      g,
      'You see a hearty blacksmith.\n\n"He is the local leader of the Resistance."\n\nYour interest?\n:resistance\n\n"What\'s the password?" You respond- :NO',
    );
    const lines = journalLines(g);
    const at = lines.findIndex((l) => l.includes('leader of the Resistance'));
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1]).toMatch(/^a hearty blacksmith, Yew, /);
    expect(lines.some((l) => /Your interest|You respond/.test(l))).toBe(false);
    expect(lines).toContain('"What\'s the password?"');
  });

  it('keeps an answer whole where any of it is a clue - the way to a shard with the shard - and names the speaker', () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 23; // Cove
    noteConversation(
      g,
      'You see a pretty young girl.\n\nYour interest?\n:name\n\n"My name is Leona."\n\nYour interest?\n:temple\n\n' +
        '"We care for the temple."\n\nYour interest?\n:visi\n\n"In the deep of night, a vision came to my sister and I..."\n\n' +
        '"We saw the Shard of Falsehood deep below a dungeon named Deceit."\n\n' +
        '"The path revealed traveled first southwest across high peaks."\n\n"Here, upon a small isle, lies the Shard of Falsehood!"\n\n' +
        'Your interest?\n:bye',
      'Leona',
    );
    const lines = journalLines(g);
    expect(lines.some((l) => l.includes('southwest across high peaks'))).toBe(true);
    expect(lines.some((l) => l.includes('a vision came to my sister'))).toBe(true);
    expect(lines.some((l) => l.includes('We care for the temple'))).toBe(false); // an answer with no clue in it
    expect(lines.some((l) => /^Leona, Cove, /.test(l))).toBe(true);
  });

  it("keeps the harpsichord tune's phrase as the composer gives it", () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 11;
    noteConversation(
      g,
      'You see a scholarly gentleman.\n\n"Dost thou wish to learn the harpsichord?" You respond- :YES "Good! So the first phrase goes 678 987 8767653! Now thou must practice!"',
    );
    const lines = journalLines(g);
    expect(lines.some((l) => l.includes('678 987 8767653'))).toBe(true);
  });

  it("writes a place's name as a name: Serpent's Hold, not SERPENT'S HOLD nor Serpent'S Hold", () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 32;
    noteConversation(g, 'You see a sincere man.\n\n"I am the keeper of the Flame of Courage."');
    expect(journalLines(g).some((l) => l.startsWith("a sincere man, Serpent's Hold, "))).toBe(true);
  });
});

/** The journal's lines (journal.ts journalTop): the quest's parts with their counts, the many opening onto each. */
describe('the journal', () => {
  it("counts the quest's parts, each set against the right edge", async () => {
    const { journalTop } = await import('../src/game/journal.ts');
    const { g } = newGame();
    const s = g.s;
    s.questActive = 0b0110; // Compassion ordained, Valour answered by the Codex
    s.questDone = 0b1100; // Justice done
    s.d58d0.fill(0);
    s.d58d0[2] = 1;
    s.shards.fill(0);
    s.shards[0] = 1;
    s.shadowlords.fill(0);
    s.shadowlords[1] = 0xff;
    const top = journalTop(g);
    expect(top.map((l) => l.label)).toEqual([
      'Shrines           1/8',
      'Ordained          2/8',
      'Dungeons unsealed 1/8',
      'Shards held         1',
      'Shadowlords slain 1/3',
      'Equipment',
      'Companions',
      `Clues heard ${String(g.notes.length).padStart(9)}`,
    ]);
    expect(top.every((l) => l.label.length <= 21)).toBe(true);
    expect(top.slice(0, 7).every((l) => l.hint.length > 0)).toBe(true); // every part but the clues, which the Tips cover
    const lines = (i: number): string[] => {
      const open = top[i].open;
      return open ? open.lines.map((l) => l.label) : [];
    };
    expect(lines(0).slice(0, 4)).toEqual([
      'Honesty              ',
      'Compassion   ordained',
      'Valour       answered',
      'Justice          done',
    ]);
    expect(lines(1)).toEqual(['Compassion   ordained', 'Valour       answered']); // the quests begun and not done
    expect(lines(2)[2]).toBe('Destard      unsealed');
    expect(lines(4)).toEqual(['Falsehood            ', 'Hatred          slain', 'Cowardice            ']);
    expect(top[7].open?.title).toBe('Clues heard');
  });

  it('prints the hint of the line the bar is on when Y is pressed, and leaves the list open', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { Pad } = await import('../src/game/io.ts');
    const { fly, Landed, press } = await import('./pilot.ts');
    const { g, p } = newGame();
    fly(g, p, [press(Pad.Y, Pad.B)]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log.replace(/\s+/g, ' ')).toContain('Hint: Kneel at a shrine');
  });

  it("gives no hint for A, on a line or under one: a hint is Y's alone", async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    // A on the first line (the shrines), A on the first shrine under it, then out.
    const script = [Pad.A, Pad.A, Pad.B, Pad.B];
    fly(g, p, [() => script.shift()]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).not.toMatch(/Hint:/);
  });
});

describe("the journal's shrines and dungeons, on A", () => {
  it('says what is known of each: a mystery, then found, its mantra or Word, and how its quest stands', async () => {
    const { journalTop, MYSTERY } = await import('../src/game/journal.ts');
    const { g } = newGame();
    const about = (title: string, i: number): string | undefined => {
      const open = journalTop(g).find((l) => l.open?.title === title)!.open;
      return open?.lines[i].about;
    };
    // Compassion (1) and Covetous (4), knowing nothing of either.
    expect(about('Shrines', 1)).toBe(MYSTERY);
    expect(about('Dungeons', 4)).toBe(MYSTERY);
    g.words.learn(g, 'The Mantra of Compassion is MU!');
    expect(about('Shrines', 1)).toBe('Mantra: MU.');
    g.fog.mark(false, g.data.bytes(0x1f6e, 8)[1], g.data.bytes(0x1f76, 8)[1]);
    expect(about('Shrines', 1)).toBe('Found. Mantra: MU.');
    g.s.questActive |= 2;
    expect(about('Shrines', 1)).toBe('Found. Mantra: MU. Quest ordained: seek the Codex.');
    expect(about('Ordained', 0)).toBe('Found. Mantra: MU. Quest ordained: seek the Codex.');
    g.s.questDone |= 2;
    expect(about('Shrines', 1)).toMatch(/The Codex has answered: return to the shrine\.$/);
    g.s.questActive &= ~2;
    expect(about('Shrines', 1)).toMatch(/Quest complete\.$/);
    // A dungeon: its Word heard, its entrance seen, unsealed.
    g.words.learn(g, 'The Word of Power to open the dungeon of Covetous is AVIDUS!');
    expect(about('Dungeons', 4)).toBe('Word of Power: AVIDUS.');
    const covetous = g.data.locations[0x24];
    g.fog.mark(false, covetous.x, covetous.y);
    expect(about('Dungeons', 4)).toBe('Found. Word of Power: AVIDUS.');
    g.s.d58d0[4] = 0x80;
    expect(about('Dungeons', 4)).toBe('Found. Word of Power: AVIDUS. Unsealed.');
    // Doom's entrance is the Underworld's.
    const doom = g.data.locations[0x27];
    g.fog.mark(false, doom.x, doom.y);
    expect(about('Dungeons', 7)).toBe(MYSTERY);
    g.fog.mark(true, doom.x, doom.y);
    expect(about('Dungeons', 7)).toBe('Found.');
  });

  it('shows it on the panel as the bar comes to the line, and the list stays', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    const script = [Pad.A, Pad.A, Pad.B, Pad.B];
    fly(g, p, [() => script.shift()]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('A mystery...');
  });
});

describe("the journal's clues, by topic", () => {
  it('sorts the clues heard under their topics, the newest first, and greys those about things done', async () => {
    const { journalTop } = await import('../src/game/journal.ts');
    const { g } = newGame();
    const lord = g.data.table(0x444a, 3)[0].trim(); // the Shadowlord of Falsehood
    const note = (who: string, text: string, date = '4-1-139'): void => {
      g.notes.push({ who, where: 'Britain', text, date });
    };
    note('Greyson', 'The Mantra of Compassion is MU!');
    note('Greyson', 'Use it well, friend.'); // the same answer's next paragraph: Greyson's topic
    note('Chamfort', 'The password of the Resistance is DAWN.', '4-2-139');
    note('Lord Shalineth', `The Shadowlord of Falsehood is named ${lord}.`, '4-3-139');
    note('Eb', 'Asleep. Up and about from 7:00 to 20:00.', '4-3-139');
    const topics = (): { label: string; read?: { text: string; dim: boolean }[] }[] => journalTop(g).at(-1)!.open!.lines;
    const label = (name: string): string | undefined =>
      topics()
        .find((t) => t.label.startsWith(name))
        ?.label.replace(/\s+/g, ' ');
    expect(topics().map((t) => t.label.replace(/\s+/g, ' '))).toEqual(['Mantras 2', 'Shadowlords 1', 'Resistance 1', 'When folk are up 1']);
    // Compassion's quest done: its clues greyed and counted apart; the password never.
    g.s.questDone |= 2;
    expect(label('Mantras')).toBe('Mantras 1/2');
    const mantras = topics().find((t) => t.label.startsWith('Mantras'))!.read!;
    expect(mantras.filter((l) => l.text.includes('MU')).every((l) => l.dim)).toBe(true);
    expect(mantras.find((l) => l.text.includes('Use it well'))!.dim).toBe(false); // names nothing: never greyed
    expect(mantras.findIndex((l) => l.text.includes('Use it well'))).toBeLessThan(mantras.findIndex((l) => l.text.includes('MU')));
    // The Shadowlord slain: greyed.
    expect(label('Shadowlords')).toBe('Shadowlords 1');
    g.s.shadowlords[0] = 0xff;
    expect(label('Shadowlords')).toBe('Shadowlords 0/1');
    expect(label('Resistance')).toBe('Resistance 1');
  });

  it('says nothing yet, before anything is heard', async () => {
    const { journalTop } = await import('../src/game/journal.ts');
    const { g } = newGame();
    const lines = journalTop(g).at(-1)!.open!.lines;
    expect(lines.map((l) => [l.label, l.enabled])).toEqual([['Nothing yet.', false]]);
  });

  it('opens a topic to read on A, its greyed clues dim', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed, press } = await import('./pilot.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    g.notes.push({ who: 'Greyson', where: 'Britain', text: 'The Mantra of Compassion is MU!', date: '4-1-139' });
    let shown = '';
    fly(g, p, [
      // Clues heard, the last of the journal's lines: up wraps to it.
      press(K.Up, Pad.A, Pad.A),
      () => {
        if (shown) return undefined;
        shown = p.rows.map((r) => r.join('')).join('\n');
        return Pad.B;
      },
      press(Pad.B, Pad.B),
    ]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(shown).toContain('Mantras');
    expect(shown).toContain('Greyson, Britain');
  });
});

describe("the journal's cards", () => {
  it('shows the line under the bar that says something on the party panel, and the party again on a line that does not', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    const screens: string[] = [];
    const shot = (): string => p.rows.map((r) => r.join('')).join('\n');
    // Into the shrines (A), a look at the first, down to the second, a look, then back out to the journal's lines, a
    // look, and down to the clues heard (no hint, nothing to say), a look.
    const keys = [Pad.A, 'shot', K.Down, 'shot', Pad.B, 'shot', ...Array<number>(7).fill(K.Down), 'shot', Pad.B];
    fly(g, p, [
      () => {
        const k = keys.shift();
        if (k === 'shot') {
          screens.push(shot());
          return keys.shift() as number | undefined;
        }
        return k as number | undefined;
      },
    ]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(screens[0]).toContain('Honesty:');
    expect(screens[0]).toContain('A mystery...');
    expect(screens[0]).toContain('Y: Hint');
    expect(screens[1]).toContain('Compassion:');
    // Back at the journal's own lines, on the Shrines.
    expect(screens[2]).toContain('Shrines:');
    expect(screens[2]).toContain('drawn to the');
    expect(screens[2]).toContain('Y: Hint');
    // The clues heard: the party.
    expect(screens[3]).not.toContain('Shrines:');
    expect(screens[3]).not.toContain('Y: Hint');
    expect(screens[3]).toContain(g.s.members[0].name);
  });
});

describe("the journal's card titles", () => {
  it("fit the panel's border on every line of the journal's own list, leaving the screen's border and next row alone", async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    const titles: string[] = [];
    let n = 0;
    let border = '';
    let below = '';
    fly(g, p, [
      () => {
        titles.push(p.rows[0].join(''));
        border ||= p.rows[0].slice(0, 23).join('');
        below ||= p.rows[1][0];
        expect(p.rows[0].slice(0, 23).join('')).toBe(border); // nothing spilt left of the panel's border
        expect(p.rows[1][0]).toBe(below); // nor wrapped onto the next row
        return n++ < 7 ? K.Down : Pad.B;
      },
    ]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(titles.join('|')).toContain('Shadowlords:');
    expect(titles.join('|')).toContain('Dungeons:');
  });
});

describe("the journal's long hints", () => {
  it('opens a hint too long for the log in a reader of its own, headed with the line, and goes back to the list', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed, press } = await import('./pilot.ts');
    const { journeyOnward } = await import('../src/game/run.ts');
    const { g, p } = newGame();
    journeyOnward(g); // in play: the log the size the frame makes it
    g.fog.named.add('item:crown'); // heard of
    let shown = '';
    let read = false;
    const titles: string[] = [];
    fly(g, p, [
      // The Crown, last of the Equipment, the journal's sixth line.
      press(K.Down, K.Down, K.Down, K.Down, K.Down, Pad.A, ...Array<number>(12).fill(K.Down), Pad.Y),
      () => {
        if (read) return undefined;
        read = true;
        shown = p.rows.map((r) => r.join('')).join('\n');
        return Pad.B; // the reader closed
      },
      (game) => {
        if (game.menuShown) titles.push(game.menuShown.title);
        return undefined;
      },
      press(Pad.B),
    ]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(shown).toContain('Crown');
    expect(shown).toContain("Blackthorn's");
    expect(titles).toEqual(['Equipment']); // back in the list it was asked from
  });
});

describe("the journal's companions", () => {
  it('lists those who may join, found in the files, and says their calling and where they are', async () => {
    const { heardOfThings, journalTop } = await import('../src/game/journal.ts');
    const { g } = newGame();
    const list = (): { label: string; hint: string }[] => {
      const open = journalTop(g).find((l) => l.label === 'Companions')!.open;
      return open ? open.lines : [];
    };
    const lines = list();
    // Thirteen: the roster, less the Avatar and the two the party sets out with.
    expect(lines).toHaveLength(13);
    expect(lines.map((l) => l.label.trim())).not.toContain(g.s.members[1].name);
    // Not yet met: by calling alone, Y still saying where.
    expect(lines.map((l) => l.label.trim())).not.toContain('Mariah');
    expect(lines.filter((l) => l.label === 'Mage...?').length).toBeGreaterThan(1);
    // Named in conversation: by name.
    heardOfThings(g, 'Seek thou Mariah, at the Lycaeum.', 'Someone');
    const mariah = list().find((l) => l.label.startsWith('Mariah'))!;
    expect(mariah.hint).toBe('Mage, found in the Lycaeum.');
    // One who has joined is in the party.
    const i = g.s.members.findIndex((m) => m.name === 'Mariah');
    const tmp = g.s.members[i].b.slice();
    g.s.members[i].b.set(g.s.members[g.s.partySize].b);
    g.s.members[g.s.partySize].b.set(tmp);
    g.s.partySize++;
    const joined = list().find((l) => l.label.startsWith('Mariah'))!;
    expect(joined.label).toBe('Mariah       in party');
    expect(joined.hint).toBe('Mage, in the party.');
  });
});

describe("the journal's equipment", () => {
  it('lists every piece, held or not; its card says what it is for (the quest things, only rumoured), Y where it is had', async () => {
    const { journalScreen } = await import('../src/game/menu.ts');
    const { journalTop } = await import('../src/game/journal.ts');
    const { K, Pad } = await import('../src/game/io.ts');
    const { fly, Landed } = await import('./pilot.ts');
    const { g, p } = newGame();
    const top = journalTop(g);
    const open = top.find((l) => l.label === 'Equipment')!.open;
    const lines = open ? open.lines : [];
    expect(lines.map((l) => l.label)).toContain('Grapple');
    // The quest's things a mystery, Y still saying where: Skull keys, Magic carpet, Black Badge, Crown, Amulet, Sceptre.
    expect(lines.filter((l) => l.label === 'Mystery...?')).toHaveLength(6);
    expect(lines.map((l) => l.label)).not.toContain('Black Badge');
    g.fog.named.add('item:badge'); // heard of
    const badge = journalTop(g)
      .find((l) => l.label === 'Equipment')!
      .open!.lines.find((l) => l.label === 'Black Badge')!;
    expect(badge.about).toBe('Rumors of the Black Badge abound.');
    // Down to Equipment, open it (the Grapple's card on the panel), A on it (nothing more), Y, then out.
    const at = top.findIndex((l) => l.label === 'Equipment');
    const script = [...Array<number>(at).fill(K.Down), Pad.A, Pad.A, Pad.Y, Pad.B, Pad.B];
    fly(g, p, [() => script.shift()]);
    await journalScreen(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    const log = p.log.replace(/\s+/g, ' ');
    expect(log).toContain('Climbs mountains on foot');
    expect(log).toContain('Hint: Lord Michael at Empath Abbey');
  });
});

describe("the journal's mysteries", () => {
  const equipment = async (g: ReturnType<typeof newGame>['g']): Promise<string[]> => {
    const { journalTop } = await import('../src/game/journal.ts');
    return journalTop(g)
      .find((l) => l.label === 'Equipment')!
      .open!.lines.map((l) => l.label);
  };

  it('a thing becomes known when named in conversation, held, or named in a clue already kept', async () => {
    const { heardOfThings } = await import('../src/game/journal.ts');
    const { g } = newGame();
    expect(await equipment(g)).not.toContain('Crown');
    heardOfThings(g, "Lord British's CROWN lies in the palace.", 'Landon');
    expect(await equipment(g)).toContain('Crown');
    expect(await equipment(g)).not.toContain('Sceptre');
    g.s.sceptre = 0xff; // held
    expect(await equipment(g)).toContain('Sceptre');
    g.s.carpets = 1;
    expect(await equipment(g)).toContain('Magic carpet');
    g.notes.push({ who: 'Kristi', where: "Serpent's Hold", text: 'I sell skull keys.', date: '' }); // an older save's clue
    expect(await equipment(g)).toContain('Skull keys');
    expect(await equipment(g)).not.toContain('Amulet');
    expect(await equipment(g)).not.toContain('Black Badge');
  });

  it('a companion is met when talked to, by their name', async () => {
    const { heardOfThings, journalTop } = await import('../src/game/journal.ts');
    const { g } = newGame();
    heardOfThings(g, 'Greetings, traveller.', 'Mariah');
    const labels = journalTop(g)
      .find((l) => l.label === 'Companions')!
      .open!.lines.map((l) => l.label.trim());
    expect(labels).toContain('Mariah');
  });

  it('is saved', async () => {
    const { heardOfThings } = await import('../src/game/journal.ts');
    const { Fog } = await import('../src/game/fog.ts');
    const { g } = newGame();
    heardOfThings(g, 'the amulet', '');
    expect(Fog.decode(JSON.parse(JSON.stringify(g.fog.encode())) as ReturnType<typeof g.fog.encode>).named.has('item:amulet')).toBe(true);
  });
});

describe("the journal's cards, every one", () => {
  it('says all it has to say above "Y: Hint" at the Modern look\'s height (six rows)', async () => {
    const { EQUIPMENT } = await import('../src/game/journalHints.ts');
    const { cardLines } = await import('../src/game/shopCard.ts');
    const rows = (text: string): number => {
      const apart = text.split(/(?<=\.)\s+(?=[A-Z])/).flatMap((s) => cardLines(s));
      return Math.min(apart.length, cardLines(text).length);
    };
    for (const e of EQUIPMENT) {
      const about = e.use ?? `Rumors of the ${e.rumored ?? e.name.toLowerCase()} abound.`;
      expect(rows(about), e.name).toBeLessThanOrEqual(6);
    }
    const { g } = newGame();
    for (const line of journalTop(g)) {
      if (line.about) expect(rows(line.about), line.label).toBeLessThanOrEqual(6);
      for (const sub of line.open?.lines ?? []) if (sub.about) expect(rows(sub.about), sub.label).toBeLessThanOrEqual(6);
    }
  });
});
