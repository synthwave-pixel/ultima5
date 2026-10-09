import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { runGame, journeyOnward } from '../src/game/run.ts';
import { fighter, newGame } from './helpers.ts';
import { command, fly, Landed, pick, press, until, type Step } from './pilot.ts';

/** The game played with nothing but a controller, from its prompts and menus as a player meets them. */
describe('a controller plays', () => {
  const play = async (g: Parameters<typeof runGame>[0]): Promise<void> => {
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
  };

  it("walks out of Iolo's hut into Britannia", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    // South from the chair to the door (which opens as it is walked into), through it, and off the map's edge.
    // At the edge the game asks whether to leave, and takes A for yes.
    fly(g, p, [(game) => (game.s.mapId === 0 ? undefined : /\?\s*$/.test(game.said) ? Pad.A : K.Down)], 40);
    await play(g);
    expect(g.s.mapId).toBe(0);
  });

  it('mixes a spell and casts it', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.reagents.fill(9);
    s.mixtures.fill(0);
    s.members[0].hp = 10;
    s.members[0].mp = 30;
    const need = g.data.bytes(0x1cc0, 0x30)[4]; // the fifth spell of the list: its reagents, a bit each
    // By the spell alone, then how many: the recipe is the game's own, nothing to tick.
    fly(g, p, [
      command('Mix reagents'), // the list of spells opens by itself
      pick('Spells', 'Heal x0'), // none mixed yet: the count shows it
      press(K.Up, Pad.A), // the dial starts at one
    ]);
    await play(g);
    expect(s.mixtures[4]).toBe(2);
    for (let i = 0; i < 8; i++) expect(s.reagents[i], `reagent ${i}`).toBe(need & (0x80 >> i) ? 7 : 9);
  });

  const title = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

  it('takes a quest at a shrine, with the virtue and the mantra it has heard', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const virtue = g.data.table(0x1f4e, 8)[0];
    const mantra = g.data.table(0x1f5e, 8)[0];
    // Heard in the middle of somebody's sentence, as words are: not in the capitals a keyboard would give them.
    g.words.learn(g, `Meditate on ${virtue.toLowerCase()}, and chant ${mantra.toLowerCase()} thrice.`);
    Object.assign(s, { mapId: 0, level: 0, x: g.data.bytes(0x1f6e, 8)[0], y: g.data.bytes(0x1f76, 8)[0] });
    fly(g, p, [
      command('Enter'),
      pick('Virtue', title(virtue)),
      pick('Mantra', title(mantra)),
      pick('Mantra', title(mantra)),
      pick('Mantra', title(mantra)),
      (game) => (game.commandPrompt === '' ? Pad.A : undefined), // through what the altar says
    ]);
    await play(g);
    expect(s.questActive & 1).toBe(1);
  });

  it('asks at a shrine in two columns low in the view, the scene a second in sight before each chant', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    // Humility and its mantra: the right-hand column of each list (the second of each row).
    const virtue = g.data.table(0x1f4e, 8)[7];
    const mantra = g.data.table(0x1f5e, 8)[7];
    g.words.learn(g, `Chant ${mantra.toLowerCase()} for humility.`);
    Object.assign(s, { mapId: 0, level: 0, x: g.data.bytes(0x1f6e, 8)[7], y: g.data.bytes(0x1f76, 8)[7] });
    let rows = '';
    let again = '';
    const pauses: number[] = [];
    const sleep = p.sleep.bind(p);
    p.sleep = async (ms?: number) => {
      if (ms === 1000) pauses.push(ms);
      return sleep();
    };
    fly(g, p, [
      command('Enter'),
      (game) => {
        // The virtues read across, a row at a time: Spirituality at the left of its row, Humility at its right.
        if (!rows) rows = Array.from({ length: 25 }, (_, r) => game.text.screenText(r, 0, 23)).join('\n');
        return undefined;
      },
      pick('Virtue', title(virtue)),
      pick('Mantra', title(mantra)),
      (game) => {
        // The second chant offered from the word just chanted.
        again = game.menuShown?.labels[game.menuShown.at] ?? '';
        return undefined;
      },
      pick('Mantra', title(mantra)),
      pick('Mantra', title(mantra)),
      (game) => (game.commandPrompt === '' ? Pad.A : undefined),
    ]);
    await play(g);
    expect(again).toBe(title(mantra));
    expect(rows).toMatch(/Spirituality +Humility/);
    expect(s.questActive & 0x80).toBe(0x80);
    expect(pauses.length).toBe(3);
  });

  it('offers every virtue at a shrine, spelt as the game spells it, whatever the townsfolk say', async () => {
    // The virtues are the manual's: a player who has only heard "valor" said must still be able to name Valour.
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const virtues = g.data.table(0x1f4e, 8);
    Object.assign(s, { mapId: 0, level: 0, x: g.data.bytes(0x1f6e, 8)[2], y: g.data.bytes(0x1f76, 8)[2] });
    let offered: string[] = [];
    fly(g, p, [
      command('Enter'),
      (game) => {
        if (offered.length) return undefined;
        offered = game.menuShown?.labels ?? [];
        return Pad.B;
      },
    ]);
    await play(g);
    expect(offered).toEqual([...virtues.map(title), 'Say nothing']);
  });

  it('cannot give a shrine a mantra it has never heard', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.words.add(g.data.table(0x1f4e, 8)[0]);
    Object.assign(s, { mapId: 0, level: 0, x: g.data.bytes(0x1f6e, 8)[0], y: g.data.bytes(0x1f76, 8)[0] });
    let offered: string[] = [];
    fly(g, p, [
      command('Enter'),
      pick('Virtue', title(g.data.table(0x1f4e, 8)[0])),
      (game) => {
        if (offered.length) return undefined;
        offered = game.menuShown?.labels ?? [];
        return Pad.A;
      },
    ]);
    await play(g);
    expect(offered).toEqual(['Say nothing']);
  });

  it('opens a dungeon with its word of power', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const word = g.data.table(0x4502, 8)[1];
    g.words.learn(g, `The word is ${word.toLowerCase()}, they say.`);
    const loc = g.data.locations[0x21];
    Object.assign(s, { mapId: 0, level: 0, x: loc.x, y: loc.y + 1 });
    const before = s.d58d0[1];
    fly(g, p, [command('Yell'), pick('Yell', title(word)), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    await play(g);
    expect(p.log).toMatch(/word of power/i);
    expect(s.d58d0[1]).not.toBe(before);
  });

  it('buys garlic from the herbalist of Moonglow', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 1, level: 0, x: 15, y: 30, hour: 10, gold: 500 });
    await enterTown(g, true);
    // Stand before the herbalist's counter: south of where she stands, facing her.
    const keeper = s.actors[s.npcs[2].actor];
    Object.assign(s, { x: keeper.x, y: keeper.y + 1, level: keeper.z });
    const which = g.data.table(0x19d2, 8).findIndex((n) => /garlic/i.test(n));
    const garlic = s.reagents[which];
    fly(g, p, [
      command('Talk'), // to her: no way asked, she being the one in reach (targets.ts onlySide)
      press(Pad.A), // yes to being in need
      pick('Choose', 'Garlic'),
      press(Pad.A), // yes, this is the need
      (game) => (game.menuShown ? undefined : Pad.A), // her thanks, until she lists her wares again
      press(Pad.B, Pad.B), // nothing else
    ]);
    await play(g);
    expect(s.reagents[which]).toBeGreaterThan(garlic);
    expect(s.gold).toBeLessThan(500);
  });

  it('talks to Sin Vraal by walking into him, daemon though he looks', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 15, level: 0, x: 15, y: 30, hour: 10 });
    await enterTown(g, true);
    const him = s.actors[s.npcs[1].actor];
    expect(him.tile).toBeGreaterThanOrEqual(0x80); // a creature's tile, in the hut's own table of people
    Object.assign(s, { x: him.x, y: him.y + 1, level: him.z });
    fly(g, p, [
      press(K.Up), // walking into him is Talk, not Attack
      (game) => (game.menuShown?.title === 'Say' ? undefined : Pad.A),
      pick('Say', 'Take leave'),
    ]);
    await play(g);
    expect(p.log).toMatch(/Talk/);
    expect(p.log).not.toMatch(/Attack|CONFLICT/);
    expect(s.mapId).toBe(15);
  });

  it("picks up Lord British's Crown by walking into it, in Blackthorn's palace", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown, loadLevel } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 18, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    // The Crown lies on the top floor, one of the palace's own table of people: up to it.
    const crown = [...Array(32).keys()].find((i) => s.npcTypes[i] === 0xb5)!;
    Object.assign(s, { x: s.npcs[crown].x, y: s.npcs[crown].y + 1, level: s.npcs[crown].z });
    loadLevel(g, true);
    const it = s.actors[s.npcs[crown].actor];
    expect(it.tile).toBe(0xb5);
    fly(g, p, [press(K.Up), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    await play(g);
    expect(p.log).not.toMatch(/Nothing to attack/);
    expect(s.crown).toBe(0xff);
  });

  it('calls a Shadowlord to his flame by name', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 0x1e, level: 0, x: 15, y: 30, hour: 10 });
    await enterTown(g, true);
    const name = g.data.table(0x444a, 3)[0];
    g.words.learn(g, `His name is ${title(name)}, whisper it not.`);
    fly(g, p, [command('Yell'), pick('Yell', title(name)), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    await play(g);
    expect(s.actors.some((a) => a.tile === 0xfc)).toBe(true);
  });

  it('destroys a Shadowlord: his name yelled before the flame, and as he steps into it his shard used', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    const [x, y, map, level] = [0x4882, 0x4886, 0x488a, 0x488e].map((at) => g.data.bytes(at, 3)[0]);
    Object.assign(s, { mapId: map, level, x, y, hour: 1 }); // by night: by day the keeper stands before his flame
    await enterTown(g, true);
    Object.assign(s, { x, y });
    s.scrolls.fill(0);
    s.potions.fill(0);
    s.shards[0] = 1;
    const name = g.data.table(0x444a, 3)[0];
    g.words.learn(g, `His name is ${title(name)}, whisper it not.`);
    fly(g, p, [
      command('Yell'),
      pick('Yell', title(name)),
      // he appears beyond the flame and walks into it: a turn passed until he stands there
      until(
        (game) => game.s.actors.some((a) => a.tile === 0xfc && a.x === x && a.y === y - 1),
        () => press(Pad.B), // B passes
      ),
      command('Use item'),
      press(Pad.A),
      (game) => (game.s.shadowlords[0] === 0xff || game.commandPrompt !== '' ? undefined : Pad.A),
    ]);
    await play(g);
    expect(p.log).not.toContain('No effect');
    expect(s.shadowlords[0]).toBe(0xff);
    expect(s.shards[0]).toBe(0);
    expect(s.actors.some((a) => a.tile === 0xfc)).toBe(false);
  });

  it('casts a healing spell on a wounded companion', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mixtures[4] = 2;
    s.members[0].mp = 30;
    s.members[1].hp = 5;
    fly(g, p, [
      command('Cast'),
      // Whoever asks who casts, and then for the spell: A takes the first, and with nothing typed opens the list.
      (game) => (game.menuShown ? undefined : Pad.A),
      pick('Spells', /^Heal/),
      press(Pad.A), // the bar already on the wounded one, the second of the party (input.ts neediest)
      (game) => (game.commandPrompt === '' && !game.menuShown ? Pad.A : undefined),
    ]);
    await play(g);
    expect(s.mixtures[4]).toBe(1);
    expect(s.members[1].hp).toBeGreaterThan(5);
  });

  it('keeps the mixture and the magic points of a spell backed out of at its own question', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mixtures[4] = 2;
    s.members[0].mp = 30;
    s.members[1].hp = 5;
    fly(g, p, [
      command('Cast'),
      (game) => (game.menuShown ? undefined : Pad.A),
      pick('Spells', /^Heal/),
      press(Pad.B), // on whom? - on nobody, after all
      (game) => (game.commandPrompt === '' && !game.menuShown ? Pad.A : undefined),
    ]);
    await play(g);
    expect(s.mixtures[4]).toBe(2);
    expect(s.members[0].mp).toBe(30);
    expect(s.members[1].hp).toBe(5);
  });

  it('goes down into a dungeon and climbs out again', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const loc = g.data.locations[0x21]; // Despise
    s.d58d0[1] |= 0x80; // its word already spoken
    const { setTileAt, tileAt } = await import('../src/game/world.ts');
    Object.assign(s, { mapId: 0, level: 0, x: loc.x, y: loc.y });
    void setTileAt;
    void tileAt;
    fly(g, p, [
      command('Enter'),
      (game) => (game.inDungeon ? undefined : Pad.A),
      command(/^Climb/),
      (game) => (game.inDungeon ? (game.commandPrompt === '' ? K.Up : undefined) : undefined),
    ]);
    await play(g);
    expect(p.log).toMatch(/Klimb/);
    expect(s.mapId).toBe(0);
  });

  it('fights giant rats from the combat menu, and again by auto combat', async () => {
    for (const auto of [false, true]) {
      // Out of Iolo's hut by the keyboard first, as the combat tests go, so the world outside is as the game leaves it.
      const { g, p } = newGame(auto ? 5 : 6);
      journeyOnward(g);
      const s = g.s;
      const { attackCombat } = await import('../src/game/combat.ts');
      const { enterTown, townLoop } = await import('../src/game/town.ts');
      await enterTown(g, true);
      p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      p.log = '';
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
      g.options.autoCombat = auto ? 'all' : 'off';
      // The tests' usual fighter decides; its keys are given as a pad gives them. Attack is chosen from the menu,
      // and the crosshair, which a d-pad cannot move on the slant, goes across and then up or down.
      const brain = fighter(g);
      const queue: number[] = [];
      let attacking = false;
      fly(
        g,
        p,
        [
          (game) => {
            if (auto) {
              // Nothing to do but pass whatever is asked - until the field is won with treasure on it, where auto
              // combat waits and B will not walk away: Leave combat, at the head of the menu, does.
              const menu = game.menuShown;
              if (menu?.title === 'Commands') return menu.labels[menu.at] === 'Leave combat' ? Pad.A : K.Up;
              return /VICTORY/.test(p.log) && game.commandPrompt === 'combat' && !menu ? Pad.A : Pad.B;
            }
            const m = game.menuShown;
            const won = /VICTORY/.test(p.log);
            // Won with treasure lying, B will not walk away: Leave combat, from the menu, does.
            if (m?.title === 'Commands' && won) return m.labels[m.at] === 'Leave combat' ? Pad.A : K.Up;
            if (m?.title === 'Commands') return m.labels[m.at].startsWith('Attack') ? Pad.A : K.Down;
            if (m) return Pad.B;
            if (queue.length) return queue.shift();
            if (attacking && !game.s.crosshair) attacking = false;
            const k = brain();
            if (k === 0x41) {
              attacking = true;
              return Pad.A; // the command menu
            }
            if (k === K.Enter) return Pad.A;
            if (k === K.Escape) return won && !game.s.crosshair ? Pad.A : Pad.B;
            if (k >= 0xd3 && k <= 0xd6) {
              queue.push(k === 0xd3 || k === 0xd5 ? K.Up : K.Down);
              return k === 0xd3 || k === 0xd4 ? K.Left : K.Right;
            }
            return k;
          },
        ],
        20000,
      );
      try {
        await attackCombat(g, 1);
      } catch (e) {
        if (!(e instanceof Landed)) throw e;
      }
      expect(p.log).toMatch(/VICTORY|BATTLE IS LOST/);
    }
  });

  it("takes up melee arms in a fight from the menu's Switch Weapon, and offers it nowhere else", async () => {
    const { g, p } = newGame(6);
    journeyOnward(g);
    const s = g.s;
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    const { wears } = await import('../src/game/zstats.ts');
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    p.log = '';
    // Out of doors the command menu has no Switch: it is a thing for a fight.
    let outdoors: string[] = [];
    fly(g, p, [
      (game) => {
        if (outdoors.length !== 0) return undefined;
        if (game.menuShown?.title !== 'Commands') return Pad.A;
        outdoors = game.menuShown.labels;
        return Pad.B;
      },
    ]);
    await play(g);
    expect(outdoors.length).toBeGreaterThan(0);
    expect(outdoors.some((l) => /Switch/.test(l))).toBe(false);
    // A rat at the party's elbow, a long sword and the returning axe in the pack - no shield - and nothing in hand:
    // the Avatar's style is weapon and shield, and with none to be had, a weapon in each hand.
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
    s.members[0].equips.fill(0xff);
    s.members[0].str = 40;
    s.equipment[0x1e] = 1; // Long Sword
    s.equipment[0x26] = 1; // Magic Axe
    for (let shield = 4; shield <= 8; shield++) s.equipment[shield] = 0;
    p.log = '';
    fly(g, p, [
      (game) => (game.commandPrompt === 'combat' && game.combat[game.s.combatTurn]?.who === 0 ? undefined : Pad.B),
      command('Switch Weapon'),
    ]);
    await play(g);
    expect(p.log).toMatch(/Switch/);
    expect(wears(g, 0, 0x1e)).toBe(true);
    expect(wears(g, 0, 0x26)).toBe(true);
  });

  it('wins a fight with the d-pad alone: walking into a foe strikes it', async () => {
    const { g, p } = newGame(6);
    journeyOnward(g);
    const s = g.s;
    const { attackCombat, onMonsterSide } = await import('../src/game/combat.ts');
    const { CF } = await import('../src/game/game.ts');
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    p.log = '';
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
    let menus = 0;
    fly(
      g,
      p,
      [
        (game) => {
          if (/VICTORY|BATTLE IS LOST/.test(p.log)) return undefined;
          if (game.menuShown) {
            menus++;
            return Pad.B;
          }
          if (game.s.crosshair) {
            // A second weapon's blow: the aim is on the foe still, or - the foe fallen to the first - on nobody.
            const me = game.combat[game.s.combatTurn];
            return me.x === game.s.crossX && me.y === game.s.crossY ? Pad.B : Pad.A;
          }
          if (game.commandPrompt !== 'combat') return Pad.B;
          if (/Blocked!\s*$/.test(p.log)) {
            p.log += ' ';
            return Pad.B; // a comrade or a rock in the way: the turn is passed, and the fight shifts
          }
          const me = game.combat[game.s.combatTurn];
          const foes = game.combat.filter((c, i) => c.flags !== 0 && !(c.flags & CF.Dead) && onMonsterSide(game, i));
          if (!foes.length) return Pad.B;
          foes.sort((a, b) => Math.abs(a.x - me.x) + Math.abs(a.y - me.y) - (Math.abs(b.x - me.x) + Math.abs(b.y - me.y)));
          const f = foes[0];
          if (f.x !== me.x && (f.y === me.y || Math.abs(f.x - me.x) >= Math.abs(f.y - me.y))) return f.x < me.x ? K.Left : K.Right;
          return f.y < me.y ? K.Up : K.Down;
        },
      ],
      20000,
    );
    try {
      await attackCombat(g, 1);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(p.log).toMatch(/VICTORY/);
    expect(menus).toBe(0);
  });

  it("plays the tune at Lord British's harpsichord, note by note from a menu", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown, loadLevel } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 0x11, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    s.level = 2;
    loadLevel(g, true);
    const at = g.map.indexOf(0x8d); // the harpsichord: sit to the north of it
    expect(at).toBeGreaterThan(0);
    Object.assign(s, { x: at % 32, y: Math.floor(at / 32) - 1 });
    const wall = g.map[0xd * 32 + 0x11];
    const tune = [...g.data.bytes(0x275a, 0xd)];
    fly(g, p, [command('Play'), playing(tune), press(Pad.B), (game) => (game.commandPrompt === '' ? Pad.B : undefined)]);
    await play(g);
    expect(g.map[0xd * 32 + 0x11]).not.toBe(wall);
  });
});

