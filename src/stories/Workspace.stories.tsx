import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { EditorWorkspace } from '../ui/EditorWorkspace';

const meta = {
  title: 'Editor/Workspace',
  component: EditorWorkspace,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Review composition for the shared UI. Layer selection, visibility, tool selection, photo navigation, opacity, focus mode and calibration fields work in memory. Drawing, undo, import, export and durable saving are not connected.',
      },
    },
  },
  argTypes: {
    saveState: { control: 'select', options: ['saved', 'saving', 'offline', 'draft', 'error'] },
  },
} satisfies Meta<typeof EditorWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Landscape: Story = { args: { saveState: 'saved' }, globals: { theme: 'dark' } };
export const Light: Story = { args: { saveState: 'saved' }, globals: { theme: 'light' } };
export const Portrait: Story = {
  globals: { theme: 'dark', viewport: { value: 'ipadPortrait', isRotated: false } },
};
export const Focus: Story = { args: { initialFocus: true } };
export const Offline: Story = { args: { saveState: 'offline' } };
export const SaveFailure: Story = { args: { saveState: 'error' } };
export const EmptySurface: Story = { args: { initialEmpty: true }, globals: { theme: 'light' } };
export const OpaqueControls: Story = { globals: { theme: 'dark', transparency: 'opaque' } };
