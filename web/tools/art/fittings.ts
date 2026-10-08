/**
 * fittings.ts
 *
 * What stands in Britannia's rooms and streets, drawn to the art direction
 * (docs/art-brief.md §0): on the grid of sixteen the figures are drawn on,
 * in their front three-quarter view, filling the square, on a clear ground
 * - the game lays under each the floor of the squares around it - and
 * rimmed by the build like everything else that stands.
 *
 * A grid is sixteen rows of sixteen characters. An upper-case letter or a
 * figure is a colour as it is; a lower-case letter is a material, toned
 * along its run as the creatures are (the first square light, the last in
 * shade). '.' is clear.
 */

import { Sprite, type Colour } from './draw.ts';
import { P } from './palette.ts';
import type { Group } from './build.ts';
import { rubble } from './stones.ts';

/** Light, base and shade. */
const TONED: Record<string, [Colour, Colour, Colour]> = {
  w: [P.woodLight, P.wood, P.woodShade],
  r: [P.redLight, P.red, P.redShade],
  u: [P.guardLight, P.guard, P.guardShade],
  s: [P.stoneLight, P.stone, P.stoneShade],
  i: [P.ironLight, P.iron, P.ironShade],
  y: [P.goldLight, P.gold, P.goldShade],
};

const FLAT: Record<string, Colour> = {
  // Wood, lit to dark: a top in the light, the top, a front, a shaded side, the darkest line.
  T: P.leatherLight,
  N: P.woodLight,
  P: P.wood,
  E: P.woodShade,
  D: P.plankShade,
  // Stone, iron, gold.
  S: P.stoneLight,
  G: P.stone,
  H: P.stoneShade,
  L: P.ironLight,
  J: P.iron,
  I: P.ironShade,
  Y: P.goldLight,
  M: P.gold,
  // Fire and water.
  R: P.fire,
  O: P.orange,
  F: P.foam,
  B: P.shallowLight,
  U: P.water,
  V: P.waterShade,
  // Cloth: a red cushion, a blue blanket, white linen.
  Q: P.redLight,
  C: P.red,
  Z: P.guardLight,
  A: P.guard,
  X: P.guardShade,
  '1': P.boneLight,
  '2': P.bone,
  '3': P.boneShade,
  W: P.white,
  K: P.black,
  // Green of a leaf or a brew, teal paint, royal purple, charcoal, terracotta, dark red, dark gold, magic blue.
  '4': P.leafLight,
  '5': P.leaf,
  '6': P.leafShade,
  '7': P.tealLight,
  '8': P.teal,
  '9': P.tealShade,
  '<': P.royalLight,
  '=': P.royal,
  '>': P.royalShade,
  '-': P.charcoalLight,
  '@': P.charcoal,
  '+': P.charcoalShade,
  '{': P.orangeShade,
  '}': P.redShade,
  _: P.goldShade,
  '!': P.magicLight,
  '|': P.magic,
  ':': P.magicShade,
  '^': P.person,
  '%': P.dirtLight,
  '*': P.dirt,
  '#': P.dirtShade,
  // The mountains' rock.
  '(': P.rockLight,
  ')': P.rock,
  ']': P.rockShade,
  // The night blue of a banner.
  '&': P.moonLight,
  $: P.moon,
};

/** A fitting from a grid of sixteen: clear where it is not, marked to be doubled as drawn, and rimmed. */
export function fitting(rows: string[]): Sprite {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`a fitting is sixteen by sixteen:\n${rows.join('\n')}`);
  const s = new Sprite();
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      let c = FLAT[ch];
      if (c === undefined) {
        const m = TONED[ch];
        if (!m) throw new Error(`no colour for '${ch}'`);
        let from = x;
        while (from > 0 && row[from - 1] === ch) from--;
        let to = x;
        while (to < 15 && row[to + 1] === ch) to++;
        c = to - from + 1 < 3 ? m[1] : x === from ? m[0] : x === to ? m[2] : m[1];
      }
      s.rect(x * 2, y * 2, 2, 2, c);
    }
  });
  s.rim();
  s.blocky = true;
  return s;
}

/** The same grid mirrored left to right (a chair facing west, a door hung the other way). */
const mirrored = (rows: string[]): string[] => rows.map((r) => [...r].reverse().join(''));

// --- Seats ------------------------------------------------------------------------------------------------

/** A chair facing us (south): its back behind, its cushion, its front legs. */
const CHAIR_SOUTH = [
  '................',
  '....ENNNNNNE....',
  '....EPPPPPPE....',
  '....EP.PP.PE....',
  '....EP.PP.PE....',
  '....EP.PP.PE....',
  '....EPPPPPPE....',
  '...QQQQQQQQQQ...',
  '..QCCCCCCCCCCE..',
  '..CCCCCCCCCCCE..',
  '..TNNNNNNNNNNE..',
  '..PPPPPPPPPPPE..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..EE........EE..',
];

/** A chair facing away (north): its back nearest us, the cushion showing either side of it. */
const CHAIR_NORTH = [
  '................',
  '....ENNNNNNE....',
  '....EPPPPPPE....',
  '....EPPPPPPE....',
  '....EPPPPPPE....',
  '...QEPPPPPPEQ...',
  '..QCEPPPPPPECE..',
  '..CCEPPPPPPECE..',
  '..TNEPPPPPPENE..',
  '..PPEPPPPPPEPE..',
  '..PPEPPPPPPEPE..',
  '..PEEEEEEEEEPE..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..EE........EE..',
];

/** A chair facing east: its back on the west, the seat running out toward the east. */
const CHAIR_EAST = [
  '................',
  '...EN...........',
  '...EP...........',
  '...EP...........',
  '...EP...........',
  '...EP...........',
  '...EP...........',
  '...EPQQQQQQQQ...',
  '...EPCCCCCCCCE..',
  '...EPCCCCCCCCE..',
  '...ENTNNNNNNNE..',
  '...EPPPPPPPPPE..',
  '...EP.......PE..',
  '...EP.......PE..',
  '...EP.......PE..',
  '...EE.......EE..',
];

// --- Tables -----------------------------------------------------------------------------------------------

/**
 * A long table's top and front, as one square of it: the west end (0x94), a middle (0x95) or the east end (0x96).
 * The game lays a table's middle squares with food or light as it pleases (0x9a, 0x9b, 0x9c, 0xbe, always between
 * the two ends), so a dish is drawn on a middle.
 */
