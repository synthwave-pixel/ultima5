export function loadAll(dir: string): Record<string, string>;
/** True where written, else the error's code ('ENOSPC' for a full disk). */
export function writeKey(dir: string, key: string, value: string): true | string;
export function removeKey(dir: string, key: string): boolean;