/** Choose each note of a tune from the harpsichord's menu, whatever its title has grown to. */
function playing(tune: number[]): Step {
  let i = 0;
  return (g) => {
    if (i >= tune.length) return undefined;
    const m = g.menuShown;
    if (!m || !m.title.startsWith('Notes')) throw new Error(`expected the notes, found ${m?.title ?? 'no menu'}`);
    const want = tune[i] - 1;
    if (m.at === want) {
      i++;
      return Pad.A;
    }
    return m.at < want ? K.Down : K.Up;
  };
}

describe("Lord British's regalia, by controller", () => {
  it('is worn and wielded from the list of items', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { setTileAt, tileAt } = await import('../src/game/world.ts');
    const { T } = await import('../src/game/tiles.ts');
    s.crown = s.sceptre = s.amulet = 1;
    s.scrolls.fill(2); // a list long enough to scroll
    s.potions.fill(2);
    const prompt: Step = (game) => (game.commandPrompt === '' && !game.menuShown ? Pad.A : undefined);
    let icon = 0;
    fly(g, p, [
      command('Use item'),
      pick('Items', /crown/i),
      prompt,
      (game) => ((icon = game.regalia), undefined),
      command('Use item'),
      pick('Items', /amulet/i),
      prompt,
      (game) => (setTileAt(game, s.x + 1, s.y, T.T70), undefined), // a wall of force beside the party
      command('Use item'),
      pick('Items', /sceptre/i),
      prompt,
    ]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(icon).toBe(0x1c);
    expect(g.regalia).toBe(0xe);
    expect(tileAt(g, s.x + 1, s.y)).toBe(T.Grass);
  });
});

