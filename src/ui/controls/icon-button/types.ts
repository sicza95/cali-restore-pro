import type { IconName } from '../../icon/types';
import type { ButtonProps } from '../button/types';

export type IconButtonProps = Omit<ButtonProps, 'icon' | 'children'> & {
  icon: IconName;
  label: string;
};
