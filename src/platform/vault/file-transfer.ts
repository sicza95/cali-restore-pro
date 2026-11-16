// HTTP for hosted files: one checked request per call, and a bounded body reader for parts.
export class TransferError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function transferRequest(
  path: string,
  signal: AbortSignal,
  method = 'GET',
  csrf?: string,
  body?: string | ArrayBuffer,
) {
  signal.throwIfAborted();
  const headers = new Headers();
  if (csrf !== undefined) headers.set('X-CSRF-Token', csrf);
  if (typeof body === 'string') headers.set('Content-Type', 'application/json');
  if (body instanceof ArrayBuffer) {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set(
      'X-Ciphertext-SHA256',
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    );
  }
  const response = await fetch(path, {
    method,
    headers,
    body,
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new TransferError(response.status, value?.error ?? 'transfer_failed');
  }
  return response;
}

export async function readBounded(response: Response, size: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing ciphertext');
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > size - offset) throw new Error('Oversized ciphertext');
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== size) throw new Error('Incomplete ciphertext');
  return bytes.buffer;
}
