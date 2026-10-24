# Android route audit

Version 1 · 2026-09-20. The native completeness checklist for
[the implementation plan](../docs/implementation-plan.md).

Every supported row must end with native evidence or an explicit capability
reason in the release manifest. The iOS `J01–J42` audit is a completeness
source, not an Android capability authority: a row exists here because Android
supports it, and the Android-only rows `A43–A51` have no iOS counterpart.

Coverage marks carry the meaning already used by the
[scenario matrix](scenario-matrix.md): **P** interactive path in the browser
study, **R** representative composition, **S** specified subflow awaiting
detailed work, **D** device verification required. A studio mark never proves
native behaviour; it only says how much design evidence a row starts from.

Studio scene numbers refer to `design/screenshots`. Production owners under
`apps/webview/src` and `crates/` are named where the native work must consume an
existing contract rather than invent one.

## Route contract

- Four root destinations: Хранилище, Файлы, Подключения, Настройки. A root tab
  returns to its own current stack; re-tapping the selected tab does not close a
  document or clear a filter. Back closes the top modal or selection mode, then
  the document or detail, then the folder. No hidden jump into a sibling root.
- Search, filter, sort, grouping, path, scroll and originating surface survive
  until lock. Rename and move update identity-based selection instead of
  re-finding an item by its old name.
- Every editor has an origin. A clean cancel returns immediately; a dirty
  cancel, Back, predictive-back commit, or root switch asks to discard, and
  declining keeps the draft. Save shows the saved object and Back returns to the
  originating list. Failure preserves the draft. Lock discards it without asking.
- Read-only is an authorization state of the session, not a visual style. It
  survives navigation to descendants: viewing, copying and filtering stay
  available, mutations are refused with a reason.
- After backgrounding there is no return to a previous title, query or document
  before unlocking. A new unlock opens a safe root; the previous secret
  navigation snapshot is not restored.
- A system picker, permission prompt or provider request has its own lifecycle
  outcome. Returning from system UI is not an automatic session resume, and no
  plaintext queue survives the interruption.
- A desktop-only capability is never offered because a shared route exists. The
  capability baseline records the actual Android set and the reason for every
  unavailable row; the denial path is what gets tested, not a silently missing
  button.

## Matrix

