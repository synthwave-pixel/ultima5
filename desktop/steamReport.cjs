// The report a tester pastes into an issue (the Steam (beta) menu's Copy report): what the engine found of Steam and
// what the options did, as plain text. `report` takes facts and gives text, so it is all testable; main.cjs gathers
// the facts. It holds no save and no file contents, and nothing that names the player: the home folder is written ~,
// user names in paths <user>, the Steam account only as known or not, and SteamUser only as set or not.

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hides what identifies the player in `text`: `home` becomes ~, user names in paths (any folder's) become <user>. */
function mask(text, home) {
  let out = text;
  if (home) {
    // Either slash may stand for the other in a Windows path; a longer name (/home/alice2) is not this home.
    const body = escapeRegExp(home.replace(/[\\/]+$/, '')).replace(/\\\\|\//g, '[\\\\/]');
    out = out.replace(new RegExp(`${body}(?![^\\\\/\\s"'])`, /^[a-z]:/i.test(home) ? 'gi' : 'g'), '~');
  }
  return out
    .replace(/(\/home\/|\/Users\/|\/run\/media\/|\/media\/)[^/\\\s"']+/g, '$1<user>')
    .replace(/([a-z]:[\\/]Users[\\/])[^\\/\s"']+/gi, '$1<user>');
}

const onOff = (on) => (on ? 'on' : 'off');
const yesNo = (yes) => (yes ? 'yes' : 'no');

/** What the rules' check found (steamSetup.cjs cloudCheck), as the report says it. */
const RULES = {
  ready: 'include macOS',
  needed: 'lack macOS (saves uploaded here reach Windows and Linux only)',
  unreadable: "couldn't be read",
  'not-owned': 'not found (Steam has not cached Ultima V here)',
};

/** macOS Sync's part: whether it is on, Steam's cloud rules for the game, and the saves Steam sent to Windows alone. */
function syncLines(system, sync, options) {
  const out = [];
  if (system === 'mac') out.push(`macOS Sync: not needed on a Mac (Play from Steam ${onOff(options.macPlay)})`);
  else out.push(`macOS Sync: ${onOff(options.macSync !== false)}${sync.on || options.macSync === false ? '' : ' (waits for Play from Steam)'}`);
  out.push(`Steam cloud rules: ${RULES[sync.rules] ?? sync.rules}${sync.why ? ` (${sync.why})` : ''}`);
  for (const rule of sync.ruleList ?? []) out.push(`  ${rule}`);
  const stuck = sync.stuck === null ? 'unknown (no Steam account or Cloud record here)' : String(sync.stuck);
  out.push(
    system === 'mac' ? `Cloud saves this Mac can't get (sent to Windows alone): ${stuck}` : `Cloud saves sent to Windows alone, as synced here: ${stuck}`,
  );
  if (system !== 'mac') out.push(`Fix possible from here: ${yesNo(sync.canFix)}`);
  return out;
}

/** The plain-text report for `facts` (steamReport.d.cts). */
function report(f) {
  const lines = ['Ultima V SP report', ''];
  lines.push(`Version: ${f.version}`, `System: ${f.system} (${f.arch})`, `Build: ${f.build}`);
  lines.push(`Started by Steam: ${yesNo(f.bySteam)}`);
  for (const name of ['SteamAppId', 'SteamGameId', 'STEAM_COMPAT_APP_ID']) lines.push(`${name}: ${f.env[name] ?? 'not set'}`);
  lines.push(`SteamUser: ${f.env.SteamUser ? 'set' : 'not set'}`);
  lines.push(`FLATPAK_ID: ${f.env.FLATPAK_ID ?? 'not set'}`);
  lines.push('');

  lines.push(`Steam folder: ${f.steamRoot ?? 'not found'}`);
  for (const library of f.libraries) lines.push(`Library: ${library}`);
  if (f.game === 'ok') lines.push(`Ultima V: installed in ${f.where}`);
  else if (f.game === 'missing') lines.push(`Ultima V: listed by Steam, but its folder is missing (${f.where})`);
  else lines.push('Ultima V: not installed');
  if (f.steamMissing !== null) {
    lines.push(`Ultima V files: ${f.steamMissing === 0 ? 'complete' : `incomplete (${f.steamMissing} missing)`}`);
  }
  // Where the engine took its game files from is what the page recorded when it kept them.
  const from = { steam: "Steam's library", installer: 'the installer' }[f.filesFrom] ?? 'unknown';
  lines.push(`Game files from: ${from}`);
  lines.push('');

  // Only the options this system has.
  const options = {
    windows: [['playLine', 'launch line']],
    linux: [
      ['playLine', 'launch line'],
      ['compatTool', 'compatibility tool'],
    ],
    mac: [['macPlay', 'Mac launch entry']],
  }[f.system] ?? [];
  for (const [name, label] of options) {
    lines.push(`Play from Steam, ${label}: ${onOff(f.options[name])}; last result: ${f.options.results[name] ?? 'none'}`);
  }
  lines.push(`Account: ${f.accountKnown ? 'known' : 'unknown'}`);
  lines.push(`Cloud saves: ${f.cloud === null ? 'not available' : onOff(f.cloud)}`);
  if (f.cloud !== null) lines.push(`Cloud saves, last result: ${f.options.results.cloud ?? 'none'}`);
  if (f.lineState !== null) lines.push(`Launch line seen in Steam: ${f.lineState}`);
  if (f.system === 'mac') {
    lines.push(`Ultima V cache entry patched: ${f.macPatched === null ? 'unknown' : yesNo(f.macPatched)}`);
    lines.push(`Cache entry re-applied at this start: ${f.macReapplied === null ? 'unknown' : yesNo(f.macReapplied)}`);
  }
  if (f.cloud && f.cloudCharacters !== null) lines.push(`Characters in Steam's folder: ${f.cloudCharacters}`);
  if (f.sync) lines.push('', ...syncLines(f.system, f.sync, f.options));
  return mask(lines.join('\n'), f.home) + '\n';
}

module.exports = { mask, report };
