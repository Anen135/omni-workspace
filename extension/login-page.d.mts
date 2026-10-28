export const nativeLoginKey: string;
export function hasLoginChallenge(doc: Document): boolean;
export function loginPageState(doc: Document, pathname: string): 'official' | 'loading' | 'login' | 'workspace';
