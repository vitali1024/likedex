# Handoff D+.2 corrective maker report — 2026-10-07

Historical D+/D+.1/D+.2 report. The 687/77 checkpoint and then-uncommitted status below are preserved with their dates; [current verification](agentic/capstone-verification.md) records the later 694/81 inventory and published corrective commits. Human exact-package/native toolbar acceptance remains pending.
Header integration and the focused runtime correction build on the uncommitted D+/D+.1 tree. Human exact-package/native Side Panel smoke remains **unpassed**. This is maker implementation/evidence, not release completion or independent review. Previous D+ (677/101/73) and D+.1 (679/103/75) results are preserved verbatim below.

## D+.2 starting state

Branch main; committed HEAD f573edb7363434385cdb231928927b45a29babc4. Branch/HEAD/status were checked before edits. D+/D+.1 were already modified and unstaged; their report was untracked. Unrelated demo/ was untracked and preserved. No reset/clean/stage/commit/push occurred.

Initial git status --short:

~~~text
 M docs/acceptance-criteria.md
 M docs/engineering-spec.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/verification-strategy.md
 M src/options/ConnectedAccount.tsx
 M src/options/LibraryBrowser.tsx
 M src/options/OptionsApp.tsx
 M src/options/SyncStatus.tsx
 M src/options/options.css
 M tests/e2e/options.spec.ts
 M tests/e2e/provider-validation.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/options-presentation.test.tsx
?? demo/
?? docs/handoff-dplus.md
~~~

## D+.2 recording diagnosis and deterministic proof

The handoff describes a human native Chrome recording. The accessible attachment directory contained only Pasted text.txt, so the maker did not watch or independently inspect the video. Native Close/Open can destroy/recreate an extension document; this differs from an existing document's retained visibility state. Fresh useOptionsRuntime starts library/auth at loading and starts companion LIBRARY_SNAPSHOT_GET/AUTH_STATUS_GET through createOptionsRuntime.

Inspection confirmed that eligibleSnapshot() starts authorize(), which already coalesces an authorizationCheck promise. AUTH_STATUS_GET instead returned validation-pending whenever that promise existed, conflating an ordinary companion check with true Sync-owned authorization. A library-first held-provider regression failed with authorized expected / validation-pending received. Auth-first ordering already passed after correcting a test-only ClientResult-envelope assertion.

A second deterministic regression held the companion IDB control read until the shared authorization write and library snapshot had completed. The old pending DTO then had current revision/context, arrived after ready library, and createOptionsRuntime invalidated that library because it had no retained authorized identity. The recorded states included unavailable, reproducing the described temporary failure through the actual coordinator/controller/repository code. An older pending-control revision can instead be rejected by the existing stale-response barrier and schedule auth recovery. The recording alone cannot identify which subtype occurred in every native cycle.

The corrected tests passed before header work. No unavailable UI was suppressed to make the runtime regression pass.

## D+.2 runtime correction and request counts

Only AUTH_STATUS_GET's early condition changed: syncAuthorizationPending returns the approved data-free pending DTO; an ordinary authorizationCheck falls through to await authorize()'s existing promise and returns the real result/control stamp. Both overlapping consumers share one inspection/provider operation. True Sync-owned pending snapshots/status and start/recovery remain covered unchanged.

| Tested request shape | Snapshot GET | Auth status GET | Service inspections | Provider requests | Successful-bootstrap recovery retry |
|---|---:|---:|---:|---:|---:|
| Direct overlapping cold companion pair, either arrival order | 1 | 1 | 1 | 1 | 0 |
| Fresh document/controller with cold worker and real revision subscriptions | 2 | 2 | 2 | 1 | 0 |
| Fresh document/controller in an already validated worker | 1 | 1 | 1 | 0 | 0 |

Before correction, the direct library-first pair still issued one snapshot and one auth request/one shared provider request, but auth returned synthetic pending instead of the successful result. The delayed-control surface regression entered false unavailable/recovery; its eventual timer-driven request totals were not measured and are not invented here. After correction, the deterministic successful surface cases above schedule no active 2000ms auth/library recovery timer. Ordinary deadline timers remain.

The cold worker's first authorization deadline persistence publishes a revision. Existing conservative dirty-read handling re-observes that revision, accounting for the second local pair/service inspection; the already-validated service result avoids another provider request. This justified 2/2 cold shape preserves lifecycle/revision policy rather than optimizing local read counts through new caching or weakened fences.

Generation/authEpoch/owner/deadline/backward-clock/retention/error barriers, schema/storage/provider logic, actual Sync-owned pending and same-document observation lifecycle remain unchanged. No persistent or cross-document UI cache, extra provider request, permission or dependency was added.

## D+.2 header integration

### Full Library

Normal hierarchy is header then library. Header DOM/reading order is brand, Account disclosure, Sync disclosure, Sync action, Privacy. Wide layout is one horizontal brand/status/actions composition; 1024/800 wrap statuses into a second internal row.

Account's whole cluster is the Connection details control, named Connection details for [channel], with an explicit Connected to YouTube. Read-only access. description, a small dot, trimmed title/fallback, visible Read-only and chevron. Long titles truncate in the compact trigger but retain full text/name in structured details. The old eyebrow, separate visible details action, cards and rail are gone.

Sync's whole state/freshness cluster is named Sync details. State and Updated time are separate span/time elements with CSS gap. Mirror count is intentionally absent from the normal closed header and remains in D+ structured Library snapshot facts and About library counts. No textual, hidden or pseudo-element punctuation joins header fields. Passive clusters are visually quieter than the separate Sync action. The Sync trigger references its separate phase/time elements as an accessible description, without concatenating new metadata text or making freshness live. Expanded strips use the distinct Sync progress and recovery region label.

