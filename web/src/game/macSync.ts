/**
 * macSync.ts
 *
 * macOS Sync, in the desktop app: whether Cloud saves made on this machine reach a Mac, as the app found it
 * (desktop/main.cjs syncState), said in the game's own words - by the title each launch while something is wrong
 * (boot.ts), and in the Steam (beta) menu (steamMenu.ts). Steam marks each Cloud save it uploads with the systems the
 * game's cloud rules name, and EA's name Windows alone: a Mac never downloads what Linux or Windows sends unless the
 * rules there are given MacOS (Fix Cloud for Mac), and a save already sent that way is re-marked to go up again.
 */

import type { SyncState } from '../install/sources.ts';

/** Whether there is anything to say: macOS Sync on, and Cloud saves made here (on a Mac, elsewhere) not reaching a Mac. */
export function syncProblem(s: SyncState | null | undefined): boolean {
  if (!s || !s.on) return false;
  const stuck = (s.stuck ?? 0) > 0;
  return s.system === 'mac' ? stuck : s.rules === 'needed' || s.rules === 'unreadable' || stuck;
}

/**
 * Whether the fix can be made from here: the rules given MacOS only where Steam may be closed from here (outside
 * Steam, not the Flatpak, not Game Mode); saves only re-marked, where the rules have MacOS already, anywhere. Never on
 * a Mac, nor where the rules can't be read.
 */
export function syncFixable(s: SyncState): boolean {
  if (s.system === 'mac' || s.rules === 'unreadable') return false;
  if (s.rules === 'needed') return s.canFix;
  return (s.stuck ?? 0) > 0;
}

/** Where to go to fix the rules, when not from here. */
function whereToFix(s: SyncState): string {
  if (s.flatpak) return 'Use the AppImage to fix it: the Flatpak cannot close Steam.';
  return s.deck
    ? 'To fix it, open this app in Desktop Mode, outside Steam: Steam (beta) > Fix Cloud for Mac.'
    : 'To fix it, open this app outside Steam: Steam (beta) > Fix Cloud for Mac.';
}

const saves = (n: number): string => `${n} Cloud ${n === 1 ? 'save' : 'saves'}`;

/** What is wrong, in a sentence or two, and what to do where it can't be fixed from here. */
export function syncText(s: SyncState): string {
  const n = s.stuck ?? 0;
  if (s.system === 'mac')
    return `${saves(n)} can't reach this Mac: Steam on the computer that made them sends them to Windows alone. Fix it there: Steam (beta) > Fix Cloud for Mac.`;
  if (s.rules === 'unreadable')
    return "Cloud saves made here may not reach a Mac: Steam's settings for Ultima V couldn't be read. Copy report in Steam (beta) and report an issue, or turn macOS Sync off there.";
  const what =
    s.rules === 'needed'
      ? "Cloud saves made here don't reach a Mac: Steam's settings for Ultima V send them to Windows alone."
      : `${saves(n)} made here ${n === 1 ? 'was' : 'were'} sent to Windows alone, and ${n === 1 ? "doesn't" : "don't"} reach a Mac.`;
  return syncFixable(s) ? what : `${what} ${whereToFix(s)}`;
}

/** The fix's label: said to restart Steam where it closes it. */
export function fixLabel(s: SyncState): string {
  return s.rules === 'needed' && s.steamRunning ? 'Fix now (restarts Steam)' : 'Fix now';
}

/** macOS Sync's line in the menu: how it stands, as its note - short, for the menu's foot (four narrow rows). */
export function syncNote(s: SyncState | null | undefined, optionOn: boolean): string {
  const n = s?.stuck ?? 0;
  if (s?.system === 'mac')
    return syncProblem(s)
      ? `${n} ${n === 1 ? 'save' : 'saves'} can't reach this Mac: fix it where made.`
      : 'A Mac sends its Cloud saves everywhere: nothing to set.';
  if (!optionOn) return "Off: Cloud saves made here aren't checked for a Mac.";
  if (!s) return "Couldn't check that Cloud saves reach a Mac.";
  if (!s.on) return 'Checks Cloud saves reach a Mac, once Play from Steam is on.';
  if (s.rules === 'unreadable') return "Steam's settings can't be read: Copy report, report it.";
  if (s.rules === 'needed') return 'Steam sends Cloud saves made here to Windows alone.';
  if (n > 0) return `${n} ${n === 1 ? 'save' : 'saves'} made here went to Windows alone.`;
  return s.rules === 'ready' ? 'Checked: Cloud saves made here reach a Mac.' : 'Checked: Steam has no Ultima V here yet.';
}

/** Fix Cloud for Mac's note in the menu: what it does, or where it can be done instead - short, as syncNote. */
export function fixNote(s: SyncState): string {
  if (!syncFixable(s)) {
    if (s.flatpak) return "Use the AppImage: the Flatpak can't close Steam.";
    return s.deck ? 'Fix it in Desktop Mode, outside Steam.' : 'Fix it outside Steam, from the desktop.';
  }
  if (s.rules === 'needed') return `Sends Cloud saves made here to a Mac too.${s.steamRunning ? ' Restarts Steam.' : ''}`;
  const n = s.stuck ?? 0;
  return `Sends the ${n} ${n === 1 ? 'save' : 'saves'} to Steam again, for a Mac too.`;
}
