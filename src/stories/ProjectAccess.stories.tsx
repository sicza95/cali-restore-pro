import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { untrack } from 'solid-js';
import type { LocalVault } from '../platform/vault/vault';
import type { Language } from '../ui/account-access/types';
import { AppProvider } from '../ui/app-context/AppContext';
import {
  ProjectAccessProvider,
  ProjectAccessSection,
  ProjectWideAccessNote,
} from '../ui/projects/access';
import { ProjectInvitations } from '../ui/sharing/ProjectInvitations';
import { projectSnapshot } from '../platform/projects/shared-project';
import { accessAccount, accessProject, accessStoryApp } from './project-access-fixture';

const meta = { title: 'Projects/Access', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// These stories exercise request-only sharing controls; content publication needs a real open vault.
const vault = {} as LocalVault;
function Example(props: {
  hosted?: boolean;
  canManage?: boolean;
  language?: Language;
  conflict?: boolean;
  lastOwner?: boolean;
  child?: boolean;
  page?: boolean;
}) {
  const app = untrack(() =>
    accessStoryApp(props.language ?? 'en', props.conflict, props.lastOwner),
  );
  return (
    <AppProvider value={app}>
      <ProjectAccessProvider vault={vault}>
        <div style={{ width: props.page ? '640px' : '288px', 'max-width': '100%' }}>
          {props.page ? (
            <ProjectInvitations
              projectId={accessProject.id}
              project={projectSnapshot(accessProject)}
              vault={vault}
            />
          ) : props.child ? (
            <ProjectWideAccessNote project={accessProject} hosted={props.hosted ?? true} />
          ) : (
            <ProjectAccessSection
              project={accessProject}
              hosted={props.hosted ?? true}
              account={accessAccount}
              canManage={props.canManage ?? true}
            />
          )}
        </div>
      </ProjectAccessProvider>
    </AppProvider>
  );
}

export const Hosted: Story = { render: () => <Example /> };
export const LocalOnly: Story = { render: () => <Example hosted={false} /> };
export const ReadOnly: Story = { render: () => <Example canManage={false} /> };
export const VisibilityConflict: Story = { render: () => <Example conflict /> };
export const LastOwner: Story = { render: () => <Example lastOwner /> };
export const HungarianNarrow: Story = { render: () => <Example language="hu" /> };
export const ProjectWide: Story = { render: () => <Example child /> };
export const ExistingPage: Story = { render: () => <Example page /> };
