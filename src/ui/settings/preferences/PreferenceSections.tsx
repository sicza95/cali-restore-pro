import { createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { languageNames, languages } from '../../../platform/i18n/language';
import { settingsCopy } from '../settings-copy';
import { navigationText } from '../../account-access/navigation-copy';
import { SettingsItem, SettingsSection } from '../SettingsItem';
import { restorationPreferenceCopy } from './copy';
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
const currencies = ['HUF', 'EUR', 'GBP', 'USD', 'CHF'];
const reportLanguages = { en: 'English', hu: 'Magyar' } as const;

/** A row of choices, one of which is selected. */
function Choices<T extends string>(props: {
  name: string;
  label: string;
  options: readonly T[];
  value: T;
  text: (value: T) => string;
  control: (value: T) => string;
  pick: (value: T) => void;
}) {
  return (
    <div class="settings-choices" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <label>
            <input
              type="radio"
              name={props.name}
              checked={props.value === option}
              data-control-id={props.control(option)}
              onChange={() => props.pick(option)}
            />
            <span>{props.text(option)}</span>
          </label>
        )}
      </For>
    </div>
  );
}

/**
 * Appearance, restoration defaults, report branding and diagnostics. These are kept for this
 * account in this browser; each change is saved as soon as it is made.
 */
