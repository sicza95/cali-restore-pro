# Browser support in CI

Chromium is the blocking engine: every CI job that runs a browser uses it. Firefox and WebKit run
`npm run test:files` in an informational job (`Files suite (<engine>, informational)` in
`.github/workflows/ci.yml`, #51). It runs on Linux, because Playwright's Windows WebKit lacks
`OffscreenCanvas`. The job has `continue-on-error`, so a red result there never blocks a merge; it
can become required once the gaps below are closed.

Run it locally with `FILES_BROWSERS=firefox npm run test:files` (or `webkit`, or a comma-separated
list) after `npx playwright install firefox webkit`. Without `FILES_BROWSERS` the suite runs once,
in Chrome, as before.

The job takes about two minutes per engine. It runs on every pull request and push to `main`, like
the other jobs, so a regression shows up on the change that caused it.

## Known gaps

Measured on GitHub Actions `ubuntu-latest`, Playwright 1.62.1, November 2026. Of 41 tests, 32 pass,
1 fails and 9 are skipped in each engine.

| Test                                       | Firefox | WebKit  | Why                                                                                                                                                                                                                |
| ------------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `original-pins.browser.ts` offline pin     | Fails   | Fails   | Not yet classified. Firefox: the offline navigation to `/offline-originals` fails with `NS_ERROR_OFFLINE` instead of being served by the service worker. WebKit: the mocked invitation request fails after unlock. |
| `project-reviews.browser.ts` report output | Passes  | Flaky   | App: WebKit sometimes raises "Failed to execute 'abort' on 'IDBTransaction'" as a page error. `revision-transaction.ts` aborts on signal without the `InvalidStateError` guard that `project-store.ts` has.        |
| `projects.browser.ts` (9 serial steps)     | Skipped | Skipped | Harness: drawing input sends touch and pen events through CDP, which only Chromium has, and every later step builds on the drawing step.                                                                           |

Test fixes made for these engines (#51): touch-target checks allow a hundredth of a pixel, since
Firefox reports 44px boxes as 43.9999px; the offline-pin test applies its CDP network override only
in Chromium.

Offline emulation (#101): `context.setOffline` only acts like an offline browser in Chromium.
WebKit's also fails every Blob read, even of a Blob built in memory, with `NotReadableError`, so a
backup file can't be read. Firefox's fails module worker scripts with `NS_ERROR_OFFLINE` although the
service worker has cached them, so a restored DNG shows "Preview unavailable". Neither happens in an
offline browser, and the app needs no change; the Firefox original-pins failure above may be the
same gap. The backup restore test therefore goes offline with `setOffline` only in Chromium. Firefox
aborts every request with a route instead. WebKit aborts only `/api/` requests, because its routes
catch worker scripts before the service worker can serve them.
