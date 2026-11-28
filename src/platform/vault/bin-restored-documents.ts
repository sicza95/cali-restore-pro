import { seal, type Envelope } from './crypto';
import type { JournalWrite } from './project-store';
import { estimateTable, journalTable, reportTable } from './store';
import { getThen } from './bin-transaction';

export type BinRestoredDocuments = {
  journals: readonly JournalWrite[];
  drafts: readonly { kind: 'estimate' | 'report'; expected: number; text: string }[];
};

export async function sealRestoredDocuments(
  root: CryptoKey,
  account: string,
  project: string,
  documents: BinRestoredDocuments,
) {
  async function write(
    table: string,
    key: string[],
    expected: number,
    purpose: Parameters<typeof seal>[2],
    text: string,
  ) {
    const revision = expected + 1;
    return {
      table,
      key,
      expected,
      row: { id: project, revision, envelope: await seal(root, account, purpose, text) },
    };
  }
  return Promise.all([
    ...documents.journals.map(({ ref: { surface, source }, expected, text }) =>
      write(
        journalTable,
        [account, project, surface, source],
        expected,
        `surface-journal:${project}:${surface}:${source}:${expected + 1}`,
        text,
      ),
    ),
    ...documents.drafts.map(({ kind, expected, text }) => {
      const table = kind === 'estimate' ? estimateTable : reportTable;
      return write(
        table,
        [account, project],
        expected,
        `${table}:${project}:${expected + 1}`,
        text,
      );
    }),
  ]);
}

export function putRestoredDocuments(
  tx: IDBTransaction,
  writes: Awaited<ReturnType<typeof sealRestoredDocuments>>,
  done: () => void,
  abort: () => void,
) {
  function put(index: number) {
    const next = writes[index];
    if (!next) return done();
    const store = tx.objectStore(next.table);
    getThen(store, next.key, (current) => {
      if (
        ((current as { revision: number; envelope: Envelope } | undefined)?.revision ?? 0) !==
        next.expected
      )
        return abort();
      store.put(next.row, next.key);
      put(index + 1);
    });
  }
  put(0);
}
