// Steam's library artwork, put in place by the game itself. Added to Steam as a non-Steam game (the Flatpak on a
// Steam Deck or Bazzite, say), the game has no artwork in Steam's library: Steam takes it only from its own folder,
// userdata/<account>/config/grid/, under the shortcut's id. Launched from such a shortcut, Steam tells the game that
// id (SteamGameId), and the game copies its artwork there (build/steam/, web/tools/key-art.mjs): the portrait and
// wide capsules, the hero and the logo. Steam shows it the next time it starts.
//
// It is done once for each shortcut, and nothing in it can harm the game or the player's Steam:
//   - only for a launch from a non-Steam shortcut (a real Steam app's id, or none, and nothing is done);
//   - only into the account whose shortcuts list that id (shortcuts.vdf), never a guess at another;
//   - never over a picture already there (the player's own artwork is theirs), each one written aside and linked
//     into place, so a picture is there whole or not at all;
//   - every failure (no Steam, a folder that cannot be read or written, a file missing, a disk full) caught and
//     noted, never thrown: the result is only logged;
//   - done once: a note in the app's own data says so, and the next launch from the shortcut does nothing (a launch
//     that found no account listing the shortcut tries again, three times at most) - unless the artwork the app
//     carries has changed since: then a picture still as the app put it there (its fingerprint, noted when written,
//     or one of the pictures earlier versions put there, SHIPPED) is replaced with the new one. A picture the player
//     has changed is theirs, and one they have taken away stays away.
const { createHash } = require('node:crypto');
const fsp = require('node:fs/promises');
const { join } = require('node:path');

/** The artwork, by the name it has in build/steam/ and the suffix Steam gives it after the shortcut's id. */
const ART = [
  ['capsule.png', 'p.png'], // the library's portrait capsule
  ['wide.png', '.png'], // the wide capsule
  ['hero.png', '_hero.png'], // the banner across the game's page
  ['logo.png', '_logo.png'], // the logo laid over the hero
];
/** Where the logo sits on the hero (Steam's own file for it, as its "Adjust logo position" writes). */
const LOGO_POSITION = JSON.stringify({ nVersion: 1, logoPosition: { pinnedPosition: 'BottomLeft', nWidthPct: 42, nHeightPct: 62 } });
const TRIES = 3;
const MAX_PICTURE = 64 * 1024 * 1024;

/** A file's fingerprint. */
const fingerprint = (data) => createHash('sha256').update(data).digest('hex');

/**
 * The pictures earlier versions of the app put in place, by suffix (v1.0.38 to v1.0.41, which noted no fingerprints):
 * such a picture is the app's to replace, as one noted is.
 */
const SHIPPED = {
  'p.png': ['d26052819a645e5fbb48128e621fa9fb7456340dcc477ea915a44605070ebef8'],
  '.png': ['70cde47d9974322f10466e75bf01393d8c9bab6c05b039375653fc044ac3959a'],
  '_hero.png': ['3040eefda248c8acee19c3a9eb5ae3c158ea82ef249938f0c9ac4c4c3959469b'],
  '_logo.png': ['fbb141222e2602db2a516d44c3c0df54a1d92b6f1627ca2096747c771c6ae7ab'],
  '.json': ['2de522f1395d21d289bc4f288a62063072543c02e82d987cd3cb21ebdff21582'],
};
const MAX_VDF = 16 * 1024 * 1024;

/**
 * The 32-bit id of the non-Steam shortcut that launched the game, from Steam's 64-bit game id (its type, in bits 24 to
 * 31, 2 for a shortcut; the id above it, its top bit set) - or null: no id, not a number, a real Steam app's.
 */
function shortcutId(env) {
  for (const name of ['SteamGameId', 'SteamOverlayGameId']) {
    const text = String(env[name] ?? '').trim();
    if (!/^\d{1,20}$/.test(text)) continue;
    let id;
    try {
      id = BigInt(text);
    } catch {
      continue;
    }
    if (id > 0xffffffffffffffffn) continue;
    const low = Number(id & 0xffffffffn);
    const high = Number(id >> 32n);
    if (low >>> 24 === 2 && high >= 0x80000000) return high;
  }
  return null;
}

