/** Test helpers: the developer's own DOS files, in gamedata/ultima5 (gamedata/README.md). */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameFiles } from '../src/data/files.ts';

export const GAMEDATA = fileURLToPath(new URL('../../gamedata/ultima5', import.meta.url));

let cached: GameFiles | null = null;

/** Every file in gamedata/ultima5 (not the upgrade folder). */
export function gameFiles(): GameFiles {
  if (!cached) {
    cached = new GameFiles(
      readdirSync(GAMEDATA)
        .filter((f) => statSync(join(GAMEDATA, f)).isFile())
        .map((f) => [f, new Uint8Array(readFileSync(join(GAMEDATA, f)))] as [string, Uint8Array]),
    );
  }
  return cached;
}

import { combatantAt, drawCombatMarks, onMonsterSide } from '../src/game/combat.ts';
import { GameData } from '../src/game/data.ts';
import { CF, Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import type { Draw, Effects, Platform, Sound } from '../src/game/io.ts';
import { Save } from '../src/game/save.ts';
import { MockRandom } from './mockRandom.ts';
import { Text } from '../src/ui/text.ts';

/** A platform with no screen: text goes to a 40x25 grid, keys come from a script. */
export class FakePlatform implements Platform {
  readonly rows = Array.from({ length: 25 }, () => Array<string>(40).fill(' '));
  readonly text: Text;
  readonly keys: number[] = [];
  /** Everything printed, in order. */
  log = '';
  /** The page's clock, where a test gives it one (Platform.now); none by default, as nothing here runs in time. */
  now?: () => number;
  draw: Draw = {
    pen: 15,
    fill: () => {},
    line: () => {},
    plot: () => {},
    invert: () => {},
    tile: () => {},
    revealStep: () => {},
    moongate: () => {},
    scroll: () => {},
    savePage: () => {},
    restorePage: () => {},
  };
  fx: Effects = {
    page: () => {},
    image: () => {},
    bitImage: () => {},
    transfer: () => {},
    reveal: async () => false,
    originLogo: async () => false,
    showWD: async () => {},
    nextWDFrame: () => {},
    tilePx: () => {},
    moongatePx: () => {},
    revealPx: () => {},
  };
  sound: Sound = {
    pulse: async () => {},
    noise: async () => {},
    setHeld: () => {},
    tone: async () => {},
    sweep: async () => {},
    music: () => {},
  };

  constructor() {
    const rows = this.rows;
    this.text = new Text({
      glyph: (_f, code, c, r) => {
        rows[r][c] = String.fromCharCode(code);
      },
      clearCells: (c1, r1, c2, r2) => {
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) rows[r][c] = ' ';
      },
      scrollCells: (c1, r1, c2, r2) => {
        for (let r = r1; r < r2; r++) for (let c = c1; c <= c2; c++) rows[r][c] = rows[r + 1][c];
        for (let c = c1; c <= c2; c++) rows[r2][c] = ' ';
      },
    });
    // The log is what was printed, in order - whether or not it could be seen at the time (an overlay over the
    // message window keeps it unseen until it goes, text.ts cover).
    const print = this.text.printChar.bind(this.text);
    this.text.printChar = (ch: number) => {
      if (ch === 0x0a) this.log += '\n';
      else if (ch >= 0x20 && ch < 0x7f) this.log += String.fromCharCode(ch);
      print(ch);
    };
  }

  /** Where keys come from once the script is spent. */
  next?: (() => number | undefined | Promise<number>) | undefined;

  animateTiles(): void {}
  setClock(): void {}
  pollKey(): number {
    return this.keys.shift() ?? 0;
  }
  flushKeys(): void {}
  async waitKey(): Promise<number> {
    const k = this.keys.shift() ?? this.next?.();
    if (k === undefined) throw new Error('script ran out of keys');
    return k;
  }
  async sleep(): Promise<void> {}
}

