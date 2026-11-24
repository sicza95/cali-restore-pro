import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { organisationCopy } from './organisation-copy';
import { useOrganisations } from './organisation-state';

type Notice = { kind: string; organisation: string; name: string; who: string };

/** Bumped by every notice, so an open organisation page reads itself again. */
const [version, setVersion] = createSignal(0);
export const liveVersion = version;

/**
 * Listens to the server's notices while signed in (`GET /api/v1/events`, Server-Sent Events):
 * an invitation, an answer to one, a removal. Each notice re-reads the organisations and, when it
 * is about someone else's action, says what happened in a toast. The browser reconnects a dropped
 * stream by itself; whatever was missed meanwhile is read again when it comes back.
 */
export function useLiveUpdates() {
  const app = useApp();
  const orgs = useOrganisations();
  const c = () => organisationCopy[app.lang()];
  const refresh = () => {
    void orgs.refresh();
    setVersion((n) => n + 1);
  };
  createEffect(
    on(
      () => app.account()?.id,
      (account) => {
        if (!account || typeof EventSource === 'undefined') return;
        const source = new EventSource('/api/v1/events');
        let opened = false;
        source.addEventListener('open', () => {
          if (opened) refresh();
          opened = true;
        });
        source.addEventListener('organisations', (event) => {
          refresh();
          let notice: Notice;
          try {
            notice = JSON.parse((event as MessageEvent<string>).data) as Notice;
          } catch {
            return;
          }
          const say = c().live[notice.kind as keyof ReturnType<typeof c>['live']];
          if (say) app.notify({ text: say(notice.who, notice.name) });
        });
        onCleanup(() => source.close());
      },
    ),
  );
}
