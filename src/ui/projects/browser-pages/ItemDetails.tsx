import { createResource, Show } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { useApp } from '../../app-context/AppContext';
import { projectOrganisation, useOrganisations } from '../../organisations/organisation-state';
import { organisationCopy } from '../../organisations/organisation-copy';
import type { ProjectOwner } from '../../sharing/types';
import { browserCopy } from '../browser/browser-copy';
import { childLabel } from '../browser/utils';
import { pageCopy } from './copy';
import type { Workspace } from './types';

/** Name, kind, place, organisation, creator, owners, dates and counts of the selection. */
export function ItemDetails(props: {
  ws: Workspace;
  item: BrowserItemDescriptor;
  hosted: boolean;
}) {
  const app = useApp();
  const orgs = useOrganisations();
  const copy = () => browserCopy[props.ws.language];
  const c = () => pageCopy[props.ws.language];
  // Owners come from the server for hosted projects; a local-only project has only this account.
  const [owners] = createResource(
    () => (props.hosted && props.item.access !== 'directory' ? props.item.projectId : undefined),
    (project) =>
      app
        .request<{ owners: ProjectOwner[] }>('/hosted-projects/' + project + '/owners')
        .then(({ owners }) => owners)
        .catch(() => undefined),
  );
  const date = (value: number | null) =>
    value === null
      ? copy().unknown
      : new Intl.DateTimeFormat(props.ws.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(value);
  const project = () => props.ws.projects().find(({ id }) => id === props.item.projectId);
  const location = () => {
    const found = project();
    if (!found || props.item.kind === 'project') return undefined;
    const object = found.objects.find(({ id }) => id === props.item.objectId);
    return props.item.kind === 'object' ? found.name : found.name + ' › ' + (object?.name ?? '');
  };
  const organisation = () => {
    const id = projectOrganisation(props.item.organisation ?? undefined, orgs.list());
    const found = orgs.list().find((entry) => entry.id === id);
    if (!found) return copy().unknown;
    return found.personal ? organisationCopy[props.ws.language].personal : found.name;
  };
  const ownerNames = () => {
    if (props.item.owners.length) return props.item.owners.map(({ name }) => name).join(', ');
    const found = owners();
    if (found?.length) return found.map(({ email }) => email).join(', ');
    return props.hosted ? copy().unknown : (app.account()?.email ?? copy().unknown);
  };
  const creator = () => {
    const id = props.item.createdBy;
    if (!id) return copy().unknown;
    if (id === app.account()?.id) return c().you;
    return owners()?.find((owner) => owner.id === id)?.email ?? copy().unknown;
  };
  return (
    <dl class="project-browser-details">
      <dt>{copy().name}</dt>
      <dd>{props.item.name}</dd>
      <dt>{c().kind}</dt>
      <dd>{copy().kinds[props.item.kind]}</dd>
      <Show when={location()}>
        {(place) => (
          <>
            <dt>{c().location}</dt>
            <dd>{place()}</dd>
          </>
        )}
      </Show>
      <dt>{c().organisation}</dt>
      <dd>{organisation()}</dd>
      <dt>{c().owners}</dt>
      <dd>{ownerNames()}</dd>
      <Show when={props.item.access !== 'directory'}>
        <dt>{c().creator}</dt>
        <dd>{creator()}</dd>
        <dt>{copy().created}</dt>
        <dd>{date(props.item.createdAt)}</dd>
        <dt>{copy().modified}</dt>
        <dd>{date(props.item.updatedAt)}</dd>
        <dt>{c().contents}</dt>
        <dd>{childLabel(props.item, props.ws.language)}</dd>
      </Show>
    </dl>
  );
}
