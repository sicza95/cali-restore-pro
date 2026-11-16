# Central i18n catalogue — Phase 3, item 3

15 November 2026 · Status: done · Issue: #30 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 3 item 3 and code finding 4

Goal: every EN and HU string sits in a copy module whose keys are typed, Hungarian can't miss or add a key without `npm run check` failing, and components never choose a language inline. No new library, and no change to any text on screen.

## Where things stand

Found on `main` at `0b93235`, after the feature-folder move (#29):

| Kind                                           | Where                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy modules, `{ en: {…}, hu: {…} }`           | `account-security/vault-copy.ts`, `account-access/navigation-copy.ts`, `editor/checkpoint-review/copy.ts`, `editor/drawing-review/workspace-copy.ts`, `projects/{checkpoint,project,surface,sync}-copy.ts`, `sharing/copy.ts`, `platform/estimates/copy.ts`, `platform/reports/copy.ts`. Nothing checks that both languages have the same keys. |
| Copy modules, `[en, hu]` pairs                 | `editor/drawing-review/copy.ts` (pairs, so parity holds by shape)                                                                                                                                                                                                                                                                               |
| Copy inside components or `constants.ts`       | `account-access/constants.ts` (`copy`, which also defines the `Language` type), `settings/constants.ts`, `ProjectBackup.tsx`, `ProjectKeyTransfer.tsx`, `OfflineOriginals.tsx`, `OfflineOriginalsPage.tsx`, `PrivateLibraries.tsx`                                                                                                              |
| Inline `language === 'hu' ? … : …` in `src/ui` | `AccessForm.tsx`, `AccountAccess.tsx` (deletion receipt), `PresetInputs.tsx`, `ProjectLifecycle.tsx`, `AccountDeletion.tsx`, `PrivateLibraries.tsx` (5); language parsing in `presentation.ts`, `useReport.ts`, `AppNavigation.tsx`; language names in `ReportReview.tsx`                                                                       |

## Approach

1. **`src/platform/i18n/`**, shared by UI and platform:
   - `Language`, `languages` and `languageNames` (endonyms: "English", "Magyar"), and `parseLanguage(value)` for stored or selected values.
   - `defineCopy({ en, hu })`: returns the object unchanged, so `copy[language]` call sites stay as they are. Its type makes `hu` match `en` exactly: the same keys, strings for strings, functions with the same parameters for functions, nested objects recursively. A missing or extra HU key is a type error, so `npm run check` fails.
   - `defineCopyPairs({ key: [en, hu] })`: the same result from the pair style.
2. **One rule for where copy lives**: a module named `copy.ts` or `*-copy.ts`, exporting catalogues made with `defineCopy` or `defineCopyPairs`. Copy now in components and `constants.ts` moves to a sibling `*-copy.ts`. `Language` moves to `i18n`; `account-access/types.ts` re-exports it.
3. **Inline ternaries go**: each becomes a key in its feature's copy module, and parsing uses `parseLanguage`.
4. **`test:unit` checks** (`src/platform/i18n/*.test.ts`):
   - Every copy module under `src/` (found with `import.meta.glob`) exports only catalogues; each has the same keys in EN and HU, no empty strings, and functions of the same arity. This backs up the type check where spreads or casts could hide a gap.
   - No `defineCopy` call and no `{ en: {` catalogue outside a copy module, and no `=== 'hu'` / `=== 'en'` comparison in `src/ui` (the "no inline ternaries" rule).
   - No catalogue string uses a banned term from the [copy glossary](../copy-glossary.md). The banned list moves from `tests-platform/copy-guard.ts` to `src/platform/i18n/banned-terms.ts`, and `copy-guard.ts` imports it, so the rendered-screen guard keeps working with one list.

## Not in scope

- Pluralisation rules and dates (numbers already go through `platform/format/number.ts`).
- Generated report files in `src/platform/reports/export-*.ts`, which still pick the file language inline; they follow the draft's language, not the app's, and get their own issue.
- Rewording. The copy-change checklist gains a line: new strings go in a copy module with `defineCopy`.

## Verification

`npm run check`, `test:unit` (with a temporary missing HU key to see it fail), `npm test`, `test:files`, `test:estimates`, `test:sync`, `test:app`, `build-storybook`. No screenshots should change; compare a few in EN and HU.

## Outcome

- `src/platform/i18n/`: `language.ts`, `define.ts` (`defineCopy`, `defineCopyPairs`), `banned-terms.ts` and two unit tests (parity and banned terms over every catalogue; where copy may live and no inline language choice in `src/ui`).
- 13 existing copy modules wrapped; inline copy moved into new modules: `account-access/copy.ts`, `settings/settings-copy.ts` (was `settings/constants.ts`), `settings/profile/deletion-copy.ts`, `settings/preferences/library-copy.ts`, `projects/{backup,key-transfer,lifecycle}-copy.ts`, `sharing/{pin,offline-page}-copy.ts`, `estimates/preset-copy.ts`.
- Every inline ternary is gone. The language picker and report language list use `languages` and `languageNames`.
- Negative run: removing one HU key from `sync-copy.ts` failed `typecheck` (TS2741) and `test:unit` (`hu.review: missing`).
- The banned-terms test found five HU strings the screen guard never reached: _pillanatkép_ in three sharing strings and _rögzített_ ("pinned") twice on the offline originals page. They now read _másolat_ and _offline elérhető_; both are in the glossary.
