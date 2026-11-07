/**
 * steamMenu.ts
 *
 * The title's Steam (beta) menu, in the desktop app: the same six lines whatever stands, so that it reads the same each
 * time - Back, Play from Steam, Cloud Saves, Copy report, Report an issue and Paths - each saying at the foot, as the
 * bar is on it, what it does and how it stands; one that can't be changed here is grey and says why. Every option is
 * off until turned on and undone when turned off. Play from Steam is the option itself on a Mac (Steam's own settings
 * changed); on Windows and Linux it opens its own menu (the launch line to paste, its Copy, the compatibility tool on
 * Linux). Cloud Saves (cloudSwitch.ts) is switched only in a Steam launch. Paths shows where Steam, the game and its
 * Steam saves were found, only when chosen. Turning an option on or off is the app's to do
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

/** A menu's lines for what stands now, drawn again from fresh state after each choice. */
type Build = (s: SteamStatus | null, o: SteamChoices, check: LineCheck | null) => Line[];

/** The Steam (beta) menu, until Back. */
export async function steamMenu(g: Game): Promise<void> {
  const steam = g.hooks.steam;
  if (!steam) return;
  await run(g, steam, TITLE, (s, o, check) => menuLines(g, steam, s, o, check));
  await restoreView(g);
}

/** A menu of `title` over what Steam has now, read again after each choice, until Back (its first line). */
async function run(g: Game, steam: SteamHook, title: string, build: Build): Promise<void> {
  let at = 0;
  for (;;) {
    let s: SteamStatus | null = null;
    try {
      s = await steam.status();
    } catch {
      // Said in the notes: the menu still opens, with the tester's buttons.
    }
    const o = steam.options();
    // The launch line is read back only where it is on, and not in a Steam launch, which shows it works.
    const reads = s !== null && s.system !== 'mac' && o.playLine && !s.launch;
    const check = reads ? await steam.lineState().catch(() => null) : null;
    const lines = build(s, o, check);
    at = await choose(g, title, lines, Math.min(at, lines.length - 1));
    if (at <= 0) return;
    await lines[at].act?.();
  }
}

/**
 * The menu's lines, the same six whatever stands, so that it reads the same each time: Back, Play from Steam, Cloud
 * Saves, the tester's two, and Paths. What a line does, and how it stands, is its note at the foot.
 */
function menuLines(g: Game, steam: SteamHook, s: SteamStatus | null, o: SteamChoices, check: LineCheck | null): Line[] {
  const say = async (text: string): Promise<void> => void (await showText(g, TITLE, wrap(text)));
  return [
    { label: 'Back', note: '' },
    playLine(g, steam, s, o, check, say),
    cloudLine(g, steam, s, o, say),
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
    {
      label: 'Paths',
      note: 'Where the app found Steam, Ultima V and its Steam saves.',
      act: async () => void (await showText(g, 'Paths', paths(s))),
    },
  ];
}

/** Letters the game's font can't draw (it is 7-bit), as '?'. */
const drawable = (text: string): string => text.replace(/[^\x20-\x7e]/g, '?');

/** What Paths shows: Steam's folder, the game's, where its Steam saves go, and this copy's launch line. */
function paths(s: SteamStatus | null): string[] {
  if (s === null) return wrap('What Steam has could not be read here.');
  const part = (head: string, text: string): string[] => [head, ...wrap(drawable(text)), ''];
  const out: string[] = [];
  if (s.steam === null) out.push(...part('Steam:', 'not found.'));
  else out.push(...part('Steam:', s.steam));
  if (s.game === 'ok') out.push(...part('Ultima V:', s.where), ...part('Steam saves:', `${s.where}/ultima5-sp/<account>`));
  else if (s.game === 'missing') out.push(...part('Ultima V:', `listed in ${s.where}, but its folder is not there.`));
  else out.push(...part('Ultima V:', 'not installed in Steam.'));
  out.push(`Steam account: ${s.account ? 'known' : 'not known'}`, `Started by Steam: ${s.launch ? 'yes' : 'no'}`);
  if (s.line !== null) out.push('', ...part('Launch line:', s.line));
  return out;
}

/** What Steam has could not be read: the line grey, and its note says so. */
const UNREAD = 'What Steam has could not be read here.';

/**
 * Play from Steam's line. On a Mac it is the option itself; on Windows and Linux it opens Play from Steam's own menu
 * (the launch line, its Copy, the compatibility tool), and its note says how what is on stands.
 */
