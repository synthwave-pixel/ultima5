// Builds installers with electron-builder at the build's version (see version.cjs). Its config is package.json's
// `build` filled with the game's names and ids (builderConfig.cjs, from brand.cjs) and the version, written to a file
// of its own for the build, so package.json is never edited. Arguments go through: node dist.cjs --linux
// electron-builder's CLI runs under this node directly: on Windows `npx` is a .cmd shim that spawnSync cannot run.
const { execFileSync } = require("node:child_process");
const { buildVersion } = require("./version.cjs");
const { writeMetainfo } = require("./metainfo.cjs");
const { macBuildConfig } = require("./macSigning.cjs");
const { builderConfig } = require("./builderConfig.cjs");
const { rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const version = buildVersion();
console.log(`building version ${version}`);
// The Flatpak's AppStream metainfo at this version (metainfo.cjs), for flatpak.files to put in.
writeMetainfo(version);
// A Mac build's settings are signed with the Developer ID certificate where the build has one (macSigning.cjs).
const args = process.argv.slice(2);
const mac = args.includes("--mac") || (process.platform === "darwin" && !args.some((a) => ["--linux", "--win"].includes(a)));
const build = builderConfig(require("./package.json").build, version);
const configFile = join(__dirname, ".build.json");
writeFileSync(configFile, JSON.stringify(mac ? macBuildConfig(build, process.env, version) : build));
try {
  execFileSync(
    process.execPath,
    [require.resolve("electron-builder/cli.js"), ...args, "--publish", "never", "--config", configFile],
    { stdio: "inherit", cwd: __dirname },
  );
} finally {
  rmSync(configFile, { force: true });
}
