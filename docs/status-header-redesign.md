# Canonical compact status controls on both surfaces — 2026-10-07

This follow-up applies the newly approved product decision to Full Library / Options as well as Side Panel. The initial surface-specific implementation and its exact verification results remain historical below. Work began on main at e117c06d874ece3f757ba8b829815fa311749dcf with the previous icon redesign already uncommitted and demo/ untracked; all prior work was preserved. No stage, commit or push occurred.

## Current implementation and simplification

Both headers now use the same icon-only connection and sync controls before the explicit Sync action and Privacy shield. Full Library keeps its brand cleanly at left and a cohesive four-control cluster at right. There is no permanent account name, Read-only, phase, Updated time or status chevron in either header. Actual values remain in accessible names, native title tooltips and shared structured details; only the actual phase is a visually hidden live region.

The verbose Full Library branch was removed. ConnectedAccount no longer accepts a compact flag and has one icon-only trigger. SyncStatus no longer accepts a compact flag; its header mode always uses that same compact presentation, while expanded/strip progress and recovery remain. OptionsApp no longer branches by surface for status presentation, placeholders or the Sync action label. The surface prop remains for actual layout/browsing differences. Unused header freshness description IDs, descriptive field CSS, medium-width status wrapping, and duplicate surface-specific control rules were removed.

StatusIcon, Disclosure and Icon are reused; this follow-up adds no second icon, state or disclosure implementation. Existing account/identity and sync state derivation, handlers, timestamps, matching-success rule, badges, tooltips, keyboard behavior, glyph-only animation, error/attention semantics and reduced motion are unchanged. Bootstrap placeholders share the controls on both surfaces. Auth/OAuth, sync engine, storage, runtime/lifecycle, library/query/filter/Reset/detail/pagination and Privacy logic have no source changes.

All four controls are 36px high, aligned in the intended order at the right edge. Wide Full Library remains 64px high. Eliminating the former medium second row also makes 1024/800px headers 64px; this naturally recovers that row's 33.8px without changing toolbar/list/detail structure. Side Panel remains 54px.

| Surface / viewport | Header height | Search Y | First fixture result Y | Change from initial icon approval |
|---|---:|---:|---:|---|
| Options 1440x900 | 64 | 87 | 177 | Geometry unchanged |
| Options 1200x800 | 64 | 87 | 229 | Geometry unchanged |
| Options 1024x800 | 64 | 87 | 229 | Search/results 33.8px higher |
| Options 800x800 | 64 | 87 | 229 | Search/results 33.8px higher |
| Side Panel 480x800 | 54 | 73 | 311 | Geometry unchanged |
| Side Panel 360x800 | 54 | 73 | 311 | Geometry unchanged |
| Side Panel 320x480 | 54 | 73 | 311 | Geometry unchanged |

These are synthetic fixture measurements, not production-account or native human smoke evidence.

## Follow-up files changed

| File | Follow-up purpose |
|---|---|
| src/options/OptionsApp.tsx | Remove surface-specific status/placeholder/action presentation branch |
| src/options/ConnectedAccount.tsx | Remove verbose trigger and compact prop |
| src/options/SyncStatus.tsx | Remove verbose header/compact prop and obsolete accessibility IDs; retain shared state/details |
| src/options/options.css | Cohesive right cluster, shared dimensions, remove unused descriptive/wrapping rules |
| tests/unit/options-presentation.test.tsx | Replace verbose desktop assertions with canonical icon/details assertions |
| tests/e2e/options.spec.ts | Run common interaction/state case on both surfaces; canonical names/geometry/fences/screenshots |
| tests/e2e/provider-validation.spec.ts | Check read-only in actual accessible name/shared facts instead of permanent inline prose |
| docs/product-spec.md | Canonical compact controls on both surfaces |
| docs/engineering-spec.md | Single presentation and retained state/handler boundaries |
| docs/options-ui.md | Current layout/details/accessibility contract |
| docs/acceptance-criteria.md | AC-OPTIONS-005 canonical shared header expectations |
| docs/verification-strategy.md | Common two-surface interactions and current evidence paths |
| docs/status-header-redesign.md | Current follow-up evidence; initial design/results preserved below |

