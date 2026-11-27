import { For } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { CompositeIcon } from '../ui';
import { StatusBadge } from '../ui/projects/browser';
import { VisibilityBadge } from '../ui/projects/browser/status-badge/VisibilityBadge';

const meta = {
  title: 'Foundations/Composite icon',
  component: CompositeIcon,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CompositeIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BrowserStatus: Story = {
  args: { base: 'cloud', supplement: 'circle-check' },
  render: () => (
    <main class="cr-story-page cr-status-page">
      <header class="cr-story-title">
        <h1>One symbol, two parts.</h1>
        <p>A base icon and a smaller lower-right supplement share one color.</p>
      </header>
      <For each={['local', 'paused', 'pending', 'synced'] as const}>
        {(status) => (
          <div class="cr-status-example">
            <StatusBadge language="en" status={status} />
          </div>
        )}
      </For>
      <For each={['listed', 'private'] as const}>
        {(visibility) => (
          <div class="cr-status-example">
            <VisibilityBadge visibility={visibility} language="en" />
          </div>
        )}
      </For>
      <div class="cr-status-example" style={{ color: 'var(--cr-status-synced)' }}>
        <For each={[16, 20, 32, 48]}>
          {(size) => (
            <div>
              <CompositeIcon base="cloud" supplement="circle-check" size={size} />
            </div>
          )}
        </For>
      </div>
    </main>
  ),
};