### Side Panel and first paint

Semantic compact-app/surface=sidepanel chooses two internal rows regardless of temporary Chrome viewport width: brand/actions, then Account/Sync. The same header shell exists at first observable paint, with compact Checking connection and a muted pending Sync placeholder. Ready rows and Sync wait for the existing auth/library identity/context gate when companion auth is initially loading/pending; real errors retain their normal explicit rendering.

Five test-document destruction/remount cycles per surface, alternating companion reply order, retained stable header height (less than 2px change), no old status architecture, no false healthy unavailable and no ready-row/checking-auth combination. No post-success timer read occurred after advancing the fixture clock 2100ms.

These are actual extension URL page close/new-page remounts with semantic sidepanel composition, not continuous automation of native Chrome's panel document lifetime or open/close animation. Native smoke remains required.

### Before/after measured geometry

Measured from the existing D+.1 fixture before editing the header, then from the corrected fixture. Values are extension-document pixels. Search and first-result recovery use identical fixture/viewports.

| Surface / viewport | Before header top–bottom | After header top–bottom | Search before→after | First result before→after | Recovered px |
|---|---:|---:|---:|---:|---:|
| options 1440x900 | 12–71.8 | 12–76 | 155.8→87 | 245.8→177 | 68.8 |
| options 1200x800 | 12–71.8 | 12–76 | 155.8→87 | 297.8→229 | 68.8 |
| options 1024x800 | 12–71.8 | 12–109.8 | 215.8→120.8 | 357.8→262.8 | 95 |
| options 800x800 | 12–71.8 | 12–109.8 | 215.8→120.8 | 357.8→262.8 | 95 |
| sidepanel 480x800 | 8–63 | 8–99 | 242→110 | 480→348 | 132 |
| sidepanel 360x800 | 8–63 | 8–99 | 242→110 | 480→348 | 132 |
| sidepanel 320x480 | 8–63 | 8–99 | 242→110 | 480→348 | 132 |


The removed rail was 65px at wide Full Library, 125px at medium and 160px in Side Panel. New wide header is 64px; all requested Side Panel headers are 91px. Wide search/results recover 68.80px; medium recover 95px; Side Panel recover 132px. Search is 11px below the new header in each normal fixture.

Before/after JSON: .output/handoff-dplus2-before-*.json and .output/handoff-dplus2-measurements-*.json. Current captures: .output/handoff-dplus2-fixture-*.png. Maker inspected wide/narrow normal captures. These are synthetic fixture evidence, not production account or human visual acceptance.

## D+.2 exceptional states

Active header status preserves the actual phase/retry announcement; unchanged progress/scanned count/bar appears temporarily below header. The progress component stays mounted across active phases, and the strip disappears at durable completion. It has no second disclosure or duplicate live region.

Failure/partial/interrupted states retain readable errors, partial provenance and distinct prior success below header. Mismatch removes normal identity, exposes both IDs and blocked Sync in an alert; onboarding/privacy/Connect and real auth/library failures remain expanded and recoverable. Normal successful passive state has no reserved progress height.

## D+.2 files changed

| File | Purpose in this combined uncommitted tree |
|---|---|
| src/runtime/coordinator.ts | Ordinary AUTH_STATUS_GET joins the existing shared check; retain genuine Sync pending |
| src/options/OptionsApp.tsx | Stable integrated header, companion presentation gate and separate exceptional content |
| src/options/ConnectedAccount.tsx | Whole account disclosure trigger, connected description, quiet trust/name fields |
| src/options/SyncStatus.tsx | Shared truth/details derivation for header and temporary strip; no closed-header counts |
| src/options/Disclosure.tsx | Optional accessible trigger name/description; existing dismissal unchanged |
| src/options/options.css | Wide/semantic compact headers, first-paint geometry, quiet clusters, popup bounds; remove obsolete rail/account styles |
| tests/unit/runtime.test.ts | Arrival-order race, delayed-control false-unavailable, cold/warm counts and genuine Sync pending regression |
| tests/unit/options-presentation.test.tsx | Header no-count/structured-facts/field/live-region regressions; update account trigger markup |
| tests/e2e/options.spec.ts | True test-document remount traces, before/after geometry, header disclosures/active exceptions and migrated existing regressions |
| tests/options-harness/main.tsx | Test-only held companion release and DOM-state recording, no production imports |
| tests/e2e/provider-validation.spec.ts | Assert new accessible connected description and visible Read-only in header, retaining provider/security checks |
| docs/product-spec.md | Global status in header, closed-header count omission |
| docs/engineering-spec.md | Shared auth correction, header/strip modes and preserved fences |
| docs/acceptance-criteria.md | Header geometry/coherence and fresh-remount acceptance |
| docs/options-ui.md | Current header/bootstrap contract; mark D+.1 presentation historical |
| docs/runtime-lifecycle.md | Actual remount vs retained document, shared auth distinction and exact request shapes |
| docs/verification-strategy.md | Race/count/state/geometry coverage and native automation limits |
| docs/handoff-dplus.md | Current D+.2 evidence and exact manual smoke; preserve all older results |
| src/options/LibraryBrowser.tsx | Existing D+ availability/footer cleanup; untouched in D+.2 |

demo/ is unrelated and preserved.

## D+.2 tests and documentation

