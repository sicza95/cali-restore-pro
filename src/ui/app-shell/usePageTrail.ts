import { estimateCopy } from '../../platform/estimates/copy';
import { navigationText } from '../account-access/navigation-copy';
import { useApp } from '../app-context/AppContext';
import { routeTrail } from '../router/breadcrumbs';
import type { Crumb } from '../router/breadcrumbs';

/**
 * The current route's breadcrumb trail and the label of each step, in the app language. On a
 * surface page the open project supplies the surface's object, a linked step of its own.
 */
export function usePageTrail() {
  const app = useApp();
  const trail = () => routeTrail(app.router.route(), (surface) => app.surfaceObjects()[surface]);
  const label = (crumb: Crumb) => {
    const c = navigationText(app.lang());
    switch (crumb.kind) {
      case 'route':
        return c[crumb.name];
      case 'project':
        return app.names()[crumb.id] ?? c.project;
      case 'object':
        return app.names()[crumb.id] ?? c.object;
      case 'surface':
        return app.names()[crumb.id] ?? c.surface;
      case 'organisation':
        return app.names()[crumb.id] ?? c.organisationCrumb;
      case 'bin':
        return c.bin;
      case 'review':
        return estimateCopy[app.lang()][crumb.step];
    }
  };
  const title = () => label(trail().at(-1)!);
  return { trail, label, title };
}
