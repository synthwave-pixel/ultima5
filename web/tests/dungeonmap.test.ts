import { describe, expect, it } from 'vitest';
import { dungeonSight } from '../src/game/dungeon.ts';
import { drawDungeonMap, DUNGEON_CREATURES, liftDungeonMap, mapCell, unrolled } from '../src/game/dungeonMap.ts';
import { creatureSeen, revealCells } from '../src/game/fog.ts';
import { Win } from '../src/game/frame.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { partyFigures } from '../src/game/world.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';
import { Colour, DUNGEON_TINTS } from '../src/ui/colours.ts';

/** The dungeon map (dungeonMap.ts): the Standard look's tiles for its marks, its two views, and the log under them. */
describe('the dungeon map', () => {
  /** A level of rock with a passage east from the party, a ladder up and a fountain along it. */
  const level = () => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 1, d58a7: 0xff }); // a torch lit
    g.s.dungeon.fill(0xb0);
    const cell = (x: number, y: number): number => y * 8 + x;
    g.s.dungeon[cell(1, 1)] = 0x00;
    g.s.dungeon[cell(2, 1)] = 0x10; // a ladder up
    g.s.dungeon[cell(3, 1)] = 0x50; // a fountain
    g.s.dungeon[cell(1, 2)] = 0x00; // and a passage south
    revealCells(g);
    // The party's leader (its figure, in the frame of its walk) apart from the cells' tiles.
    const icons: { tile: number; x: number; y: number; size: number; trim: boolean; tint?: number | undefined }[] = [];
    const figures: { x: number; y: number; size: number }[] = [];
    g.draw.icon = (tile, x, y, size, trim, tint) => {
      if (tile === partyFigures(g)[0].tile) figures.push({ x, y, size });
      else icons.push({ tile, x, y, size, trim: !!trim, tint });
      return true;
    };
    const scaled: number[][] = [];
    g.p.fx.transferScaled = (...a: number[]) => void scaled.push(a);
    return { ...made, icons, figures, scaled };
  };

  it("marks the cells with the Standard look's tiles, and the party with its figure, in the middle of five", () => {
    const { g, icons, figures } = level();
    drawDungeonMap(g);
    expect(icons.map((i) => i.tile)).toEqual(expect.arrayContaining([T.LadderUp]));
    // Five cells of twelve pixels a side, centred in the square of sixty-four at (224, 75), the party's the middle one.
    expect(figures).toEqual([{ x: 224 + 2 + 2 * 12, y: 75 + 2 + 2 * 12, size: 12 }]);
    for (const i of icons) expect(i.size).toBe(12);
  });

  it('draws every cell in whole tiles, a pixel of a tile to a pixel of the map: the rock the wall in its dungeon’s light', () => {
    const { g, icons } = level();
    g.options.dungeonView = 'full'; // the whole level's map, sixteen pixels a cell
    drawDungeonMap(g);
    expect(icons.length).toBeGreaterThan(0);
    for (const i of icons) expect(i.size).toBe(16);
    expect(icons.filter((i) => i.tile === T.Wall).every((i) => i.tint === DUNGEON_TINTS[1])).toBe(true); // Deceit
    // Laid edge to edge, as a town's tiles are: the passage cobbles on its cell whole, the rock round it the wall.
    const [px, py] = [8 + 5 * 16, 8 + 5 * 16]; // the party's cell, in the middle
    expect(icons).toContainEqual(expect.objectContaining({ tile: T.T44, x: px, y: py }));
    expect(icons).toContainEqual(expect.objectContaining({ tile: T.Wall, x: px + 16, y: py + 16 }));
  });

  it('draws rubble as the dungeon has it - bones, a caved in passage, or for a stalactite the rock alone - and both ladders the up over the down', () => {
    const { g, icons } = level();
    g.s.dungeon[1 * 8 + 2] = 0xc0; // the ladder's cell, rubble now
    g.s.dungeon[2 * 8 + 1] = 0x30; // and the passage south, ladders both ways
    const drawn = (look: number): number[] => {
      g.s.dungeonLook = look;
      icons.length = 0;
      drawDungeonMap(g);
      return icons.map((i) => i.tile);
    };
    expect(drawn(3)).toContain(0xcf);
    expect(drawn(2)).toContain(T.DF);
    const stalactite = drawn(1);
    expect(stalactite).not.toContain(0xcf);
    expect(stalactite).not.toContain(T.DF);
    expect(stalactite.indexOf(T.LadderDown)).toBeLessThan(stalactite.indexOf(T.LadderUp));
  });

  it('turns the fountain with the tiles’ cycles', () => {
    const { g, icons } = level();
    const fountain = (): number | undefined => icons.find((i) => (i.tile & 0xfc) === T.Fountain)?.tile;
    g.options.dungeonView = 'full'; // the whole level: the fountain is two cells east of the party
    drawDungeonMap(g);
    const first = fountain();
    g.cycles.step();
    icons.length = 0;
    drawDungeonMap(g);
    expect(first).toBeDefined();
    expect(fountain()).not.toBe(first);
  });

  it('lays the small map over the top of the log, which goes on beneath it and is all there once it is lifted', () => {
    const { g, p } = level();
    const row = (r: number): string => p.rows[r].slice(0x18, 0x28).join('');
    drawDungeonMap(g);
    expect(g.mapOverLog).toBe(true);
    g.text.select(Win.messages);
    for (let i = 0; i < 20; i++) g.print(`line ${i}\n`);
    // The rows under the map are kept, not drawn; those below it are drawn as ever.
    expect(row(10)).not.toContain('line');
    expect(row(21)).toContain('line');
    liftDungeonMap(g);
    expect(g.mapOverLog).toBe(false);
    expect(row(10)).toContain('line');
  });

  it("switched to the whole map, draws the level in the view and the first-person view small in the map's place", () => {
    const { g, icons, figures, scaled } = level();
    g.options.dungeonView = 'full';
    drawDungeonMap(g);
    expect(g.mapOverLog).toBe(true);
    // The level round the party filling the map's square, eleven cells of sixteen pixels a side, the party's in the middle.
    expect(figures).toEqual([{ x: 8 + 5 * 16, y: 8 + 5 * 16, size: 16 }]);
    expect(mapCell(g, 1, 1)).toEqual([8 + 5 * 16, 8 + 5 * 16, 16]);
    expect(icons.map((i) => i.tile)).toEqual(expect.arrayContaining([T.LadderUp, T.Fountain]));
    expect(scaled).toHaveLength(1);
    const [from, to, , , , , , dy, , dh] = scaled[0];
    expect([from, to, dy, dh]).toEqual([1, 0, 75, 64]);
  });

  it('keeps the party in the middle of the whole map, the level moving round it', () => {
    const { g, icons, figures } = level();
    g.options.dungeonView = 'full';
    drawDungeonMap(g);
    const ladder = icons.find((i) => i.tile === T.LadderUp)!;
    Object.assign(g.s, { x: 2, y: 1 }); // a step east, onto the ladder
    icons.length = 0;
    drawDungeonMap(g);
    expect(figures.map((f) => f.x)).toEqual([8 + 5 * 16, 8 + 5 * 16]);
    expect(icons.find((i) => i.tile === T.LadderUp)!.x).toBe(ladder.x - 16);
  });

  describe('on a level whose passages run back into themselves or not', () => {
    /** A passage along row 1 from the party at (1, 1): five cells east, or all eight, round the level. */
    const corridor = (cells: number) => {
      const made = level();
      const { g } = made;
      g.s.dungeon.fill(0xb0, 0, 0x40);
      for (let x = 1; x < 1 + cells; x++) g.s.dungeon[8 + (x & 7)] = 0x00;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fog.markPlace(0x21, 0, x, y);
      g.options.dungeonView = 'full';
      const floors = (): number[] => {
        made.icons.length = 0;
        drawDungeonMap(g);
        return made.icons.filter((i) => i.tile === T.T44 && i.y === 8 + 5 * 16).map((i) => (i.x - 8) / 16 - 5);
      };
      return { g, floors };
    };

    it('draws a passage that ends once, where it runs, never again where the grid wraps it round', () => {
      const { g, floors } = corridor(5);
      expect(unrolled(g)).not.toBeNull();
      // Its last cell four east of the party; not again four west, where (1 - 4) & 7 is the same cell of the grid.
      expect(floors().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    it('goes on as it begins past the edges where the passage loops round the level itself', () => {
      const { g, floors } = corridor(8);
      expect(unrolled(g)).toBeNull();
      expect(floors().sort((a, b) => a - b)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    });

    it('finds the game’s own looping levels, Shame’s seventh and Doom’s fifth, and no other', () => {
      const { g } = level();
      const file = g.data.files.get('DUNGEON.DAT');
      const loops: string[] = [];
      for (let d = 1; d <= 8; d++)
        for (let l = 0; l < 8; l++) {
          Object.assign(g.s, { mapId: 0x20 + d, level: l });
          g.s.dungeon.set(file.subarray((d - 1) * 0x200, d * 0x200));
          // From every cell the party could stand on: a loop anywhere on the level is found from its own piece.
          for (let c = 0; c < 64; c++) {
            Object.assign(g.s, { x: c & 7, y: c >> 3 });
            if (unrolled(g) === null) {
              loops.push(`${d}.${l + 1}`);
              break;
            }
          }
        }
      expect(loops).toEqual(['6.7', '8.5']);
    });
  });

  it('draws the level’s creature where the party sees it, on both maps, and not where it cannot', () => {
    const { g, icons } = level();
    const bat = (x: number, y: number): void => void Object.assign(g.s.actors[1], { x, y, tile: 1, b5: 0x10 });
    const drawnAt = (view: 'full' | 'mini'): [number, number][] => {
      g.options.dungeonView = view;
      icons.length = 0;
      drawDungeonMap(g);
      return icons.filter((i) => i.tile >= DUNGEON_CREATURES[1] && i.tile < DUNGEON_CREATURES[1] + 4).map((i) => [i.x, i.y]);
    };
    bat(3, 1); // down the passage east of the party, two cells off
    for (const view of ['full', 'mini'] as const) expect(drawnAt(view)).toEqual([mapCell(g, 3, 1)!.slice(0, 2)]);
    bat(5, 5); // in the rock beyond sight
    expect(drawnAt('full')).toEqual([]);
    // In the dark, only on a cell next to the party, felt for.
    g.s.d58a7 = 0;
    bat(3, 1);
    expect(drawnAt('full')).toEqual([]);
    bat(2, 1);
    expect(drawnAt('full')).toEqual([mapCell(g, 2, 1)!.slice(0, 2)]);
  });

  it('sees the creature only where the view could show it, not through rock or a closed door', () => {
    const { g } = level();
    const at = (x: number, y: number): boolean => {
      Object.assign(g.s.actors[1], { x, y, tile: 5, b5: 0x10 });
      return creatureSeen(g);
    };
    const put = (x: number, y: number, v: number): void => void (g.s.dungeon[y * 8 + x] = v);
    // A corner, open, looked into from the open cell east of the party: seen.
    put(2, 2, 0x00);
    expect(at(2, 2)).toBe(true);
    // A corner open but walled off from the party on both sides: known on the map, the creature in it not seen.
    put(0, 0, 0x00);
    expect(at(0, 0)).toBe(false);
    // The party before a closed door, the corridor beyond it running past the corner: not seen through the door.
    put(2, 1, 0xb0);
    put(3, 1, 0xb0);
    put(1, 2, 0xa0);
    put(0, 2, 0x00);
    expect(at(2, 2)).toBe(false);
    expect(at(0, 2)).toBe(false);
    // The door open (a passage beyond it): the corner beside that passage is seen again.
    put(1, 2, 0x00);
    expect(at(2, 2)).toBe(true);
    // In the dark, any of the eight round the party is felt, rock or none between.
    g.s.d58a7 = 0;
    put(1, 2, 0xa0);
    expect(at(2, 2)).toBe(true);
  });

  it('says where each map puts a cell, where it draws it (the map cells page cuts them out by it)', () => {
    const { g, icons } = level();
    // The ladder up at (2, 1), laid on its cell whole, on the whole map and the small one.
    for (const view of ['full', 'mini'] as const) {
      g.options.dungeonView = view;
      icons.length = 0;
      drawDungeonMap(g);
      const [x, y] = mapCell(g, 2, 1)!;
      expect(icons.find((i) => i.tile === T.LadderUp)).toMatchObject({ x, y });
    }
    // Off the small map (three cells round the party), none.
    expect(mapCell(g, 6, 6)).toBeNull();
  });

  it('gives Look’s words for a cell: its kind’s, a field’s own, the dungeon’s rubble', () => {
    const { g } = level();
    const says = (c: number, look = 1, pirate = false): string => g.data.t(dungeonSight(c, look, pirate)).trim();
    expect(says(0x10)).toBe('an up ladder.');
    expect(says(0x61)).toBe('a passage.'); // a hidden pit trap, as the passage it lies in
    expect(says(0x83)).toBe('An electric field.');
    expect([1, 2, 3].map((look) => says(0xc0, look))).toEqual([
      'a dripping stalactite.',
      'a caved in passage.',
      'a less fortunate adventurer.',
    ]);
    expect(says(0xc0, 3, true)).toBe('an unfortunate software pirate.');
  });

  it('draws the rock dark grey in the PC EGA look, which has no tiles', () => {
    const { g, icons } = level();
    const pens = new Set<number>();
    const fill = g.draw.fill.bind(g.draw);
    g.draw.fill = (x1, y1, x2, y2) => {
      pens.add(g.draw.pen);
      fill(x1, y1, x2, y2);
    };
    g.draw.icon = () => false; // as the EGA look's screen answers
    g.options.tileSet = 'original';
    g.options.dungeonMap = 'small';
    drawDungeonMap(g);
    expect(pens).toContain(Colour.darkGray);
    expect(icons).toHaveLength(0);
  });

  it('leaves the log alone in the PC EGA look, whose map stays over the view', () => {
    const { g } = level();
    drawDungeonMap(g);
    expect(g.mapOverLog).toBe(true);
    g.options.tileSet = 'original';
    drawDungeonMap(g);
    expect(g.mapOverLog).toBe(false);
  });
});

describe('walking the whole map', () => {
  const walker = async () => {
    const { newGame: made } = await import('./helpers.ts');
    const { g, p } = made();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 0, d58a7: 0xff });
    g.s.dungeon.fill(0x00); // open floor all round
    g.options.dungeonView = 'full';
    const { dungeonCommand } = await import('../src/game/dungeon.ts');
    return { g, p, step: (k: number) => dungeonCommand(g, k) };
  };

  it('reads a sign only when it is bumped into: its runes until then, and runes again after a step away', async () => {
    const { g, p, step } = await walker();
    const drawn: [string | null, boolean | undefined][] = [];
    p.fx.readSign = (key, read) => void drawn.push([key, read]);
    g.s.dungeon[0 * 8 + 1] = 0xb1; // Deceit's first sign, on the wall north
    const { refresh } = await import('../src/game/dungeon.ts');
    refresh(g);
    expect(drawn.filter(([k]) => k !== null).every(([, read]) => read === false)).toBe(true);
    drawn.length = 0;
    expect(await step(K.Up)).toBe(0); // bumped: read, the party where it was
    expect([g.s.x, g.s.y]).toEqual([1, 1]);
    expect(p.log).toContain('You see:');
    expect(drawn.some(([k, read]) => read === true && k === g.signRead)).toBe(true);
    await step(K.Right);
    expect(g.signRead).toBeNull();
  });

  it('goes on with a reading when the sign is bumped again (a key held against it), and starts it anew after a step', async () => {
    const { g, step } = await walker();
    g.s.dungeon[0 * 8 + 1] = 0xb1;
    await step(K.Up);
    const first = g.signRead;
    await step(K.Up);
    expect(g.signRead).toBe(first);
    g.s.dungeon[0 * 8 + 2] = 0xb1; // another sign, north of the square east
    await step(K.Right);
    await step(K.Up);
    expect(g.signRead).not.toBe(first);
  });

  it('in the dark, has the Standard look show what gives its own light alone, a sign not seen nor read', async () => {
    const { g, p, step } = await walker();
    Object.assign(g.s, { d58a6: 0, d58a7: 0 });
    g.options.tileSet = 'standard';
    const darkened: number[][] = [];
    p.fx.darkenUnlit = (...box) => void darkened.push(box);
    g.s.dungeon[0 * 8 + 1] = 0xb1;
    const { refresh } = await import('../src/game/dungeon.ts');
    refresh(g);
    expect(darkened).toContainEqual([0x10, 0xe, 0xaf, 0xb2]);
    await step(K.Up);
    expect(g.signRead).toBeNull();
  });

  it('in the dark, has the PC (1988) look show nothing, and no sign read', async () => {
    const { g, p, step } = await walker();
    Object.assign(g.s, { d58a6: 0, d58a7: 0 });
    g.options.tileSet = 'original';
    const darkened: number[][] = [];
    p.fx.darkenUnlit = (...box) => void darkened.push(box);
    g.s.dungeon[0 * 8 + 1] = 0xb1;
    const { refresh } = await import('../src/game/dungeon.ts');
    refresh(g);
    expect(darkened).toEqual([]);
    await step(K.Up);
    expect(g.signRead).toBeNull();
  });

  it("shows the Standard look's party falling through a pit: the view slid away, faster as it goes, then let go", async () => {
    const { g, p } = await walker();
    g.options.tileSet = 'standard';
    g.options.dungeonView = 'mini';
    const slid: (number | null)[] = [];
    p.fx.viewSlide = (_x1, _y1, _x2, _y2, k) => void slid.push(k);
    const { pitTrap } = await import('../src/game/dungeon.ts');
    p.keys.push(...Array<number>(8).fill(K.Enter)); // for the damage's waits
    await pitTrap(g, 0x61); // the party on a pit trap
    expect(g.s.level).toBe(1);
    expect(slid[0]).toBeLessThan(0.01);
    expect(slid.at(-2)).toBe(1);
    expect(slid.at(-1)).toBeNull();
    const ks = slid.slice(0, -1) as number[];
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
    // Faster as it goes: the first half of its frames goes less than half the way.
    expect(ks[Math.floor(ks.length / 2)]).toBeLessThan(0.5);
  });

  it('with the whole-level map up, slides the view it shows small beside it, inside its frame', async () => {
    const { g, p } = await walker();
    g.options.tileSet = 'standard';
    g.options.dungeonView = 'full';
    const { smallView } = await import('../src/game/dungeonMap.ts');
    const small = smallView(g);
    expect(small).not.toBeNull();
    const boxes = new Set<string>();
    p.fx.viewSlide = (x1, y1, x2, y2) => void boxes.add([x1, y1, x2, y2].join());
    const { pitTrap } = await import('../src/game/dungeon.ts');
    p.keys.push(...Array<number>(8).fill(K.Enter));
    await pitTrap(g, 0x61);
    const [x1, y1, x2, y2] = small!;
    expect([...boxes]).toEqual([[x1 + 1, y1 + 1, x2 - 1, y2 - 1].join()]);
  });

  it('shows the Standard look a sign two squares ahead as its plate alone, and 1988 nothing', async () => {
    for (const look of ['standard', 'original'] as const) {
      const { g, p } = await walker();
      g.options.tileSet = look;
      g.options.dungeonView = 'mini';
      const far: string[] = [];
      p.fx.farSign = (text) => void far.push(text);
      Object.assign(g.s, { x: 1, y: 3, facing: 0 });
      g.s.dungeon[1 * 8 + 1] = 0xb1; // Deceit's first sign, two squares north
      const { refresh } = await import('../src/game/dungeon.ts');
      refresh(g);
      if (look === 'standard') expect(far[0]).toContain('BOTTOMLESS');
      else expect(far).toEqual([]);
    }
  });

  it('shows the Standard look signs on the side walls within a step, and 1988 none', async () => {
    for (const look of ['standard', 'original'] as const) {
      const { g, p } = await walker();
      g.options.tileSet = look;
      g.options.dungeonView = 'mini';
      const seen: string[] = [];
      p.fx.sideSign = (_text, _l, _t, side, depth) => void seen.push(`${side === 0 ? 'left' : 'right'} ${depth}`);
      g.s.dungeon.fill(0xb0, 0, 0x40);
      for (const y of [3, 4]) g.s.dungeon[y * 8 + 3] = 0; // a passage north, (3,4) and (3,3)
      g.s.dungeon[4 * 8 + 2] = 0xb1; // a sign west of the party
      g.s.dungeon[3 * 8 + 4] = 0xb1; // one east of the square ahead
      Object.assign(g.s, { x: 3, y: 4, facing: 0 });
      const { refresh } = await import('../src/game/dungeon.ts');
      refresh(g);
      if (look === 'standard') expect(seen.sort()).toEqual(['left 0', 'right 1']);
      else expect(seen).toEqual([]);
    }
  });

  it("drops the PC (1988) look's party through a pit at once, as 1988 did", async () => {
    const { g, p } = await walker();
    g.options.tileSet = 'original';
    const slid: (number | null)[] = [];
    p.fx.viewSlide = (_x1, _y1, _x2, _y2, k) => void slid.push(k);
    const { pitTrap } = await import('../src/game/dungeon.ts');
    p.keys.push(...Array<number>(8).fill(K.Enter)); // for the damage's waits
    await pitTrap(g, 0x61); // the party on a pit trap
    expect(g.s.level).toBe(1);
    expect(slid).toEqual([]);
  });

  it('has the Standard look carve the sign itself, with its text, place and whether it is read', async () => {
    const { g, p, step } = await walker();
    const carved: [string, number, number, string, boolean][] = [];
    p.fx.carveSign = (...a) => (carved.push(a), true);
    g.s.dungeon[0 * 8 + 1] = 0xb1;
    const { refresh } = await import('../src/game/dungeon.ts');
    refresh(g);
    expect(carved.length).toBeGreaterThan(0);
    expect(carved.every(([, , , , read]) => !read)).toBe(true);
    const [text, left, top] = carved[0];
    expect(text).toContain('BOTTOMLESS');
    expect([left, top]).toEqual([g.data.bytes(0x2df8, 12)[0], g.data.bytes(0x2e04, 12)[0]]);
    carved.length = 0;
    await step(K.Up);
    expect(carved.some(([, , , key, read]) => read && key === g.signRead)).toBe(true);
  });

  it('faces the way pressed and steps, as in the world; the opposite way turns about and steps', async () => {
    const { g, step } = await walker();
    expect(await step(K.Right)).toBe(1);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([2, 1, 1]);
    expect(await step(K.Left)).toBe(1);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 1, 3]);
    expect(await step(K.Down)).toBe(1);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 2, 2]);
  });

  it('goes only along a doorway, backing out the opposite way without turning', async () => {
    const { g, p, step } = await walker();
    g.s.facing = 1;
    g.s.dungeon[1 * 8 + 1] = 0xe0; // a doorway where the party stands
    expect(await step(K.Up)).toBe(0);
    expect(p.log).toContain('Not in doorway!');
    expect(g.s.facing).toBe(1);
    expect(await step(K.Left)).toBe(1); // backs out west, still facing east
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([0, 1, 1]);
  });

  it('only turns to face something it would act on, and acts on the next press: a skeleton searched then', async () => {
    const { g, step } = await walker();
    g.s.dungeonLook = 3; // remains
    g.s.dungeon[2 * 8 + 1] = 0xc0; // a skeleton south of the party
    g.searchAhead = false;
    expect(await step(K.Down)).toBe(0); // turned to face it, no time taken
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 1, 2]);
    expect(g.searchAhead).toBe(false);
    await step(K.Down); // now facing it: the bump searches it
    expect(g.searchAhead).toBe(true);
  });

  it('turns first to a chest, a ladder or the creature, and steps on the next press', async () => {
    const { g, step } = await walker();
    g.s.dungeon[1 * 8 + 2] = 0x40; // a chest east
    expect(await step(K.Right)).toBe(0);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 1, 1]);
    expect(await step(K.Right)).toBe(1);
    expect([g.s.x, g.s.y]).toEqual([2, 1]);
    g.s.dungeon[2 * 8 + 2] = 0x10; // a ladder up south
    expect(await step(K.Down)).toBe(0);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([2, 1, 2]);
    Object.assign(g.s.actors[1], { x: 1, y: 1 }); // the creature, back west
    expect(await step(K.Left)).toBe(0);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([2, 1, 3]);
  });

  it('turns and steps at once onto a trap not yet found, which it cannot know is there, and into rock in the dark', async () => {
    const { g, p, step } = await walker();
    g.s.dungeon[2 * 8 + 1] = 0x61; // a pit trap, hidden, south
    expect(await step(K.Down)).toBe(1);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 2, 2]);
    g.s.d58a7 = 0; // the torch out
    g.s.dungeon[2 * 8 + 2] = 0xb0; // rock east
    await step(K.Right);
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 2, 1]);
    expect(p.log).toContain('Blocked!');
  });

  it('walks forward and turns with the first-person view, as ever', async () => {
    const { g, step } = await walker();
    g.options.dungeonView = 'mini';
    expect(await step(K.Right)).toBe(0); // a turn, and no step
    expect([g.s.x, g.s.y, g.s.facing]).toEqual([1, 1, 1]);
  });
});
