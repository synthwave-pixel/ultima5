/**
 * touch.ts
 *
 * A virtual controller for touch screens (and the mouse): a d-pad at the
 * lower left, A and B at the lower right in the Xbox arrangement (A low,
 * B up and to its right) with Y above B and X above A, a close button at
 * the upper left, a pause button at the top centre, and at the upper
 * right a full-screen switch where full screen can be had (fullScreen.ts: the
 * desktop app's window, or the browser's), its corners drawn out to go full
 * screen and in to leave it. Everything is drawn as one-pixel lines at
 * three-quarter white, each with a one-pixel rim of half black on either
 * side so it reads over any ground, and nothing inside, so the game shows
 * through. Sizes are in millimetres, which CSS scales by the device's
 * pixel ratio, so the pad is about the size of an NES controller's on any
 * screen (the d-pad half as large again, for thumbs on glass).
 *
 * The pad sends the same codes as a gamepad (game/io.ts Pad). A tap anywhere shows it; only its
 * close button hides it (or a physical key or gamepad press, so a mouse
 * user who clicked once is not stuck with it). Whether it is shown is
 * remembered between visits.
 */

import { K, Pad } from '../game/io.ts';
import type { FullScreen } from './fullScreen.ts';

/** Sizes in millimetres: the NES d-pad is about 24 across and its buttons about 10; thumbs on glass want more, the d-pad most. */
const DPAD_MM = 42;
const BUTTON_MM = 14;
const SMALL_MM = 10;
const MARGIN_MM = 8;
/** Holding a d-pad direction repeats it, as a held key does. */
const REPEAT_FIRST_MS = 250;
const REPEAT_MS = 120;

const STROKE = 'rgba(255,255,255,0.75)';
const RIM = 'rgba(0,0,0,0.5)';
/** One CSS pixel is 0.26 mm (CSS defines the millimetre as 96/25.4 px), whatever the screen's density. */
const PX = 0.26;
const SVG = 'http://www.w3.org/2000/svg';

export interface TouchPadOptions {
  /** Hand a press to the game (the DOS key or controller code). */
  send: (code: number) => void;
  /** Called on every press: the game switches to controller mode. */
  onPress: () => void;
  /** Called when the pad is shown or hidden, to remember it. */
  onToggle: (shown: boolean) => void;
  shown: boolean;
  /** Full screen, for the switch at the upper right; null where it cannot be had (no switch). */
  fullScreen: FullScreen | null;
}

export class TouchPad {
  private readonly root: HTMLDivElement;
  private repeat: ReturnType<typeof setTimeout> | null = null;
  /** The element whose hold is repeating: only its own lifting ends it (a tap on A while walking does not). */
  private repeating: SVGElement | null = null;
  private _shown = false;

  constructor(private readonly options: TouchPadOptions) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;z-index:10;';
    document.body.appendChild(this.root);

    this.root.appendChild(this.dpad());
    // A low and B up to its right, as on an Xbox pad; Y above B and X above A.
    this.root.appendChild(this.button('A', Pad.A, `right:${MARGIN_MM + BUTTON_MM + 1}mm;bottom:${MARGIN_MM}mm`));
    this.root.appendChild(this.button('B', Pad.B, `right:${MARGIN_MM}mm;bottom:${MARGIN_MM + BUTTON_MM + 1}mm`));
    const gap = Math.SQRT2 * (BUTTON_MM + 1) - BUTTON_MM;
    this.root.appendChild(this.button('Y', Pad.Y, `right:${MARGIN_MM}mm;bottom:${(MARGIN_MM + 2 * BUTTON_MM + 1 + gap).toFixed(1)}mm`));
    this.root.appendChild(
      this.button('X', Pad.X, `right:${MARGIN_MM + BUTTON_MM + 1}mm;bottom:${(MARGIN_MM + BUTTON_MM + gap).toFixed(1)}mm`),
    );
    this.root.appendChild(this.closeButton());
    this.root.appendChild(this.pauseButton());
    if (options.fullScreen) this.root.appendChild(this.fullScreenSwitch(options.fullScreen));