describe('a shard, by controller', () => {
  it('is taken up in the Underworld with Get and the d-pad, and the Amulet with it', async () => {
    for (const what of ['shard', 'amulet'] as const) {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      const { stashWorldActors } = await import('../src/game/outdoors.ts');
      stashWorldActors(g);
      const [x, y] = what === 'shard' ? [g.data.bytes(0x3a06, 3)[1], g.data.bytes(0x3a0a, 3)[1]] : [0x69, 0xe1];
      Object.assign(s, { mapId: 0, level: 0xff, x: x - 1, y });
      fly(g, p, [command('Get'), press(K.Right), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
      try {
        await runGame(g);
      } catch (e) {
        if (!(e instanceof Landed)) throw e;
      }
      if (what === 'shard') expect(s.shards[1]).not.toBe(0);
      else expect(s.amulet).not.toBe(0);
    }
  });
});

describe('a shard walked into', () => {
  it('is picked up by the walking into it, not attacked', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    const [x, y] = [g.data.bytes(0x3a06, 3)[1], g.data.bytes(0x3a0a, 3)[1]];
    Object.assign(s, { mapId: 0, level: 0xff, x: x - 1, y });
    fly(g, p, [press(K.Right), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(p.log).not.toMatch(/Nothing to attack/);
    expect(s.shards[1]).not.toBe(0);
  });
});

describe('the Sandalwood Box, by controller', () => {
  it('is taken from behind the panel with Get and the d-pad', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown, loadLevel } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 0x11, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    s.level = 2;
    loadLevel(g, true);
    const box = s.actors.find((a) => a.tile === 0x0e);
    expect(box).toBeDefined();
    Object.assign(s, { x: box!.x - 1, y: box!.y }); // in the cell the tune opens, the box to the east
    fly(g, p, [command('Get'), press(K.Right), (game) => (game.commandPrompt === '' ? Pad.A : undefined)]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(s.sandalwoodBox).not.toBe(0);
  });
});

describe("Lord Kenneth's lesson, by controller", () => {
  const lesson = async (): Promise<{ g: ReturnType<typeof newGame>['g']; p: ReturnType<typeof newGame>['p'] }> => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    // He is the one townsman of the dwellings who teaches the harpsichord: found by his script, wherever he lives.
    for (let town = 9; town <= 16; town++) {
      stashWorldActors(g);
      Object.assign(s, { mapId: town, level: 0, x: 15, y: 30, hour: 12 });
      await enterTown(g, true);
      const npc = [...Array(32).keys()].find((i) => i > 0 && s.npcTypes[i] !== 0 && s.npcs[i].fa === 14 && s.actors[s.npcs[i].actor]?.tile);
      if (npc === undefined) continue;
      const a = s.actors[s.npcs[npc].actor];
      Object.assign(s, { x: a.x, y: a.y + 1, level: a.z });
      return { g, p };
    }
    throw new Error('Lord Kenneth is not at home');
  };
  const play = async (g: Parameters<typeof runGame>[0]): Promise<void> => {
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
  };

  it('offers the notes among their scrambles, greys a wrong one, and teaches the tune', async () => {
    const { g, p } = await lesson();
    g.words.learn(g, 'He is the court composer.');
    const menus: string[][] = [];
    let wrongOnce = false;
    fly(
      g,
      p,
      [
        command('Talk'),
        press(K.Up),
        (game) => {
          const m = game.menuShown;
          if (/practice/i.test(p.log)) return undefined;
          if (!m) return Pad.A;
          if (m.title === 'Say') {
            const fresh = m.labels.findIndex((l, i) => !m.dim[i] && !/Name|Job|Take leave/.test(l));
            const want = fresh >= 0 ? fresh : 1; // Job leads to Composer
            return m.at === want ? Pad.A : m.at < want ? K.Down : K.Up;
          }
          if (m.title !== 'Answer') return Pad.B;
          if (m.at === 0) menus.push(m.labels.map((l, i) => (m.dim[i] ? `(${l})` : l)));
          if (m.labels.includes('Yes')) return Pad.A; // does he wish to learn: yes
          // Once, the first wrong answer; after that, the right one.
          const right = m.labels.findIndex((l) => l === 'DCB' || l === '987');
          const wrong = m.labels.findIndex((l, i) => i !== right && !m.dim[i] && l !== 'Take leave');
          const want = !wrongOnce && wrong >= 0 ? wrong : right;
          if (m.at === want) {
            if (want === wrong) wrongOnce = true;
            return Pad.A;
          }
          return m.at < want ? K.Down : K.Up;
        },
      ],
      600,
    );
    await play(g);
    expect(p.log).toMatch(/try again/);
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/678 987 8767653/);
    const notes = menus.filter((m) => m.some((l) => l.replace(/[()]/g, '') === 'DCB'));
    expect(notes[0]).toHaveLength(5); // four orders of the notes, and leave
    expect(notes[0].every((l) => !l.startsWith('('))).toBe(true);
    expect(notes[1].filter((l) => l.startsWith('('))).toHaveLength(1); // the wrong one, greyed
    expect(menus.flat()).not.toContain('Spell it out...');
  });

  it('can be walked away from', async () => {
    const { g, p } = await lesson();
    g.words.learn(g, 'He is the court composer.');
    fly(
      g,
      p,
      [
        command('Talk'),
        press(K.Up),
        (game) => {
          const m = game.menuShown;
          if (game.commandPrompt === 'town' && !m) return undefined;
          if (!m) return Pad.A;
          if (m.title === 'Say') {
            const fresh = m.labels.findIndex((l, i) => !m.dim[i] && !/Name|Job|Take leave/.test(l));
            const want = fresh >= 0 ? fresh : 1;
            return m.at === want ? Pad.A : m.at < want ? K.Down : K.Up;
          }
          if (m.title === 'Answer' && m.labels.includes('Yes')) return Pad.A;
          return Pad.B; // at the riddle: B walks away
        },
      ],
      400,
    );
    await play(g);
    expect(g.commandPrompt === 'town' || /Bye/i.test(p.log)).toBe(true);
    expect(p.log).not.toMatch(/try again/);
  });
});

