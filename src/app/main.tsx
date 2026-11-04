import { createSignal, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import './platform.css';
import type { PlatformStatus } from '../platform/api/types.gen';

function Platform() {
  const [status, setStatus] = createSignal<'checking' | PlatformStatus['status']>('checking');
  const [checking, setChecking] = createSignal(false);
  const refresh = async () => {
    if (checking()) return;
    setChecking(true);
    try {
      const response = await fetch('/api/v1/status', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const result: unknown = await response.json();
      setStatus(
        response.ok &&
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'ready'
          ? 'ready'
          : 'unavailable',
      );
    } catch {
      setStatus('unavailable');
    } finally {
      setChecking(false);
    }
  };
  onMount(() => void refresh());

  return (
    <main class="platform-shell">
      <h1>CaliRestore Pro</h1>
      <section aria-labelledby="platform-title">
        <h2 id="platform-title">Platform connection</h2>
        <p role="status" class="platform-state" data-status={status()}>
          {status() === 'checking'
            ? 'Checking connection…'
            : status() === 'ready'
              ? 'Connected'
              : 'Connection unavailable'}
        </p>
        <button type="button" disabled={checking()} onClick={() => void refresh()}>
          {checking() ? 'Checking…' : 'Check connection'}
        </button>
      </section>
      <p>
        The platform is being built. Accounts, projects and restoration tools will become available
        in upcoming releases.
      </p>
    </main>
  );
}

const theme = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  document.body.dataset.theme = theme.matches ? 'dark' : 'light';
};
applyTheme();
theme.addEventListener('change', applyTheme);
render(() => <Platform />, document.getElementById('app')!);