function table(part: 'w' | 'm' | 'e', dish: 'bare' | 'roast' | 'bread' | 'fruit' | 'candles' | 'candles-flicker' = 'bare'): string[] {
  const x0 = part === 'w' ? 1 : 0;
  const x1 = part === 'e' ? 14 : 15;
  const row = (inside: string, ends = inside): string =>
    Array.from({ length: 16 }, (_, x) =>
      x < x0 || x > x1 ? '.' : (x === x0 && part === 'w') || (x === x1 && part === 'e') ? ends : inside,
    ).join('');
  const rows = [
    '................',
    '................',
    '................',
    '................',
    row('T', 'E'),
    row('N', 'E'),
    row('N', 'E'),
    row('N', 'E'),
    row('N', 'E'),
    row('P', 'E'),
    row('E'),
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  // Board ends across the top, so it reads as planks.
  const seams = part === 'w' ? [6, 12] : part === 'm' ? [3, 10] : [5, 11];
  for (const sx of seams) rows[6] = rows[6].slice(0, sx) + 'P' + rows[6].slice(sx + 1);
  // Legs at the ends, two squares wide.
  const legs = part === 'w' ? [x0 + 1] : part === 'e' ? [x1 - 2] : [];
  for (let y = 11; y < 16; y++) {
    let r = rows[y];
    for (const lx of legs) r = r.slice(0, lx) + (y === 15 ? 'EE' : 'PE') + r.slice(lx + 2);
    rows[y] = r;
  }
  // What is laid on it, standing on the top (a string's '.' leaves the table as it is).
  const put = (y: number, x: number, what: string): void => {
    rows[y] = [...rows[y]].map((c, k) => (k >= x && k < x + what.length && what[k - x] !== '.' ? what[k - x] : c)).join('');
  };
  if (dish === 'roast') {
    put(6, 1, '1223');
    put(3, 7, '.OO.');
    put(4, 6, 'OOOOE');
    put(5, 5, '122223');
    put(6, 12, '123');
  } else if (dish === 'bread') {
    put(3, 3, 'YM');
    put(4, 3, 'YM');
    put(5, 3, 'YM');
    put(4, 8, 'TNNE');
    put(5, 7, 'TNNNNE');
    put(6, 12, '123');
  } else if (dish === 'fruit') {
    put(6, 1, '123');
    put(3, 7, 'Q.R.');
    put(4, 6, 'CQYRM');
    put(5, 6, '12223');
    put(3, 12, 'YM');
    put(4, 12, 'YM');
    put(5, 12, 'YM');
  } else if (dish === 'candles' || dish === 'candles-flicker') {
    // Three flames: a flicker is the same flames a shade redder, one leaning (the second frame).
    put(0, 5, dish === 'candles' ? 'O..O..O' : 'R...O.R');
    put(1, 5, dish === 'candles' ? 'Y..Y..Y' : 'O..YO.O');
    put(2, 5, '1..1..1');
    put(3, 5, 'MYYMYYM');
    put(4, 8, 'M');
    put(5, 7, 'YMM');
  }
  return rows;
}

// --- The bed ----------------------------------------------------------------------------------------------

/** The bed's head: its board, the pillow, the blanket turned down, its front hanging. */
const BED_HEAD = [
  '................',
  '.EN.............',
  '.EPN............',
  '.EPP............',
  '.EPP............',
  '.EPP1111111ZZZZZ',
  '.EPP1222222AAAAA',
  '.EPP2222223AAAAA',
  '.EPP3333333AAAAA',
  '.EPPZZZZZZZZZZZZ',
  '.EPPAAAAAAAAAAAA',
  '.EPPAAAAAAAAAAAA',
  '.EPPXXXXXXXXXXXX',
  '.EPPEEEEEEEEEEEE',
  '.EP.............',
  '.EE.............',
];

/** The bed's foot: the blanket running on to the footboard. */
const BED_FOOT = [
  '................',
  '................',
  '................',
  '................',
  '............TN..',
  'ZZZZZZZZZZZZEPE.',
  'AAAAAAAAAAAAEPE.',
  'AAAAAAAAAAAAEPE.',
  'AAAAAAAAAAAAEPE.',
  'ZZZZZZZZZZZZEPE.',
  'AAAAAAAAAAAAEPE.',
  'AAAAAAAAAAAAEPE.',
  'XXXXXXXXXXXXEPE.',
  'EEEEEEEEEEEEEPE.',
  '............EPE.',
  '............EEE.',
];

// --- Fire -------------------------------------------------------------------------------------------------

/** A brazier: an iron bowl on three legs, burning, in two frames. */
const BRAZIER = [
  [
    '................',
    '......R.........',
    '.....RR...R.....',
    '....RROR.RR.....',
    '....ROORRROR....',
    '...RROYYOORR....',
    '...ROYYYYOORR...',
    '..LJJJJJJJJJJI..',
    '..IJJJJJJJJJJI..',
    '...IJJJJJJJJI...',
    '....IIIIIIII....',
    '.....J..J..J....',
    '....J...J...J...',
    '...J....J....J..',
    '..J.....J.....J.',
    '.II.....I.....II',
  ],
  [
    '................',
    '.........R......',
    '.....R...RR.....',
    '.....RR.RORR....',
    '....RORRROOR....',
    '....RROOYYORR...',
    '...RROYYYYOR....',
    '..LJJJJJJJJJJI..',
    '..IJJJJJJJJJJI..',
    '...IJJJJJJJJI...',
    '....IIIIIIII....',
    '.....J..J..J....',
    '....J...J...J...',
    '...J....J....J..',
    '..J.....J.....J.',
    '.II.....I.....II',
  ],
];

// --- Water ------------------------------------------------------------------------------------------------

/**
 * The fountain: a stone basin, its jet rising from a column and falling either side. The game shows its four tiles
 * in turn, so the four frames move: the jet pulses, the drops run down the arcs, the ripples cross the basin and
 * the water splashes where it lands.
 */
function fountain(f: number): string[] {
  const rows = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......SH.......',
    '.......SH.......',
    '......SGGH......',
    '.SSSSSSSSSSSSSH.',
    'SGUUUUUUUUUUUUGH',
    'SGUUUUUUUUUUUUGH',
    'GGGGGGGGGGGGGGGH',
    'HGGGGGGGGGGGGGHH',
    '.HHHHHHHHHHHHHH.',
    '................',
  ];
  const put = (y: number, x: number, c: string): void => {
    if (y >= 0 && y < 16 && x >= 0 && x < 16) rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
  };
  // The jet: up to its height (a square higher, then lower, as it pulses), white at its crown.
  const top = [1, 0, 1, 2][f];
  for (let y = top; y < 6; y++) {
    put(y, 7, y === top ? 'W' : 'F');
    put(y, 8, y === top ? 'F' : 'B');
  }
  // The arcs, bowing out to the rim: foam where a drop is (a square further down each frame), light water between.
  const out = [1, 2, 3, 4, 5, 5, 6, 6];
  for (let k = 0; k < out.length; k++) {
    const y = top + 1 + k;
    if (y > 8) break;
    const drop = (k - f + 8) % 4 === 0 ? 'W' : k % 2 ? 'B' : 'F';
    put(y, 7 - out[k], drop);
    put(y, 8 + out[k], drop);
  }
  // Ripples crossing the basin, and splashes at the rim where the arcs come down.
  for (const x of [3, 7, 11]) {
    put(10, ((x + f) % 12) + 2, 'B');
    put(11, ((x + 6 - f + 12) % 12) + 2, 'B');
  }
  if (f % 2 === 0) {
    put(8, 1, 'F');
    put(8, 14, 'F');
  } else {
    put(9, 1, 'W');
    put(9, 14, 'W');
  }
  return rows;
}

/** A grid turned a quarter clockwise (what faces north then faces east). */
const turned = (rows: string[]): string[] =>
  rows.map((_, y) =>
    rows
      .map((r) => r[y])
      .reverse()
      .join(''),
  );

/**
 * A cannon, seen from above as the EGA tile has it (the one exception to the three-quarter view: a barrel
 * pointed at us cannot be told from one pointed away). Facing north: the muzzle at the top, the carriage's red
 * wheels either side of the breech. The other facings are this one turned.
 */
const CANNON = [
  '................',
  '......LJJI......',
  '......L++I......',
  '......LJJI......',
  '......LJJI......',
  '......LJJI......',
  '..QC}.LJJI.QC}..',
  '..QC}ELJJIEQC}..',
  '..QC}ELJJIEQC}..',
  '..QC}.LJJI.QC}..',
  '.....LJJJJI.....',
  '.....LJJJJI.....',
  '......IJJI......',
  '.......JI.......',
  '................',
  '................',
];

/** A log fallen east to west, seen from above as the EGA tile has it: its bark, stubs of branches, a cut end. */
const LOG = [
  '................',
  '................',
  '................',
  '................',
  '....E.....E.....',
  '...EPE...EPE....',
  '.EEEEEEEEEEEEE..',
  'ENNNNNNNNNNNNNTT',
  'EPPPPEPPPPPEPPN_',
  'EPPPPPPPEPPPPPN_',
  'EEEEEEEEEEEEEETT',
  '...EPE....EPE...',
  '....E......E....',
  '................',
  '................',
  '................',
];

// --- Streets ----------------------------------------------------------------------------------------------

/** A lamp post: a lantern lit on an iron post, as tall as the square. */
const LAMP = [
  '......KKKK......',
  '.....KIIIIK.....',
  '.....IYYYYI.....',
  '.....IYWWYI.....',
  '.....IYYYYI.....',
  '.....KIIIIK.....',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '.......JI.......',
  '......JJII......',
  '.....IIIIII.....',
];

/** A shop's sign: a board hung by its chains, its emblem on a dark panel. */
function sign(emblem: string[]): string[] {
  const rows = [
    '................',
    '...I........I...',
    '...I........I...',
    '.ETTTTTTTTTTTTE.',
    '.EPPPPPPPPPPPPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPDDDDDDDDDDPE.',
    '.EPPPPPPPPPPPPE.',
    '.EEEEEEEEEEEEEE.',
    '................',
  ];
  // The emblem, eight squares by six, laid in the panel.
  emblem.forEach((line, y) => {
    const r = rows[6 + y];
    const inner = [...line].map((c, x) => (c === '.' ? r[4 + x] : c)).join('');
    rows[6 + y] = r.slice(0, 4) + inner + r.slice(12);
  });
  return rows;
}

/** The inn's emblem: a bed. */
const INN = ['........', '12......', '22AAAAAA', '33XXXXXX', 'EEEEEEEE', 'E......E'];

/** The other shops' emblems, by their signs' tiles. */
const EMBLEMS: Record<number, string[]> = {
  0xf0: ['L.LJJI.I', 'LLJ}}JII', '.LJ}}JI.', '.LJJJJI.', '..LJJI..', '........'], // armour
  0xf1: ['...YM...', 'YMMYMMM_', 'Y..YM..M', 'YM.YM.M_', '__.YM.__', '..YYMM..'], // scales
  0xf2: ['......L.', '.....LJ.', '....LJ..', '.YMLJ...', '..EM....', '.E......'], // a sword
  0xf3: ['...YM...', '..Y..M..', '...YM...', '.YYYMMM.', '...YM...', '...YM...'], // the ankh
  0xf4: ['.LJ..JI.', '.LJ..JI.', '.LJ..JI.', '.LJ..JI.', '..LJJI..', '........'], // a horseshoe
  0xf5: ['.YMM....', 'Y..M....', '.YMMMMMM', '......M.', '.....MM.', '........'], // a key
  0xf6: ['.1111...', '.YMMM_..', '.YMMM__.', '.YMMM_._', '.YMMM__.', '.____...'], // a tankard
  0xf7: ['...12...', '...13...', '..4556..', '.455556.', '.455556.', '..6666..'], // a potion
  0xf9: ['...1....', '...12...', '...122..', '...1223.', 'EPPPPPPE', '.EPPPPE.'], // a ship
};

// --- Doors ------------------------------------------------------------------------------------------------

/** A door in its stone frame, barred with iron, its ring on the right; with a lock plate if `locked`. */
function door(locked: boolean): string[] {
  const rows = [
    'SSSSSSSSSSSSSSSH',
    'SGGGGGGGGGGGGGGH',
    'SGENNNNNNNNNNEGH',
    'SGEPPEPPEPPEPEGH',
    'SGEPPEPPEPPEPEGH',
    'SGIIIIIIIIIIIIGH',
    'SGEPPEPPEPPEPEGH',
    'SGEPPEPPEPPEPEGH',
    'SGEPPEPPEPPYPEGH',
    'SGEPPEPPEPYPYEGH',
    'SGEPPEPPEPPYPEGH',
    'SGIIIIIIIIIIIIGH',
    'SGEPPEPPEPPEPEGH',
    'SGEPPEPPEPPEPEGH',
    'SGEEEEEEEEEEEEGH',
    'SHHHHHHHHHHHHHHH',
  ];
  if (locked) {
    rows[7] = 'SGEPPEPPEYMMPEGH';
    rows[8] = 'SGEPPEPPEYKMPEGH';
    rows[9] = 'SGEPPEPPEYKMPEGH';
    rows[10] = 'SGEPPEPPEMMMPEGH';
  }
  return rows;
}

// --- Rooms: furniture -------------------------------------------------------------------------------------

/** A lectern, its book open. */
const LECTERN = [
  '................',
  '................',
  '...1111.1111....',
  '..12222K122223..',
  '..1K2K21K2K2K3..',
  '..122221222223..',
  '..ETTTTTTTTTTE..',
  '...EPPPPPPPPE...',
  '....EPPPPPPE....',
  '......EPPE......',
  '......EPPE......',
  '......EPPE......',
  '......EPPE......',
  '....EEPPPPEE....',
  '...EPPPPPPPPE...',
  '...EEEEEEEEEE...',
];