    // A tap or click anywhere shows the pad; a physical key hides it.
    window.addEventListener('pointerdown', () => {
      if (!this._shown) this.show(true);
    });
    // iOS WebKit zooms in on a double-tapped element whatever the CSS and
    // viewport say, unless the page cancels the tap itself: the pad works
    // through pointer events, so the touch events can be cancelled outright,
    // and the pinch gesture with them. Nothing else on the page needs them.
    const cancel = (e: Event) => e.preventDefault();
    document.addEventListener('touchend', cancel, { passive: false });
    document.addEventListener('touchmove', cancel, { passive: false });
    document.addEventListener('gesturestart', cancel, { passive: false });
    document.addEventListener('dblclick', cancel);
    window.addEventListener('keydown', (e) => {
      if (this._shown && !e.metaKey && !e.ctrlKey && !e.altKey) this.show(false);
    });
    this.show(options.shown, true);
  }

  get shown(): boolean {
    return this._shown;
  }

  /** Show or hide the pad. */
  show(on: boolean, quiet = false): void {
    this._shown = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) this.release();
    if (!quiet) this.options.onToggle(on);
  }

  /** An SVG of `mm` millimetres square placed with the given CSS position, with a safe-area inset added. */
  private svg(mm: number, position: string): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${mm} ${mm}`);
    svg.setAttribute('width', `${mm}mm`);
    svg.setAttribute('height', `${mm}mm`);
    svg.style.cssText = `position:absolute;${position};pointer-events:none;overflow:visible;touch-action:none;`;
    // Keep clear of notches and rounded corners.
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const m = position.match(new RegExp(`${side}:([0-9.]+)mm`));
      if (m) svg.style.setProperty(side, `calc(${m[1]}mm + env(safe-area-inset-${side}, 0px))`);
    }
    return svg;
  }

  /**
   * A shape drawn as a one-pixel line over a three-pixel rim of half black
   * (one pixel showing either side), with a transparent fill so taps inside
   * it count. Both are added to `svg`; the line is returned, since it is
   * what presses recolour. `rim: false` for hit zones that are never seen.
   */
  private shape(svg: SVGSVGElement, kind: 'path' | 'circle' | 'rect', attrs: Record<string, string>, rim = true): SVGElement {
    const make = (stroke: string, width: number) => {
      const el = document.createElementNS(SVG, kind);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.setAttribute('fill', 'transparent');
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', `${width}`);
      el.setAttribute('stroke-linejoin', 'round');
      return el;
    };
    if (rim) {
      const under = make(RIM, 3 * PX);
      under.style.pointerEvents = 'none';
      svg.appendChild(under);
    }
    const el = make(STROKE, PX);
    svg.appendChild(el);
    return el;
  }

  /**
   * Make an element a button: pressing pushes `key`; the d-pad's repeat while held. Pressed, its line brightens;
   * let go, it is drawn as it was - a d-pad arm's unseen zone unseen again, not left outlined.
   */
  private pressable(el: SVGElement, key: number, repeats: boolean): void {
    el.style.pointerEvents = 'all';
    el.style.cursor = 'pointer';
    const stroke = el.getAttribute('stroke') ?? STROKE;
    const width = el.getAttribute('stroke-width') ?? `${PX}`;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      el.setAttribute('stroke', '#fff');
      el.setAttribute('stroke-width', `${2 * PX}`);
      this.press(key);
      if (repeats) {
        this.release();
        this.repeating = el;
        this.repeat = setTimeout(() => {
          this.repeat = setInterval(() => this.press(key), REPEAT_MS);
        }, REPEAT_FIRST_MS);
      }
    };
    const up = () => {
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', width);
      if (this.repeating === el) this.release();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private press(key: number): void {
    this.options.onPress();
    this.options.send(key);
  }

  private release(): void {
    if (this.repeat !== null) {
      clearTimeout(this.repeat);
      clearInterval(this.repeat);
      this.repeat = null;
    }
    this.repeating = null;
  }

  /** The d-pad: a cross outline, its four arms the buttons, with a small circle in each. */
  private dpad(): SVGSVGElement {
    const svg = this.svg(DPAD_MM, `left:${MARGIN_MM}mm;bottom:${MARGIN_MM}mm`);
    const s = DPAD_MM;
    const a = s / 3; // arm width
    const c = s / 2;
    const r = s / 14; // the marks' radius
    this.shape(svg, 'path', {
      d: `M${a} 0 H${2 * a} V${a} H${s} V${2 * a} H${2 * a} V${s} H${a} V${2 * a} H0 V${a} H${a} Z`,
    });
    // Each arm's hit zone, and the centre of the circle marking it.
    const arms: [number, string, number, number][] = [
      [K.Up, `M${a} 0 H${2 * a} V${a} H${a} Z`, c, a / 2],
      [K.Down, `M${a} ${2 * a} H${2 * a} V${s} H${a} Z`, c, s - a / 2],
      [K.Left, `M0 ${a} H${a} V${2 * a} H0 Z`, a / 2, c],
      [K.Right, `M${2 * a} ${a} H${s} V${2 * a} H${2 * a} Z`, s - a / 2, c],
    ];
    for (const [key, hit, cx, cy] of arms) {
      const mark = this.shape(svg, 'circle', { cx: `${cx}`, cy: `${cy}`, r: `${r}` });
      const zone = this.shape(svg, 'path', { d: hit }, false);
      zone.setAttribute('stroke', 'none');
      this.pressable(zone, key, true);
      // The zone brightens the arrow rather than itself.
      zone.addEventListener('pointerdown', () => mark.setAttribute('stroke', '#fff'));
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
        zone.addEventListener(ev, () => mark.setAttribute('stroke', STROKE));
    }
    return svg;
  }

  /** A round button with its letter drawn as an outline. */
  private button(label: string, key: number, position: string): SVGSVGElement {
    const svg = this.svg(BUTTON_MM, position);
    const r = BUTTON_MM / 2;
    const circle = this.shape(svg, 'circle', { cx: `${r}`, cy: `${r}`, r: `${r - 0.5}` });
    // The letter, as an outline over its rim like the shapes.
    for (const [stroke, width] of [
      [RIM, 3 * PX],
      [STROKE, PX],
    ] as const) {
      const text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', `${r}`);
      text.setAttribute('y', `${r + 2}`);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '6');
      text.setAttribute('fill', 'transparent');
      text.setAttribute('stroke', stroke);
      text.setAttribute('stroke-width', `${width}`);
      text.setAttribute('stroke-linejoin', 'round');
      text.style.pointerEvents = 'none';
      text.textContent = label;
      svg.appendChild(text);
    }
    this.pressable(circle, key, false);
    return svg;
  }

  /** Upper left: a circled cross that hides the pad. */
  private closeButton(): SVGSVGElement {
    const svg = this.svg(SMALL_MM, `left:${MARGIN_MM}mm;top:${MARGIN_MM}mm`);
    const r = SMALL_MM / 2;
    const circle = this.shape(svg, 'circle', { cx: `${r}`, cy: `${r}`, r: `${r - 0.5}` });
    const cross = this.shape(svg, 'path', { d: `M${r - 2} ${r - 2} L${r + 2} ${r + 2} M${r + 2} ${r - 2} L${r - 2} ${r + 2}` });
    cross.style.pointerEvents = 'none';
    circle.style.pointerEvents = 'all';
    circle.style.cursor = 'pointer';
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.show(false);
    });
    return svg;
  }

  /**
   * Top centre: two bars in a circle, the Pause menu (the ultima3 port's). It stands in for a controller's Start and
   * Select, which a touch screen has not, and sits away from the thumbs so a fight does not stop by accident.
   */
  private pauseButton(): SVGSVGElement {
    const svg = this.svg(SMALL_MM, `left:50%;top:${MARGIN_MM}mm`);
    svg.style.transform = 'translateX(-50%)';
    const r = SMALL_MM / 2;
    const circle = this.shape(svg, 'circle', { cx: `${r}`, cy: `${r}`, r: `${r - 0.5}` });
    const bars = this.shape(svg, 'path', { d: `M${r - 1.5} ${r - 2} V${r + 2} M${r + 1.5} ${r - 2} V${r + 2}` });
    bars.style.pointerEvents = 'none';
    this.pressable(circle, Pad.Start, false);
    return svg;
  }

  /**
   * Upper right: a square with corner marks, the switch for full screen - the marks pointing out while windowed (to go
   * full screen), in while full screen (to leave it), whichever way full screen last came or went.
   */
  private fullScreenSwitch(full: FullScreen): SVGSVGElement {
    const svg = this.svg(SMALL_MM, `right:${MARGIN_MM}mm;top:${MARGIN_MM}mm`);
    const s = SMALL_MM;
    const box = this.shape(svg, 'rect', { x: '0.5', y: '0.5', width: `${s - 1}`, height: `${s - 1}`, rx: '1' });
    const corners = this.shape(svg, 'path', { d: fullScreenMarks(s, full.on) });
    corners.style.pointerEvents = 'none';
    // The marks' rim (shape) is drawn under them as an element of its own, and turns with them.
    const marks = [corners.previousElementSibling, corners].filter((m): m is Element => m !== null);
    full.onChange((on) => {
      for (const m of marks) m.setAttribute('d', fullScreenMarks(s, on));
    });
    box.style.pointerEvents = 'all';
    box.style.cursor = 'pointer';
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      full.toggle();
    });
    return svg;
  }
}

/**
 * The full-screen switch's four corner marks in a square `s` across: each an L in its corner, pointing out (to go full
 * screen) or, `on` full screen, turned to point in (to leave it).
 */
export function fullScreenMarks(s: number, on: boolean): string {
  const [a, b, c, d] = [2.5, 4.5, s - 4.5, s - 2.5];
  return on
    ? `M${b} ${a} V${b} H${a} M${c} ${a} V${b} H${d} M${d} ${c} H${c} V${d} M${a} ${c} H${b} V${d}`
    : `M${a} ${b} V${a} H${b} M${c} ${a} H${d} V${b} M${d} ${c} V${d} H${c} M${b} ${d} H${a} V${c}`;
}
