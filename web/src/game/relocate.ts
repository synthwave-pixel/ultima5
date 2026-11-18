/**
 * relocate.ts
 *
 * Thrown to move the party to another map: the main loop (run.ts) catches it and goes on from the new place. A cheat
 * that moves the party (cheats.ts), a death (storage.ts), and a save loaded from the Pause menu throw it. Kept apart
 * from the cheats, so saving and the main loop do not import them.
 */

export class Relocate extends Error {
  constructor() {
    super('relocate');
  }
}
