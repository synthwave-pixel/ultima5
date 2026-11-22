// web/tests/desktopBrand.ultima5.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import brand from '../../desktop/brand.cjs';
import { builderConfig } from '../../desktop/builderConfig.cjs';
import { flatpakRepoFiles, metainfo } from '../../desktop/metainfo.cjs';
import { gameFolderName } from '../../desktop/scan.cjs';

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'desktop', 'package.json'), 'utf8')) as {
  build: Record<string, Record<string, unknown>>;
};

/**
 * Ultima V's desktop names and ids, exactly as every release has had them (v1.1.241's among them): a player's install,
 * its updates, its data folder, its Steam setup and its saves in Steam Cloud all hang on them, so none may move.
 */
describe("Ultima V's desktop brand", () => {
  it('has every value Ultima V has always had', () => {
    expect(brand).toMatchObject({
      id: 'ultima5',
      name: 'Ultima V',
      title: 'Ultima V: Warriors of Destiny',
      appId: 'com.synthwavepixel.ultima5',
      repo: 'synthwave-pixel/ultima5',
      global: 'u5',
      edition: 'Ultima V Enhanced Edition',
      summary: 'A new engine for Ultima V: Warriors of Destiny',
      artifact: 'Ultima-V',
      appImage: 'ultima5-sp',
      portableData: 'Ultima V Data',
      launcherId: 'com.synthwavepixel.ultima5.steam',
      owner: 'synthwave-pixel',
      repoName: 'ultima5',
      site: 'https://synthwave-pixel.github.io/ultima5/',
    });
    expect(brand.steam).toEqual({
      appId: '3067520',
      installDir: 'Ultima V',
      saveFile: 'SAVED.GAM',
      saves: 'ultima5-sp',
      tool: 'ultima5_sp',
      launcher: 'Ultima V SP',
    });
    expect(brand.scan.marker).toBe('DATA.OVL');
    expect(String(brand.scan.folder)).toBe('/^(u5|ultima[\\s_-]*(5|v))(?![a-z0-9])/i');
  });

  it('knows Ultima V by its folders’ names, and no other game', () => {
    for (const n of [
      'u5',
      'U5',
      'ultima5',
      'ULTIMA5',
      'Ultima 5',
      'Ultima V',
      'Ultima V™.app',
      'Ultima_V',
      'ultima-5',
      'Ultima V - Warriors of Destiny',
    ])
      expect(gameFolderName(n), n).toBe(true);
    for (const n of ['Ultima VI', 'Ultima 6', 'u6', 'Documents', 'ultima55', 'u5x']) expect(gameFolderName(n), n).toBe(false);
  });

  it("fills electron-builder's config as package.json had it before", () => {
    const c = builderConfig(pkg.build, '1.1.241');
    expect(c.appId).toBe('com.synthwavepixel.ultima5');
    expect(c.productName).toBe('Ultima V');
    expect(c.artifactName).toBe('Ultima-V-${version}-${os}-${arch}.${ext}');
    expect(c.nsis.artifactName).toBe('Ultima-V-${version}-${os}-${arch}-setup.${ext}');
    expect(c.portable).toEqual({ artifactName: 'Ultima-V-${version}-${os}-${arch}-portable.${ext}' });
    expect(c.appImage).toEqual({ artifactName: 'ultima5-sp-${arch}.${ext}' });
    expect(c.publish).toEqual([{ provider: 'github', owner: 'synthwave-pixel', repo: 'ultima5', releaseType: 'release' }]);
    expect(c.linux.desktop).toEqual({ entry: { Name: 'Ultima V', Comment: 'Ultima V: Warriors of Destiny' } });
    expect(c.flatpak.files).toEqual([
      ['build-meta/com.synthwavepixel.ultima5.metainfo.xml', '/share/metainfo/com.synthwavepixel.ultima5.metainfo.xml'],
    ]);
    expect(c.mac.extendInfo).toEqual({
      NSMicrophoneUsageDescription:
        "Ultima V never uses the microphone. macOS can ask when the game's sound plays through a device that is also a microphone, such as a USB microphone or a headset. Choose Don't Allow: the game and its sound play on as before.",
      NSAudioCaptureUsageDescription: "Ultima V never records any sound. Choose Don't Allow: the game and its sound play on as before.",
      NSCameraUsageDescription: "Ultima V never uses the camera. Choose Don't Allow: the game plays on as before.",
      NSAppleEventsUsageDescription: "Play from Steam asks Steam to quit before it changes Steam's settings for Ultima V.",
    });
    expect(c.extraMetadata).toEqual({ version: '1.1.241' });
  });

  it("writes the Flatpak's metainfo as before", () => {
    const xml = metainfo('1.1.241', '2026-11-20');
    expect(xml).toContain('<id>com.synthwavepixel.ultima5</id>');
    expect(xml).toContain('<name>Ultima V</name>');
    expect(xml).toContain('<summary>A new engine for Ultima V: Warriors of Destiny</summary>');
    expect(xml).toContain(
      "<p>A new engine for the 1988 role-playing game Ultima V: Warriors of Destiny. It plays your own copy of the MS-DOS game, which it does not include: point it at a GOG installation, the game's folder or a .zip of its files.</p>",
    );
    expect(xml).toContain('<launchable type="desktop-id">com.synthwavepixel.ultima5.desktop</launchable>');
    expect(xml).toContain('<url type="homepage">https://synthwave-pixel.github.io/ultima5/</url>');
    expect(xml).toContain('<url type="bugtracker">https://github.com/synthwave-pixel/ultima5/issues</url>');
    expect(xml).toContain('<url type="vcs-browser">https://github.com/synthwave-pixel/ultima5</url>');
    expect(xml).toContain('<image>https://raw.githubusercontent.com/synthwave-pixel/ultima5/main/promo/features.jpg</image>');
    expect(xml).toContain('<url type="details">https://github.com/synthwave-pixel/ultima5/releases/tag/v1.1.241</url>');
  });

  it("writes the Flatpak repository's files as before", () => {
    const site = 'https://synthwave-pixel.github.io/ultima5';
    const files = flatpakRepoFiles({ site, id: 'com.synthwavepixel.ultima5', branch: 'master', key: 'KEY' });
    expect(files.title).toBe('Ultima V');
    expect(files.repo).toEqual({
      name: 'ultima5.flatpakrepo',
      text: `[Flatpak Repo]
Title=Ultima V
Url=${site}/flatpak/
Homepage=${site}/
Comment=Ultima V: Warriors of Destiny
Description=A new engine for Ultima V: Warriors of Destiny; plays the DOS game's files, installed by the player.
GPGKey=KEY
`,
    });
    expect(files.ref).toEqual({
      name: 'ultima5.flatpakref',
      text: `[Flatpak Ref]
Title=Ultima V
Name=com.synthwavepixel.ultima5
Branch=master
Url=${site}/flatpak/
SuggestRemoteName=ultima5
Homepage=${site}/
IsRuntime=false
RuntimeRepo=https://dl.flathub.org/repo/flathub.flatpakrepo
GPGKey=KEY
`,
    });
  });
});
