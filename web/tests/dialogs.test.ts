import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { reach } from '../tools/talk/reach.ts';
import { newGame } from './helpers.ts';

/**
 * What a player with a controller can never ask (tools/talk/reach.ts), each for its reason: none of them leads to
 * anything the quest needs.
 */
const NEVER_ASKED = [
  'Mario (YEW)', // his two keywords are a jumble in the file, and a "Don't ask!" no one could say
  'Sindar (TRINSIC) WAKE', // "Wake?": he says it only in its own answer
  'Shirita (NEW MAGINCIA) DEMO', // demons, which Britannia calls daemons: nobody says the word
  'Elistaria (WINDEMERE) DEMO', // the same
  'David (GREYHAVEN) DIM', // a jest, for one who calls him dim
  'Jacqueline (WAVEGUIDE) MUD', // a jest: "Mmmmm, my favorite!"
  "Scally (BUCCANEER'S DEN) CROT", // crotchety begins as a word the game scolds for (swearing.test.ts)
  'Temme (FARTHING) AN YLEM', // a jest, the spell said at her
  "Lord R'hien (THE LYCAEUM) STEV", // a greeting to one of the game's makers
  'Dupre (BORDERMARCH) DUCK', // a jest: a duck for sale
];
/** Questions never asked, and words listened for never offered - each but a riddle worked out, or a jest. */
const NEVER_QUESTIONED = [
  'Lord Kenneth (GREYHAVEN) #95', // the harpsichord's second riddle, after the first: answered from its own letters
  'Dupre (BORDERMARCH) #94', // the duck
  'Dupre (BORDERMARCH) #95',
];
const NEVER_OFFERED = [
  'Lord Kenneth (GREYHAVEN) #94 dcb', // the first riddle's notes: offered from their own letters (menu.ts answerMenu)
  'Sir Arbuthnot (GREYHAVEN) #93', // a reply's text in the answer's place, in the file
  "Treanna (Lord British's castle) #94 ed", // a wrong answer, "Not that one!"
  'Glinkie (PAWS) #92 equa', // the equator: moongates, midnight and gate say the same
];

/** The conversations, as a controller's player has them: everything reachable that matters, nothing nonsensical. */
describe('every conversation', () => {
  const r = reach(newGame().g);

  it('offers every keyword the quest needs, from what can be heard or read', () => {
    expect(r.unasked.filter((u) => !NEVER_ASKED.some((n) => u.startsWith(n)))).toEqual([]);
    expect(r.unaskedQuestions.filter((u) => !NEVER_QUESTIONED.some((n) => u.startsWith(n)))).toEqual([]);
    expect(r.unoffered.filter((u) => !NEVER_OFFERED.some((n) => u.startsWith(n)))).toEqual([]);
    // As many as there were when this was written, at the least.
    expect(r.counts.keywords).toBeGreaterThanOrEqual(1285);
    expect(r.counts.questions).toBeGreaterThanOrEqual(310);
  });

  it("offers no keyword or answer by another's word where the townsman says one of their own that fits", () => {
    expect(r.strangers).toEqual([]);
  });

  it('can be finished, every keyword asked and every question answered, by a controller', async () => {
    const base = newGame();
    const words = [...analyse(base.g).learnable.keys()];
    const NPC = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];
    const failed: string[] = [];
    let talked = 0;
    for (let map = 1; map <= 32; map++) {
      const npcs = base.g.data.files.get(NPC[(map - 1) >> 3]);
      const m = (map - 1) & 7;
      for (let i = 0; i < 32; i++) {
        const talk = npcs[m * 0x240 + 0x220 + i];
        if (talk === 0 || talk >= 0x80) continue;
        const { g, p } = newGame(map * 100 + i);
        journeyOnward(g);
        for (const w of words) g.words.add(w); // every word that can be learnt, so every keyword is offered
        Object.assign(g.options, { input: 'controller' });
        Object.assign(g.s, { mapId: map, gold: 9999, townAir: 0xff });
        g.s.npcs[i].fa = talk;
        const tried = new Set<string>();
        const answers = new Map<string, number>();
        let presses = 0;
        // Each Say line once, then Take leave; each question's answers in turn, the last when they run out.
        p.next = () => {
          if (++presses > 3000) throw new Error('never ends');
          const menu = g.menuShown;
          if (!menu) return Pad.A;
          let target = 0;
          if (menu.title === 'Say') {
            target = menu.labels.findIndex((l) => !tried.has(l) && l !== 'Take leave');
            if (target < 0) target = menu.labels.indexOf('Take leave');
            else tried.add(menu.labels[target]);
          } else if (menu.title === 'Answer') {
            const key = menu.labels.join('|');
            const n = answers.get(key) ?? 0;
            answers.set(key, n + 1);
            target = Math.min(n, menu.labels.length - 1);
          }
          return menu.at === target ? Pad.A : menu.at < target ? K.Down : K.Up;
        };
        try {
          await talkToNpc(g, i);
          talked++;
        } catch (e) {
          failed.push(`map ${map}, talk ${talk}: ${(e as Error).message}`);
        }
      }
    }
    expect(failed).toEqual([]);
    expect(talked).toBeGreaterThan(130);
  }, 60000);
});
