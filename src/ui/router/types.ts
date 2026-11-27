import type { accountPaths, publicRouteNames, reviewSteps } from './constants';

export type ReviewStep = (typeof reviewSteps)[number];
export type AccountDestination = keyof typeof accountPaths;
export type PublicRouteName = (typeof publicRouteNames)[number];

/** Where inside the project area a URL points: library, project, object, surface or review step. */
export type ProjectLocation = {
  project?: string;
  object?: string;
  surface?: string;
  review?: ReviewStep;
};

export type AppRoute =
  | { name: 'login' }
  | { name: 'notFound' }
  | { name: 'offline' }
  | { name: PublicRouteName }
  | ({ name: 'projects' } & ProjectLocation)
  | { name: 'organisations'; organisation?: string; bin?: true }
  | { name: Exclude<AccountDestination, 'projects' | 'organisations'> };

export type RouteName = AppRoute['name'];

/**
 * `public`: account shell, no session needed. `open`: standalone page outside the shell.
 * `signed-in`: needs a session. `admin`: needs a session with an administration capability.
 */
export type RouteAccess = 'public' | 'open' | 'signed-in' | 'admin';

export type SessionState = {
  loaded: boolean;
  signedIn: boolean;
  unavailable: boolean;
  canAdmin: boolean;
};

export type GuardResult = 'allow' | 'loading' | 'retry' | 'signIn' | 'forbidden';