Five new runtime cases prove direct request ordering/coalescing, delayed IDB companion response safety, real cold revision subscriptions and fresh validated-worker counts. The genuine Sync-pending test now also asserts AUTH_STATUS_GET pending while snapshots remain blocked. Three new presentation cases cover count omission with retained exact facts, header phase versus expanded progress/live isolation, and truthful never-synced neutrality. Account expectations now inspect the whole disclosure summary and accessible connected description.

Two added browser tests trace five real document remounts each. Existing D+.1 geometry tests were superseded by integrated-header geometry/disclosure/semantic field checks at all seven required viewports. Existing structured D+ success/failure details, counts, centered pagination, thumbnail/focus, filter/Reset, progress, security and same-document lifecycle cases remain. Provider-validation assertions moved to the accessible description/Read-only summary, without weakening request receiver/gate/security checks.

Current normative docs changed: product-spec.md, engineering-spec.md, acceptance-criteria.md, options-ui.md, runtime-lifecycle.md and verification-strategy.md. This report preserves all historical D+/D+.1 automation evidence and checklists below.

Development failures are recorded rather than hidden: initial red race run included an incorrect test-only ClientResult operation-envelope assertion, corrected before the decisive red 2-fail/1-pass run. Header extraction briefly left a duplicate closing tag and required explicit nullable success guards. Initial TypeScript checks found a widened page.evaluate operation argument; the corrected boolean argument passed strict typing. The first complete browser pipeline passed 76/77, exposing a genuine left-edge Sync popover overflow at a medium width with a short active-status trigger. Medium/narrow header disclosures now use bounded fixed positioning; the six affected geometry/long-title/progress cases passed afterward. No sync state, pruning gate, provider or runtime failure test was weakened.

## D+.2 verification

Final authoritative `npm run verify` completed with exit 0 on this corrected tree. Counts below describe the current D+.2 tree; historical D+/D+.1 results remain unchanged below.

| Command | Final result |
|---|---|
| npm run verify:runtime | 102 tests / 3 files passed |
| npm run verify:auth | 97 tests / 2 files passed |
| npm run verify:ui | 106 tests / 3 files passed |
| npm run lint | Passed, zero warnings; also included in final verify |
| npm run typecheck | Passed; also included in final verify |
| npm run test | 687 tests / 16 files passed in final verify |
| npm run build | Production chrome-mv3 package built in final verify |
| npm run check:build | Production gate, identity, launcher isolation, manifest, canonical hashes and artifact checks passed |
| npm run build:provider-validation | Separate provider-validation chrome-mv3 package built in final verify |
| npm run check:provider-validation | Separate package checks passed in final verify |
| npm run test:e2e | 77 Chromium tests passed in final verify |
| npm run verify | All constituent checks above passed, exit 0 |
| git diff --check | Passed |

Focused browser runs also passed: 12 header/remount/progress/long-title cases before the full run exposed medium-width popup overflow, then all 6 affected geometry/long-title/progress cases after correcting popup bounds. The final 77-test run supersedes those narrower runs. Chromium execution required the permitted unsandboxed process launch after the runner's earlier sandbox EPERM; no production permission changed.

Scope inspection confirms no changes to auth/provider/storage/domain/query/observer/hooks, SyncProgress math, schemas, permissions, config, dependency manifests or locks. The runtime production diff is one condition plus explanatory comments. The staged diff is empty. Generated measurement JSON and captures remain under ignored .output/.

## D+.2 manual smoke still required

**UNPASSED.** Human production/native smoke is required. Record Chrome version, date, source/package state and actual outcomes. No fixture test establishes human approval.

Use exact generated production package:

C:\Dev\likedex\.output\chrome-mv3

### Full Library

1. Reload extension.
2. Open Full Library.
3. Confirm Account + Sync status are inside the main header.
4. Confirm there is NO separate normal status rail beneath header.
5. Confirm library starts noticeably higher than D+.1.
6. Confirm channel title readable.
7. Confirm Read-only visible.
8. Confirm connected meaning clear but quiet.
9. Confirm no raw channel ID.
10. Confirm Account cluster has subtle disclosure affordance.
11. Open Connection Details.
12. Confirm structured D+ content remains.
13. Confirm header/library do not shift.
14. Close with Escape.
15. Confirm focus restoration.
16. Confirm Sync status visible in header.
17. Confirm normal header does NOT show mirror count.
18. Confirm Updated timestamp visible.
19. Confirm no `·`, `|`, `/` metadata joining.
20. Open Sync Details.
21. Confirm mirror count and structured diagnostics remain there.
22. Confirm header does not resize.
23. Check at 1440px.
24. Check at 1200px.
25. Check at 1024px.
26. Check at 800px.
27. Confirm no overlap/overflow.
28. Confirm Sync action still visually distinct from Sync status.

### Side Panel

29. Open native Side Panel.
30. Confirm status is integrated into header immediately.
31. Confirm no large Account card.
32. Confirm no large Sync card.
33. Confirm no Full Library status rail.
34. Confirm search/results begin much higher.
35. Confirm Account cluster shows channel + Read-only.
36. Confirm Sync cluster shows state + freshness.
37. Confirm no mirror count in closed header.
38. Open Connection Details from cluster.
39. Open Sync Details from cluster.
40. Confirm neither expands the header.

### Side Panel reopen race

41. Close native Side Panel.
42. Reopen.
43. Watch entire bootstrap.
44. Confirm no flash of old large status UI.
45. Confirm no false Library unavailable.
46. Confirm no state where rows/Sync are ready but Account still says Checking authorization.
47. Repeat at least five times.
48. Confirm final header geometry is stable each cycle.

### Widths

49. Check Side Panel around 480px.
50. Check 360px.
51. Check 320px.
52. Confirm no horizontal overflow.
53. Confirm search/result area has materially more vertical room.