describe('a ship, by controller', () => {
  it('is boarded, its sails hoisted with Yell, sailed by the d-pad, and its cannon fired', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    const { readBritannia } = await import('../src/data/maps.ts');
    const { freeActor, setActor } = await import('../src/game/actors.ts');
    // Out of the hut by the keyboard, so the world outside is as the game leaves it.
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    // Open sea: a square of deep water with deep water all round it for a few squares.
    const sea = readBritannia(g.data.files, g.data.ovl).tiles;
    let at = -1;
    for (let y = 8; y < 248 && at < 0; y++) {
      for (let x = 8; x < 248 && at < 0; x++) {
        let open = true;
        for (let dy = -4; dy <= 4 && open; dy++) for (let dx = -4; dx <= 4; dx++) if (sea[(y + dy) * 256 + x + dx] !== 1) open = false;
        if (open) at = y * 256 + x;
      }
    }
    Object.assign(s, { x: at % 256, y: at >> 8 });
    for (let i = 1; i < 32; i++) s.actors[i].tile = s.actors[i].anim = 0; // nothing of the hut's woods comes to sea
    const ship = freeActor(g);
    setActor(g, ship, 0x24, 0x24, s.x, s.y, 0, 0); // a frigate, sails furled, under the party's feet
    s.actors[ship].b5 = 50; // her hull
    s.actors[ship].b7 = 1; // a skiff aboard
    const [x, y] = [s.x, s.y];
    fly(g, p, [
      command('Board'),
      command('Yell'), // aboard, Yell hoists the sails: no word is asked for
      // East until she has made way (the first press only brings her head round).
      (game) => (game.s.x !== x || game.s.y !== y ? undefined : K.Right),
      command(/^Fire/),
      (game) => (game.commandPrompt === '' ? K.Up : undefined),
    ]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw new Error(String(e).slice(0, 80) + ' :: ' + p.log.slice(-600).replace(/\s+/g, ' '), { cause: e });
    }
    expect(p.log).toMatch(/Ship/);
    expect(p.log).toMatch(/HOIST/);
    expect([s.x, s.y]).not.toEqual([x, y]);
    expect(p.log).toMatch(/Fire/);
  });
});

