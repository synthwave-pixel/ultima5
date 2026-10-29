/**
 * armNames.ts
 *
 * The armaments' short names (DATA.OVL 0x1962, 1988's: "Sht. Sword", "Myst. Armr"), wherever a line has no room for
 * the long - Ztats, the attack line, a narrow list - with a few respelt by the port where 1988's read badly. Each kept
 * at its table's width, so 1988's lists line up as they did.
 */

import type { Game } from './game.ts';

/** The port's spellings, by 1988's. */
const RESPELT: Record<string, string> = {
  'Sht. Sword': 'Sh. Sword',
  'Spkd. Shld': 'Spike Shld',
  'Thrwng Axe': 'Throw Axe',
};

/** The short names, as the port shows them. */
export function shortArmNames(g: Game): string[] {
  return g.data.table(0x1962, 0x38).map((n) => {
    const better = RESPELT[n.trim()];
    return better === undefined ? n : better.padEnd(n.length);
  });
}
