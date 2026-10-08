/**
 * sheet-actors.ts
 *
 * The actor tiles (256-511): things lying about, mounts and ships,
 * people, and the creatures of Britannia, most in four frames. People and
 * the creatures ultima3 shares are that port's Standard figures,
 * recoloured where Ultima V dresses them differently; the rest are drawn
 * here in their style. All are see-through round the figure, so they
 * stand on the ground beneath, and rimmed.
 */

import { rng, SIZE, speckle, Sprite } from './draw.ts';
import type { Group } from './build.ts';
import { P } from './palette.ts';
import { fade, four, nudge, recolour, shrink, unrim } from './figures.ts';
import { beasts, oddments } from './beasts.ts';
import { magicField } from './fields.ts';
import { u3Class, u3Figure } from './u3.ts';

const C = (s: string): number => parseInt(s.slice(1), 16);

/** Place four frames at a tile and the three after it. */
function put4(t: Map<number, Sprite>, tile: number, frames: Sprite[]): void {
  frames.forEach((s, i) => t.set(tile + i, s));
}

// --- Things ------------------------------------------------------------------------------------------

function items(t: Map<number, Sprite>, frames: Map<number, Sprite[]>): void {
  const it = (tile: number, f: (s: Sprite) => void): void => {
    const s = new Sprite();
    f(s);
    t.set(tile, s.rim());
  };
  it(0x100, (s) => {
    const r = rng(0x100);
    for (let i = 0; i < 9; i++) {
      const x = 4 + r() * 24;
      const y = 4 + r() * 24;
      s.set(x, y, P.white)
        .set(x + 1, y, P.magicLight)
        .set(x - 1, y, P.magicLight)
        .set(x, y + 1, P.magicLight)
        .set(x, y - 1, P.magicLight);
    }
  });
  t.set(0x101, u3Figure('chest', 0));
  it(0x102, (s) => {
    s.ellipse(16, 21, 9, 8, P.goldShade).ellipse(15.5, 20.5, 8, 7, P.gold).ellipse(12, 17, 3, 2.5, P.goldLight);
    s.rect(13, 10, 6, 4, P.goldShade).rect(12, 13, 8, 2, P.leatherShade).rect(14, 18, 4, 6, P.goldShade).rect(15, 19, 2, 4, P.gold);
  });
  it(0x103, (s) => {
    s.ellipse(16, 21, 7, 7, P.wizardShade).ellipse(15.5, 20.5, 6, 6, P.wizard).ellipse(13, 18, 2, 2, P.wizardLight);
    s.rect(14, 8, 4, 8, P.cleric).rect(13, 6, 6, 3, P.leather);
  });
  it(0x104, (s) => {
    s.rect(7, 8, 18, 16, P.tanShade).rect(8, 9, 16, 14, P.tan);
    for (let y = 12; y < 22; y += 3) s.hline(10, 21, y, P.guardShade);
    s.ellipse(7, 16, 2, 8, P.tanLight).ellipse(25, 16, 2, 8, P.tanShade);
  });
  it(0x105, (s) => {
    s.line(8, 25, 24, 7, P.steelShade).line(9, 25, 25, 7, P.steel).line(9, 24, 24, 7, P.steelLight);
    s.line(6, 20, 12, 26, P.gold).rect(6, 25, 3, 3, P.leather);
  });
  it(0x106, (s) => {
    s.poly(
      [
        [7, 6],
        [25, 6],
        [25, 16],
        [16, 28],
        [7, 16],
      ],
      P.steelShade,
    );
    s.poly(
      [
        [8, 7],
        [24, 7],
        [24, 16],
        [16, 26],
        [8, 16],
      ],
      P.steel,
    );
    s.rect(15, 9, 2, 14, P.red).rect(10, 13, 12, 2, P.red);
  });
  it(0x107, (s) => {
    s.ellipse(10, 16, 5, 5, P.gold).ellipse(10, 16, 2.5, 2.5, 0);
    for (let y = 13; y < 20; y++) for (let x = 7; x < 14; x++) if (Math.hypot(x + 0.5 - 10, y + 0.5 - 16) < 2.5) s.set(x, y, 0);
    s.rect(14, 15, 13, 3, P.gold).rect(22, 18, 2, 4, P.gold).rect(26, 18, 2, 3, P.gold).hline(14, 26, 15, P.goldLight);
  });
  it(0x108, (s) => {
    s.poly(
      [
        [16, 6],
        [25, 14],
        [16, 27],
        [7, 14],
      ],
      P.magicShade,
    );
    s.poly(
      [
        [16, 6],
        [16, 27],
        [7, 14],
      ],
      P.magic,
    );
    s.line(16, 8, 10, 14, P.magicLight).set(13, 11, P.white);
  });
  it(0x109, (s) => {
    s.ellipse(16, 17, 10, 10, P.steelShade).ellipse(15.5, 16, 9, 9, P.steel).rect(6, 17, 21, 10, 0);
    s.rect(7, 16, 18, 10, P.steel).rect(13, 17, 6, 9, P.steelShade).rect(14, 18, 4, 3, P.charcoal).ellipse(12, 11, 3, 2, P.steelLight);
  });
  it(0x10a, (s) => {
    s.ellipse(16, 17, 7, 7, P.gold).ellipse(16, 17, 4.5, 4.5, 0);
    for (let y = 10; y < 25; y++) for (let x = 9; x < 24; x++) if (Math.hypot(x + 0.5 - 16, y + 0.5 - 17) < 4.5) s.set(x, y, 0);
    s.ellipse(16, 10, 3, 3, P.red).set(15, 9, P.redLight);
  });
  it(0x10b, (s) => {
    s.rect(9, 7, 14, 19, P.steelShade).rect(10, 8, 12, 17, P.steel).rect(5, 8, 5, 7, P.steelShade).rect(22, 8, 5, 7, P.steelShade);
    s.rect(13, 6, 6, 3, 0).vline(16, 9, 24, P.steelShade).hline(10, 21, 18, P.steelShade).rect(11, 9, 3, 6, P.steelLight);
  });
  it(0x10c, (s) => {
    s.ellipse(16, 12, 9, 8, P.gold).ellipse(16, 12, 7.5, 6.5, 0);
    for (let y = 3; y < 21; y++)
      for (let x = 7; x < 26; x++) if (Math.hypot((x + 0.5 - 16) / 7.5, (y + 0.5 - 12) / 6.5) < 1) s.set(x, y, 0);
    s.ellipse(16, 22, 3, 3, P.gold).ellipse(16, 22, 1.5, 1.5, 0).rect(15, 24, 2, 6, P.gold).rect(12, 26, 8, 2, P.gold);
  });
  it(0x10d, (s) => {
    s.line(10, 28, 20, 12, P.woodShade).line(11, 28, 21, 12, P.wood);
    s.ellipse(21, 10, 4, 5, P.fire).ellipse(21, 11, 2.5, 3, P.orange).ellipse(21, 12, 1.2, 1.5, P.goldLight);
  });
  {
    const open = recolour(u3Figure('chest', 0), {});
    open.rect(9, 9, 14, 4, P.charcoalShade).rect(10, 10, 12, 2, P.gold);
    t.set(0x10e, unrim(open).rim());
  }
  it(0x10f, (s) => {
    s.ellipse(14, 17, 9, 7, P.leatherShade).ellipse(13.5, 16.5, 8, 6, P.leatherLight).ellipse(11, 14, 3, 2, P.tanLight);
    s.rect(21, 18, 7, 3, P.bone).ellipse(28, 19.5, 2, 2, P.boneLight);
  });
  it(0x116, (s) => s.ellipse(16, 16, 9, 9, P.boneShade).ellipse(15, 15, 8, 8, P.bone).ellipse(12, 12, 3, 3, P.white));
  // The regalia and the moonstone.
  it(0x1b4, (s) => {
    s.ellipse(16, 17, 8, 10, P.charcoal).ellipse(15.5, 16.5, 7, 9, P.slate).ellipse(13, 12, 3, 4, P.slateLight);
    const r = rng(0x1b4);
    speckle(s, 6, P.royalLight, r, (x, y) => Math.hypot(x - 16, (y - 17) * 0.8) < 7);
  });
  it(0x1b5, (s) => {
    s.rect(6, 16, 20, 8, P.goldShade).rect(6, 16, 20, 6, P.gold);
    s.poly(
      [
        [6, 17],
        [8, 7],
        [12, 14],
        [16, 5],
        [20, 14],
        [24, 7],
        [26, 17],
      ],
      P.gold,
    );
    s.rect(15, 18, 3, 3, P.red).rect(9, 18, 2, 2, P.magic).rect(22, 18, 2, 2, P.magic).hline(7, 25, 16, P.goldLight);
  });
  it(0x1b6, (s) => {
    s.line(10, 28, 22, 8, P.goldShade).line(11, 28, 23, 8, P.gold);
    s.ellipse(23, 7, 4, 4, P.goldShade).ellipse(23, 7, 3, 3, P.red).set(22, 6, P.redLight);
  });
  it(0x1b7, (s) => {
    s.ellipse(16, 10, 8, 7, P.gold).ellipse(16, 10, 6.5, 5.5, 0);
    for (let y = 3; y < 18; y++)
      for (let x = 8; x < 25; x++) if (Math.hypot((x + 0.5 - 16) / 6.5, (y + 0.5 - 10) / 5.5) < 1) s.set(x, y, 0);
    s.ellipse(16, 21, 5, 6, P.goldShade).ellipse(16, 21, 4, 5, P.royal).ellipse(15, 19, 1.5, 2, P.royalLight);
  });
  // Magic in flight.
  it(0x1d4, (s) => {
    s.line(4, 16, 28, 16, P.magic).line(16, 4, 16, 28, P.magic).line(8, 8, 24, 24, P.magicShade).line(24, 8, 8, 24, P.magicShade);
    s.ellipse(16, 16, 4, 4, P.magicLight).ellipse(16, 16, 2, 2, P.white);
  });
  it(0x1d5, (s) =>
    s
      .ellipse(16, 16, 8, 8, P.fireShade)
      .ellipse(15, 15, 6.5, 6.5, P.fire)
      .ellipse(14, 14, 3.5, 3.5, P.orange)
      .ellipse(13, 13, 1.5, 1.5, P.goldLight),
  );
  it(0x1d6, (s) => s.ellipse(16, 16, 7, 7, P.magicShade).ellipse(15, 15, 5.5, 5.5, P.magic).ellipse(14, 14, 2.5, 2.5, P.magicLight));
  it(0x1d7, (s) => s.ellipse(16, 16, 4, 4, P.magicShade).ellipse(15.5, 15.5, 3, 3, P.magic).set(15, 15, P.magicLight));
  // Fields: poison, sleep, fire, energy - each its own element, roiling in two frames (fields.ts).
  for (const [i, kind] of (['poison', 'sleep', 'fire', 'energy'] as const).entries()) {
    t.set(0x1e8 + i, magicField(kind, 0));
    frames.set(0x1e8 + i, [magicField(kind, 1)]);
  }
  // A corpse: bones in a stain.
  it(0x11f, (s) => {
    s.ellipse(16, 20, 11, 6, P.redShade).ellipse(15, 19, 8, 4, P.red);
    s.ellipse(11, 17, 3.5, 3, P.bone).rect(10, 16, 1, 1, P.charcoal).rect(12, 16, 1, 1, P.charcoal);
    s.line(15, 20, 25, 18, P.bone).line(16, 22, 24, 23, P.boneShade);
  });
}