describe('a horse, by controller', () => {
  it('is boarded in the stable it was bought in, ridden, and left', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { enterTown } = await import('../src/game/town.ts');
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    const { freeActor, setActor } = await import('../src/game/actors.ts');
    stashWorldActors(g);
    // North Britanny, which has a stable: a bought horse stands where the party stands, in the towne.
    Object.assign(s, { mapId: 20, level: 0, x: 15, y: 30, hour: 10 });
    await enterTown(g, true);
    const horse = freeActor(g);
    setActor(g, horse, 0x10, 0x10, s.x, s.y, 0, 0);
    const start = [s.x, s.y];
    let mounted = false;
    fly(g, p, [
      command('Board'),
      (game) => {
        mounted = (game.s.partyTile & 0xfc) === 0x10;
        return undefined;
      },
      press(K.Up),
      command(/^(Dismount|Disembark)$/),
    ]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw new Error(String(e).slice(0, 80) + ' :: ' + p.log.slice(-600).replace(/\s+/g, ' '), { cause: e });
    }
    expect(p.log).toMatch(/horse/);
    expect(mounted).toBe(true);
    expect([s.x, s.y]).not.toEqual(start); // ridden a square north
    expect(s.partyTile).toBe(0x1c); // on foot again
    // The horse left there - where it may have taken a step of its own the turn after
    expect(s.actors.some((a) => (a.tile & 0xfe) === 0x10 && Math.abs(a.x - s.x) <= 1 && Math.abs(a.y - s.y) <= 1)).toBe(true);
  });
});

