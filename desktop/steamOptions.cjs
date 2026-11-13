// The Steam options (the Steam (beta) menu), kept per machine in steam-options.json in the app's data folder. Every
// Play option is off until the player turns it on, and an unreadable or mangled file reads as all off, so that nothing
// touches Steam's folders on a guess. Cloud saves is per Steam account, as the saves are: on, off (kept as false, once
// turned off), or not yet chosen. On a machine set up since it became the default - no file yet, so cloudDefault - an
// account not yet chosen for has it turned on at its first Steam launch (the page's cloudSwitch.ts cloudByDefault); a
// file written by an earlier version has no cloudDefault, and its Cloud saves stay as they were. macOS Sync - whether
// the app checks, and offers to fix, that Cloud saves made here reach a Mac - is on unless turned off: it only looks,
// and changes nothing in Steam's folders until the player says to.
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { OVERRIDE } = require('./steamSetup.cjs');

const fresh = () => ({
  playLine: false,
  compatTool: false,
  macPlay: false,
  macSync: true,
  cloud: {},
  results: {},
  lineOnAt: 0,
  cloudDefault: false,
});

const plain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What `file` holds, field by field: whatever is not as it should be is off (or empty, or 0). */
function readOptions(file) {
  const o = fresh();
  let got;
  try {
    got = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    // No file at all: a machine set up since Cloud saves became the default.
    if (e?.code === 'ENOENT') o.cloudDefault = true;
    return o;
  }
  if (!plain(got)) return o;
  for (const name of ['playLine', 'compatTool', 'macPlay', 'cloudDefault']) o[name] = got[name] === true;
  o.macSync = got.macSync !== false;
  if (plain(got.cloud)) for (const [account, on] of Object.entries(got.cloud)) if (typeof on === 'boolean') o.cloud[account] = on;
  if (plain(got.results)) for (const [name, text] of Object.entries(got.results)) if (typeof text === 'string') o.results[name] = text;
  if (Number.isFinite(got.lineOnAt) && got.lineOnAt > 0) o.lineOnAt = got.lineOnAt;
  return o;
}

/** `o` written to `file`, whole or not at all: whether it was. A failure to write is not fatal. */
function writeOptions(file, o) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(o));
    renameSync(temp, file);
    return true;
  } catch (e) {
    console.warn('steam options:', e?.message ?? e);
    return false;
  }
}

const STEAM_STILL_RUNNING = "Steam didn't quit. Quit it yourself, then try again.";
/**
 * Which options each system has: a launch line where one is pasted, the tool on Linux, the cache edit on a Mac, and
 * macOS Sync where Steam's settings may need fixing for a Mac (a Mac's own Play from Steam fixes its own).
 */
const HAS = { windows: ['playLine', 'macSync'], linux: ['playLine', 'compatTool', 'macSync'], mac: ['macPlay'] };

/** The launch line's way into Steam, and on Linux the Proton that makes Steam download a Windows game at all. */
const pasteLine = (system) =>
  'Copy the launch line, then in Steam: Ultima V > Properties > General > Launch Options, and paste it.' +
  (system === 'linux' ? ' Choose Proton under Compatibility too, so Steam downloads the game.' : '');

/** What giving Linux's cloud rules MacOS came to (steamSetup.cjs linuxCloudSetup, main.cjs), said to the player. */
const CLOUD_SAYS = {
  done: "Nothing to do: Steam already sends this computer's Cloud saves to a Mac too.",
  restarted: "Done, and Steam restarted. Steam sends this computer's Cloud saves to a Mac too, from when Ultima V next closes in Steam.",
  'steam-running': "Steam didn't quit, so Cloud saves made here don't reach a Mac yet. Quit Steam, then open this app.",
  'not-owned': "Steam doesn't list Ultima V here.",
  fixed: "Done. Steam sends this computer's Cloud saves to a Mac too, from when Ultima V next closes in Steam.",
  'not-here': 'Open this app outside Steam, from the desktop (on a Steam Deck, Desktop Mode), to do this.',
  flatpak: 'Use the AppImage to fix this: the Flatpak cannot close Steam.',
};

/** What turning macOS Sync on or off means, said as it is switched. */
const SYNC_SAYS = {
  on: 'macOS Sync is on: each time you play, the app checks that Cloud saves made here reach a Mac, and offers to fix it if not.',
  off: "macOS Sync is off: the app doesn't check whether Cloud saves made here reach a Mac.",
};

/** What to tell the player of giving Linux's cloud rules MacOS (CLOUD_SAYS). */
const cloudRuleMessage = (result) => CLOUD_SAYS[result] ?? `That didn't work: ${result}`;

/** What a Mac's setup or removal came to (steamSetup.cjs macSetup, macRestore), said to the player. */
const MAC_SAYS = {
  'on:done': 'Done. Open Steam: it downloads Ultima V if it has not yet, and Play starts this engine.',
  'on:steam-running': STEAM_STILL_RUNNING,
  'on:not-owned': "Steam doesn't list Ultima V on this Mac. Check this Steam account has it, then try again.",
  'on:app-not-in-place': 'Move Ultima V to Applications and open it from there, then turn this on again.',
  'off:done': 'Removed. Ultima V in Steam is as Steam had it.',
  'off:steam-running': STEAM_STILL_RUNNING,
  'off:kept-unusable': "The copy of Steam's own settings for Ultima V kept at setup is damaged, so they were left as they are.",
};

