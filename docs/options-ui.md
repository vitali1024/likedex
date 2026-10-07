# Options and Side Panel library UI

## Current presentation, amended 2026-10-07

### Same-document lifecycle contract, 2026-10-07

Full Library and Side Panel retain their own eligible library/auth observations while hidden; visibility alone publishes no loading state and does not remount the library. Revision subscriptions survive; surface polling/auth timers pause. Conditional focus/visibility resume synchronously enforces deadline, clock and context guards before reuse. Idle unchanged eligible data needs zero reads; active Sync uses one catch-up snapshot while retaining rows/Sync metadata. Same-context hidden revisions defer/coalesce; changed generation/auth epoch immediately fences library and identity even while hidden. Explicit refresh/retry still forces authoritative reads. First mount and actual discard/reload still show truthful initial loading. Query/filter/sort/page/selection/detail/scroll, committed chips and eligible filter drafts survive ordinary switches. No separate Sync/identity cache or persistent Authorized Data cache is added.

Sync status derives from `library.snapshot.sync`; the former `Loading sync status…` flash was a consequence of discarding the library observation, not loss of independent Sync truth. The hook now binds the testable document-local controller in `src/options/runtime.ts`. See [implementation, evidence, automation limits and unpassed human smoke](lifecycle-retention-fix.md). This current contract explicitly supersedes the historical Phase 7 hidden-disposal paragraph below; historical counts and evidence remain unchanged.

### Handoff C.1 library-control contract, 2026-10-07

This is the current contract and supersedes Handoff C's immediate filtering, nested channel expansion, native single-select menus, value-count badge and removal of Reset.

Filter library opens a single fixed-width, bounded working surface immediately. Direct Channels heading/All channels or N selected summary, labeled local search and native checkbox rows use a fixed internal scrolling list; the body scrolls separately from reachable footer actions. No nested channel trigger or expansion remains. Each opening copies committed channels/dateBasis/from/to into an ephemeral draft. Searching, checking channels and editing dates leave committed result count, rows, page, chips, badge, selection and detail unchanged. Apply filters validates and commits all four fields in one query update, resets page 1 and closes. Escape, outside dismissal or closing the trigger discards; reopening copies current committed values. Invalid/reversed dates show the accessible inline error and disable Apply.

Clear (accessible name Clear channels) edits only draft channels. Panel Clear filters restores draft channels/dateBasis/from/to to INITIAL_QUERY, preserving separate main search, Duration and Sort. The stable Filter library trigger reserves indicator space and counts committed active groups: selected channels = 1, date range = 1 (maximum 2). Channel summary counts selected IDs; stable-ID OR and [] = all, local search/hidden selections, title/fallback labels and exact-ID collision disambiguation remain unchanged. Committed chips can still be removed immediately outside the panel.

Dependency-free SingleSelect supplies Duration, Sort and Date basis with a button and themed listbox/options, one existing chevron, selected aria-selected/check/tint, neutral hover and cyan outlined keyboard active state. Opening activates the current selection; arrows/Home/End navigate, Enter/Space select/close/restore focus, Escape dismisses/restores, Tab exits without trapping, and outside clicks dismiss. Native manual popovers enter the top layer without reflow, remain viewport-contained and at least trigger width. Toolbar ownership allows one sibling floating control; the nested Date basis menu preserves the draft and geometry. First Escape closes Date basis, second cancels Filter library. Native date inputs remain.

One resetView path resets the complete LibraryQuery, page 1, selected video, detail route, notice, scroll, draft search and open popovers. Secondary Reset view (title: Reset search, filters, sort and current view) remains reachable on narrow toolbars and focused detail routes; disabled at the initial view without selection. It changes no mirror, account, authorization, privacy agreement, Sync metadata or outside preferences. Eligibility/unavailability removes draft controls and stale channel data; generation/auth-epoch barriers remain authoritative. Pure query/DST/unknown/tie rules, Handoff A/B, provider/auth/storage/sync/network/permissions and dependencies are unchanged.

#### Handoff C.1 maker verification, 2026-10-07

