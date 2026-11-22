// electron-builder's config for a build: package.json's `build`, which names no game, with the game's own fields
// filled from the brand (brand.cjs) - the app id, the product's name, the artifacts' names, the release it is
// published to (and updated from), the Mac's usage strings, the Linux menu entry, the AppImage's name and the Flatpak's
// metainfo - and the build's version. dist.cjs hands electron-builder the result on every platform.
const brand = require('./brand.cjs');

/** `build` (package.json's) filled from the brand, at `version`. A copy. */
function builderConfig(build, version, b = brand) {
  const c = structuredClone(build);
  const artifact = (rest) => `${b.artifact}-\${version}-\${os}-\${arch}${rest}.\${ext}`;
  const metainfo = `${b.appId}.metainfo.xml`;
  c.appId = b.appId;
  c.productName = b.name;
  c.artifactName = artifact('');
  c.extraMetadata = { ...(c.extraMetadata ?? {}), version };
  c.publish = [{ provider: 'github', owner: b.owner, repo: b.repoName, releaseType: 'release' }];
  c.mac = {
    ...c.mac,
    extendInfo: {
      ...c.mac?.extendInfo,
      NSMicrophoneUsageDescription: `${b.name} never uses the microphone. macOS can ask when the game's sound plays through a device that is also a microphone, such as a USB microphone or a headset. Choose Don't Allow: the game and its sound play on as before.`,
      NSAudioCaptureUsageDescription: `${b.name} never records any sound. Choose Don't Allow: the game and its sound play on as before.`,
      NSCameraUsageDescription: `${b.name} never uses the camera. Choose Don't Allow: the game plays on as before.`,
      NSAppleEventsUsageDescription: `Play from Steam asks Steam to quit before it changes Steam's settings for ${b.name}.`,
    },
  };
  c.nsis = { ...c.nsis, artifactName: artifact('-setup') };
  c.portable = { ...c.portable, artifactName: artifact('-portable') };
  c.linux = { ...c.linux, desktop: { ...c.linux?.desktop, entry: { ...c.linux?.desktop?.entry, Name: b.name, Comment: b.title } } };
  c.appImage = { ...c.appImage, artifactName: `${b.appImage}-\${arch}.\${ext}` };
  c.flatpak = { ...c.flatpak, files: [[`build-meta/${metainfo}`, `/share/metainfo/${metainfo}`]] };
  return c;
}

module.exports = { builderConfig };
