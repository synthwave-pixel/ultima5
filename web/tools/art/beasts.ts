/**
 * beasts.ts
 *
 * The creatures Ultima V has and Ultima III has not, drawn the way that
 * port's figures are: on a grid of sixteen, each square two pixels, a
 * material lit from the left - the first square of a run light, the last
 * in shade, the rest the base. A grid here is sixteen rows of sixteen
 * characters: a lower-case letter is a material, toned by where it falls
 * in its run; any other character is a colour taken as it is.
 */

import { Sprite, type Colour } from './draw.ts';
import { P } from './palette.ts';

/** Light, base and shade. */
type Material = [Colour, Colour, Colour];

const M: Record<string, Material> = {
  g: [P.snakeLight, P.snake, P.snakeShade], // green: snake, slime, tentacle
  t: [P.tealLight, P.teal, P.tealShade],
  r: [P.redLight, P.red, P.redShade],
  c: [P.coralLight, P.coral, P.coralShade],
  l: [P.leatherLight, P.leather, P.leatherShade],
  w: [P.woodLight, P.wood, P.woodShade],
  k: [P.charcoalLight, P.charcoal, P.charcoalShade],
  s: [P.slateLight, P.slate, P.slateShade],
  i: [P.ironLight, P.iron, P.ironShade],
  b: [P.boneLight, P.bone, P.boneShade],
  y: [P.goldLight, P.gold, P.goldShade],
  d: [P.sandLight, P.sand, P.sandShade],
  m: [P.magicLight, P.magic, P.magicShade],
  n: [P.moonLight, P.moon, P.charcoalShade], // the night blue of a Shadowlord's robe
  e: [P.dirtLight, P.dirt, P.dirtShade], // earth
  p: [P.tanLight, P.coralLight, P.coral], // the pink of a tail, an ear, a tongue
  q: [P.leafLight, P.leaf, P.leafShade], // the squid's brighter green
  h: [P.personLight, P.person, P.personShade], // the people's skin: the oarsman, the rider, the party on the carpet, the sleeper
  o: [P.oliveLight, P.olive, P.oliveShade],
  v: [P.royalLight, P.royal, P.royalShade],
  a: [P.steelLight, P.steel, P.steelShade],
  z: [P.wizardLight, P.wizard, P.wizardShade],
  j: [P.tanLight, P.tan, P.tanShade],
  u: [P.guardLight, P.guard, P.guardShade], // a blanket's blue
};

const FIXED: Record<string, Colour> = {
  K: P.black,
  W: P.white,
  R: P.fire,
  O: P.orange,
  Y: P.goldLight,
  G: P.leafTip,
  F: P.foam,
  B: P.shallowLight,
  D: P.charcoalShade,
  V: P.redShade,
  L: P.leaf,
  C: P.magicLight,
  T: P.tealLight,
  H: P.charcoalLight,
  Q: P.leafShade,
  S: P.snakeShade,
  A: P.leatherLight,
};

/** A figure from a grid of sixteen. */
export function beast(rows: string[]): Sprite {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`a beast is sixteen by sixteen:\n${rows.join('\n')}`);
  const s = new Sprite();
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      let c = FIXED[ch];
      if (c === undefined) {
        const m = M[ch];
        if (!m) throw new Error(`no colour for '${ch}'`);
        let from = x;
        while (from > 0 && row[from - 1] === ch) from--;
        let to = x;
        while (to < 15 && row[to + 1] === ch) to++;
        const run = to - from + 1;
        c = run < 3 ? m[1] : x === from ? m[0] : x === to ? m[2] : m[1];
      }
      s.rect(x * 2, y * 2, 2, 2, c);
    }
  });
  return s;
}

/** Two frames as the four the game keeps (rest, action, rest, action), rimmed. */
export function beast4(t: Map<number, Sprite>, tile: number, a: string[], b: string[]): void {
  const fa = beast(a).rim();
  const fb = beast(b).rim();
  [fa, fb, fa.clone(), fb.clone()].forEach((s, i) => t.set(tile + i, s));
}

// --- The grids -----------------------------------------------------------------------------------------

const SEA_HORSE = [
  [
    '................',
    '.......tt.......',
    '......ttttt.....',
    '.....ttKtttttt..',
    '.....ttttttttt..',
    '......tttt......',
    '.....tttt.......',
    '...y.ttTtt......',
    '..yytttTTt......',
    '...y.tttTtt.....',
    '.....tttTTt.....',
    '......tttTt.....',
    '.......ttt......',
    '...ttt..tt......',
    '...t.t..tt......',
    '...tttttt.......',
  ],
  [
    '................',
    '.......tt.......',
    '......ttttt.....',
    '.....ttKtttttt..',
    '.....ttttttttt..',
    '......tttt......',
    '.....tttt.......',
    '..yy.ttTtt......',
    '...ytttTTt......',
    '..yy.tttTtt.....',
    '.....tttTTt.....',
    '......tttTt.....',
    '.......ttt......',
    '....tt..tt......',
    '...t.t.ttt......',
    '...ttttt........',
  ],
];

