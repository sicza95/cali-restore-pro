import { createSignal, For, Show, untrack } from 'solid-js';
import { checkpointCopy } from '../../../editor/checkpoint-review/copy';
import { accountDestinations } from '../../routes';
import { settingsCopy } from '../constants';
import type { SettingsProps } from '../types';
import { loadPreferences, savePreferences } from './utils';

export function Preferences(props: SettingsProps) {
  const c = () => settingsCopy[props.model.lang()];
  const id = untrack(() => props.model.account()!.id);
  const p = loadPreferences(id);
  const [result, setResult] = createSignal<'saved' | 'storageFailed'>();
  const [logo, setLogo] = createSignal(p.logo);
  return (
    <>
      <a
        class="project-back"
        href={accountDestinations.libraries}
        data-control-id="settings.libraries"
      >
        {checkpointCopy[props.model.lang()].openLibrary}
      </a>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          const get = (name: string) => String(fields.get(name) ?? '');
          try {
            const file = fields.get('logo');
            let image = logo();
            if (file instanceof File && file.size) {
              if (file.size > 262144 || file.type !== 'image/png') throw new Error();
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte))
                throw new Error();
              image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
              });
            }
            if (props.model.account()?.id !== id) return;
            savePreferences(id, {
              theme: get('theme'),
              opaque: fields.has('opaque'),
              units: get('units'),
              currency: get('currency'),
              reportLanguage: get('reportLanguage'),
              snap: fields.has('snap'),
              studio: get('studio'),
              contact: get('contact'),
              footer: get('footer'),
              accent: get('accent'),
              logo: image,
              diagnostics: fields.has('diagnostics'),
            });
            setLogo(image);
            (e.target as HTMLFormElement).querySelector<HTMLInputElement>(
              'input[name=logo]',
            )!.value = '';
            setResult('saved');
          } catch {
            setResult('storageFailed');
          }
        }}
      >
        <div class="preferences-actions">
          <p>{c().localHelp}</p>
          <button>{c().save}</button>
        </div>
        <Show when={result()}>
          {(status) => <p role={status() === 'saved' ? 'status' : 'alert'}>{c()[status()]}</p>}
        </Show>
        <section class="account-section">
          <div>
            <h2>{c().appearance}</h2>
          </div>
          <div class="account-panel">
            <label>
              {c().theme}
              <select name="theme" value={p.theme}>
                <option value="system">{c().system}</option>
                <option value="light">{c().light}</option>
                <option value="dark">{c().dark}</option>
              </select>
            </label>
            <label class="confirmation">
              <input name="opaque" type="checkbox" checked={p.opaque} />
              {c().opaque}
            </label>
          </div>
        </section>
        <section class="account-section">
          <div>
            <h2>{c().defaults}</h2>
          </div>
          <div class="account-panel">
            <label>
              {c().units}
              <select name="units" value={p.units}>
                <option>cm²</option>
                <option>m²</option>
              </select>
            </label>
            <label>
              {c().currency}
              <select name="currency" value={p.currency}>
                <For each={['HUF', 'EUR', 'GBP', 'USD', 'CHF']}>
                  {(currency) => <option>{currency}</option>}
                </For>
              </select>
            </label>
            <label>
              {c().reportLanguage}
              <select name="reportLanguage" value={p.reportLanguage}>
                <option value="en">English</option>
                <option value="hu">Magyar</option>
              </select>
            </label>
            <label class="confirmation">
              <input name="snap" type="checkbox" checked={p.snap} />
              {c().snap}
            </label>
          </div>
        </section>
        <section class="account-section">
          <div>
            <h2>{c().branding}</h2>
          </div>
          <div class="account-panel">
            <label>
              {c().studio}
              <input name="studio" maxlength={120} value={p.studio} />
            </label>
            <label>
              {c().contact}
              <input name="contact" maxlength={254} value={p.contact} />
            </label>
            <label>
              {c().footer}
              <input name="footer" maxlength={240} value={p.footer} />
            </label>
            <label>
              {c().accent}
              <input name="accent" type="color" value={p.accent} />
            </label>
            <label>
              {c().logo}
              <input name="logo" type="file" accept="image/png" />
            </label>
            <Show when={logo()}>
              <img src={logo()} class="report-logo" alt={c().branding} />
              <button type="button" class="secondary" onClick={() => setLogo('')}>
                {c().removeLogo}
              </button>
            </Show>
          </div>
        </section>
        <section class="account-section">
          <div>
            <h2>{c().diagnostics}</h2>
            <p>{c().diagnosticsHelp}</p>
          </div>
          <div class="account-panel">
            <label class="confirmation">
              <input name="diagnostics" type="checkbox" checked={p.diagnostics} />
              {c().optIn}
            </label>
          </div>
        </section>
      </form>
    </>
  );
}
