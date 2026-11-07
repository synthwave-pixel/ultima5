/**
 * steamMenu.ts
 *
 * The title's Steam (beta) menu, in the desktop app: the lines to choose and nothing else (what the app found of
 * Steam, with its paths, is the report's) - the options for this system, each off until turned on and undone when
 * turned off - Play from Steam (a launch line to paste on Windows and Linux, the compatibility tool on Linux, Steam's
 * own settings changed on a Mac) and, in a Steam launch, Steam Cloud saves (cloudSwitch.ts) - and two buttons for
 * testers: Copy report and Report an issue. The menu is narrow, so each option's full name and what it does is its
 * note, at the foot as the bar is on it; one that is on says there how it stands (the launch line Steam has saved), and
 * one that can't be changed here says why. Turning one on or off is the app's to do (desktop/steamOptions.cjs
 * switchOption), and the menu is drawn again from what then stands.
 */

import { switchCloud } from './cloudSwitch.ts';
import type { Game, LineCheck, PlayOption, SteamChoices, SteamHook, SteamStatus } from './game.ts';
import { choose, confirm, restoreView, showText, wrap, type Item } from './menu.ts';

/** The game's issues on GitHub, for Report an issue. */
export const ISSUES = 'https://github.com/synthwave-pixel/ultima5/issues';
/** The latest release's page, where the AppImage is downloaded (the Flatpak's Get the AppImage). */
export const APPIMAGE_PAGE = 'https://github.com/synthwave-pixel/ultima5/releases/latest';

const TITLE = 'Steam (beta)';
const NO_STEAM = "Steam isn't here. Install Steam and start it once, then come back.";
const PASTE = 'In Steam: Ultima V > Properties > General > Launch Options, and paste it.';
const MAC_WARNING =
  "This closes Steam and changes Steam's own settings for Ultima V. Steam may undo the change when EA updates the " +
  "game; then this app puts it back. Turning this off puts Steam's settings back as they were.";
// Turning a Mac's Play off quits Steam, which in a Steam launch would end this game and cut short its Cloud sync.
const MAC_QUIT_FIRST = 'Quit the game, then turn this off from outside Steam.';
const CLOUD_STAYS =
  'Saves made from Steam stay with Steam until Cloud saves is turned off from a game Steam started. Turn this off anyway?';
// Play from Steam's note on a Mac while it is on: Steam refreshing Ultima V's settings undoes it, until the app puts it back.
const MAC_NOTE = "If Steam says 'Invalid platform', open this app with Steam closed.";

/** What Steam's saved launch line was found to be, and what to do about it: the launch line's note while it is on. */
const LINE_SAYS: Record<LineCheck['state'], string> = {
  correct: "Steam's launch line is right: Play starts this engine.",
  missing: 'Steam has no launch line yet: copy it, and paste it into Launch Options.',
  'not-seen': 'Steam saves the launch line when it closes: look again after.',
  stale: "Steam's launch line is out of date: copy this one over it.",
  twice: "Steam's launch line is pasted twice: clear it, paste it once.",
};

/** A line of the menu, and what choosing it does. */
type Line = Item & { act?: () => Promise<void> };

const grey = (label: string): Line => ({ label, enabled: false });
const said = (text: string): Line[] => wrap(text).map(grey);
const onOff = (on: boolean): string => (on ? 'On' : 'Off');

/**
 * An option's line: its short name and On or Off, its full name and what it does as its note. Where it can't be
 * turned on here (`why`), it is grey, the bar resting on it to say why; one that is on may always be turned off.
 */
function option(label: string, on: boolean, note: string, why: string | null, act: () => Promise<void>): Line {
  const blocked = !on && why !== null;
  return { label: `${label}: ${onOff(on)}`, note: blocked ? why : note, enabled: !blocked, rest: blocked, act };
}

