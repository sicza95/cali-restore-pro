import { describe, expect, it } from 'vitest';
import {
  accountInitial,
  forgetAccount,
  readRemembered,
  rememberAccount,
  rememberedAccountLimit,
  rememberedAccountsKey,
  setSignInIntent,
  settleSignIn,
} from './remembered-accounts';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('remembered accounts', () => {
  it('keeps the newest first, without duplicates in any letter case', () => {
    const store = memory();
    rememberAccount('anna@example.test', store, 1);
    rememberAccount('ben@example.test', store, 2);
    rememberAccount('Anna@Example.test ', store, 3);
    expect(readRemembered(store).map((a) => a.email)).toEqual([
      'Anna@Example.test',
      'ben@example.test',
    ]);
  });

  it('keeps at most the limit', () => {
    const store = memory();
    for (let i = 0; i < rememberedAccountLimit + 3; i++)
      rememberAccount(`p${i}@example.test`, store, i);
    const list = readRemembered(store);
    expect(list).toHaveLength(rememberedAccountLimit);
    expect(list[0]?.email).toBe(`p${rememberedAccountLimit + 2}@example.test`);
  });

  it('forgets an account and clears the key when the list is empty', () => {
    const store = memory();
    rememberAccount('anna@example.test', store, 1);
    forgetAccount('ANNA@example.test', store);
    expect(readRemembered(store)).toEqual([]);
    expect(store.data.has(rememberedAccountsKey)).toBe(false);
  });

  it('reads damaged storage as empty', () => {
    const store = memory();
    store.setItem(rememberedAccountsKey, '{not json');
    expect(readRemembered(store)).toEqual([]);
    store.setItem(rememberedAccountsKey, JSON.stringify([{ email: 'no-at' }, 4, null]));
    expect(readRemembered(store)).toEqual([]);
  });

  it('applies the sign-in choice only after a successful sign-in', () => {
    const store = memory();
    setSignInIntent({ remember: true, email: 'anna@example.test' });
    settleSignIn(undefined, store);
    expect(readRemembered(store)).toEqual([]);
    settleSignIn('anna@example.test', store);
    expect(readRemembered(store)).toEqual([]);

    setSignInIntent({ remember: true });
    settleSignIn('anna@example.test', store);
    expect(readRemembered(store).map((a) => a.email)).toEqual(['anna@example.test']);

    setSignInIntent({ remember: false, email: 'anna@example.test' });
    settleSignIn('anna@example.test', store);
    expect(readRemembered(store)).toEqual([]);
  });

  it('uses the first letter as the badge', () => {
    expect(accountInitial(' zoe@example.test')).toBe('Z');
    expect(accountInitial('')).toBe('?');
  });
});
