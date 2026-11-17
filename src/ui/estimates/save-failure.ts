import type { EstimateCopy } from '../../platform/estimates/copy';
import { DocumentTooLargeError } from '../../platform/vault/crypto';

/** The status line for a failed estimate save: size gets its own message. */
export function saveFailure(error: unknown, copy: Pick<EstimateCopy, 'saveFailed' | 'tooLarge'>) {
  return error instanceof DocumentTooLargeError ? copy.tooLarge : copy.saveFailed;
}
