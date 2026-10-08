import { describe, expect, it } from 'vitest';
import { holeUpInBed, waitInTown } from '../src/game/cmds.ts';
import { getHours } from '../src/game/input.ts';
import { K, Pad } from '../src/game/io.ts';
import { commandMenu, contextual } from '../src/game/menu.ts';
import { restOutcome, untilLine } from '../src/game/rest.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { holeUpLabel } from '../src/game/targets.ts';
import { A, T } from '../src/game/tiles.ts';
import { enterTown } from '../src/game/town.ts';
import { tileAt } from '../src/game/world.ts';
import { keys, newGame } from './helpers.ts';

/** A night's rest (rest.ts): a camp, and now a bed, heal where six hours are slept and the last rest is fourteen back. */
describe('resting', () => {
  it('says what the hours will be: a rest at six or more, a wait under, and a wait too soon after the last', () => {
    const { g } = newGame();
    g.s.d588c = 0;
    expect([5, 6, 9, 12].map((h) => restOutcome(g, h))).toEqual(['Wait', 'Rest', 'Rest', 'Rest']);
    // Rested four hours ago: ten to go - the hours slept count them down, so ten or more is a rest again.
    g.s.d588c = 10;
    expect([5, 6, 9, 10, 12].map((h) => restOutcome(g, h))).toEqual(['Wait', 'Wait (Just Rested)', 'Wait (Just Rested)', 'Rest', 'Rest']);
  });

  it('dials the hours on a controller from nine up to twenty-three, saying under the number what they will be', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.d588c = 0;
    g.s.hour = 8;
    const script = [...Array<number>(16).fill(K.Up), ...Array<number>(18).fill(K.Down), Pad.A];
    const seen: string[] = [];
    p.next = () => {
      const m = g.menuShown!;
      seen.push(`${m.title}: ${m.labels.join(' ')}`);
      return script.shift();
    };
    expect(await getHours(g, (h) => restOutcome(g, h))).toBe(5);
    // Under it, the hour the sleep ends at: from eight in the morning.
    expect(seen[0]).toBe('Hours: 9 Rest Until 5 PM');
    expect(seen).toContain('Hours: 23 Rest Until 7 AM'); // and no further: 24 would be the hour it is
    expect(seen.some((l) => l.startsWith('Hours: 24'))).toBe(false);
    expect(seen.at(-1)).toBe('Hours: 5 Wait Until 1 PM');
  });

  it('types the hours on a keyboard, one digit as in 1988', async () => {
    const { g, p } = newGame();
    p.keys.push(...keys('7'));
    expect(await getHours(g, (h) => restOutcome(g, h))).toBe(7);
  });

  /** The party in Iolo's hut, on its bed, at `hour`, everyone at 1 hit point. */
  const inBed = async (hour: number) => {
    const made = newGame(5);
    const { g } = made;
    journeyOnward(g);
    await enterTown(g, true);
    const s = g.s;
    let bed: [number, number] | null = null;
    for (let y = 0; y < 32 && !bed; y++) for (let x = 0; x < 32 && !bed; x++) if (tileAt(g, x, y) === T.Bed) bed = [x, y];
    expect(bed).not.toBeNull();
    [s.x, s.y] = bed!;
    s.hour = hour;
    s.minute = 0;
    s.d588c = 0;
    for (const m of s.members) m.hp = 1;
    return made;
  };

  it('rests in a bed the night through, as a camp does: the poisoned not healed', async () => {
    const { g, p } = await inBed(22);
    const s = g.s;
    s.members[1].status = Status.Poisoned;
    p.keys.push(...keys('9'));
    await holeUpInBed(g);
    const flat = p.log.replace(/\s+/g, '');
    expect(flat).not.toContain('Thrownoutofbed'); // nobody comes home to this bed tonight
    expect(flat).toContain('Partyrested!');
    expect(s.members[0].hp).toBeGreaterThan(1);
    expect(s.members[1].hp).toBe(1);
    // Rested at four, the six hours slept, and slept on to seven: three of the fourteen to the next gone by.
    expect(s.d588c).toBe(0xe - 3);
    expect(s.hour).toBe(7);
  });

  it('rests at the sixth hour of a long sleep and sleeps on; a sleep of twenty hours and more may rest twice', async () => {
    const twelve = await inBed(20);
    twelve.g.options.input = 'controller';
    twelve.p.next = (() => {
      const script = [K.Up, K.Up, K.Up, Pad.A]; // nine to twelve
      return () => script.shift();
    })();
    await holeUpInBed(twelve.g);
    expect(twelve.p.log.match(/Party rested!/g)).toHaveLength(1);
    expect(twelve.g.s.d588c).toBe(0xe - 6); // rested at two in the morning, six hours before waking at eight
    const long = await inBed(0);
    long.g.options.input = 'controller';
    long.p.next = (() => {
      const script = [...Array<number>(14).fill(K.Up), Pad.A]; // nine to twenty-three
      return () => script.shift();
    })();
    await holeUpInBed(long.g);
    expect(long.p.log.match(/Party rested!/g)).toHaveLength(2); // at six, and fourteen after
    expect(long.g.s.hour).toBe(23);
  });

  it('only waits in a bed for fewer than six hours', async () => {
    const { g, p } = await inBed(10);
    p.keys.push(...keys('3'));
    await holeUpInBed(g);
    expect(p.log.replace(/\s+/g, '')).not.toContain('Partyrested!');
    expect(g.s.members[0].hp).toBe(1);
  });

  it('wakes at the hour asked across midnight (the 1988 game slept one more)', async () => {
    const { g, p } = await inBed(20);
    g.options.input = 'controller';
    const script = [K.Up, K.Up, K.Up, Pad.A]; // nine to twelve
    p.next = () => script.shift();
    await holeUpInBed(g);
    expect(p.log.replace(/\s+/g, '')).not.toContain('Thrownoutofbed');
    expect(g.s.hour).toBe(8);
  });

  it('says the hour the hours end at, midnight and noon by name', () => {
    const { g } = newGame();
    g.s.hour = 15;
    expect([1, 9, 12].map((h) => untilLine(g, h))).toEqual(['Until 4 PM', 'Until midnight', 'Until 3 AM']);
    g.s.hour = 3;
    expect([9, 10].map((h) => untilLine(g, h))).toEqual(['Until noon', 'Until 1 PM']);
  });

  it('waits off a bed in a towne, on a controller: the hours pass awake, and nobody is healed', async () => {
    const { g, p } = await inBed(10);
    const s = g.s;
    s.x++; // off the bed, beside it
    while (tileAt(g, s.x, s.y) === T.Bed) s.x++;
    g.options.input = 'controller';
    g.commandPrompt = 'town';
    // Wait is offered where Sleep is not, among the rest of the commands - not at the head of the menu.
    expect(contextual(g).map((it) => it.label)).not.toContain('Wait');
    const menuSeen: string[] = [];
    p.next = () => {
      menuSeen.push(...(g.menuShown?.labels ?? []));
      return Pad.B;
    };
    await commandMenu(g);
    expect(menuSeen).toContain('Wait');
    expect(menuSeen[0]).not.toBe('Wait');
    const seen: string[] = [];
    const script = [...Array<number>(6).fill(K.Down), Pad.A]; // nine down to three
    p.next = () => {
      const m = g.menuShown;
      if (m) seen.push(m.labels.join(' '));
      return script.shift();
    };
    await waitInTown(g);
    expect(seen[0]).toBe('9 Wait Until 7 PM');
    const flat = p.log.replace(/\s+/g, '');
    expect(flat).toContain('Waiting...');
    expect(flat).not.toContain('Partyrested!');
    expect(s.hour).toBe(13);
    expect(s.members[0].hp).toBe(1);
    expect(s.members[0].status).toBe(Status.Good);
  });

  it('names Hole up by what it does where the party is', () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0;
    s.partyTile = A.Avatar;
    expect(holeUpLabel(g)).toBe('Camp');
    s.partyTile = A.Horse;
    expect(holeUpLabel(g)).toBe('Camp (on foot)');
    s.partyTile = A.Frigate24;
    expect(holeUpLabel(g)).toBe('Repair hull');
    s.mapId = 0x21;
    s.partyTile = A.Avatar;
    expect(holeUpLabel(g)).toBe('Camp');
    s.mapId = 5;
    expect(holeUpLabel(g)).toBe('Sleep');
  });

  it('puts Camp at the head of the menu where a camp would be a rest and someone needs one', () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    // Outdoors, on foot, on land beside the hut.
    Object.assign(s, { mapId: 0, level: 0, partyTile: A.Avatar });
    g.commandPrompt = 'outdoors';
    const camp = (): boolean => contextual(g).some((it) => it.label === 'Camp');
    for (const m of s.members) m.hp = m.maxHp;
    for (const m of s.members) m.mp = 0; // the Avatar's and a mage's to come back
    s.d588c = 0;
    expect(camp()).toBe(true);
    s.d588c = 12; // rested two hours ago: a nine-hour camp would be a wait
    expect(camp()).toBe(false);
    s.d588c = 0;
    for (let m = 0; m < s.partySize; m++) s.members[m].mp = 99; // nobody short of anything
    expect(camp()).toBe(false);
    s.members[0].hp = 1;
    expect(camp()).toBe(true);
    s.partyTile = A.Horse; // on a horse there is no camping at all
    expect(camp()).toBe(false);
  });
});
