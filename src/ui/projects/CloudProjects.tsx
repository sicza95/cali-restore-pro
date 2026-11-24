import { createSignal, For, Show } from 'solid-js';
import type { cloudProjects } from '../../platform/projects/cloud-projects';
import type { Language } from '../account-access/types';
import { cloudProjectsCopy as copy } from './cloud-projects-copy';

type Model = ReturnType<typeof cloudProjects>;

/** Synced projects this account has elsewhere, opened here with one tap and no transfer code. */
export function CloudProjects(props: {
  language: Language;
  busy: boolean;
  model: Model;
  local: () => ReadonlySet<string>;
  inOrganisation: (organisation: string) => boolean;
  run: (task: () => Promise<void>) => Promise<boolean>;
  onOpened: (result: Awaited<ReturnType<Model['open']>>) => void;
}) {
  const c = () => copy[props.language];
  const [all, setRows] = createSignal<{ id: string; name: string; organisation: string }[]>();
  const rows = () => all()?.filter((row) => props.inOrganisation(row.organisation));
  const [failed, setFailed] = createSignal(false);
  const load = async () => {
    setRows(undefined);
    setFailed(false);
    try {
      setRows(await props.model.list(props.local()));
    } catch {
      setFailed(true);
    }
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary data-control-id="project.cloud.open">{c().receive}</summary>
      <p>{c().help}</p>
      <Show when={failed()}>
        <p role="alert">{c().failed}</p>
      </Show>
      <Show when={!failed()}>
        <Show when={rows()} fallback={<p role="status">{c().loading}</p>}>
          {(found) => (
            <Show when={found().length} fallback={<p role="status">{c().none}</p>}>
              <ul class="project-cloud-list">
                <For each={found()}>
                  {(row) => (
                    <li>
                      <span>{row.name}</span>
                      <button
                        data-control-id="project.cloud.add"
                        disabled={props.busy}
                        aria-label={`${c().open}: ${row.name}`}
                        onClick={() =>
                          void props.run(async () => props.onOpened(await props.model.open(row.id)))
                        }
                      >
                        {c().open}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </Show>
      </Show>
    </details>
  );
}