### Active/error

54. Start a real Sync if practical.
55. Confirm header shows active status.
56. Confirm truthful progress expands below header.
57. Confirm completion returns to compact header.
58. Verify failure fixture still presents readable error.
59. Verify owner mismatch remains explicit.

### Regression

60. Verify Filter Library Apply behavior unchanged.
61. Verify Reset view unchanged.
62. Verify D+ thumbnail centering unchanged.
63. Verify D+ row focus state unchanged.
64. Verify availability/footer cleanup unchanged.
65. Switch Full Library browser tabs repeatedly.
66. Confirm committed lifecycle retention remains unchanged.
67. Confirm no new permission prompt.


## D+.2 remaining risks

Native Chrome Side Panel document lifetime, slow real auth/network and Chrome open/close animation require exact-package human checking. Long localized channel names/timestamps, 200% zoom and screen-reader reading/announcement order remain unverified. Native lifecycle DOM could not be continuously inspected in this runner; remount simulations are explicitly limited evidence. A fresh independent auth/runtime review remains required before release; none is fabricated here. Data Controls/playback/demo/release work remains outside this correction.

## D+.2 Git state

Branch main; committed HEAD f573edb7363434385cdb231928927b45a29babc4, unchanged. Final git status --short:

~~~text
 M docs/acceptance-criteria.md
 M docs/engineering-spec.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/runtime-lifecycle.md
 M docs/verification-strategy.md
 M src/options/ConnectedAccount.tsx
 M src/options/Disclosure.tsx
 M src/options/LibraryBrowser.tsx
 M src/options/OptionsApp.tsx
 M src/options/SyncStatus.tsx
 M src/options/options.css
 M src/runtime/coordinator.ts
 M tests/e2e/options.spec.ts
 M tests/e2e/provider-validation.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/options-presentation.test.tsx
 M tests/unit/runtime.test.ts
?? demo/
?? docs/handoff-dplus.md
~~~

Nothing staged, committed or pushed; demo/ preserved. git diff --cached --name-only is empty. No native human production smoke or independent release review is claimed.

---

# Historical D+.1 and D+ reports — preserved

The following reports/results describe the prior implementations. Their normal status architecture is superseded by D+.2; the current human smoke procedure is above.

# Handoff D+.1 corrective maker report — 2026-10-07

This correction builds on the existing uncommitted D+ implementation. Human production smoke and visual acceptance remain **unpassed**. D+ historical results (677 unit / 101 focused UI / 73 Chromium tests) are preserved verbatim below; they do not describe the corrected tree.

## D+.1 starting state

Branch main; HEAD f573edb7363434385cdb231928927b45a29babc4. Before editing, branch, HEAD and status were checked. The D+ source/tests/normative docs were already modified and unstaged, its report was untracked, and demo/ was unrelated and untracked. This pass preserved that work; no reset, clean, stage, commit or push occurred.

Initial status:

~~~text
 M docs/acceptance-criteria.md
 M docs/engineering-spec.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/verification-strategy.md
 M src/options/ConnectedAccount.tsx
 M src/options/LibraryBrowser.tsx
 M src/options/OptionsApp.tsx
 M src/options/SyncStatus.tsx
 M src/options/options.css
 M tests/e2e/options.spec.ts
 M tests/e2e/provider-validation.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/options-presentation.test.tsx
?? demo/
?? docs/handoff-dplus.md
~~~

## D+.1 human-review diagnosis

The D+ information was truthful, but two independent bordered navy cards, 14px padding, 34px icon tiles, an account eyebrow, multiple chips, a 16px mirror metric and remote details actions made passive status compete with the library. Human review requested a shorter, quieter supporting rail before acceptance.

## D+.1 calm status rail implementation

Eligible authorized Account and Sync now sit in one navy surface with one subtle outer border, no exterior shadow and no nested card surfaces. At Full Library widths from 1100px, a 38%/62% grid uses one subtle vertical divider. Medium widths and Side Panel stack with one horizontal divider. Header/library gaps remain a compact 8px; reduced status height lifts the library controls.

Account uses a 26px inline local play icon, a 14px channel title/fallback, explicit muted Connected text with a small green dot and a subdued visible noninteractive Read-only label. The visible YouTube account eyebrow and bordered Connected badge are removed. Connection details sits beside the trust fields on wide screens and below them on narrow screens, retaining the same full channel ID/access definition rows.

Sync retains the 14px Sync complete headline and a muted inline check. The visible metric is [count] mirrored, still the durable local membership count including unavailable videos. Updated retains existing full date/time formatting. Metric and timestamp are separate paragraph/time elements grouped with CSS gap or stacking. Account title, Connected and Read-only are separate elements too. Neither normal group contains textual, hidden or CSS-generated punctuation separators. Details triggers have small text/chevrons and no button/pill chrome.

Only the Sync phase/retry headline is live-announced. No live region was added to the rail, account, statistics or freshness. Active Sync has no fixed height and retains the unchanged SyncProgress component/math/scanned count/retry. Failure/partial/interrupted content can grow, including errors, provenance warning and prior-success truth. Owner mismatch remains outside the compact rail with both IDs and blocked Sync; onboarding/auth failures stay separate.

Connection and Sync details remain floating, with native activation, Escape and focus restoration. Their content architecture and matching-success truth rules are unchanged. D+ Refreshed/estimate semantics, availability disclosure, footer pagination, selected/focus frame and centered responsive thumbnail remain intact. No production layout measurement or ResizeObserver was introduced.

Measured Chromium fixture geometry:

