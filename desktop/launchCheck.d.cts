/** How Steam's saved launch options for Ultima V compare with the line this copy tells the player to paste. */
export type LineState = 'correct' | 'missing' | 'not-seen' | 'stale' | 'twice';
/**
 * Reads Ultima V's LaunchOptions out of localconfig.vdf's text (null: no file) and compares it with `expected`.
 * `exePath` is what names this copy in the line (the exe or AppImage path, the Flatpak id); `recentlyTurnedOn` says Steam
 * has not written the file since the option was turned on, so an absent line is only not seen yet.
 */
export function lineState(localconfig: string | null, expected: string, exePath: string, recentlyTurnedOn: boolean): LineState;
