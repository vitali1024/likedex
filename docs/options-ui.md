# Phase 7 Options library UI

Maker implementation on clean committed Phase 6 baseline `826f546`. Options uses real Phase 6 runtime messaging; this document does not record human UX approval, independent review, live OAuth/provider success, or release acceptance. Work is left unstaged/uncommitted for human review. Phase 8 has not begun.

Subsequent release evidence, **2026-10-04**: [live provider validation COMPLETE / APPROVED](release/live-provider-validation.md); **production Sync gate ENABLED; first real synchronization smoke STILL PENDING**. The human accepted the successful non-destructive observation as satisfying the provider-validation prerequisite and separately authorized the gate transition. Existing Options code already renders active/successful sync; no Options implementation or layout change was needed. The Phase 7 maker record below, including its pending/untouched live-checklist statements, is historical. No Phase 8 work is included.

## Files changed

| Files | Purpose |
|---|---|
| `entrypoints/options/main.tsx` | Replace Options placeholder with real runtime client/UI |
| `src/library/query.ts` | Pure available-only search/filter/sort/page and validated URL functions |
| `src/options/OptionsApp.tsx` | Connection, agreement/privacy notice, sync/status/error composition |
| `src/options/use-options-runtime.ts` | Integrate observer/auth status, revision, visibility and disposal guards |
| `src/options/LibraryBrowser.tsx` | Toolbar, filters, list, pagination, persistent/focused detail, links and clipboard |
| `src/options/presentation.ts` | Fixed typed error/status labels and metadata formatting |
| `src/options/options.css` | Responsive light/dark styling, focus and reduced motion |
| `wxt.config.ts`, `scripts/check-build.mjs` | Restrict/verify thumbnail image CSP; permissions and gate unchanged |
| `tests/unit/library-query.test.ts`, `tests/unit/options-presentation.test.tsx` | 29 added query/presentation tests |
| `tests/fixtures/options.ts` | Explicit synthetic Options fixtures |
| `tests/options-harness/main.tsx`, `tests/options-harness/options.html` | Separate test-only React/runtime composition |
| `tests/e2e/options.spec.ts`, `tests/e2e/shell.spec.ts` | Six Options browser tests and updated production first-run smoke |
| `package.json`, `README.md`, `docs/options-ui.md` | Focused UI command, current status, behavior and traceability |

## Composition and state

`entrypoints/options/main.tsx` mounts `OptionsApp` with the real `RuntimeClient`. `useOptionsRuntime` uses `LibraryObserver` for coherent snapshots, revision invalidation, deadlines, serialized reads and two-second active-attempt observation. Auth status is a separate loading/ready/unavailable resource, with out-of-order and revision guards. Authorized connection identity must match the current snapshot generation/auth epoch. Owner mismatch is presented from the runtime auth result even though the runtime blocks its library snapshot.

Mount, focus and visibility resume pass through the observer. Hidden pages discard rendered Authorized Data and dispose their observer; returning creates a fresh observer and read. Subscriptions, timers and late replies are detached/ignored on unmount. Idle snapshots do not poll. Only pending authorization status uses a short bounded-per-read observation timer; it stops when a terminal status arrives or the surface hides/unmounts. The runtime retains responsibility for bounded authorization work. Row/detail actions check the snapshot deadline before selection, opening or copying, including when an opportunistic timer is delayed. Pending clipboard results cannot announce success after detail disposal.

`LibraryBrowser` keeps query, page and selection in surface memory, keyed by generation/auth epoch. Query logic is pure in `src/library/query.ts`; it imports domain types only. Presentation helpers map allowlisted errors, dates, durations and attempt phases. React escapes all provider text. Thumbnail failures preserve text and show a decorative placeholder; both the UI and production CSP restrict image origins to `https://i.ytimg.com` (plus extension-owned CSP images).

## Connection and privacy

First run explains read-only access, local mirroring, local ordinary browsing, retention and later revocation. A versioned agreement (`likedex.privacy-agreement`, `phase7-v1`) is saved in extension-origin localStorage before enabling connected UI or explicit Connect. It contains no account/video/token data. Storage failure prevents acceptance/Connect and remains visible. Phase 9 must include this preference in Clear’s preference cleanup.

Only pressing Connect invokes `AUTH_CONNECT`. It has its own pending state, followed by refreshed authoritative status or a typed error. Passive reads never request interactive consent. Displayed identity uses the returned YouTube channel name when supplied and the stable channel ID; there is no token/profile fabrication. A mismatch displays both channel IDs, blocks Sync, and explains that owner replacement belongs to later confirmed Settings controls. No mirror mutation is performed by the UI.

A bundled, accessible build-specific privacy notice is linked persistently from the header, with Google Privacy Policy, YouTube Terms and Google account-permissions links. It describes existing behavior and labels planned Clear/Disconnect controls as unavailable in this build. **Public hosted Likedex policy/support pages and final legal/release disclosures remain pending**, as already recorded in release documents; no URL, publication or legal approval is invented.

## Local query contract

