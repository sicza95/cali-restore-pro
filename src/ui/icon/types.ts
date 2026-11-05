import type { paths } from './constants';

export type IconName = keyof typeof paths;
export type IconProps = { name: IconName; size?: number; class?: string };