export function PreferenceSections() {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
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
  const onOff = (value: boolean) => app.t(value ? 'on' : 'off');
  const shown = (value: string) => value || app.t('notSet');
  const themeLabel = (value: ThemeChoice) => (value === 'system' ? c().system : c()[value]);
  const [logoProblem, setLogoProblem] = createSignal(false);
  const chooseLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setLogoProblem(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
      if (file.size > 262144 || file.type !== 'image/png' || !png) throw new Error('not a logo');
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      save({ logo });
    } catch {
      setLogoProblem(true);
    }
  };
  const text = (key: 'studio' | 'contact' | 'footer', max: number) => (
    <SettingsItem id={key} group="branding" title={c()[key]} value={shown(prefs()[key])}>
      <label>
        <span class="account-visually-hidden">{c()[key]}</span>
        <input
          data-control-id={`preferences.branding.${key}`}
          name={key}
          maxlength={max}
          value={prefs()[key]}
          onChange={(event) => save({ [key]: event.currentTarget.value.trim() })}
        />
      </label>
    </SettingsItem>
  );
  const toggle = (key: 'opaque' | 'snap' | 'diagnostics', control: string, label: string) => (
    <label class="confirmation">
      <input
        data-control-id={control}
        name={key}
        type="checkbox"
        checked={prefs()[key]}
        onChange={(event) => save({ [key]: event.currentTarget.checked })}
      />
      {label}
    </label>
  );
  return (
    <>
      <SettingsSection id="appearance" title={c().appearance} help={app.t('appearanceSectionHelp')}>
        <SettingsItem id="theme" group="appearance" title={c().theme} value={themeLabel(theme())}>
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
        <SettingsItem
          id="language"
          group="appearance"
          title={navigationText(app.lang()).languageMenu}
          value={languageNames[app.lang()]}
        >
          <Choices
            name="language"
            label={navigationText(app.lang()).languageMenu}
            options={languages}
            value={app.lang()}
            text={(code) => languageNames[code]}
            control={(code) => `settings.language.${code}`}
            pick={(code) => app.selectLanguage(code)}
          />
        </SettingsItem>
        <SettingsItem
          id="transparency"
          group="appearance"
          title={c().opaque}
          value={onOff(prefs().opaque)}
        >
          {toggle('opaque', 'preferences.transparency', c().opaque)}
        </SettingsItem>
      </SettingsSection>

      <SettingsSection id="defaults" title={c().defaults} help={app.t('defaultsSectionHelp')}>
        <SettingsItem
          id="measurement-units"
          group="defaults"
          title={restorationPreferenceCopy[app.lang()].measurementUnits}
          value={
            restorationPreferenceCopy[app.lang()][
              prefs().measurementUnits === 'imperial' ? 'imperial' : 'metric'
            ]
          }
        >
          <label>
            <span class="account-visually-hidden">
              {restorationPreferenceCopy[app.lang()].measurementUnits}
            </span>
            <select
              data-control-id="preferences.measurement-units"
              value={prefs().measurementUnits}
              onChange={(event) => save({ measurementUnits: event.currentTarget.value })}
            >
              <option value="metric">{restorationPreferenceCopy[app.lang()].metric}</option>
              <option value="imperial">{restorationPreferenceCopy[app.lang()].imperial}</option>
            </select>
          </label>
        </SettingsItem>
        <SettingsItem
          id="units"
          group="defaults"
          title={c().units}
          value={prefs().areaUnit || restorationPreferenceCopy[app.lang()].followSystem}
        >
          <label>
            <span class="account-visually-hidden">{c().units}</span>
            <select
              data-control-id="preferences.units"
              name="units"
              value={prefs().areaUnit}
              onChange={(event) => save({ areaUnit: event.currentTarget.value })}
            >
              <option value="">{restorationPreferenceCopy[app.lang()].followSystem}</option>
              <option>cm²</option>
              <option>m²</option>
              <option>in²</option>
              <option>ft²</option>
            </select>
          </label>
        </SettingsItem>
        <SettingsItem id="currency" group="defaults" title={c().currency} value={prefs().currency}>
          <label>
            <span class="account-visually-hidden">{c().currency}</span>
            <select
              data-control-id="preferences.currency"
              name="currency"
              value={prefs().currency}
              onChange={(event) => save({ currency: event.currentTarget.value })}
            >
              <For each={currencies}>{(currency) => <option>{currency}</option>}</For>
            </select>
          </label>
        </SettingsItem>
        <SettingsItem
          id="report-language"
          group="defaults"
          title={c().reportLanguage}
          value={reportLanguages[prefs().reportLanguage as keyof typeof reportLanguages]}
        >
          <label>
            <span class="account-visually-hidden">{c().reportLanguage}</span>
            <select
              data-control-id="preferences.report-language"
              name="reportLanguage"
              value={prefs().reportLanguage}
              onChange={(event) => save({ reportLanguage: event.currentTarget.value })}
            >
              <option value="en">English</option>
              <option value="hu">Magyar</option>
            </select>
          </label>
        </SettingsItem>
        <SettingsItem id="snap" group="defaults" title={c().snap} value={onOff(prefs().snap)}>
          {toggle('snap', 'preferences.snap', c().snap)}
        </SettingsItem>
      </SettingsSection>

      <SettingsSection
        id="report-branding"
        title={c().branding}
        help={app.t('brandingSectionHelp')}
      >
        {text('studio', 120)}
        {text('contact', 254)}
        {text('footer', 240)}
        <SettingsItem id="accent" group="branding" title={c().accent} value={prefs().accent}>
          <label>
            <span class="account-visually-hidden">{c().accent}</span>
            <input
              data-control-id="preferences.branding.accent"
              name="accent"
              type="color"
              value={prefs().accent}
              onChange={(event) => save({ accent: event.currentTarget.value })}
            />
          </label>
        </SettingsItem>
        <SettingsItem
          id="logo"
          group="branding"
          title={c().logo}
          value={prefs().logo ? '' : app.t('notSet')}
        >
          <Show when={prefs().logo}>
            <img src={prefs().logo} class="report-logo" alt={c().branding} />
          </Show>
          <label>
            <span class="account-visually-hidden">{c().logo}</span>
            <input
              data-control-id="preferences.branding.logo"
              name="logo"
              type="file"
              accept="image/png"
              onChange={(event) => void chooseLogo(event.currentTarget)}
            />
          </label>
          <Show when={logoProblem()}>
            <p role="alert">{app.t('settingFailed')}</p>
          </Show>
          <Show when={prefs().logo}>
            <div class="settings-actions">
              <button
                data-control-id="preferences.branding.clear-logo"
                type="button"
                onClick={() => save({ logo: '' })}
              >
                {c().removeLogo}
              </button>
            </div>
          </Show>
        </SettingsItem>
      </SettingsSection>

      <SettingsSection
        id="diagnostics"
        title={c().diagnostics}
        help={app.t('diagnosticsSectionHelp')}
      >
        <SettingsItem
          id="crash-reports"
          group="diagnostics"
          title={c().optIn}
          help={c().diagnosticsHelp}
          value={onOff(prefs().diagnostics)}
        >
          {toggle('diagnostics', 'preferences.diagnostics', c().optIn)}
        </SettingsItem>
      </SettingsSection>
    </>
  );
}
