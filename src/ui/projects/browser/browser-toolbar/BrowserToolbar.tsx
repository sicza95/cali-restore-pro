import { createEffect, createUniqueId, For, onMount, Show } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import { browserCopy } from '../browser-copy';
import type { BrowserToolbarProps } from '../types';
import { ActionButton } from './ActionButton';
import { Popup } from './Popup';
import '../styles.css';

export function BrowserToolbar(props: BrowserToolbarProps) {
  const copy = () => browserCopy[props.language];
  const id = createUniqueId();
  let input: HTMLInputElement | undefined;
  let findButton: HTMLButtonElement | undefined;
  const focusFind = () => {
    props.onFindOpenChange(true);
    queueMicrotask(() => input?.focus());
  };
  onMount(() => props.ref?.({ focusFind }));
  createEffect(() => {
    if (props.findOpen) queueMicrotask(() => input?.focus());
  });
  return (
    <div class="browser-toolbar-wrap">
      <div class="browser-toolbar" role="group" aria-label={copy().toolbar}>
        <ActionButton
          label={copy().newItem[props.level]}
          icon="plus"
          controlId="browser.new"
          reason={props.newDisabledReason}
          primary
          onClick={props.onNew}
        />
        <Show when={props.level === 'project' && props.onImport}>
          <ActionButton
            label={copy().importBackup}
            icon="cloud-upload"
            controlId="browser.import"
            onClick={() => props.onImport?.()}
          />
        </Show>
        <span class="browser-toolbar-spacer" />
        <ActionButton
          label={copy().rename}
          icon="pen"
          controlId="browser.rename"
          reason={props.renameDisabledReason}
          onClick={props.onRename}
        />
        <ActionButton
          label={copy().delete}
          icon="trash"
          controlId="browser.delete"
          reason={props.deleteDisabledReason}
          onClick={props.onDelete}
        />
        <div class="browser-view-toggle" role="group" aria-label={copy().view}>
          <ActionButton
            label={copy().grid}
            icon="grid"
            controlId="browser.view.grid"
            pressed={props.view === 'grid'}
            onClick={() => props.onViewChange('grid')}
          />
          <ActionButton
            label={copy().list}
            icon="list"
            controlId="browser.view.list"
            pressed={props.view === 'list'}
            onClick={() => props.onViewChange('list')}
          />
        </div>
        <Popup label={copy().sort} icon="sort" controlId="browser.sort" menu>
          <div role="group" aria-label={copy().sort}>
            <For each={['name', 'created', 'modified'] as const}>
              {(field) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.sort.field === field}
                  data-control-id={`browser.sort.${field}`}
                  onClick={() => props.onSortChange({ ...props.sort, field })}
                >
                  <span>{copy()[field]}</span>
                  <Show when={props.sort.field === field}>
                    <Icon name="check" size={16} />
                  </Show>
                </button>
              )}
            </For>
          </div>
          <hr />
          <div role="group" aria-label={copy().direction}>
            <For each={['asc', 'desc'] as const}>
              {(direction) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.sort.direction === direction}
                  data-control-id={`browser.sort.${direction}`}
                  onClick={() => props.onSortChange({ ...props.sort, direction })}
                >
                  <span>{copy()[direction]}</span>
                  <Show when={props.sort.direction === direction}>
                    <Icon name="check" size={16} />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Popup>
        <button
          type="button"
          class="browser-action"
          ref={(element) => (findButton = element)}
          aria-label={copy().find}
          title={copy().find}
          aria-expanded={props.findOpen}
          aria-controls={`${id}-find`}
          data-control-id="browser.find"
          onClick={() => props.onFindOpenChange(!props.findOpen)}
        >
          <Icon name="search" size={18} />
          <span class="browser-action-label">{copy().find}</span>
        </button>
        <ActionButton
          label={props.level === 'project' ? copy().accountSettings : copy().projectSettings}
          icon="gear"
          controlId="browser.settings"
          reason={props.settingsDisabledReason}
          onClick={props.onSettings}
        />
        <ActionButton
          label={copy().inspector}
          icon="sidebar-right"
          controlId="browser.inspector"
          pressed={props.inspectorOpen}
          onClick={props.onInspectorToggle}
        />
      </div>
      <Show when={props.findOpen}>
        <div class="browser-find" id={`${id}-find`}>
          <label class="browser-sr-only" for={`${id}-query`}>
            {copy().queryLabel}
          </label>
          <input
            ref={(element) => (input = element)}
            id={`${id}-query`}
            type="search"
            value={props.query}
            maxlength={1024}
            placeholder={copy().queryLabel}
            data-control-id="browser.query"
            aria-invalid={!!props.diagnostics?.length}
            aria-describedby={props.diagnostics?.length ? `${id}-diagnostics` : undefined}
            onInput={(event) => props.onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                props.onFindOpenChange(false);
                findButton?.focus();
              }
            }}
          />
          <ActionButton
            label={copy().clear}
            icon="close"
            controlId="browser.query.clear"
            onClick={() => {
              props.onQueryChange('');
              input?.focus();
            }}
          />
          <Popup label={copy().help} icon="help" controlId="browser.query.help">
            <p>{copy().queryHelp}</p>
            <p>{copy().queryFields}</p>
            <p>{copy().queryValues}</p>
            <p>{copy().queryDates}</p>
            <p class="browser-query-examples">{copy().queryExamples}</p>
          </Popup>
          <Show when={props.diagnostics?.length}>
            <div id={`${id}-diagnostics`} class="browser-diagnostics" aria-live="polite">
              <For each={props.diagnostics}>
                {(diagnostic) => (
                  <p>
                    {diagnostic.position === undefined
                      ? diagnostic.message
                      : copy().diagnosticAt(diagnostic.message, diagnostic.position)}
                  </p>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