/** A barrel standing, its lid and hoops. */
const BARREL = [
  '................',
  '................',
  '....EEEEEEEE....',
  '...ENNNNNNNNE...',
  '...ENTTTTTTNE...',
  '...ENNNNNNNNE...',
  '..EJJJJJJJJJJE..',
  '..ENPPPPPPPPPE..',
  '..ENPPEPPEPPPE..',
  '..ENPPEPPEPPPE..',
  '..ENPPEPPEPPPE..',
  '..EJJJJJJJJJJE..',
  '..ENPPPPPPPPPE..',
  '...ENPEPPEPPE...',
  '...EEEEEEEEEE...',
  '................',
];

/** A millstone lying on the floor, its eye in the middle. */
const MILLSTONE = [
  '................',
  '................',
  '................',
  '.....SSSSSS.....',
  '...SSGGGGGGSS...',
  '..SGGGGGGGGGGH..',
  '.SGGGGG++GGGGGH.',
  '.SGGGG++++GGGGH.',
  '.SGGGGG++GGGGGH.',
  '..SGGGGGGGGGGH..',
  '..HGGGGGGGGGGH..',
  '...HHGGGGGGHH...',
  '.....HHHHHH.....',
  '................',
  '................',
  '................',
];

/** A washstand: a basin of water on a wooden stand. */
const WASHSTAND = [
  '................',
  '................',
  '................',
  '....SSSSSSSS....',
  '...SUUUUUUUUH...',
  '...SBBUUUUUUH...',
  '....HGGGGGGH....',
  '.....HGGGGH.....',
  '...ETTTTTTTTE...',
  '...EPPPPPPPPE...',
  '...EPE....EPE...',
  '...EPE....EPE...',
  '...EPE....EPE...',
  '...EPE....EPE...',
  '...EPE....EPE...',
  '...EEE....EEE...',
];

/** A telescope on its tripod, looking up at the sky. */
const TELESCOPE = [
  '............YM..',
  '..........YMJI..',
  '........YMJI....',
  '......LJJI......',
  '....LJJI........',
  '...MJI..........',
  '......E.........',
  '......EE........',
  '.....E.E........',
  '....E..E........',
  '....E...E.......',
  '...E....E.......',
  '...E.....E......',
  '..E......E......',
  '..E.......E.....',
  '.EE.......EE....',
];

/** Shelves of books, jars and pots. */
const SHELVES = [
  '.EEEEEEEEEEEEEE.',
  '.ETTTTTTTTTTTTE.',
  '.EP<A5C8Y=QPPPE.',
  '.EP<A5C8Y=QPPPE.',
  '.EEEEEEEEEEEEEE.',
  '.EP1227MM17PPPE.',
  '.EP2238MM28PPPE.',
  '.EEEEEEEEEEEEEE.',
  '.EPA8C=5QYM<PPE.',
  '.EPA8C=5QYM<PPE.',
  '.EEEEEEEEEEEEEE.',
  '.EP4OO5PPO{3PPE.',
  '.EP56O{PPO{3PPE.',
  '.EEEEEEEEEEEEEE.',
  '.EPE........EPE.',
  '.EEE........EEE.',
];

/** A palm in a pot. */
const PALM = [
  '.....4...4......',
  '..4..45.45..4...',
  '...45.545.456...',
  '.4..5545556.....',
  '..455.555.5654..',
  '.45...555...56..',
  '.5....E5E....6..',
  '......EPE.......',
  '......EPE.......',
  '....OOOOOOOO....',
  '....{OOOOOO{....',
  '.....OOOOOO.....',
  '.....{OOOO{.....',
  '......{{{{......',
  '................',
  '................',
];

/** One half of a wide bookcase (west or east): its books run on into the other half. */
function bookcase(east: boolean): string[] {
  const books = ['<A5C8Y=QA5C8Y=Q<', 'A8C=5QYM<5A8C=5Q', 'C=5QYM<A8C=5QY5A'];
  const shelfRow = (b: string): string => (east ? 'PP' + b.slice(0, 12) + 'EE' : 'EP' + b.slice(0, 12) + 'PP');
  const edge = (fill: string): string => (east ? fill.repeat(14) + 'EE' : 'EE' + fill.repeat(14));
  return [
    edge('E'),
    edge('T'),
    shelfRow(books[0]),
    shelfRow(books[0]),
    edge('E'),
    shelfRow(books[1]),
    shelfRow(books[1]),
    edge('E'),
    shelfRow(books[2]),
    shelfRow(books[2]),
    edge('E'),
    shelfRow(books[0].slice(3) + books[0].slice(0, 3)),
    shelfRow(books[0].slice(3) + books[0].slice(0, 3)),
    edge('E'),
    east ? '...........EPE..' : '..EPE...........',
    east ? '...........EEE..' : '..EEE...........',
  ];
}

// --- Rooms: the kitchen and the hearth --------------------------------------------------------------------

/** The stove, its fire in the door and smoke at its chimney, in two frames. */
function stove(f: number): string[] {
  return [
    f ? '.........H.G....' : '..........G.H...',
    f ? '..........HG....' : '.........GH.....',
    '..........JI....',
    '...QQQQQQQJIQ...',
    '..QCCCCCCCCCCC}.',
    '..QC+++++++CCC}.',
    f ? '..QC+ROYOR+CCC}.' : '..QC+ORYRO+CCC}.',
    f ? '..QC+RORRO+CCC}.' : '..QC+OROOR+CCC}.',
    '..QC+++++++CCC}.',
    '..QCCCCCCCCCCC}.',
    '..}}}}}}}}}}}}}.',
    '...J........J...',
    '...J........J...',
    '..II........II..',
    '................',
    '................',
  ];
}

/** The cauldron over its fire, the brew bubbling and steaming, in two frames. */
function cauldron(f: number): string[] {
  return [
    '................',
    f ? '....G..H...G....' : '.....H..G..H....',
    f ? '.....H..G.H.....' : '....G..H...G....',
    '...LJJJJJJJJI...',
    f ? '..L5545554455I..' : '..L5555445545I..',
    '..JJJJJJJJJJJI..',
    '..IJJJJJJJJJJI..',
    '..IJJJJJJJJJJI..',
    '...IJJJJJJJJI...',
    '....IIIIIIII....',
    f ? '...R.ORYRO.R....' : '....RO.RYOR.R...',
    f ? '..RORYYYYOROR...' : '..ORYOYYYROR....',
    '..EEPEEPPEEPE...',
    '................',
    '................',
    '................',
  ];
}

/** The fireplace in its wall: a stone surround, a mantel, logs and fire, in two frames. */
function fireplace(f: number): string[] {
  return [
    'SSSSSSSSSSSSSSSH',
    'SGGGGGGGGGGGGGGH',
    'STTTTTTTTTTTTTTE',
    'SNNNNNNNNNNNNNNE',
    'SGH++++++++++SGH',
    'SGH++++++++++SGH',
    f ? 'SGH++++R+++++SGH' : 'SGH+++++R++++SGH',
    f ? 'SGH+++RR++R++SGH' : 'SGH+++R+RR+++SGH',
    f ? 'SGH++RORRRO++SGH' : 'SGH+++RORRO++SGH',
    f ? 'SGH++ROYYORR+SGH' : 'SGH++RROYYOR+SGH',
    'SGH+ROYYYYYOR+GH',
    'SGH+EPPEEPPPE+GH',
    'SGH++EPPPPEE++GH',
    'SGH++++++++++SGH',
    'SGGGGGGGGGGGGGGH',
    'SHHHHHHHHHHHHHHH',
  ];
}

// --- Rooms: music and craft -------------------------------------------------------------------------------

/** The harpsichord, played from the south: its lid, its keys, its case on turned legs. */
const HARPSICHORD = [
  '................',
  '................',
  '.EEEEEEEEEEEEEE.',
  '.ETTTTTTTTTTTTE.',
  '.ENNNNNNNNNNNNE.',
  '.E1K11K1K11K11E.',
  '.E1K11K1K11K11E.',
  '.E111111111111E.',
  '.EPPPPPPPPPPPPE.',
  '.EPYPPPPPPPPYPE.',
  '.EEEEEEEEEEEEEE.',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..EE........EE..',
];

/** A spinning wheel, its wheel to the west and the wool on its distaff to the east. */
const SPINNING_WHEEL = [
  '................',
  '...EEEEE........',
  '..E.....E.......',
  '.E..E.E..E......',
  '.E...E...E....Y.',
  '.E.EEPEE.E...YMY',
  '.E...E...E...YM_',
  '.E..E.E..E....E.',
  '..E.....E.....E.',
  '...EEEEE....EE..',
  '....EE..EEEEE...',
  '...ETNNNNNNNE...',
  '...E.......E....',
  '..E.........E...',
  '..E.........E...',
  '.EE.........EE..',
];

/** A harp standing: its golden frame and strings. */
const HARP = [
  '................',
  '...YY...........',
  '...YMY..........',
  '...YM_YY........',
  '...YM.1_YY......',
  '...YM.1.1_YY....',
  '...YM.1.1.1_Y...',
  '...YM.1.1.1.1_..',
  '...YM.1.1.1.1M..',
  '...YM.1.1.1.1M..',
  '...YM.1.1.1.1M..',
  '...YM.1.1.1.1M..',
  '...YM1.1.1.1.M..',
  '...YMMMMMMMMMM..',
  '..YMMMMMMMMMMM_.',
  '..____________..',
];

/** A rack of weapons: swords, a spear and an axe. */
const WEAPON_RACK = [
  '......L.........',
  '..L...L...L..J..',
  '..L...L...L.LJI.',
  '..L...L...L..JI.',
  '..L...L...L..E..',
  '.ETTTTTTTTTTTTE.',
  '.ENNNNNNNNNNNNE.',
  '..L...L...L..E..',
  '..L...E...L..E..',
  '.YM...E..YM..E..',
  '..E...E...E..E..',
  '..E...E...E..E..',
  '.ETTTTTTTTTTTTE.',
  '.ENNNNNNNNNNNNE.',
  '.EP..........PE.',
  '.EE..........EE.',
];

