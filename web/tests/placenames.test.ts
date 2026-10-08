import { describe, expect, it } from 'vitest';
import { readBritannia } from '../src/data/maps.ts';
import { Fog } from '../src/game/fog.ts';
import { enterCommand } from '../src/game/outdoors.ts';
import { enteredPlace, heardPlaces, knowsPlace } from '../src/game/placeNames.ts';
import { journeyOnward } from '../src/game/run.ts';
import { labelOf, marksFor, REGIONS } from '../src/ui/mapMarks.ts';
import { newGame } from './helpers.ts';

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** Every conversation's text, as heard: letters, and the compressed words (talk.ts). */
function everythingSaid(g: ReturnType<typeof newGame>['g']): string[] {
  const compressed = g.data.table(0x24ea, 0x80);
  const out: string[] = [];
  for (const name of TLK) {
    const file = g.data.files.get(name);
    const count = file[0] | (file[1] << 8);
    const starts = Array.from({ length: count }, (_, i) => file[4 + i * 4] | (file[5 + i * 4] << 8)).sort((a, b) => a - b);
    starts.forEach((at, i) => {
      let text = '';
      for (const b of file.subarray(at, starts[i + 1] ?? file.length)) {
        if (b > 0 && b < 0x81) text += ` ${compressed[b - 1] ?? ''} `;
        else if (b >= 0xa0) text += String.fromCharCode(b & 0x7f);
        else text += ' ';
      }
      out.push(text);
    });
  }
  return out;
}

