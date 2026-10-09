/**
 * help.ts
 *
 * The Help pages (the ultima3 port's): short pages over the map, turned with A, for the input the player has set -
 * a controller's buttons, or the letters of 1988 - then a fight and a dungeon, and last how the look in use shows
 * the party. What the settings do is said in Settings itself, at the foot of the list.
 */

import type { Game } from './game.ts';
import type { Page } from './menu.ts';
import { Colour } from '../ui/colours.ts';

/** A closed outline's inside filled, a row at a time, in the pen's colour (the controller's body). */
function fillShape(g: Game, points: [number, number][]): void {
  const ys = points.map(([, y]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const xs: number[] = [];
    points.forEach(([x1, y1], i) => {
      const [x2, y2] = points[(i + 1) % points.length];
      if (y1 === y2 || y < Math.min(y1, y2) || y >= Math.max(y1, y2)) return;
      xs.push(Math.round(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)));
    });
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) g.draw.fill(xs[i], y, xs[i + 1], y);
  }
}

/** The outline itself, in the pen's colour. */
function outline(g: Game, points: [number, number][]): void {
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    g.draw.line(x1, y1, x2, y2);
  });
}

/** The face buttons, by the letter each is, in the colours a controller prints them, and where each sits (column, row). */
const FACE: [string, number, number, number][] = [
  ['Y', Colour.brightYellow, 14, 8],
  ['X', Colour.brightBlue, 13, 9],
  ['B', Colour.brightRed, 15, 9],
  ['A', Colour.brightGreen, 14, 10],
];

/**
 * The controller, drawn as the game draws: a squared pad in the EGA's greys, on the letters' grid, no bigger than its
 * buttons need - each face button a letter of the game's own font, black, in its colour; the d-pad, Select and Start
 * black in the body (no shoulder buttons: the game has no use for them). Over it what the d-pad and Start and Select
 * do; under it the face buttons, as the eye reads them - Y, X, B, A - each its letter in the button's colour.
 */
const PICTURE: Page = {
  title: 'The controller',
  lines: [],
  picture: (g, { x0, y0, put }) => {
    const d = g.draw;
    const top = y0 + 32; // under the d-pad's and Start's lines
    const at = (points: [number, number][]): [number, number][] => points.map(([x, y]) => [x0 + x, top + y]);
    // The body: one piece across, as wide as its buttons and a margin, its two grips below, its corners cut.
    const body = at([
      [42, 24],
      [131, 24],
      [135, 28],
      [135, 64],
      [131, 68],
      [109, 68],
      [105, 64],
      [102, 60],
      [71, 60],
      [68, 64],
      [64, 68],
      [42, 68],
      [38, 64],
      [38, 28],
    ]);
    d.pen = Colour.darkGray;
    fillShape(g, body);
    d.pen = Colour.lightGray;
    outline(g, body);
    // The d-pad, then Select and Start close together, between it and the face buttons - no wider than they need.
    d.pen = Colour.black;
    d.fill(x0 + 46, top + 41, x0 + 63, top + 46);
    d.fill(x0 + 52, top + 35, x0 + 57, top + 52);
    d.fill(x0 + 74, top + 36, x0 + 81, top + 38);
    d.fill(x0 + 88, top + 36, x0 + 95, top + 38);
    // Each face button a black key, its letter in its colour, its corners rounded off - after the letter, which paints
    // its whole cell. Not in the Standard look: its lettering is held to the cell's pixels as drawn (framebuffer.ts
    // lettersShown), and a corner changed after lets the letter go - the keys were left blank.
    for (const [letter, colour, x, y] of FACE) {
      const [bx, by] = [x0 + x * 8, y0 + y * 8];
      d.pen = Colour.black;
      d.fill(bx, by, bx + 7, by + 7);
      put(x, y, letter, colour);
      if (g.options.tileSet === 'standard') continue;
      d.pen = Colour.darkGray;
      for (const [cx, cy] of [
        [bx, by],
        [bx + 7, by],
        [bx, by + 7],
        [bx + 7, by + 7],
      ])
        d.plot(cx, cy);
    }
    // What each does: the d-pad and Start and Select over the picture, the face buttons under it.
    // The whole in the middle of the page, top to bottom: three rows clear above and below.
    put(0, 4, 'D-pad: Move / Menus');
    put(0, 5, 'Start / Select: Pause');
    const colourOf = (letter: string): number => FACE.find(([l]) => l === letter)![1];
    for (const [y, letter, does] of [
      [14, 'Y', ': Cast / Hint /'],
      [16, 'X', ': Attack'],
      [17, 'B', ': Back / Pass Turn'],
      [19, 'A', ': Open / Activate'],
    ] as const) {
      put(0, y, letter, colourOf(letter));
      put(1, y, does);
    }
    put(3, 15, 'Center Map');
    // B twice, while auto combat plays a turn, turns it off (autocombat.ts): a column in from Center Map, to fit.
    put(2, 18, 'x2 Cancel Auto Mode');
  },
};

