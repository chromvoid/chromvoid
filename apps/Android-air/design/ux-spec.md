# Android Air — UX 01

2026-09-08. Selected direction: [Quiet signal](../../../business/brand/identity.md). Approved palette: [graphite and ice blue](../../../business/brand/color-system.md). Product context: [scope](../docs/product-scope.md). Artifact coverage: [scenario matrix](scenario-matrix.md).

## Composition and ownership

Phone: 390-wide baseline and 360 compact, one scroll owner per page, labeled bottom navigation, prominent search, action after the current context. Four roots: **Хранилище / Файлы / Подключения / Настройки**. Credential types and OTP stay within the first root; notes stay in Files with a direct filter. This preserves object semantics while simplifying the current separate credentials/OTP and files/notes roots. “Хранилище” versus “Доступы” remains an explicit naming hypothesis for participant testing.

Tablet: 840 study with a rail and list/detail. Desktop concept: sidebar, catalog and detail; useful reading measure instead of stretched mobile cards. iOS concept: same content identity with tab/header conventions, no CSS imitation of Liquid Glass.

Studio and app controls are distinct. Studio provides 26 scene shortcuts, three directions, platform/size/theme/state controls and reset. These shortcuts intentionally prepare a synthetic authorized state; they do not represent product navigation or authentication. Product navigation always follows the fixture session.

Prototype ownership: `model.js` owns named Reatom state, fixture transitions, form fields and filtering; `app.js` owns studio rendering, event forwarding and native dialog/focus execution; domain render modules display model values. `fixtures.js` owns synthetic data and screen descriptions. `serve.ts` resolves already installed UIKit dependencies with Bun; no new package installation or duplicated runtime. All prototype source is editable.

## Routes and completion

- Welcome → admin setup → vault password → catalog. Existing setup skips welcome/admin. Setup checks required/matching inputs only; demo unlock accepts any nonempty text. No false-password oracle.
- Catalog → search/type/group → detail → Back returns to the same filtered list. Root switches preserve each root's stack within the session. Lock clears stacks and query; unlock returns to root.
- Copy is explicit and gives nonsecret feedback; no clipboard API is used. Reveal is temporary and removed on navigation/lock. Passkey private material is never shown.
- Add → type sheet → form → Save creates one fixture record and opens it. Edit preserves untouched fixture metadata. Dirty Back/root switch requires discard/cancel; Cancel preserves input. Save failure preserves input. Successful Save does not introduce a duplicate Back destination.
- Groups and tags narrow the catalog. Move changes the fixture group's owner while preserving ID. Multiple selection is available through a labeled control, with explicit destructive confirmation.
- Catalog tabs All / Passwords / Cards / Codes filter one collection and retain the search, group and sort state. Codes includes both login records with an attached code and standalone code records. All contains each record once; attached-code hints keep the default list compact. Selecting Codes reveals directly copyable codes in the same catalog layout. The studio shortcut 07 opens this filter, not a separate product route.
- Account detail displays an attached code alongside the password (for example GitHub); standalone code detail never labels the OTP secret as a login password. Both read the same fixture metadata as the catalog. Editing preserves attached-code metadata; deleting the account removes it from every filter.
- OTP uses fixed sample codes with an explicitly annotated fixed countdown. Manual addition validates required input; camera action explains the unavailable browser boundary and retains draft. No TOTP algorithm, wall clock or live credentials.
- Files → type/search → document or media → Back. Notes are stored in the same fixture catalog, not a second notes database. Edit writes only that file. New note produces a new item.
- Import → review → add readable items → explicit partial result → Files. The fixture adds one PDF and reports one skipped ZIP. Credential import adds one fixture and reports a skipped duplicate. No native picker or parser runs.
- Export → external-copy explanation → cancel/result; document stays available. Media illustration/play/pause/seek models composition and state only. Native decoder and lifecycle remain device checks.
- Connections separates **vault open/closed**, **host listening/stopped**, **computer trusted/revoked**. Navigation does not start/stop a host. Add explicitly starts the pairing fixture. Expired code cannot be approved; restart obtains a fresh simulated stage. Revoke removes only the named trust record. USB is explanatory until device capability is established.
- Settings theme affects the whole study without resetting an open draft. Autofill configuration and chooser are illustrative OS boundary screens; locked sessions cannot reveal/select data. Maintenance and wallet are review compositions, not executable authorization/financial/storage flows.

## State contract

Normal/empty/loading/error are available only on screens that actually render that state. Read-only is session-wide across product navigation: view/copy is allowed, vault-content mutations are rejected with an explanation. Ordinary errors do not propagate to unrelated destinations. The studio state selector completes the simulated loading state and root navigation remains reachable. Empty search explains reset. Lock closes sheet/confirmation/draft/media/reveal immediately.

Focus: inline errors reference their input and submitted validation focuses the first invalid control. Native dialog supplies modal keyboard containment and Escape. Existing element focus is returned by the browser on dialog close when the origin remains mounted. App navigation/back semantics are modeled; real Android predictive gestures are not. Test ordinary keyboard input and label association; exhaustive native accessibility environment testing is outside this design delivery.

## Copy meanings for localization

Russian is the review language. English meanings below are canonical handoff semantics; native string catalogs / WebView i18n remain implementation owners.

| Russian                 | English meaning                    |
| ----------------------- | ---------------------------------- |
| Личное. На своём месте. | Your private world. In your hands. |
| Хранилище               | Vault                              |
| Файлы                   | Files                              |
| Подключения             | Connections                        |
| Открыть хранилище       | Open vault                         |
| Административный пароль | Administrative password            |
| Пароль хранилища        | Vault password                     |
| Только чтение           | Read-only                          |
| Отозвать доступ         | Revoke access                      |
| Сохранить внешнюю копию | Save an external copy              |
| Не сохранять изменения? | Discard changes?                   |
| Укажите название        | Enter a title                      |
| Код больше не действует | Code expired                       |

## Action budgets

From the already-open corresponding root, excluding input and authorization: open detail 1; quick copy 1; OTP 1; passkeys 1 after scrolling; group chooser 1; start credential creation 2 including type choice; notes filter 1; start new note 2; import files review 1. These are prototype design budgets, not measured speed or retention claims. Compared with the inspected current settings baseline, the design reduces independent primary sections from Files/Notes/Credentials/OTPs to two content roots and reserves space for Connections/Settings. A real current-vs-new timing comparison has not been conducted.