// --- Mounts and craft --------------------------------------------------------------------------------

/** A ship seen bow on (north) or stern on (south): hull, and its sails when set. */
function shipEnd(bow: boolean, sails: boolean, dark: boolean): Sprite {
  const s = new Sprite();
  const [hs, hb, hl] = [P.woodShade, P.wood, P.woodLight];
  s.poly(
    [
      [7, 18],
      [25, 18],
      [23, 28],
      [9, 28],
    ],
    hb,
  );
  s.rect(7, 18, 18, 2, hl).rect(9, 26, 14, 2, hs);
  if (bow)
    s.poly(
      [
        [13, 28],
        [19, 28],
        [16, 31],
      ],
      hs,
    );
  else s.rect(10, 20, 12, 4, hs).rect(12, 21, 3, 2, P.goldLight).rect(17, 21, 3, 2, P.goldLight);
  s.vline(16, 2, 18, P.woodShade);
  if (sails) {
    const [ss, sb] = dark ? [P.charcoalShade, P.charcoal] : [P.boneShade, P.bone];
    s.rect(8, 5, 17, 6, ss).rect(8, 5, 16, 5, sb).rect(10, 12, 13, 5, ss).rect(10, 12, 12, 4, sb);
  } else {
    s.hline(8, 24, 6, P.woodShade).hline(10, 22, 12, P.woodShade);
    s.rect(9, 5, 15, 2, P.boneShade).rect(11, 11, 11, 2, P.boneShade);
  }
  s.rect(17, 1, 5, 3, dark ? P.black : P.red);
  return s.rim();
}

