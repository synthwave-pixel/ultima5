import { describe, expect, it } from 'vitest';
import { campOutdoors } from '../src/game/combat.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { jimmyCommand } from '../src/game/items.ts';
import { putNpc } from '../src/game/npc.ts';
import { enterWorld, outdoorsLoop, stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { boxShown, waitsForKey } from '../src/game/speech.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { T } from '../src/game/tiles.ts';
import { begone, callGuards, enterTown, townLoop } from '../src/game/town.ts';
import { setTileAt, tileAt } from '../src/game/world.ts';
import { keys, newGame, type FakePlatform } from './helpers.ts';
import { Landed } from './pilot.ts';

/**
 * Those who speak to the party outside a conversation or a shop - guards, prisoners, a frightened townsman, Smith,
 * the shrine's guardian, the old man at the camp - with the Dialog setting's Play (merchantSpeech.ts withSpeaker):
 * their words in the box, the log the party's and the game's; with Log, all of it in the log as 1988 had it.
 */
describe('those who speak outside a conversation', () => {
  /** What goes to the log and to the box from here on, a key given for each of the box's pauses. */
  const listen = (g: Game, p: FakePlatform) => {
    const heard = { log: '', box: '' };
    const gg = g as unknown as { remember: (t: string) => void };
    const remember = gg.remember.bind(g);
    gg.remember = (t: string) => {
      if (g.p.text.current === 2) heard.log += t;
      if (g.p.text.current === 4) heard.box += t;
      remember(t);
    };
    // The box's arrow read (a key); else the keys scripted, as ever.
    const script = p.keys;
    p.next = () => {
      if (waitsForKey(g)) return K.Space;
      const k = script.shift();
      if (k === undefined) throw new Error('script ran out of keys');
      return k;
    };
    return heard;
  };
  const flat = (t: string): string => t.replace(/\s+/g, ' ');

  for (const dialog of ['play', 'log'] as const) {
    const play = dialog === 'play';
    /** With Play the words are the box's and none the log's; with Log, the log's as 1988 printed them. */
    const said = (heard: { log: string; box: string }, words: RegExp): void => {
      if (play) {
        expect(flat(heard.box)).toMatch(words);
        expect(flat(heard.log)).not.toMatch(words);
      } else expect(flat(heard.log)).toMatch(words);
    };

    it(`${dialog}: a prisoner's thanks, freed and talked to after`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      g.options.dialog = dialog;
      stashWorldActors(g);
      Object.assign(g.s, { mapId: 4, level: 0, x: 15, y: 30, hour: 12 }); // Yew
      await enterTown(g, true);
      const s = g.s;
      const prisoner = [...Array(32).keys()].find((i) => {
        const a = s.actors[s.npcs[i].actor];
        return i > 0 && s.npcTypes[i] !== 0 && s.npcs[i].fa !== 0 && tileAt(g, a.x, a.y) === 0x84;
      })!;
      const at = s.actors[s.npcs[prisoner].actor];
      Object.assign(s, { x: at.x, y: at.y + 1, keys: 3, activeMember: 0 });
      s.members.forEach((m) => (m.dex = 40));
      const heard = listen(g, p);
      p.keys.push(K.Up);
      await jimmyCommand(g);
      said(heard, /I thank thee!/);
      await talkToNpc(g, prisoner);
      said(heard, /Thank ye!/);
    });

    it(`${dialog}: "Begone, vermin!", and "Don't hurt me!"`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      g.options.dialog = dialog;
      await enterTown(g, true);
      const heard = listen(g, p);
      await begone(g, 1);
      said(heard, /Begone, vermin!/);
      g.s.npcs[1].fa = 0xfd;
      await talkToNpc(g, 1);
      said(heard, /Don't hurt me! Please go away!/);
    });

    it(`${dialog}: a guard's demand for charity, and the answer`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      Object.assign(g.options, { dialog, input: 'letters' });
      Object.assign(g.s, { mapId: 5, gold: 400 });
      g.s.npcs[1].fa = 0xff;
      const heard = listen(g, p);
      p.keys.push(...keys('Y'));
      await talkToNpc(g, 1);
      said(heard, /Thou wilt give half thy gold to charity!/);
      expect(g.s.gold).toBe(200);
    });

    /** Britain at noon, a guard on to the party beside it: `answer`, to come quietly or not. */
    const arrested = async (answer: string) => {
      const { g, p } = newGame();
      journeyOnward(g);
      Object.assign(g.s, { mapId: 2, level: 0, hour: 12 });
      g.options.dialog = dialog;
      await enterTown(g, true);
      const s = g.s;
      if (answer === 'Y') callGuards(g);
      else {
        for (let k = 0; k < 3; k++) s.schedules[9].setType(k, 7);
        for (let k = 0; k < 4; k++) s.schedules[9].setTime(k, 0);
      }
      Object.assign(s, { x: 9, y: 8 });
      putNpc(g, 9, s.x + 1, s.y, 0);
      const heard = listen(g, p);
      p.keys.push(...keys(' ', answer));
      if (answer === 'N') {
        // The fight itself is another matter: the pilot lands where it begins.
        const next = p.next!;
        p.next = () => {
          if (/Attacked!/.test(heard.log)) throw new Landed();
          return next();
        };
      }
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out') && !(e instanceof Landed)) throw e;
      });
      return { g, heard };
    };
    it(`${dialog}: arrested, and coming quietly: the guard's words, then struck down`, async () => {
      const { g, heard } = await arrested('Y');
      said(heard, /Thou art under arrest!/);
      said(heard, /Wilt thou come quietly\?/);
      expect(flat(heard.log)).toMatch(/strikes thee unconscious/);
      expect(g.s.mapId).toBe(4); // the Yew jail
    });
    it(`${dialog}: arrested, and not coming quietly: "Then defend thyself, rogue!"`, async () => {
      const { heard } = await arrested('N');
      said(heard, /Then defend thyself, rogue!/);
    });

    it(`${dialog}: Smith's "Nay!" to being ridden`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      g.options.dialog = dialog;
      await enterTown(g, true);
      Object.assign(g.s, { x: 27, y: 4 }); // below Smith in his pen
      const heard = listen(g, p);
      const { boardCommand } = await import('../src/game/cmds.ts');
      await boardCommand(g);
      said(heard, /Nay!/);
    });

    it(`${dialog}: the shrine's guardian, to a party on no quest: "Passage denied!"`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      g.options.dialog = dialog;
      const s = g.s;
      // Out in Britannia, the square south of the guardian's (233, 235).
      Object.assign(s, { mapId: 0, level: 0, x: 0xe9, y: 0xec, questActive: 0, partyTile: 0x1c });
      enterWorld(g);
      for (let i = 1; i < 0x20; i++) s.actors[i].tile = 0;
      setTileAt(g, 0xe9, 0xeb, T.Grass);
      const heard = listen(g, p);
      p.keys.push(K.Up);
      await outdoorsLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      said(heard, /Thou art not upon a Sacred Quest! ?Passage denied!/);
      expect(s.y).toBe(0xec); // turned back
    });

    it(`${dialog}: the old man at the camp: his blessing and his word, then gone`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      Object.assign(g.options, { dialog, rules: 'modern' });
      s.members[0].exp = 400; // a level due
      const dice = g.random.bind(g);
      g.random = (lo: number, hi: number): number => (lo === 0 && hi === 99 ? 0 : dice(lo, hi));
      const heard = listen(g, p);
      p.keys.push(...Array<number>(12).fill(K.Space));
      await campOutdoors(g, -1, 9).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      expect(flat(heard.log)).toMatch(/An apparition!/);
      said(heard, /Thou art now level/);
      if (play) expect(heard.box).not.toMatch(/ {2}/); // (1988's karma words: "achieved  the")
      expect(flat(heard.log)).toMatch(/vanishes/);
    });

    it(`${dialog}: the old man raising two: no box of words left up for his flash to wipe, each member's own`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      Object.assign(g.options, { dialog, rules: 'modern' });
      s.members[0].exp = s.members[1].exp = 400; // two levels due
      const dice = g.random.bind(g);
      g.random = (lo: number, hi: number): number => (lo === 0 && hi === 99 ? 0 : dice(lo, hi));
      const heard = listen(g, p);
      p.keys.push(...Array<number>(12).fill(K.Space));
      const atFlash: unknown[] = [];
      const invert = g.draw.invert.bind(g.draw);
      g.draw.invert = (...a: Parameters<typeof invert>) => {
        atFlash.push(boxShown(g));
        invert(...a);
      };
      await campOutdoors(g, -1, 9).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      expect(atFlash.length).toBeGreaterThanOrEqual(2);
      expect(atFlash.every((b) => b === null)).toBe(true);
      said(heard, /Hail, Shamino!/);
    });
  }
});
