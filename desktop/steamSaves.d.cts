/** Every key kept in `dir`: none where the folder is not there yet, null where it will not read. */
export function loadAll(dir: string): Record<string, string> | null;
/** Whether saves can be written in `dir`, or the nearest folder above it that is there; `files` is node:fs by default. */
export function writable(
  dir: string,
  files?: {
    constants: { W_OK: number };
    accessSync(path: string, mode?: number): void;
    statSync(path: string): { isDirectory(): boolean };
  },
): boolean;
/** True where written, else the error's code ('ENOSPC' for a full disk). */
export function writeKey(dir: string, key: string, value: string): true | string;
export function removeKey(dir: string, key: string): boolean;
