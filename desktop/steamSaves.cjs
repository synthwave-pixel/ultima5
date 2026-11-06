// The saves of a Steam launch as files Steam Cloud syncs: <dir>/<key, URI-encoded>/SAVED.GAM, one folder for each of the
// game's storage keys (web/src/game/keyStore.ts). Every file is named SAVED.GAM, as EA's cloud rule for the game
// wants. <dir> is <game folder>/ultima5-sp/<account id> (main.cjs). Nothing here throws: a write that could not be
// made says why (the system's code: 'ENOSPC' for a full disk), and a removal that could not be made says false, for the
// page to report as a save that was not kept. Only a full disk lets the page make room by letting earlier saves go.
const fs = require('node:fs');
const { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } = fs;
const { dirname, join } = require('node:path');

const FILE = 'SAVED.GAM';

/** The folder a key lives in, or null for a name that would be the directory itself or its parent. */
function folderFor(dir, key) {
  const name = encodeURIComponent(key);
  return name === '' || name === '.' || name === '..' ? null : join(dir, name);
}

/**
 * Every key kept in `dir` and its value: none where the folder is not there yet (no save made in it), but null where
 * it is there and will not read, so that the page takes it as out of reach rather than as holding no saves.
 */
function loadAll(dir) {
  const out = {};
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    return e?.code === 'ENOENT' ? out : null;
  }
  for (const name of names) {
    try {
      out[decodeURIComponent(name)] = readFileSync(join(dir, name, FILE), 'utf8');
    } catch {
      /* not a key's folder, or one without its file: left out */
    }
  }
  return out;
}

/**
 * Whether saves can be written in `dir`: it, or where it is not there yet the nearest folder above it that is, may be
 * written to. A folder that reads but refuses every write would only fail each save in turn. Nothing is made to find
 * out, so the game's folder is left as it was. `files` is node:fs, or a test's own.
 */
function writable(dir, files = fs) {
  for (let at = dir; ; at = dirname(at)) {
    try {
      files.accessSync(at, files.constants.W_OK);
      return files.statSync(at).isDirectory();
    } catch (e) {
      if (e?.code !== 'ENOENT' || dirname(at) === at) return false;
    }
  }
}

/**
 * A key's value written, to a temporary file in its folder and then renamed into place: true, or where it could not be,
 * the error's code ('EINVAL' for a key that names no folder, 'EIO' for an error without one).
 */
function writeKey(dir, key, value) {
  const folder = folderFor(dir, key);
  if (folder === null) return 'EINVAL';
  const temp = join(folder, `${FILE}.tmp`);
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(temp, value, 'utf8');
    renameSync(temp, join(folder, FILE));
    return true;
  } catch (e) {
    try {
      rmSync(temp, { force: true });
    } catch {
      /* left as it is */
    }
    return typeof e?.code === 'string' ? e.code : 'EIO';
  }
}

/** A key's folder deleted (none there is the same as done); false where it could not be. */
function removeKey(dir, key) {
  const folder = folderFor(dir, key);
  if (folder === null) return false;
  try {
    rmSync(folder, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadAll, writable, writeKey, removeKey };
