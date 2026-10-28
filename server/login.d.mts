export function submitOfficialLogin(input: { username: string; password: string }, signal?: AbortSignal): Promise<{ success?: boolean; code?: string }>;
export const loginErrors: Record<string, string>;