Starting state: main at 97ee934ebf1e676c461ce2ed519b312627ed1359, with Handoff C unstaged/uncommitted and pre-existing demo/ retained. Human-reported production smoke identified two coupled causes: nested inline channel expansion increased the outer panel height, and immediate committed filtering changed videos/chips/page/selection underneath the open editor. C.1 removes both interactions.

Final npm run verify exited 0: lint, strict typecheck, **647 unit tests across 15 files**, production build/check, separate provider-validation build/check and **54 Chromium E2E tests**, with no skips. Individually requested npm run lint, npm run typecheck, npm run verify:ui (**93 tests across 3 files**), npm run test:e2e (**54**), npm run build and npm run check:build passed; git diff --check passed. A focused Options browser run passed all 42 cases before the final pipeline. The final browser run additionally verifies native channel Tab/Space and slash isolation, observed count mutation exactly once after combined Apply, and Reset focus/scroll restoration.

Coverage compares committed results/page/chips/selection/detail/badge while drafting, tests all three cancel paths and scoped Clear actions, and exercises all three themed menus plus sibling ownership/deepest Escape. Geometry checks cover every requested width, fixed outer dimensions during searches/selections/date edits/errors, internal scrolling, viewport-bounded menus, reachable footer and stable committed-count trigger. Desktop and 320px fixture captures were visually inspected; captures remain ignored under .output/handoff-c1-*.png. Existing Handoff A/B, generation/epoch/expiry and production worker-recovery tests still pass. Pure query implementation, provider/auth/storage/sync/network, permissions and dependencies are unchanged.

Development browser failures were test expectation/selector errors (screen-reader group-count text, persistent empty notice, disambiguation markup) and attempts to click controls covered by open overlays; corrections use accurate semantics, exposed trigger edges and explicit dismissal. Initial focused typecheck failed obsolete SelectControl test imports, then passed after migration. No fabricated review, human smoke, screen-reader/zoom audit or release acceptance is claimed. No staging, commit or push; HEAD unchanged and demo/ preserved. Historical Handoff C's 637/42 evidence below remains unchanged and superseded.

#### Handoff C.1 human smoke still required

**Unpassed.** Handoff C automation passed historically, but user-reported production smoke exposed coupled inline expansion and immediate result mutation. C.1 corrects these behaviors; fixture browser evidence does not replace human acceptance.

1. Reload the exact production package and inspect the existing eligible mirror in Full Library. Open Filter library: final working geometry appears immediately, without a nested Channels expansion.
2. Search Channels and check multiple choices, including choices hidden by subsequent searches. Confirm count/rows/page/chips/badge/selected video/detail behind the panel stay unchanged throughout channel and date editing.
3. Apply: all channel/date choices commit together, results update once, page becomes 1 and panel closes. Check unknown-date handling and reversed dates: readable error, disabled Apply, no automatic date reorder.
4. Reopen, edit channels/date/search, then Escape, outside-click and trigger-close separately. Confirm drafts discard and reopening reflects committed values with fresh local search.
5. Check Clear channels affects only draft channels; Clear filters resets draft channel/date basis/range and preserves main search, Duration and Sort. Apply to commit either clear.
6. Open Duration, Sort and Date basis. Confirm dark themed menus and distinguishable neutral hover, selected tint/check and cyan outlined keyboard active states; selected marker persists elsewhere. Native date calendars still work.
7. Set search/duration/channels/date/nondefault sort, later page and selected/detail view. Reset view restores every browsing default/notice/scroll/popover, and leaves mirror/account/privacy/Sync unchanged. Confirm disabled in the initial view and reachable from focused detail.
8. Repeat in native Side Panel at 320/360/480px and Full Library at 800/1024/1200/1440px. Check no horizontal clipping, internal channel/body scrolling, reachable footer actions and stable trigger anchor.
9. Keyboard through open/search/checkbox/Apply/reset and each menu (arrows/Home/End/Enter/Space/Tab). First nested Escape closes Date basis and preserves draft; second cancels Filters and restores trigger. Check visible focus, screen-reader announcements and 200% zoom.
10. Confirm no new permission prompt, remote Sync/account mutation or dependency change; Handoff A launcher/branding and Handoff B account/progress visuals remain intact.