| Surface / viewport | Normal rail height | Library start Y |
|---|---:|---:|
| Full Library 1440x900 | 65px | 152.80px |
| Full Library 1200x800 | 65px | 152.80px |
| Full Library 1024x800 | 125px | 212.80px |
| Full Library 800x800 | 125px | 212.80px |
| Side Panel composition 480x800 | 160px | 239px |
| Side Panel composition 360x800 | 160px | 239px |
| Side Panel composition 320x480 | 160px | 239px |

These measurements use deterministic fixtures, not the real account/native Side Panel. Long titles and abnormal states may grow. Wide normal height satisfies the requested 56–68px range and 72px tolerance. Captures/measurement JSON are under ignored .output/handoff-dplus1-fixture-*.png and .output/handoff-dplus1-measurements-*.json.

## D+.1 files changed

| File | Purpose in the combined working tree |
|---|---|
| src/options/OptionsApp.tsx | D+.1 shared outer rail only for eligible authorized identity |
| src/options/ConnectedAccount.tsx | D+.1 modest title, explicit quiet connection/trust fields and nearby disclosure; preserve D+ structured content |
| src/options/SyncStatus.tsx | D+.1 shorter mirrored copy and distinct metadata elements; preserve D+ structured diagnostics/results |
| src/options/options.css | D+.1 shared surface/dividers, reduced spacing/icons, quiet triggers, responsive grouping; retain D+ detail/focus/media rules |
| tests/unit/options-presentation.test.tsx | D+.1 semantic separation/eyebrow/badge regressions and new metric copy; retain D+ truth tests |
| tests/e2e/options.spec.ts | D+.1 structural/computed-style/geometry/disclosure/exception checks and captures; retain D+ controls/details/focus/media coverage |
| docs/product-spec.md | Current shared rail, semantic fields and hierarchy |
| docs/engineering-spec.md | Current conditional rail, CSS geometry, live-region and scope contracts |
| docs/options-ui.md | Current D+.1 presentation contract replacing two normal cards |
| docs/acceptance-criteria.md | Shared rail/height/field separation/responsive/disclosure acceptance |
| docs/verification-strategy.md | Current structural/geometry coverage and unpassed smoke link |
| docs/handoff-dplus.md | This D+.1 report/checklist before the preserved historical D+ report |
| src/options/LibraryBrowser.tsx | Existing D+ availability/footer cleanup, untouched in D+.1 |
| tests/e2e/provider-validation.spec.ts | Existing D+ Connected/Read-only selector migration, untouched in D+.1 |
| tests/options-harness/main.tsx | Existing D+ long-title/media fixtures, untouched in D+.1 |

demo/ is unrelated, preserved and not part of the implementation.

## D+.1 tests

Two new unit cases assert separate metric/time paragraph elements outside the sole phase live region, explicit Connected/Read-only/title fields without the eyebrow or Connected chip, and absence of normal punctuation concatenation. Existing success-copy assertions were updated; mismatch tests now reject a metric element rather than only obsolete text.

Two new Chromium cases (one per surface) exercise all seven requested viewports, one shared rail/two semantic segments, no nested backgrounds/shadows/borders, divider orientation, transparent icons at most 28px, quiet Connected text, separate DOM metadata and absence of pseudo-element separators. Both disclosures preserve rail bounds, stay within the viewport, dismiss with Escape and restore trigger focus. Active progress can exceed 72px; later failure/prior success remains visible; mismatch exposes both IDs and disables Sync. Existing D+ details/count/pagination, long-title, focus, thumbnail, filters/Reset and lifecycle tests remain in the full suite.

Focused initial browser run passed the two new geometry cases but failed the older account-primary text assertion because the moved disclosure now belongs to that subtree, including hidden full-ID content. Corrected it to assert that the ID is hidden while closed; no data/truth expectation was weakened. The subsequent six-case D+.1/long-title run passed. Capture timing advances the test clock through disclosure closing transitions, so screenshots do not freeze a fading overlay.

## D+.1 verification

Final authoritative pipeline passed with exit 0 on 2026-10-07. Its exact scripts ran in this order:

| Command | Actual result |
|---|---|
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run test | PASS, 679 tests / 16 files |
| npm run build | PASS, .output/chrome-mv3 |
| npm run check:build | PASS, production identity/manifest/permissions/CSP/assets/composition checks |
| npm run build:provider-validation | PASS, separate diagnostic package |
| npm run check:provider-validation | PASS, unchanged production identity/permissions and fixture/secret exclusion |
| npm run test:e2e | PASS, 75 Chromium tests |
| npm run verify | PASS, exit 0 |
| npm run verify:ui | PASS separately, 103 tests / 3 files |
| npx playwright test tests/e2e/options.spec.ts --grep 'D\+\.1|D\+ long' | PASS during implementation, 6 focused cases |
| git diff --check | PASS |

The final pipeline includes the strengthened divider/icon/pseudo-element assertions and corrected capture timing. Maker inspected final wide/narrow captures: one quiet surface, no colored icon tiles, separate count/time fields, compact stacked rows and library controls beneath. Automated/fixture inspection does not establish human calmness, real account acceptance or native Side Panel smoke.

## D+.1 manual smoke still required