// --- Rooms: power and punishment --------------------------------------------------------------------------

/** A throne: gold, its back and seat in royal purple. */
const THRONE = [
  '.....YYYYYY.....',
  '....YM<<<<M_....',
  '...YM<====>M_...',
  '...YM<====>M_...',
  '...YM<====>M_...',
  '...YM<====>M_...',
  '.YYYM<====>M___.',
  '.YM<<<<<<<<<<>_.',
  '.YM==========>_.',
  '.YMMMMMMMMMMMM_.',
  '.YM<<<<<<<<<<>_.',
  '.YM==========>_.',
  '.YMMMMMMMMMMMM_.',
  '.YM..........M_.',
  '.YM..........M_.',
  '.__..........__.',
];

/** A gargoyle in stone, on its plinth. */
const GARGOYLE = [
  '................',
  '..H..SSSS..H....',
  '..HS.SGGGS.SH...',
  '...SSG+G+GSS....',
  '....SGGGGGS.....',
  '.S...SG+GS...S..',
  '.SS.SSGGGSS.SS..',
  '.SGSSGGGGGGSGSH.',
  '.SGGSGGGGGGSGGH.',
  '..HGSGGGGGGSGH..',
  '....SGGHHGGS....',
  '....SGH..HGS....',
  '..SSSSSSSSSSSSH.',
  '..SGGGGGGGGGGGH.',
  '..HHHHHHHHHHHHH.',
  '................',
];

/** The torturer's rack: a frame with a roller at either end. */
const RACK = [
  '................',
  '................',
  '..LJJI....LJJI..',
  '..EEEEEEEEEEEE..',
  '.ETTTTTTTTTTTTE.',
  '.EN.P.P.P.P.PNE.',
  '.EN.P.P.P.P.PNE.',
  '.EN.P.P.P.P.PNE.',
  '.EN.P.P.P.P.PNE.',
  '.ETTTTTTTTTTTTE.',
  '..EEEEEEEEEEEE..',
  '..LJJI....LJJI..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..EE........EE..',
];

/** The stocks: a board with holes for the head and hands, on two posts. */
const STOCKS = [
  '................',
  '................',
  '................',
  '..EE........EE..',
  '..PE........PE..',
  '.ETTTTTTTTTTTTE.',
  '.EN++NNN++NN++E.',
  '.EP++PPP++PP++E.',
  '.EEEEEEEEEEEEEE.',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '..PE........PE..',
  '.EPEE......EPEE.',
  '.EEEE......EEEE.',
];

// --- Rooms: doors, glass, the fence ------------------------------------------------------------------------

/** A door with a barred window in it (the magic doors); with a lock plate if `locked`. */
function barredDoor(locked: boolean): string[] {
  const rows = door(locked);
  rows[3] = 'SGEPP+J+J+PPPEGH';
  rows[4] = 'SGEPP+J+J+PPPEGH';
  return rows;
}

/** A fence of white rails between two posts, running across the square. */
const FENCE = [
  '................',
  '................',
  '................',
  '..11........11..',
  '.1223......1223.',
  '1111111111111111',
  '2222222222222222',
  '3333333333333333',
  '.1223......1223.',
  '1111111111111111',
  '2222222222222222',
  '3333333333333333',
  '.1223......1223.',
  '.1223......1223.',
  '.3333......3333.',
  '................',
];

/** A tall mirror in its gilt frame on a stand: plain, with someone in it, or broken. */
function mirror(kind: 'plain' | 'figure' | 'broken'): string[] {
  const rows = [
    '.....YYYYYY.....',
    '....YMBBBBM_....',
    '...YMBBUUUUM_...',
    '...YMBUUUUUM_...',
    '...YMUUUUUUM_...',
    '...YMUUUUUUM_...',
    '...YMUUUUUVM_...',
    '...YMUUUUVVM_...',
    '...YMUUUVVVM_...',
    '....YMVVVVM_....',
    '.....YMMMM_.....',
    '.......E........',
    '.......P........',
    '.......P........',
    '.....EPPPE......',
    '....EEEEEEE.....',
  ];
  const put = (y: number, x: number, what: string): void => {
    rows[y] = rows[y].slice(0, x) + what + rows[y].slice(x + what.length);
  };
  if (kind === 'figure') {
    put(3, 7, '^^');
    put(4, 6, '^^^^');
    put(5, 7, '^^');
    put(6, 6, '5555');
    put(7, 5, '55555');
    put(8, 5, '55555');
  } else if (kind === 'broken') {
    put(2, 8, 'W');
    put(3, 7, 'W.W');
    put(4, 6, 'W...W');
    put(5, 9, 'W');
    put(6, 6, 'W');
    put(7, 7, 'W');
    put(8, 8, 'W');
  }
  return rows;
}

// --- Rooms: bedrooms and studies --------------------------------------------------------------------------

/** A desk: its top, a drawer, and legs, in teal paint. */
const DESK = [
  '................',
  '................',
  '................',
  '....1111........',
  '....2223...YM...',
  '.7777777777777_.',
  '.88888888888889.',
  '.89999999999999.',
  '.88Y88888888889.',
  '.88888888888889.',
  '.99999999999999.',
  '.89..........89.',
  '.89..........89.',
  '.89..........89.',
  '.89..........89.',
  '.99..........99.',
];

/** A wine cask lying on its cradle, its round end toward us, its tap in gold. */
const CASK = [
  '................',
  '................',
  '.....EEEEEE.....',
  '...EENNNNNNEE...',
  '..ENNPPPPPPNNE..',
  '..ENPPEPPEPPPE..',
  '.ENPPPEPPEPPPPE.',
  '.ENPPPYMMYPPPPE.',
  '.ENPPPE_YEPPPPE.',
  '.ENPPPEPPEPPPPE.',
  '..ENPPEPPEPPPE..',
  '..EENPPPPPPNEE..',
  '...EEEEEEEEEE...',
  '..PE........PE..',
  '..EE........EE..',
  '................',
];

/** A vanity: a round mirror on a small table. */
const VANITY = [
  '................',
  '.....YYYYYY.....',
  '....YMBBBUU_....',
  '....YMBUUUU_....',
  '....YMUUUUV_....',
  '....YMUUUVV_....',
  '.....YMVVV_.....',
  '......Y__.......',
  '.7777777777777_.',
  '.88888888888889.',
  '.88888YY8888889.',
  '.99999999999999.',
  '.89..........89.',
  '.89..........89.',
  '.89..........89.',
  '.99..........99.',
];

/** A pitcher and bowl on a small green-topped table. */
const PITCHER = [
  '................',
  '..........11....',
  '.........1223...',
  '........1W2223..',
  '..........223...',
  '.........12223..',
  '...11111.12223..',
  '..1222223.223...',
  '.4444444444444_.',
  '.55555555555556.',
  '.66666666666666.',
  '.EP..........EP.',
  '.EP..........EP.',
  '.EP..........EP.',
  '.EP..........EP.',
  '.EE..........EE.',
];

/** A rug on the floor, its border in gold. */
const RUG = [
  '................',
  '................',
  '................',
  '.YYYYYYYYYYYYYY.',
  '.YCCCCCCCCCCCCY.',
  '.YC_MMMMMMMM_CY.',
  '.YCMCCCC==CCMCY.',
  '.YCMCC====CCMCY.',
  '.YCMCCCC==CCMCY.',
  '.YC_MMMMMMMM_CY.',
  '.YCCCCCCCCCCCCY.',
  '.YYYYYYYYYYYYYY.',
  '.Y.Y.Y.Y.Y.Y.Y..',
  '................',
  '................',
  '................',
];

/** A chest of drawers, in teal. */
const DRESSER = [
  '................',
  '..7777777777777.',
  '..8888888888889.',
  '..8999999999999.',
  '..88888YY888889.',
  '..8999999999999.',
  '..88888YY888889.',
  '..8999999999999.',
  '..88888YY888889.',
  '..8999999999999.',
  '..88888YY888889.',
  '..9999999999999.',
  '..89.........89.',
  '..89.........89.',
  '..99.........99.',
  '................',
];

/** A small table, its top in green baize. */
const SMALL_TABLE = [
  '................',
  '................',
  '................',
  '................',
  '...44444444444..',
  '...55555555556..',
  '...55555555556..',
  '...66666666666..',
  '...EPPPPPPPPPE..',
  '....EP.....EP...',
  '....EP.....EP...',
  '....EP.....EP...',
  '....EP.....EP...',
  '....EP.....EP...',
  '....EE.....EE...',
  '................',
];

/** A trunk, its lid banded in gold, its lock at the front. */
const TRUNK = [
  '................',
  '................',
  '................',
  '...EEEEEEEEEE...',
  '..ETTTTTTTTTTE..',
  '..ENNNNNNNNNNE..',
  '..EYMMMMMMMM_E..',
  '..ENPPPPPPPPPE..',
  '..ENPPPYMPPPPE..',
  '..ENPPP+_PPPPE..',
  '..ENPPPPPPPPPE..',
  '..EYMMMMMMMM_E..',
  '..ENPPPPPPPPPE..',
  '..EEEEEEEEEEEE..',
  '................',
  '................',
];

// --- Streets ----------------------------------------------------------------------------------------------

/** A standing torch: an iron stand with its cup of fire, in two frames. */
function standingTorch(f: number): string[] {
  return [
    '................',
    f ? '.......R........' : '........R.......',
    f ? '......RR........' : '.......RR.......',
    f ? '......ROR.......' : '.......ORR......',
    f ? '.....ROYOR......' : '......RYOR......',
    f ? '.....RYYOR......' : '......ROYYR.....',
    '.....LJJJI......',
    '......JJI.......',
    '.......J........',
    '.......J........',
    '.......J........',
    '.......J........',
    '.......J........',
    '.......J........',
    '......JJI.......',
    '.....IIIII......',
  ];
}

/** A signpost: a board on its post. */
const SIGNPOST = [
  '................',
  '................',
  '.EEEEEEEEEEEEEE.',
  '.ETTTTTTTTTTTTNE',
  '.ENPPPPPPPPPPPPE',
  '.ENP+++P++++PPE.',
  '.EEEEEEEEEEEEEE.',
  '.......EPE......',
  '.......EPE......',
  '.......EPE......',
  '.......EPE......',
  '.......EPE......',
  '.......EPE......',
  '.......EPE......',
  '......EEPEE.....',
  '................',
];

