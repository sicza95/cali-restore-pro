import { For } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { SaveStatus } from '../ui/controls';
import type { SaveState } from '../ui/controls';

const meta = { title: 'Editor/Save status', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <main class="cr-story-page cr-status-page">
      <header class="cr-story-title">
        <h1>Local work has a clear state.</h1>
        <p>Durable local saving is separate from cloud availability.</p>
      </header>
      <For each={['saved', 'saving', 'offline', 'draft', 'error'] as SaveState[]}>
        {(state) => (
          <div class="cr-status-example">
            <span>{state}</span>
            <SaveStatus state={state} />
          </div>
        )}
      </For>
    </main>
  ),
};
