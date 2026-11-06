// The Steam options (the Steam (beta) menu), kept per machine in steam-options.json in the app's data folder. Every
// option is off until the player turns it on, and a missing, unreadable or mangled file reads as all off, so that
// nothing touches Steam's folders on a guess. Cloud saves is per Steam account, as the saves are.
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { OVERRIDE } = require('./steamSetup.cjs');

const fresh = () => ({ playLine: false, compatTool: false, macPlay: false, cloud: {}, results: {}, lineOnAt: 0 });

const plain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What `file` holds, field by field: whatever is not as it should be is off (or empty, or 0). */
function readOptions(file) {
  const o = fresh();
  let got;
  try {
    got = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return o;
  }
  if (!plain(got)) return o;
  for (const name of ['playLine', 'compatTool', 'macPlay']) o[name] = got[name] === true;
  if (plain(got.cloud)) for (const [account, on] of Object.entries(got.cloud)) if (on === true) o.cloud[account] = true;
  if (plain(got.results)) for (const [name, text] of Object.entries(got.results)) if (typeof text === 'string') o.results[name] = text;
  if (Number.isFinite(got.lineOnAt) && got.lineOnAt > 0) o.lineOnAt = got.lineOnAt;
  return o;
}

/** `o` written to `file`, whole or not at all. A failure to write is not fatal. */
function writeOptions(file, o) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(o));
    renameSync(temp, file);
  } catch (e) {
    console.warn('steam options:', e?.message ?? e);
  }
}

const STEAM_STILL_RUNNING = "Steam didn't quit. Quit it yourself, then try again.";
/** Which options each system has: a launch line where one is pasted, the tool on Linux, the cache edit on a Mac. */
const HAS = { windows: ['playLine'], linux: ['playLine', 'compatTool'], mac: ['macPlay'] };

/** The launch line's way into Steam, and on Linux the Proton that makes Steam download a Windows game at all. */
const pasteLine = (system) =>
  'Copy the launch line, then in Steam: Ultima V > Properties > General > Launch Options, and paste it.' +
  (system === 'linux' ? ' Choose Proton under Compatibility too, so Steam downloads the game.' : '');

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
      if (on) o.cloud[account] = true;
      else delete o.cloud[account];
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
      return done(
        true,
        'done',
        'Done. Restart Steam, then in Ultima V > Properties > Compatibility, choose Ultima V SP. Steam downloads the game, ' +
          'and Play starts this engine.' +
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
    return done(options[name], `failed: ${why}`, `That didn't work: ${why}`);
  }
}

module.exports = { readOptions, writeOptions, switchOption };