/** The map's places named, and called what they look like till then (mapMarks.ts labelOf, placeNames.ts). */
describe("the map's names for places", () => {
  const marks = (made = newGame()) => {
    const { g } = made;
    return { g, marks: marksFor(g.data.ovl, g.s, readBritannia(g.data.files, g.data.ovl).tiles, false, g.fog) };
  };
  const label = (g: ReturnType<typeof newGame>['g'], list: ReturnType<typeof marks>['marks'], name: string): string =>
    labelOf(list.find((m) => m.name === name)!, (k) => g.fog.knowsName(k));

  it('calls a place what it looks like till its name is learnt', () => {
    const { g, marks: list } = marks();
    expect(label(g, list, 'Yew')).toBe('Towne?');
    expect(label(g, list, 'Bordermarch')).toBe('Keep?');
    expect(label(g, list, 'Fogsbane')).toBe('Lighthouse?');
    expect(label(g, list, 'Paws')).toBe('Village?');
    expect(label(g, list, 'Honesty')).toBe('Shrine?');
  });

  it("marks Lord British's castle and Blackthorn's palace, which the cloth map draws", () => {
    const { marks: list } = marks();
    for (const name of ["Lord British's Castle", "Blackthorn's Palace"]) {
      const m = list.find((x) => x.name === name);
      expect(m?.kind, name).toBe('castle');
      expect(m?.onPaper, name).toBe(true);
    }
  });

  it("puts the cloth map's names for the land on the paper, named from the start", () => {
    const { g, marks: list } = marks();
    const regions = list.filter((m) => m.kind === 'region');
    expect(regions.map((m) => m.name)).toEqual(REGIONS.map((r) => r.name));
    expect(regions.every((m) => m.onPaper && labelOf(m, (k) => g.fog.knowsName(k)) === m.name)).toBe(true);
  });

  it('sets each name on the land it names: an isle on land, a bay or sea on water', () => {
    const { g } = newGame();
    const map = readBritannia(g.data.files, g.data.ovl);
    const water = (x: number, y: number): boolean => map.tiles[y * 256 + x] <= 3;
    const swamp = (x: number, y: number): boolean => map.tiles[y * 256 + x] === 4;
    for (const r of REGIONS) expect(water(r.x, r.y), r.name).toBe(/Bay|Sea|Lake/.test(r.name));
    expect(swamp(96, 157)).toBe(true); // the Fens, in the marsh
  });

  it('learns a name when the party goes in', async () => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    const yew = marks(made).marks.find((m) => m.name === 'Yew')!;
    Object.assign(g.s, { mapId: 0, level: 0, x: yew.x, y: yew.y });
    await enterCommand(g).catch(() => undefined); // the town itself may not load here: the name is learnt first
    expect(label(g, marks(made).marks, 'Yew')).toBe('Yew');
    enteredPlace(g, 0, 0); // nowhere: nothing learnt
    expect(g.fog.named.size).toBe(1);
  });

  it('learns a name heard said: a towne by its name, a dungeon only with the word dungeon', () => {
    const { g, marks: list } = marks();
    heardPlaces(g, 'Seek ye the shame of it, and go to Yew.');
    expect(label(g, list, 'Yew')).toBe('Yew');
    expect(label(g, list, 'Shame')).toBe('Mine?'); // Shame's mouth is a mine's
    heardPlaces(g, 'The dungeon Shame lies west of\nBritain.');
    expect(label(g, list, 'Shame')).toBe('Shame');
    expect(label(g, list, 'Britain')).toBe('Britain');
  });

  it('learns a hut by its keeper and the word hut, a shrine by its virtue and the word shrine', () => {
    const { g, marks: list } = marks();
    heardPlaces(g, "Sin'Vraal lives alone in the desert.");
    expect(label(g, list, "Sin Vraal's Hut")).toBe('Hut?');
    heardPlaces(g, "Sin'Vraal's hut lies in the desert.");
    expect(label(g, list, "Sin Vraal's Hut")).toBe("Sin Vraal's Hut");
    heardPlaces(g, 'Honesty is the first virtue.');
    expect(label(g, list, 'Honesty')).toBe('Shrine?');
    heardPlaces(g, 'The shrine of Honesty is north of Moonglow.');
    expect(label(g, list, 'Honesty')).toBe('Honesty');
  });

  it('names a ridden moongate by the place it led to, as the map calls that place', () => {
    const { g } = newGame();
    const brit = readBritannia(g.data.files, g.data.ovl).tiles;
    const town = marksFor(g.data.ovl, g.s, brit, false, g.fog).find((m) => m.name === 'Britain')!;
    g.fog.learnGate(g.s.moonstoneX[0], g.s.moonstoneY[0], town.x, town.y);
    const gate = () => marksFor(g.data.ovl, g.s, brit, false, g.fog).find((m) => m.kind === 'gate-known')!;
    expect(labelOf(gate(), (k) => g.fog.knowsName(k))).toBe('Moongate to a towne');
    heardPlaces(g, 'Britain is fair.');
    expect(labelOf(gate(), (k) => g.fog.knowsName(k))).toBe('Moongate to Britain');
  });

  it('keeps the names learnt in the save, and takes a town once walked as known in a game saved before', () => {
    const fog = new Fog();
    fog.named.add('shrine:3');
    expect(Fog.decode(fog.encode()).knowsName('shrine:3')).toBe(true);
    const old = new Fog();
    old.markPlace(5, 0, 3, 3); // inside map 5 once, before names were kept
    const back = Fog.decode((({ named: _, ...rest }) => rest)(old.encode()));
    expect(back.knowsName('place:5')).toBe(true);
    expect(back.knowsName('place:6')).toBe(false);
  });

  it('knows a shrine knelt at in a game saved before names were kept, by its quest', () => {
    const { g } = newGame();
    expect(knowsPlace(g, 'shrine:1')).toBe(false);
    g.s.questActive = 1 << 1; // Compassion's quest ordained
    g.s.questDone = 1 << 4; // Sacrifice's done
    expect([1, 4, 2].map((i) => knowsPlace(g, `shrine:${i}`))).toEqual([true, true, false]);
  });

  it('can learn most places from what the townsfolk say', () => {
    const { g, marks: list } = marks();
    for (const text of everythingSaid(g)) heardPlaces(g, text);
    const places = list.filter((m) => m.key !== undefined && m.kind !== 'gate-known');
    const unnamed = places.filter((m) => !g.fog.knowsName(m.key!)).map((m) => m.name);
    // Every towne is named by somebody; what is left is learnt by going there.
    expect(unnamed).not.toContain('Yew');
    expect(unnamed).not.toContain('Minoc');
    expect(unnamed.length).toBeLessThan(places.length / 2);
  });
});