const SHARK = [
  [
    '................',
    '................',
    '................',
    '....ss..........',
    '....sss.........',
    '....ssss........',
    '....sssss.......',
    '....ssssss......',
    '...ssssssss.....',
    's.sssssssssss...',
    'BFFsssssssssFFB.',
    '.BBFFFFFFFFFBB..',
    '...BB.....BB....',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '.....ss.........',
    '.....sss........',
    '.....ssss.......',
    '.....sssss......',
    '.....ssssss.....',
    '....ssssssss....',
    '.s.sssssssssss..',
    '.FBBsssssssssBBF',
    'BB.FFBBBBBBFF...',
    '..FF.......FF...',
    '................',
    '................',
    '................',
  ],
];

const RAT = [
  [
    '................',
    '................',
    '................',
    '................',
    '..........pp....',
    '.........lppl...',
    '....llllllllll..',
    'p..llllllllKlll.',
    'p.lllllllllllllp',
    '.plllllllllllb..',
    '..pllllllllll...',
    '...lAAAAAAAl....',
    '....ll.ll.ll.l..',
    '....p..p..p..p..',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '..........pp....',
    '.........lppl...',
    '....llllllllll..',
    '...llllllllKlll.',
    'p.lllllllllllllp',
    'p.lllllllllllb..',
    '.ppllllllllll...',
    '...lAAAAAAAl....',
    '...ll..ll.ll..l.',
    '...p...p...p..p.',
    '................',
    '................',
  ],
];

