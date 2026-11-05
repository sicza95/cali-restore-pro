import {
  OriginalAccessDenied,
  requestOriginal,
  requestOriginalShape,
  sharedOriginalCipher,
} from '../projects/shared-originals';
import type { OriginalGrant, SharedOriginal } from '../projects/shared-originals';
import { open, seal } from './crypto';
import type { Envelope } from './crypto';
import { assertID, assertShape, chunkCount, parseManifest, partBytes } from './file-format';
import { localFiles } from './file-store';
import { readBounded } from './files';

type Pin = { grant: OriginalGrant; original: SharedOriginal };
type PinRef = { invitation: string; id: string };
const pinID = ({ invitation, id }: PinRef) => {
  assertID(invitation);
  assertID(id);
  return `pin:${invitation}:${id}` as const;
};

export function originalPins(
  root: CryptoKey,
  account: string,
  stamp: () => string,
  locked: AbortSignal,
) {
  let lastStamp = stamp();
  const store = () => localFiles(account, (lastStamp = stamp() || lastStamp));
  const signalFor = (signal?: AbortSignal) => (signal ? AbortSignal.any([signal, locked]) : locked);
  const denied = new Set<string>();

  async function descriptor(id: `pin:${string}`, envelope: Envelope, signal: AbortSignal) {
    const pin = JSON.parse(await open(root, account, id, envelope)) as Pin;
    signal.throwIfAborted();
    return pin;
  }

  async function list(signal = locked) {
    signal.throwIfAborted();
    const pins = [];
    for (const row of await store().pins()) {
      if (denied.has(row.id)) continue;
      const { grant, original } = await descriptor(row.id as `pin:${string}`, row.pin, signal);
      pins.push({ invitation: grant.invitation, id: original.id, name: original.name });
    }
    signal.throwIfAborted();
    return pins;
  }

  async function check(ref: PinRef, signal: AbortSignal) {
    const id = pinID(ref);
    try {
      await requestOriginalShape(ref.invitation, ref.id, signal);
    } catch (error) {
      if (error instanceof OriginalAccessDenied) {
        denied.add(id);
        await store().remove(id);
      }
      throw error;
    }
  }

  return {
    list: () => list(),
    async pin(
      grant: OriginalGrant,
      original: SharedOriginal,
      options: {
        signal?: AbortSignal;
        progress?: (completed: number, total: number) => void;
      } = {},
    ) {
      const ref = { invitation: grant.invitation, id: original.id };
      const id = pinID(ref);
      const signal = signalFor(options.signal);
      // A failed authorization check here must not delete another tab's staging row.
      const shape = await requestOriginalShape(ref.invitation, ref.id, signal);
      const cipher = await sharedOriginalCipher(grant.project, grant.sender, original);
      const pin = await seal(root, account, id, JSON.stringify({ grant, original } satisfies Pin));
      await store().cleanup();
      signal.throwIfAborted();
      await store().start(id, {
        ...shape,
        project: grant.project,
        ready: false,
        started: Date.now(),
        pin,
      });
      try {
        const total = chunkCount(shape);
        for (let index = 0; index <= total; index++) {
          const part = await requestOriginal(grant.invitation, original.id, signal, index);
          const bytes = await readBounded(part, partBytes(shape, index));
          const plain = await cipher.open(index, bytes);
          try {
            if (index === 0) parseManifest(plain, shape);
          } finally {
            new Uint8Array(plain).fill(0);
          }
          signal.throwIfAborted();
          await store().write(id, index, bytes);
          if (index) options.progress?.(index, total);
        }
        // Catch revocation after the last chunk and before making the pin visible.
        await requestOriginalShape(ref.invitation, ref.id, signal);
        signal.throwIfAborted();
        await store().finish(id);
        denied.delete(id);
      } catch (error) {
        await store()
          .remove(id)
          .catch(() => undefined);
        throw error;
      }
    },
    async reconcile(external?: AbortSignal) {
      const signal = signalFor(external);
      let incomplete = false;
      let removed = false;
      for (const ref of await list(signal)) {
        try {
          await check(ref, signal);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof OriginalAccessDenied) removed = true;
          else incomplete = true;
        }
      }
      return { incomplete, removed };
    },
    async unpin(ref: PinRef) {
      const id = pinID(ref);
      locked.throwIfAborted();
      if ((await store().header(id))?.ready) await store().remove(id);
    },
    async open(ref: PinRef, external?: AbortSignal) {
      const signal = signalFor(external);
      const id = pinID(ref);
      signal.throwIfAborted();
      const row = await store().header(id);
      if (!row?.ready || !row.pin || denied.has(id)) throw new Error('Pin unavailable');
      const startedOnline = navigator.onLine;
      if (startedOnline) await check(ref, signal);
      const { grant, original } = await descriptor(id, row.pin, signal);
      const cipher = await sharedOriginalCipher(grant.project, grant.sender, original);
      assertShape(row);
      const part = async (index: number) => {
        signal.throwIfAborted();
        const bytes = await store().read(id, index);
        if (!bytes || bytes.byteLength !== partBytes(row, index)) throw new Error('Incomplete pin');
        return cipher.open(index, bytes);
      };
      const manifest = parseManifest(await part(0), row);
      const chunks: ArrayBuffer[] = [];
      for (let index = 1; index <= chunkCount(row); index++) chunks.push(await part(index));
      if (!startedOnline && navigator.onLine) await check(ref, signal);
      if (denied.has(id) || !(await store().header(id))?.ready) throw new Error('Pin unavailable');
      signal.throwIfAborted();
      return { name: manifest.name, blob: new Blob(chunks, { type: 'application/octet-stream' }) };
    },
  };
}