**UNPASSED.** Human visual acceptance and exact generated production-extension/native Side Panel smoke remain required. Use C:\Dev\likedex\.output\chrome-mv3 from this working tree. Record Chrome version, date, source state and actual results. Do not treat deterministic fixtures as human approval.
1. Reload the generated production extension.
2. Open Full Library at ~1440px.
3. Confirm Account + Sync now form ONE quiet shared status rail.
4. Confirm it is substantially shorter than current D+.
5. Confirm library begins visibly higher.
6. Confirm the rail does not visually dominate the page.
7. Confirm channel name is immediately readable.
8. Confirm `YouTube account` visible eyebrow is gone.
9. Confirm Connected meaning remains clear.
10. Confirm Read-only remains visible.
11. Confirm there is no large Connected badge.
12. Confirm Connection details remains discoverable.
13. Confirm Sync complete remains clear.
14. Confirm mirror count remains visible.
15. Confirm Updated timestamp remains visible.
16. Confirm mirror count and timestamp are NOT joined by `·`, `|`, `/`, or other punctuation.
17. Confirm they feel like separate visual elements.
18. Confirm Sync details remains discoverable.
19. Open Connection Details and ensure status rail does not jump.
20. Open Sync Details and ensure rail does not jump.
21. Resize to 1200px.
22. Resize to 1024px.
23. Resize to 800px.
24. Confirm layout adapts without cramping.
25. Open native Side Panel.
26. Inspect at 480px.
27. Inspect at 360px.
28. Inspect at 320px.
29. Confirm Account + Sync become compact stacked rows within one surface.
30. Confirm no horizontal overflow.
31. Confirm active Sync still has sufficient room for progress.
32. Confirm failure state remains readable.
33. Confirm owner mismatch remains explicit.
34. Confirm Filter Library C.1 behavior unchanged.
35. Confirm Reset view unchanged.
36. Confirm D+ thumbnail centering unchanged.
37. Confirm D+ row focus treatment unchanged.
38. Confirm availability/footer cleanup unchanged.
39. Switch browser tabs repeatedly and verify lifecycle retention unchanged.
40. Confirm no new permission prompt.

## D+.1 remaining risks

Human visual acceptance, long localized channel names, long locale timestamps, 200% zoom and screen-reader reading order/announcement quality remain unverified. Native Side Panel limits and actual production account appearance require human checks. Active/error states intentionally grow. No runtime/lifecycle, auth/provider/storage/domain/query/filter, SyncProgress, manifest/CSP/permissions/dependency/network changes were made. Playback and Export/Clear/Disconnect/Revoke remain later handoffs.

## D+.1 Git state

Branch/HEAD remain main / f573edb7363434385cdb231928927b45a29babc4. Final status:

~~~text
 M docs/acceptance-criteria.md
 M docs/engineering-spec.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/verification-strategy.md
 M src/options/ConnectedAccount.tsx
 M src/options/LibraryBrowser.tsx
 M src/options/OptionsApp.tsx
 M src/options/SyncStatus.tsx
 M src/options/options.css
 M tests/e2e/options.spec.ts
 M tests/e2e/provider-validation.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/options-presentation.test.tsx
?? demo/
?? docs/handoff-dplus.md
~~~

git diff --cached --name-only is empty. Nothing staged, committed or pushed; demo/ remains untracked and preserved. The modified path set is the same as at the D+.1 start. Scope inspection found no diff in runtime/lifecycle, auth/provider/storage/domain/query/filter/progress logic, manifest/build configuration or package/lockfile.

---

# Historical D+ report — preserved, superseded visually by D+.1

The following D+ report and its automated results/manual checklist describe the original D+ pass. The current correction and human smoke requirements are above.

# Handoff D+ maker report — 2026-10-07

Presentation implementation is ready for human review after the verification recorded below. Human production smoke and visual acceptance remain **unpassed**. This is not a release-completion claim.

## Starting state

- Branch: `main`.
- HEAD: `f573edb7363434385cdb231928927b45a29babc4`.
- Initial `git status --short`: `?? demo/`.
- The requested baseline matched. Existing `demo/` was preserved and no reset, clean, staging, commit or push was performed.
- The handoff explicitly authorized presentation implementation; the older specification-only AGENTS.md phase note was not used to block this later authorized work.

## Existing visual issues verified

ConnectedAccount rendered connected/read-only as one small sentence beside a 12px heading. SyncStatus joined status, count and date into one flex paragraph, and its disclosure repeated attempt/success values in paragraph sequences. Repository page ingestion increments updatedCount when an existing video is first encountered in a new attempt; it does not test for changed metadata. Provider canonical membership and repository seen sets are keyed by video ID. Accepted page counters are durable page-transaction checkpoints.

VideoDetail repeated the availability caveat for every selection. The footer duplicated the available/mirrored counts already in the counts disclosure. A selected cyan card border/glow and the global inner-button focus outline could produce two rectangular treatments. Large thumbnails were left-aligned with competing 540/640px width and 260/360px height caps; the narrow general list-thumbnail rule also applied to detail media after removing old overrides.

## Implementation

### Account card

Local play icon tile, secondary YouTube account label, primary trimmed channel title (YouTube channel fallback), and restrained Connected/Read-only text chips. Optional native Connection details uses definition rows for connected channel, access and the complete stable ID. Mismatch/loading/pending/onboarding/errors retain existing truth. Full Library uses two status columns from 1100px; medium widths and Side Panel stack with compact padding and wrapping.

### Sync card

One concise phase/retry live region, a state-appropriate icon tile, prominent durable liked-videos-mirrored membership count and secondary Updated timestamp. Active progress uses the unchanged SyncProgress implementation and derivation. Error/partial/prior-success conditions remain unchanged, and no-success is neutral. Statistics stay outside live announcements.

### Sync details