const BAT = [
  [
    '................',
    '................',
    '.s............s.',
    '.ss..........ss.',
    '.sss..k..k..sss.',
    '.ssss.kkkk.ssss.',
    '..sssskRkRssss..',
    '..sssskkkkssss..',
    '...sss.kk.sss...',
    '...s.s.kk.s.s...',
    '.......pp.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '......k..k......',
    '......kkkk......',
    '..sssskRkRssss..',
    '.ssssskkkksssss.',
    '.sss.s.kk.s.sss.',
    '.ss....kk....ss.',
    '.s.....pp.....s.',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
];

const SPIDER = [
  [
    '................',
    '................',
    '..HH........HH..',
    '.H..H..kk..H..H.',
    'H...H.kRRk.H...H',
    '.HH..HkkkkH..HH.',
    'H..HHkkkkkkHH..H',
    '....kkkkkkkk....',
    '.HHHkkkVVkkkHHH.',
    'H...kkkVVkkk...H',
    '..HHkkkkkkkkHH..',
    '.H...kkkkkk...H.',
    'H.....kkkk.....H',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '.HH..........HH.',
    'H..H...kk...H..H',
    'H...H.kRRk.H...H',
    '..HH.HkkkkH.HH..',
    '.H.HHkkkkkkHH.H.',
    'H...kkkkkkkk...H',
    '..HHkkkVVkkkHH..',
    '.H..kkkVVkkk..H.',
    '.H.HkkkkkkkkH.H.',
    '..H..kkkkkk..H..',
    '..H...kkkk...H..',
    '................',
    '................',
    '................',
  ],
];

const WISP = [
  [
    '................',
    '.......mm.......',
    '.......mm.......',
    '...m...CC...m...',
    '....m.mCCm.m....',
    '.....mCCCCm.....',
    '....mCCWWCCm....',
    '.mmCCCWWWWCCCmm.',
    '.mmCCCWWWWCCCmm.',
    '....mCCWWCCm....',
    '.....mCCCCm.....',
    '....m.mCCm.m....',
    '...m...CC...m...',
    '.......mm.......',
    '.......mm.......',
    '................',
  ],
  [
    '................',
    '.m............m.',
    '..m....mm....m..',
    '...C...mm...C...',
    '....C.mCCm.C....',
    '.....CCCCCC.....',
    '....mCWWWWCm....',
    '..mmCCWWWWCCmm..',
    '..mmCCWWWWCCmm..',
    '....mCWWWWCm....',
    '.....CCCCCC.....',
    '....C.mCCm.C....',
    '...C...mm...C...',
    '..m....mm....m..',
    '.m............m.',
    '................',
  ],
];

const SLIME = [
  [
    '................',
    '................',
    '................',
    '.........G......',
    '......gggg...G..',
    '....gggggggg....',
    '...gGGggggggg...',
    '..ggGgggSSggg...',
    '..gggggSbbSggg..',
    '.ggSggggSSggggg.',
    '.ggggggggggbSgg.',
    '.ggggbSggggSggg.',
    'gggGggSggggggggg',
    'gggggggggggggggg',
    '.ggg.ggggg.gggg.',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '..........G.....',
    '.....G..........',
    '.....gggggg.....',
    '...gGGggggggg...',
    '..ggGggggSSggg..',
    '.gggggggSbbSggg.',
    '.ggSgggggSSgggg.',
    'gggggggggggbSggg',
    'ggGggbSggggSgggg',
    'ggggggSggggggggg',
    'gg.gggg.gggg.ggg',
    '................',
  ],
];

const REAPER = [
  [
    '.w...w....w...w.',
    '.w...ww..ww...w.',
    '..w...w..w...w..',
    '..ww..wwww..ww..',
    '...ww.wwww.ww...',
    '....wwwwwwww....',
    '.....wwwwww.....',
    '.....wYwwYw.....',
    '.....wwwwww.....',
    '.....wKKKKw.....',
    '.....wKbbKw.....',
    '.....wwwwww.....',
    '.....wwwwww.....',
    '....wwwwwwww....',
    '...ww.wwww.ww...',
    '..ww..w..w..ww..',
  ],
  [
    'w.....w..w.....w',
    'w....ww..ww....w',
    '.w....w..w....w.',
    '.ww...wwww...ww.',
    '..www.wwww.www..',
    '....wwwwwwww....',
    '.....wwwwww.....',
    '.....wYwwYw.....',
    '.....wwwwww.....',
    '.....wKbbKw.....',
    '.....wKKKKw.....',
    '.....wwwwww.....',
    '.....wwwwww.....',
    '....wwwwwwww....',
    '...ww.wwww.ww...',
    '..ww..w..w..ww..',
  ],
];

const GAZER = [
  [
    '..WK...WK...WK..',
    '..cc...cc...cc..',
    '...c...cc...c...',
    '...cc..cc..cc...',
    '....cccccccc....',
    '...cccccccccc...',
    '..cccWWWWWWccc..',
    '..ccWWLLLKWWcc..',
    '..ccWWLKKLWWcc..',
    '..cccWWWWWWccc..',
    '..cccccccccccc..',
    '...cVbVbVbVcc...',
    '...ccVVVVVVcc...',
    '....cccccccc....',
    '......cccc......',
    '................',
  ],
  [
    '................',
    '.WK....KW....KW.',
    '.cc....cc....cc.',
    '..cc...cc...cc..',
    '...ccccccccccc..',
    '...cccccccccc...',
    '..cccWWWWWWccc..',
    '..ccWWKLLLWWcc..',
    '..ccWWLKKLWWcc..',
    '..cccWWWWWWccc..',
    '..cccccccccccc..',
    '...cVVVVVVVcc...',
    '...ccbVbVbVcc...',
    '....cccccccc....',
    '......cccc......',
    '................',
  ],
];

/**
 * Insects: a swarm, dense at its heart and thinning out, each a body with a wing, a bee or two among them; the
 * second frame has every one moved a square.
 */
function swarm(f: number): string[] {
  const rows = Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
  let seed = 0x1bc;
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) / 0x1000000;
  };
  // Each a bee: a yellow body and a black one, a wing over it - placed where the disc has room, none touching.
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 16; tries++) {
    const x = Math.floor(next() * 14);
    const y = 1 + Math.floor(next() * 14);
    if (Math.hypot(x + 1 - 8, (y - 7.5) / 0.85) > 7) continue;
    const dx = f ? [1, 0, -1, 0][placed % 4] : 0;
    const dy = f ? [0, 1, 0, -1][placed % 4] : 0;
    const bx = x + dx;
    const by = y + dy;
    if (bx < 0 || bx > 14 || by < 1 || by > 14) continue;
    let clear = true;
    for (let yy = by - 2; yy <= by + 1 && clear; yy++)
      for (let xx = bx - 1; xx <= bx + 2; xx++) if (yy >= 0 && yy < 16 && xx >= 0 && xx < 16 && rows[yy][xx] !== '.') clear = false;
    if (!clear) continue;
    rows[by][bx] = 'Y';
    rows[by][bx + 1] = 'K';
    rows[by - 1][bx + (placed % 2)] = 'W';
    placed++;
  }
  return rows.map((r) => r.join(''));
}
const INSECTS = [swarm(0), swarm(1)];

