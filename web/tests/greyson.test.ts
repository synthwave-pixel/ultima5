import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { townsfolkSaying, Vocabulary } from '../src/game/words.ts';
import { newGame } from './helpers.ts';

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** The townsman of this settlement whose script bears this name. */
function findNpc(g: Game, name: string): number {
  const s = g.s;
  const file = g.data.files.get(TLK[(s.mapId - 1) >> 3]);
  const count = file[0] | (file[1] << 8);
  for (let i = 1; i < 32; i++) {
    const talk = s.npcs[i].fa;
    if (s.npcTypes[i] === 0 || talk === 0 || talk >= 0x80) continue;
    for (let n = 0, at = 2; n < count; n++, at += 4) {
      if ((file[at] | (file[at + 1] << 8)) !== talk) continue;
      let word = '';
      for (let p = file[at + 2] | (file[at + 3] << 8); file[p] >= 0xa0; p++) word += String.fromCharCode(file[p] & 0x7f);
      if (word.replace(/[^A-Za-z' ]+$/, '').toUpperCase() === name.toUpperCase()) return i;
    }
  }
  return -1;
}

/**
 * A talk with Greyson of Britain by controller: each word of the Say list asked in turn, then Mantra, every menu
 * written down; at an answer, the first line not "I know not".
 */
async function greyson(known: string[], unknown: string[] = []): Promise<{ menus: { title: string; labels: string[] }[]; log: string }> {
  const { g, p } = newGame();
  const s = g.s;
  g.options.input = 'controller';
  journeyOnward(g);
  stashWorldActors(g);
  const loc = g.data.locations.find((l) => l.name.toUpperCase() === 'BRITAIN')!;
  Object.assign(s, { mapId: loc.id, level: 0, x: 15, y: 30, hour: 12 });
  await enterTown(g, true);
  const npc = findNpc(g, 'Greyson');
  const n = s.npcs[npc];
  Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
  loadLevel(g, true);
  for (const w of known) g.words.learn(g, w);
  for (const w of unknown) (g.words as unknown as { known: Map<string, string> }).known.delete(w);
  const menus: { title: string; labels: string[] }[] = [];
  const asked = new Set<string>();
  const queue: number[] = [];
  let steps = 0;
  p.next = () => {
    if (++steps > 600) throw new Error('the talk went on too long');
    if (queue.length) return queue.shift();
    const m = g.menuShown;
    if (!m) return Pad.A;
    menus.push({ title: m.title, labels: [...m.labels] });
    let want: number;
    if (m.title === 'Say') {
      // Mantra last, once everything else has been asked.
      want = m.labels.findIndex((l) => !asked.has(l) && l !== 'Take leave' && l !== 'Mantra');
      if (want < 0) want = asked.has('Mantra') ? m.labels.indexOf('Take leave') : m.labels.indexOf('Mantra');
      asked.add(m.labels[want]);
    } else
      want = Math.max(
        0,
        m.labels.findIndex((l) => l !== 'I know not'),
      );
    for (let i = m.at; i !== want; i += want > i ? 1 : -1) queue.push(want > i ? K.Down : K.Up);
    queue.push(Pad.A);
    return queue.shift();
  };
  await talkToNpc(g, npc);
  return { menus, log: p.log.replace(/\s+/g, ' ') };
}

describe('Greyson of Britain, by controller', () => {
  it('asks who rules and which mantra, offered the words that answer them - not yes or no - and gives MU', async () => {
    const { menus, log } = await greyson(['MANTRA', 'BRITISH', 'COMPASSION']);
    const answers = menus.filter((m) => m.title === 'Answer').map((m) => m.labels);
    expect(answers).toEqual([
      ['British', 'I know not'],
      ['Compassion', 'I know not'],
    ]);
    expect(log).toContain('The Mantra of Compassion is MU!');
  });

  it('is answered by a new Avatar who has heard no one yet: Lord British and the virtues are known from the start', async () => {
    const { menus, log } = await greyson([]);
    const answers = menus.filter((m) => m.title === 'Answer').map((m) => m.labels);
    expect(answers).toEqual([
      ['British', 'I know not'],
      ['Compassion', 'I know not'],
    ]);
    expect(log).toContain('The Mantra of Compassion is MU!');
  });

  it('keeps Things as Things once his question has said "think"', async () => {
    const { menus } = await greyson(['MANTRA', 'BRITISH', 'COMPASSION']);
    const says = menus.filter((m) => m.title === 'Say');
    expect(says.some((m) => m.labels.includes('Things'))).toBe(true);
    expect(says.some((m) => m.labels.includes('Think'))).toBe(false);
  });

  it('knows not which mantra, without the virtue it is of', async () => {
    // (Every Avatar knows the virtues from the start: here one that does not, for the list that offers nothing.)
    const { menus, log } = await greyson(['MANTRA', 'BRITISH'], ['COMPASSION']);
    expect(menus.filter((m) => m.title === 'Answer').map((m) => m.labels)).toEqual([['British', 'I know not'], ['I know not']]);
    expect(log).toContain('I KNOW NOT');
    expect(log).not.toContain('is MU!');
  });
});

describe('a keyword offered as a word', () => {
  it("is labelled with the townsman's own word, where it has been heard - the rarer of two of theirs", () => {
    const { g } = newGame();
    const said = townsfolkSaying(g);
    expect(said('come')).toBeGreaterThan(said('comets'));
    g.words.learn(g, 'The black gate; Blackthorn rules. Comets have come!');
    // Annon's "blac" is Blackthorn, which he says; black is another's word.
    expect(g.words.forStub('BLAC', false, { own: new Set(['blackthorn', 'lord']), said })).toBe('blackthorn');
    // Zachariah says both "come" and "comets": the comets are his topic, and few say it.
    expect(g.words.forStub('COME', false, { own: new Set(['come', 'comets', 'comet']), said })).toBe('comets');
    // A townsman who says none of the words that fit: the label as before.
    expect(g.words.forStub('BLAC', false, { own: new Set(['gate']), said })).toBe('black');
  });

  it('stays that word when another heard later fits it too, saved and loaded', () => {
    const { g } = newGame();
    g.words.learn(g, 'I have seen many things!');
    expect(g.words.forStub('THIN')).toBe('things');
    g.words.learn(g, 'Who dost thou think is the rightful ruler?');
    expect(g.words.forStub('THIN')).toBe('things');
    const again = Vocabulary.decode(JSON.parse(JSON.stringify(g.words.encode())) as ReturnType<Vocabulary['encode']>);
    expect(again.forStub('THIN')).toBe('things');
    // Never offered before both were heard, the shorter is taken, as ever ("man" over "many").
    const fresh = new Vocabulary();
    fresh.merge(Vocabulary.decode({ known: ['things', 'think'], heard: [] }));
    expect(fresh.forStub('THIN')).toBe('think');
  });
});
