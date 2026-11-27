import { Show, createSignal } from 'solid-js';
import type {
  OrganisationDetail,
  OrganisationDefaultsPatch,
  OrganisationDefaults as Defaults,
} from '../../../platform/api';
import { useApp } from '../../app-context/AppContext';
import { settingsCopy } from '../../settings/settings-copy';
import { settingsHelpCopy } from '../../settings/settings-help-copy';
import { SettingsItem, SettingsSection } from '../../settings/SettingsItem';
import { MeasurementSetting } from '../../settings/preferences/measurement-setting/MeasurementSetting';
import { SettingsSelectRow } from '../../settings/select-row/SettingsSelectRow';
import type { IconName } from '../../icon/types';
import { languages } from '../../../platform/i18n/language';
import { useDefaultsEditor } from './useDefaultsEditor';
import { organisationDefaultsCopy } from './copy';
import './styles.css';

const currencies = ['HUF', 'EUR', 'GBP', 'USD', 'CHF'];
const reportLanguages = { en: 'English', hu: 'Magyar' } as const;

export function OrganisationDefaults(props: {
  detail: OrganisationDetail;
  changed: () => Promise<unknown>;
}) {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
  const help = () => settingsHelpCopy[app.lang()];
  const orgCopy = () => organisationDefaultsCopy[app.lang()];
  const editor = useDefaultsEditor(props);
  const prefs = () => ({
    measurementUnits: editor.current().restoration.units,
    areaUnit: editor.current().restoration.areaUnit ?? '',
    currency: editor.current().restoration.currency,
    reportLanguage: editor.current().restoration.reportLanguage,
    ...editor.current().branding,
  });
  const save = (
    patch: Partial<
      Defaults['branding'] & {
        measurementUnits: string;
        areaUnit: string;
        currency: string;
        reportLanguage: 'en' | 'hu';
      }
    >,
  ) => {
    const next: OrganisationDefaultsPatch = {};
    if (patch.measurementUnits !== undefined)
      next.restoration = { units: patch.measurementUnits as 'metric' | 'imperial' };
    if (patch.areaUnit !== undefined)
      next.restoration = {
        ...next.restoration,
        areaUnit: (patch.areaUnit || null) as 'cm²' | 'm²' | 'in²' | 'ft²' | null,
      };
    if (patch.currency !== undefined)
      next.restoration = { ...next.restoration, currency: patch.currency };
    if (patch.reportLanguage !== undefined)
      next.restoration = { ...next.restoration, reportLanguage: patch.reportLanguage };
    for (const key of ['studio', 'contact', 'footer', 'accent', 'logo'] as const) {
      if (patch[key] !== undefined) next.branding = { ...next.branding, [key]: patch[key] };
    }
    editor.save(next);
  };
  const shown = (value: string) => value || app.t('notSet');
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
  const text = (key: 'studio' | 'contact' | 'footer', max: number, icon: IconName) => (
    <SettingsItem
      id={key}
      icon={icon}
      group="branding"
      title={c()[key]}
      help={help()[key]}
      value={shown(prefs()[key])}
    >
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

  return (
    <fieldset
      class="org-defaults"
      aria-busy={editor.busy()}
      disabled={props.detail.role !== 'admin'}
    >
      <legend class="account-visually-hidden">{orgCopy().title}</legend>
      <Show when={props.detail.role !== 'admin'}>
        <p>{orgCopy().readOnly}</p>
      </Show>
      <SettingsSection id="defaults" title={c().defaults} help={orgCopy().restoration}>
        <MeasurementSetting
          system={prefs().measurementUnits}
          areaUnit={prefs().areaUnit}
          onSystem={(measurementUnits) => save({ measurementUnits })}
          onAreaUnit={(areaUnit) => save({ areaUnit })}
        />
        <SettingsSelectRow
          id="currency"
          icon="currency"
          title={c().currency}
          help={help().currency}
          value={prefs().currency}
          options={currencies}
          text={(value) => value}
          control="preferences.currency"
          optionControl={(value) => `preferences.currency.${value}`}
          pick={(currency) => save({ currency })}
        />
        <SettingsSelectRow
          id="report-language"
          icon="globe"
          title={c().reportLanguage}
          help={help().reportLanguage}
          value={prefs().reportLanguage as keyof typeof reportLanguages}
          options={languages}
          text={(value) => reportLanguages[value]}
          control="preferences.report-language"
          optionControl={(value) => `preferences.report-language.${value}`}
          pick={(reportLanguage) => save({ reportLanguage })}
        />
      </SettingsSection>

      <SettingsSection id="report-branding" title={c().branding} help={orgCopy().branding}>
        {text('studio', 120, 'organisation')}
        {text('contact', 254, 'envelope')}
        {text('footer', 240, 'report')}
        <SettingsItem
          id="accent"
          icon="palette"
          group="branding"
          title={c().accent}
          help={help().accent}
          value={prefs().accent}
        >
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
          icon="photo"
          group="branding"
          title={c().logo}
          help={help().logo}
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
            <p role="alert">{orgCopy().saveFailed}</p>
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
    </fieldset>
  );
}
