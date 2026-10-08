import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { enterTown, loadLevel, townLoop } from '../src/game/town.ts';
import { tileAt } from '../src/game/world.ts';
import { actorTileAt } from '../src/game/actors.ts';
import { newGame } from './helpers.ts';

class Stop extends Error {}

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** The townsman of this settlement whose script bears this name (its first string, as talk.ts loadScript finds it). */
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
      // (a name may run on into the script: 'Trian"', 'Sindar...')
      if (word.replace(/[^A-Za-z' ]+$/, '').toUpperCase() === name.toUpperCase()) return i;
    }
  }
  return -1;
}

interface Visit {
  /** The settlement, as the game's own list of places names it. */
  town: string;
  /** The townsman, as their script names them. */
  who: string;
  /** The hour of the visit: the townsman stands where their schedule puts them then. */
  hour: number;
  /** What the player types, at each "Your interest?" and "You respond-", in turn; then BYE. */
  words: string[];
  karma?: number;
}

/**
 * A conversation as a player holds one: into the settlement at the hour, set beside the townsman where their
 * schedule has put them (finding them is not what is tried here), T and the direction, and the words typed one
 * after another. Asked their name, the party gives it; a pause that waits for a key is given one. Returns all
 * that was printed from the Talk on, without its spacing (said).
 */
/** The game the last conversation was held in (talkWith), to look at what it gave. */
let lastGame: Game | null = null;

async function talkWith({ town, who, hour, words, karma }: Visit): Promise<string> {
  const { g, p } = newGame();
  lastGame = g;
  const s = g.s;
  journeyOnward(g);
  stashWorldActors(g);
  const loc = g.data.locations.find((l) => l.name.toUpperCase() === town.toUpperCase());
  if (!loc) throw new Error(`no place called ${town}`);
  Object.assign(s, { mapId: loc.id, level: 0, x: 15, y: 30, hour });
  if (karma !== undefined) s.karma = karma;
  await enterTown(g, true);
  const npc = findNpc(g, who);
  expect(npc, `${who} in ${town}`).toBeGreaterThan(0);

  // Onto the level their schedule has them on at this hour.
  const n = s.npcs[npc];
  Object.assign(s, { level: n.z, x: n.x, y: n.y });
  loadLevel(g, true);
  expect(n.actor, `${who} is about at ${hour}:00`).toBeGreaterThan(0);
  expect(s.actors[n.actor].tile).not.toBe(0);
  expect(tileAt(g, n.x, n.y), `${who} is not abed at ${hour}:00`).not.toBe(T.Bed);

  /** Beside them, on whichever side is clear; the key that faces them from there. */
  const sides: [number, number, number][] = [
    [0, 1, K.Up],
    [0, -1, K.Down],
    [1, 0, K.Left],
    [-1, 0, K.Right],
  ];
  const beside = (): number => {
    const a = s.actors[n.actor];
    const [dx, dy, toward] = sides.find(([x, y]) => actorTileAt(g, a.x + x, a.y + y, s.level) === 0)!;
    Object.assign(s, { x: a.x + dx, y: a.y + dy });
    Object.assign(s.actors[0], { x: s.x, y: s.y, z: s.level });
    return toward;
  };
  beside();
  // Two townsmen's schedules can set them down on one square as the party arrives (Fiona and a merchant in Minoc's
  // poor house at noon, Greyson and a guard in Britain); Talk answers the first of them, so the party waits a turn
  // or two, as a player would, for them to step apart.
  const alone = (): boolean => {
    const a = s.actors[n.actor];
    actorTileAt(g, a.x, a.y, s.level);
    return s.dx === n.actor;
  };

  const queue = [...words];
  const typing: number[] = [];
  let talked = false;
  let waited = 0;
  let from = 0;
  let spent = 0;
  p.next = () => {
    if (++spent > 3000) throw new Stop('the conversation went on too long');
    if (typing.length) return typing.shift();
    if (g.commandPrompt === 'town') {
      if (talked) throw new Stop('done');
      if (!n.actor || n.z !== s.level) throw new Stop(`${who} has gone`);
      const toward = beside();
      if (!alone()) {
        if (++waited > 20) throw new Stop(`${who} never stood alone`);
        return K.Space; // pass
      }
      talked = true;
      from = p.log.length;
      typing.push(toward);
      return 'T'.charCodeAt(0);
    }
    const tail = p.log.trimEnd();
    if (!tail.endsWith(':')) return K.Space; // a pause in the script (0x8f), waiting for a key
    // Asked their name, the party gives it; with nothing left to ask, it answers no to a question, and takes leave.
    const asked = /You respond-\s*:$/.test(tail);
    const word = /thy\s*name\?"\s*You respond-\s*:$/.test(tail) ? s.members[0].name : (queue.shift() ?? (asked ? 'N' : ''));
    typing.push(...[...word.toUpperCase()].map((c) => c.charCodeAt(0)), K.Enter);
    return typing.shift();
  };
  try {
    await townLoop(g);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    expect(e.message).toBe('done');
  }
  expect(queue, 'every word was asked').toEqual([]);
  return said(p.log.slice(from));
}

