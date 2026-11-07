import type { ControlContract } from '../control-registry/types';

type Context = Pick<
  ControlContract,
  'composition' | 'owner' | 'permission' | 'valueSource' | 'helpKey' | 'unavailable'
> & { behavior?: ControlContract['behavior'] };
type Entry = readonly [id: string, labelKey: string, command: string, prerequisite: string];

export function registerPlatformControls(context: Context, entries: readonly Entry[]) {
  return entries.map(([id, labelKey, command, prerequisite]): ControlContract => ({
    behavior: 'functional',
    ...context,
    id,
    labelKey,
    command,
    prerequisite,
  }));
}
