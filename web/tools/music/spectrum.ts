/**
 * spectrum.ts
 *
 * What makes music tiring to hear for hours, measured from its samples - as
 * the sound effects were tuned by (the waterfall: soft above 3 kHz):
 *
 * - presence: the share of its sound from 2 to 5 kHz, where the ear is most
 *   sensitive (the equal-loudness contours' dip), so a little there sounds
 *   loud and much grates;
 * - sibilance: the share from 5 to 10 kHz, the hiss and fizz above it;
 * - tilt: how fast the octaves fall away from 250 Hz to 8 kHz, in dB an
 *   octave - pink noise (0 dB an octave) sounds even, a mix tilting further
 *   down warm, one tilting less bright;
 * - harshest: how loud its brightest seconds are from 2 to 5 kHz, against
 *   the whole tune's loudness, where presence is the tune's average - a
 *   swell that flares, not a quiet solo, being what grates;
 * - range: how far its loudness moves (the 10th to the 95th percentile of
 *   its three-second loudness), little range a wall of sound.
 */

/** A frame of the spectrum: a power of two, about 0.19 s at 44.1 kHz. */
const SIZE = 8192;

/** An in-place radix-2 FFT of `re` and `im` (a power of two long). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const [c, s] = [Math.cos(step * k), Math.sin(step * k)];
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
  }
}

/** The power in each frequency bin (SIZE / 2 + 1 of them) of each frame of `samples`, Hann-windowed, half overlapped. */
export function frames(samples: Float32Array): Float64Array[] {
  const window = Float64Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE));
  const out: Float64Array[] = [];
  for (let at = 0; at + SIZE <= samples.length; at += SIZE / 2) {
    const re = Float64Array.from({ length: SIZE }, (_, i) => samples[at + i] * window[i]);
    const im = new Float64Array(SIZE);
    fft(re, im);
    out.push(Float64Array.from({ length: SIZE / 2 + 1 }, (_, k) => re[k] * re[k] + im[k] * im[k]));
  }
  return out;
}

/** The power of `spectrum` from `lo` to `hi` Hz. */
export function band(spectrum: Float64Array, rate: number, lo: number, hi: number): number {
  let sum = 0;
  for (let k = Math.ceil((lo * SIZE) / rate); k < Math.min(spectrum.length, (hi * SIZE) / rate); k++) sum += spectrum[k];
  return sum;
}

const dB = (x: number): number => 10 * Math.log10(Math.max(x, 1e-30));

/** The octaves measured, by their centres (Hz). */
export const OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export interface Fatigue {
  /** Each octave's share of the whole, dB. */
  octaves: number[];
  presence: number;
  sibilance: number;
  /** dB an octave, 250 Hz to 8 kHz. */
  tilt: number;
  harshest: number;
  range: number;
}

/** The measures of `samples` (mono, at `rate`), as this file's head describes them. */
export function measure(samples: Float32Array, rate: number): Fatigue {
  const all = frames(samples);
  const mean = new Float64Array(SIZE / 2 + 1);
  for (const f of all) for (let k = 0; k < mean.length; k++) mean[k] += f[k] / all.length;
  const total = band(mean, rate, 20, rate / 2);
  const share = (s: Float64Array, lo: number, hi: number): number => dB(band(s, rate, lo, hi) / band(s, rate, 20, rate / 2));
  const octaves = OCTAVES.map((c) => dB(band(mean, rate, c / Math.SQRT2, c * Math.SQRT2) / total));

  // The tilt: the octaves' least-squares slope from 250 Hz to 8 kHz.
  const fit = OCTAVES.map((c, i) => [Math.log2(c), octaves[i]]).filter(([x]) => x >= Math.log2(250) && x <= Math.log2(8000));
  const mx = fit.reduce((a, [x]) => a + x, 0) / fit.length;
  const my = fit.reduce((a, [, y]) => a + y, 0) / fit.length;
  const tilt = fit.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / fit.reduce((a, [x]) => a + (x - mx) ** 2, 0);

  // Seconds (about five frames each, as the frames overlap): their loudness, and their presence where they are loud.
  const per = Math.max(1, Math.round(rate / (SIZE / 2)));
  const seconds: { power: number; presence: number }[] = [];
  for (let i = 0; i + per <= all.length; i += per) {
    const s = new Float64Array(SIZE / 2 + 1);
    for (const f of all.slice(i, i + per)) for (let k = 0; k < s.length; k++) s[k] += f[k];
    seconds.push({ power: band(s, rate, 20, rate / 2), presence: band(s, rate, 2000, 5000) });
  }
  const loudest = Math.max(...seconds.map((s) => s.power));
  const heard = seconds.filter((s) => dB(s.power / loudest) > -20);
  const average = seconds.reduce((a, s) => a + s.power, 0) / seconds.length;
  const harshest = dB(
    percentile(
      heard.map((s) => s.presence),
      0.95,
    ) / average,
  );
  // Three-second loudness, a second apart, those within 20 dB of the loudest.
  const three = seconds.slice(0, -2).map((_, i) => dB(seconds[i].power + seconds[i + 1].power + seconds[i + 2].power));
  const top = Math.max(...three);
  const kept = three.filter((l) => l > top - 20);
  const range = percentile(kept, 0.95) - percentile(kept, 0.1);

  return { octaves, presence: share(mean, 2000, 5000), sibilance: share(mean, 5000, 10000), tilt, harshest, range };
}

/** The value `p` (0 to 1) of the way up `xs` sorted. */
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
}