/**
 * Option `name` turned on or off here, with what that does on `system`, and its result kept under its name in
 * `results` (for the tester report): the options as they now are (a copy; the caller writes them), whether it is on,
 * what to tell the player, and on turning a launch line on, the line to show. An effect that fails leaves the option
 * as it was. Cloud saves' copy is the page's, which says how it went: here it is only recorded, for this launch's
 * account (`account`), its value left as it was where the copy `failed`. Null for an option this system has not, or
 * Cloud saves with no account known. `effects` does the work (main.cjs's on Steam's folders; a test's its own).
 */
async function switchOption({ options, name, on, system, account, now, failed, effects }) {
  const o = structuredClone(options);
  const word = on ? 'on' : 'off';
  if (typeof on !== 'boolean') return null;
  if (name === 'cloud') {
    if (!account) return null;
    if (typeof failed === 'string') o.results.cloud = `${word}: failed: ${failed}`;
    else {
      // Kept either way: turned off, it is not turned on again by default.
      o.cloud[account] = on;
      o.results.cloud = `${word}: done`;
    }
    return { options: o, on: o.cloud[account] === true, message: '' };
  }
  if (!(HAS[system] ?? []).includes(name)) return null;
  /** The outcome: the option `now`, the result kept, what to say. */
  const done = (value, result, message, more = {}) => {
    o[name] = value;
    o.results[name] = `${word}: ${result}`;
    return { options: o, on: value, message, ...more };
  };
  try {
    // macOS Sync only checks: switching it changes nothing in Steam's folders.
    if (name === 'macSync') return done(on, 'done', SYNC_SAYS[word]);
    if (name === 'playLine') {
      if (!on) {
        o.lineOnAt = 0;
        return done(false, 'done', 'In Steam: Ultima V > Properties > General > Launch Options, and clear the line. Nothing else was changed.');
      }
      const line = effects.line();
      if (line === null) {
        return done(
          false,
          'no launch line',
          system === 'windows'
            ? 'The portable Ultima V has no fixed place for Steam to start it from. Play from Steam with the installed Ultima V.'
            : "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.",
        );
      }
      // From now until Steam writes its settings again, a line not there is one not seen yet (main.cjs steamLineState).
      o.lineOnAt = now;
      return done(true, 'done', pasteLine(system), { line });
    }
    if (name === 'compatTool') {
      if (!on) {
        effects.removeTool();
        return done(false, 'done', 'Removed. Restart Steam, and choose another compatibility tool for Ultima V, or none.');
      }
      const written = effects.installTool();
      if (written === null) return done(false, 'no launcher', "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.");
      if (written.length === 0) return done(false, 'no Steam folder', "Steam isn't here. Install Steam and start it once, then try again.");
      const flathub = written.some((dir) => dir.includes('com.valvesoftware.Steam'));
      // The game's cloud rules given MacOS too, with macOS Sync on, where Steam may be closed from here; the tool is on
      // whatever comes of it.
      let cloud = null;
      try {
        cloud = effects.linuxCloud && o.macSync ? await effects.linuxCloud() : null;
      } catch (e) {
        console.warn('steam cloud rules:', e?.message ?? e);
      }
      return done(
        true,
        'done',
        (cloud === 'restarted' ? 'Done, and Steam restarted. In' : 'Done. Restart Steam, then in') +
          ' Ultima V > Properties > Compatibility, choose Ultima V SP. Steam downloads the game, and Play starts this engine.' +
          (cloud === 'steam-running' ? ` ${CLOUD_SAYS['steam-running']}` : '') +
          (flathub ? ` Steam from Flathub needs this run once too: ${OVERRIDE}` : ''),
      );
    }
    // A Mac: set up, or taken away. Steam stays as it was where it would not quit; a damaged kept copy can't be put
    // back, and keeping the option on would only have the next start put the edit back again.
    const result = on ? await effects.macSetup() : await effects.macRestore();
    const value = on ? result === 'done' : result === 'steam-running';
    return done(value, result, MAC_SAYS[`${word}:${result}`] ?? `That didn't work: ${result}`);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    // The tool stopped part way while off: whatever folders it wrote are taken away again, as best they can be, so that
    // none is left in Steam's with the option off.
    if (name === 'compatTool' && on && !options.compatTool) {
      try {
        effects.removeTool();
      } catch {
        /* the install's failure is the one said */
      }
    }
    return done(options[name], `failed: ${why}`, `That didn't work: ${why}`);
  }
}

/**
 * An option switched (switchOption) and the options written to `file`, as main.cjs answers the page: whether it is on,
 * what to say, and a launch line to show; null where refused. Where the file can't be written, the switch is not kept:
 * the page is told so, and the option as the file still has it (as the menu and the next launch read it), with no
 * launch line, so that Cloud saves' copy is not followed by a change of where the game keeps its saves this session
 * that the next launch would not make.
 */
async function switchAndKeep(file, args) {
  const r = await switchOption(args);
  if (r === null) return null;
  if (writeOptions(file, r.options)) return { on: r.on, message: r.message, ...(r.line ? { line: r.line } : {}) };
  const was = args.name === 'cloud' ? args.options.cloud[args.account] === true : args.options[args.name];
  if (r.on === was) return { on: was, message: r.message };
  return {
    on: was,
    message:
      args.name === 'cloud'
        ? "The app's settings couldn't be saved, so this can't change now."
        : `${r.message} But the app's settings couldn't be saved, so this shows as it was.`,
  };
}

module.exports = { cloudRuleMessage, readOptions, writeOptions, switchOption, switchAndKeep };