### Historical Handoff C amendment, 2026-10-06 (superseded by C.1)

This supersedes the native channel multi-select, routine option IDs, permanent filter-helper paragraphs and top-level Reset described in the historical Phase 7 record below. Query semantics, Handoff A shell/branding and Handoff B account/progress remain unchanged. Both surfaces use shared native `SelectControl` for Duration/Sort/Date basis, one existing 16px SVG down icon at a 14px right inset, structural centering, native-arrow suppression and reserved text padding. Native details/summary disclosures retain their existing Escape/outside/focus behavior and the same chevron family.

Filter library contains Channels, Date basis, From/Through and Clear filters when there are non-search constraints. Its badge counts selected channels plus one active date range; duration alone is not a panel-owned filter. Clear filters clears channels/duration/dates while retaining search, sort and date basis. The main search has its own clear action. Individually removable chips retain names/fallbacks and exceptional collision disambiguation. The reversed-date inline alert remains; long permanent instructional prose is removed.

`ChannelMultiSelect` chooses the simpler button + labeled local search + native checkbox architecture. Closed state shows All channels, one title or N channels selected. Stable IDs remain identity and existing option ordering is unchanged. Names are primary; only colliding normalized names receive full exact-ID secondary text. Missing names use Channel name unknown. Picker search matches normalized title/ID locally without a request or library-query/page change. Filtered-out selections remain selected; toggles update library results/page 1 immediately and leave the picker open. Clear selection returns `channels: []` and search focus.

Opening focuses search; Tab/Space operates native checkboxes and onward navigation without a trap. First Escape closes the picker/restores its trigger; second closes Filter library/restores summary. Outside pointer or focus leaving closes the picker without stealing destination focus; outer closure resets its open/search state. Outside pointer dismissal occurs after the click to avoid moving a control before activation. The option list scrolls within a bounded height; the picker expands inside the outer scrollable filter surface, whose height follows the available viewport space below the trigger. From/Through stack below 380px. Provider text remains React-escaped; option labels/chips wrap without horizontal overflow. Unavailable snapshots remove picker state/options/channel chips/counts, and generation/auth-epoch changes reset the view. No new persistence, dependency, network request or permission.

#### Handoff C maker verification, 2026-10-06

On `main` starting at `97ee934ebf1e676c461ce2ed519b312627ed1359`, final `npm run verify` exited 0: lint, strict typecheck, **637 unit tests across 15 files**, production build/check, separate provider-validation build/check and **42 Chromium E2E tests**. Focused `npm run verify:ui` passed 83 tests; a focused six-case browser rerun passed before full verification. `git diff --check` passed. Thirteen new presentation units, two query regressions and eight new browser cases cover this handoff; existing browser cases now use checkbox selection and strengthen generation/epoch barriers. Responsive fixture screenshots were inspected at wide and narrow widths.

The initial sandbox browser launch failed with `spawn EPERM`; permitted outside-sandbox execution ran the suite. Development browser runs exposed pointer-down layout movement, removed-button dismissal and keyboard-opening timing; corrections preserve the expected interactions rather than weakening query/security checks. A later selection fixture used a known Music video ID because unknown-liked-date ordering put a different channel at the assumed row index. Final verification has no skipped tests. No human smoke, screen-reader/zoom audit, independent review or release acceptance is claimed. Nothing was staged, committed or pushed; pre-existing `demo/` was preserved.

#### Historical Handoff C human smoke (superseded by C.1)

Use **`C:\Dev\likedex\.output\chrome-mv3`** built from this unstaged working tree. Record source state, Chrome version, date and actual results. Automated fixture previews do not mark this procedure passed.

