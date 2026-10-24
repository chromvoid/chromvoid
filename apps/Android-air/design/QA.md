# Design verification — study 01

2026-09-08. Expert review and browser checks against the in-memory design fixture. This is evidence for a design artifact, not a native app release or a user-research result.

## Delivered coverage

- 26 interactive review scenes (Codes is a catalog filter); see [scenario matrix](scenario-matrix.md) for representative and specification-only subflows.
- Three visual directions compared on the same four scenes, with Quiet signal selected as an expert hypothesis.
- 48 PNG exports: 26 Android light, 8 alternative-direction scenes, 6 Android dark, 3 iOS, 3 desktop, 1 tablet and 1 compact dark form.
- Shared product research, positioning, identity and platform principles. Interviews have a ready protocol but were not run.

## Browser evidence

The studio ran locally through Bun on port 4320. Checks used rendered DOM events, browser screenshots and synthetic content; state changes were allowed two animation frames to render before assertions.

| Check                                                            | Result                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| All 26 destinations                                              | Correct route heading; no JavaScript errors                                                                                   |
| Search → item → Back                                             | Search context retained                                                                                                       |
| Edit → Back → cancel discard                                     | Dialog opens; edited title retained                                                                                           |
| Save → Back                                                      | Edited value retained; returns to catalog without an extra duplicate history entry                                            |
| Empty required title → submit                                    | Action remains available; inline error appears; focus moves to the title input                                                |
| Reveal → lock                                                    | Secret, previous title, query, draft, media and navigation state removed from the active view; demo unlock returns to catalog |
| Read-only catalog → detail → edit                                | Mutation rejected with explanation; remains on readable detail                                                                |
| Edit existing note                                               | Updates the same fixture note; returns to files                                                                               |
| Import review                                                    | Partial result shows one added and one skipped file; added file appears in catalog                                            |
| Pair expiry/restart and revoke                                   | Expired approval unavailable; restarted pairing works; confirmed revocation removes the chosen computer                       |
| 22 relevant state variants                                       | Heading remains available; no horizontal page overflow                                                                        |
| Eight main routes at outer 390 × 844 touch viewport              | No document or product horizontal overflow                                                                                    |
| Compact 360, phone 390, tablet 840 and desktop 1080 compositions | Rendered/exported; wide list/detail preserves context                                                                         |
| Maintenance confirmation after cleanup                           | Backup review dialog opens and explains the operation                                                                         |
| Three-direction comparison board                                 | All 12 reference images load; no horizontal overflow at 1440                                                                  |
| Asset exports                                                    | All 48 PNG files decode with expected nonzero dimensions                                                                      |

An early automation attempt read immediately after an event and observed the previous render. Waiting two animation frames corrected the test orchestration; no timing workaround was added to product state. A separate real defect, duplicate Back after save, was corrected in model navigation and its scenario rerun successfully.

Screenshots are viewport captures; long pages remain scrollable in the studio. Sticky creation actions can overlay intermediate scroll content, which remains reachable by scrolling. System bars, OTP, clipboard feedback, provider access and media are demonstrations, not integrations.

## Source and tooling checks

- `bun run lint` passed after the final JavaScript cleanup.
- Final simplification removed an unused operation atom and writer; maintenance confirmation was rechecked. Domain state remains in the Reatom model; view modules render it and forward actions.
- Local server GET checks pass for the bundle, boards and PNG assets; HEAD works for CSS. Unlisted repository paths return 404; POST returns 405.
- Browser console: no JavaScript errors; expected Lit development-mode warning only.
- Opt-in palette lives under the existing theme owner. Production entry points do not import it; the existing spiral and icon assets are reused.
- No unit tests were added for this reversible fixture artifact. Direct scenario checks cover observable behavior; native implementation needs its own regression tests against actual domain contracts.

## Remaining evidence before production

1. Run the research protocol with real Android users, including current and new users. Test product-value comprehension, destination names and external-copy understanding.
2. Validate native predictive Back, edge-to-edge insets, font scaling, TalkBack, keyboard/IME, biometrics, Autofill, QR, system file selection, share/import, background hosting, USB and media on target devices. Browser behavior cannot establish these contracts.
3. Expand the subflows marked S in the scenario matrix during native implementation; preserve current runtime capability and security boundaries.
4. Confirm dark/light contrast and accessibility in the selected native typography/component implementation. Current screenshot and focus checks are not a complete accessibility audit.
5. Measure current versus proposed task completion on equivalent fixtures before claiming a usability or retention improvement.

Disposition: ready for design review and formative testing; no claim of production readiness or participant validation.

## Follow-up — unified one-time codes

User review identified that Codes replaced the entire catalog and used disconnected fixtures. Browser reproduction confirmed the missing search/tabs and missing GitHub detail code before the change.

The separate Codes renderer was removed. Optional OTP metadata now belongs to the same credential fixture; a standalone code fixture demonstrates that All is a unique union. One code renderer serves filtered catalog rows and account detail. Shared search, grouping and sorting remain owned by the existing model. The 07 studio shortcut opens the catalog with its Codes filter selected.

Browser regression checks passed: unique All membership; search retained through Cards/Passwords/Codes; group intersection; GitHub detail/copy; attached code preserved after editing; Back retains query/tab; standalone code creation appears in All and Codes but not Passwords; deleting GitHub removes its linked code. Codes-only copy actions, read-only copy/edit denial, long titles in compact dark mode and lock cleanup also passed. Five state variants and detail were checked on phone light, compact dark, tablet light, iOS light and desktop dark with no horizontal pane overflow.

The 14 affected catalog/detail/codes/organization PNGs were refreshed from the live prototype. The detail comparison now uses GitHub consistently across the three directions and platform adaptations. The total remains 48 exports. OTP values and timing remain synthetic.

Cleanup removed the obsolete Codes renderer/styles and its unused route-state declarations. The shared catalog state selector remains available through scene 07. Scoped formatting and repository lint pass.

## Follow-up — accepted graphite / ice-blue palette

The user approved the shared palette documented in [color-system.md](../../../business/brand/color-system.md). The Air theme maps all ten roles in each mode to equivalent HWB values, preserving the existing property names, document inheritance and component consumers. Obsolete mint overrides in the expressive composition were removed; all composition alternatives now share the approved palette.

Browser canvas conversion verified all 20 rendered sRGB role values exactly against the accepted HEX references, in all three composition modes. Five catalog states were traversed in both themes across phone, compact, tablet, iOS and desktop adaptations (50 layout/state combinations), with search present and no horizontal pane overflow. Focus, selected states, normal content and primary actions were inspected in rendered form. All 48 PNGs were refreshed at 2× capture scale; viewport names refer to CSS dimensions, not raster dimensions.

Calculated primary button text contrast is 5.70:1 light and 9.07:1 dark; see the palette document for the other measured pairs. Color-system validation and repository lint pass. No model/navigation changes were needed; the earlier behavioral regression evidence remains applicable. This is adoption in the design study, not a production native-client or public-site deployment. Further identity motifs are proposals in [brand-system.md](../../../business/brand/brand-system.md).
