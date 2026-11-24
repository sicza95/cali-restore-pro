import { Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { OrganisationDetailPage } from './OrganisationDetailPage';
import { OrganisationList } from './OrganisationList';
import '../settings/settings-page.css';
import './organisations.css';

/** `/organisations` lists them; `/organisations/<id>` manages one. */
export function OrganisationsPage() {
  const app = useApp();
  const id = () => {
    const route = app.router.route();
    return route.name === 'organisations' ? route.organisation : undefined;
  };
  return (
    <Show when={id()} keyed fallback={<OrganisationList />}>
      {(organisation) => <OrganisationDetailPage id={organisation} />}
    </Show>
  );
}