/** A ship from the side, bow to the east: the ultima3 frigate, or furled (masts and yards bare). */
function shipSide(name: 'frigate' | 'pirate-ship', furled: boolean): Sprite {
  const s = unrim(u3Figure(name, 0));
  if (furled) {
    // Take the sails in: keep the hull (the lower rows) and draw bare masts.
    for (let y = 0; y < 20; y++) for (let x = 0; x < SIZE; x++) s.px[y * SIZE + x] = 0;
    s.vline(11, 4, 20, P.woodShade).vline(21, 6, 20, P.woodShade);
    s.rect(7, 8, 9, 2, P.boneShade).rect(17, 10, 9, 2, P.boneShade);
  }
  return s.rim();
}

function craft(t: Map<number, Sprite>): void {
  const horse = unrim(u3Figure('horse', 0));
  const horse1 = unrim(u3Figure('horse', 1));
  // The ultima3 horse faces west.
  t.set(0x110, horse.clone().rim());
  t.set(0x111, horse.flipX().rim());
  // (Mounted, the two are one figure: beasts.ts.)
  void horse1;
  // A skiff with its oarsman, west and east.
  const skiff = (): Sprite => {
    const s = new Sprite();
    s.poly(
      [
        [3, 20],
        [29, 20],
        [26, 27],
        [7, 27],
      ],
      P.wood,
    );
    s.hline(3, 29, 20, P.woodLight).hline(7, 26, 26, P.woodShade);
    s.ellipse(16, 11, 3, 3, P.person).rect(13, 14, 7, 7, P.olive).line(10, 26, 22, 14, P.woodShade);
    return s;
  };
  t.set(0x128, skiff().rotate().rotate().rotate().rim());
  t.set(0x129, skiff().flipX().rim());
  t.set(0x12a, skiff().rotate().rim());
  t.set(0x12b, skiff().rim());
  // Frigates, set and furled, N E S W; pirate ships N E S W.
  t.set(0x120, shipEnd(true, true, false));
  t.set(0x121, shipSide('frigate', false).flipX());
  t.set(0x122, shipEnd(false, true, false));
  t.set(0x123, shipSide('frigate', false));
  t.set(0x124, shipEnd(true, false, false));
  t.set(0x125, shipSide('frigate', true).flipX());
  t.set(0x126, shipEnd(false, false, false));
  t.set(0x127, shipSide('frigate', true));
  t.set(0x12c, shipEnd(true, true, true));
  t.set(0x12d, shipSide('pirate-ship', false).flipX());
  t.set(0x12e, shipEnd(false, true, true));
  t.set(0x12f, shipSide('pirate-ship', false));
  // The whirlpool, turning.
  const w0 = unrim(u3Figure('whirlpool', 0));
  const w1 = unrim(u3Figure('whirlpool', 1));
  put4(t, 0x1ec, [w0.rim(), w1.rim(), w0.rotate().rim(), w1.rotate().rim()]);
}