/** A well: a stone ring, a roof on posts, a bucket on its rope. */
const WELL = [
  '..EEEEEEEEEEEE..',
  '.ETTTTTTTTTTTTE.',
  '..ENNNNNNNNNNE..',
  '...EP...J..EP...',
  '...EP...J..EP...',
  '...EP..ENE.EP...',
  '...EP..EPE.EP...',
  '..SSSSSSSSSSSSH.',
  '.SGUUUUUUUUUUGH.',
  '.SGVVUUUUUUVVGH.',
  '.SGGGGGGGGGGGGH.',
  '.SGHGGHGGHGGHGH.',
  '.SGGGGGGGGGGGGH.',
  '..HHHHHHHHHHHH..',
  '................',
  '................',
];

/** A hitching rail: a bar on two posts. */
const HITCHING_RAIL = [
  '................',
  '................',
  '................',
  '................',
  '.EEEEEEEEEEEEEE.',
  '.ETTTTTTTTTTTTE.',
  '.ENNNNNNNNNNNNE.',
  '..EP........EP..',
  '..EP........EP..',
  '..EP........EP..',
  '..EP........EP..',
  '..EP........EP..',
  '..EP........EP..',
  '..EP........EP..',
  '.EEPE......EEPE.',
  '................',
];

/** A bench: a board on iron legs. */
const BENCH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.EEEEEEEEEEEEEE.',
  '.ETTTTTTTTTTTTE.',
  '.ENNNNNNNNNNNNE.',
  '.EPPPPPPPPPPPPE.',
  '.EEEEEEEEEEEEEE.',
  '..JI........JI..',
  '..JI........JI..',
  '..JI........JI..',
  '..JI........JI..',
  '.IIII......IIII.',
  '................',
];

/** A great red-capped mushroom. */
const MUSHROOM = [
  '................',
  '................',
  '.....QQQQQQ.....',
  '...QQCWCCCCCC...',
  '..QCCCCCWCCCC}..',
  '.QCWCCCCCCCWCC}.',
  '.QCCCCCWCCCCCC}.',
  '.}}}}}}}}}}}}}}.',
  '......1223......',
  '......1223......',
  '......1223......',
  '......1223......',
  '......1223......',
  '.....112233.....',
  '....33333333....',
  '................',
];

/** The clock: a tall case, its face in the middle where the game draws the hands, a pendulum below. */
const CLOCK = [
  '....EEEEEEEE....',
  '...ETTTTTTTTE...',
  '...ENNNNNNNNE...',
  '..E_YYYYYYYY_E..',
  '..EYYY1111YYYE..',
  '..EYY1K11K1YYE..',
  '..EY11111111YE..',
  '..EYK111111KYE..',
  '..EY11111111YE..',
  '..EY11111111YE..',
  '..EYY1K11K1YYE..',
  '..EYYY1111YYYE..',
  '..E_YYYYYYYY_E..',
  '...EP+_YM+PPE...',
  '...EEEEEEEEEE...',
  '...EE......EE...',
];

/** A sundial on its column, the gnomon's shadow falling west (0xfc) or east (0xfd). */
function sundial(east: boolean): string[] {
  const rows = [
    '................',
    '................',
    '.......YM.......',
    '.......YMM......',
    '.......YMMM.....',
    '...YYYYYMMMM_...',
    '..YMMMMMMMMMM_..',
    '..MMMMMMMMMMM_..',
    '...__________...',
    '......SGGH......',
    '......SGGH......',
    '......SGGH......',
    '......SGGH......',
    '.....SSGGHH.....',
    '....SSSSSSHH....',
    '................',
  ];
  rows[7] = east ? '..MMMMMMMM___M..' : '..MM___MMMMMMM..';
  return rows;
}

/** A portcullis: iron bars and cross-bars, spiked at the foot. */
const PORTCULLIS = [
  'IIIIIIIIIIIIIIII',
  'JLJJLJJLJJLJJLJI',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  'JLJJLJJLJJLJJLJI',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  '.LI.LI.LI.LI.LI.',
  'JLJJLJJLJJLJJLJI',
  '.LI.LI.LI.LI.LI.',
  '.J..J..J..J..J..',
];

/**
 * A grave's marker (0x89): a small round-topped stone over its mound, an inscription's line on it - a marker for every
 * grave, not one faith's (the EGA's cross); the headstone (0x8a), taller and lettered, stays apart from it.
 */
const GRAVE_STONE = [
  '................',
  '................',
  '................',
  '......SSSS......',
  '.....SGGGGH.....',
  '....SGGGGGGH....',
  '....SGGGGGGH....',
  '....SG----GH....',
  '....SGGGGGGH....',
  '....SGGGGGGH....',
  '....SGGGGGGH....',
  '....SGGGGGGH....',
  '..%*SGGGGGGH*#..',
  '..%**********#..',
  '..############..',
  '................',
];

/** A headstone over a grave's mound. */
const HEADSTONE = [
  '................',
  '................',
  '.....SSSSSS.....',
  '....SGGGGGGH....',
  '...SGGGGGGGGH...',
  '...SGGGGGGGGH...',
  '...SG------GH...',
  '...SGGGGGGGGH...',
  '...SG------GH...',
  '...SGGGGGGGGH...',
  '...SG----GGGH...',
  '...SGGGGGGGGH...',
  '..%SGGGGGGGGH#..',
  '..%**********#..',
  '..############..',
  '................',
];

// --- The world map ----------------------------------------------------------------------------------------

/** A hut: a thatched roof over mud walls, its door. */
const HUT = [
  '................',
  '................',
  '.......YY.......',
  '.....YYMM__.....',
  '....YMMMMMM_....',
  '...YMMMMMMMM_...',
  '..YMMMMMMMMMM_..',
  '.YMMMMMMMMMMMM_.',
  '..____________..',
  '..%**********#..',
  '..%***EEE****#..',
  '..%***EPE****#..',
  '..%***EPE****#..',
  '..%***EPE****#..',
  '..############..',
  '................',
];

/** A village: three huts together. */
const VILLAGE = [
  '................',
  '...YM.....YM....',
  '..YMM_...YMM_...',
  '.YMMMM_.YMMMM_..',
  '.______.______..',
  '.%*E*#..%*E*#...',
  '.%*P*#..%*P*#...',
  '.#####..#####...',
  '.......YM.......',
  '......YMM_......',
  '.....YMMMM_.....',
  '....YMMMMMM_....',
  '....________....',
  '....%**EE**#....',
  '....%**EP**#....',
  '....########....',
];

/** A keep: a stone tower, crenellated, its flag flying (and in its second frame, flying the other way). */
const KEEP = [
  '.......J<=......',
  '.......J<=......',
  '.......J........',
  '....SS.SS.SH....',
  '....SGGGGGGH....',
  '....SGG++GGH....',
  '....SGG++GGH....',
  '....SGGGGGGH....',
  '....SGGGGGGH....',
  '....SGG++GGH....',
  '....SGGGGGGH....',
  '...SSGGGGGGHH...',
  '...SGGGEEGGGH...',
  '...SGGGEPGGGH...',
  '...HHHHHHHHHH...',
  '................',
];

/** The lighthouse: a round white tower banded red, its lamp lit. */
const LIGHTHOUSE = [
  '......YYYY......',
  '.....IYWWYI.....',
  '.....IYWWYI.....',
  '....IIIIIIII....',
  '.....122223.....',
  '.....QCCCC}.....',
  '.....122223.....',
  '....12222223....',
  '....QCCCCCC}....',
  '....12222223....',
  '....12222223....',
  '...QCCCCCCCC}...',
  '...1222EE2223...',
  '...1222EP2223...',
  '..SSSSSSSSSSSH..',
  '..HHHHHHHHHHHH..',
];

/** A shrine: a white temple on its steps, the ankh over it. */
const SHRINE = [
  '.......YM.......',
  '......Y..M......',
  '.....YYYMMM_....',
  '.......YM.......',
  '......1122......',
  '....11122222....',
  '..111122222223..',
  '.33333333333333.',
  '...12.12.12.12..',
  '...12.12.12.12..',
  '...12.12.12.12..',
  '...12.12.12.12..',
  '.11111111111113.',
  '.22222222222223.',
  '.33333333333333.',
  '................',
];

/** Ruins: broken columns, and a fallen block. */
const RUINS = [
  '................',
  '..12............',
  '..123......12...',
  '..123......123..',
  '..123......123..',
  '..123..12..123..',
  '..123..123.123..',
  '..123..123.123..',
  '..123..123.123..',
  '..123..123.123..',
  '.12223.123.1223.',
  '.33333.333.3333.',
  '................',
  '...1122223......',
  '...3333333......',
  '................',
];

/** The Codex's dome of blue glass, on its white base. */
const CODEX_DOME = [
  '................',
  '......!!||......',
  '....!!||||||....',
  '...!!|||||||:...',
  '..!!||||||||::..',
  '..!|||||||||::..',
  '.!!||||||||||::.',
  '.!|||||||||||::.',
  '.::::::::::::::.',
  '.11111111111113.',
  '.12222EEE222223.',
  '.12222EPE222223.',
  '.12222EPE222223.',
  '.33333333333333.',
  '................',
  '................',
];

/** A crystal orb on its golden stand. */
const ORB = [
  '................',
  '................',
  '......!!||......',
  '.....!W|||:.....',
  '.....!||||:.....',
  '.....||||::.....',
  '......::::......',
  '.......YM.......',
  '......YMM_......',
  '.......YM.......',
  '.......YM.......',
  '.......YM.......',
  '......YMM_......',
  '....YYMMMM__....',
  '....________....',
  '................',
];

/** A dead tree, bare. */
const DEAD_TREE = [
  '...E....E.......',
  '....E..E...E....',
  '.E..E.E...E.....',
  '..E.EPE..E......',
  '...EPPE.E.......',
  '....EPPE........',
  '.....EPPE.......',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '.....EEPEE......',
  '....E.EPE.E.....',
  '................',
];

