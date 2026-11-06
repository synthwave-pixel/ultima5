/** One node of a binary KeyValues block: its type byte, its key, and its value (a list of nodes for a map). */
export type KvNode = [type: number, key: string, value: string | number | bigint | KvNode[]];
export interface Appinfo {
  magic: number;
  universe: number;
  data: Buffer;
  strings: string[];
  entries: { appid: number; start: number; stop: number }[];
}
export function readAppinfo(buf: Buffer): Appinfo;
export function appEntry(info: Appinfo, appid: number): { header: Buffer; kv: KvNode[] } | null;
export function writeAppinfo(info: Appinfo, appid: number, header: Buffer, kv: KvNode[]): Buffer;
export function macPatch(kv: KvNode[], launcherName: string): { kv: KvNode[]; changed: boolean };
export function isMacPatched(kv: KvNode[], launcherName: string): boolean;
