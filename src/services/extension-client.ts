export const isExtension = () => false;
export function onOfficialLoginRequired(_callback: () => void) {}
export function onExtensionSessionChange(_callback: () => void): () => void { return () => {}; }
export async function extensionRequest<T>(_action: string, _input: unknown): Promise<T> { throw new Error('Extension unavailable in desktop'); }
