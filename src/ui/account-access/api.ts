import type { AuthResponse } from './types';

export async function requestAuth<T = AuthResponse>(
  action: string,
  csrf: string,
  body?: object,
  method = body ? 'POST' : 'GET',
) {
  const response = await fetch('/api/v1' + (action.startsWith('/') ? action : '/auth/' + action), {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15000),
    headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return {} as T;
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'unavailable');
  return result;
}
export async function checkConnection() {
  try {
    const response = await fetch('/api/v1/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json()) as { status: string };
    return response.ok && data.status === 'ready' ? 'ready' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
