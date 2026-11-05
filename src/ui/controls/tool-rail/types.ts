import type { tools } from './constants';

export type Tool = (typeof tools)[number]['id'];

export type ToolRailProps = { active: Tool; onChange: (tool: Tool) => void };