const SNAKE = [
  [
    '................',
    '.........gggg...',
    '........ggYKgg..',
    '........gggggg..',
    '........ggyy....',
    '.......ggy......',
    '.......ggy......',
    '......gggy......',
    '....ggggggggg...',
    '..ggSgggSgggSgg.',
    '.gggDDDDDDDDggg.',
    '.ggggggggggggg..',
    '..ggSgggSgggg...',
    '.gggDDDDDDDgggg.',
    '..gggggggggggg..',
    '................',
  ],
  [
    '................',
    '..........gggg..',
    '.........ggYKgg.',
    '.........ggggggR',
    '.........ggyy.R.',
    '........ggy.....',
    '.......ggy......',
    '......gggy......',
    '....ggggggggg...',
    '..ggSgggSgggSgg.',
    '.gggDDDDDDDDggg.',
    '.ggggggggggggg..',
    '..ggSgggSgggg...',
    '.gggDDDDDDDgggg.',
    '..gggggggggggg..',
    '................',
  ],
];

const MONGBAT = [
  [
    'c..............c',
    'cc....r..r....cc',
    'ccc...rrrr...ccc',
    'cVcc..rYrY..ccVc',
    'ccVcc.rrrr.ccVcc',
    '.cccccrrrrccccc.',
    '..cc.rrrrrr.cc..',
    '..c..rrrrrr..c..',
    '.....rrrrrr.....',
    '......rrrr......',
    '.....rrrrrr.....',
    '.....rr..rr.....',
    '.....rr..rr.....',
    '....rrr..rrr....',
    '................',
    '................',
  ],
  [
    '................',
    '......r..r......',
    '......rrrr......',
    '......rYrY......',
    '......rrrr......',
    '.ccccrrrrrrcccc.',
    'ccVccrrrrrrccVcc',
    'cVcc.rrrrrr.ccVc',
    'ccc..rrrrrr..ccc',
    'cc....rrrr....cc',
    'c....rrrrrr....c',
    '.....rr..rr.....',
    '.....rr..rr.....',
    '....rrr..rrr....',
    '................',
    '................',
  ],
];

const SAND_TRAP = [
  [
    '................',
    '................',
    '................',
    '....dddddddd....',
    '..dddddddddddd..',
    '.dddeeeeeeeeddd.',
    '.ddeebWbWbWbeed.',
    'ddeeDDDDDDDDeedd',
    '.ddeebWbWbWbeed.',
    '.dddeeeeeeeeddd.',
    '..dddddddddddd..',
    '....dddddddd....',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '....dddddddd....',
    '..dddddddddddd..',
    '.dddeeeeeeeeddd.',
    '.ddebWbWbWbWedd.',
    'ddeDDDDDDDDDDedd',
    'ddeDDVrrrrVDDedd',
    'ddeDDVrrrrVDDedd',
    'ddeDDDDDDDDDDedd',
    '.ddebWbWbWbWedd.',
    '.dddeeeeeeeeddd.',
    '..dddddddddddd..',
    '....dddddddd....',
    '................',
    '................',
  ],
];

const CORPSER = [
  [
    '................',
    '...c........c...',
    '...cV..c....cV..',
    '....cV.cV..cV...',
    '....cV..cV.cV...',
    '...cV...cV.cV...',
    '...cV...cV..cV..',
    '....cV.cV...cV..',
    '....cV.cV..cV...',
    '...ecV.cV..cVe..',
    '..eecVDcVDDcVee.',
    '.eeeeDDDDDDDeeee',
    'eeeeeeeeeeeeeeee',
    '.eeeeeeeeeeeeee.',
    '................',
    '................',
  ],
  [
    '................',
    '....c......c....',
    '....cV.c...cV...',
    '...cV..cV...cV..',
    '...cV.cV....cV..',
    '....cVcV...cV...',
    '....cV.cV..cV...',
    '...cV..cV...cV..',
    '....cV.cV...cV..',
    '...ecV.cV..cVe..',
    '..eecVDcVDDcVee.',
    '.eeeeDDDDDDDeeee',
    'eeeeeeeeeeeeeeee',
    '.eeeeeeeeeeeeee.',
    '................',
    '................',
  ],
];

