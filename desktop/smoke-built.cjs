// Launches the app electron-builder built (dist/, unpacked) with the smoke test's screenshot flag, as smoke.cjs does
// the development copy: proof the packaged app starts with its fuses set - its ASAR checked, loaded from nothing else.
// Exits with its status, 0 when the game is running. Linux CI wraps it in xvfb-run; ELECTRON_NO_SANDBOX=1 there.
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const dist = join(__dirname, 'dist');
const product = require('./package.json').build.productName;
const exe = (() => {
  if (process.platform === 'darwin') {
    const dir = readdirSync(dist).find((d) => d.startsWith('mac'));
    return dir && join(dist, dir, `${product}.app`, 'Contents', 'MacOS', product);
  }
  const dir = readdirSync(dist).find((d) => d.endsWith('-unpacked'));
  if (!dir) return undefined;
  const files = readdirSync(join(dist, dir));
  const name = process.platform === 'win32' ? `${product}.exe` : files.find((f) => f === 'ultima5-desktop' || f === product);
  return name && join(dist, dir, name);
})();
if (!exe || !existsSync(exe)) {
  console.error(`smoke-built: no built app in ${dist}`);
  process.exit(1);
}
const shot = process.argv[2] ?? join(__dirname, 'smoke-built.png');
const extra = process.env.ELECTRON_NO_SANDBOX ? ['--no-sandbox'] : [];
rmSync(shot, { force: true });
console.log(`smoke-built: ${exe}`);
const r = spawnSync(exe, ['--windowed', ...extra], { stdio: 'inherit', timeout: 90_000, env: { ...process.env, ULTIMA5_SMOKE: shot } });
if (r.status === 0 && !existsSync(shot)) {
  console.error('smoke-built: no screenshot taken');
  process.exit(1);
}
process.exit(r.status ?? 1);