/** The Steam (beta) menu, until Back. */
export async function steamMenu(g: Game): Promise<void> {
  const steam = g.hooks.steam;
  if (!steam) return;
  let at = 0;
  for (;;) {
    let s: SteamStatus | null = null;
    try {
      s = await steam.status();
    } catch {
      // Said in the head: the menu still opens, with the tester's buttons.
    }
    const o = steam.options();
    // The launch line is read back only where it is on, and not in a Steam launch, which shows it works.
    const reads = s !== null && s.system !== 'mac' && o.playLine && !s.launch;
    const check = reads ? await steam.lineState().catch(() => null) : null;
    const lines = menuLines(g, steam, s, o, check);
    at = await choose(g, TITLE, lines, Math.min(at, lines.length - 1));
    if (at <= 0) {
      await restoreView(g);
      return;
    }
    await lines[at].act?.();
  }
}

/** The menu's lines for what stands now. */
function menuLines(g: Game, steam: SteamHook, s: SteamStatus | null, o: SteamChoices, check: LineCheck | null): Line[] {
  const say = async (text: string): Promise<void> => void (await showText(g, TITLE, wrap(text)));
  const lines: Line[] = [{ label: 'Back', note: '' }];
  if (s?.flatpak) {
    lines.push({
      label: 'Get the AppImage',
      note: 'The AppImage works better with Steam: its download page.',
      act: async () => {
        steam.open(APPIMAGE_PAGE);
        await say(`Opened in your browser: ${APPIMAGE_PAGE}`);
      },
    });
  }
  // Cloud saves is switched only in a Steam launch, so it is a line only there.
  if (s !== null) lines.push(...playLines(g, steam, s, o, check, say), ...(s.launch ? [cloudLine(g, steam, s, o, say)] : []));
  lines.push(
    grey(''),
    {
      label: 'Copy report',
      note: 'A plain-text report of what was found, to paste into an issue.',
      act: async () => {
        try {
          await say((await steam.copyReport()) ? 'Copied. Paste it into your issue on GitHub.' : 'The report could not be made here.');
        } catch {
          await say('The clipboard is not available here.');
        }
      },
    },
    {
      label: 'Report an issue',
      note: "The game's issues page on GitHub, in your browser.",
      act: async () => {
        steam.open(ISSUES);
        await say(`Opened in your browser: ${ISSUES}`);
      },
    },
  );
  return lines;
}

