import { createMemo, createSignal, Show } from 'solid-js';
import type {
  BrowserItemDescriptor,
  EntityOverrides,
  ProjectOverrides,
} from '../../../platform/projects/browser-contracts';

import {
  editableEntityOverrides,
  preserveLegacyProjectSettings,
  resolveSettings,
} from '../../../platform/projects/settings';
import type { RestorationObject, Surface } from '../../../platform/projects/types';
import { useApp } from '../../app-context/AppContext';

import { BrandingOverridesSection, RestorationOverridesSection } from '../overrides';
import { loadAccountSettings } from '../../settings/preferences/utils';

import { chooseImage, importLogo } from './logo';
import { withOverrides } from './overrides';

import { entityOf } from './types';
import type { Workspace } from './types';

export function ManageDefaults(props: { ws: Workspace; item: BrowserItemDescriptor }) {
  const app = useApp();
  const target = () =>
    props.item.kind === 'project'
      ? ({ kind: 'project' } as const)
      : props.item.kind === 'object'
        ? ({ kind: 'object', objectId: props.item.id } as const)
        : ({ kind: 'surface', objectId: props.item.objectId!, surfaceId: props.item.id } as const);
  const inspected = createMemo(() => {
    const project = props.ws.projects().find(({ id }) => id === props.item.projectId);
    return project && props.item.access !== 'directory' ? entityOf(project, target()) : undefined;
  });
  const editable = () =>
    props.item.access === 'editable' &&
    !!inspected() &&
    !inspected()!.project.archived &&
    !inspected()!.entity.archived;
  const account = () => loadAccountSettings(app.account()?.id);
  type Overrides = EntityOverrides | ProjectOverrides;
  // Shown at once while it saves; cleared after the save, so a failure rolls the controls back.
  const [pending, setPending] = createSignal<Overrides>();
  const effective = () => {
    const found = inspected()!;
    const t = found.target;
    const next = pending();
    const project = next
      ? withOverrides(found.project, t, next, account())
      : preserveLegacyProjectSettings(found.project);
    return resolveSettings(account(), project, {
      objectId: t.kind === 'project' ? undefined : t.objectId,
      surfaceId: t.kind === 'surface' ? t.surfaceId : undefined,
    });
  };
  const overrides = (): Overrides => {
    const next = pending();
    if (next) return next;
    const found = inspected()!;
    return found.target.kind === 'project'
      ? (preserveLegacyProjectSettings(found.project).overrides ?? {})
      : editableEntityOverrides(found.entity as RestorationObject | Surface);
  };
  let queued: Overrides | undefined;
  let saving = false;
  // Changes made while one saves are saved after it, in order, against the latest saved project.
  async function flush() {
    if (saving) return;
    saving = true;
    try {
      while (queued) {
        const next = queued;
        queued = undefined;
        const found = inspected();
        if (!found) break;
        const saved = await props.ws.run(() =>
          props.ws.save(withOverrides(found.project, found.target, next, account())),
        );
        if (!saved) queued = undefined;
      }
    } finally {
      saving = false;
      setPending(undefined);
    }
  }
  const change = (next: Overrides) => {
    if (!inspected()) return;
    setPending(() => next);
    queued = next;
    void flush();
  };
  const sectionProps = () => {
    const t = inspected()!.target;
    return {
      language: props.ws.language,
      level: props.item.kind,
      projectId: props.item.projectId,
      objectId: t.kind === 'project' ? undefined : t.objectId,
      surfaceId: t.kind === 'surface' ? t.surfaceId : undefined,
      effective: effective(),
      overrides: overrides(),
      // Not disabled by this panel's own save: the toggle stays put instead of flickering.
      disabled: !editable() || (props.ws.busy() && !pending()),
      onChange: change,
    };
  };
  async function pickLogo() {
    const file = await chooseImage();
    const found = inspected();
    if (!file || !found) return undefined;
    const { saved, logo } = await importLogo(props.ws.vault, found.project, file);
    props.ws.update(saved);
    return logo;
  }
  return (
    <div class="project-settings">
      <Show when={inspected()}>
        <RestorationOverridesSection {...sectionProps()} />
        <BrandingOverridesSection {...sectionProps()} onPickLogo={pickLogo} />
      </Show>
    </div>
  );
}
