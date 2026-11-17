import { describe, expect, it } from 'vitest';
import { DocumentTooLargeError } from '../../platform/vault/crypto';
import { saveFailure } from './save-failure';

const copy = { saveFailed: 'failed', tooLarge: 'too large' };

describe('saveFailure', () => {
  it('explains an estimate that is too large to save', () => {
    expect(saveFailure(new DocumentTooLargeError(70_000, 65_536), copy)).toBe('too large');
  });

  it('keeps the generic message for other errors', () => {
    expect(saveFailure(new Error('Estimate changed'), copy)).toBe('failed');
    expect(saveFailure(undefined, copy)).toBe('failed');
  });
});