/** A fruit tree: a round crown, red fruit in it. */
const FRUIT_TREE = [
  '.....44555......',
  '...4455C55566...',
  '..445555555C66..',
  '.4455C555555566.',
  '.45555555C55556.',
  '.455C555555C556.',
  '.45555555555556.',
  '..655555C55566..',
  '...666555666....',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '......EPE.......',
  '.....EEPEE......',
  '....EE...EE.....',
  '................',
];

/** A cactus, its two arms raised. */
const CACTUS = [
  '.......45.......',
  '......4556......',
  '......4556......',
  '..45..4556......',
  '.4556.4556......',
  '.4556.4556..45..',
  '.4556.4556.4556.',
  '..45554556.4556.',
  '......4556.4556.',
  '......45555556..',
  '......4556......',
  '......4556......',
  '......4556......',
  '......4556......',
  '.....%4556#.....',
  '................',
];

/** Crops in their furrows, ripe (0x2d) or picked (0x2c): the field is its own ground. */
function crops(ripe: boolean): string[] {
  const rows: string[] = [];
  for (let band = 0; band < 4; band++) {
    const odd = band % 2 === 1;
    rows.push('****************');
    rows.push(ripe ? (odd ? '**Y**Y**Y**Y**Y*' : '*Y**Y**Y**Y**Y**') : '****************');
    rows.push(ripe ? (odd ? '5645645645645645' : '4564564564564564') : odd ? '**6**6**6**6**6*' : '*6**6**6**6**6**');
    rows.push('################');
  }
  return rows;
}

/** A boulder. */
const BOULDER = [
  '................',
  '................',
  '................',
  '......((((......',
  '....(()))))]....',
  '...())))))))]...',
  '..()))+))))))]..',
  '..())))+)))))]..',
  '.()))))+)))))]].',
  '.())))))))+))]].',
  '.()))))))+)))]].',
  '.]))))))))))]]].',
  '..]]))))))))]]..',
  '....]]]]]]]]....',
  '................',
  '................',
];

/** A stone arch in two halves, west and east: each a pillar and half the round-topped span. */
const ARCH_WEST = [
  '..SSSSSSSSSSSSSS',
  '..SGGGGGGGGGGGGG',
  '..SGGGGGGGGHHHHH',
  '..SGGGGHH.......',
  '..SGGGH.........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '..SGGH..........',
  '.SSGGHH.........',
  '.HHHHHH.........',
];
const ARCH_EAST = [
  'SSSSSSSSSSSSSH..',
  'GGGGGGGGGGGGGH..',
  'HHHHHGGGGGGGGH..',
  '.......HHGGGGH..',
  '.........SGGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '..........SGGH..',
  '.........SSGGHH.',
  '.........HHHHHH.',
];

/** The hourglass, its sand running down through its four frames. */
function hourglass(f: number): string[] {
  const rows = [
    '..EEEEEEEEEEEE..',
    '..ETTTTTTTTTTE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..EP........PE..',
    '..ETTTTTTTTTTE..',
    '..EEEEEEEEEEEE..',
    '...EE......EE...',
    '................',
  ];
  // The glass: each row's half-width either side of the middle (between columns 7 and 8), a neck at rows 6-7.
  const half: Record<number, number> = { 2: 4, 3: 4, 4: 3, 5: 2, 6: 1, 7: 1, 8: 2, 9: 3, 10: 4, 11: 4 };
  const sandTop = new Set([2, 3, 4, 5].slice(f));
  const sandBottom = new Set([11, 10, 9, 8].slice(0, f + 1));
  for (const [y, w] of Object.entries(half).map(([k, v]) => [Number(k), v])) {
    const row = [...rows[y]];
    for (let x = 8 - w; x < 8 + w; x++) {
      const edge = x === 8 - w || x === 8 + w - 1;
      row[x] = edge ? '1' : sandTop.has(y) || sandBottom.has(y) ? (x < 8 ? 'Y' : 'M') : y === 6 || y === 7 ? 'M' : '3';
    }
    rows[y] = row.join('');
  }
  return rows;
}

/** A stone pedestal, a bowl of blue flame on it. */
const PEDESTAL = [
  '.......!|.......',
  '......!||:......',
  '.....!|WW|:.....',
  '.....!||||:.....',
  '....SSSSSSSH....',
  '.....HGGGGH.....',
  '......SGGH......',
  '......SGGH......',
  '......SGGH......',
  '......SGGH......',
  '......SGGH......',
  '......SGGH......',
  '......SGGH......',
  '....SSSGGHHH....',
  '...SSSSSSSSHH...',
  '................',
];

// --- Lord British's castle --------------------------------------------------------------------------------

/**
 * Lord British's castle as the world map shows it, three squares by two (0x3a 0x3b 0x3c over 0x3d 0x3e 0x3f), drawn
 * whole on the grid of sixteen - the ultima3 port's white stone, red-roofed towers and blue flags - and cut into its
 * six tiles. Seen from a little higher than its towns, as the EGA castle is: four towers, two big before and two
 * behind, the walls' walks running back between them, and inside, as the castle's map has it, the great hall
 * red-roofed in its yard, his keep and flag behind it, lawns either side.
 *
 * Blackthorn's palace (`black`) is the same walls in dark stone, its yard blighted, a black keep with a spire and a
 * window lit red rising out of it, red flags, a skull over the gate, and the moat before it that his palace's map
 * has, the drawbridge down. On the map it shares the castle's tiles but for its gate (0x39); the game draws it from
 * its own six (the manifest's palace) wherever the castle's gate is that one.
 */
function castle(black: boolean, flutter = false): string[] {
  const W = 48;
  const H = 32;
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  // Stone, lit to shade, and stone further off; Blackthorn's is dark rock.
  const [lit, face, shade, far] = black ? ['(', ')', ']', '+'] : ['S', 'G', 'H', ']'];
  const cloth = black ? 'QC}' : 'BUV';
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  /** A block of dressed stone, lit on its left, shaded on its right; `back`, further off, a tone darker. */
  const stone = (x0: number, y0: number, x1: number, y1: number, back = false): void => {
    rect(x0, y0, x1, y1, back ? shade : face);
    rect(x0, y0, x0, y1, back ? face : lit);
    rect(x1, y0, x1, y1, back ? far : shade);
  };
  /** Merlons along a wall's top, every other square. */
  const merlons = (x0: number, x1: number, y: number, back = false): void => {
    for (let x = x0; x <= x1; x += 2) {
      put(x, y, back ? face : lit);
      if (x + 1 <= x1) put(x + 1, y, shade);
    }
  };
  /** A flag on its pole, the pole's foot at `y + 3`. */
  const flag = (x: number, y: number, long = false): void => {
    for (let fy = y; fy < y + 3; fy++) put(x, fy, 'J');
    const [l, m, d] = cloth;
    const top = flutter ? [l, m, m, m] : [l, m, m];
    const under = flutter ? [m, d] : [m, m, d];
    if (long) (flutter ? [l, m, m, m, m] : [l, m, m, m]).forEach((c, k) => put(x + 1 + k, y, c));
    else top.forEach((c, k) => put(x + 1 + k, y, c));
    (long ? (flutter ? [m, m, d] : [m, m, m, d]) : under).forEach((c, k) => put(x + 1 + k, y + 1, c));
  };
  /** A tower's red cone of a roof, its flag above if it has one. */
  const roof = (cx: number, top: number, half: number, flies: boolean): void => {
    for (let k = 0; k <= half; k++)
      for (let x = cx - k; x <= cx + k + 1; x++) put(x, top + k, x === cx - k ? 'Q' : x === cx + k + 1 ? '}' : 'C');
    if (flies) flag(cx, top - 3);
  };
  const slit = (x: number, y: number, h = 2): void => rect(x, y, x + 1, y + h, '+');
  // Blackthorn's stands behind its moat.
  const foot = black ? 29 : 31;
  // The yard: lawn, or blighted.
  for (let y = 11; y <= 22; y++)
    for (let x = 11; x <= 36; x++) {
      const fleck = (x * 3 + y * 5) % 7 === 0;
      put(x, y, black ? (fleck ? ']' : (x + y) % 2 ? '@' : '6') : fleck ? '4' : (x + y) % 2 ? '5' : '6');
    }
  // The back wall's inner face, in shade (the EGA castle's checker), and its walk.
  for (let y = 8; y <= 11; y++) for (let x = 11; x <= 36; x++) put(x, y, (x + y) & 1 ? shade : face);
  merlons(11, 36, 7, true);
  // The side walls seen from above: their walks, the left lit.
  rect(8, 9, 10, 22, lit);
  rect(37, 9, 39, 22, shade);
  for (let y = 10; y < 22; y += 2) put(8, y, face);
  for (let y = 10; y < 22; y += 2) put(39, y, far);
  if (!black) {
    // His keep behind the hall, his flag over it.
    stone(20, 4, 27, 12, true);
    merlons(20, 27, 3, true);
    flag(23, 0, true);
    slit(23, 6);
    // The great hall: its red roof pitched, ridge to eaves, lit on the left; its face, windows and a door.
    for (let k = 0; k <= 3; k++)
      for (let x = 17 - k; x <= 30 + k; x++) put(x, 11 + k, k === 0 || x === 17 - k ? 'Q' : x === 30 + k ? '}' : 'C');
    stone(14, 15, 33, 21);
    for (const x of [16, 20, 27, 31]) slit(x, 16, 1);
    rect(23, 17, 24, 21, '+');
  } else {
    // A black keep and its spire, a window lit red.
    let y = 0;
    for (let k = 0; k <= 3; k++)
      for (let r = 0; r < 2; r++, y++) for (let x = 23 - k; x <= 24 + k; x++) put(x, y, x === 23 - k ? '-' : x === 24 + k ? '+' : '@');
    rect(19, y, 28, 21, '@');
    rect(19, y, 19, 21, '-');
    rect(28, y, 28, 21, '+');
    for (let x = 19; x <= 28; x += 2) put(x, y - 1, '-');
    rect(23, y + 3, 24, y + 5, 'R');
    rect(23, y + 3, 24, y + 3, 'O');
    slit(21, y + 8);
    slit(26, y + 8);
  }
  // The towers behind, at the far corners.
  roof(9, 3, 3, true);
  stone(7, 7, 12, 13, true);
  roof(38, 3, 3, true);
  stone(36, 7, 41, 13, true);
  // The front wall and its gate: a dark arch, the portcullis half raised.
  stone(10, 22, 37, foot);
  merlons(10, 37, 21);
  rect(20, 26, 27, foot, '+');
  rect(21, 25, 26, 25, '+');
  for (let x = 20; x <= 27; x += 2) rect(x, 26, x, 29, 'J');
  if (black) {
    // Blackthorn's: a skull over the arch.
    const face = ['.1122.', '122223', '2+22+3', '.2323.'];
    face.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && put(21 + x, 21 + y, c)));
  }
  // The towers before, big, their roofs low.
  roof(6, 13, 5, false);
  stone(1, 19, 12, foot);
  slit(6, 22);
  slit(6, 26);
  roof(40, 13, 5, false);
  stone(35, 19, 46, foot);
  slit(40, 22);
  slit(40, 26);
  // The foot of the walls in shade.
  rect(1, foot, 46, foot, shade);
  if (black) {
    // The moat before it, the drawbridge down over it.
    for (let x = 0; x < W; x++) {
      put(x, 30, x % 3 ? 'U' : 'B');
      put(x, 31, 'V');
    }
    rect(20, 30, 27, 31, 'P');
    rect(20, 30, 20, 31, 'N');
    rect(27, 30, 27, 31, 'E');
  }
  return g.map((r) => r.join(''));
}