/** The places Steam keeps its data, for each platform (the first of each found is enough; duplicates are fine). */
function steamRoots({ platform, home, env }) {
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Steam')];
  if (platform === 'win32')
    return [env['ProgramFiles(x86)'], env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files']
      .filter(Boolean)
      .map((p) => join(p, 'Steam'));
  return [
    join(home, '.local', 'share', 'Steam'),
    join(home, '.steam', 'steam'),
    join(home, '.steam', 'root'),
    // Steam's own Flatpak (out of a Flatpak's reach unless it was given that folder: tried, and passed over if not).
    join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ];
}

/** Whether a binary shortcuts.vdf lists the shortcut: its "appid" field (an int32, type 2) holding the id. */
function listsShortcut(vdf, id) {
  const key = Buffer.from('appid\0', 'latin1');
  const want = Buffer.alloc(4);
  want.writeUInt32LE(id >>> 0);
  for (let at = 0; at + 1 + key.length + 4 <= vdf.length; at++) {
    if (vdf[at] !== 0x02) continue;
    let same = true;
    // (The key's letters in either case - Steam has written "appid" and "AppId" - and its terminating zero exactly.)
    for (let k = 0; k < key.length && same; k++) same = key[k] === 0 ? vdf[at + 1 + k] === 0 : (vdf[at + 1 + k] | 0x20) === key[k];
    if (same && vdf.subarray(at + 1 + key.length, at + 5 + key.length).equals(want)) return true;
  }
  return false;
}

/** The grid folders of the accounts whose shortcuts list the id (realpaths, so a Steam reached two ways counts once). */
async function gridFolders(roots, id, notes) {
  const found = new Set();
  for (const root of roots) {
    let real;
    try {
      real = await fsp.realpath(join(root, 'userdata'));
    } catch {
      continue;
    }
    let users;
    try {
      users = await fsp.readdir(real, { withFileTypes: true });
    } catch (e) {
      notes.push(`${real}: ${e.code ?? e.message}`);
      continue;
    }
    for (const user of users) {
      if (!user.isDirectory() || !/^\d+$/.test(user.name)) continue;
      const config = join(real, user.name, 'config');
      try {
        const vdf = join(config, 'shortcuts.vdf');
        const stat = await fsp.stat(vdf);
        if (!stat.isFile() || stat.size > MAX_VDF) continue;
        if (listsShortcut(await fsp.readFile(vdf), id)) found.add(join(config, 'grid'));
      } catch (e) {
        if (e.code !== 'ENOENT') notes.push(`${config}: ${e.code ?? e.message}`);
      }
    }
  }
  return [...found];
}

/**
 * `data` written as `file` unless something is there already: written aside (a name of its own, created anew), then
 * linked into place - a link fails where the name is taken, so nothing is ever overwritten - or, where the disk has no
 * links, renamed into place if the name is still free. The file aside is removed whatever happens.
 */
async function placeNew(file, data) {
  try {
    await fsp.lstat(file);
    return 'kept';
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const aside = `${file}.ultima5-${process.pid}-${Date.now()}.tmp`;
  try {
    await fsp.writeFile(aside, data, { flag: 'wx' });
    try {
      await fsp.link(aside, file);
    } catch (e) {
      if (e.code === 'EEXIST') return 'kept';
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS', 'EINVAL'].includes(e.code)) throw e;
      try {
        await fsp.lstat(file);
        return 'kept';
      } catch (gone) {
        if (gone.code !== 'ENOENT') throw gone;
      }
      await fsp.rename(aside, file);
    }
    return 'written';
  } finally {
    await fsp.rm(aside, { force: true }).catch(() => {});
  }
}

/**
 * `data` over `file` where `file` is still the app's own picture (its fingerprint one of `ours`); the player's kept.
 * Written aside and renamed over it, so the picture is the old or the new, whole. 'replaced', 'current', 'kept' (the
 * player's, or taken away by them), or a failure thrown.
 */
async function replaceOurs(file, data, ours) {
  let now;
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.size > MAX_PICTURE) return 'kept';
    now = fingerprint(await fsp.readFile(file));
  } catch (e) {
    if (e.code === 'ENOENT') return 'kept'; // taken away: left so
    throw e;
  }
  if (now === fingerprint(data)) return 'current';
  if (!ours.includes(now)) return 'kept';
  const aside = `${file}.ultima5-${process.pid}-${Date.now()}.tmp`;
  try {
    await fsp.writeFile(aside, data, { flag: 'wx' });
    try {
      await fsp.rename(aside, file);
    } catch (e) {
      // (Where a rename will not go over a file - Windows, at times - the old one goes first.)
      if (!['EPERM', 'EEXIST', 'EACCES'].includes(e.code)) throw e;
      await fsp.rm(file, { force: true });
      await fsp.rename(aside, file);
    }
    return 'replaced';
  } finally {
    await fsp.rm(aside, { force: true }).catch(() => {});
  }
}

