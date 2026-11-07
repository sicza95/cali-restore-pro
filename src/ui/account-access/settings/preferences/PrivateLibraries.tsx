import { For } from 'solid-js';
import { PatternReview } from '../../../editor/checkpoint-review/PatternReview';
import { accountDestinations } from '../../routes';
import type { Language } from '../../types';
import './libraries.css';

export const libraryCopy = {
  en: {
    title: 'Estimate libraries',
    rates: 'Rate presets',
    productivity: 'Productivity presets',
    help: 'Private, versioned rate and productivity presets become available with M-09.',
    branding: 'Report branding preferences',
  },
  hu: {
    title: 'Becslési könyvtárak',
    rates: 'Díjsablonok',
    productivity: 'Termelékenységi sablonok',
    help: 'A privát, verziózott díj- és termelékenységi sablonok az M-09-ben válnak elérhetővé.',
    branding: 'Jelentésarculat beállításai',
  },
};

export function PrivateLibraries(props: { language: Language }) {
  const c = () => libraryCopy[props.language];
  return (
    <>
      <section class="account-section">
        <div>
          <h2>{c().title}</h2>
          <p id="estimate-library-help">{c().help}</p>
        </div>
        <div class="account-panel private-library-actions">
          <For each={['rates', 'productivity'] as const}>
            {(key) => (
              <button
                type="button"
                class="secondary"
                data-control-id={`libraries.${key}`}
                aria-describedby="estimate-library-help"
                disabled
              >
                {c()[key]}
              </button>
            )}
          </For>
          <a
            href={accountDestinations.preferences + '#report-branding'}
            data-control-id="libraries.branding"
          >
            {c().branding}
          </a>
        </div>
      </section>
      <PatternReview language={props.language} library />
    </>
  );
}
