import { authErrorMessages, publicRoutes } from './constants';
import type { Language, Message, Route } from './types';

export function accountRoute(path: string): Route {
  if (path === '/settings/security') return 'security';
  if (path === '/projects' || path.startsWith('/projects/')) return 'projects';
  if (path === '/settings/account') return 'profile';
  if (path === '/settings/preferences') return 'preferences';
  if (path === '/admin') return 'admin';
  return publicRoutes.find((route) => route === path.slice(1)) ?? 'login';
}

export function authErrorMessage(code: string): Message {
  return (authErrorMessages as Partial<Record<string, Message>>)[code] ?? 'unavailable';
}

export function authFormBody(
  form: HTMLFormElement,
  action: string,
  language: Language,
  linkToken: string,
) {
  const fields = new FormData(form);
  const email = String(fields.get('email') ?? '');
  const password = String(fields.get('password') ?? '');
  const confirm = fields.get('confirm') === 'on';
  return action === 'login'
    ? { email, password }
    : action === 'confirm'
      ? { password }
      : action === 'change-password'
        ? { password, confirm }
        : action === 'change-email'
          ? { email, confirm }
          : action === 'register'
            ? { email, password, language }
            : action === 'forgot-password' || action === 'resend-verification'
              ? { email, language }
              : action === 'reset-password'
                ? { token: linkToken, password }
                : { token: linkToken };
}