describe('the Codex, by controller', () => {
  it('answers the last quest, and the word that opens Doom is learnt from its page', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { readBritannia, readUnderworld } = await import('../src/data/maps.ts');
    // Wherever the Codex stands: the one square of its tile, in Britannia or beneath it.
    let where: { x: number; y: number; level: number } | null = null;
    for (const [level, map] of [
      [0, readBritannia(g.data.files, g.data.ovl).tiles],
      [0xff, readUnderworld(g.data.files).tiles],
    ] as const) {
      const at = map.indexOf(0x11);
      if (at >= 0 && !where) where = { x: at % 256, y: at >> 8, level };
    }
    expect(where).not.toBeNull();
    Object.assign(s, { mapId: 0, ...where });
    for (let i = 1; i < 32; i++) s.actors[i].tile = s.actors[i].anim = 0;
    s.questActive = 0x80; // the last of the eight ordained...
    s.questDone = 0x7f; // ...and the other seven done
    const doom = g.data.table(0x4502, 8)[7];
    expect(g.words.knows(doom)).toBe(false);
    fly(g, p, [command('Enter'), (game) => (game.commandPrompt === '' ? Pad.A : undefined)], 200);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(s.questDone & 0xff).toBe(0xff);
    expect(g.words.knows(doom)).toBe(true);
  });
});

