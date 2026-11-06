// Finding Steam, Ultima V's folder in it, and the account that launched the game. Everything here is pure: the
// files it needs are read through functions the caller hands in, so it can be tried without a Steam.
const { join } = require('node:path');

/** Ultima V's app id in Steam. */
const APP_ID = '3067520';

/** A launch from Steam is one where Steam says the game is Ultima V; any other id, or none, is not. */
function isSteamLaunch(env) {
  return env.SteamAppId === APP_ID || env.SteamGameId === APP_ID;
}

/**
 * Steam's text format (KeyValues): quoted keys, each with a quoted value or a { block } of more. Keys are case
 * sensitive; \\ and \" in a string are unescaped. A file that is empty or broken gives what was read so far.
 */
function parseVdf(text) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[2] !== undefined ? m[2] : { s: m[1].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)) });
  }
  let i = 0;
  const block = () => {
    const out = {};
    while (i < tokens.length) {
      const key = tokens[i++];
      if (key === '}') return out;
      if (typeof key !== 'object') continue;
      const next = tokens[i];
      if (next === '{') {
        i++;
        out[key.s] = block();
      } else if (typeof next === 'object') {
        i++;
        out[key.s] = next.s;
      }
    }
    return out;
  };
  return block();
}

/** A path made of Windows parts keeps its backslashes; anything else is joined as the system does. */
function joinFor(base, ...parts) {
  if (base.includes('\\') && !base.includes('/')) return [base.replace(/\\+$/, ''), ...parts].join('\\');
  return join(base, ...parts);
}

/** Where Steam may be installed on this system, most likely first. registrySteamPath is Windows' SteamPath value. */
function steamRoots({ platform, home, registrySteamPath }) {
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Steam')];
  if (platform === 'linux') {
    return [
      join(home, '.steam', 'root'),
      join(home, '.local', 'share', 'Steam'),
      join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
    ];
  }
  if (platform === 'win32') {
    const roots = [];
    if (registrySteamPath) roots.push(registrySteamPath);
    roots.push('C:\\Program Files (x86)\\Steam');
    return [...new Set(roots)];
  }
  return [];
}

/** Steam's own folder and every library folder it lists, each once. */
function libraryPaths(root, read) {
  const out = [root];
  const text = read(joinFor(root, 'steamapps', 'libraryfolders.vdf'));
  const folders = text === null ? null : parseVdf(text).libraryfolders;
  if (folders && typeof folders === 'object') {
    for (const entry of Object.values(folders)) {
      const path = entry && typeof entry === 'object' ? entry.path : undefined;
      if (typeof path === 'string' && path && !out.includes(path)) out.push(path);
    }
  }
  return out;
}

/**
 * The library that holds Ultima V's manifest, and the game's folder in it. {missing: library} when the manifest is
 * there but the folder is not (a disk that is not plugged in, say); null when no library has the game.
 */
function findGame(roots, read, exists) {
  const seen = new Set();
  for (const root of roots) {
    for (const library of libraryPaths(root, read)) {
      if (seen.has(library)) continue;
      seen.add(library);
      const text = read(joinFor(library, 'steamapps', `appmanifest_${APP_ID}.acf`));
      if (text === null) continue;
      const state = parseVdf(text).AppState;
      const dir = state && typeof state === 'object' ? state.installdir : undefined;
      if (typeof dir !== 'string' || !dir) continue;
      const folder = joinFor(library, 'steamapps', 'common', dir);
      return exists(folder) ? { library, folder } : { missing: library };
    }
  }
  return null;
}

/**
 * The account that launched the game, as the 32-bit number Steam names its userdata folders with: the low 32 bits
 * of the 64-bit SteamID that keys loginusers.vdf. It is the user Steam says launched (SteamUser), else the one
 * signed in most recently, else none.
 */
function accountId(root, env, read) {
  const text = read(joinFor(root, 'config', 'loginusers.vdf'));
  const users = text === null ? null : parseVdf(text).users;
  if (!users || typeof users !== 'object') return null;
  const entries = Object.entries(users).filter(([id, u]) => /^\d+$/.test(id) && u && typeof u === 'object');
  // Older files write their keys in lower case (mostrecent), so a key is matched whatever its case.
  const field = (u, name) => Object.entries(u).find(([k]) => k.toLowerCase() === name)?.[1];
  const named = env.SteamUser ? entries.find(([, u]) => field(u, 'accountname') === env.SteamUser) : undefined;
  const found = named ?? entries.find(([, u]) => field(u, 'mostrecent') === '1');
  return found ? (BigInt(found[0]) & 0xffffffffn).toString() : null;
}

/** Where a Steam launch keeps its saves: the game's folder, then ultima5-sp, then the account that launched it. */
function saveDir(gameFolder, account) {
  return join(gameFolder, 'ultima5-sp', account);
}

module.exports = { saveDir, APP_ID, isSteamLaunch, parseVdf, steamRoots, libraryPaths, findGame, accountId };