Status, Scan, Library snapshot, Changes and Timing use headings and definition lists in a compact responsive grid, with a 440px bounded disclosure and existing keyboard/dismissal behavior. Matching successful attempt ID, owner and generation combines attempt diagnostics with finalized success data once. Current attempts and earlier successful snapshots stay separate. With no attempt, durable success supplies page/raw/unique diagnostics without an invented provider estimate.

- Pages scanned: accepted pages of matching finalized success; Pages processed for other attempts.
- Memberships scanned: rawItems, including duplicate-video membership items.
- Unique videos observed: uniqueMembership, distinct video IDs.
- Provider estimate: retains `~`, or Unknown when absent.
- Refreshed: updatedCount, existing videos re-observed; no assertion that metadata changed.
- Removed: only a finalized success supplies this value, never a synthetic attempt zero.

No persisted field or counting/state/finalization semantics changed.

### Detail cleanup

Availability context appears once in About library counts, alongside available/mirrored counts and local-snapshot/exclusion meaning. Detail has no repeated disclaimer. Footer contains centered wrapping pagination only; page derivation and navigation are unchanged.

### Row states

Normal/hover retain existing restrained surfaces. Selection uses navy/cyan tint, a muted border and left inset accent. Primary keyboard focus uses one 2px card frame via `:has(> .video-row:focus-visible)`; the inner button outline is suppressed only with this replacement. Selected plus focused retains tint and one frame. Mouse follows Chrome focus modality. Copy/Open/View details retain their own global focus rings and do not activate primary-card focus.

The results scroller disables browser scroll anchoring so the taller status composition does not override the existing Reset view scroll reset. Reset/query/filter/navigation code is unchanged.

### Thumbnail

One responsive `width: min(100%,640px)`, 16:9 aspect and automatic horizontal margins. Full-image `object-fit: contain`, decorative empty alt, trusted origin, lazy loading, fallback and badge remain. Independent height caps were removed; the 104px narrow list-thumbnail rule now explicitly excludes large thumbnails. No JavaScript layout measurement was added to production.

## Files changed

| File | Purpose |
|---|---|
| `src/options/ConnectedAccount.tsx` | Account hierarchy, text chips, structured full-ID disclosure |
| `src/options/OptionsApp.tsx` | Presentation-only status-overview wrapper |
| `src/options/SyncStatus.tsx` | Card hierarchy and semantic nonduplicated Sync detail groups |
| `src/options/LibraryBrowser.tsx` | Relocated availability explanation; removed duplicate footer counts |
| `src/options/options.css` | Responsive cards/details, selection/focus, centered pagination/media, obsolete-style removal and anchoring correction |
| `tests/unit/options-presentation.test.tsx` | Updated copy/markup assertions and eight new structured-presentation tests |
| `tests/e2e/options.spec.ts` | Eight new browser cases, updated semantic selectors and existing regression coverage |
| `tests/e2e/provider-validation.spec.ts` | Two existing connection-success assertions migrated to visible Connected/Read-only chips; provider/security checks unchanged |
| `tests/options-harness/main.tsx` | Test-only long-account-name and thumbnail cases |
| `docs/product-spec.md` | Current account/Sync/detail-polish product contract |
| `docs/engineering-spec.md` | Current presentation mapping/layout/accessibility contract |
| `docs/acceptance-criteria.md` | AC-SYNC-015, AC-OPTIONS-005, AC-A11Y-007 |
| `docs/options-ui.md` | Current D+ contract, retaining historical handoff evidence |
| `docs/verification-strategy.md` | Presentation/browser coverage and manual-evidence boundary |
| `docs/handoff-dplus.md` | This report and exact unpassed human checklist |

## Tests

Eight new static tests cover coherent successful sections/approximate estimate/Refreshed/one live region, separate owner/generation mismatches, no-attempt success, active retry/current-versus-previous success without fake removals, later failure/prior success, neutral no-success, and relocated availability/footer semantics. Existing account tests retain missing-title/full-ID/read-only assertions; progress math tests are unchanged.

Eight new Chromium cases (four per surface) cover cards/disclosures/full-ID/focus restoration, success/failure grouping, counts and centered functional pagination; mouse/primary/selected/secondary focus styles; thumbnail full intended width/center/ratio/image/badge containment at every requested width plus portrait-image containment and failed-image fallback; long-title wrapping and bounded disclosures/mismatch. Existing active progress, reduced motion, filters, Reset, lifecycle/security barriers, launcher, shell and provider-validation cases remain required.

Fixture images are intercepted synthetic resources in the isolated Options test composition. No personal mirror, new production request or production fixture import is involved.

## Documentation

The five normative documents listed above now describe the current presentation contract. Historical B/C/C.1/lifecycle evidence and counts remain historical. This report records D+ separately.

## Verification

Final authoritative `npm run verify` exited **0** on 2026-10-07: **677 unit tests across 16 files**, **73 Chromium E2E tests**, no skipped tests, and both package build/check pipelines passed.

| Command | Final result |
|---|---|
| `npm run lint` | PASS, including final authoritative invocation |
| `npm run typecheck` | PASS, strict TypeScript |
| `npm run verify:ui` | PASS, 101 tests across 3 files |
| `npm run test` | PASS, 677 tests across 16 files |
| `npm run build` | PASS, final production package at `.output/chrome-mv3` |
| `npm run check:build` | PASS, production identity/manifest/CSP/permissions/assets/composition gates |
| `npm run build:provider-validation` | PASS, separate diagnostic package |
| `npm run check:provider-validation` | PASS, identity/permissions/fixture/secret-exclusion gates |
| `npm run test:e2e` | PASS in final authoritative pipeline, 73 Chromium cases |
| `npm run verify` | PASS, exit 0 |
| `git diff --check` | PASS |