const LURKER = [
  [
    '................',
    '................',
    '................',
    '...........gg...',
    '..........gg.g..',
    '..........gg....',
    '...........gg...',
    '.g.........gg...',
    '.gg.........gg..',
    '..g.gggggg..gg..',
    '.FgggOKSgSggggF.',
    'FBBFFFFFFFFFFBBF',
    '.FFBBBBBBBBBBFF.',
    '....FFFFFFF.....',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '..........ggg...',
    '.........gg..g..',
    '.........gg.....',
    '..........gg....',
    'g..........gg...',
    'gg.........gg...',
    '.g..gggggg..gg..',
    '.g.ggOKSgSg.gg..',
    '.FgggggggggggFF.',
    'FBBFFFFFFFFFFBBF',
    '.FFBBBBBBBBBBFF.',
    '....FFFFFFF.....',
    '................',
    '................',
  ],
];

const SHADOWLORD = [
  [
    '.......nn.......',
    '......nnnn......',
    '.....nnnnnn.....',
    '....nnDDDDnn....',
    '....nDDDDDDn....',
    '...nnDRDDRDnn...',
    '...nnDDDDDDnn...',
    '..nnnnDDDDnnnn..',
    '.nnnnnnnnnnnnnn.',
    'nnn.nnnnnnnn.nnn',
    'nn..nnnnnnnn..nn',
    'b...nnnnnnnn...b',
    '....nnnnnnnn....',
    '...nnnDnnnDnn...',
    '...nnnDnnnDnn...',
    '..nn.nn.nn.nn.n.',
  ],
  [
    '.......nn.......',
    '......nnnn......',
    '.....nnnnnn.....',
    '....nnDDDDnn....',
    'b...nDDDDDDn...b',
    'nn.nnDODDODnn.nn',
    'nnnnnDDDDDDnnnnn',
    '.nnnnnDDDDnnnnn.',
    '..nnnnnnnnnnnn..',
    '....nnnnnnnn....',
    '....nnnnnnnn....',
    '....nnnnnnnn....',
    '....nnnnnnnn....',
    '...nnnDnnnDnn...',
    '...nnnDnnnDnn...',
    '.nn.nn.nn.nn.nn.',
  ],
];

const SQUID = [
  [
    '................',
    '.......qq.......',
    '.....qqqqqq.....',
    '....qqqqqqqq....',
    '....qGqqqqqq....',
    '...qqRKqqRKqq...',
    '...qqqqqqqqqq...',
    '....qqqqqqqq....',
    '....qqqqqqqq....',
    '...qQ.qQqQ.qQ...',
    '..qQ..qQqQ..qQ..',
    '..qQ.qQ..qQ.qQ..',
    '.qQ..qQ..qQ..qQ.',
    '.qQ...qQqQ...qQ.',
    '..qQ..qQqQ..qQ..',
    '................',
  ],
  [
    '................',
    '.......qq.......',
    '.....qqqqqq.....',
    '....qqqqqqqq....',
    '....qGqqqqqq....',
    '...qqRKqqRKqq...',
    '...qqqqqqqqqq...',
    '....qqqqqqqq....',
    '....qqqqqqqq....',
    '...qQ.qQqQ.qQ...',
    '..qQ.qQ..qQ.qQ..',
    '.qQ..qQ..qQ..qQ.',
    '..qQ..qQqQ..qQ..',
    '...qQ.qQqQ.qQ...',
    '..qQ.qQ..qQ.qQ..',
    '................',
  ],
];

/** Every beast, into the sheet. */
export function beasts(t: Map<number, Sprite>): void {
  beast4(t, 0x180, SEA_HORSE[0], SEA_HORSE[1]);
  beast4(t, 0x184, SQUID[0], SQUID[1]);
  beast4(t, 0x18c, SHARK[0], SHARK[1]);
  beast4(t, 0x190, RAT[0], RAT[1]);
  beast4(t, 0x194, BAT[0], BAT[1]);
  beast4(t, 0x198, SPIDER[0], SPIDER[1]);
  beast4(t, 0x19c, WISP[0], WISP[1]);
  beast4(t, 0x1a0, SLIME[0], SLIME[1]);
  beast4(t, 0x1ac, REAPER[0], REAPER[1]);
  beast4(t, 0x1b0, GAZER[0], GAZER[1]);
  beast4(t, 0x1bc, INSECTS[0], INSECTS[1]);
  beast4(t, 0x1c8, SNAKE[0], SNAKE[1]);
  beast4(t, 0x1d0, MONGBAT[0], MONGBAT[1]);
  beast4(t, 0x1e0, SAND_TRAP[0], SAND_TRAP[1]);
  beast4(t, 0x1f4, CORPSER[0], CORPSER[1]);
  beast4(t, 0x1f8, LURKER[0], LURKER[1]);
  beast4(t, 0x1fc, SHADOWLORD[0], SHADOWLORD[1]);
}

// --- Not beasts, but drawn the same way ------------------------------------------------------------------

