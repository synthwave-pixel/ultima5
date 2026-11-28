/**
 * ultima5Objects.ts
 *
 * Ultima V's vehicles, items and unique finds, for the stores (objectStores.ts).
 */

import type { ItemTier, ObjectRules, VehicleKind } from './objectStores.ts';

/**
 * The hidden things (DATA.OVL 0x3e78..) that are one of a kind: no arms shop sells them and the game does not put
 * them back. 0x00-0x0b the Mystic Armour and Swords beneath Hythloth, 0x0c the HMS Cape plans, 0x10 the Sword of
 * Chaos and 0x11 the Jeweled Sword in Blackthorn's palace, 0x5d the Ankh in Cove. (The key 0x0d, the skull keys 0x0e
 * and the Glass Sword 0x0f come back when searched for again; the rings and amulets are sold.)
 */
export const UNIQUE_FINDS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xa, 0xb, 0xc, 0x10, 0x11, 0x5d]);

export const ULTIMA5_OBJECTS: ObjectRules = {
  vehicleKind(tile: number): VehicleKind | null {
    if (tile === 0x10 || tile === 0x11) return 'horse';
    if (tile === 0x1b) return 'carpet';
    if (tile >= 0x24 && tile <= 0x27) return 'frigate';
    if (tile >= 0x28 && tile <= 0x2b) return 'skiff';
    return null;
  },
  itemTier(tile: number): ItemTier | null {
    if (tile === 0x1e || tile === 0x1f) return 'body';
    if (tile === 0x0f) return 'food';
    if (tile === 0x02) return 'gold';
    if (tile >= 0x03 && tile <= 0x0d) return 'equipment';
    if (tile === 0x01) return 'chest';
    return null;
  },
  isUnique(hidden: number): boolean {
    return UNIQUE_FINDS.has(hidden);
  },
};
