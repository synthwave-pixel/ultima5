/** A monitor as watch() uses it (the tests give their own). */
export interface UpdateMonitor {
  onAvailable: (fn: () => void) => void;
  onProgress: (
    fn: (p: { status: number; error?: string; error_message?: string }) => void,
  ) => void;
  update: () => Promise<unknown>;
}
export interface PortalConnection {
  createMonitor: () => Promise<UpdateMonitor>;
  spawnLatest: () => Promise<unknown>;
}
export function connect(o?: {
  dbus?: unknown;
}): Promise<PortalConnection | null>;
export function watch(o: {
  portal: PortalConnection;
  newer: boolean;
  installed: () => void;
  failed: (why: string) => void;
}): Promise<UpdateMonitor>;
export const STATUS: { running: 0; empty: 1; done: 2; error: 3 };