// --- People ------------------------------------------------------------------------------------------

/** The upper body of a figure (rows above `cut`), sitting: moved down, legs folded forward. */
function seated(fig: Sprite, facing: 'n' | 'e' | 's' | 'w'): Sprite {
  const src = unrim(fig);
  const s = new Sprite();
  const cut = 21;
  for (let y = 0; y < cut; y++)
    for (let x = 0; x < SIZE; x++) if (src.px[y * SIZE + x] >>> 24) s.px[(y + 6) * SIZE + x] = src.px[y * SIZE + x];
  if (facing === 'n')
    s.map((rgb, _x, y) => (y < 16 && y > 6 && (rgb === P.person || rgb === P.personLight || rgb === P.personShade) ? P.leatherShade : rgb));
  if (facing === 'w') return s.flipX().rim();
  return s.rim();
}

/** The ultima3 figures' skin as the people of Sosaria have it (the monsters keep ultima3's). */
const PERSON = { [C('#f3cec2')]: P.personLight, [C('#dcafa6')]: P.person, [C('#ad7975')]: P.personShade };

function people(t: Map<number, Sprite>): void {
  const cls = (name: string): [Sprite, Sprite] => [recolour(u3Class(name, 0), PERSON), recolour(u3Class(name, 1), PERSON)];
  const fig = (name: string): [Sprite, Sprite] => [recolour(u3Figure(name, 0), PERSON), recolour(u3Figure(name, 1), PERSON)];
  const avatar = cls('paladin');
  t.set(0x11c, unrim(avatar[0]).rim());
  put4(t, 0x14c, four(...avatar));
  put4(t, 0x140, four(...cls('wizard')));
  const green = { [C('#e77b81')]: P.leafLight, [C('#ae4551')]: P.leaf, [C('#713440')]: P.leafShade };
  const bard = cls('lark').map((s) => recolour(s, green)) as [Sprite, Sprite];
  put4(t, 0x144, four(...bard));
  put4(t, 0x148, four(...cls('fighter')));
  const townsman = fig('merchant');
  put4(t, 0x150, four(...townsman));
  const apron = { [C('#879337')]: P.bone, [C('#bcc65b')]: P.boneLight, [C('#515d28')]: P.boneShade };
  const merchant = townsman.map((s) => recolour(s, apron)) as [Sprite, Sprite];
  put4(t, 0x154, four(...merchant));
  put4(t, 0x158, four(...fig('jester')));
  const child = cls('thief').map((s) =>
    shrink(unrim(recolour(s, { [C('#478d92')]: P.red, [C('#78b7b7')]: P.redLight, [C('#2b565f')]: P.redShade })), 0.72),
  ) as [Sprite, Sprite];
  put4(t, 0x15c, four(...child));
  const rags = { [C('#5d6377')]: P.leather, [C('#71788e')]: P.leatherLight, [C('#494d5d')]: P.leatherShade };
  put4(t, 0x168, four(...(fig('cutpurse').map((s) => recolour(s, rags)) as [Sprite, Sprite])));
  put4(t, 0x16c, four(...cls('druid')));
  put4(t, 0x170, four(...fig('guard')));
  // A ghost: a pale figure, see-through, arms raised.
  const ghost = [u3Figure('ghoul', 0), u3Figure('ghoul', 1)].map((s) =>
    fade(
      unrim(s).map((rgb) => {
        const l = ((rgb >> 16) + ((rgb >> 8) & 0xff) + (rgb & 0xff)) / 3;
        return l > 190 ? P.foam : l > 140 ? P.magicLight : P.magic;
      }),
      190,
    ),
  ) as [Sprite, Sprite];
  put4(t, 0x174, [ghost[0].rim(60), ghost[1].rim(60), ghost[0].clone().rim(60), ghost[1].clone().rim(60)]);
  const lb = fig('lord-british');
  put4(t, 0x17c, four(...lb));
  const dark = { [C('#a778f5')]: P.redShade, [C('#bc90fd')]: P.red, [C('#9160f3')]: P.charcoal };
  put4(t, 0x178, four(...(lb.map((s) => recolour(s, dark)) as [Sprite, Sprite])));
  // Sitting: on a chair facing each way (0x130-0x133), eating at a table facing south and north.
  const sit = townsman[0];
  t.set(0x130, seated(sit, 'n'));
  t.set(0x131, seated(sit, 'e'));
  t.set(0x132, seated(sit, 's'));
  t.set(0x133, seated(sit, 'w'));
  for (let i = 0; i < 4; i++) {
    const s = seated(i % 2 ? townsman[1] : townsman[0], 's');
    t.set(0x134 + i, nudge(s, 0, i === 2 ? 1 : 0));
    t.set(0x138 + i, nudge(seated(i % 2 ? townsman[1] : townsman[0], 'n'), 0, i === 2 ? 1 : 0));
  }
  // At the mirror, at the harpsichord, at the loom: by the facing the game gives.
  const facings = ['n', 'e', 's', 'w'] as const;
  facings.forEach((f, i) => {
    t.set(
      0x13c + i,
      f === 'w'
        ? unrim(townsman[i % 2])
            .flipX()
            .rim()
        : unrim(townsman[i % 2]).rim(),
    );
    t.set(0x160 + i, seated(bard[i % 2], f));
    t.set(0x164 + i, seated(merchant[i % 2], f));
  });
  // Climbing a ladder, up and down; asleep in bed; unseen; falling.
  const climber = unrim(avatar[0]);
  for (const [tile, up] of [
    [0x117, true],
    [0x118, false],
  ] as const) {
    const s = new Sprite();
    s.rect(8, 0, 3, SIZE, P.goldShade).rect(21, 0, 3, SIZE, P.goldShade);
    for (let y = 2; y < SIZE; y += 5) s.rect(8, y, 16, 2, P.gold);
    s.over(up ? climber : nudge(climber, 0, 3));
    t.set(tile, s.rim());
  }
  t.set(
    0x11d,
    (() => {
      const s = new Sprite();
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (!climber.isSet(x, y)) continue;
          const edge = !climber.isSet(x - 1, y) || !climber.isSet(x + 1, y) || !climber.isSet(x, y - 1) || !climber.isSet(x, y + 1);
          if (edge) s.set(x, y, P.magicLight, 200);
        }
      }
      return s;
    })(),
  );
  t.set(0x11e, shrink(climber.rotate(), 0.85).rim());
}

