/**
 * steamMenu.ts
 *
 * The title's Steam (beta) menu, in the desktop app: what the app found of Steam (its folder, Ultima V in its
 * libraries, the account), then the options for this system, each off until turned on and undone when turned off -
 * Play from Steam (a launch line to paste on Windows and Linux, the compatibility tool on Linux, Steam's own settings
 * changed on a Mac) and Steam Cloud saves (cloudSwitch.ts) - and two buttons for testers: Copy report and Report an
 * issue. The menu is narrow, so each option's full name and what it does is its note, at the foot as the bar is on
 * it; an option that can't be changed here says why there instead. Turning one on or off is the app's to do
 * (desktop/steamOptions.cjs switchOption), and the menu is drawn again from what then stands.
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
const MAC_NOTE =
  "If Play in Steam ever says 'Invalid platform', Steam has refreshed Ultima V's settings. Open this app once with " +
  'Steam closed (or let it quit Steam) and it puts things back.';

/** What Steam's saved launch line was found to be, and what to do about it. */
const LINE_SAYS: Record<LineCheck['state'], string> = {
  correct: "Steam's launch line is found and right: Play starts this engine.",
  missing: `Steam has no launch line for Ultima V. Copy it, then: ${PASTE}`,
  'not-seen': "Steam's launch line isn't seen yet: Steam saves it when it closes. Look again after.",
  stale: "Steam's launch line is out of date: it starts an engine somewhere else. Copy this one over it.",
  twice: "Steam's launch line is pasted twice. Clear it, then paste it once.",
};

/** A line of the menu, and what choosing it does. */
type Line = Item & { act?: () => Promise<void> };

const grey = (label: string): Line => ({ label, enabled: false });
const said = (text: string): Line[] => wrap(text).map(grey);
const onOff = (on: boolean): string => (on ? 'On' : 'Off');

/** The menu's head: what the app found of Steam, Ultima V and the account. */
function found(s: SteamStatus | null): string[] {
  if (s === null) return ['What Steam has could not be read here.'];
  if (s.steam === null) return ['Steam: not found. Install Steam and start it once, then come back.'];
  const game =
    s.game === 'ok'
      ? `Ultima V: installed in ${s.where}`
      : s.game === 'missing'
        ? `Ultima V: Steam lists it in ${s.where}, but its folder is not there.`
        : 'Ultima V: not installed in Steam.';
  return [`Steam: ${s.steam}`, game, `Steam account: ${s.account ? 'known' : 'not known'}`, ...(s.launch ? ['Started from Steam.'] : [])];
}

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
  const lines: Line[] = [{ label: 'Back', note: '' }, ...found(s).flatMap(said)];
  if (s?.flatpak) {
    lines.push(grey(''), ...said('The AppImage works better with Steam.'), {
      label: 'Get the AppImage',
      note: 'Its download page, in your browser.',
      act: async () => {
        steam.open(APPIMAGE_PAGE);
        await say(`Opened in your browser: ${APPIMAGE_PAGE}`);
      },
    });
  }
  if (s !== null) {
    lines.push(grey(''), ...playLines(g, steam, s, o, check, say), cloudLine(g, steam, s, o, say));
  }
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
  /** The option turned the other way, with what the app says of it: a Mac warned first, and asked to quit Steam. */
  const toggle = (name: PlayOption) => async (): Promise<void> => {
    const on = !o[name];
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
    return [
      option(
        'Play from Steam',
        o.macPlay,
        "Play from Steam (changes Steam's settings): Play starts this engine.",
        noSteam,
        toggle('macPlay'),
      ),
      ...(o.macPlay ? said(MAC_NOTE) : []),
    ];
  }
  const cannot =
    s.line !== null
      ? null
      : s.system === 'windows'
        ? "The portable Ultima V can't be started by Steam. Use the installed one."
        : "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.";
  const out: Line[] =
    s.system === 'windows'
      ? [
          option(
            'Play from Steam',
            o.playLine,
            "Play from Steam: Steam's Play starts this engine, by a line you paste.",
            noSteam ?? cannot,
            toggle('playLine'),
          ),
        ]
      : [
          grey('Play from Steam:'),
          option(
            'Launch line',
            o.playLine,
            'Play from Steam: launch line. Steam starts this by a line you paste.',
            noSteam ?? cannot,
            toggle('playLine'),
          ),
        ];
  if (o.playLine) {
    const state = s.launch
      ? 'Steam started this game, so Play from Steam works.'
      : check === null
        ? "Steam's launch line can't be read here."
        : LINE_SAYS[check.state] +
          (check.bothLinux ? ' Both are on: Steam runs the launch line, and the compatibility tool goes unused.' : '');
    out.push(...said(state), {
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
        'Play from Steam: compatibility tool, chosen in Steam.',
        noSteam ?? cannot,
        toggle('compatTool'),
      ),
    );
  }
  return out;
}

/**
 * Steam Cloud saves' line: switched only in a Steam launch that knows its account and has the game's folder (where the
 * saves go), and on a Mac only with Play on.
 */
function cloudLine(g: Game, steam: SteamHook, s: SteamStatus, o: SteamChoices, say: (text: string) => Promise<void>): Line {
  const why = !s.launch
    ? 'Start Ultima V from Steam to change this.'
    : s.game !== 'ok'
      ? "Ultima V's folder in Steam isn't there, so this can't change now."
      : !s.account
        ? "Steam didn't say which account is playing, so this can't change now."
        : s.system === 'mac' && !o.macPlay
          ? "Turn Play from Steam on first: a Mac's Steam keeps these saves only then."
          : null;
  return {
    ...option('Cloud saves', o.cloud, 'Steam Cloud saves: saves made in Steam launches stay with Steam.', why, async () =>
      say(await switchCloud(g, steam.cloud, !o.cloud)),
    ),
    // Unlike Play, never switched outside a Steam launch, on or off: Steam's folder is only known in one.
    ...(why !== null ? { enabled: false, rest: true, note: why } : {}),
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
