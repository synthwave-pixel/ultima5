/**
 * fakeMapDom.ts
 *
 * Just enough of a page for the world map (ui/mapView.ts) to run in Node: elements that keep their styles and
 * children, canvases whose pictures are kept (every putImageData, every drawImage), a window of a set size whose
 * timeouts wait for the test to run them, frames that never come, and the party's blink held for the test to fire. A
 * test reads back what the map put on the screen with `shot()`: a short hash of each picture, the view's placings,
 * and the legend's words, read from its pixels against the font it was drawn in.
 */

import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { glyphPixel, type Font } from '../src/data/font.ts';

type Listener = (e: unknown) => void;

class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class FakeContext {
  imageSmoothingEnabled = true;
  fillStyle: unknown = '';
  constructor(private readonly canvas: FakeElement) {}
  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  fillRect(): void {}
  getImageData(_x: number, _y: number, w: number, h: number): FakeImageData {
    return new FakeImageData(w, h);
  }
  putImageData(img: FakeImageData): void {
    this.canvas.put = { width: img.width, height: img.height, data: img.data.slice() };
  }
  drawImage(_src: unknown, x: number, y: number, w: number, h: number): void {
    this.canvas.draws.push([x, y, w, h]);
  }
}

export class FakeElement {
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  listeners = new Map<string, Listener[]>();
  parent: FakeElement | null = null;
  width = 300;
  height = 150;
  clientWidth = 0;
  clientHeight = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  src = '';
  alt = '';
  draggable = true;
  /** A canvas's last picture put on it, and the pictures drawn on it since the last shot. */
  put: { width: number; height: number; data: Uint8ClampedArray } | null = null;
  draws: number[][] = [];
  private ctx: FakeContext | null = null;
  constructor(readonly tag: string) {}
  set textContent(_v: string) {
    for (const c of this.children) c.parent = null;
    this.children = [];
  }
  append(...els: FakeElement[]): void {
    for (const el of els) this.appendChild(el);
  }
  appendChild(el: FakeElement): FakeElement {
    el.parent = this;
    this.children.push(el);
    return el;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  fire(type: string, e: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  setPointerCapture(): void {}
  getContext(): FakeContext {
    this.ctx ??= new FakeContext(this);
    return this.ctx;
  }
}

const hash = (data: Uint8ClampedArray): string => createHash('sha1').update(data).digest('hex').slice(0, 16);

/** The legend's words, read back from its pixels: each letter's top-left pixel white where `font` sets it. */
export function readLegend(canvas: FakeElement, font: Font): string {
  const img = canvas.put;
  if (!img) return '';
  const s = img.height / 16;
  const n = Math.round((img.width / s - 12) / 8);
  const x0 = Math.round((img.width - n * 8 * s) / 2);
  const y0 = Math.round((img.height - 8 * s) / 2);
  const white = (x: number, y: number): boolean => img.data[(y * img.width + x) * 4] === 254;
  const codes = [...Array.from({ length: 96 }, (_, i) => i + 32), ...Array.from({ length: 32 }, (_, i) => i)];
  let out = '';
  for (let i = 0; i < n; i++) {
    const code = codes.find((c) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) if (glyphPixel(font, c, x, y) !== white(x0 + (i * 8 + x) * s, y0 + y * s)) return false;
      return true;
    });
    out += code === undefined ? '?' : String.fromCharCode(code);
  }
  return out;
}

export interface FakePage {
  body: FakeElement;
  /** Every element the map made, in the order made. */
  made: FakeElement[];
  /** Run the timeouts waiting (a slide landing). */
  flush(): void;
  /** The party's blink, once. */
  blink(): void;
  /** What the map shows now, the legend read in `font`. */
  shot(font: Font): Record<string, unknown>;
  /** The page put back as it was. */
  restore(): void;
}

/** A page of `width` by `height` for the map, its globals stubbed till `restore()`. */
export function fakePage(width = 1280, height = 800): FakePage {
  const body = new FakeElement('body');
  const made: FakeElement[] = [];
  let timeouts: (() => void)[] = [];
  let blinker: (() => void) | null = null;
  const win = new FakeElement('window');
  Object.assign(win, {
    innerWidth: width,
    innerHeight: height,
    setTimeout: (fn: () => void) => timeouts.push(fn),
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    body,
    createElement: (tag: string) => {
      const el = new FakeElement(tag);
      made.push(el);
      return el;
    },
  });
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('setInterval', (fn: () => void) => {
    blinker = fn;
    return 0;
  });
  vi.stubGlobal('clearInterval', () => {
    blinker = null;
  });
  return {
    body,
    made,
    flush: () => {
      const run = timeouts;
      timeouts = [];
      for (const fn of run) fn();
    },
    blink: () => blinker?.(),
    shot: (font) => {
      const overlay = body.children[0];
      if (!overlay) return { open: false };
      const [frame, legend] = overlay.children;
      const shown = frame.children[0];
      const out: Record<string, unknown> = {
        frame: { width: frame.style.width, height: frame.style.height, border: frame.style.border, cursor: frame.style.cursor },
        shows: shown?.tag ?? null,
      };
      if (shown?.tag === 'img')
        out.cloth = { src: shown.src, width: shown.style.width, height: shown.style.height, at: shown.style.transform };
      for (const el of made.filter((e) => e.tag === 'canvas' && e !== legend)) {
        if (el.put) out[`picture ${el.put.width}x${el.put.height}`] = hash(el.put.data);
        if (el.draws.length) out[`view ${el.width}x${el.height}`] = el.draws.map((d) => d.join(','));
        el.draws = [];
      }
      out.legend = legend.style.display === 'none' ? null : { text: readLegend(legend, font), width: legend.width, height: legend.height };
      return out;
    },
    restore: () => vi.unstubAllGlobals(),
  };
}
