/** The running copy's mode written to `file` ({ steam, pid }). */
export function noteMode(file: string, steam: boolean): void;
/** What to tell the player when the running copy is of the other mode, else null. */
export function clashMessage(file: string, steam: boolean, alive?: (pid: number) => boolean): string | null;
