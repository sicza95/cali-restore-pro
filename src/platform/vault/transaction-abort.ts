// Aborts an IndexedDB transaction that may already have finished. WebKit (and any engine, when a
// signal races the commit) throws InvalidStateError from abort() once the transaction is done;
// that is harmless, so it is swallowed. Any other error still surfaces.
export function abortTransaction(tx: IDBTransaction): void {
  try {
    tx.abort();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
  }
}

// Aborts the transaction when the signal aborts, and stops listening as soon as the transaction
// completes or aborts, so a late signal never touches a finished transaction. Returns the detach
// function for callers that settle earlier.
export function abortOnSignal(tx: IDBTransaction, signal: AbortSignal): () => void {
  const abort = () => abortTransaction(tx);
  const release = () => signal.removeEventListener('abort', abort);
  signal.addEventListener('abort', abort, { once: true });
  tx.addEventListener('complete', release, { once: true });
  tx.addEventListener('abort', release, { once: true });
  tx.addEventListener('error', release, { once: true });
  return release;
}
