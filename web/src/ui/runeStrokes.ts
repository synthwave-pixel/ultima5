/**
 * runeStrokes.ts
 *
 * A rune of the dungeon's signs in even strokes (2026-11-16, the player's choice): the rune font's letter as the screen
 * sets it, finely (`hi`, a mask `n` a side), thinned to its middle lines (Zhang and Suen's thinning), those lines laid
 * on the sign's own grid (`side` a side) and each made two of its dots wide - every stroke the same weight, where the
 * font set small clumps its heavy joins and leaves its light ones thin. The letter's shapes are the font's.
 */

/** The letter `hi` (`n` a side, set where drawn) as strokes two dots wide on a grid `side` a side. */
export function evenStrokes(hi: Uint8Array, n: number, side: number): Uint8Array {
  const m = Uint8Array.from(hi, (v) => (v ? 1 : 0));
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= n || y >= n ? 0 : m[y * n + x]);
  // Thinned, a pass of each of the two halves of a step at a time, until nothing more comes away.
  for (let changed = true; changed; ) {
    changed = false;
    for (const step of [0, 1]) {
      const gone: number[] = [];
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (!m[y * n + x]) continue;
          // Its eight neighbours, from the one above round to the right.
          const p = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          const set = p.reduce((a, b) => a + b, 0);
          if (set < 2 || set > 6) continue;
          let turns = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) turns++;
          if (turns !== 1) continue;
          const keep = step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6];
          if (!keep) gone.push(y * n + x);
        }
      for (const i of gone) m[i] = 0;
      if (gone.length) changed = true;
    }
  }
  // Its middle lines on the sign's grid, then each dot one more to the right, below and below right: two dots wide.
  const thin = new Uint8Array(side * side);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (m[y * n + x]) thin[Math.floor((y * side) / n) * side + Math.floor((x * side) / n)] = 1;
  const out = thin.slice();
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      if (!thin[y * side + x]) continue;
      if (x + 1 < side) out[y * side + x + 1] = 1;
      if (y + 1 < side) out[(y + 1) * side + x] = 1;
      if (x + 1 < side && y + 1 < side) out[(y + 1) * side + x + 1] = 1;
    }
  return out;
}
