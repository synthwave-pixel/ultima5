// Reading back the launch options Steam saved for Ultima V, to tell the player whether the line they pasted is there.
// Only reads: Steam's localconfig.vdf is never written. Pure, so it can be tried on text.
const { APP_ID, parseVdf } = require('./steam.cjs');

const PATH = ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps', APP_ID];

/** A block's child by name, whatever the case of its key (older Steam files write them in lower case). */
const child = (block, name) => {
  if (!block || typeof block !== 'object') return undefined;
  return Object.entries(block).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
};

/** The saved launch options of Ultima V, '' when the file, the entry or the value is not there. */
function savedLine(localconfig) {
  if (localconfig === null) return '';
  let node = parseVdf(localconfig);
  for (const name of PATH) node = child(node, name);
  const line = child(node, 'LaunchOptions');
  return typeof line === 'string' ? line.trim() : '';
}

/**
 * A line as the shell Steam runs it through would split it into words: spaces separate, '…' is literal, "…" lets
 * \\ \" \$ \` through, and a \ outside quotes escapes the next character. Quoting is dropped, so two lines that differ
 * only in how the path is quoted give the same words.
 */
function shellWords(line) {
  const words = [];
  let word = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (/\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      word = (word ?? '') + line.slice(i + 1, end === -1 ? line.length : end);
      i = end === -1 ? line.length : end;
    } else if (c === '"') {
      word ??= '';
      for (i++; i < line.length && line[i] !== '"'; i++) {
        // (A \ at the very end, the quote never closed, is kept: ''.includes('') would step past the line.)
        if (line[i] === '\\' && i + 1 < line.length && '\\"$`'.includes(line[i + 1])) i++;
        word += line[i];
      }
    } else {
      if (c === '\\' && i + 1 < line.length) i++;
      word = (word ?? '') + line[i];
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/**
 * How Steam's saved launch options compare with `expected`, the line this copy tells the player to paste. `exePath` is
 * what names this copy in a line (the exe or AppImage path, the Flatpak's id), found as a word of its own.
 * - 'correct': the line is the expected one, or has %command% once and this copy once (the player may add options);
 * - 'twice': %command% or this copy appears more than once;
 * - 'stale': something else is there, such as an old AppImage name or a moved app;
 * - 'missing': nothing is there; 'not-seen' instead when `recentlyTurnedOn`, as Steam writes the file from memory,
 *   sometimes only when it closes, so a line pasted moments ago may not be in it yet.
 */
function lineState(localconfig, expected, exePath, recentlyTurnedOn) {
  const line = savedLine(localconfig);
  if (line === '') return recentlyTurnedOn ? 'not-seen' : 'missing';
  const words = shellWords(line);
  const commands = words.filter((w) => w === '%command%').length;
  const copies = words.filter((w) => w === exePath).length;
  if (commands > 1 || copies > 1) return 'twice';
  const want = shellWords(expected);
  if (words.length === want.length && words.every((w, i) => w === want[i])) return 'correct';
  return commands === 1 && copies === 1 ? 'correct' : 'stale';
}

module.exports = { lineState };
