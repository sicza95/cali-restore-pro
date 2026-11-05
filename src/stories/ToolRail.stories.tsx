import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { ToolRail, referencePhoto } from '../ui';
import type { Tool } from '../ui';

const meta = { title: 'Editor/Tool rail', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnPhotograph: Story = {
  render: () => {
    const [active, setActive] = createSignal<Tool>('brush');
    return (
      <main class="cr-rail-stage" style={{ 'background-image': `url('${referencePhoto}')` }}>
        <ToolRail active={active()} onChange={setActive} />
        <div class="cr-rail-description cr-glass">
          <h1>Tools stay on the left.</h1>
          <p>Use Up / Down to move focus, then Space to select.</p>
          <output>Active tool: {active()}</output>
        </div>
      </main>
    );
  },
};
export const Opaque: Story = { ...OnPhotograph, globals: { transparency: 'opaque' } };
