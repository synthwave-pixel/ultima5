import { describe, expect, it } from 'vitest';
import { saysWord } from '../src/game/cmds.ts';
import { Pad } from '../src/game/io.ts';
import { KEYWORD_LABELS } from '../src/game/keywordLabels.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { sayable, talksBackwards, townsfolkSaying } from '../src/game/words.ts';
import { analyse, type Row } from '../tools/talk/analysis.ts';
import { newGame } from './helpers.ts';

const { g } = newGame();
const { all, rows, ambiguous, borrowed } = analyse(g);
const keyOf = (r: Row): string => `${r.who.file}:${r.who.talk}:${r.stub}`;
const where = (r: Row): string => `${r.who.name} (${r.who.where}) ${r.stub}`;

/**
 * The Say list's reviewed labels (keywordLabels.ts) against the game's conversations (tools/talk/analysis.ts): every
 * keyword no rule can label is labelled by hand, and every hand label is a word that fits its keyword and is said.
 */
describe('the reviewed keyword labels', () => {
  it('cover every keyword whose townsman says two different words that fit it, or none', () => {
    const missing = [...ambiguous, ...borrowed].filter((r) => !(keyOf(r) in KEYWORD_LABELS)).map(where);
    expect(missing, 'run node --import ./tools/node-ts.mjs tools/talk/keywords.ts and review these').toEqual([]);
  });

  it('are each a keyword of that conversation, labelled with a word said in Britannia that fits it', () => {
    const byKey = new Map(rows.map((r) => [keyOf(r), r]));
    const said = townsfolkSaying(g);
    for (const [k, word] of Object.entries(KEYWORD_LABELS)) {
      const r = byKey.get(k);
      expect(r, `${k} is a keyword the list offers`).toBeDefined();
      if (word === '') continue; // no label: its answer offered by another of its keywords (below)
      expect(saysWord(r!.stub, word.toUpperCase()), `${k}: ${word} fits ${r!.stub}`).toBe(true);
      expect(said(word), `${k}: someone says ${word}`).toBeGreaterThan(0);
    }
  });

  it('label the keyword where the townsman words it otherwise, once heard', () => {
    // Trian of Jhelom: "songs of valor" leads to VAL; he says "valiant" too, and fewer say that.
    const own = new Set(['valor', 'valiant']);
    g.words.learn(g, 'Songs of valor, and many a valiant deed.');
    expect(g.words.forStub('VAL', false, { own, said: townsfolkSaying(g) })).toBe('valiant');
    const k = Object.keys(KEYWORD_LABELS).find((x) => x.endsWith(':VAL') && KEYWORD_LABELS[x] === 'valor')!;
    expect(k).toBeDefined();
    expect(g.words.forStub('VAL', false, { own, said: townsfolkSaying(g), reviewed: KEYWORD_LABELS[k] })).toBe('valor');
  });

  it('offer a reviewed keyword only once its word is heard, not another that only begins the same (Chamfort)', () => {
    const { g } = newGame();
    const reviewed = KEYWORD_LABELS['0:17:LAND'];
    expect(reviewed).toBe('landon');
    g.words.learn(g, 'The land is in peril.'); // land, heard elsewhere
    expect(g.words.forStub('LAND', false, { reviewed })).toBeNull();
    expect(g.words.forStub('LAND')).toBe('land'); // a keyword with no reviewed label still takes it
    g.words.learn(g, 'The first thing thou dost need is to see Landon!');
    expect(g.words.forStub('LAND', false, { reviewed })?.toLowerCase()).toBe('landon');
  });

  it("offer a name heard with an apostrophe for a keyword without one, said without it (Lady Hayden's R'hien)", () => {
    const { g } = newGame();
    g.words.learn(g, "Lord R'hien teaches at the Lycaeum.");
    const word = g.words.forStub('RHIE');
    expect(word?.toLowerCase()).toBe("r'hien");
    expect(sayable('RHIE', word!)).toBe('rhien');
    expect(saysWord('RHIE', sayable('RHIE', word!).toUpperCase())).toBe(true);
  });

  it('offer a word turned about only to one who talks backwards, as Goeth does', () => {
    const said = townsfolkSaying(g);
    const own = (name: string): Set<string> => all.find((p) => p.name === name)!.own;
    expect(talksBackwards(own('Goeth'), said)).toBe(true);
    expect(all.filter((p) => talksBackwards(p.own, said)).map((p) => p.name)).toEqual(['Goeth']);
    const { g: fresh } = newGame();
    fresh.words.learn(fresh, 'Thorkin forges rivets.');
    expect(fresh.words.forStub('STEV', false, { backwards: false })).toBeNull(); // Lord R'hien's "stev"
    expect(fresh.words.forStub('STEV')).toBe('stevir'); // as it would be to Goeth
  });

  /** The Say list a townsman offers, every word heard: by their file (0-3) and conversation there. */
  const sayList = async (file: number, talk: number): Promise<string[]> => {
    const game = newGame();
    journeyOnward(game.g);
    for (const w of analyse(game.g).learnable.keys()) game.g.words.add(w);
    Object.assign(game.g.options, { input: 'controller', dialog: 'log' });
    const npcs = game.g.data.files.get(['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'][file]);
    const at = [...Array(8 * 32).keys()].find((k) => npcs[(k >> 5) * 0x240 + 0x220 + (k & 31)] === talk)!;
    Object.assign(game.g.s, { mapId: file * 8 + (at >> 5) + 1 });
    game.g.s.npcs[at & 31].fa = talk;
    let labels: string[] = [];
    game.p.next = () => {
      const m = game.g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      labels = m.labels;
      return Pad.B;
    };
    await talkToNpc(game.g, at & 31);
    return labels;
  };

  it('label an answer by the next of its keywords where the first is reviewed as no label (Sindar: Dungeon, not Which)', async () => {
    const labels = await sayList(0, 32);
    expect(labels).toContain('Dungeon');
    expect(labels).not.toContain('Which');
  });

  it("label Windmire's matter he won't discuss as the accident, though only Emilly's 'accidently' has been heard", () => {
    const { g: game } = newGame();
    game.words.add('accidently');
    expect(game.words.forStub('ACCI', false, { reviewed: KEYWORD_LABELS['1:3:ACCI'] })).toBe('accident');
    game.words.add('accident');
    expect(game.words.forStub('ACCI', false, { reviewed: KEYWORD_LABELS['1:3:ACCI'] })).toBe('accident');
  });
});
