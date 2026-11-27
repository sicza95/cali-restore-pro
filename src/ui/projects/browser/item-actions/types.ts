import type { IconName } from '../../../icon/types';

export type ItemAction = {
  id: string;
  label: string;
  icon: IconName;
  supplement?: IconName;
  reason?: string;
  checked?: boolean;
  run: () => void;
};
export type ShowFilter = { archived: boolean; online: boolean; offline: boolean };
