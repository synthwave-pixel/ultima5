// Which way the running copy was started (main.cjs): through Steam, or on its own. A Steam launch plays Steam's copy
// of the game with its own saves, and any other launch the app's own, so the two must not share a window: a second
// copy of the other kind says so and quits, rather than bringing the first one forward as if it were its own.
// The running copy keeps its mode, and its process id, in instance.json in the app's data folder.
const { readFileSync, renameSync, writeFileSync } = require('node:fs');

const OUTSIDE = 'Ultima V is already open outside Steam. Close it, then press Play in Steam again.';
const THROUGH = 'Ultima V is already open through Steam. Close it there first.';

/** Whether a process with this id is running. */
function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM'; // there, but not ours to signal
  }
}

/** The running copy's mode written to `file` ({ steam, pid }), whole or not at all. A failure to write is not fatal. */
function noteMode(file, steam) {
  try {
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ steam: steam === true, pid: process.pid }));
    renameSync(temp, file);
  } catch (e) {
    console.warn('instance:', e?.message ?? e);
  }
}

/**
 * What to tell the player when the copy noted in `file` is of the other mode than `steam`, else null: nothing noted,
 * unreadable, the same mode, or its process gone (a copy that crashed leaves its note behind). `alive` is the check
 * that a process is running; the tests give their own.
 */
function clashMessage(file, steam, alive = running) {
  let note;
  try {
    note = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!note || typeof note.steam !== 'boolean' || !Number.isInteger(note.pid)) return null;
  if (note.steam === steam || note.pid === process.pid || !alive(note.pid)) return null;
  return steam ? OUTSIDE : THROUGH;
}

module.exports = { noteMode, clashMessage };
