import { browserCopy } from '../browser-copy';
import { ActionButton } from '../browser-toolbar/ActionButton';
import type { BrowserEmptyStateProps } from '../types';
import '../styles.css';

/** A remote failure can sit above local results; it never replaces them automatically. */
export function BrowserEmptyState(props: BrowserEmptyStateProps) {
  const copy = () => browserCopy[props.language];
  const heading = () =>
    props.state === 'empty'
      ? copy().empty[props.level]
      : props.state === 'no-matches'
        ? copy().noMatches
        : copy().remoteUnavailable;
  const help = () =>
    props.state === 'empty'
      ? copy().emptyHelp
      : props.state === 'no-matches'
        ? copy().noMatchesHelp
        : copy().remoteHelp;
  return (
    <section class="browser-empty" aria-label={heading()}>
      <h2>{heading()}</h2>
      <p>{help()}</p>
      <ActionButton
        label={
          props.state === 'empty'
            ? copy().newItem[props.level]
            : props.state === 'no-matches'
              ? copy().clear
              : copy().retry
        }
        icon={props.state === 'empty' ? 'plus' : props.state === 'no-matches' ? 'close' : 'sync'}
        controlId={
          props.state === 'empty'
            ? 'browser.empty.new'
            : props.state === 'no-matches'
              ? 'browser.empty.clear'
              : 'browser.empty.retry'
        }
        reason={props.disabledReason}
        onClick={() => {
          if (props.state === 'empty') props.onNew();
          else if (props.state === 'no-matches') props.onClear();
          else props.onRetry();
        }}
      />
    </section>
  );
}
