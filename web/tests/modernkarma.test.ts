import { describe, expect, it } from 'vitest';
import { CHEATS, chargeCheat } from '../src/game/cheats.ts';
import {
  alms,
  answered,
  asked,
  battleOutcome,
  CHOICES,
  deed,
  FAMILIES,
  karmaInUse,
  modernKarma,
  PathState,
  POOLS,
} from '../src/game/modernKarma.ts';
import { restore, serialize } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

type G = ReturnType<typeof newGame>['g'];
const modernGame = (): ReturnType<typeof newGame> => {
  const made = newGame();
  made.g.options.rules = 'modern';
  return made;
};

/**
 * The Modern karma (modernKarma.ts): four pools beside 1988's karma, each kept always, the rules choosing which the
 * game reads; words counted once, deeds again and again, battle by fights won and fled, the quest by its milestones.
 */
describe('the Modern karma', () => {
  it('combines the pools - words and deeds 30%, the quest 25%, battle 15% - capped by the weakest', () => {
    const p = new PathState();
    expect(modernKarma(p)).toBe(75); // a new game's, as 1988's
    Object.assign(p.pools, { words: 99, deeds: 99, quest: 99, battle: 0 });
    expect(modernKarma(p)).toBe(49); // battle alone can't make the whole - but at 0 it holds it to Misguided
    Object.assign(p.pools, { words: 99, deeds: 99, quest: 99, battle: 30 });
    expect(modernKarma(p)).toBe(89); // 0.85 * 99 + 0.15 * 30
    Object.assign(p.pools, { words: 99, deeds: 20, quest: 99, battle: 99 });
    expect(modernKarma(p)).toBe(74); // one pool under 25: Seeker at best
  });

  it('is kept beside 1988 karma, and the rules choose which the game reads', () => {
    const { g } = newGame();
    g.s.karma = 40;
    g.options.rules = 'story';
    expect(karmaInUse(g)).toBe(40);
    g.options.rules = 'classic';
    expect(karmaInUse(g)).toBe(40);
    g.options.rules = 'modern';
    expect(karmaInUse(g)).toBe(75);
  });

  it('goes with the save, and a save from before it begins it afresh, not from 1988 karma', () => {
    const { g } = newGame();
    g.s.karma = 30;
    deed(g, 'deeds', -10, 'Justice');
    const data = serialize(g);
    const back = newGame().g;
    restore(back, data);
    expect(back.path.pools.deeds).toBe(65);
    const old = { ...data };
    delete old.path;
    restore(back, old);
    expect(POOLS.map((p) => back.path.pools[p])).toEqual([75, 75, 75, 75]);
  });

  it('counts a choice at its first answer only, a dilemma growing the virtue chosen', () => {
    const { g } = modernGame();
    answered(g, '3:26:', 0x91, 'n', 'NO'); // Sir Sean: not afraid - Valor
    expect(g.path.pools.words).toBe(77);
    expect(g.path.tally.words.Valor).toBe(2);
    answered(g, '3:26:', 0x91, 'y', 'YES'); // asked again, afraid now: nothing
    expect(g.path.pools.words).toBe(77);
    expect(g.path.tally.words.Honesty).toBeUndefined();
    // Lady Hayden listens only for no: a yes given all the same is the honest answer.
    answered(g, '3:14:', 0x91, null, 'YES');
    expect(g.path.tally.words.Honesty).toBe(2);
  });

  it("counts a group's first answer for all of it (Anthony's comfort or truth)", () => {
    const { g } = modernGame();
    answered(g, '1:5:', 0x93, null, 'NO'); // not the comfort: on to the truth
    answered(g, '1:5:', 0x94, 'y', 'YES');
    expect(g.path.tally.words.Honesty).toBeUndefined(); // the group was answered already
    const other = modernGame().g;
    answered(other, '1:5:', 0x93, 'y', 'YES');
    expect(other.path.tally.words.Compassion).toBe(2);
  });

  it("caps a family's whole, each member once", () => {
    const { g } = modernGame();
    const members = Object.entries(CHOICES).filter(([, c]) => c.family === 'right');
    expect(members.length).toBeGreaterThan(FAMILIES.right);
    for (const [key] of members) {
      const [f, t, l] = key.split(':');
      answered(g, `${f}:${t}:`, Number.parseInt(l, 16), 'y', 'YES');
    }
    expect(g.path.families.right).toBe(FAMILIES.right);
    expect(g.path.pools.words).toBe(75 + FAMILIES.right);
  });

  it('lowers words only for a betrayal: Sindar named to Flain', () => {
    const { g } = modernGame();
    answered(g, '0:38:', 0x94, 'sind', 'SINDAR');
    expect(g.path.pools.words).toBe(60);
    const refused = modernGame().g;
    answered(refused, '0:38:', 0x94, null, 'NOBODY');
    expect(refused.path.pools.words).toBe(77);
    const known = modernGame().g;
    answered(known, '0:38:', 0x94, 'hass', 'HASSAD'); // one they know already: nothing
    expect(known.path.pools.words).toBe(75);
  });

  it("tells Greymarch's truth by whether the party has met Froed", () => {
    const { g } = modernGame();
    answered(g, '0:36:', 0x92, 'y', 'YES'); // "he is well", never having seen him: a kindness, not the truth
    expect(g.path.tally.words.Compassion).toBe(1);
    const met = modernGame().g;
    asked(met, '0:37:', 0x91); // Froed, met in Skara Brae
    answered(met, '0:37:', 0x95, 'y', 'YES'); // his message taken
    answered(met, '0:36:', 0x92, 'y', 'YES');
    expect(met.path.tally.words.Honesty).toBe(2);
    answered(met, '0:36:', 0x93, 'skar', 'SKARA'); // the message delivered: a promise kept
    expect(met.path.tally.words.Honor).toBe(1 + 2);
  });

  it("counts Fenelon's kindness by its being reached, once", () => {
    const { g } = modernGame();
    asked(g, '0:28:', 0x92);
    asked(g, '0:28:', 0x92);
    expect(g.path.pools.words).toBe(77);
  });

  it('gives alms credit for each beggar once a game day', () => {
    const { g } = modernGame();
    g.s.mapId = 23;
    alms(g, 5);
    alms(g, 5);
    expect(g.path.pools.deeds).toBe(78);
    alms(g, 6);
    expect(g.path.pools.deeds).toBe(81);
    g.s.day = g.s.day === 28 ? 1 : g.s.day + 1;
    alms(g, 5);
    expect(g.path.pools.deeds).toBe(84);
  });

  it('raises battle for a fight won, the more against greater numbers, and lowers it for fleeing', () => {
    const { g } = modernGame();
    battleOutcome(g, 'won', 2, 3);
    expect(g.path.pools.battle).toBe(76);
    battleOutcome(g, 'won', 6, 3);
    expect(g.path.pools.battle).toBe(78);
    battleOutcome(g, 'fled', 4, 3);
    expect(g.path.pools.battle).toBe(75);
    battleOutcome(g, 'fell', 4, 3);
    expect(g.path.pools.battle).toBe(75);
    g.cheatedFight = true; // Slay every foe
    battleOutcome(g, 'won', 6, 3);
    expect(g.path.pools.battle).toBe(75);
  });

  it('charges the having-for-nothing cheats under the Modern rules alone, and Renew virtue renews both', async () => {
    const { g } = modernGame();
    const cheat = (label: string) => CHEATS.find((c) => c.label === label)!;
    chargeCheat(g, cheat('Gold +500'));
    chargeCheat(g, cheat('Food +100'));
    expect(g.path.pools.deeds).toBe(72);
    for (const rules of ['story', 'classic'] as const) {
      g.options.rules = rules;
      chargeCheat(g, cheat('Gold +500'));
      expect(g.path.pools.deeds).toBe(72);
    }
    g.s.karma = 40;
    await cheat('Renew virtue').apply(g);
    expect(g.s.karma).toBe(75);
    expect(g.path.pools.deeds).toBe(75);
  });

  it('speaks only under the Modern rules: a real rise, every fall, and a tier changed', () => {
    const { g, p } = modernGame();
    deed(g, 'deeds', 1, 'Compassion');
    expect(p.log).not.toMatch(/Compassion/);
    deed(g, 'deeds', 3, 'Compassion');
    expect(p.log).toContain('Thy Compassion grows.');
    deed(g, 'deeds', -1, 'Justice');
    expect(p.log).toContain('Thy Justice is tarnished.');
    deed(g, 'deeds', -40, 'Compassion');
    expect(p.log).toContain('Thou hast strayed from the Path.');
    expect(p.log).toContain('Journal updated');
    const quiet = newGame();
    quiet.g.options.rules = 'story';
    deed(quiet.g, 'deeds', -40, 'Compassion');
    expect(quiet.p.log).not.toMatch(/strayed|Journal updated/);
    expect(quiet.g.path.pools.deeds).toBe(35); // kept all the same
  });
});

