import { estimateCopy } from '../../platform/estimates/copy';
import { navigationText } from '../account-access/navigation-copy';
import { useApp } from '../app-context/AppContext';
import { routeTrail } from '../router/breadcrumbs';
import type { Crumb } from '../router/breadcrumbs';

/** The current route's breadcrumb trail and the label of each step, in the app language. */
export function usePageTrail() {
  const app = useApp();
  const trail = () => routeTrail(app.router.route());
  const label = (crumb: Crumb) => {
    const c = navigationText(app.lang());
    switch (crumb.kind) {
      case 'route':
        return c[crumb.name];
      case 'project':
        return app.names()[crumb.id] ?? c.project;
      case 'surface':
        return app.names()[crumb.id] ?? c.surface;
      case 'review':
        return estimateCopy[app.lang()][crumb.step];
    }
  };
  const title = () => label(trail().at(-1)!);
  return { trail, label, title };
}
