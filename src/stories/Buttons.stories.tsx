import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Button, IconButton } from '../ui';

const meta = {
  title: 'Controls/Buttons',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Save checkpoint', variant: 'primary', disabled: false },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
  },
  decorators: [
    (Story) => (
      <div class="cr-component-stage">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Cancel' } };
export const WithIcon: Story = {
  args: { variant: 'secondary', icon: 'plus', children: 'Add layer' },
};
export const Destructive: Story = { args: { variant: 'danger', children: 'Remove layer' } };
export const Disabled: Story = { args: { disabled: true } };
export const IconOnly: Story = {
  render: () => <IconButton variant="secondary" label="Focus canvas" icon="focus" />,
};
