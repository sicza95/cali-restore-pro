# Copy glossary

Task language for every screen, in English and Hungarian. Written for the [copy audit](plan/copy-audit.md) (Phase 2, step 1) and meant to be adopted by the central i18n catalogue later (Phase 3, item 3). When a new string needs one of these ideas, use the word here.

## Rules

1. **Say what the user is doing, not how the app does it.** No version-control words (commit, revision, batch), no storage or crypto mechanics (encrypted, client-side, envelope), no build or milestone names (M-14, restoration-v1), no test-harness words (review, scope, adapter).
2. **A note that describes the build goes in docs, not on screen.** "Not connected yet" and similar status notes are removed. If they are still true, they are recorded in the relevant plan or milestone doc.
3. **A real limit stays on screen, said once, where the user acts on it.** For example, the backup limit appears on the backup panel, only when the project has something the backup leaves out.
4. **Never show internal identifiers.** No UUIDs, revision numbers like `r4`, or raw keys. Show a name, a kind and number ("Damage layer 2"), or a version number in words ("Version 4"). Administration may pair readable mail/event labels with short references (first eight characters; _rövid azonosító_). A reference button copies the full ID (_Teljes azonosító másolása_); its title also holds the full ID. This supports operators without displaying raw UUIDs in the page text.
5. **Exported files may keep audit values** (the calculation version, revision numbers) in their data rows, and so does the preview of a file, which shows exactly what will be downloaded. Other screens do not show them.
6. **Hungarian follows the same idea, not the English word.** "Review" was translated as _előnézet_ (preview); where it meant "preview" it stays, where it meant the test harness it goes.

## Terms

| Do not use (EN)                                        | Use (EN)                             | Do not use (HU)                                            | Use (HU)                                   |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| commit, commit draft                                   | save, save draft                     | rögzítés, vázlat rögzítése                                 | mentés, vázlat mentése                     |
| committed (mark, layer, geometry)                      | saved, or nothing ("Phase layer")    | rögzített, mentett geometria                               | mentett, vagy semmi („Munkafázisréteg”)    |
| review commit mode                                     | save marks                           | előnézeti rögzítési mód                                    | rajzjelek mentése                          |
| manual batches                                         | when I choose                        | kézi kötegek                                               | amikor én döntök                           |
| retained commits                                       | undo steps kept                      | megőrzött rögzítések                                       | megőrzött visszavonási lépések             |
| review history                                         | history                              | előnézeti előzmények                                       | előzmények                                 |
| Estimate review, Report review, Output review          | Estimate, Report, Outputs            | Becslési előnézet, Jelentés-előnézet, Exportálási előnézet | Becslés, Jelentés, Exportálás              |
| split / combine review phase(s)                        | split / combine phase(s)             | előnézeti fázis(ok)                                        | munkafázis(ok)                             |
| review version                                         | version                              | előnézeti verzió                                           | verzió                                     |
| draft review                                           | draft                                | piszkozat-előnézet (as a title)                            | piszkozat                                  |
| independent mask scope                                 | phase area                           | önálló maszkterület                                        | a munkafázis területe                      |
| selected estimate scope, extra scope                   | objects in this estimate, applies to | a becslés kiválasztott köre, tétel hatóköre                | a becslés tárgyai, érvényes erre           |
| encrypted (version, sample), client-side               | nothing, or "saved on this device"   | titkosított, kliensoldali                                  | semmi, vagy „ezen az eszközön mentve”      |
| encrypted input version · r4                           | Version 4                            | titkosított bemeneti verzió · r4                           | 4. verzió                                  |
| not cloud-synced                                       | not synced yet                       | nincs felhőszinkron                                        | még nincs szinkronizálva                   |
| calculation version, restoration-v1 (on screen)        | nothing (exported files only)        | számítási verzió (a képernyőn)                             | semmi (csak exportált fájlban)             |
| platform connection, connected, check connection       | server, online, check again          | platformkapcsolat, csatlakoztatva, kapcsolat ellenőrzése   | szerver, elérhető, újra ellenőrzés         |
| not connected (yet)                                    | delete; see rule 2                   | nincs kapcsolat még, nem érhető el még                     | törölni; lásd 2. szabály                   |
| M-14, M-16 or any milestone name                       | delete                               | M-14 stb.                                                  | törölni                                    |
| on this iPad (any device name)                         | on this device                       | ezen az iPaden                                             | ezen az eszközön                           |
| Photo review, Drawing review, Checkpoint review (tabs) | Photo setup, Drawing, Checkpoints    | Fotó ellenőrzése, Rajz ellenőrzése, Ellenőrzőpont-előnézet | Fotó beállítása, Rajzolás, Ellenőrzőpontok |
| draft batch                                            | several marks                        | vázlatköteg                                                | több rajzjel                               |
| (shared) snapshot                                      | snapshot (EN keeps it)               | pillanatkép                                                | másolat (Projektmásolat megosztása)        |
| pinned (offline originals)                             | available offline                    | rögzített (it reads as "committed")                        | offline elérhető                           |
| work phase mask, damage mask (editor layer kinds)      | Phase layer, Damage layer            | Munkafázis maszkja, Kármaszk                               | Munkafázisréteg, Kárréteg                  |

## Words that stay

- **Final report** (_végleges jelentés_): explicitly issued from a complete, issued estimate. **Source issued estimate version** (_A forrásként használt kiadott becslés verziója_) identifies the saved version behind the final report. Partial totals remain drafts.

- **Admin mail kinds**: Email verification (_E-mail-cím megerősítése_), Password reset (_Jelszó visszaállítása_), New email confirmation (_Új e-mail-cím megerősítése_), Account security notice (_Fiókbiztonsági értesítés_), Project invitation (_Projektmeghívó_). Unknown older jobs use Mail job (_Levélküldés_). Security event references show the current account email, falling back to Actor (_Végrehajtó_) or Account (_Fiók_) when the account is gone. Short references remain beside these labels.

- **Raw mask** (_nyers maszk_): one saved layer as an opaque black mask with transparent surroundings, in the reference photo's original pixel coordinates and dimensions. It excludes the photo, crop, grid, legend and layer styling.

- **Draft** (_vázlat_ for drawing, _piszkozat_ for reports): an unfinished, unsaved piece of work is a real idea for the user.
- **Preview** (_előnézet_) where it means looking at a result before downloading it.
- **Encrypted backup** (_titkosított biztonsági mentés_): the user must keep the backup key, so the word tells them something they act on.
- **Assessment, checkpoint, phase, layer, mask, calibration**: conservation and editor vocabulary the user works with. The estimate calls the layer a work phase is measured on a **phase layer** (_munkafázisréteg_), in its label and in every value of its select ("No phase layer assigned", _Nincs munkafázisréteg_), not a mask, and the editor and surface pages use the same names (**Damage layer**, _Kárréteg_).

## Guard

The banned terms above live in `src/platform/i18n/banned-terms.ts` and are checked twice: in every catalogue string by `npm run test:unit` (`src/platform/i18n/catalogue.test.ts`, since the [i18n catalogue](plan/i18n-catalogue.md)), and in rendered text by `tests-platform/copy-guard.ts` (copy audit commit 7). English terms are matched as whole words, case-insensitively. Hungarian terms are matched as phrases, because _előnézet_ alone is allowed. A UUID pattern and revision numbers (`r4`) are checked as well. Text in an open dialog is skipped (rule 5). It runs on the screens the copy audit covered and on empty and filled admin pages, including expanded mail jobs (EN/HU). Account and vault coverage remains separate. Add a term to both this table and `banned-terms.ts`.
