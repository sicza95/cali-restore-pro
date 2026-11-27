import { captureCoverage, type BinCapture, type BinRecoveryBody } from './capture';
import { binChunkBytes, binManifestSchema } from './constants';
import { canonical } from './digest';
import { BinError } from './errors';
import type { BinTrashPlan } from './plan-trash';
import { subtreeIds } from './subtree';
import type { BinManifest, BinManifestRef } from './types';

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
type Bytes = Uint8Array<ArrayBuffer>;
const sha256 = async (bytes: Bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

export type BinBundle = { manifest: BinManifest; ref: BinManifestRef; chunks: Bytes[] };

/**
 * Encodes a capture into immutable bounded chunks plus a manifest. Photos are referenced, never
 * embedded, so a bundle stays small and nothing accumulates in the revision head.
 */
export async function encodeBundle(
  plan: BinTrashPlan,
  capture: BinCapture,
  epoch: number | null,
  chunkBytes = binChunkBytes,
): Promise<BinBundle> {
  const bytes = new TextEncoder().encode(canonical(capture.body));
  const chunks: Bytes[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes)
    chunks.push(bytes.slice(offset, offset + chunkBytes));
  const manifest: BinManifest = {
    schema: binManifestSchema,
    deletionId: plan.entry.deletionId,
    entity: plan.entry.entity,
    roots: subtreeIds(plan.captured),
    chunks: await Promise.all(
      chunks.map(async (chunk, index) => ({
        index,
        sha256: await sha256(chunk),
        bytes: chunk.length,
      })),
    ),
    assets: plan.pins,
    documents: capture.documents,
    coverage: captureCoverage(plan, capture),
    sourceRevision: plan.entry.sourceRevision,
    sourceEpoch: epoch,
    logicalBytes: bytes.length + capture.assetBytes,
    counts: plan.entry.counts,
  };
  const ref = { schema: manifest.schema, sha256: await manifestDigest(manifest) };
  return { manifest, ref, chunks };
}

export async function manifestDigest(manifest: BinManifest) {
  return sha256(new TextEncoder().encode(canonical(manifest)));
}

/** Validates the manifest against its reference and every chunk, then the decoded body. */
export async function decodeBundle(
  ref: BinManifestRef,
  manifest: BinManifest,
  chunks: readonly Bytes[],
): Promise<BinRecoveryBody> {
  const fail = (reason: string) => new BinError('incomplete_recovery', { reason });
  if (manifest.schema !== binManifestSchema || ref.schema !== manifest.schema)
    throw new BinError('protocol_outdated', { schema: manifest.schema });
  if ((await manifestDigest(manifest)) !== ref.sha256) throw fail('manifest digest');
  if (chunks.length !== manifest.chunks.length) throw fail('chunk count');
  let length = 0;
  for (const [index, chunk] of chunks.entries()) {
    const expected = manifest.chunks[index]!;
    if (expected.index !== index || expected.bytes !== chunk.length) throw fail('chunk shape');
    if ((await sha256(chunk)) !== expected.sha256) throw fail('chunk digest');
    length += chunk.length;
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  let body: BinRecoveryBody;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)) as BinRecoveryBody;
  } catch {
    throw fail('body');
  }
  if (
    body.schema !== 1 ||
    body.deletionId !== manifest.deletionId ||
    canonical(body.entity) !== canonical(manifest.entity) ||
    canonical(subtreeIds(body.captured)) !== canonical(manifest.roots)
  )
    throw fail('body identity');
  return body;
}

/** The project must still be at the captured revision when the deletion commits. */
export function assertCaptureCurrent(manifest: BinManifest, revision: number) {
  if (manifest.sourceRevision !== revision)
    throw new BinError('stale_revision', { captured: manifest.sourceRevision, current: revision });
}
