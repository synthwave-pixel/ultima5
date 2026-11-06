// The saves of a Steam launch as files Steam Cloud syncs: <dir>/<key, URI-encoded>/SAVED.GAM, one folder for each of the
// game's storage keys (web/src/game/keyStore.ts). Every file is named SAVED.GAM, as EA's cloud rule for the game
// wants. <dir> is <game folder>/Ultima V Engine/<account id> (main.cjs). Nothing here throws: a write or a removal that
// could not be made says false, for the page to report as a save that was not kept.
const { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const FILE = 'SAVED.GAM';

/** The folder a key lives in, or null for a name that would be the directory itself or its parent. */
function folderFor(dir, key) {
  const name = encodeURIComponent(key);
  return name === '' || name === '.' || name === '..' ? null : join(dir, name);
}

/** Every key kept in `dir` and its value; none where the folder is missing or will not read. */
function loadAll(dir) {
  const out = {};
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
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

/** A key's value written, to a temporary file in its folder and then renamed into place; false where it could not be. */
function writeKey(dir, key, value) {
  const folder = folderFor(dir, key);
  if (folder === null) return false;
  const temp = join(folder, `${FILE}.tmp`);
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(temp, value, 'utf8');
    renameSync(temp, join(folder, FILE));
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      /* left as it is */
    }
    return false;
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

module.exports = { loadAll, writeKey, removeKey };
