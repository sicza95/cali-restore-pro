import { createContext, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';

const AccessVault = createContext<() => LocalVault>();

/** Share the already-open vault; never create another vault handle for the inspector. */
export function ProjectAccessProvider(props: { vault: LocalVault; children: JSX.Element }) {
  // eslint-disable-next-line solid/reactivity -- the getter is read lazily by consumers
  return <AccessVault.Provider value={() => props.vault}>{props.children}</AccessVault.Provider>;
}

export const useAccessVault = () => useContext(AccessVault);
