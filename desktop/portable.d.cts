export const DATA: string;
export function portableData(where: { env: Record<string, string | undefined>; appData?: string; name?: string }): string | null;
