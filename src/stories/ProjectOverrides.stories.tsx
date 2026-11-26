import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { BrowserItemKind, ProjectOverrides } from '../platform/projects/browser-contracts';
import type { Language } from '../platform/i18n/language';
import type { Project } from '../platform/projects/types';
import { resolveSettings, type AccountSettings } from '../platform/projects/settings';
import { RestorationOverridesSection, BrandingOverridesSection } from '../ui/projects/overrides';
import { preferenceDefaults } from '../ui/settings/preferences/utils';

const meta = {
  title: 'Projects/Inherited settings',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const root: AccountSettings = {
  restoration: {
    units: 'metric',
    areaUnit: 'cm²',
    currency: 'HUF',
    reportLanguage: 'en',
    snap: true,
  },
  branding: {
    studio: 'Conservation Studio',
    contact: 'Anna Kovács',
    footer: 'Conservation assessment',
    accent: preferenceDefaults.accent,
    logo: null,
  },
};

function Example(props: { level: BrowserItemKind; language: Language }) {
  const [overrides, setOverrides] = createSignal<ProjectOverrides>({
    restoration: { snap: false },
    branding: { footer: '', logo: null },
  });
  const project = (): Project => ({
    version: 2,
    id: 'project',
    name: 'North chapel',
    archived: false,
    updatedAt: 0,
    settings: { version: 1, units: 'metric', currency: 'HUF' },
    assets: [{ id: 'synthetic-logo', purpose: 'branding' }],
    overrides:
      props.level === 'project'
        ? overrides()
        : { restoration: { currency: 'EUR' }, branding: { studio: 'Chapel conservation' } },
    objects: [
      {
        id: 'object',
        name: 'North wall',
        units: null,
        overrides: props.level === 'object' ? overrides() : undefined,
        surfaces: [
          {
            id: 'surface',
            name: 'Painted plaster',
            units: null,
            images: [],
            overrides: props.level === 'surface' ? overrides() : undefined,
          },
        ],
      },
    ],
  });
  const target = () =>
    props.level === 'project'
      ? {}
      : { objectId: 'object', ...(props.level === 'surface' ? { surfaceId: 'surface' } : {}) };
  const effective = () => resolveSettings(root, project(), target());
  return (
    <main
      style={{
        'max-width': '380px',
        padding: '24px',
        background: 'var(--cr-surface)',
        color: 'var(--cr-ink)',
        'font-family': 'var(--cr-font)',
      }}
    >
      <RestorationOverridesSection
        language={props.language}
        level={props.level}
        projectId="project"
        {...target()}
        effective={effective()}
        overrides={overrides()}
        onChange={setOverrides}
      />
      <BrandingOverridesSection
        language={props.language}
        level={props.level}
        projectId="project"
        {...target()}
        effective={effective()}
        overrides={overrides()}
        onChange={setOverrides}
        onPickLogo={() => Promise.resolve({ assetId: 'synthetic-logo' })}
      />
    </main>
  );
}

export const ProjectSettings: Story = { render: () => <Example level="project" language="en" /> };
export const ObjectSettings: Story = { render: () => <Example level="object" language="en" /> };
export const SurfaceSettings: Story = { render: () => <Example level="surface" language="en" /> };
export const Hungarian: Story = { render: () => <Example level="surface" language="hu" /> };
