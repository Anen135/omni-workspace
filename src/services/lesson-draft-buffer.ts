import type { LessonDraft } from '../features/lesson/lesson-draft';
import { extensionRequest, isExtension } from './extension-client';

export type BufferedLessonDraft = { key: string; draft: LessonDraft; state: 'ready' | 'uncertain' | 'review'; revision: string; updatedAt: number };
export type DraftBufferRequest = { op: 'list' | 'put' | 'claim' | 'checkpoint' | 'remove'; key?: string; draft?: LessonDraft; state?: BufferedLessonDraft['state']; revision?: string; manual?: boolean; release?: boolean };
export function bufferRequest(input: DraftBufferRequest & { op: 'list' }): Promise<BufferedLessonDraft[]>;
export function bufferRequest(input: DraftBufferRequest): Promise<BufferedLessonDraft | null>;
export async function bufferRequest(input: DraftBufferRequest): Promise<BufferedLessonDraft[] | BufferedLessonDraft | null> {
  if (!isExtension()) throw Object.assign(new Error('The private draft buffer requires the Omni extension.'), { code: 'DRAFT_BUFFER_UNAVAILABLE' });
  return extensionRequest('draft-buffer', input);
}