/** Play from Steam's lines for this system, and with a launch line on, what Steam has saved of it. */
function playLines(
  g: Game,
  steam: SteamHook,
  s: SteamStatus,
  o: SteamChoices,
  check: LineCheck | null,
  say: (text: string) => Promise<void>,
): Line[] {
  const noSteam = s.steam === null ? NO_STEAM : null;
  /**
   * The option turned the other way, with what the app says of it: a Mac warned first, and asked to quit Steam. Turned
   * off with Cloud saves on for an account here, the player is asked first: the saves made from Steam come back only by
   * turning Cloud saves off from a game Steam started.
   */
  const toggle = (name: PlayOption) => async (): Promise<void> => {
    const on = !o[name];
    if (!on && o.cloudAny && !(await confirm(g, CLOUD_STAYS))) return;
    if (name === 'macPlay' && on && !(await confirm(g, MAC_WARNING))) return;
    if (name === 'macPlay' && !on && s.steamRunning && !(await confirm(g, 'Steam must be closed for this. Quit Steam now?'))) return;
    let r;
    try {
      r = await steam.setOption(name, on);
    } catch (e) {
      await say(`That didn't work: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (r === null) await say("That can't be changed here.");
    else if (r.line) await showLine(g, steam, r.message, r.line);
    else await say(r.message);
  };
  if (s.system === 'mac') {
    const play = option(
      'Play from Steam',
      o.macPlay,
      o.macPlay ? MAC_NOTE : "Play from Steam (changes Steam's settings): Play starts this engine.",
      noSteam,
      toggle('macPlay'),
    );
    const held = o.macPlay && s.launch ? { enabled: false, rest: true, note: MAC_QUIT_FIRST } : {};
    return [{ ...play, ...held }];
  }
  const cannot =
    s.line !== null
      ? null
      : s.system === 'windows'
        ? "The portable Ultima V can't be started by Steam. Use the installed one."
        : "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.";
  // While it is on, the launch line's note is how Steam's saved line stands.
  const state = s.launch
    ? 'Steam started this game: Play from Steam works.'
    : check === null
      ? "Steam's launch line can't be read here."
      : LINE_SAYS[check.state];
  const out: Line[] =
    s.system === 'windows'
      ? [
          option(
            'Play from Steam',
            o.playLine,
            o.playLine ? state : "Play from Steam: Steam's Play starts this engine, by a line you paste.",
            noSteam ?? cannot,
            toggle('playLine'),
          ),
        ]
      : [
          grey('Play from Steam:'),
          option(
            'Launch line',
            o.playLine,
            o.playLine ? state : 'Play from Steam: launch line. Steam starts this by a line you paste.',
            noSteam ?? cannot,
            toggle('playLine'),
          ),
        ];
  if (o.playLine) {
    out.push({
      label: 'Copy launch line',
      note: "The line to paste into Ultima V's Launch Options in Steam.",
      act: () => copyLine(steam, say),
    });
  }
  if (s.system === 'linux') {
    out.push(
      option(
        'Compat. tool',
        o.compatTool,
        o.compatTool && check?.bothLinux
          ? 'Unused: the launch line is on too, and Steam runs that.'
          : 'Play from Steam: compatibility tool, chosen in Steam.',
        noSteam ?? cannot,
        toggle('compatTool'),
      ),
    );
  }
  return out;
}

/**
 * Steam Cloud saves' line: switched only in a Steam launch that knows its account and has the game's folder (where the
 * saves go), on or off. On a Mac it is turned on only with Play on, but one that is on may always be turned off there.
 * A launch that knows no account while it is on for one here can't use it, and says so rather than Off.
 */
function cloudLine(g: Game, steam: SteamHook, s: SteamStatus, o: SteamChoices, say: (text: string) => Promise<void>): Line {
  // Unlike Play, never switched outside a Steam launch, on or off: Steam's folder is only known in one.
  const cannot = !s.launch
    ? 'Start Ultima V from Steam to change this.'
    : s.game !== 'ok'
      ? "Ultima V's folder in Steam isn't there, so this can't change now."
      : !s.account
        ? "Steam didn't say which account is playing, so this can't change now."
        : null;
  const notYet = s.system === 'mac' && !o.macPlay ? "Turn Play from Steam on first: a Mac's Steam keeps these saves only then." : null;
  const line = option(
    'Cloud saves',
    o.cloud,
    'Steam Cloud saves: saves made in Steam launches stay with Steam.',
    cannot ?? notYet,
    async () => say(await switchCloud(g, steam.cloud, !o.cloud)),
  );
  const unknown = s.launch && !s.account && o.cloudAny;
  return {
    ...line,
    ...(unknown ? { label: 'Cloud saves: Unknown' } : {}),
    ...(cannot !== null
      ? {
          enabled: false,
          rest: true,
          note: unknown ? "Steam didn't say which account is playing, so its Cloud saves can't be used." : cannot,
        }
      : {}),
  };
}

/** The launch line put on the clipboard, and where it goes said. */
async function copyLine(steam: SteamHook, say: (text: string) => Promise<void>): Promise<void> {
  try {
    await say((await steam.copyLine()) ? `Copied. ${PASTE}` : 'This copy of Ultima V has no launch line for Steam.');
  } catch {
    await say('The clipboard is not available here.');
  }
}

/** A launch line just turned on: what to do with it, the line itself, and Copy. */
async function showLine(g: Game, steam: SteamHook, message: string, line: string): Promise<void> {
  const items: Item[] = [...said(message), grey(''), ...said(line), grey(''), { label: 'Copy launch line' }, { label: 'OK' }];
  const copy = items.length - 2;
  if ((await choose(g, 'Play from Steam', items, copy)) !== copy) return;
  await copyLine(steam, async (text) => void (await showText(g, 'Play from Steam', wrap(text))));
}