1. Reload the unpacked production extension in `chrome://extensions`; open Full Library with an eligible mirror.
2. Compare Duration/Sort chevrons, then open Filter library and compare Date basis: same geometry/inset/center, exactly one arrow each, native date calendar still works.
3. Confirm cleaner spacing, no permanent helper paragraphs and no toolbar Reset. Duration alone should not activate the panel badge.
4. Open Channels: confirm All channels and initial search focus. Search locally, select one, then a second without closing. Verify title/count, correct results/page reset, semantic checked states and names on chips.
5. Search for another option; selections hidden by picker search remain selected. Confirm No matching channels is distinct from library no-results. Typing `/` stays in picker search and does not change main search/page.
6. Dismiss/reopen, remove one channel chip, reopen and verify remaining selection. Clear selection returns All channels and all eligible results.
7. Set Date basis and From/Through; verify results and readable reversed-range error. Clear filters clears channel/duration/date constraints and retains main search and chosen date basis.
8. Repeat the complete filter/picker flow in the native Side Panel. Check widths around 320/360/480px if Chrome permits; inspect Full Library at 800/1024/1200/1440px. Check long labels, scrolling option list, short height and no clipping/horizontal overflow.
9. Navigate by keyboard: open triggers with Enter/Space, search, Tab/Space toggle multiple choices, Tab onward with visible focus. First Escape closes only picker/focuses channel trigger; second closes Filter library/focuses summary. Outside pointer closes at the expected level.
10. Check screen-reader labels/checked state/error announcements and 200% zoom; avoid full-list chatter. Check Handoff B Sync/account presentation and Handoff A launcher/branding still appear normal; no new permission prompt should occur. No additional Sync/account mutation is needed for this UI smoke.

### Handoff B amendment, 2026-10-06

This supersedes the historical page-counter/no-percentage and routinely visible account-ID presentation below. Both surfaces share `ConnectedAccount`, `SyncStatus` and `SyncProgress`. Normal connection prioritizes channel name and connected/read-only text with a small Connection details disclosure for the stable ID. Unknown name remains explicit; owner mismatch still shows both IDs and blocks Sync.

Active scanning/applying/finalizing uses a navy inset HTML/CSS track with cyan-to-blue fill and a clamped edge badge. Pure `deriveSyncProgress` uses committed `rawItems / estimatedTotal`, including duplicate-video membership items. Geometry keeps the ratio clamped to 0–100; text/ARIA round to the nearest whole percent. The total is marked approximate. Unknown/zero/invalid totals are indeterminate with observed counts and no fake percent/current value/ETA. Preparing uses phase only. Fill/badge transition for 350ms between checkpoints, with no data timers; reduced motion disables transitions and decorative unknown-total motion. Phase/retry announcements stay separate from progress internals/counts.

Durable matching success becomes one compact success/mirrored-membership/update-time summary. Technical pages/raw/unique counts, estimate, timestamps and change counts live in Sync details. Terminal failures retain typed alert/error, revision-based partial warning and prior successful snapshot time/count. Healthy active work suppresses the large partial notice without altering stored provenance. Prior success remains in details during active work. Shared observation, eligibility, stale-response fencing, library rows/controls and identity remain stable.

Automated browser coverage includes both surfaces, 360/480px Side Panel (plus 320px fixture), 800/1024/1200/1440px Full Library, low/middle/high badges, determinate/indeterminate, phase/checkpoint stability, success/failure/account disclosures and reduced motion. This amendment does not claim human real-account smoke or release acceptance. The supplied neon image is inspiration only; no raster progress asset, image background, canvas or new dependency is used.

#### Handoff B human smoke still required

Use the exact final generated **`C:\Dev\likedex\.output\chrome-mv3`** package. Record build/source state, Chrome version, date/time and actual results; uncommitted source must be identified as such. This procedure has not been marked passed by the agent.