function playLine(
  g: Game,
  steam: SteamHook,
  s: SteamStatus | null,
  o: SteamChoices,
  check: LineCheck | null,
  say: (text: string) => Promise<void>,
): Line {
  if (s === null)
    return { label: `Play from Steam: ${onOff(o.playLine || o.compatTool || o.macPlay)}`, enabled: false, rest: true, note: UNREAD };
  const noSteam = s.steam === null ? NO_STEAM : null;
  if (s.system === 'mac') {
    const play = option(
      'Play from Steam',
      o.macPlay,
      o.macPlay ? MAC_NOTE : "Play from Steam (changes Steam's settings): Play starts this engine.",
      noSteam,
      toggler(g, steam, s, o, 'macPlay', say),
    );
    const held = o.macPlay && s.launch ? { enabled: false, rest: true, note: MAC_QUIT_FIRST } : {};
    return { ...play, ...held };
  }
  const on = o.playLine || o.compatTool;
  const note = !on
    ? s.system === 'windows'
      ? "Steam's Play starts this engine, by a line you paste. Choose to set it up."
      : "Steam's Play starts this engine: a launch line or a compat. tool."
    : o.playLine
      ? lineSays(s, check)
      : 'Compat. tool on: in Steam, choose Ultima V SP under Compatibility.';
  // Without Steam there is nothing to set up, but what is on may be turned off, and the Flatpak's AppImage is offered.
  const blocked = !on && noSteam !== null && !s.flatpak;
  return {
    label: `Play from Steam: ${onOff(on)}`,
    note: blocked ? noSteam : note,
    enabled: !blocked,
    rest: blocked,
    act: () =>
      run(g, steam, 'Play from Steam', (s2, o2, c2) =>
        s2 === null ? [{ label: 'Back', note: UNREAD }] : playMenu(g, steam, s2, o2, c2, say),
      ),
  };
}

/** How the launch line stands while it is on: known to work in a Steam launch, else what Steam has saved of it. */
const lineSays = (s: SteamStatus, check: LineCheck | null): string =>
  s.launch
    ? 'Steam started this game: Play from Steam works.'
    : check === null
      ? "Steam's launch line can't be read here."
      : LINE_SAYS[check.state];

/** Play from Steam's own menu on Windows and Linux: the launch line, its Copy, and on Linux the compatibility tool. */
function playMenu(
  g: Game,
  steam: SteamHook,
  s: SteamStatus,
  o: SteamChoices,
  check: LineCheck | null,
  say: (text: string) => Promise<void>,
): Line[] {
  const noSteam = s.steam === null ? NO_STEAM : null;
  const cannot =
    s.line !== null
      ? null
      : s.system === 'windows'
        ? "The portable Ultima V can't be started by Steam. Use the installed one."
        : "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.";
  const out: Line[] = [{ label: 'Back', note: '' }];
  if (s.flatpak) {
    out.push({
      label: 'Get the AppImage',
      note: 'The AppImage works better with Steam: its download page.',
      act: async () => {
        steam.open(APPIMAGE_PAGE);
        await say(`Opened in your browser: ${APPIMAGE_PAGE}`);
      },
    });
  }
  out.push(
    option(
      'Launch line',
      o.playLine,
      o.playLine ? lineSays(s, check) : 'Steam starts this engine by a line you paste into Launch Options.',
      noSteam ?? cannot,
      toggler(g, steam, s, o, 'playLine', say),
    ),
    o.playLine
      ? { label: 'Copy launch line', note: "The line to paste into Ultima V's Launch Options in Steam.", act: () => copyLine(steam, say) }
      : { label: 'Copy launch line', enabled: false, rest: true, note: 'Turn the launch line on first.' },
  );
  if (s.system === 'linux') {
    out.push(
      option(
        'Compat. tool',
        o.compatTool,
        o.compatTool && check?.bothLinux
          ? 'Unused: the launch line is on too, and Steam runs that.'
          : 'A compatibility tool, Ultima V SP, chosen in Steam.',
        noSteam ?? cannot,
        toggler(g, steam, s, o, 'compatTool', say),
      ),
    );
  }
  return out;
}

/**
 * A Play option turned the other way, with what the app says of it: a Mac warned first, and asked to quit Steam.
 * Turned off with Cloud saves on for an account here, the player is asked first: the saves made from Steam come back
 * only by turning Cloud saves off from a game Steam started.
 */
function toggler(
  g: Game,
  steam: SteamHook,
  s: SteamStatus,
  o: SteamChoices,
  name: PlayOption,
  say: (text: string) => Promise<void>,
): () => Promise<void> {
  return async () => {
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
}

/**
 * Cloud Saves' line, always shown: switched only in a Steam launch that knows its account and has the game's folder
 * (where the saves go), on or off. On a Mac it is turned on only with Play on, but one that is on may always be turned
 * off there. Outside a Steam launch it is On where it is on for any account here. A launch that knows no account while
 * it is on for one here can't use it, and says so rather than Off.
 */
function cloudLine(g: Game, steam: SteamHook, s: SteamStatus | null, o: SteamChoices, say: (text: string) => Promise<void>): Line {
  if (s === null) return { label: `Cloud Saves: ${onOff(o.cloudAny)}`, enabled: false, rest: true, note: UNREAD };
  // Unlike Play, never switched outside a Steam launch, on or off: Steam's folder is only known in one.
  const cannot = !s.launch
    ? 'Start Ultima V from Steam to change this.'
    : s.game !== 'ok'
      ? "Ultima V's folder in Steam isn't there, so this can't change now."
      : !s.account
        ? "Steam didn't say which account is playing, so this can't change now."
        : null;
  const notYet = s.system === 'mac' && !o.macPlay ? "Turn Play from Steam on first: a Mac's Steam keeps these saves only then." : null;
  const on = s.launch ? o.cloud : o.cloudAny;
  const line = option('Cloud Saves', on, 'Steam Cloud saves: saves made in Steam launches stay with Steam.', cannot ?? notYet, async () =>
    say(await switchCloud(g, steam.cloud, !o.cloud)),
  );
  const unknown = s.launch && !s.account && o.cloudAny;
  return {
    ...line,
    ...(unknown ? { label: 'Cloud Saves: Unknown' } : {}),
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