- Available-only primary list; results, available-video count and mirrored membership count are distinguished.
- Search only title/channel title. NFKC Unicode normalization, `toLowerCase()`, trim, whitespace-separated terms; every term must occur across the combined fields. No fuzzy library or remote search.
- Search and filters combine with AND. Stable channel IDs selected in the native multi-select combine with OR. None selected means all channels.
- Duration: `<240`, `>=240 && <1200`, `>=1200` seconds. Null duration fails active duration filters.
- Inclusive From/Through date-only inputs use explicit Liked or Published basis. Local midnight through the next local calendar midnight forms a half-open comparison interval, including DST’s 23/25-hour days. Invalid/reversed ranges match nothing; reversed ranges have an inline explanation. Unknown dates fail the active date filter. Publication never substitutes for date liked.
- Clear filters retains search. Clear search and filters resets both.
- Seven sorts: liked newest/oldest, published newest/oldest, duration longest/shortest and title A–Z. Default liked newest. Unknown values always last; equal values resolve by video ID ascending. Title order compares normalized strings with JavaScript code-unit `<`/`>` instead of device-dependent collation; empty titles are presented/sorted as unknown.
- Page size 50, no virtualization. Query/filter/sort changes reset page 1. A committed update retains a valid page and clamps an invalid one. Zero results keeps page 1 and disables navigation.
- Selection persists by video ID across pages and eligible updates within the current result set. Filtering/removal/ineligibility clears it with a notice. Generation/auth-epoch changes reset the library view. Failure clears selected IDs/channel choices and provides no stale actions.

## Details, synchronization and failure truth

Wide Options uses list plus persistent selected detail. Detail includes full title, channel, known liked/publication dates and duration, known description, observed availability disclaimer, direct YouTube link and Copy link. Missing values remain explicitly unknown. Links require canonical 11-character video IDs and use `https://www.youtube.com/watch?v=…`. Clipboard success is announced only after `writeText` resolves; rejection remains visible. No extra clipboard/tabs permission is used.

Sync invokes only explicit user `SYNC_START`; no provider or sync service is imported into the UI. A successful start acknowledgement is runtime truth, followed by independent snapshot observation. Lost replies are resolved by fresh observation without automatic mutation replay. The approved production gate now reaches existing auth/sync preconditions and start behavior. Disabled/missing/malformed gates still return **provider-validation-required** and display that no sync started. The gate transition requires no Options code or layout change; existing active/success presentation remains authoritative.

The UI renders preparing/checking, scanning, applying, finalizing, success, partial, interrupted and failure from durable attempt state. Accepted page/unique membership counts are shown without a completion percentage. Last successful sync remains separate and visible after a later ordinary failed attempt while eligible. Revision provenance can label a partially updated mirror even across successive attempts. Cleanup uses its actual data-free reason, never a claim that remote likes changed.

Loading auth, snapshot loading, Connect pending, start pending and active sync are separate. No authorization, authorized never-synced, valid empty mirror, no available membership, zero matches, snapshot failure and status failure have distinct presentation. Failed runtime reads cannot produce a valid zero count, idle state or disconnected status. Retry controls refetch truth; typed errors are mapped to fixed readable messages without stacks/provider bodies.

## Accessibility and responsive behavior

Native buttons, links, labels, search/date inputs, selects, details/summary and pagination provide ordinary keyboard operation. Rows are semantic selection buttons with `aria-pressed`; no interactive action is nested in a row button. Thumbnails have empty alt because adjacent text identifies each video. Visible focus, logical source/tab order, polite major status/copy announcements and readable alert errors are provided. Page/item progress is outside the status announcement, avoiding per-item chatter. `/` focuses search unless an input, textarea, select or editable field is active or a modifier is held.

At 760px and below, selecting a row reveals focused detail with Back. Back preserves query/page/selection and restores the selecting row’s focus or the results region if that row is gone. Invalidation returns to the results region when prior focused detail has disappeared. Controls wrap; the grid has no fixed minimum width. Browser checks cover 1200/800/600/360px, open filters at 360px, selected detail, Back focus/page context and reduced-motion mode. Light/dark colors follow the browser scheme. Nonessential transitions/animations are removed for reduced motion. Native Chrome/200% zoom/screen-reader human checks remain later hardening/release evidence; no formal accessibility conformance is claimed.

## Tests and acceptance traceability

No dependency was added. Vitest handles pure queries and static React presentation. Playwright builds `tests/options-harness/` with WXT’s already pinned Vite dependency into **`.output/options-test-composition`**, copies the real approved background, and identifies the copied manifest as a test composition. The injected runtime transport lives exclusively under tests. Its Sync request reaches the actual production background, whose real storage remains disconnected despite Options-only fixture identity; the ordinary auth failure preserves the fixture view. No test gate/fixture provider is injected into that background. Production build/lint restrictions remain intact.

