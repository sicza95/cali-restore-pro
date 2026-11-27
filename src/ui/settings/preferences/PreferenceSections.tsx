import { createSignal, onCleanup, untrack } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { languageNames, languages } from '../../../platform/i18n/language';
import { settingsCopy } from '../settings-copy';
import { settingsHelpCopy } from '../settings-help-copy';
import { navigationText } from '../../account-access/navigation-copy';
import { SettingsItem, SettingsSection } from '../SettingsItem';
import { ChoiceButtons as Choices } from './choice-buttons/ChoiceButtons';
import { SettingsToggleRow } from '../toggle-row/SettingsToggleRow';
import { SettingsSelectRow } from '../select-row/SettingsSelectRow';
import {
  chooseTheme,
  loadPreferences,
  preferenceDefaults,
  savePreferences,
  themeChangeEvent,
  themeChoice,
  type ThemeChoice,
} from './utils';

type Preferences = typeof preferenceDefaults;
const themes: ThemeChoice[] = ['light', 'dark', 'system'];

/**
 * Appearance, drawing preferences and diagnostics. These are kept for this
 * account in this browser; each change is saved as soon as it is made.
 */
export function PreferenceSections() {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
  const help = () => settingsHelpCopy[app.lang()];
  const id = untrack(() => app.account()!.id);
  const [prefs, setPrefs] = createSignal<Preferences>(loadPreferences(id));
  const [theme, setTheme] = createSignal(themeChoice(id));
  const follow = () => setTheme(themeChoice(id));
  window.addEventListener(themeChangeEvent, follow);
  onCleanup(() => window.removeEventListener(themeChangeEvent, follow));
  const save = (patch: Partial<Preferences>) => {
    if (app.account()?.id !== id) return;
    const value = { ...loadPreferences(id), ...patch };
    try {
      savePreferences(id, value);
      setPrefs(value);
      app.notify('settingSaved');
    } catch {
      app.notify('settingFailed', true);
    }
  };
  const themeLabel = (value: ThemeChoice) => (value === 'system' ? c().system : c()[value]);
  return (
    <>
      <SettingsSection id="appearance" title={c().appearance} help={app.t('appearanceSectionHelp')}>
        <SettingsItem
          id="theme"
          icon="sun"
          group="appearance"
          title={c().theme}
          help={help().theme}
          value={themeLabel(theme())}
        >
          <Choices
            name="theme"
            label={c().theme}
            options={themes}
            value={theme()}
            text={themeLabel}
            control={(value) => `settings.theme.${value}`}
            pick={(value) => chooseTheme(id, value)}
          />
        </SettingsItem>
        <SettingsSelectRow
          id="language"
          icon="globe"
          title={navigationText(app.lang()).languageMenu}
          help={help().language}
          options={languages}
          value={app.lang()}
          text={(code) => languageNames[code]}
          control="settings.item.language"
          optionControl={(code) => `settings.language.${code}`}
          pick={(code) => app.selectLanguage(code)}
        />
        <SettingsToggleRow
          id="transparency"
          icon="layers"
          title={c().opaque}
          help={help().opaque}
          control="preferences.transparency"
          checked={prefs().opaque}
          onChange={(value) => save({ opaque: value })}
        />
      </SettingsSection>

      <SettingsSection id="drawing-preferences" title={c().drawing} help={help().drawing}>
        <SettingsToggleRow
          id="snap"
          icon="magnet"
          title={c().snap}
          help={help().snap}
          control="preferences.snap"
          checked={prefs().snap}
          onChange={(value) => save({ snap: value })}
        />
      </SettingsSection>
      <SettingsSection
        id="diagnostics"
        title={c().diagnostics}
        help={app.t('diagnosticsSectionHelp')}
      >
        <SettingsToggleRow
          id="crash-reports"
          icon="alert"
          title={c().optIn}
          help={c().diagnosticsHelp}
          control="preferences.diagnostics"
          checked={prefs().diagnostics}
          onChange={(value) => save({ diagnostics: value })}
        />
      </SettingsSection>
    </>
  );
}
