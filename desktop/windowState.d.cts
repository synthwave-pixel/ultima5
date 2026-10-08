export interface WindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fullScreen?: boolean;
}
export function readState(file: string): WindowState;
export function writeState(file: string, change: WindowState): void;
export function startsFullScreen(argv: string[], env: Record<string, string | undefined>, state: WindowState): boolean;