const SKIFF_SIDE = [
  '................',
  '................',
  '................',
  '......ll........',
  '......hh........',
  '......hh........',
  '.....oooo.A.....',
  '.....ooooA......',
  '.....oooA.......',
  'wwwwwwwAwwwwwwww',
  '.wwwwwAwwwwwwww.',
  '..wwwAwwwwwwww..',
  '...wAwwwwwwww...',
  '...A............',
  '.AA.............',
  '................',
];

/** End on: `face` is the row of the head that differs, going away (hair) or coming (a face). */
const skiffEnd = (face: string): string[] => [
  '................',
  '................',
  '................',
  '.......ll.......',
  face,
  '.......hh.......',
  '......oooo......',
  '.....oooooo.....',
  'A....oooooo....A',
  '.A.wwwwwwwwww.A.',
  '..AwwwwwwwwwwA..',
  '...wwwwwwwwww...',
  '....wwwwwwww....',
  '.....wwwwww.....',
  '................',
  '................',
];

const MOUNTED = [
  '.......ll.......',
  '......lhh.......',
  '......hhh..W....',
  '.....aaaaa.W....',
  '....uaaaaauW....',
  '....uaaaaahy....',
  '.bb..aaaaa......',
  'bbbbbbwwwbbbb...',
  'bKbbbbwwwbbbbb..',
  'bbbbbbbwbbbbb.b.',
  '..bbbbbbbbbbb.b.',
  '..bb.b...bb.b...',
  '..bb.b...bb.b...',
  '..bb.b...bb.b...',
  '..ll.l...ll.l...',
  '................',
];

const MOONSTONE = [
  '................',
  '................',
  '................',
  '................',
  '......ssss......',
  '....ssssssss....',
  '...sssWWsssss...',
  '...ssWCsssssss..',
  '..sssWCsssvsss..',
  '..sssWCssssssss.',
  '..ssssWWsssssss.',
  '...ssssssvssss..',
  '...sssssssssss..',
  '....sssssssss...',
  '......sssss.....',
  '................',
];

