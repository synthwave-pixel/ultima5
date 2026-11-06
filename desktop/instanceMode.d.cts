/** The running copy's mode written to `file` ({ steam }). */
export function noteMode(file: string, steam: boolean): void;
/** What to tell the player when the running copy noted in `file` is of the other mode, else null. */
export function clashMessage(file: string, steam: boolean): string | null;