const CONTROLLER: Page[] = [
  PICTURE,
  {
    title: 'Controller',
    lines: [
      'D-pad: move, menu',
      'A: open menu, choose',
      'B: pass turn or',
      '  back out',
      'X: attack - fire,',
      '  aboard a ship',
      'Y: cast',
      'Start or Select:',
      '  pause, anywhere',
    ],
  },
  {
    title: 'Y does more',
    lines: [
      'In the Journal: a',
      '  hint for the line',
      '  the bar is on -',
      '  where to go, who',
      '  to ask',
      'On a world map:',
      '  back to the party',
    ],
  },
  {
    title: 'The keyboard',
    lines: ['WASD, arrows: d-pad', 'Enter, Z: A', 'Space, Esc, X, B: B', 'Q, /, C: X', 'E, ., V, Y: Y', 'Esc at the prompt:', '  pause'],
  },
  {
    title: 'In a fight',
    lines: [
      'Walk into a foe to',
      '  strike it',
      'X: attack - with',
      '  Auto aim on, the',
      '  foe in reach',
      'Y: cast a spell',
      'B: pass the turn',
      'A: the command menu',
      '  for the rest',
    ],
  },
];

const LETTERS: Page[] = [
  {
    title: 'Keys',
    lines: [
      'A: attack',
      'B: board horse/ship',
      'C: cast',
      'E: enter a place',
      'F: fire ship cannon',
      'G: get',
      'H: hole up - camp,',
      '  sleep, repair',
      'I: ignite a torch',
      'J: jimmy a lock',
      'K: klimb',
      'L: look',
      'M: mix reagents',
    ],
  },
  {
    title: 'Keys',
    lines: [
      'N: new order',
      'O: open',
      'P: push',
      'Q: save and quit',
      'R: ready arms',
      'S: search',
      'T: talk',
      'U: use',
      'V: view a gem',
      'X: x-it horse or',
      '  ship',
      'Y: yell',
      'Z: ztats',
    ],
  },
  {
    title: 'More keys',
    lines: [
      'Arrows: walk',
      'Space: pass turn',
      'Tab: command menu',
      'Escape: pause',
      '1-6: set active',
      '  player, who alone',
      '  acts in a fight;',
      '  0: none',
      'W, in a fight:',
      '  switch arms',
    ],
  },
];

/**
 * A dungeon, for the input set and the look in use: a controller's player is told of the Standard look's Map (the
 * walking is the d-pad's, as anywhere); the keyboard's, the keys that walk it. The EGA look's map is a setting.
 */
function dungeonPage(g: Game): Page {
  const pad = g.options.input === 'controller';
  const standard = g.options.tileSet === 'standard';
  const map = standard
    ? ['Map, in the menu:', ' the whole level, the', ' d-pad walking by', ' the compass; Map', ' again for the view.']
    : ['The map over the', 'view: Settings,', 'Dungeon map.'];
  const walk = ['Up: step ahead', 'Down: step back', 'Left, right: turn', 'Enter: turn about', 'I: light a torch'];
  return { title: 'Dungeons', lines: pad ? map : standard ? walk : [...walk, '', ...map] };
}

/** How the look in use shows the party (and, for the keyboard's player, the active player and saving). */
function partyPage(g: Game): Page {
  const letters = g.options.statusLetters ? ['Letters: P S D C'] : [];
  if (g.options.tileSet !== 'standard')
    return {
      title: 'The party',
      lines: [
        'Letter after HP',
        ' G good',
        ' P poisoned',
        ' S asleep',
        ' D dead',
        ' C charmed',
        'Arrow: active player,',
        ' when one is set',
      ],
    };
  const names = [
    'Names by colour:',
    ' green: poisoned',
    ' lavender: asleep',
    ' pink: charmed',
    ' grey: dead',
    ' blue: level due -',
    '  camp for it',
  ];
  if (g.options.input === 'controller')
    return { title: 'The party', lines: [...names, 'Hit points:', ' yellow low', ' red nearly dead', ...letters] };
  return {
    title: 'The party',
    lines: [
      ...names,
      'Hit points: now/most,',
      ' yellow low, red',
      ' nearly gone',
      'Arrow: active player',
      ...letters,
      '',
      'Saves going in or out',
      'of a place; Save game',
      'in the pause menu.',
    ],
  };
}

/** The Help pages for the input set and the look in use. */
export function helpPages(g: Game): Page[] {
  return [...(g.options.input === 'controller' ? CONTROLLER : LETTERS), dungeonPage(g), partyPage(g)];
}