describe("the Modern karma's choices, against the game's own conversations", () => {
  /** Each question's label and the answers it listens for, as talk.ts reads them, by "file:talk". */
  const questions = (g: G): Map<string, Map<number, string[]>> => {
    const out = new Map<string, Map<number, string[]>>();
    ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'].forEach((name, fi) => {
      const f = g.data.files.get(name);
      const count = f[0] | (f[1] << 8);
      for (let i = 0; i < count; i++) {
        const at = 2 + i * 4;
        const talk = f[at] | (f[at + 1] << 8);
        const off = f[at + 2] | (f[at + 3] << 8);
        let end = f.length;
        for (let e = 0; e < count; e++) {
          const o = f[4 + e * 4] | (f[5 + e * 4] << 8);
          if (o > off && o < end) end = o;
        }
        const sc = f.subarray(off, Math.min(end, off + 0x400));
        const labels = new Map<number, string[]>();
        for (let p = 0; p < sc.length; p++) {
          if (sc[p] !== 0x90) continue;
          let q = p + 2;
          const skipString = (): boolean => {
            while (q < sc.length && sc[q] !== 0 && sc[q] !== 0x90) q++;
            if (sc[q] === 0x90) return false;
            q++;
            return true;
          };
          const answers: string[] = [];
          if (skipString() && skipString()) {
            for (let n = 0; n < 12 && q < sc.length && sc[q] !== 0x90; n++) {
              let word = '';
              while (q < sc.length && sc[q] !== 0 && sc[q] !== 0x90) word += String.fromCharCode(sc[q++] & 0x7f);
              answers.push(word.toLowerCase());
              if (sc[q] === 0x90 || !(q++, skipString())) break;
            }
          }
          labels.set(sc[p + 1], answers);
        }
        out.set(`${fi}:${talk}`, labels);
      }
    });
    return out;
  };

  it('names only questions the scripts ask, and answers they listen for', () => {
    const { g } = newGame();
    const all = questions(g);
    for (const [key, choice] of Object.entries(CHOICES)) {
      const [f, t, l] = key.split(':');
      const asked = all.get(`${f}:${t}`)?.get(Number.parseInt(l, 16));
      expect(asked, key).toBeDefined();
      for (const answer of Object.keys(choice.answers)) {
        if (answer === '*' || answer === 'y' || answer === 'n') continue;
        expect(asked, `${key} ${answer}`).toContain(answer);
      }
    }
  });
});
