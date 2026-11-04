import { For } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Icon } from '../ui/Icon';

const meta = { title: 'Foundations/Tokens', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const roles = [
  ['ground', 'Workspace'],
  ['surface', 'Inspector & forms'],
  ['raised', 'Secondary surface'],
  ['ink', 'Primary text'],
  ['muted', 'Supporting text'],
  ['accent', 'Selection & focus'],
  ['positive', 'Saved'],
  ['warning', 'Needs attention'],
  ['negative', 'Action needed'],
] as const;

export const System: Story = {
  render: () => (
    <main class="cr-story-page">
      <div class="cr-story-heading">
        <Icon name="brand" size={28} />
        <span>
          CaliRestore <span>Interface library</span>
        </span>
      </div>
      <header class="cr-story-title">
        <p class="cr-overline">Foundations / 0.1</p>
        <h1>One system. Both themes.</h1>
        <p>Use semantic roles for every surface, control and state.</p>
      </header>
      <section class="cr-token-grid" aria-label="Semantic colors">
        <For each={roles}>
          {([role, description]) => (
            <div class="cr-token">
              <span class="cr-token-chip" style={{ background: `var(--cr-${role})` }} />
              <div>
                <strong>{description}</strong>
                <code>--cr-{role}</code>
              </div>
            </div>
          )}
        </For>
      </section>
      <div class="cr-foundation-columns">
        <section>
          <h2>DM Sans</h2>
          <div class="cr-type-sample">
            <h1>North wall</h1>
            <h2>Surface quantities</h2>
            <p>Precision without visual noise.</p>
            <span class="cr-number">6.00 m² · 0.78 m² · 13.0%</span>
          </div>
        </section>
        <section>
          <h2>Touch & spacing</h2>
          <dl class="cr-facts">
            <div>
              <dt>Minimum target</dt>
              <dd>44 × 44 px</dd>
            </div>
            <div>
              <dt>Spacing rhythm</dt>
              <dd>4 / 8 / 12 / 16 / 24</dd>
            </div>
            <div>
              <dt>Controls / panels</dt>
              <dd>8 / 12 px radius</dd>
            </div>
            <div>
              <dt>Keyboard focus</dt>
              <dd>2 px + 3 px offset</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  ),
};
