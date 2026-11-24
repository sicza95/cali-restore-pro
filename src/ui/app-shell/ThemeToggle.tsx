import { createSignal, onCleanup, onMount } from 'solid-js';
import { navigationText } from '../account-access/navigation-copy';
import { themeControl } from '../account-access/navigation-controls';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import { toggleTheme } from '../settings/preferences/utils';

/** Light/dark switch beside the language choice, on every page including sign-in. */
export function ThemeToggle() {
  const app = useApp();
  const c = () => navigationText(app.lang());
  const [dark, setDark] = createSignal(document.body.dataset.theme === 'dark');
  // The theme also changes from Preferences, the device setting or another account signing in.
  onMount(() => {
    const observer = new MutationObserver(() => setDark(document.body.dataset.theme === 'dark'));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    setDark(document.body.dataset.theme === 'dark');
    onCleanup(() => observer.disconnect());
  });
  const label = () => (dark() ? c().themeToLight : c().themeToDark);
  return (
    <button
      type="button"
      class="theme-toggle"
      data-control-id={themeControl.id}
      aria-label={label()}
      title={label()}
      onClick={() => toggleTheme(app.account()?.id)}
    >
      <Icon name={dark() ? 'sun' : 'moon'} size={20} />
    </button>
  );
}
