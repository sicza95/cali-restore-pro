import type { IconName } from '../icon/types';

export type CompositeIconProps = {
  base: IconName;
  supplement: IconName;
  size?: number;
  class?: string;
};
