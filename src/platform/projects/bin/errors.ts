import type { BinFailureCode } from './types';

/** Typed lifecycle failure; the UI maps each code to its own explanation. */
export class BinError extends Error {
  readonly code: BinFailureCode;
  readonly detail?: Record<string, unknown>;
  constructor(code: BinFailureCode, detail?: Record<string, unknown>) {
    super(`Bin: ${code}`);
    this.name = 'BinError';
    this.code = code;
    this.detail = detail;
  }
}

export const isBinError = (error: unknown): error is BinError => error instanceof BinError;