// --- Creatures ---------------------------------------------------------------------------------------

function creatures(t: Map<number, Sprite>): void {
  // From ultima3.
  put4(t, 0x1c4, four(u3Figure('skeleton', 0), u3Figure('skeleton', 1)));
  put4(t, 0x1d8, four(u3Figure('daemon', 0), u3Figure('daemon', 1)));
  // Ultima V's dragons are green: the ultima3 dragon in the snake's greens.
  const green = { [C('#ef0504')]: P.snakeLight, [C('#c00202')]: P.leaf, [C('#920201')]: P.snake, [C('#640101')]: P.snakeShade };
  put4(t, 0x1dc, four(recolour(u3Figure('dragon', 0), green), recolour(u3Figure('dragon', 1), green)));
  put4(t, 0x1e4, four(u3Figure('balron', 0), u3Figure('balron', 1)));
  const garg = four(u3Figure('gargoyle', 0), u3Figure('gargoyle', 1));
  put4(t, 0x1f0, garg);
  put4(t, 0x188, four(u3Figure('serpent', 0), u3Figure('serpent', 1)));
  const troll = [u3Figure('troll', 0), u3Figure('troll', 1)].map((s) =>
    recolour(s, { [C('#47912d')]: C('#d29260'), [C('#31771a')]: C('#be7a49'), [C('#2d6115')]: C('#a56132') }),
  ) as [Sprite, Sprite];
  put4(t, 0x1c0, four(...troll));
  // An ettin: the giant, with a second head.
  const ettin = [u3Figure('giant', 0), u3Figure('giant', 1)].map((g) => {
    const s = unrim(g);
    const head: [number, number][] = [];
    for (let y = 0; y < 9; y++) for (let x = 8; x < 24; x++) if (s.isSet(x, y)) head.push([x, y]);
    for (const [x, y] of head) {
      const v = s.px[y * SIZE + x];
      if (x - 6 >= 0) s.px[(y + 1) * SIZE + x - 6] = v;
    }
    return s.map((rgb) =>
      rgb === C('#f5c18f') ? P.daemon : rgb === C('#fdd7a9') ? P.daemonLight : rgb === C('#dca576') ? P.daemonShade : rgb,
    );
  }) as [Sprite, Sprite];
  put4(t, 0x1cc, four(...ettin));
  // A headless: the zombie with no head, the stump red.
  const headless = [u3Figure('zombie', 0), u3Figure('zombie', 1)].map((z) => {
    const s = unrim(z);
    let top = SIZE;
    for (let y = 0; y < SIZE && top === SIZE; y++) for (let x = 0; x < SIZE; x++) if (s.isSet(x, y)) top = y;
    for (let y = top; y < top + 7; y++) for (let x = 0; x < SIZE; x++) s.px[y * SIZE + x] = 0;
    for (let x = 0; x < SIZE; x++) if (s.isSet(x, top + 7)) s.set(x, top + 7, P.red);
    return s;
  }) as [Sprite, Sprite];
  put4(t, 0x1b8, four(...headless));
  // A mimic: the chest, then its lid open on teeth.
  {
    const c = unrim(u3Figure('chest', 0));
    const bite = c.clone();
    bite.rect(8, 10, 16, 6, P.redShade);
    for (let x = 9; x < 23; x += 3) bite.rect(x, 10, 2, 2, P.bone).rect(x + 1, 14, 2, 2, P.bone);
    bite.set(11, 8, P.goldLight).set(20, 8, P.goldLight);
    put4(t, 0x1a8, [c.clone().rim(), bite.rim(), c.clone().rim(), nudge(bite, 0, -1).rim()]);
  }
  // A gremlin: the goblin small and green.
  const gremlin = [u3Figure('goblin', 0), u3Figure('goblin', 1)].map((g) =>
    unrim(recolour(g, { [C('#d29260')]: P.snakeLight, [C('#be7a49')]: P.snake, [C('#a56132')]: P.snakeShade })),
  ) as [Sprite, Sprite];
  put4(t, 0x1a4, four(...gremlin));

  // The rest Ultima III never had: drawn on its grid, in its manner.
  beasts(t);
}

export function tiles(): Group {
  const t = new Map<number, Sprite>();
  const frames = new Map<number, Sprite[]>();
  items(t, frames);
  craft(t);
  people(t);
  creatures(t);
  oddments(t);
  return { tiles: t, frames };
}
