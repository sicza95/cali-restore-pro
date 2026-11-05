import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { EditorWorkspace, Icon } from '../ui';

const meta = { title: 'Start here/Direction', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Baseline: Story = {
  render: () => (
    <div class="cr-story-page cr-direction-page">
      <div class="cr-story-heading">
        <Icon name="brand" size={28} />
        <span>
          CaliRestore <span>Interface library</span>
        </span>
        <small>Working baseline · 0.1</small>
      </div>
      <header class="cr-story-title">
        <p class="cr-overline">iPad first / canvas first</p>
        <h1>The surface is the workspace.</h1>
        <p>Tools on the left. Glass where it floats. A quiet, solid inspector.</p>
      </header>
      <div class="cr-direction-preview">
        <EditorWorkspace />
      </div>
      <div class="cr-direction-notes">
        <section>
          <h2>A stable place to work</h2>
          <p>
            One tool rail, one context bar and the same controls in landscape, portrait and focus
            mode.
          </p>
        </section>
        <section>
          <h2>Transparency with purpose</h2>
          <p>
            Floating tools use a restrained blur. Forms and measurements stay opaque. An opaque
            option is always available.
          </p>
        </section>
        <section>
          <h2>States you can trust</h2>
          <p>
            Local save, cloud sync and pending work are separate states. These stories demonstrate
            the UI without connecting project data.
          </p>
        </section>
      </div>
    </div>
  ),
};
