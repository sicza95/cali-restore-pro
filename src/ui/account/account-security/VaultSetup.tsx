import { Show } from 'solid-js';
import type { VaultCopy } from './vault-copy';
import { VaultFileField, VaultKeyField } from './VaultFields';

/**
 * The controls shown while this browser has no vault: set up a new one with a recovery key,
 * restore from a recovery file, or request approval from an unlocked device.
 */
export function VaultSetup(props: {
  copy: VaultCopy;
  busy: boolean;
  remember: boolean;
  recovery: string;
  ack: boolean;
  pairing: string;
  onRemember: (value: boolean) => void;
  onAck: (value: boolean) => void;
  onGenerate: () => void;
  onCreate: () => void;
  onRestore: (event: SubmitEvent) => void;
  onRequest: () => void;
  onAccept: (event: SubmitEvent) => void;
}) {
  return (
    <>
      <label class="confirmation">
        <input
          type="checkbox"
          checked={props.remember}
          disabled={props.busy}
          onChange={(e) => props.onRemember(e.currentTarget.checked)}
        />
        {props.copy.remember}
      </label>
      <Show
        when={props.recovery}
        fallback={
          <button
            class="primary"
            data-control-id="vault.setup.generate"
            disabled={props.busy}
            onClick={() => props.onGenerate()}
          >
            {props.copy.create}
          </button>
        }
      >
        <label>
          {props.copy.key}
          <input readOnly value={props.recovery} aria-describedby="vault-key-help" />
        </label>
        <p id="vault-key-help">{props.copy.keyHelp}</p>
        <label class="confirmation">
          <input
            type="checkbox"
            checked={props.ack}
            disabled={props.busy}
            onChange={(e) => props.onAck(e.currentTarget.checked)}
          />
          {props.copy.savedKey}
        </label>
        <Show when={!props.pairing}>
          <button
            class="primary"
            data-control-id="vault.setup.confirm"
            disabled={!props.ack || props.busy}
            onClick={() => props.onCreate()}
          >
            {props.copy.create}
          </button>
        </Show>
      </Show>
      <details>
        <summary data-control-id="vault.restore.open">{props.copy.restore}</summary>
        <form onSubmit={(e) => props.onRestore(e)}>
          <VaultKeyField label={props.copy.key} />
          <VaultFileField label={props.copy.file} />
          <button data-control-id="vault.restore.submit" disabled={props.busy}>
            {props.copy.restore}
          </button>
        </form>
      </details>
      <details>
        <summary data-control-id="vault.request.open">{props.copy.request}</summary>
        <Show
          when={props.pairing}
          fallback={
            <button
              data-control-id="vault.request.pair"
              disabled={props.busy}
              onClick={() => props.onRequest()}
            >
              {props.copy.request}
            </button>
          }
        >
          <label>
            {props.copy.pairing}
            <input readOnly value={props.pairing} aria-describedby="vault-pairing-help" />
          </label>
          <p id="vault-pairing-help">{props.copy.pairingHelp}</p>
          <form onSubmit={(e) => props.onAccept(e)}>
            <VaultFileField label={props.copy.file} />
            <button data-control-id="vault.request.accept" disabled={props.busy || !props.ack}>
              {props.copy.accept}
            </button>
          </form>
        </Show>
      </details>
    </>
  );
}
