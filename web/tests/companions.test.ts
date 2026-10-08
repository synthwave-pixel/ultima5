import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { HAIR, HUES, PEOPLE_SKIN } from '../src/game/appearance.ts';
import { companionLook, dressingOfActor, PRESETS, talkName } from '../src/game/companions.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { parseSave, restore, serialize } from '../src/game/storage.ts';
import { dress, labels, MASKS } from '../src/ui/avatarRegions.ts';
import { indices, original } from '../src/ui/originals.ts';
import { gameFiles, newGame } from './helpers.ts';

const YEW = 4;
const MAGE = 0x140;

const game = () => {
  const made = newGame();
  journeyOnward(made.g);
  return made;
};
const member = (g: ReturnType<typeof newGame>['g'], name: string): number => g.s.members.findIndex((m) => m.name === name);

/** The companions' looks (companions.ts): their colours to begin with, as the player makes them, and where they show. */
describe("the companions' looks", () => {
  it("gives every companion colours of their own to begin with, and the people's skin", () => {
    const { g } = game();
    const roster = g.s.members.slice(1).map((m) => m.name);
    expect(Object.keys(PRESETS).sort()).toEqual([...roster].sort());
    for (const name of roster) {
      const look = companionLook(g, member(g, name));
      expect(look.skin, name).toBe(PEOPLE_SKIN);
      expect(look.main, name).toBeGreaterThan(0);
    }
    // The virtues of Ultima IV: Mariah's Honesty blue, Shamino's Spirituality white, Katrina's Humility black.
    expect(HUES[companionLook(g, member(g, 'Mariah')).main]).toBe(240);
    expect(HUES[companionLook(g, member(g, 'Shamino')).main]).toBe('white');
    expect(HUES[companionLook(g, member(g, 'Katrina')).main]).toBe('black');
    // A mage's hair is theirs; a fighter keeps his helm and a bard her hat, as drawn.
    expect(HAIR[companionLook(g, member(g, 'Jaana')).hair].name).toBe('auburn');
    expect(companionLook(g, member(g, 'Dupre')).hair).toBe(0);
    expect(companionLook(g, member(g, 'Gwenno')).hair).toBe(0);
  });

  it('keeps a look the player made, with the saved game', () => {
    const { g } = game();
    const look = { figure: 0, skin: 6, hair: 2, main: 5, trim: 9 };
    g.companionLooks.set('Iolo', look);
    expect(companionLook(g, member(g, 'Iolo'))).toEqual(look);
    const { g: h } = newGame();
    restore(h, parseSave(JSON.stringify(serialize(g))));
    expect(h.companionLooks.get('Iolo')).toEqual(look);
    expect(h.companionLooks.has('Dupre')).toBe(false); // as he begins
  });

  it('dresses a companion of the party in a fight, a woman as one, and not the Avatar', () => {
    const { g } = game();
    const s = g.s;
    s.mapId = 0xff;
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: member(g, 'Jaana'), flags: CF.Player, actor: 3 });
    Object.assign(g.combat[2], { who: member(g, 'Shamino'), flags: CF.Player, actor: 4 });
    Object.assign(g.combat[7], { who: 0x14, flags: CF.Monster, actor: 9 });
    expect(dressingOfActor(g, 1)).toBeNull();
    expect(dressingOfActor(g, 3)).toEqual({ look: companionLook(g, member(g, 'Jaana')), lady: true });
    expect(dressingOfActor(g, 4)?.lady).toBe(false);
    expect(dressingOfActor(g, 9)).toBeNull(); // a foe
  });

  it('knows Jaana where she waits in Yew, by her conversation, and not Mario for Mariah', () => {
    const { g } = game();
    const s = g.s;
    s.mapId = YEW;
    const talk = (name: string): number => [...Array(0x80).keys()].find((t) => talkName(g, YEW, t) === name)!;
    Object.assign(s.npcs[3], { actor: 5, fa: talk('Jaana') });
    Object.assign(s.npcs[4], { actor: 6, fa: talk('Mario') });
    expect(dressingOfActor(g, 5)?.lady).toBe(true);
    expect(dressingOfActor(g, 6)).toBeNull();
  });

  it("draws a woman's mage without the beard, and dresses the fighter's grey plate in its colour", () => {
    const tiles = lzwDecompress(gameFiles().get('TILES.16'));
    const plain = { figure: 0, skin: PEOPLE_SKIN, hair: 0, main: 0, trim: 0 };
    for (let f = 0; f < 4; f++) {
      const regions = labels(tiles, MAGE, f);
      const cell = original(tiles, MAGE + f);
      const out = dress(cell, indices(tiles, MAGE + f), regions, plain, true);
      const beard = [...Array(64 * 64).keys()].filter(
        (i) => regions[Math.floor(i / 256) * 16 + Math.floor((i % 64) / 4)] === 'b' && cell[i] >>> 24,
      );
      expect(beard.length, `frame ${f}`).toBeGreaterThan(0);
      for (const i of beard) expect(out[i], `frame ${f}: the beard gone`).not.toBe(cell[i]);
    }
    // The class fighter's plate, all greys, takes a red: a pixel of the armour is red after.
    const fighter = 0x148;
    const regions = labels(tiles, fighter, 0);
    const cell = original(tiles, fighter);
    const red = dress(cell, indices(tiles, fighter), regions, { ...plain, main: HUES.indexOf(0) });
    const at = [...Array(64 * 64).keys()].find(
      (i) => regions[Math.floor(i / 256) * 16 + Math.floor((i % 64) / 4)] === 'm' && cell[i] >>> 24,
    )!;
    const [r, g, b] = [red[at] & 0xff, (red[at] >> 8) & 0xff, (red[at] >> 16) & 0xff];
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("paints every pixel of the fighter companions' figure a region, by the hand-painted mask", () => {
    const tiles = lzwDecompress(gameFiles().get('TILES.16'));
    const mask = MASKS.get(0x148)!;
    for (let f = 0; f < 4; f++) {
      expect(mask[f].map((r) => r.length)).toEqual(Array<number>(16).fill(16));
      const px = indices(tiles, 0x148 + f);
      const regions = labels(tiles, 0x148, f);
      px.forEach((c, i) => {
        const [x, y] = [i % 16, i >> 4];
        if (c !== 0) expect(mask[f][y][x], `frame ${f} at ${x},${y}`).not.toBe(' ');
        if (c === 0) expect(regions[i]).toBe('.'); // see-through, whatever the mask says
      });
      // The shield is the trim's in every frame, the plate the clothes'.
      expect(regions.filter((r) => r === 't').length, `frame ${f}`).toBeGreaterThan(20);
      expect(regions.filter((r) => r === 'm').length, `frame ${f}`).toBeGreaterThan(20);
    }
  });
});
