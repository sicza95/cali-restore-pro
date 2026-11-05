/* eslint-disable solid/reactivity -- Form submissions read the current props. */
import { createSignal, Show } from 'solid-js';
import type { revisionKeyTransfer } from '../../../platform/projects/revision-key-transfer';
import type { Language } from '../types';

type Model = ReturnType<typeof revisionKeyTransfer>;
type Form = {
  language: Language;
  busy: boolean;
  model: Model;
  run: (task: () => Promise<void>) => Promise<boolean>;
};

const copy = {
  en: {
    send: 'Share sync access with a device',
    recipient: 'Recipient owner account ID',
    create: 'Create transfer code',
    secret: 'Transfer code',
    private: 'Share this code privately with the receiving device. It expires after 15 minutes.',
    receive: 'Open a synced project on this device',
    account: 'Your owner account ID',
    open: 'Open synced project',
  },
  hu: {
    send: 'Szinkronizálási hozzáférés megosztása egy eszközzel',
    recipient: 'A fogadó tulajdonos fiókazonosítója',
    create: 'Átviteli kód létrehozása',
    secret: 'Átviteli kód',
    private: 'A kódot bizalmasan adja át a fogadó eszköznek. A kód 15 perc után lejár.',
    receive: 'Szinkronizált projekt megnyitása ezen az eszközön',
    account: 'Saját tulajdonosi fiókazonosító',
    open: 'Szinkronizált projekt megnyitása',
  },
};

export function SendProjectKey(props: Form & { project: string }) {
  const c = () => copy[props.language];
  const [recipient, setRecipient] = createSignal(props.model.account);
  const [secret, setSecret] = createSignal('');
  return (
    <details
      onToggle={(event) => {
        if (!event.currentTarget.open) setSecret('');
      }}
    >
      <summary>{c().send}</summary>
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
        <button class="secondary" disabled={props.busy}>
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
      <summary>{c().receive}</summary>
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
        <button class="secondary" disabled={props.busy}>
          {c().open}
        </button>
      </form>
    </details>
  );
}
