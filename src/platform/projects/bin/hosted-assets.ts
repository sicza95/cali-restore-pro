import { TransferError } from '../../vault/file-transfer';
import type { LocalVault } from '../../vault/vault';
import { BinError } from './errors';

export async function uploadBinAssets(
  vault: LocalVault,
  project: string,
  ids: readonly string[],
  csrf: string,
) {
  for (const id of ids) {
    try {
      await vault.files().upload({ project, id }, { csrf });
    } catch (error) {
      if (error instanceof TransferError) {
        if (error.code === 'storage_quota_exceeded') throw new BinError('quota_exceeded');
        if ([401, 403].includes(error.status)) throw new BinError('forbidden');
        if (error.status === 404) throw new BinError('incomplete_recovery');
      }
      throw error;
    }
  }
}

export async function downloadBinAssets(
  vault: LocalVault,
  project: string,
  ids: readonly string[],
) {
  for (const id of ids) {
    const files = vault.files();
    const ref = { project, id };
    if (await files.metadata(ref).catch(() => undefined)) continue;
    try {
      await files.download(ref);
    } catch (error) {
      if (error instanceof TransferError) {
        if ([401, 403].includes(error.status)) throw new BinError('forbidden');
        if (error.status === 404) throw new BinError('incomplete_recovery');
      }
      throw error;
    }
  }
}
