// web/tests/cloudCopy.test.ts
import { describe, expect, it } from 'vitest';
import { applyChoice, planCopy } from '../src/game/cloudCopy.ts';
import { CHARACTERS_KEY, charKey } from '../src/game/characters.ts';
import { SAVE_SIZE } from '../src/game/save.ts';
import { EARLIER, fromBase64, packSave, SAVE_VERSION, saveKeys, toBase64, unpackSave, type SaveData } from '../src/game/storage.ts';

/**
 * The copy made when Steam Cloud saves is turned on or off (cloudCopy.ts): every character's saves carried from one
 * side to the other, settled without asking where one side simply played on, and a clash only where both did.
 */

type Keys = Record<string, string>;

/** A save, told apart by `mark` (the first byte of SAVED.GAM), written at `written`. */
function save(mark: number, written = 1_000_000 + mark): SaveData {
  const bytes = new Uint8Array(SAVE_SIZE);
  bytes[0] = mark;
  const world = toBase64(new Uint8Array(256));
  return { game: 'ultima5', version: SAVE_VERSION, save: toBase64(bytes), brit: world, under: world, written };
}

/**
 * Character `id`'s keys as storage.ts keeps them: `saves` newest first, the first their last save and the rest their
 * earlier ones, numbered up to `top` (the newest earlier save's number); and their settings block, if given.
 */
function character(id: string, saves: SaveData[], settings?: string, top = saves.length - 1): Keys {
  const { last, index } = saveKeys(id)!;
  const out: Keys = { [last]: packSave(JSON.stringify(saves[0])) };
  const keys = saves.slice(1).map((d, i) => {
    const key = `${last}.${top - i}`;
    out[key] = packSave(JSON.stringify(d));
    return key;
  });
  out[index] = JSON.stringify({ next: top + 1, keys });
  if (settings !== undefined) out[charKey(id, 'settings')] = settings;
  return out;
}

/** The list of characters, as characters.ts writes it. */
const list = (...ids: string[]): Keys => ({ [CHARACTERS_KEY]: JSON.stringify({ version: 1, ids }) });

/** Character `id`'s saves on a side, by mark, newest first: the last, then the earlier ones in the index's order. */
function marks(side: Keys, id: string): number[] {
  const { last, index } = saveKeys(id)!;
  const mark = (key: string): number => fromBase64((JSON.parse(unpackSave(side[key])) as SaveData).save)[0];
  const keys = (JSON.parse(side[index]) as { keys: string[] }).keys;
  return [last, ...keys].map(mark);
}

/** A side once a copy is made to it: its writes made, and the saves it let go gone. */
function applied(side: Keys, copy: { writes: Keys; removes: string[] }): Keys {
  const out = { ...side, ...copy.writes };
  for (const key of copy.removes) delete out[key];
  return out;
}

const ids = (side: Keys): string[] => (JSON.parse(side[CHARACTERS_KEY]) as { ids: string[] }).ids;

