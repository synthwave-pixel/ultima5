// Which way the running copy was started (main.cjs): through Steam, or on its own. A Steam launch plays Steam's copy
// of the game with its own saves, and any other launch the app's own, so the two must not share a window: a second
// copy of the other kind says so and quits, rather than bringing the first one forward as if it were its own.
// The running copy keeps its mode in instance.json in the app's data folder. Whether a copy is running is the
// single-instance lock's to say (a process id means nothing across Flatpak sandboxes), so this is read only by a
// copy the lock has refused.
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');

const OUTSIDE = 'Ultima V is already open outside Steam. Close it, then press Play in Steam again.';
const THROUGH = 'Ultima V is already open through Steam. Close it there first.';

/** The running copy's mode written to `file` ({ steam }), whole or not at all. A failure to write is not fatal. */
function noteMode(file, steam) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ steam: steam === true }));
    renameSync(temp, file);
  } catch (e) {
    console.warn('instance:', e?.message ?? e);
  }
}

/** What to tell the player when the copy noted in `file` is of the other mode than `steam`, else null. */
function clashMessage(file, steam) {
  let note;
  try {
    note = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!note || typeof note.steam !== 'boolean' || note.steam === steam) return null;
  return steam ? OUTSIDE : THROUGH;
}

module.exports = { noteMode, clashMessage };
