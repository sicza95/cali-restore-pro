import type { Preview } from 'storybook-solidjs-vite';
import '@fontsource-variable/dm-sans';
import '../src/ui/tokens.css';
import '../src/ui/ui.css';
import '../src/stories/stories.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Interface theme',
      toolbar: { icon: 'mirror', items: ['dark', 'light'], dynamicTitle: true },
    },
    transparency: {
      description: 'Floating tool surfaces',
      toolbar: { icon: 'contrast', items: ['glass', 'opaque'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'dark', transparency: 'glass' },
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    a11y: { test: 'error' },
    options: {
      storySort: { order: ['Start here', 'Foundations', 'Controls', 'Editor', 'Patterns'] },
    },
    viewport: {
      options: {
        ipadLandscape: {
          name: 'iPad Pro 11″ · landscape',
          styles: { width: '1194px', height: '834px' },
          type: 'tablet',
        },
        ipadPortrait: {
          name: 'iPad Pro 11″ · portrait',
          styles: { width: '834px', height: '1194px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
    },
  },
  decorators: [
    (Story, context) => (
      <div
        class="cr-root"
        data-theme={context.globals.theme ?? 'dark'}
        data-transparency={context.globals.transparency ?? 'glass'}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
