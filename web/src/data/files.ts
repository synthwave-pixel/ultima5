/**
 * files.ts
 *
 * The player's DOS game files, by upper-case name. Everything the engine
 * knows about Ultima V is read from these; nothing from the game ships
 * with the engine.
 */

export class GameFiles {
  private readonly files = new Map<string, Uint8Array>();

  constructor(entries: Iterable<[string, Uint8Array]> = []) {
    for (const [name, data] of entries) this.set(name, data);
  }

  set(name: string, data: Uint8Array): void {
    this.files.set(name.toUpperCase(), data);
  }

  has(name: string): boolean {
    return this.files.has(name.toUpperCase());
  }

  /** The file's bytes; throws if the file is missing (the installer checks the set first). */
  get(name: string): Uint8Array {
    const data = this.files.get(name.toUpperCase());
    if (!data) throw new Error(`Missing game file ${name}`);
    return data;
  }

  names(): string[] {
    return [...this.files.keys()];
  }
}

/** Little-endian readers over a byte array. */
export function u16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

export function s16(data: Uint8Array, offset: number): number {
  const v = u16(data, offset);
  return v >= 0x8000 ? v - 0x10000 : v;
}

export function u32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}