| Acceptance | Phase 7 evidence | Limits |
|---|---|---|
| AC-AUTH-001–003 | Production first run; separate component/browser agreement, explicit Connect, no auto-Connect, denial and retry, agreement-storage failure | No live OAuth/scope consent evidence |
| AC-IDENTITY-003/004 | Both mismatch IDs, blocked Sync, inaccessible library, no UI clear/merge | Confirmed replacement/Keep actions remain later work |
| AC-PRIVACY-005 | Bundled build notice, recorded agreement, persistent policy/service links | Hosted public pages/final disclosures pending |
| AC-LIBRARY-001–005 | Available-only query, all-term Unicode search, AND/OR filters, exact duration boundaries, explicit inclusive dates/DST, all seven unknown-last/tie sorts; browser query controls | No real-provider observation |
| AC-LIBRARY-006/007 | 50-row bound, query reset, update clamp, detail selection/clearing, page-context/Back | Later cross-surface interactions pending |
| AC-LIBRARY-008/009 | Validated canonical href, exact copied URL, clipboard rejection, intentional unknowns/decorative thumbnail fallback | Actual user-opened playback/real clipboard and offline thumbnail smoke remain manual |
| AC-LIBRARY-010 | Deterministic 3,000-record query; 20 warmed runs, P95 under 200ms; bounded rendered page | Local benchmark, no universal-device performance claim |
| AC-OPTIONS-001/002 | Wide persistent detail and narrow focused detail/Back, unclipped controls | Settings portion of AC-OPTIONS-001 excluded in Phase 7 |
| AC-SYNC-005/007/011/013 | Every durable state presentation; active polling/idle no-poll; prior success plus later failure; snapshot failure and actual approved production auth precondition after explicit click | First real production sync smoke pending |
| AC-DATA-014 | Missed notification/expired cached view, action deadline gate, focus/visibility integration | Export/complete data-control UI remain Phase 9 |
| AC-A11Y-001/003/004 | Semantic labeled controls, slash/Tab/native activation, detail focus/Back, copy/status/error messages, responsive/reduced-motion browser paths | Side Panel/Settings/dialog portions and manual screen-reader/zoom audit pending |
| AC-VERIFY-001/003 | Full authoritative maker verification; separately identified fixture composition; inspected production bundle | No independent review/release/package approval |

No Side Panel, Settings/data-action, production pruning validation, Store publication, OAuth verification approval or full release criterion is claimed.

## Maker verification

Reference desktop: Windows, Intel Core Ultra 9 285H, Node 24.19.0, npm 11.17.0. On 2026-10-04, the explicit verbose benchmark reported **2.14ms P95** over 20 warmed runs for a 3,000-record title/channel search + duration filter + title sort. DST tests exercise America/New_York spring/fall boundaries, restoring the process timezone afterward.

Final authoritative `npm run verify` exited **0** on 2026-10-04, with **408 unit tests across 12 files** and **7 real Chromium browser tests**. The loaded production extension ID remained `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`. Production artifact checks passed, including the stricter image CSP and absence of fixture/development/secret artifacts.

| Requested command | Result |
|---|---|
| `npm run lint` | PASS, no lint warnings |
| `npm run typecheck` | PASS, strict production/test checking |
| `npm run test` | PASS, 408 tests in final verify |
| `npm run verify:sync` | PASS, unchanged 225 tests |
| `npm run build` | PASS, production MV3 |
| `npm run check:build` | PASS, OAuth/Store identity, minimal permissions, CSP and artifacts |
| `npm run test:e2e` | PASS, 7 tests in final verify |
| `npm run verify` | PASS, full authoritative command exited 0 |
| `npm audit` | PASS, 0 vulnerabilities; no audit fix |
| `git diff --check` | PASS; all intended work remains unstaged/uncommitted |

Wide/narrow screenshots were inspected from `.output/phase7-options-wide.png` and `.output/phase7-options-narrow.png`. These are **fixture-backed test composition previews**, not real-account evidence or production mock data.

No audit fix, staging or commit is performed. The initial restricted Chromium launch returned `spawn EPERM`; permitted outside-sandbox execution ran the real suite. Restricted audit registry/cache access failed; after confirming all 428 lockfile resolutions are public registry packages with no private/linked packages, permitted audit returned **0 vulnerabilities**. Actual warnings include Playwright NO_COLOR/FORCE_COLOR and Git LF-to-CRLF notices. Browser checks exposed and corrected checkbox focus loss and ambiguous filter labels; strengthening the auth revision guard also required the test adapter to advance its auth stamp consistently. No sync test/pruning expectation or existing specification was weakened. No spec contradiction or product blocker was found. Public release disclosures, human UX review, independent review, live OAuth/provider evidence and release gates remain pending.

Production pruning remains disabled (`PRODUCTION_PROVIDER_VALIDATION_APPROVED = false`), and `docs/release/live-provider-validation.md` remains untouched/PENDING. No backend, token persistence, production fixture switch, new permission, Side Panel product UI or Settings/data-action UI was added. Prior commits remain unchanged. Suggested human commit: `feat: build Likedex Options library experience`. Next phase after review/commit: **Phase 8 — Side Panel Compact Experience**, maker **GPT-6.1 Sol, High**. Do not begin it as part of Phase 7.