StatusIcon.tsx, Disclosure.tsx and Icon.tsx are reused without follow-up edits. Their existing uncommitted changes belong to the initial icon approval. demo/ remains unrelated and preserved.

## Current automated verification

Final follow-up npm run verify completed with exit 0.

| Command | Follow-up result |
|---|---|
| npm run verify:ui | 112 tests / 3 files passed |
| Focused Chromium header/remount/long-name checks | 8 passed |
| npm run lint | Passed, zero warnings |
| npm run typecheck | Passed |
| npm run test | 693 tests / 16 files passed |
| npm run build + npm run check:build | Production build and gate/identity/manifest/asset/artifact checks passed |
| npm run build:provider-validation + npm run check:provider-validation | Separate package build/checks passed |
| npm run test:e2e | All 79 Chromium tests passed |
| npm run verify | Passed, exit 0 |
| git diff --check | Passed; an indentation-only trailing space was removed |

The additional Chromium case is the existing common compact interaction/state test now also run on Full Library. No unit count was invented or changed by relabeling the tests. Scope checks confirm no changes to runtime/auth/provider/storage/sync/domain/query, LibraryBrowser, use-options-runtime, SyncProgress, package/dependency locks or build configs. Branch/HEAD remain main / e117c06d874ece3f757ba8b829815fa311749dcf, staged diff empty; demo/ preserved. The earlier 112/693/78 approval remains historical below.

Focused UI checks passed 112 tests / 3 files. Eight focused Chromium checks passed: common keyboard/details/state/action behavior on both surfaces, five true test-document remounts per surface, responsive geometry and long-name disclosure bounds. The common interaction case verifies Tab order/focus, Space/Enter, Escape restoration, actual identity/read-only and phase/freshness in details, one explicit SYNC_START, active/completed/failure/mismatch/disconnected/connecting/never-synced transitions and glyph-only animation. Existing progress/security/lifecycle/filter/list/provider cases remain; identity retention checks now inspect the actual connected control rather than deleted prose.

Current screenshots use ignored .output/status-header-canonical-{surface}-{width}.png and -header.png; active captures use .output/status-header-canonical-{surface}-active.png. Geometry and remount traces use .output/status-header-canonical-measurements-{surface}.json and -bootstrap-{surface}.json. Maker inspected Full Library at 1440px and Side Panel at 360px: clean left brand, cohesive right cluster, distinct Sync action, no permanent status prose, and preserved library structure. Header-only images from the successful full run were copied to canonical names and the future capture filename corrected; no image pixels were edited. The initial approval report/design/results remain historical below; ignored capture paths can be regenerated by test runs.

## Current manual production smoke — UNPASSED

No native human production smoke was performed. Automated fixture screenshots and extension-page interactions are limited evidence. Use C:\Dev\likedex\.output\chrome-mv3, record Chrome version/date/package state, and perform this same procedure on BOTH Full Library / Options and native Side Panel:

1. Open the surface; confirm brand left and Connection status, Sync status, Sync action, Privacy in order on one row.
2. Confirm no permanently visible account name, Read-only, phase, Updated time or status chevrons.
3. Hover/focus both status controls; verify concise tooltips and meaningful actual accessible names.
4. Use Tab then Space/Enter to open Connection; verify real account, Read-only and full channel ID.
5. Press Escape; verify focus returns to Connection.
6. Open Sync status; verify actual phase, Updated time and retained structured diagnostics/counts.
7. Press Escape; verify focus returns to Sync status and opening/closing caused no header/library shift.
8. Trigger the separate Sync action; verify the status glyph alone spins and truthful progress remains below the header.
9. Verify durable completion returns to the check badge, with real freshness in details; verify failure/attention/disconnected treatments remain discoverable.
10. Check Full Library at 1440/1200/1024/800px and Side Panel at 480/360/320px; confirm right-cluster balance, no overlap and bounded disclosures.
11. Confirm search, filters, sorting, Reset View, rows, details, pagination and Privacy behavior are unchanged.
12. Check native reopen, slow authorization/network, reduced motion, 200% zoom and screen-reader reading order.

