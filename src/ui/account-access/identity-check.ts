import { createSignal } from 'solid-js';

/**
 * "Confirm it's you" is asked only at the last step: when the server refuses a change because the
 * session has no recent confirmation. `ask` opens the dialog and resolves once the person has
 * confirmed (with their password or a passkey) or cancelled.
 */
export function createIdentityCheck() {
  const [settle, setSettle] = createSignal<(confirmed: boolean) => void>();
  return {
    open: () => !!settle(),
    ask: () =>
      new Promise<boolean>((resolve) =>
        setSettle(() => (confirmed: boolean) => {
          setSettle(undefined);
          resolve(confirmed);
        }),
      ),
    settle: (confirmed: boolean) => settle()?.(confirmed),
  };
}