1. Reload/load this production package in `chrome://extensions`; open Full Library with an existing eligible real mirror.
2. Confirm stable channel name/connected/read-only text, hidden routine ID and accessible Connection details containing the ID.
3. Start a real Sync. Preparing shows checking; when a positive provider estimate arrives, confirm semantic progress, approximate denominator and percentage based on raw scanned membership items. Observe several real checkpoints; no text-only page-counter progress or invented ETA dominates.
4. Confirm scanning/applying/finalizing preserve progress, with no skeleton thrashing or large healthy-active partial warning. Search/filter/sort/page/library remain usable and account identity stays stable.
5. Wait for durable success: progress settles into one compact summary with mirrored membership count and update time, without a duplicate primary last-success timestamp. A real 100% checkpoint before success still says finalizing/scanning.
6. Open the native Side Panel during an observation; check narrow widths, readable counts and an unclipped percentage badge. Enable system/browser reduced motion and confirm progress information remains complete without nonessential movement.
7. Open Sync details by keyboard; check useful pages/raw/unique/estimate/timestamp/change diagnostics and Escape/focus restoration.
8. If feasible, use a separate failure fixture/harness to check current failure/partial/interruption, retained earlier success and terminal partial warning; never manufacture a real-account failure or change provider trust to exercise UI. Check screen-reader phase/progress/error behavior manually.

Shell amendment, 2026-10-06: the toolbar opens a compact launcher, with current-window Open/Close Side Panel and Open Full Library. Full Library is the existing Options app; Side Panel remains quick companion browsing. The popup observes no library/auth/sync data. Shared headers now use the approved smooth Likedex vector instead of the constructed play-circle glyph; functional controls remain in the SVG icon system. [Canonical assets](branding-assets.md) records the two package roles and exact hashes. Chrome 141+ is required. This supersedes the older direct-toolbar shell contract, while historical verification below stays historical.

Options and Side Panel now share the production `RuntimeClient` / `LibraryObserver` composition, dark cyan presentation, explicit connection/sync controls, local query toolbar, bounded cards, direct watch/copy actions, and truthful status/error states. The material below this section is the historical Phase 7 record; its claims that Side Panel is a placeholder and that production Sync remains disabled are superseded by current code and the later release evidence.

- Wide Options uses the library/detail split at 1280px; smaller Options widths use a focused detail route with Back. The Side Panel always uses compact list → one expanded row → focused detail. Back restores query, sort, page, selection/expansion, list/page scroll and invoking focus. Removed/ineligible selection returns to the results region with a notice.
- Search, duration, seven sorts, stable-ID multi-channel selection and inclusive explicit date-basis ranges retain the existing query contract. C.1 panel Clear filters edits only draft channels/date fields; Reset view restores all browsing defaults. Active filter chips remove individual constraints. Page size remains 50; there is no virtualization or new state framework.
- The privacy toolbar action opens the existing notice in a native modal dialog, with title/description, focus trap, Escape and focus restoration. No placeholder Settings actions, export, Clear, Disconnect, storage estimates or badges were added. Those unimplemented data controls remain outside this presentation work.
- Row buttons retain semantic selection/expansion. Up/Down/Home/End navigate visible rows; wide Options also updates selection. `/` focuses search and returns from focused details when needed. Buttons and external links remain separate, labeled controls. Clipboard success requires completion, and delayed results cannot announce success after unmount/expiry.
- All remote text stays escaped. Trusted thumbnail origin, lazy loading, failure placeholders, canonical watch URLs and action-time eligibility checks are retained. Full titles, unknown metadata, known descriptions and availability caveats remain visible in details.
- The manifest description now describes the working local library. OAuth, public key, extension ID, permissions, provider configuration, auth/domain/storage/sync/runtime modules and pure query implementation are unchanged.

### Motion and performance

Normal motion includes 150ms surface/selection feedback; 0.96 pressed scale with a 250ms spring-like CSS easing; 10px/opacity row entrance over 440ms with 20ms initial and 40ms per-row stagger; 180ms disclosure entrance and 150ms exit; 200ms modal scale/fade with matching exit; 200ms compact expansion/collapse; and a 1s spinner only during real active/pending work. State changes interrupt CSS transitions naturally. Removed/ineligible data is discarded immediately, without retaining outgoing data for animation. `prefers-reduced-motion` disables nonessential animation, transitions and pressed transforms.

