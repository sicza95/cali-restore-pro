import { createSignal } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { settingsCopy } from '../settings-copy';

/** Keep the complete support reference available without filling the row with UUIDs. */
export function AdminReference(props: { id: string; label: string }) {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
  const [result, setResult] = createSignal<'copied' | 'failed'>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.id);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  };
  return (
    <div class="admin-reference">
      <span>{props.label}</span>{' '}
      <button
        type="button"
        data-control-id="admin.reference.copy"
        title={props.id}
        aria-label={`${c().copyReference}: ${props.label} · ${props.id.slice(0, 8)}`}
        onClick={() => void copy()}
      >
        {props.id.slice(0, 8)}
      </button>
      <span role="status">
        {result() === 'copied'
          ? c().referenceCopied
          : result() === 'failed'
            ? c().referenceCopyFailed
            : ''}
      </span>
    </div>
  );
}