/** Square (column, row) of the castle, a tile's sixteen rows. */
function castleTile(whole: string[], column: number, row: number): string[] {
  return whole.slice(row * 16, row * 16 + 16).map((r) => r.slice(column * 16, column * 16 + 16));
}

// --- Ladders and the banner -------------------------------------------------------------------------------

/** A ladder rising, standing on the floor. */
const LADDER_UP = [
  '...NP......NP...',
  '...NP......NP...',
  '...NTTTTTTTTP...',
  '...NPPPPPPPPP...',
  '...NP......NP...',
  '...NP......NP...',
  '...NTTTTTTTTP...',
  '...NPPPPPPPPP...',
  '...NP......NP...',
  '...NP......NP...',
  '...NTTTTTTTTP...',
  '...NPPPPPPPPP...',
  '...NP......NP...',
  '...NP......NP...',
  '...NTTTTTTTTP...',
  '...EE......EE...',
];

/** A hole in the floor, a ladder's top in it: the floor round it is the floor that is there. */
const LADDER_DOWN = [
  '................',
  '................',
  '................',
  '...@@@@@@@@@@...',
  '..@++++++++++@..',
  '..@+NP++++NP+@..',
  '..@+NTTTTTTP+@..',
  '..@+NP++++NP+@..',
  '..@+NP++++NP+@..',
  '..@+NTTTTTTP+@..',
  '..@+NP++++NP+@..',
  '..@++++++++++@..',
  '...@@@@@@@@@@...',
  '................',
  '................',
  '................',
];

/** The serpent banner: blue cloth on its rod, a red serpent writhing down it through four frames, in the dark. */
function banner(f: number): string[] {
  const rows = Array.from({ length: 16 }, () => Array<string>(16).fill('K'));
  for (let x = 2; x <= 13; x++) rows[0][x] = x === 2 ? 'Y' : x === 13 ? '_' : 'M';
  for (let y = 1; y < 15; y++) for (let x = 3; x <= 12; x++) rows[y][x] = x === 3 ? '&' : x === 12 ? '+' : '$';
  // Its foot cut in points.
  for (let x = 3; x <= 12; x++) rows[15][x] = x % 2 ? '$' : 'K';
  // The serpent: its head at the top, its body swinging from side to side, the swing moving down each frame.
  for (let y = 3; y < 14; y++) {
    const x = Math.round(7 + Math.sin((y - f * 1.5) / 1.8) * 2.2);
    rows[y][x] = 'Q';
    rows[y][x + 1] = 'C';
  }
  const hx = Math.round(7 + Math.sin((3 - f * 1.5) / 1.8) * 2.2);
  rows[2][hx] = 'Q';
  rows[2][hx + 1] = 'C';
  rows[1][hx] = 'Q';
  rows[1][hx + 1] = 'K';
  return rows.map((r) => r.join(''));
}

// --- The set ----------------------------------------------------------------------------------------------

/** The fittings drawn to the art direction so far, by tile, and their extra frames. */
// --- Pieces once painted as land (the art direction's rule 8): now on the grid of sixteen, on a clear ground ---

/** A cave: a dark mouth ringed with the mountains' brown rock, standing on the mountains drawn from the map. */
const CAVE = [
  '................',
  '................',
  '.....%%%%%%.....',
  '...%%******##...',
  '..%*********##..',
  '.%***KKKKKK***#.',
  '.%**KK++++KK**#.',
  '.%*KK++++++KK*#.',
  '.%*K++++++++K##.',
  '%*#K++++++++K###',
  '%*#K++++++++K###',
  '.#*K++++++++K##.',
  '.##KKKKKKKKKK##.',
  '..############..',
  '................',
  '................',
];

/** A mine: the same mouth propped with timber, rails going in. */
const MINE = [
  '................',
  '.....%%%%%%.....',
  '...%%******##...',
  '..%*********##..',
  '.%*NNNNNNNNNN*#.',
  '.%*EPPPPPPPPE*#.',
  '.%*EP++++++PE*#.',
  '.%*EP++++++PE##.',
  '%*#EP++++++PE###',
  '%*#EP+L++L+PE###',
  '.#*EP+L++L+PE##.',
  '.##EPLJ++JLPE##.',
  '.##EPJI++IJPE##.',
  '..############..',
  '................',
  '................',
];

/** A dungeon: a crag with a skull's face, its eyes lit red. */
const DUNGEON_FIRE = [
  '................',
  '.....((((((.....',
  '...(())))))]]...',
  '..()))))))))]]..',
  '.())KKK))KKK)]].',
  '.())KORK)KORK]].',
  '.())KKK))KKK)]].',
  '.()))))KK))))]].',
  '()))))))))))]]]]',
  '())KKKKKKKKKK]]]',
  '.))K1K1K1K1KK]].',
  '.)]KKKKKKKKKK]].',
  '.]]K1K1K1K1KK]].',
  '..]]]]]]]]]]]]..',
  '................',
  '................',
];

/** The same crag, its eyes lit with magic. */
const DUNGEON_MAGIC = [
  '................',
  '.....((((((.....',
  '...(())))))]]...',
  '..()))))))))]]..',
  '.())KKK))KKK)]].',
  '.())K!|K)K!|K]].',
  '.())KKK))KKK)]].',
  '.()))))KK))))]].',
  '()))))))))))]]]]',
  '())KKKKKKKKKK]]]',
  '.))K1K1K1K1KK]].',
  '.)]KKKKKKKKKK]].',
  '.]]K1K1K1K1KK]].',
  '..]]]]]]]]]]]]..',
  '................',
  '................',
];

/** A glowing crystal standing out of the ground, and smaller ones beside it. */
const CRYSTAL = [
  '................',
  '................',
  '.......!........',
  '......!|:.......',
  '......!|:.......',
  '.....!||::......',
  '..!..!||::......',
  '.!|:.!||::..!...',
  '.!|:.!||::.!|:..',
  '.!||:!||::.!|:..',
  '.!||:!||::!||:..',
  '..:::!||::!||:..',
  '...::::::::::...',
  '................',
  '................',
  '................',
];

/** Motes of light, glinting. */
const MOTES = [
  '................',
  '...Y............',
  '..YMY......Y....',
  '...Y......YMY...',
  '...........Y....',
  '.......Y........',
  '......YMY.......',
  '.......Y.....Y..',
  '..Y.........YMY.',
  '.YMY.........Y..',
  '..Y....Y........',
  '......YMY.......',
  '.......Y...Y....',
  '..........YMY...',
  '...........Y....',
  '................',
];

/** The Codex's glowing sigil: a cross of gold in a red ring, set in bone. */
const SIGIL = [
  '................',
  '.....222222.....',
  '...2233333322...',
  '..23CCCMMCCC32..',
  '.23CCCCMMCCCC32.',
  '.2CCCCCMMCCCCC2.',
  '23CCCCCMMCCCCC32',
  '2MMMMMMWWMMMMMM2',
  '2MMMMMMWWMMMMMM2',
  '23CCCCCMMCCCCC32',
  '.2CCCCCMMCCCCC2.',
  '.23CCCCMMCCCC32.',
  '..23CCCMMCCC32..',
  '...2233333322...',
  '.....222222.....',
  '................',
];

/** A bridge: planks across between rails, the posts showing - the water beneath (the manifest's under). */
const BRIDGE = [
  '................',
  '................',
  '................',
  '.N....N....N....',
  'EEEEEEEEEEEEEEEE',
  'NPPENPPENPPENPPE',
  'NPPENPPENPPENPPE',
  'NPPENPPENPPENPPE',
  'NPPENPPENPPENPPE',
  'NPPENPPENPPENPPE',
  'EEEEEEEEEEEEEEEE',
  '.P....P....P....',
  '................',
  '................',
  '................',
  '................',
];

/** The dock: a quay of dark dressed stone across, the water beneath. */
const DOCK = [
  '................',
  '................',
  '................',
  '----------------',
  '@@@+@@@@@+@@@@@+',
  '@@@+@@@@@+@@@@@+',
  '++++++++++++++++',
  '@+@@@@@+@@@@@+@@',
  '@+@@@@@+@@@@@+@@',
  '++++++++++++++++',
  '@@@+@@@@@+@@@@@+',
  '@@@+@@@@@+@@@@@+',
  '++++++++++++++++',
  '................',
  '................',
  '................',
];

/** Stones lying about: two, three or four. */
const STONES2 = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......--........',
  '.....-@@+.......',
  '.....@@@+.......',
  '......++........',
  '..........--....',
  '.........-@@+...',
  '.........@@@+...',
  '..........++....',
  '................',
  '................',
  '................',
];

