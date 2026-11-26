import type { HostedProjectVisibility, ProjectVisibilityWrite } from '../api';

/** Uses the authenticated request function, which supplies CSRF and the API prefix. */
export type VisibilityRequest = <T>(path: string, body?: object, method?: string) => Promise<T>;

export function projectVisibility(request: VisibilityRequest, project: string) {
  const path = '/hosted-projects/' + encodeURIComponent(project) + '/visibility';
  return {
    read: () => request<HostedProjectVisibility>(path),
    write: (value: ProjectVisibilityWrite) =>
      request<HostedProjectVisibility>(path, value, 'PATCH'),
  };
}