/** A new game at Iolo's hut on a fake platform. */
export function newGame(seed = 1234): { g: Game; p: FakePlatform } {
  const files = gameFiles();
  const p = new FakePlatform();
  const g = new Game(new GameData(files), p, new Save(files.get('INIT.GAM')));
  g.drawCombatMarks = () => drawCombatMarks(g);
  g.rng = new MockRandom(seed);
  g.ool.under.set(files.get('INIT.OOL').subarray(0, 256));
  g.s.members[0].name = 'Tester';
  // The tests drive the game by its letter commands, as the original is played; a test about the
  // controller's keys says so itself.
  g.options.input = 'letters';
  return { g, p };
}

/** Keys as the DOS game reads them. */
export function keys(...ks: (number | string)[]): number[] {
  return ks.flatMap((k) => (typeof k === 'string' ? [...k].map((c) => c.charCodeAt(0)) : [k]));
}

const step = (from: number, to: number): number => Math.sign(to - from);

/** A simple player: attack the nearest foe when next to it, else walk toward it; with none left, walk off the field. */
export function fighter(g: Game): () => number {
  let budget = 3000;
  let last = '';
  let stuck = 0;
  return () => {
    const s = g.s;
    if (--budget === 0) throw new Error('fight went on too long');
    const me = g.combat[s.combatTurn];
    const foes = g.combat.filter((c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i));
    foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    if (s.crosshair) {
      if (combatantAt(g, s.crossX, s.crossY) > 5) return K.Enter;
      const f = foes[0];
      if (!f || Math.max(Math.abs(f.x - me.x), Math.abs(f.y - me.y)) > 1) return K.Escape;
      const dx = step(s.crossX, f.x);
      const dy = step(s.crossY, f.y);
      if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
      return dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down;
    }
    if (!foes.length) return K.Escape;
    const f = foes[0];
    if (Math.max(Math.abs(f.x - me.x), Math.abs(f.y - me.y)) <= 1) return 'A'.charCodeAt(0);
    const dx = step(me.x, f.x);
    const dy = step(me.y, f.y);
    const where = `${s.combatTurn},${me.x},${me.y}`;
    stuck = where === last ? stuck + 1 : 0;
    last = where;
    if (stuck) return [K.Up, K.Right, K.Down, K.Left][stuck % 4];
    return dy ? (dy < 0 ? K.Up : K.Down) : dx < 0 ? K.Left : K.Right;
  };
}

/**
 * A player who strikes creatures only - a friend charmed is left alone, the turn passed while only such are left, as
 * a careful player does - walking about what is in the way.
 */
export function careful(g: Game): () => number {
  const s = g.s;
  let budget = 6000;
  let last = '';
  let stuck = 0;
  return () => {
    if (--budget === 0) throw new Error('the fight never ended');
    const me = g.combat[s.combatTurn];
    const foes = g.combat.filter((c, i) => c.flags && !(c.flags & (CF.Dead | CF.Player)) && onMonsterSide(g, i));
    foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    if (s.crosshair) {
      const at = combatantAt(g, s.crossX, s.crossY);
      if (at >= 0 && at !== s.combatTurn && !(g.combat[at].flags & CF.Player) && onMonsterSide(g, at)) return K.Enter;
      const f = foes[0];
      if (!f || Math.max(Math.abs(f.x - me.x), Math.abs(f.y - me.y)) > 1) return K.Escape;
      const [dx, dy] = [Math.sign(f.x - s.crossX), Math.sign(f.y - s.crossY)];
      if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
      return dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down;
    }
    if (!foes.length) return s.battleWon ? K.Escape : K.Space;
    const f = foes[0];
    if (Math.max(Math.abs(f.x - me.x), Math.abs(f.y - me.y)) <= 1) return 'A'.charCodeAt(0);
    const where = `${s.combatTurn},${me.x},${me.y}`;
    stuck = where === last ? stuck + 1 : 0;
    last = where;
    if (stuck > 8) return K.Space; // hemmed in (a wall, a friend charmed): the turn passed
    if (stuck) return [K.Up, K.Right, K.Down, K.Left][stuck % 4];
    const [dx, dy] = [Math.sign(f.x - me.x), Math.sign(f.y - me.y)];
    return dy ? (dy < 0 ? K.Up : K.Down) : dx < 0 ? K.Left : K.Right;
  };
}