Nothing staged, committed or pushed; demo/ preserved. This is presentation implementation/evidence, not native visual approval or release completion.

---

# Historical initial surface-specific icon approval — 2026-10-07

The following report describes the earlier approved decision, when only Side Panel used icon-only presentation. Its design wording and 112/693/78 verification counts are historical; current behavior and follow-up evidence are above.

Implemented as a presentation change on main, starting at e117c06d874ece3f757ba8b829815fa311749dcf. Initial git status contained only unrelated untracked demo/. No stage, commit or push was requested or performed; demo/ is preserved.

## Result and component structure

Side Panel uses one row: brand, Connection status, Sync status, explicit Sync action, existing Privacy shield. Two 36px status controls match the existing icon-button border/background/hover/focus family. The header measures 54px at 480/360/320px; search starts at y=73px and first fixture result at y=311px. This recovers 37px versus D+.2's 91px header/search y=110/result y=348. Full Library retains its 64px wide header and descriptive account/read-only and phase/Updated fields; medium widths retain existing internal wrapping.

OptionsApp's existing surface==='sidepanel' selects compact presentation. ConnectedAccount and SyncStatus keep shared actual values, state derivation and structured disclosure content. StatusIcon composes a primary vector and tiny lower-right badge. HeaderStatusPlaceholder renders existing loading/pending/disconnected/mismatch/error observations without invented identity or completion. Disclosure retains native details/summary activation, outside dismissal, Escape and focus restoration, with optional icon-only styling/no chevron and native title tooltip.

The project uses its own dependency-free SVG Icon component, not Lucide. Exact local icon names: link (Link2-style), sync (existing RefreshCw-style), loader (LoaderCircle-style), unplug, check, warning and close. Connected uses cyan link plus a success dot; completed sync uses cyan refresh plus check; active sync spins only the refresh glyph, without a success badge. Failure uses an error badge, attention a warning badge, and never-synced/pending a muted refresh. Existing reduced-motion rules disable spinning. No new icon dependency, arbitrary palette or raster/emoji asset was added.

Compact accessible names contain actual connected channel/read-only semantics or actual phase and matching-success Updated time. Example fixture names are Connected as My channel — Read-only and Sync complete — Updated [formatted actual fixture time]. Native title tooltips remain concise. Account name/access and phase/Updated are visible on interaction. Only the actual phase is a live region, visually hidden in the compact header; freshness is not live.

The separate Sync action retains its existing start handler, disabled conditions and acknowledgement/refresh path. Its compact visible label stays Sync while its accessible name reports requesting/active state. Auth/OAuth, provider, sync services, storage, runtime lifecycle, eligibility/deadline fences, query/filter/Reset/list/pagination/detail behavior, Privacy action and timestamps are unchanged. No new state or cross-document cache was introduced.

## Files changed

| File | Purpose |
|---|---|
| src/options/OptionsApp.tsx | Surface-selected compact controls and existing observation-to-icon mapping |
| src/options/ConnectedAccount.tsx | Shared connection details; compact trigger and desktop connection glyph |
| src/options/SyncStatus.tsx | Shared actual phase/freshness/details; compact trigger and desktop sync glyph |
| src/options/StatusIcon.tsx | Local primary/badge composition and compact placeholders |
| src/options/Icon.tsx | Connection, disconnected, loader and warning vector paths |
| src/options/Disclosure.tsx | Optional icon-only trigger/title; native interaction retained |
| src/options/options.css | Single-row panel geometry and shared glyph/control styling |
| tests/unit/options-presentation.test.tsx | Six focused connection/sync presentation regressions |
| tests/e2e/options.spec.ts | Compact interaction/state/action test and updated responsive/remount/progress/lifecycle assertions |
| docs/product-spec.md | Approved surface-specific status contract |
| docs/engineering-spec.md | Shared component/presentation boundaries |
| docs/options-ui.md | Current layout/accessibility contract; earlier presentation marked historical |
| docs/acceptance-criteria.md | Revised AC-OPTIONS-005 |
| docs/verification-strategy.md | Current icon/header coverage and resize settling |
| docs/status-header-redesign.md | Evidence, limitations and current human smoke procedure |

