import { describe, expect, it } from 'vitest';
import { GAME_ID, REPO } from '../src/brand.ts';
import { CHARACTERS_KEY, charKey } from '../src/game/characters.ts';
import { isSteamKey, PAD_SEEN_KEY, STEAM_NOTED_KEY } from '../src/game/keyStore.ts';
import { SETTINGS_KEY } from '../src/game/settings.ts';
import { SAVE_KEY, SAVES_KEY } from '../src/game/storage.ts';
import { exportName } from '../src/game/transfer.ts';
import { FILES_FROM_KEY } from '../src/install/sources.ts';
import { RELEASES } from '../src/ui/updates.ts';
import { ISSUES } from '../src/game/steamMenu.ts';

/** Every name a player's browser already holds: none may move, or their saves and settings are lost. */
describe('the identifiers (brand.ts)', () => {
  it('keep every storage key exactly as it was', () => {
    expect(GAME_ID).toBe('ultima5');
    expect([SETTINGS_KEY, CHARACTERS_KEY, SAVE_KEY, SAVES_KEY, FILES_FROM_KEY, STEAM_NOTED_KEY, PAD_SEEN_KEY]).toEqual([
      'ultima5.settings',
      'ultima5.characters',
      'ultima5.save',
      'ultima5.saves',
      'ultima5.filesFrom',
      'ultima5.steamNoted',
      'ultima5.padSeen',
    ]);
    expect(charKey('k3x9q2', 'save')).toBe('ultima5.char.k3x9q2.save');
  });
  it('still know a save key from any other', () => {
    expect(isSteamKey('ultima5.char.k3x9q2.save.3')).toBe(true);
    expect(isSteamKey('ultima5.characters')).toBe(true);
    expect(isSteamKey('ultima5.char.k3x9q2.playing')).toBe(false);
    expect(isSteamKey('ultima5Xchar.k3x9q2.save')).toBe(false);
    expect(isSteamKey('ultima4.char.k3x9q2.save')).toBe(false);
  });
  it('name the export and the repository as before', () => {
    expect(exportName(new Date(2026, 8, 26, 14, 35), 'Shalom')).toBe('ultima5-Shalom-20260926-1435.json');
    expect(REPO).toBe('synthwave-pixel/ultima5');
    expect(RELEASES).toBe('https://github.com/synthwave-pixel/ultima5/releases/latest');
    expect(ISSUES).toBe('https://github.com/synthwave-pixel/ultima5/issues');
  });
});