/** What lies about to be picked up, the regalia, and magic in flight: each a grid of sixteen, by its tile. */
const THINGS: [number, string[]][] = [
  // The party aloft on the carpet (two frames of the air under it), the moon of the night's rest, a sleeper under a
  // blanket, and the carpet lying rolled out.
  [
    0x114,
    [
      '................',
      '................',
      '......ll........',
      '.....lhh........',
      '.....hhh........',
      '....bbbbb.......',
      '...abbbbba......',
      '...abbbbbah.....',
      '....bbbbbb......',
      '....wwwwwwww....',
      '....wwwwwwwwkk..',
      '.YrrrrrrrrrrrrY.',
      '.YryyyyyyyyyyrY.',
      '..TTT.TTTT.TTT..',
      '................',
      '................',
    ],
  ],
  [
    0x115,
    [
      '................',
      '................',
      '......ll........',
      '.....lhh........',
      '.....hhh........',
      '....bbbbb.......',
      '...abbbbba......',
      '...abbbbbah.....',
      '....bbbbbb......',
      '....wwwwwwww....',
      '....wwwwwwwwkk..',
      '.YrrrrrrrrrrrrY.',
      '.YryyyyyyyyyyrY.',
      '.TTT.TTTT.TTT...',
      '................',
      '................',
    ],
  ],
  [
    0x119,
    [
      '................',
      '.......bbbb.....',
      '.....bbbb.......',
      '....bbbb........',
      '...bbbb.........',
      '...bbbb.........',
      '..bbbbb.........',
      '..bbbbb.........',
      '..bbbbb.........',
      '..bbbbbb........',
      '...bbbbbb.....b.',
      '...bbbbbbbb.bbb.',
      '....bbbbbbbbbb..',
      '.....bbbbbbbb...',
      '.......bbbb.....',
      '................',
    ],
  ],
  [
    0x11a,
    [
      '................',
      '................',
      '................',
      '....lll.........',
      '...lllll........',
      '...lhhhh........',
      '...hhhhh........',
      '...hhhhh........',
      '..uuuuuuuuuuuuu.',
      '..uuuuuuuuuuuuu.',
      '..uuuuuuuuuuuuu.',
      '..uuuuuuuuuuuuu.',
      '..uuuuuuuuuuuuu.',
      '..uuuuuuuuuuuuu.',
      '................',
      '................',
    ],
  ],
  [
    0x11b,
    [
      '................',
      '...Y.Y.Y.Y.Y....',
      '...rrrrrrrrrr...',
      '...ryyyyyyyyr...',
      '...ryrrrrrryr...',
      '...ryrmmmmryr...',
      '...ryrmmmmryr...',
      '...ryrmmmmryr...',
      '...ryrmmmmryr...',
      '...ryrmmmmryr...',
      '...ryrmmmmryr...',
      '...ryrrrrrryr...',
      '...ryyyyyyyyr...',
      '...rrrrrrrrrr...',
      '...Y.Y.Y.Y.Y....',
      '................',
    ],
  ],
  [
    0x102,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......yyyy......',
      '.....yyyyyy.....',
      '....yyYyyyyy....',
      '..yyyyyyyyyyyy..',
      '.yyyYyyyyyyYyyy.',
      '.yyyyyyyyyyyyyy.',
      '..yyyyyyyyyyyy..',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x103,
    [
      '................',
      '................',
      '.......ll.......',
      '.......ll.......',
      '.......bb.......',
      '.......bb.......',
      '......bbbb......',
      '.....zzzzzz.....',
      '....zzWzzzzz....',
      '....zWzzzzzz....',
      '....zzzzzzzz....',
      '....zzzzzzzz....',
      '.....zzzzzz.....',
      '......zzzz......',
      '................',
      '................',
    ],
  ],
  [
    0x104,
    [
      '................',
      '................',
      '................',
      '.jjjjjjjjjjjjjj.',
      '...jjjjjjjjjj...',
      '..jjlljllljjjj..',
      '..jjjjjjjjjjjj..',
      '..jjllljlllljj..',
      '..jjjjjjjjjjjj..',
      '..jjlllljlljjj..',
      '..jjjjjjjjjjjj..',
      '...jjjjjjjjjj...',
      '.jjjjjjjjjjjjjj.',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x105,
    [
      '................',
      '.............aa.',
      '............aaa.',
      '...........aaa..',
      '..........aaa...',
      '.........aaa....',
      '........aaa.....',
      '...y...aaa......',
      '....y.aaa.......',
      '....yyaa........',
      '.....yy.........',
      '....ll.yy.......',
      '...ll...........',
      '.yyl............',
      '.yy.............',
      '................',
    ],
  ],
  [
    0x106,
    [
      '................',
      '................',
      '..aaaaaaaaaaaa..',
      '..abbbbrrbbbba..',
      '..abbbbrrbbbba..',
      '..arrrrrrrrrra..',
      '..arrrrrrrrrra..',
      '..abbbbrrbbbba..',
      '..abbbbrrbbbba..',
      '...abbbrrbbba...',
      '...abbbrrbbba...',
      '....abbrrbba....',
      '.....abrrba.....',
      '......aaaa......',
      '................',
      '................',
    ],
  ],
  [
    0x107,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '..yyy...........',
      '.yy.yy..........',
      '.y...yyyyyyyyy..',
      '.yy.yy....y.yy..',
      '..yyy.....y.yy..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x108,
    [
      '................',
      '................',
      '................',
      '.....mmmmmm.....',
      '....mmWCmmmm....',
      '...mmWCmmmmmm...',
      '...mCCmmmmmmm...',
      '....mmmmmmmm....',
      '.....mmmmmm.....',
      '......mmmm......',
      '.......mm.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x109,
    [
      '................',
      '.......rr.......',
      '......rrrr......',
      '.....aaaaaa.....',
      '....aaaaaaaa....',
      '...aaaaaaaaaa...',
      '...aaaaaaaaaa...',
      '...aKKKKaKKKa...',
      '...aaaaaaaaaa...',
      '...aaaa..aaaa...',
      '...aaa....aaa...',
      '...aaa....aaa...',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x10a,
    [
      '................',
      '................',
      '................',
      '.......RR.......',
      '......RVVR......',
      '.....yyRRyy.....',
      '....yy....yy....',
      '....y......y....',
      '....y......y....',
      '....yy....yy....',
      '.....yyyyyy.....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x10b,
    [
      '................',
      '................',
      '..aaa......aaa..',
      '..aaaaa..aaaaa..',
      '..aaaaaaaaaaaa..',
      '...aaaaaaaaaa...',
      '....aaaaaaaa....',
      '....aaaaaaaa....',
      '....aaaaaaaa....',
      '....aaaaaaaa....',
      '....llllyyll....',
      '....aaaaaaaa....',
      '...aaaaaaaaaa...',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x10c,
    [
      '................',
      '....y.y.y.y.....',
      '...y.......y....',
      '...y.......y....',
      '....y.....y.....',
      '.....y...y......',
      '......yyy.......',
      '......y.y.......',
      '......yyy.......',
      '.....yyyyy......',
      '.......y........',
      '.......y........',
      '.......y........',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x10d,
    [
      '................',
      '.......O........',
      '......ORO.......',
      '......RYR.......',
      '.....RRYOR......',
      '.....ROYOR......',
      '......RRR.......',
      '......lll.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '.......ww.......',
      '................',
      '................',
    ],
  ],
  [
    0x10f,
    [
      '................',
      '................',
      '................',
      '................',
      '....llllll......',
      '...llAlllll.....',
      '...lAlllllll....',
      '...lllllllllbb.b',
      '....llllllbbbbb.',
      '.....lllll..bb.b',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x116,
    [
      '................',
      '................',
      '................',
      '......bbbb......',
      '....bbbbbbbb....',
      '...bbWWbbbbbb...',
      '...bWWbbbbbbb...',
      '..bbWbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '...bbbbbbbbbb...',
      '...bbbbbbbbbb...',
      '....bbbbbbbb....',
      '......bbbb......',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x11f,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....rrrrrrrr....',
      '..rrbbbrrrrrrr..',
      '.rrbKbKbrbbbbrr.',
      '.rrrbbbrrrbrrrr.',
      '..rrbWbrbbbbrr..',
      '....rrrrrrrr....',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x1b5,
    [
      '................',
      '................',
      '................',
      '..y....yy....y..',
      '..yy...yy...yy..',
      '..yyy.yyyy.yyy..',
      '..yyyyyyyyyyyy..',
      '..yRyyyCCyyyRy..',
      '..yyyyyyyyyyyy..',
      '..yyyyyyyyyyyy..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x1b6,
    [
      '................',
      '..........rrr...',
      '.........rRrrr..',
      '.........rrrrr..',
      '.........yrrr...',
      '........yy......',
      '.......yy.......',
      '......yy........',
      '.....yy.........',
      '....yy..........',
      '...yy...........',
      '..yy............',
      '.yy.............',
      '.y..............',
      '................',
      '................',
    ],
  ],
  [
    0x1b7,
    [
      '................',
      '....y.y.y.y.....',
      '...y.......y....',
      '...y.......y....',
      '....y.....y.....',
      '.....y...y......',
      '......yyyy......',
      '.....yvvvvy.....',
      '.....yvWvvy.....',
      '.....yvvvvy.....',
      '......yvvy......',
      '.......yy.......',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x1d4,
    [
      '................',
      '.......mm.......',
      '.......mm.......',
      '..m....CC....m..',
      '...m..mCCm..m...',
      '....mmCCCCmm....',
      '.....CCWWCC.....',
      '.mmCCCWWWWCCCmm.',
      '.mmCCCWWWWCCCmm.',
      '.....CCWWCC.....',
      '....mmCCCCmm....',
      '...m..mCCm..m...',
      '..m....CC....m..',
      '.......mm.......',
      '.......mm.......',
      '................',
    ],
  ],
  [
    0x1d5,
    [
      '................',
      '................',
      '................',
      '......RRRR......',
      '....RRRRRRRR....',
      '...RROOOORRRR...',
      '...ROOYYOORRR...',
      '..RROYYWYOORRR..',
      '..RROYYYYOORRR..',
      '...ROOYYOORRR...',
      '...RROOOORRRR...',
      '....RRRRRRRR....',
      '......RRRR......',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x1d6,
    [
      '................',
      '................',
      '................',
      '................',
      '......mmmm......',
      '.....mmmmmm.....',
      '....mmCCmmmm....',
      '....mCWCmmmm....',
      '....mmCCmmmm....',
      '....mmmmmmmm....',
      '.....mmmmmm.....',
      '......mmmm......',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  [
    0x1d7,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......mmmm......',
      '.....mCCmmm.....',
      '.....mCWmmm.....',
      '.....mmmmmm.....',
      '......mmmm......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
];

/** The skiff and its oarsman four ways, the moonstone, and the things. */
export function oddments(t: Map<number, Sprite>): void {
  const side = beast(SKIFF_SIDE);
  const away = beast(skiffEnd('.......ll.......'));
  const toward = beast(skiffEnd('.......hh.......'));
  t.set(0x128, away.rim());
  t.set(0x129, side.flipX().rim());
  t.set(0x12a, toward.rim());
  t.set(0x12b, side.clone().rim());
  // Mounted, west and east: horse and rider drawn as one, so both are whole within the tile.
  t.set(0x112, beast(MOUNTED).rim());
  t.set(0x113, beast(MOUNTED).flipX().rim());
  t.set(0x1b4, beast(MOONSTONE).rim());
  for (const [tile, rows] of THINGS) t.set(tile, beast(rows).rim());
}