| ID  | Task and direct route                                                      | Return / failure oracle                                                                                             | Coverage | Stage  |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| A01 | Welcome → administrative setup → vault password → catalog                  | Empty or mismatched input stays in the form; an already configured install is not asked to create an admin again    | P/D      | W3     |
| A02 | Unlock → empty vault                                                       | An empty field is validated; a non-empty password over an empty catalog is never reported as wrong                  | P/D      | W3     |
| A03 | Unlock → keystore unavailable → retry or help                              | No reset or erase offered, stored bytes unchanged, help has a way back to unlock                                    | P/D      | W2/W3  |
| A04 | Locked → connections, settings or help → back                              | No titles, passwords or files roots appear; starting the host does not open the vault                               | P/D      | W3/W8  |
| A05 | Search by name, login, site or tag → detail → back                         | Query and scroll retained; no-match offers clear; a missing id does not silently open the first record              | P/D      | W4     |
| A06 | List quick copy; detail field copy, reveal, copy-all, open site            | Quick copy is one tap, reveal is separate, an external site return still obeys the background lock                  | P/D      | W4     |
| A07 | Add login or edit → save or cancel                                         | Origin preserved; dirty guard; failure keeps the draft; a duplicate submit is refused                               | P/D      | W4     |
| A08 | Add or edit a payment card                                                 | Type decides the fields; PAN and CVC masked; per-field copy; the card survives an edit and save                     | S/D      | W4     |
| A09 | Groups → create, rename, delete, nest                                      | Parent and nesting preserved; delete explains the effect on children; a collision does not lose the list            | P/S      | W4     |
| A10 | Entry → move → destination → result                                        | Cancel returns to detail; after a move, back leads to the original context and the entry leaves the old group       | P/S      | W4     |
| A11 | Tags catalog create, rename, colour, delete; entry assignment; list filter | References follow the current rule, partial failure is visible, tags never become a separate Kotlin truth           | P/S      | W4     |
| A12 | List → sort, quick filters, grouping, security audit                       | Applied state is explicit; clear resets only filters; the audit explains its evidence and opens the affected entry  | P/S      | W4     |
| A13 | List → select → bulk delete                                                | Visible selection count; the confirmation names the scope; partial failure leaves only failures selected            | P/S/D    | W4     |
| A14 | Credential import from list or settings → review → commit → result         | Format, duplicate and group semantics from the current importer; cancel imports nothing; partial result says so     | P/S      | W4/W9  |
| A15 | Credential export or clear from settings                                   | Export states format, scope and that it is an external copy; clearing credentials is not erasing storage            | S/D      | W4/W9  |
| A16 | Codes → add manually or scan → save → codes                                | Camera denial returns to the same manual draft; input is validated by Core; an expired code is cleared              | P/D      | W4     |
| A17 | SSH keys → create or import → detail, edit, export, delete                 | Supported key formats, passphrase and metadata preserved; no desktop SSH agent is promised on Android               | S/D      | W4     |
| A18 | Passkeys → detail → delete; autofill info → back                           | Metadata instead of private material; deletion is confirmed; the return does not lose the originating list          | P/D      | W5     |
| A19 | Settings → credential provider setup → external request or cancel          | Unavailable, locked, process-killed and no-match states are explicit; no success is claimed without device evidence | R/P/D    | W1/W5  |
| A20 | Files → folder → search → file → back                                      | Same folder, query and scroll; a deleted item has a way back; sort and hidden filters are explicit                  | P/S      | W6     |
| A21 | Files → add note, folder or import                                         | Creation happens in the current folder; a name collision or cancel does not damage the previous document            | P/S      | W6     |
| A22 | Files → Notes filter → note → edit or preview                              | Same catalog and origin; a newly saved note appears immediately; cancel does not replace the previous text          | P/S      | W6/W7  |
| A23 | File detail → rename, move, info                                           | Metadata is current; the destination excludes its own subtree; a failed rename keeps the source and selection       | R/S      | W6     |
| A24 | Files → select → move, delete, share                                       | Count and applicability shown; folder and file differ; partial failure and cancel are not masked as success         | P/S      | W6     |
| A25 | Import → document picker → destination and review → progress → result      | Multi-item conflict, no space, cancel and partial result; the return lands on the destination folder                | P/S/D    | W6     |
| A26 | File → export, share, open externally, save to gallery                     | An explicit external copy; permissions requested on demand; cancellation returns to the file                        | P/S/D    | W6     |
| A27 | Document → edit → save, cancel, revision conflict                          | Dirty guard; a conflict offers a reread or keeps the draft; nothing is overwritten silently                         | P/S      | W7     |
| A28 | Markdown → internal link, attachment, task item → back                     | Existing links, anchors, attachments and task toggles work; a missing attachment says so; external links are marked | R/S      | W7     |
| A29 | Image, gallery, video or audio → controls, seek, close                     | Origin preserved; an unsupported format shows metadata instead of exporting; no autoplay; lock stops and revokes    | R/P/D    | W7     |
| A30 | Another app → share into ChromVoid → accept or cancel                      | A repeated entry does not resend the previous payload; no persistent plaintext queue; a locked vault says so        | S/D      | W6     |
| A31 | Connections → start or stop host → switch root                             | Host state is independent of navigation; vault open and host listening are separate; the background outcome is hone | P/D      | W8     |
| A32 | Add computer → start host → pairing, expiry, restart, cancel               | An expired code cannot be confirmed; mismatch or denial grants no trust; restart issues a fresh code                | P/S/D    | W8     |
| A33 | Paired computer → status → revoke                                          | Revoking the named peer ends its active session; a network failure does not remove trust on its own                 | P/S/D    | W8     |
| A34 | Wallet → create, restore, import, switch → account, add                    | No forced single wallet; network and account are chosen explicitly; recovery secrets stay a separate authorization  | R/S/D    | W9     |
| A35 | Wallet account → receive, address book, history, detail                    | The address belongs to the selected account and network; history is not cleared by a root switch                    | R/S/D    | W9     |
| A36 | Send → recipients and amount → quote and preview → confirm → result        | Back keeps the draft; a fee or network change demands re-review; an uncertain outcome reconciles, never resubmits   | R/S/D    | W9     |
| A37 | Wallet → recovery or sensitive export                                      | A separate explicit authorization under the current contract; never mixed with ordinary copy                        | S/D      | W9     |
| A38 | Settings → security, theme, language, files, passwords                     | Supported preferences preserved; the background lock applies regardless of timeout; a change does not reset drafts  | P/R/S    | W9     |
| A39 | Settings → help, app information                                           | Safe while locked; help works offline; no licence, plan or purchase surface ([ADR-041])                             | P/S      | W9     |
| A40 | Maintenance → backup, restore, rekey, erase → authorize → result           | Scope named; an incompatible backup is refused before mutation; rekey requires a match; a keystore error cannot era | R/S/D    | W9     |
| A41 | Any task → read-only, error, loading, lock                                 | The restriction is session-wide; navigation survives a non-critical load; lock closes drafts, sheets and media      | P/D      | W3–W9  |
| A42 | Any task → rotation, tablet width, ordinary keyboard                       | Primary actions stay reachable; no gesture-only essential action; focus returns to the initiator; labels localized  | P/D      | W10    |
| A43 | Incoming Android share → authorize → destination and review → result       | Cancel stores nothing; a locked vault explains instead of queuing; process death does not resend the payload        | S/D      | W6     |
| A44 | Settings → SAF backup or restore → pick a document → result                | The picked tree is the only write target; a cancelled picker changes nothing; an incompatible archive is refused    | S/D      | W9     |
| A45 | Files → native upload → picked URIs → streamed import                      | Provenance recorded; a revoked permission fails the item, not the batch; location metadata follows the current rule | P/S/D    | W6     |
| A46 | Codes → scan QR → camera permission → parsed secret                        | A denial returns to the manual draft; an unreadable code keeps the scanner open; the secret never reaches a log     | P/D      | W4     |
| A47 | File or media → save to gallery → system collection                        | The API-level gate is explicit; a denied permission explains; the saved item is observable, not a silent no-op      | S/D      | W6     |
| A48 | Connections → USB accessory → discovered, approved, denied, disconnected   | A posted read is always kept; a clean desktop shutdown re-arms the listener without a replug                        | R/S/D    | W8     |
| A49 | Quick-settings tile or vault notification → lock                           | The tile never reveals catalog content; locking from it is immediate and idempotent; the notification shows no name | S/D      | W9     |
| A50 | Another app field → autofill → dataset or authentication → fill, save      | A locked vault authenticates first; no match explains; a save prompt never stores without an explicit confirmation  | R/S/D    | W5     |
| A51 | Any task → predictive back, configuration change, process death            | A back preview never commits a discarded edit; a rotation keeps the draft; process death does not restore secrets   | S/D      | W3/W10 |

## Remaining-detail boundary

`S` rows are carried work, not discarded features: they were specified by the
design study and must reach native evidence in their owning stage. A stage does
not close while one of its `S` rows is neither implemented nor recorded as an
explicit unavailable capability.

`D` rows cannot be closed on an emulator alone where the capability depends on
real hardware or a real system service - credential provider, autofill,
passkeys, camera, USB and media decoding. Emulator-only evidence for those rows
is recorded as missing evidence, and missing evidence blocks the corresponding
release claim rather than the stage silently passing.

[ADR-041]: ../../../specs/ADR-041-no-monetization-before-customers.md
