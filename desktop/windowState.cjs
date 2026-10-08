// How the window comes up (main.cjs): where it was last when it was a window, and whether it was last full screen,
// kept in window.json. It starts full screen unless the player last left it a window; --windowed and --fullscreen on
// the command line say otherwise, and Steam's Game Mode (the SteamDeck or SteamOS environment variables) always has it
// full screen, its screen having no room for a window.
const { readFileSync, writeFileSync } = require('node:fs');

/** What window.json holds: the window's last place and size as a window, and whether it was last full screen. */
function readState(file) {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

/** window.json with `change` made to it; a failure to write is not fatal. */
function writeState(file, change) {
  try {
    writeFileSync(file, JSON.stringify({ ...readState(file), ...change }));
  } catch {
    /* not fatal */
  }
}

/** Whether the window starts full screen, from the command line, the environment and the state kept. */
function startsFullScreen(argv, env, state) {
  if (argv.includes('--windowed')) return false;
  if (argv.includes('--fullscreen')) return true;
  if (env.SteamDeck === '1' || env.SteamOS === '1') return true;
  return state.fullScreen !== false;
}

module.exports = { readState, writeState, startsFullScreen };
