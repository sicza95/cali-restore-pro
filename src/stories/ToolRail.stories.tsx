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

const customTools = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: 'select' },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: 'brush' },
  { id: 'shape', label: 'Shape', shortcut: 'S', icon: 'shape' },
  { id: 'nodes', label: 'Edit points', shortcut: 'A', icon: 'nodes' },
] as const;
type CustomTool = (typeof customTools)[number]['id'];

/** A caller-supplied tool list with its own control ids and one tool that cannot be used yet. */
export const CustomTools: Story = {
  render: () => {
    const [active, setActive] = createSignal<CustomTool>('select');
    return (
      <main class="cr-rail-stage" style={{ 'background-image': `url('${referencePhoto}')` }}>
        <ToolRail
          label="Sample tools"
          tools={customTools}
          active={active()}
          onChange={setActive}
          controlId={(tool) => `story.tool.${tool}`}
          disabledReason={(tool) => (tool === 'nodes' ? 'This layer has no paths yet.' : undefined)}
        />
        <div class="cr-rail-description cr-glass">
          <h1>The tool list is data.</h1>
          <p>Edit points is unavailable and says why.</p>
          <output>Active tool: {active()}</output>
        </div>
      </main>
    );
  },
};