describe('the end, by controller', () => {
  it("walks through Doom's last door to the mirror, frees Lord British, and is proclaimed", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    const { CF } = await import('../src/game/game.ts');
    stashWorldActors(g);
    s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(7 * 0x200, 8 * 0x200));
    Object.assign(s, { mapId: 0x28, level: 7, x: 5, y: 6, facing: 2, d6602: 5, sandalwoodBox: 1 }); // facing the door south
    for (let k = 0; k < 3; k++) s.shadowlords[k] = 0xff;
    for (const m of s.members) m.hp = m.maxHp;

    // In the last room the party walks to the mirror one at a time (the first still there walks, the rest pass);
    // everything else - the questions, the long telling - is A, and B where A is not wanted.
    let sub: Step | null = null;
    let flip = false;
    const policy: Step = (game) => {
      if (p.log.includes('Be it known that on')) return undefined;
      if (sub) {
        const k = sub(game);
        if (k !== undefined) return k;
        sub = null;
      }
      if (game.commandPrompt === 'combat' && !game.menuShown) {
        const me = game.combat[s.combatTurn];
        const first = game.combat.findIndex((c) => (c.flags & CF.Player) !== 0 && (c.flags & CF.Dead) === 0);
        const walks = (me.flags & CF.Player) !== 0 && s.combatTurn === first;
        if (walks && me.x !== 5 && me.y > 3) return me.x < 5 ? K.Right : K.Left;
        if (walks && me.y > 2) return K.Up;
        if (walks && me.x !== 5) return me.x < 5 ? K.Right : K.Left;
        sub = press(Pad.B); // B passes
        return sub(game);
      }
      if (game.commandPrompt === 'dungeon' && !game.menuShown) return K.Up;
      if (game.menuShown) return Pad.A;
      flip = !flip;
      return flip ? Pad.A : Pad.B;
    };
    fly(g, p, [policy], 6000);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(p.log).toContain('Be it known that on');
    expect(p.log).toContain(s.members[0].name);
  });
});

