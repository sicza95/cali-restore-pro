export const offlineAccountKey = 'cr-offline-originals-account';

export function rememberOfflineAccount(account?: string) {
  if (account) localStorage.setItem(offlineAccountKey, account);
  else localStorage.removeItem(offlineAccountKey);
}
