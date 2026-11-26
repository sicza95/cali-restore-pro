import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { BrowserExample } from './BrowserExample';

const meta = {
  title: 'Patterns/Project browser',
  component: BrowserExample,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Synthetic, in-memory presentation examples. Find demonstrates plain names only; platform query parsing, storage, settings and routing are injected during integration. Missing-image fixtures intentionally request a nonexistent thumbnail. Inspector contents are example slots, not settings editors.',
      },
    },
  },
} satisfies Meta<typeof BrowserExample>;
export default meta;
type Story = StoryObj<typeof meta>;
const landscape = { viewport: { value: 'ipadLandscape', isRotated: false } };
const portrait = { viewport: { value: 'ipadPortrait', isRotated: false } };

export const ProjectsDarkLandscape: Story = {
  args: { level: 'project' },
  globals: { ...landscape, theme: 'dark' },
};
export const ProjectsLightLandscape: Story = {
  args: { level: 'project' },
  globals: { ...landscape, theme: 'light' },
};
export const ProjectsDarkPortrait: Story = {
  args: { level: 'project', language: 'hu', inspectorOpen: false },
  globals: { ...portrait, theme: 'dark' },
};
export const ProjectsLightPortrait: Story = {
  args: { level: 'project', language: 'hu' },
  globals: { ...portrait, theme: 'light' },
};
export const ObjectsDarkLandscape: Story = {
  args: { level: 'object' },
  globals: { ...landscape, theme: 'dark' },
};
export const ObjectsLightLandscape: Story = {
  args: { level: 'object', initialView: 'list' },
  globals: { ...landscape, theme: 'light' },
};
export const ObjectsDarkPortrait: Story = {
  args: { level: 'object', language: 'hu' },
  globals: { ...portrait, theme: 'dark' },
};
export const ObjectsLightPortrait: Story = {
  args: { level: 'object', language: 'hu', initialView: 'list' },
  globals: { ...portrait, theme: 'light' },
};
export const SurfacesDarkLandscape: Story = {
  args: { level: 'surface' },
  globals: { ...landscape, theme: 'dark' },
};
export const SurfacesLightLandscape: Story = {
  args: { level: 'surface', initialView: 'list' },
  globals: { ...landscape, theme: 'light' },
};
export const SurfacesDarkPortrait: Story = {
  args: { level: 'surface', language: 'hu', initialView: 'list' },
  globals: { ...portrait, theme: 'dark' },
};
export const SurfacesLightPortrait: Story = {
  args: { level: 'surface', language: 'hu' },
  globals: { ...portrait, theme: 'light' },
};
export const EmptyProject: Story = { args: { level: 'object', state: 'empty' } };
export const NoMatches: Story = { args: { state: 'no-matches' }, globals: { theme: 'light' } };
export const RemoteUnavailable: Story = { args: { state: 'remote-unavailable' } };
export const SearchDiagnostic: Story = { args: { state: 'diagnostic' } };
export const NewName: Story = { args: { initialDialog: 'new' }, globals: { theme: 'light' } };
export const Rename: Story = {
  args: { initialDialog: 'rename', language: 'hu' },
  globals: { ...portrait, theme: 'dark' },
};
export const DeleteConfirmation: Story = {
  args: { level: 'object', initialDialog: 'delete' },
  globals: { theme: 'light' },
};
export const BlockedDeletion: Story = {
  args: { level: 'surface', initialDialog: 'delete', blockedDelete: true },
  globals: { ...portrait, theme: 'dark' },
};