Focused final checks already passed: `npm run lint`, `npm run typecheck`, `npm run verify:ui` (101 tests in 3 files), and the 13-case Chromium D+/Reset/Date-basis/failure regression run. Production build/check passed during implementation; the authoritative pipeline rebuilds both packages from final source.

Development failures were recorded honestly: the restricted browser launch returned spawn EPERM; permitted outside-sandbox execution ran Chromium. Initial unit assertions needed the new copy/structured markup, strict optional props and React array keys needed correction. Browser setup initially targeted a hidden label and a page-two fixture video. Visual review found the narrow detail-width override and strengthened width assertions. The first full E2E run passed 70/73, revealing a covered Date heading target, an ambiguous Sync failed text selector and Reset scroll anchoring. Targeted corrections passed all 13 affected/new cases. The first authoritative pipeline then passed 71/73 browser cases: its rebuilt provider-validation package exposed two old inline connected-text assertions, migrated to the new visible Connected/Read-only chips. Provider/native-fetch/no-write/gate/security assertions were unchanged. No Sync/runtime/storage test or invariant was weakened.

Ignored fixture captures under `.output/handoff-dplus-fixture-*.png` include wide/stacked cards, open Connection/Sync details, mouse-selected/keyboard-focused rows and detail media at 1440/1200/1024/800 or 480/360/320px. Maker visually inspected wide/narrow cards/details, row focus and media, including the corrected 320px full-width media. These are automated fixture previews, not human visual approval or native Side Panel evidence.

## Manual smoke still required

**Unpassed.** Use `C:\Dev\likedex\.output\chrome-mv3` from this working tree. Record Chrome version, date, source state and actual outcomes. Do not treat fixture screenshots as production smoke.

### Account

1. Reload extension.
2. Open Full Library.
3. Confirm normal account area now looks like a designed card rather than plain inline text.
4. Channel title is visually primary.
5. Connected and Read-only are clear but restrained.
6. Raw channel ID is NOT visible normally.
7. Open Connection details.
8. Confirm full channel ID and access state remain available.
9. Close it and verify keyboard/focus restoration.

### Sync summary

10. Confirm successful Sync area looks like a complementary status card.
11. Success icon/status has clear hierarchy.
12. Mirrored-library metric is prominent but not oversized.
13. Updated timestamp is secondary.
14. Sync details affordance is obvious.

### Sync details

15. Open Sync details.
16. Confirm it no longer looks like a paragraph/debug dump.
17. Scan, Library, Changes and Timing information are visually grouped.
18. Confirm there is no duplicated current-success/latest-success block.
19. Confirm Refreshed is used instead of misleading updated wording.
20. Confirm provider estimate still shows `~`.
21. Check keyboard navigation and Escape/dismissal.

### Video detail

22. Select several videos.
23. Confirm repeated availability disclaimer is gone from detail.
24. Open About library counts.
25. Confirm availability explanation exists there once.

### Footer

26. Scroll to results footer.
27. Confirm repeated available/mirrored count text is gone.
28. Confirm pagination looks intentionally centered/balanced.
29. Navigate pages.

### Row focus

30. Mouse-select a row.
31. Confirm selected state is clear.
32. Navigate rows by keyboard.
33. Confirm one clear focus frame.
34. Confirm selected + focus does not produce double cyan rectangles.
35. Tab to Copy/Open.
36. Confirm action focus does not falsely focus entire primary row.

### Thumbnail

37. Inspect large detail thumbnail at wide Full Library.
38. Confirm centered.
39. Resize approximately to 1440, 1200, 1024 and 800px.
40. Confirm centered/16:9/unclipped.
41. Open Side Panel.
42. View detail at approximately 480, 360 and 320px.
43. Confirm centered thumbnail and no horizontal overflow.
44. Confirm duration badge remains inside thumbnail.

### Regression

45. Open Filter Library and verify C.1 staged Apply behavior unchanged.
46. Verify Reset view unchanged.
47. Switch browser tabs repeatedly and verify lifecycle-retention fix unchanged.
48. Verify Sync button/progress unchanged.
49. Verify launcher unchanged.
50. Confirm no new permission prompt.

## Remaining risks

Human visual acceptance, real long channel names, locale/date length, 200% zoom, screen-reader reading order/announcement quality, real unusual thumbnails and native Chrome Side Panel limits still need human checking. Synthetic portrait/failure fixtures and bounding boxes are useful but do not establish real-account appearance or playback. Playback, Export, Clear and Disconnect/Revoke remain separate handoffs. No runtime/lifecycle/storage/provider/domain/query/manifest/CSP/dependency or permission changes were made.

## Git state

Branch and HEAD remain `main` / `f573edb7363434385cdb231928927b45a29babc4`. All D+ source/test/document changes remain unstaged; this report is untracked. `demo/` remains untracked and preserved. Nothing was staged, committed or pushed. Exact final status is recorded after verification below.

```text
 M docs/acceptance-criteria.md
 M docs/engineering-spec.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/verification-strategy.md
 M src/options/ConnectedAccount.tsx
 M src/options/LibraryBrowser.tsx
 M src/options/OptionsApp.tsx
 M src/options/SyncStatus.tsx
 M src/options/options.css
 M tests/e2e/options.spec.ts
 M tests/e2e/provider-validation.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/options-presentation.test.tsx
?? demo/
?? docs/handoff-dplus.md
```

`git diff --cached --name-only` is empty. Scope check showed no diff in runtime/lifecycle, storage/provider/domain/query, SyncProgress/progress derivation, manifest/build configuration or package/lockfile.
