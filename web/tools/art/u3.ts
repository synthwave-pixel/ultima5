/**
 * u3.ts
 *
 * The ultima3 port's Standard figures (art/standard/u3/, copied from that
 * project with its atlases' manifests): flat 32-pixel creatures, people
 * and objects in the same style, used where Ultima V has the same thing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, type Image } from '../png.ts';
import { rgba, SIZE, Sprite } from './draw.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../art/standard/u3');

interface Frame {
  x: number;
  y: number;
}

let loaded: { figures: Image; classes: Image; figureRows: Map<string, Frame[]>; classRows: Map<string, Frame[]> } | null = null;

function load(): NonNullable<typeof loaded> {
  if (loaded) return loaded;
  const figures = decodePng(readFileSync(join(DIR, 'figures.png')));
  const classes = decodePng(readFileSync(join(DIR, 'classes.png')));
  const fj = JSON.parse(readFileSync(join(DIR, 'figures.json'), 'utf8')) as { rows: { name: string; frames: Frame[] }[] };
  const cj = JSON.parse(readFileSync(join(DIR, 'classes.json'), 'utf8')) as { classes: { name: string; frames: Frame[] }[] };
  loaded = {
    figures,
    classes,
    figureRows: new Map(fj.rows.map((r) => [r.name, r.frames])),
    classRows: new Map(cj.classes.map((r) => [r.name, r.frames])),
  };
  return loaded;
}

function cut(img: Image, f: Frame): Sprite {
  const s = new Sprite();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = ((f.y + y) * img.width + f.x + x) * 4;
      const a = img.data[o + 3];
      if (a) s.px[y * SIZE + x] = rgba((img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2], a);
    }
  }
  return s;
}

/** A figure from the ultima3 atlas by name (orc, skeleton, daemon, dragon, merchant, horse, frigate, ...), frame 0 or 1. */
export function u3Figure(name: string, frame = 0): Sprite {
  const l = load();
  const frames = l.figureRows.get(name);
  if (!frames) throw new Error(`no ultima3 figure ${name}`);
  return cut(l.figures, frames[Math.min(frame, frames.length - 1)]);
}

/** A class figure from the ultima3 atlas (fighter, paladin, barbarian, cleric, druid, wizard, illusionist, alchemist, ranger, lark, thief). */
export function u3Class(name: string, frame = 0): Sprite {
  const l = load();
  const frames = l.classRows.get(name);
  if (!frames) throw new Error(`no ultima3 class ${name}`);
  return cut(l.classes, frames[Math.min(frame, frames.length - 1)]);
}