const STONES3 = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......--........',
  '.....-@@+.......',
  '.....@@@+.......',
  '......++........',
  '..........--....',
  '....--...-@@+...',
  '...-@@+..@@@+...',
  '...@@@+...++....',
  '....++..........',
  '................',
  '................',
];

const STONES4 = [
  '................',
  '................',
  '................',
  '................',
  '............--..',
  '......--...-@@+.',
  '.....-@@+..@@@+.',
  '.....@@@+...++..',
  '......++........',
  '..........--....',
  '....--...-@@+...',
  '...-@@+..@@@+...',
  '...@@@+...++....',
  '....++..........',
  '................',
  '................',
];

export function fittings(): Group {
  const t = new Map<number, Sprite>();
  const frames = new Map<number, Sprite[]>();
  // Chairs: 0x90 facing north, 0x91 east, 0x92 south, 0x93 west.
  t.set(0x90, fitting(CHAIR_NORTH));
  t.set(0x91, fitting(CHAIR_EAST));
  t.set(0x92, fitting(CHAIR_SOUTH));
  t.set(0x93, fitting(mirrored(CHAIR_EAST)));
  // Long tables: the west end, a bare middle, the east end; and middles laid with a roast, bread, fruit, candles.
  t.set(0x94, fitting(table('w')));
  t.set(0x95, fitting(table('m')));
  t.set(0x96, fitting(table('e')));
  t.set(0x9a, fitting(table('m', 'roast')));
  t.set(0x9b, fitting(table('m', 'bread')));
  t.set(0x9c, fitting(table('m', 'fruit')));
  t.set(0xbe, fitting(table('m', 'candles')));
  frames.set(0xbe, [fitting(table('m', 'candles-flicker'))]);
  t.set(0xab, fitting(BED_HEAD));
  t.set(0xac, fitting(BED_FOOT));
  t.set(0xb2, fitting(BRAZIER[0]));
  frames.set(0xb2, [fitting(BRAZIER[1])]);
  for (let f = 0; f < 4; f++) t.set(0xd8 + f, fitting(fountain(f)));
  t.set(0xbd, fitting(LAMP));
  t.set(0xe0, fitting(LAMP));
  t.set(0xf8, fitting(sign(INN)));
  for (const [tile, emblem] of Object.entries(EMBLEMS)) t.set(Number(tile), fitting(sign(emblem)));
  t.set(0xb8, fitting(door(false)));
  t.set(0xb9, fitting(door(true)));
  // Hung the other way: the leaf turned, its ring on the left; the frame keeps its light on the left.
  const otherWay = (rows: string[]): string[] => rows.map((r) => r.slice(0, 2) + [...r.slice(2, 14)].reverse().join('') + r.slice(14));
  t.set(0xba, fitting(otherWay(door(false))));
  t.set(0xbb, fitting(otherWay(door(true))));
  // Rooms.
  t.set(0x41, fitting(LECTERN));
  t.set(0x42, fitting(BARREL));
  t.set(0x46, fitting(MILLSTONE));
  t.set(0x58, fitting(WASHSTAND));
  t.set(0x59, fitting(TELESCOPE));
  t.set(0x5a, fitting(SHELVES));
  t.set(0x5b, fitting(PALM));
  t.set(0x5c, fitting(bookcase(false)));
  t.set(0x5d, fitting(bookcase(true)));
  // The stove and the cauldron: the game swaps each pair of tiles (0x80 with 0x81, 0x82 with 0x83).
  t.set(0x80, fitting(stove(0)));
  t.set(0x81, fitting(stove(1)));
  t.set(0x82, fitting(cauldron(0)));
  t.set(0x83, fitting(cauldron(1)));
  t.set(0x84, fitting(HARPSICHORD));
  t.set(0x85, fitting(SPINNING_WHEEL));
  t.set(0x86, fitting(PORTCULLIS));
  t.set(0x88, fitting(GARGOYLE));
  t.set(0x89, fitting(GRAVE_STONE));
  t.set(0x8a, fitting(HEADSTONE));
  t.set(0x8b, fitting(THRONE));
  t.set(0x8d, fitting(HARP));
  t.set(0x8e, fitting(WEAPON_RACK));
  t.set(0x97, fitting(barredDoor(false)));
  t.set(0x98, fitting(barredDoor(true)));
  t.set(0x99, fitting(FENCE));
  t.set(0x9d, fitting(mirror('plain')));
  t.set(0x9e, fitting(mirror('figure')));
  t.set(0x9f, fitting(mirror('broken')));
  t.set(0xa0, fitting(SIGNPOST));
  t.set(0xa1, fitting(WELL));
  t.set(0xa2, fitting(HITCHING_RAIL));
  t.set(0xa3, fitting(BENCH));
  t.set(0xa4, fitting(MUSHROOM));
  t.set(0xa5, fitting(DESK));
  t.set(0xa6, fitting(BARREL));
  t.set(0xa7, fitting(CASK));
  t.set(0xa8, fitting(VANITY));
  t.set(0xa9, fitting(PITCHER));
  t.set(0xaa, fitting(RUG));
  t.set(0xad, fitting(DRESSER));
  t.set(0xae, fitting(SMALL_TABLE));
  t.set(0xaf, fitting(TRUNK));
  // The standing torches burn out of step with each other.
  t.set(0xb0, fitting(standingTorch(0)));
  t.set(0xb1, fitting(standingTorch(1)));
  frames.set(0xb0, [fitting(standingTorch(1))]);
  frames.set(0xb1, [fitting(standingTorch(0))]);
  t.set(0xb3, fitting(RACK));
  // Cannons: 0xb4 facing north, then east, south, west.
  t.set(0xb4, fitting(CANNON));
  t.set(0xb5, fitting(turned(CANNON)));
  t.set(0xb6, fitting(turned(turned(CANNON))));
  t.set(0xb7, fitting(turned(turned(turned(CANNON)))));
  t.set(0xbc, fitting(fireplace(0)));
  frames.set(0xbc, [fitting(fireplace(1))]);
  t.set(0xbf, fitting(STOCKS));
  t.set(0xca, fitting(LOG));
  t.set(0xcb, fitting(turned(LOG)));
  t.set(0xfa, fitting(CLOCK));
  t.set(0xfb, fitting(CLOCK));
  t.set(0xfc, fitting(sundial(false)));
  t.set(0xfd, fitting(sundial(true)));
  // The world map.
  t.set(0x10, fitting(HUT));
  t.set(0x11, fitting(CODEX_DOME));
  t.set(0x12, fitting(KEEP));
  frames.set(0x12, [fitting(['.......J<<=.....', '.......J=.......', ...KEEP.slice(2)])]);
  t.set(0x13, fitting(VILLAGE));
  t.set(0x19, fitting(SHRINE));
  t.set(0x1a, fitting(RUINS));
  t.set(0x1b, fitting(LIGHTHOUSE));
  // The mouths in the mountains, the crystal and its motes, the Codex's sigil (once painted, sheet-places.ts).
  t.set(0x16, fitting(CAVE));
  t.set(0x17, fitting(MINE));
  t.set(0x18, fitting(DUNGEON_FIRE));
  t.set(0x38, fitting(DUNGEON_MAGIC));
  t.set(0x1c, fitting(CRYSTAL));
  t.set(0xdd, fitting(MOTES));
  t.set(0x2a, fitting(SIGIL));
  // The bridges, north to south and east to west, and the dock, over the water; rubble and stones on the ground.
  t.set(0x6a, fitting(BRIDGE));
  t.set(0x6b, fitting(turned(BRIDGE)));
  t.set(0x1d, fitting(DOCK));
  t.set(0x4c, rubble(0)); // a heap of rocks, in six versions by the square's place (stones.ts)
  t.set(0xc0, fitting(STONES2));
  t.set(0xc1, fitting(STONES3));
  t.set(0xc2, fitting(STONES4));
  // Its lamp flashes: the second frame bright, its beams thrown either side.
  frames.set(0x1b, [fitting(['......YYYY......', '..Y..IWWWWI..Y..', '.Y...IWWWWI...Y.', ...LIGHTHOUSE.slice(3)])]);
  t.set(0x29, fitting(ORB));
  t.set(0x2b, fitting(DEAD_TREE));
  t.set(0x2c, fitting(crops(false)));
  t.set(0x2d, fitting(crops(true)));
  t.set(0x2e, fitting(FRUIT_TREE));
  t.set(0x2f, fitting(CACTUS));
  t.set(0xdf, fitting(BOULDER));
  t.set(0xde, fitting(PEDESTAL));
  t.set(0xe1, fitting(ARCH_WEST));
  t.set(0xe2, fitting(ARCH_EAST));
  for (let f = 0; f < 4; f++) t.set(0xe8 + f, fitting(hourglass(f)));
  t.set(0xc8, fitting(LADDER_UP));
  t.set(0xc9, fitting(LADDER_DOWN));
  for (let f = 0; f < 4; f++) t.set(0xec + f, fitting(banner(f)));
  const CASTLE = [0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f];
  const square = (whole: string[], k: number): Sprite => fitting(castleTile(whole, k % 3, Math.floor(k / 3)));
  const [lb, lbFlying, palace, palaceFlying] = [castle(false), castle(false, true), castle(true), castle(true, true)];
  CASTLE.forEach((tile, k) => t.set(tile, square(lb, k)));
  // The flags fly: the top row's second frames.
  CASTLE.slice(0, 3).forEach((tile, k) => frames.set(tile, [square(lbFlying, k)]));
  // Blackthorn's palace: its gate square its own tile; its other five, versions the game draws there (palace).
  t.set(0x39, square(palace, 4));
  const own = new Map<number, Sprite[]>();
  CASTLE.forEach((tile, k) => k !== 4 && own.set(tile, k < 3 ? [square(palace, k), square(palaceFlying, k)] : [square(palace, k)]));
  return {
    tiles: t,
    frames,
    smooth: false,
    clock: [0xfa, 0xfb],
    variants: new Map([[0x4c, [1, 2, 3, 4, 5].map((v) => rubble(v))]]),
    palace: own,
  };
}