/**
 * What was said without its spacing: a line wraps where the screen's column ends, and a space that falls at the
 * end of a line is never printed, so two words either side of a wrap run together in what the screen shows.
 */
const said = (text: string): string => text.replace(/\s+/g, '');

/**
 * The words the quest cannot be finished without - the eight words of power, the Shadowlords' three names, the
 * eight mantras, and the passwords of the Resistance and the Oppression - each asked of the townsman who holds it,
 * at an hour their schedule has them up and about, by a player typing as the original is played. Each must be
 * said: if the engine loses one, the game cannot be won.
 */
describe('the words on the path, as the townsmen say them', () => {
  describe('the words of power', () => {
    it('Malifora of Moonglow gives FALLAX, for Deceit', async () => {
      const heard = await talkWith({ town: 'Moonglow', who: 'Malifora', hour: 10, words: ['WORD'] });
      expect(heard).toContain(said('I see the runes FALLAX inscribed upon the entrance of the dungeon Deceit!'));
    });

    it('Annon of Britain gives VILIS, for Despise, only to one of Virtue', async () => {
      // His keyword "unlock" asks the karma of 75 (the script's 0xfe test), which a new game has exactly.
      const words = ['UNLOCK', 'Y'];
      const unworthy = await talkWith({ town: 'Britain', who: 'Annon', hour: 17, words: ['UNLOCK'], karma: 74 });
      expect(unworthy).toContain(said('I trust not yet thy Virtue!'));
      expect(unworthy).not.toContain(said('VILIS'));
      const heard = await talkWith({ town: 'Britain', who: 'Annon', hour: 17, words });
      expect(heard).toContain(said('The Word is VILIS, and remember, it can be used to open the dungeon Despise!'));
    });

    it('Goeth of Jhelom gives INOPIA backwards, for Destard, found by Thorne and Trian', async () => {
      const thorne = await talkWith({ town: 'Jhelom', who: 'Thorne', hour: 12, words: ['WORD'] });
      expect(thorne).toContain(said('Ask the minstrel!'));
      const trian = await talkWith({ town: 'Jhelom', who: 'Trian', hour: 12, words: ['WORD', 'Y'] });
      expect(trian).toContain(said('saying each word backwards oft is of some help!'));
      // He speaks backwards, and is asked backwards: "drow" (word), then which one - "dratsed" (Destard).
      const heard = await talkWith({ town: 'Jhelom', who: 'Goeth', hour: 12, words: ['DROW', 'DRATSED'] });
      expect(heard).toContain(said('Drow of Rewop thou seeketh; remember AIPONI htod I.'));
    });

    it('Felespar, jailed in Yew, gives MALUM, for Wrong, to one who knows the password DAWN', async () => {
      // Nothing is stored for the password: it is the answer his question listens for, typed.
      const heard = await talkWith({ town: 'Yew', who: 'Felespar', hour: 12, words: ['WORD', 'Y', 'Y', 'DAWN'] });
      expect(heard).toContain(said('the Word of Power for the dungeon Wrong is MALUM!'));
    });

    it('Fiona of Minoc, at the poor house, gives AVIDUS, for Covetous', async () => {
      // She greets with a question (in need of food?); then "council" asks how the party knows, and a council member's
      // name (Annon, who sends the party to her) is answer enough. She asks theirs, and knows the Avatar.
      const words = ['N', 'COUNCIL', 'ANNON', 'WORD'];
      const heard = await talkWith({ town: 'Minoc', who: 'Fiona', hour: 12, words });
      expect(heard).toContain(said('The Word of Power to open the dungeon of Covetous is AVIDUS!'));
    });

    it('Sindar of Trinsic, walking the walls at midnight, gives INFAMA, for Shame', async () => {
      const heard = await talkWith({ town: 'Trinsic', who: 'Sindar', hour: 0, words: ['WORD', 'DUNGEON'] });
      expect(heard).toContain(said('INFAMA!'));
      expect(heard).toContain(said('SHAME!'));
    });

    it("Hassad, Blackthorn's prisoner, gives IGNAVUS, for Hythloth, to a friend of Kaiko's", async () => {
      // In the palace's cells below ground (level -1). He asks who is there, and what they want.
      const words = ['WORD', 'KAIKO', 'Y'];
      const heard = await talkWith({ town: "Blackthorn's palace", who: 'Hassad', hour: 12, words });
      expect(heard).toContain(said('The Word thou seeketh is IGNAVUS!'));
    });
  });

  describe("the Shadowlords' names", () => {
    it("Lord Malone of Serpent's Hold names NOSFENTOR, of Cowardice", async () => {
      const heard = await talkWith({ town: "Serpent's Hold", who: 'Lord Malone', hour: 12, words: ['EVIL', 'NOSFENTOR'] });
      expect(heard).toContain(said('Even Nosfentor dares not cross the sacred threshold'));
      expect(heard).toContain(said("'tis the name of the Shadowlord of Cowardice!"));
    });

    it('Lord Shalineth of the Lycaeum names FAULINEI, of Falsehood', async () => {
      // His own keyword "name" is the standard NAME, which answers first: "mercy" (or "simple") reaches it.
      const heard = await talkWith({ town: 'The Lycaeum', who: 'Lord Shalineth', hour: 12, words: ['MERCY', 'Y'] });
      expect(heard).toContain(said('The Name of this dread lord is FAULINEI.'));
    });

    it("Sin'Vraal, in his hut in the desert, names ASTAROTH, of Hatred", async () => {
      const heard = await talkWith({ town: "Sin Vraal's hut", who: "Sin'Vraal", hour: 10, words: ['JOB', 'ASTAROTH'] });
      expect(heard).toContain(said('I once served the mighty Astaroth'));
      expect(heard).toContain(said('lest thou summon the Shadowlord of Hatred!'));
    });
  });

  describe('the mantras', () => {
    it('Malifora of Moonglow: AHM, of Honesty', async () => {
      const heard = await talkWith({ town: 'Moonglow', who: 'Malifora', hour: 10, words: ['MANTRA'] });
      expect(heard).toContain(said('I see an honest man chanting AHM!'));
    });

    it('Greyson of Britain: MU, of Compassion', async () => {
      const heard = await talkWith({ town: 'Britain', who: 'Greyson', hour: 12, words: ['MANTRA', 'BRITISH', 'COMPASSION'] });
      expect(heard).toContain(said('The Mantra of Compassion is MU!'));
    });

    it('Thorne of Jhelom: RA, of Valor', async () => {
      const heard = await talkWith({ town: 'Jhelom', who: 'Thorne', hour: 12, words: ['MANTRA', 'BRITISH'] });
      expect(heard).toContain(said('The Mantra for Valor is RA!'));
    });

    it('Chamfort of Yew: BEH, of Justice', async () => {
      const heard = await talkWith({ town: 'Yew', who: 'Chamfort', hour: 12, words: ['MANTRA', 'JEREMY'] });
      expect(heard).toContain(said('The Mantra of Justice is BEH!'));
    });

    it("Rew of Minoc: CAH, of Sacrifice, in the sailmakers' chant", async () => {
      const heard = await talkWith({ town: 'Minoc', who: 'Rew', hour: 10, words: ['WEEK', 'Y', 'Y'] });
      expect(heard).toContain(said("He sayeth 'Cah'!"));
    });

    it('Gruman of Trinsic, on the walls: SUMM, of Honor, only to the honorable', async () => {
      // The script's 0xfe test asks a karma of 50.
      const words = ['MANTRA', 'Y'];
      const unworthy = await talkWith({ town: 'Trinsic', who: 'Gruman', hour: 12, words, karma: 49 });
      expect(unworthy).toContain(said('If only thou seemed honorable, I would tell it unto thee!'));
      const heard = await talkWith({ town: 'Trinsic', who: 'Gruman', hour: 12, words });
      expect(heard).toContain(said('SUMM is the chant that thou dost seek!'));
    });

    it("Kindor of Skara Brae, at the healer's near six, sent by Saul: OM, of Spirituality", async () => {
      // He brought Kindor here after the Shadowlord's takeover of his towne, which Kindor resisted.
      const saul = await talkWith({ town: 'Skara Brae', who: 'Saul', hour: 12, words: ['RESISTED', 'Y'] });
      expect(saul).toContain(said('Kindor has some information regarding a shrine'));
      const heard = await talkWith({ town: 'Skara Brae', who: 'Kindor', hour: 17, words: ['SHRINE', 'Y'] });
      expect(heard).toContain(said('The Mantra of Spirituality is OM!'));
    });

    it('Wartow of New Magincia, sent by Shirita: LUM, of Humility', async () => {
      const shirita = await talkWith({
        town: 'New Magincia',
        who: 'Shirita',
        hour: 12,
        words: ['MAGINCIA', 'PRIDE', 'ENVY', 'DAEMONS', 'Y'],
      });
      expect(shirita).toContain(said('a wise old man in this towne'));
      // Asked if he hates Blackthorn, the humble answer is no.
      const heard = await talkWith({ town: 'New Magincia', who: 'Wartow', hour: 10, words: ['HUMILITY', 'BRITISH', 'N', 'Y'] });
      expect(heard).toContain(said('LUM is the chant which thou dost seek!'));
    });
  });

  describe('the passwords', () => {
    it("Chamfort of Yew gives the Resistance's password, DAWN", async () => {
      // Sent by Terrance; he asks the party's name, and knowing it gives the password.
      const heard = await talkWith({ town: 'Yew', who: 'Chamfort', hour: 12, words: ['RESISTANCE', 'TERRANCE', 'Y'] });
      expect(heard).toContain(said('The password is DAWN.'));
    });

    it('Thrud of Windemere gives the Jeweled Sword and the Jewel Shield for the password DAWN, as he says', async () => {
      // The DOS file has him give the Jewel Shield and a Crossbow - 0x1c, the sword's 0x28 written in decimal - and the
      // port gives the sword he names (talk.ts SCRIPT_FIXES).
      const heard = await talkWith({ town: 'Windemere', who: 'Thrud', hour: 12, words: ['JEWEL', 'Y', 'DAWN'] });
      expect(heard).toContain('JeweledSword');
      const eq = lastGame!.s.equipment;
      expect([eq[0x28], eq[0x08], eq[0x1c]]).toEqual([1, 1, 0]);
    });

    it("Flain of Skara Brae gives the Oppression's, IMPERA, by way of Tactus and Judge Dryden", async () => {
      const tactus = await talkWith({ town: 'Minoc', who: 'Tactus', hour: 12, words: ['BLACKTHORN', 'Y', 'Y'] });
      expect(tactus).toContain(said('His name is Judge Dryden'));
      const dryden = await talkWith({ town: 'Yew', who: 'Judge Dryden', hour: 10, words: ['OPPRESSION', 'TACTUS'] });
      expect(dryden).toContain(said('I think thou had best see Archmage Flain!'));
      // He asks first why he is disturbed; then who sent the party, whether it will join, and a council member's name.
      const words = ['OPPRESSION', 'DRYDEN', 'Y', 'MALIFORA'];
      const heard = await talkWith({ town: 'Skara Brae', who: 'Flain', hour: 12, words });
      expect(heard).toContain(said("Say to her the password, 'Impera'."));
    });
  });
});