describe('copying saves between Steam and this computer', () => {
  it('passes over a character the same on both sides', () => {
    const a = { ...list('iolo'), ...character('iolo', [save(3), save(2), save(1)], '{"music":1}') };
    expect(planCopy(a, { ...a })).toEqual(expect.objectContaining({ writes: {}, removes: [], clashes: [] }));
  });

  it('knows a save by when it was written and what it holds, not how it is kept', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(3), save(2)]) };
    const to = { ...from, [saveKeys('iolo')!.last]: JSON.stringify(save(3)) }; // the same save, kept as plain text
    expect(planCopy(from, to)).toEqual(expect.objectContaining({ writes: {}, removes: [], clashes: [] }));
  });

  it('copies a character on one side only, with their settings block', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(3), save(2), save(1)], '{"music":1}') };
    const plan = planCopy(from, {});
    expect(plan.clashes).toEqual([]);
    expect(plan.writes).toEqual(from);
  });

  it('carries the settings block with the saves', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(4), save(3)], '{"music":0}') };
    const to = { ...list('iolo'), ...character('iolo', [save(3)], '{"music":1}') };
    expect(planCopy(from, to).writes[charKey('iolo', 'settings')]).toBe('{"music":0}');
  });

  it('copies the newer side over the older where only it played on', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(5), save(4), save(3), save(2)], '{"music":0}') };
    const to = { ...list('iolo'), ...character('iolo', [save(3), save(2)], '{"music":1}', 5) };
    const plan = planCopy(from, to);
    expect(plan.clashes).toEqual([]);
    const after = applied(to, plan);
    expect(marks(after, 'iolo')).toEqual([5, 4, 3, 2]);
    // The older side's earlier save in a slot the newer side's index does not name is let go, not left behind.
    expect(plan.removes).toEqual([`${saveKeys('iolo')!.last}.5`]);
    expect(after[charKey('iolo', 'settings')]).toBe('{"music":0}');
  });

  it('leaves the receiving side alone where it is the one that played on', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(3), save(2)], '{"music":0}') };
    const to = { ...list('iolo'), ...character('iolo', [save(5), save(4), save(3), save(2)], '{"music":1}') };
    expect(planCopy(from, to)).toEqual(expect.objectContaining({ writes: {}, removes: [], clashes: [] }));
  });

  it('asks only where both sides moved on, writing nothing for that character till asked', () => {
    const from = { ...list('iolo', 'dupre'), ...character('iolo', [save(5), save(3)]), ...character('dupre', [save(20)]) };
    const to = { ...list('iolo'), ...character('iolo', [save(4), save(3)]) };
    const plan = planCopy(from, to);
    expect(plan.clashes).toEqual([{ id: 'iolo', from: save(5), to: save(4) }]);
    expect(Object.keys(plan.writes).filter((k) => k.startsWith('ultima5.char.iolo.'))).toEqual([]);
    expect(marks(applied(to, plan), 'dupre')).toEqual([20]); // the rest copied all the same
  });

  it('keeps the version chosen as the last save, the other its newest earlier one', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(5), save(3)], '{"music":0}') };
    const to = { ...list('iolo'), ...character('iolo', [save(4), save(3), save(2)], '{"music":1}') };
    const plan = planCopy(from, to);

    const keepFrom = applied(to, applyChoice(plan, 'iolo', 'from'));
    expect(marks(keepFrom, 'iolo')).toEqual([5, 4, 3, 2]);
    expect(keepFrom[charKey('iolo', 'settings')]).toBe('{"music":0}');

    const keepTo = applied(to, applyChoice(plan, 'iolo', 'to'));
    expect(marks(keepTo, 'iolo')).toEqual([4, 5, 3, 2]);
    expect(keepTo[charKey('iolo', 'settings')]).toBe('{"music":1}');
  });

  it('never writes over an earlier save of the receiving side to make room for the other version', () => {
    const from = { ...list('iolo'), ...character('iolo', [save(5)]) };
    const to = { ...list('iolo'), ...character('iolo', [save(4), save(3)]) };
    to[`${saveKeys('iolo')!.last}.2`] = packSave(JSON.stringify(save(9))); // not in the index, but there
    const { writes } = applyChoice(planCopy(from, to), 'iolo', 'to');
    for (const key of Object.keys(writes)) if (key !== saveKeys('iolo')!.index) expect(to[key]).toBeUndefined();
  });

  it('keeps the newest of the history within EARLIER after a choice', () => {
    const history = Array.from({ length: EARLIER }, (_, i) => save(10 - i)); // 10 down to 4
    const from = { ...list('iolo'), ...character('iolo', [save(20)]) };
    const to = { ...list('iolo'), ...character('iolo', [save(11), ...history]) };
    const choice = applyChoice(planCopy(from, to), 'iolo', 'from');
    const after = applied(to, choice);
    expect(marks(after, 'iolo')).toEqual([20, 11, 10, 9, 8, 7, 6, 5]);
    // The oldest, past EARLIER, let go as storage.ts lets it go, not left behind where nothing names it.
    expect(choice.removes).toEqual([`${saveKeys('iolo')!.last}.1`]);
  });

  it('lets go only of the receiving side’s own saves that the copy put out of its index', () => {
    const { last } = saveKeys('iolo')!;
    const stray = `${last}.40`; // the receiving side's, but named by no index: not the copy's to let go
    // Played on here only: the newer side's saves, numbered past the older's, copied over them.
    const newer = { ...list('iolo'), ...character('iolo', [save(9), save(8), save(7), save(3)], '{}', 30) };
    const older = { ...list('iolo'), ...character('iolo', [save(3), save(2), save(1)], '{}', 12), [stray]: 'x' };
    // Played on both sides apart, the receiving side's history full.
    const apart = {
      ...list('iolo'),
      ...character('iolo', [save(50), ...Array.from({ length: EARLIER }, (_, i) => save(49 - i))], '{}', 30),
    };
    const full = {
      ...list('iolo'),
      ...character('iolo', [save(40), ...Array.from({ length: EARLIER }, (_, i) => save(39 - i))], '{}', 12),
    };
    const plan = planCopy(apart, full);
    for (const [from, to, copy] of [
      [newer, older, planCopy(newer, older)],
      [apart, full, applyChoice(plan, 'iolo', 'from')],
      [apart, full, applyChoice(plan, 'iolo', 'to')],
    ] as const) {
      expect(copy.removes.length).toBeGreaterThan(0);
      for (const key of copy.removes) {
        expect(from[key], key).toBeUndefined(); // never one of the side copied from
        expect(to[key], key).toBeDefined(); // only what the receiving side holds
        expect(copy.writes[key], key).toBeUndefined();
      }
      expect(copy.removes).not.toContain(stray);
    }
  });

  it('never changes the side copied from', () => {
    const from = { ...list('iolo', 'dupre'), ...character('iolo', [save(5), save(3)], '{}'), ...character('dupre', [save(20)]) };
    const to = { ...list('iolo'), ...character('iolo', [save(4), save(3)]) };
    const was = structuredClone(from);
    const plan = planCopy(from, to);
    applyChoice(plan, 'iolo', 'from');
    applyChoice(plan, 'iolo', 'to');
    expect(from).toEqual(was);
  });

  it('adds to the receiving side’s list of characters, never hiding one only there', () => {
    const from = { ...list('dupre', 'iolo'), ...character('iolo', [save(3)]), ...character('dupre', [save(20)]) };
    const to = { ...list('shamino', 'iolo'), ...character('iolo', [save(3)]), ...character('shamino', [save(30)]) };
    expect(ids({ ...to, ...planCopy(from, to).writes })).toEqual(['shamino', 'iolo', 'dupre']);
  });

  it('copies the saves from before characters only where the other side has none', () => {
    const from = { 'ultima5.save': 'a', 'ultima5.saves': '{"next":2,"keys":["ultima5.save.1"]}', 'ultima5.save.1': 'b' };
    const writes = planCopy(from, { 'ultima5.save': 'c' }).writes;
    expect(writes).toEqual({ 'ultima5.saves': from['ultima5.saves'], 'ultima5.save.1': 'b' });
  });

  it('carries only the keys Steam keeps', () => {
    const from = {
      ...list('iolo'),
      ...character('iolo', [save(3)]),
      [charKey('iolo', 'playing')]: '1',
      'ultima5.settings': '{}',
    };
    const writes = planCopy(from, {}).writes;
    expect(writes[charKey('iolo', 'playing')]).toBeUndefined();
    expect(writes['ultima5.settings']).toBeUndefined();
  });
});