describe('death, by controller', () => {
  it("is sat through with A alone, and the party wakes in Lord British's castle", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { Status } = await import('../src/game/save.ts');
    for (let m = 0; m < s.partySize; m++) Object.assign(s.members[m], { status: Status.Dead, hp: 0 });
    fly(g, p, [(game) => (game.s.mapId === 0x11 && game.commandPrompt !== '' ? undefined : Pad.A)], 400);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(s.mapId).toBe(0x11);
    for (let m = 0; m < s.partySize; m++) expect(s.members[m].status).toBe(Status.Good);
  });
});

describe('a skiff rowed back to its ship, by controller', () => {
  it('is offered Board on the ship, and boards her, the skiff stowed', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { freeActor, setActor } = await import('../src/game/actors.ts');
    const { commandMenu } = await import('../src/game/menu.ts');
    const { boardCommand } = await import('../src/game/cmds.ts');
    g.options.input = 'controller';
    Object.assign(s, { mapId: 0, level: 0, x: 133, y: 150 });
    const ship = freeActor(g);
    setActor(g, ship, 0x26, 0x26, s.x, s.y, 0, 0); // a frigate, under the skiff
    s.actors[ship].b5 = 50;
    s.actors[ship].b7 = 0; // her skiff is the one the party is in
    s.partyTile = 0x28;
    g.commandPrompt = 'outdoors';
    let offered: string[] = [];
    p.next = () => {
      offered = [...g.menuShown!.labels];
      return Pad.B;
    };
    await commandMenu(g);
    expect(offered).toContain('Board');
    s.dx = ship; // the actor Board takes (actorTileAt leaves its index there)
    await boardCommand(g);
    expect(s.partyTile & 0xfc).toBe(0x24);
    expect(s.actors[0].b7).toBe(1);
  });
});

describe('a magic carpet where it lies, by controller', () => {
  it('is offered Board to one standing on it, and boarded', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { freeActor, setActor } = await import('../src/game/actors.ts');
    const { commandMenu } = await import('../src/game/menu.ts');
    const { boardCommand } = await import('../src/game/cmds.ts');
    g.options.input = 'controller';
    Object.assign(s, { mapId: 0, level: 0 });
    const carpet = freeActor(g);
    setActor(g, carpet, 0x1b, 0x1b, s.x, s.y, 0, 0); // a carpet on the ground, where it was left (X-it) or kept
    g.commandPrompt = 'outdoors';
    let offered: string[] = [];
    p.next = () => {
      offered = [...g.menuShown!.labels];
      return Pad.B;
    };
    await commandMenu(g);
    expect(offered).toContain('Board');
    s.dx = carpet;
    await boardCommand(g);
    expect(s.partyTile & 0xfe).toBe(0x14);
  });
});
