import type { ReviewRoute } from '../project-review/report-controls';

const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const pattern = new RegExp(
  `^/projects(?:/(${uuid})(?:/surfaces/(${uuid})|/(estimates|reports|outputs))?)?/*$`,
);

export function projectRoute(path: string) {
  const match = pattern.exec(path);
  return match
    ? { project: match[1], surface: match[2], review: match[3] as ReviewRoute | undefined }
    : undefined;
}

export function projectHref(project?: string, surface?: string) {
  if (!project) return '/projects';
  return '/projects/' + project + (surface ? '/surfaces/' + surface : '');
}

export function projectReviewHref(project: string, route: ReviewRoute) {
  return projectHref(project) + '/' + route;
}

export function followProjectLink(
  event: MouseEvent & { currentTarget: HTMLAnchorElement },
  navigate: (href: string) => void,
) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigate(event.currentTarget.pathname);
}
