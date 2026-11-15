import { createSignal, Show, untrack } from 'solid-js';
import type { revisionKeyTransfer } from '../../platform/projects/revision-key-transfer';
import type { Language } from '../account-access/types';
import { keyTransferCopy as copy } from './key-transfer-copy';

type Model = ReturnType<typeof revisionKeyTransfer>;
type Form = {
  language: Language;
  busy: boolean;
  model: Model;
  run: (task: () => Promise<void>) => Promise<boolean>;
};

export function SendProjectKey(props: Form & { project: string }) {
  const c = () => copy[props.language];
  // Starts as this account (sending to your own device); the user edits it from there.
  const [recipient, setRecipient] = createSignal(untrack(() => props.model.account));
  const [secret, setSecret] = createSignal('');
  return (
    <details
      onToggle={(event) => {
        if (!event.currentTarget.open) setSecret('');
      }}
    >
      <summary data-control-id="project.key.send.open">{c().send}</summary>
      <form
        class="project-fields"
        onSubmit={(event) => {
          event.preventDefault();
          setSecret('');
          void props.run(async () => {
            setSecret(await props.model.create(props.project, recipient().trim()));
          });
        }}
      >
        <label>
          {c().recipient}
          <input
            required
            value={recipient()}
            maxLength={36}
            onInput={(e) => {
              setSecret('');
              setRecipient(e.currentTarget.value);
            }}
          />
        </label>
        <button data-control-id="project.key.send" class="secondary" disabled={props.busy}>
          {c().create}
        </button>
      </form>
      <Show when={secret()}>
        <p aria-live="polite">{c().private}</p>
        <label>
          {c().secret}
          <textarea
            class="project-key-code"
            readOnly
            rows={3}
            value={secret()}
            spellcheck={false}
          />
        </label>
      </Show>
    </details>
  );
}

export function ReceiveProjectKey(
  props: Form & {
    onReceived: (result: Awaited<ReturnType<Model['accept']>>) => void;
  },
) {
  const c = () => copy[props.language];
  const [secret, setSecret] = createSignal('');
  return (
    <details>
      <summary data-control-id="project.key.receive.open">{c().receive}</summary>
      <form
        class="project-fields"
        onSubmit={(event) => {
          event.preventDefault();
          void props.run(async () => {
            const result = await props.model.accept(secret());
            setSecret('');
            props.onReceived(result);
          });
        }}
      >
        <label>
          {c().account}
          <input readOnly value={props.model.account} />
        </label>
        <label>
          {c().secret}
          <input
            required
            type="password"
            autocomplete="off"
            maxLength={160}
            value={secret()}
            onInput={(e) => setSecret(e.currentTarget.value)}
          />
        </label>
        <button data-control-id="project.key.receive" class="secondary" disabled={props.busy}>
          {c().open}
        </button>
      </form>
    </details>
  );
}