## Automated verification

Final npm run verify completed with exit 0 on the corrected tree.

| Command | Final result |
|---|---|
| npm run verify:ui | 112 tests / 3 files passed |
| npm run lint | Passed, zero warnings in final pipeline |
| npm run typecheck | Passed in final pipeline |
| npm run test | 693 tests / 16 files passed |
| npm run build + npm run check:build | Production build and approved gate/identity/manifest/asset/artifact checks passed |
| npm run build:provider-validation + npm run check:provider-validation | Separate package build/checks passed |
| npm run test:e2e | All 78 Chromium tests passed |
| npm run verify | Passed, exit 0 |
| git diff --check | Passed |

Scope checks found no source changes in runtime/auth/provider/storage/sync/domain/query, LibraryBrowser, use-options-runtime, SyncProgress, dependency manifests/locks or build configs. Staged diff is empty. Branch/HEAD remain main / e117c06d874ece3f757ba8b829815fa311749dcf. Nothing staged, committed or pushed; demo/ preserved.

Six new presentation tests cover compact identity/access names and shared details, desktop descriptive glyphs, completed freshness, active/no-success-badge, later failure/prior-success separation and muted never-synced truth. The new browser test checks Tab order/focus, Space/Enter, Escape, shared details, one explicit SYNC_START, active/completed/failure/mismatch/disconnected/connecting/never-synced visuals and progress. Existing real-document remount, same-document lifecycle, security, local browsing and provider regressions remain.

Development evidence: strict typing initially caught the existing derived tone's widened string type; it now has an explicit unchanged literal-union type. Sandbox UI test runs failed opening temporary SSR files before presentation tests; the permitted outside-sandbox run passed. Responsive tests initially sampled geometry during viewport transitions; current checks wait for settled bounds. The first full run passed 75/78 browser cases; stale Side Panel inline-text expectations and a scoped connected-identity selector were corrected, preserving equivalent identity/freshness/access assertions. All three targeted reruns passed. These failures are not described as successful verification.

Current screenshots: ignored .output/status-header-{surface}-{width}.png and corresponding -header.png; active panel capture is .output/status-header-sidepanel-active.png. Geometry JSON is .output/status-header-measurements-{surface}.json. Maker visually inspected the 360px panel and 1440px Full Library fixture screenshots. These contain synthetic fixture data, not production account evidence.

## Manual production smoke — UNPASSED

Native human production smoke has not been performed. The automated extension-page checks do not establish native Chrome visual approval or a real-account Sync result. Use the exact generated package C:\Dev\likedex\.output\chrome-mv3; record Chrome version, date and actual results.

### Side Panel

1. Open Likedex Side Panel.
2. Confirm header is a single compact row.
3. Confirm visible order is approximately logo | connection-status | sync-status | Sync | existing security action.
4. Confirm there is no second account/sync text row.
5. Hover/focus both icon controls.
6. Open connection details and verify actual account/read-only information.
7. Open sync details and verify actual sync state and Updated timestamp.
8. Trigger Sync.
9. Confirm sync-status icon changes to active syncing state.
10. Confirm list content does not shift/thrash unnecessarily.
11. Confirm completed state returns correctly.

### Full Library

1. Open the full Likedex library.
2. Confirm descriptive statuses remain.
3. Confirm connection uses a connection-specific icon.
4. Confirm sync completion uses a sync-specific icon rather than a floating check.
5. Verify dropdown/details behavior still works.

Also test Side Panel at practical narrow width, including 320px; repeat native close/reopen, keyboard activation/dismissal, reduced motion, 200% zoom and screen-reader state/name reading. Real slow auth/network and Chrome panel animation remain human checks. Existing release gates remain separate; this report claims presentation implementation and automated evidence only.
