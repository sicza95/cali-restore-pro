import type { icons } from './constants';

export type IconName = keyof typeof icons;
export type IconProps = { name: IconName; size?: number; class?: string };
