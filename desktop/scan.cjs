// The desktop app's scan for the player's copy of MS-DOS Ultima V (web/src/install/sources.ts desktopCopies): a
// short list of roots - beside the app, home, where GOG and the Linux launchers install games - and under each the
// folders named like the game (u5, Ultima 5, Ultima V™.app ...), searched a few levels down for DATA.OVL. Each
// folder found is read for the files the page asks for and the Upgrade's music; the page checks them and installs.
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { basename, dirname, join, sep } = require('node:path');

/** A folder named like the game: u5, ultima5, Ultima 5, Ultima V, with a trademark sign, an extension or more after. */
const GAME = /^(u5|ultima[\s_-]*(5|v))(?![a-z0-9])/i;
const gameFolderName = (name) => GAME.test(name);

/**
 * Where to look, in order, on `platform` (process.platform's names). On Linux the launchers keep each game in a Wine
 * prefix of its own, so `list(dir)`, the child folders of `dir` (nothing, unless given: roots stays pure), finds those
 * prefixes - one per Lutris game under ~/Games, one per game under Heroic's Prefixes (with or without its `default`
 * level) - and each one's drive_c/GOG Games is a root.
 */
function roots({ platform, home, env, appDir, drives, list = () => [] }) {
  const beside = env.APPIMAGE ? dirname(env.APPIMAGE) : appDir;
  if (platform === 'darwin') return [beside, home, '/Applications', join(home, 'Applications')];
  if (platform === 'win32') {
    const gog = drives.flatMap((d) => [
      `${d}\\GOG Games`,
      `${d}\\Program Files (x86)\\GOG Galaxy\\Games`,
      `${d}\\Program Files (x86)\\GOG.com`,
      `${d}\\Program Files\\GOG Galaxy\\Games`,
    ]);
    return [beside, home, ...gog];
  }
  const prefixes = [join(home, 'Games'), join(home, 'Games', 'Heroic', 'Prefixes'), join(home, 'Games', 'Heroic', 'Prefixes', 'default')];
  return [
    beside,
    home,
    join(home, 'GOG Games'),
    join(home, 'Games'),
    join(home, 'Games', 'Heroic'),
    join(home, '.wine', 'drive_c', 'GOG Games'),
    join(home, 'Games', 'Heroic', 'Prefixes'),
    ...prefixes.flatMap((dir) => list(dir).map((prefix) => join(prefix, 'drive_c', 'GOG Games'))),
  ];
}

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const children = (dir) => {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith('.') && n !== 'node_modules').map((n) => join(dir, n)).filter(isDir);
  } catch {
    return [];
  }
};
const hasDataOvl = (dir) => {
  try {
    return readdirSync(dir).some((n) => n.toUpperCase() === 'DATA.OVL');
  } catch {
    return false;
  }
};

/** Folders under `dir`, `dir` included, holding DATA.OVL, at most `depth` levels down; nearest first. */
function gameFolders(dir, depth) {
  const out = [];
  let level = [dir];
  for (let d = 0; d <= depth && level.length; d++) {
    for (const f of level) if (hasDataOvl(f)) out.push(f);
    level = level.flatMap(children);
  }
  return out;
}

/**
 * The files of copy `dir` the page wants (by name, any case) and the Upgrade's music, one level of folders down. An
 * entry or a folder that cannot be read (a broken link, a folder without permission) is skipped, so the copy is still
 * reported with the files that did read; the page checks what it is given.
 */
function readCopy(dir, wanted) {
  const want = new Set(wanted.map((n) => n.toUpperCase()));
  const files = [];
  const take = (folder, prefix) => {
    let names;
    try {
      names = readdirSync(folder);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(folder, n);
      if (isDir(p)) {
        if (!prefix) take(p, `${n}/`);
      } else if (want.has(n.toUpperCase()) || n.toUpperCase().endsWith('.XMI')) {
        try {
          files.push({ path: prefix + n, data: new Uint8Array(readFileSync(p)) });
        } catch {
          // Unreadable: left out.
        }
      }
    }
  };
  take(dir, '');
  return files;
}

/**
 * The home folders macOS guards: reading inside one (Desktop, Documents, Downloads ...) raises an access prompt, which a
 * first Scan would raise a string of, unasked. They are not listed, so a copy kept inside one is not found by a scan;
 * it can still be dropped on the installer or chosen with its buttons.
 */
const MAC_GUARDED = new Set(['Desktop', 'Documents', 'Downloads', 'Library', 'Pictures', 'Movies', 'Music']);

/** `path` as the player knows it: under `home`, as ~/..., else as it is. Only said, never read from. */
function shown(path, home) {
  if (home && path === home) return '~';
  if (home && path.startsWith(home + sep)) return `~${path.slice(home.length)}`;
  return path;
}

/**
 * Every copy under `roots`: the game-named folders at a root or up to two levels under it, searched four deep. With
 * `home` a copy under it is named ~/...; with `platform` 'darwin' the home folders macOS guards are not listed.
 */
function findCopies(rootList, wanted, { platform, home } = {}) {
  const seen = new Set();
  const copies = [];
  for (const root of rootList) {
    if (!isDir(root)) continue;
    const below = children(root);
    // A guarded folder of home is still checked by its own name, but its children are not listed.
    const listed = platform === 'darwin' && root === home ? below.filter((d) => !MAC_GUARDED.has(basename(d))) : below;
    const named = [root, ...below, ...listed.flatMap(children)].filter((d) => gameFolderName(basename(d)));
    for (const folder of named)
      for (const found of gameFolders(folder, 4)) {
        if (seen.has(found)) continue;
        seen.add(found);
        copies.push({ where: shown(found, home), files: readCopy(found, wanted) });
      }
  }
  return copies;
}

/** This machine's roots: the app's own place (its .app bundle's folder on macOS), home, and every fixed drive. */
function scanForGameFiles(wanted) {
  const { app } = require('electron');
  const exe = app.getPath('exe');
  const appDir = process.platform === 'darwin' ? dirname(exe.replace(/\/Contents\/MacOS\/[^/]+$/, '')) : dirname(exe);
  const drives = process.platform === 'win32' ? 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:`).filter((d) => existsSync(`${d}\\`)) : [];
  const platform = process.platform;
  const home = app.getPath('home');
  return findCopies(roots({ platform, home, env: process.env, appDir, drives, list: children }), wanted, { platform, home });
}

module.exports = { gameFolderName, roots, findCopies, scanForGameFiles };
