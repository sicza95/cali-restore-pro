import { BinError } from './errors';
import type { BinOperation, BinReceipt } from './types';

/** Canonical JSON: sorted keys, no undefined members, arrays in order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

/** SHA-256 over the canonical operation. Deletion IDs are a set, so their order is ignored. */
export async function operationDigest(operation: BinOperation): Promise<string> {
  const normalized = { ...operation, deletionIds: [...operation.deletionIds].sort() };
  const bytes = new TextEncoder().encode(canonical(normalized));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Idempotency: an identical retry returns the original receipt; reusing an operation ID for a
 * different request fails. Undefined means the operation has not been seen and may execute.
 */
export function replay(
  receipts: ReadonlyMap<string, BinReceipt>,
  operationId: string,
  digest: string,
): BinReceipt | undefined {
  const receipt = receipts.get(operationId);
  if (!receipt) return undefined;
  if (receipt.digest !== digest) throw new BinError('digest_mismatch', { operationId });
  return receipt;
}

/** Compaction keeps the digest and outcome; per-item versions may be dropped once fenced. */
export function compactReceipt(receipt: BinReceipt): BinReceipt {
  return { ...receipt, versions: {} };
}
