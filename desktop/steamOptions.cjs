// The Steam options (the Steam (beta) menu), kept per machine in steam-options.json in the app's data folder. Every
// option is off until the player turns it on, and a missing, unreadable or mangled file reads as all off, so that
// nothing touches Steam's folders on a guess. Cloud saves is per Steam account, as the saves are.
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');

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

module.exports = { readOptions, writeOptions };