/** The note of what was done, by shortcut: { [id]: { done, tries, at, result } }; an unreadable note is an empty one. */
async function readNote(file) {
  try {
    const note = JSON.parse(await fsp.readFile(file, 'utf8'));
    return note && typeof note === 'object' && !Array.isArray(note) ? note : {};
  } catch {
    return {};
  }
}

async function writeNote(file, note) {
  try {
    const aside = `${file}.tmp`;
    await fsp.writeFile(aside, JSON.stringify(note, null, 2));
    await fsp.rename(aside, file);
  } catch {
    // Not noted: the next launch from the shortcut tries again, and finds the artwork there (kept).
  }
}

/**
 * Put Steam's artwork in place for the shortcut that launched the game, once. Never rejects: the result says what
 * happened ('not from a shortcut', 'done before', 'no account lists the shortcut', 'installed', ...), and why.
 */
async function installSteamArt({ env, home, platform, artDir, noteFile, roots = steamRoots({ platform, home, env }), shipped = SHIPPED }) {
  const notes = [];
  try {
    const id = shortcutId(env);
    if (id === null) return { result: 'not from a shortcut', notes };
    const note = await readNote(noteFile);
    const mine = note[id] && typeof note[id] === 'object' ? note[id] : {};
    if (!mine.done && (mine.tries ?? 0) >= TRIES) return { result: 'done before', id, notes };
    const art = [];
    for (const [name, suffix] of ART) {
      try {
        art.push([await fsp.readFile(join(artDir, name)), suffix]);
      } catch (e) {
        notes.push(`${name}: ${e.code ?? e.message}`);
      }
    }
    art.push([Buffer.from(LOGO_POSITION), '.json']);
    const version = fingerprint(Buffer.concat(art.flatMap(([data, suffix]) => [Buffer.from(suffix), data])));
    if (mine.done && mine.art === version) return { result: 'done before', id, notes };
    const grids = await gridFolders(roots, id, notes);
    const at = new Date().toISOString();
    if (!grids.length) {
      if (mine.done) return { result: 'done before', id, notes }; // its account gone: nothing to bring up to date
      note[id] = { ...mine, tries: (mine.tries ?? 0) + 1, at, result: 'no account lists the shortcut' };
      await writeNote(noteFile, note);
      return { result: 'no account lists the shortcut', id, notes };
    }
    const wrote = mine.wrote && typeof mine.wrote === 'object' ? { ...mine.wrote } : {};
    const placed = { written: 0, replaced: 0, kept: 0, failed: 0 };
    for (const grid of grids) {
      if (!mine.done) {
        try {
          await fsp.mkdir(grid, { recursive: true });
        } catch (e) {
          notes.push(`${grid}: ${e.code ?? e.message}`);
          placed.failed += art.length;
          continue;
        }
      }
      for (const [data, suffix] of art) {
        try {
          // First time, each picture where there is none; after, the app's own brought up to date.
          const ours = [...(shipped[suffix] ?? []), ...(typeof wrote[suffix] === 'string' ? [wrote[suffix]] : [])];
          const how = mine.done ? await replaceOurs(join(grid, `${id}${suffix}`), data, ours) : await placeNew(join(grid, `${id}${suffix}`), data);
          if (how === 'written' || how === 'replaced') wrote[suffix] = fingerprint(data);
          placed[how === 'current' ? 'kept' : how]++;
        } catch (e) {
          notes.push(`${id}${suffix}: ${e.code ?? e.message}`);
          placed.failed++;
        }
      }
    }
    const result = mine.done
      ? placed.failed
        ? 'partly updated'
        : placed.replaced
          ? 'updated'
          : 'already there'
      : placed.failed
        ? 'partly installed'
        : placed.written
          ? 'installed'
          : 'already there';
    // Done, however it went: what could not be written once would not be the next time either (a folder not ours).
    note[id] = { done: true, tries: (mine.tries ?? 0) + (mine.done ? 0 : 1), at, result, art: version, wrote, ...placed };
    await writeNote(noteFile, note);
    return { result, id, grids, ...placed, notes };
  } catch (e) {
    return { result: 'failed', notes: [...notes, String(e?.message ?? e)] };
  }
}

module.exports = { installSteamArt, shortcutId, steamRoots, listsShortcut, ART, SHIPPED };
