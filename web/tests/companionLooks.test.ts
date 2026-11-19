import { describe, expect, it } from 'vitest';
import { HAIR, PEOPLE_SKIN } from '../src/game/appearance.ts';
import { PRESETS as kept, preset as keptPreset } from '../src/game/companions.ts';
import { PRESETS, preset, presetLook } from '../src/game/companionLooks.ts';

/**
 * The companions' colours (companionLooks.ts), apart from the Ultima V-typed companions.ts so another game can dress
 * its own people in them - each look as it was before the move: hair, main and trim, for a mage and for anyone else.
 */
const LOOKS: Record<string, [number[], number[]]> = {
  Mariah: [
    [4, 9, 13],
    [0, 9, 13],
  ],
  Iolo: [
    [5, 3, 5],
    [0, 3, 5],
  ],
  Geoffrey: [
    [2, 1, 3],
    [0, 1, 3],
  ],
  Jaana: [
    [6, 5, 2],
    [0, 5, 2],
  ],
  Julia: [
    [3, 2, 1],
    [0, 2, 1],
  ],
  Dupre: [
    [1, 10, 3],
    [0, 10, 3],
  ],
  Shamino: [
    [2, 13, 5],
    [0, 13, 5],
  ],
  Katrina: [
    [1, 15, 2],
    [0, 15, 2],
  ],
  Gwenno: [
    [1, 12, 3],
    [0, 12, 3],
  ],
  Johne: [
    [5, 14, 10],
    [0, 14, 10],
  ],
  Sentri: [
    [4, 7, 13],
    [0, 7, 13],
  ],
  Gorn: [
    [6, 2, 1],
    [0, 2, 1],
  ],
  Maxwell: [
    [3, 8, 1],
    [0, 8, 1],
  ],
  Toshi: [
    [4, 9, 3],
    [0, 9, 3],
  ],
  Saduj: [
    [4, 15, 1],
    [0, 15, 1],
  ],
};
const MAGE = 'M'.charCodeAt(0);
const FIGHTER = 'F'.charCodeAt(0);
const parts = (a: { hair: number; main: number; trim: number }): number[] => [a.hair, a.main, a.trim];

describe("the companions' colours, apart", () => {
  it('are the same presets companions.ts gives', () => {
    expect(kept).toBe(PRESETS);
    expect(keptPreset).toBe(preset);
    expect(Object.keys(PRESETS).sort()).toEqual(Object.keys(LOOKS).sort());
  });

  it('dress each companion as before the move, a mage with their hair', () => {
    for (const [name, [mage, other]] of Object.entries(LOOKS)) {
      expect(parts(preset(name, MAGE)), name).toEqual(mage);
      expect(parts(preset(name, FIGHTER)), name).toEqual(other);
      expect(preset(name, MAGE).skin).toBe(PEOPLE_SKIN);
      expect(presetLook(name, true)).toEqual(preset(name, MAGE));
      expect(presetLook(name, false)).toEqual(preset(name, FIGHTER));
    }
    expect(presetLook('Mariah', true).hair).toBe(HAIR.findIndex((h) => h.name === 'black'));
  });

  it('gives a name with no preset the people’s skin and the figure as drawn', () => {
    expect(presetLook('Nobody', true)).toEqual({ figure: 0, skin: PEOPLE_SKIN, hair: 0, main: 0, trim: 0 });
  });
});