The existing dependency set is unchanged. Inline SVGs provide the small icon set. Query results, page slices, selection lookup, available count and channel choices are memoized against their actual inputs. Row presentation is memoized, and the refresh callback is stable so unrelated auth/pending-control changes do not rerender an unchanged library. Local selection does not refilter/sort the entire snapshot. Only the bounded page creates cards and lazy images; compact expansion content stays bounded and becomes inert/hidden when collapsed. Subscriptions remain in the existing observer/hook, and disclosure listeners clean up on unmount.

### Review and verification scope

The separate test composition covers first run, no automatic Sync, explicit Sync, local search/filter/sort/page, canonical links/clipboard failures, expiry, truthful runtime errors, row keyboard/actions, filter dismissal, privacy-dialog focus, Side Panel context restoration/removal, and a 3,547-record fixture. The production extension smoke covers both real entrypoints and worker recovery. Its isolated recovery fixture runs from a passive extension resource so active UI authorization checks do not legitimately clean up synthetic unauthorized data.

Visual review covers 1440, 1200, 1024, 800, 600, 480 and 360px, plus a 320×480 compact filter view; default/selected/detail, search, open/multiple filters, sort, pagination, empty, active sync, failed sync, privacy dialog and compact expansion/detail. No horizontal overflow was observed. Review captures under `.output/ui-review/` are ignored local artifacts: populated views use the separate deterministic composition; `production-*` captures use the actual production package in an isolated disconnected profile. They are not evidence of a new real-account sync. No account authorization or remote sync was initiated for visual review.

Human review should reload the unpacked production package, inspect the existing real mirror and thumbnails, try selection/Copy/Open, filter and page, then check native Side Panel expansion/detail/Back and keyboard/reduced-motion behavior. Native toolbar clicking, screen-reader/200% zoom audit, exact release package smoke, independent release review and the pre-existing unimplemented data controls remain separate release work. This UI change is not a claim that all release criteria are complete.

### Verification results, 2026-10-04

Final `npm run verify` exited 0: lint, strict typecheck, 541 unit tests in 13 files, production build/artifact checks, separate provider-validation build/checks, and 13 Chromium E2E tests. The separately requested `npm run verify:sync` passed all 278 tests; `npm audit` returned 0 vulnerabilities; `git diff --check` passed. Four new E2E cases cover row actions/filter dismissal, native dialog focus, compact navigation/restoration, and the 3,547-record page bound. Existing production smoke now exercises both actual surfaces and isolates deliberate worker stops from live observer traffic. No safety assertion was weakened.

Chromium initially returned sandbox `spawn EPERM`; the established permitted execution path ran the actual suites. Restricted npm registry/cache access initially failed; permitted audit succeeded. Remaining output warnings are Playwright NO_COLOR/FORCE_COLOR and Git LF/CRLF notices. No dependency was added or removed. No commit, staging or push was performed.

Changed files: `src/options/OptionsApp.tsx`, `LibraryBrowser.tsx`, `options.css`, `use-options-runtime.ts`, new `Disclosure.tsx` and `Icon.tsx`; `entrypoints/sidepanel/main.tsx`; `tests/e2e/options.spec.ts`, `tests/e2e/shell.spec.ts`, `tests/options-harness/main.tsx`; `wxt.config.ts` (description only); this document.

## Historical Phase 7 record

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

Historical Phase 7 behavior (hidden disposal superseded by the 2026-10-07 lifecycle contract above): mount, focus and visibility resume passed through the observer. Hidden pages discarded rendered Authorized Data and disposed their observer; returning created a fresh observer and read. Subscriptions, timers and late replies were detached/ignored on unmount. Idle snapshots did not poll. Pending authorization status used a short bounded-per-read observation timer; it stopped when a terminal status arrived or the surface hid/unmounted. The runtime retained responsibility for bounded authorization work. Row/detail actions checked the snapshot deadline before selection, opening or copying, including when an opportunistic timer was delayed. Pending clipboard results could not announce success after detail disposal.

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
