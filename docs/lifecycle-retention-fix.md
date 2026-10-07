# Focused same-document lifecycle correction, 2026-10-07

Maker implementation for the human-authorized tab-switch fix. This is not Handoff D, independent review, production smoke or release acceptance.

## Starting state

Branch `main`; HEAD `8dfb975e91e0a9d4819cea8c1874db384f1d592a`; `git status --short` contained only `?? demo/`. The explicit implementation request supersedes the older specification-only wording in AGENTS.md. No staging, commit, push, reset or clean was authorized or performed. `demo/` and unrelated files were preserved.

## Reproduction diagnosis

The human describes repeated Full Library loading flashes on ordinary tab returns, including while the native Side Panel remains populated. The accessible attachment contained only the request text; no recording file was available to inspect. The recording is therefore human-reported reproduction evidence, not an agent-viewed recording or runtime asset.

The baseline `useOptionsRuntime` hidden handler disposed the library observer, cancelled its auth timer, advanced the auth request number and published loading for both auth and library. Visible return recreated the observer and forced snapshot/auth reads. `OptionsApp` renders `SyncStatus` from `library.snapshot.sync`; discarding the library observation removed that metadata from presentation and produced `Loading sync status…`. This was surface state loss, not an independent Sync subsystem reload or disappearance of the durable mirror.

A baseline browser probe held reads during hide → visible → immediate focus, then released them. Instrumentation recorded exactly `LIBRARY_SNAPSHOT_GET, AUTH_STATUS_GET, LIBRARY_SNAPSHOT_GET, AUTH_STATUS_GET, AUTH_STATUS_GET`: **two snapshot and three auth reads**. The probe's two-auth expectation failed against the measured three; the snapshot ready callback contributed additional auth work. The probe was replaced with the new zero-read/coalescing contract; it is not part of the final suite. Both equivalent lifecycle requests previously marked in-flight observations dirty, causing sequential reads intended for real revision races.

## Safety contract verified from code

| Contract | Actual implementation and retained fence |
|---|---|
| `validUntil` | `RuntimeCoordinator.stamp` takes the earliest non-null `snapshot.earliestExpiresAt` and `control.authorizationCheckDueAt`. The repository's earliest retained-data deadline is conservative per-fact freshness. Reads/token checks do not renew API data. |
| Auth deadline | Durable `authorizationCheckDueAt` comes from validated authorization. Coordinator session/context checks and lifecycle enforcement require a future deadline; the surface checks it before reuse and schedules visible checks. Due or unusable connected authorization removes identity/data eligibility while silent validation proceeds. |
| Data generation | Durable dataset fence advances for Clear/deletion/owner transition. Changed generation immediately closes the surface gate and rejects old-context results. |
| Auth epoch | Durable authorization fence advances for auth transitions/cleanup. Changed epoch closes identity/library gates; independent stable owner identity remains enforced by the unchanged coordinator/repository. |
| Revision / `minimumRevision` | Monotone durable revision hints contain only revision/generation/epoch. Each observer/client validates and suppresses older hints; snapshots/auth responses below the newest observed revision cannot regress state. Context regressions and equal-revision mismatches are rejected. Auth control DTOs can supply missed context truth. |
| `expireBeforeUse()` | Checks the cached snapshot deadline synchronously and compares time against the observer's high-water clock. On expiry/backward movement publishes unavailable before a read can complete. Delayed expired/backward-clock replies cannot restore ready data. The auth controller also keeps its clock high-water mark. |
| In-flight fencing | Auth failure invalidates the library read epoch; late successes are rejected. A lifecycle recovery after a fenced in-flight read still queues the necessary fresh observation. Disposal rejects replies and detaches subscriptions/timers. |

The coordinator, auth service, provider, storage transactions, retention/deletion and transaction-clock correction are unchanged. The original initial-mount pending-check behavior is retained: a companion pending response must not repeatedly cancel a first library request that establishes its own authoritative authorization. Ready data still closes its gate when pending auth cannot retain eligible identity.

## Implementation

`src/options/runtime.ts` contains the document-local auth/library coordination previously embedded in the hook, with injectable clock/scheduler for deterministic tests. `use-options-runtime.ts` binds it to React and routes focus plus visibility through `resumeIfNeeded()`. Both production entrypoints already use this hook through `OptionsApp`; neither entrypoint nor the component tree is remounted for ordinary visibility changes.

Hide retains eligible library/auth observations and both revision subscriptions; it pauses surface polling/deadline/auth-retry timers. Already-running requests remain subject to clock, revision, context and read-epoch checks; hidden authoritative invalidation is published immediately rather than ignored. Hidden same-context revisions defer work and record pending refresh. Active Sync is marked for catch-up. No UI polling runs while hidden, and background Sync remains independent.

Return synchronously checks clocks/deadlines/context before reuse. Idle eligible unchanged state stays ready with no I/O. Missing/ineligible state, revisions, active-Sync catch-up, unresolved auth or a due auth check cause necessary reads. Active Sync retains eligible rows and its snapshot-derived summary during one catch-up read, then resumes normal visible two-second polling. Duplicate lifecycle requests join existing work without dirtying it; real newer revisions during reads still mark dirty, reject stale responses and reread. Explicit refresh remains forceful for Connect completion, Sync acknowledgement recovery, Retry and expiration handling.

No debounce, persistent presentation cache, separate identity/Sync cache, new keepalive/polling, permission, dependency or provider behavior was introduced. Hard gates take precedence over smooth presentation.

## Request-count results

Deltas exclude initial observations; final tests assert actual transport calls.

| Scenario | Snapshot reads | Auth reads |
|---|---:|---:|
| Baseline held hide/show + immediate focus | 2 | 3 |
| Idle eligible short hide/show | 0 | 0 |
| Five consecutive idle cycles, each surface | 0 total | 0 total |
| Idle visibility + focus / focus alone | 0 | 0 |
| Longer eligible idle hide (one hour), each surface | 0 | 0 |
| Active Sync hide/show + focus, no new revision | 1 | 0 |
| Hidden same-context revisions + visible/focus | 1 | 1 |
| Active catch-up with hidden progress revision | 1 | 1 |
| Genuinely newer revision during held catch-up | 2 | 2 |
| Explicit eligible refresh | 1 | 1 |

The separate auth read after a hidden revision observes current control truth; it is not focus duplication. Active polling after catch-up adds the expected snapshot read at its next visible two-second interval.

## Tests

`tests/unit/options-runtime.test.ts` adds 20 deterministic cases for mount/remount, idle/focus/multiple cycles, active pause/catch-up, deferred revisions, generation/epoch and held replies, expiry, auth due, backward clocks, explicit refresh, revision races, auth failure, pending checks and recovery, hidden mount and independent surfaces. Existing observer revision/deadline/auth/transport tests remain intact.

Two `tests/unit/runtime.test.ts` cases use the actual coordinator/auth/repository with fake IndexedDB: a ready surface hides, another caller performs real repository Clear or runtime Disconnect, durable owner/videos/sync are deleted, and the hidden surface's identity/library fence immediately. Resume never restores old records. No Clear UI/message was added.

`tests/e2e/options.spec.ts` replaces the old hidden-disposal test, adapts the dropped-broadcast auth test to explicit user refresh, and adds eleven cases. Both surface harnesses exercise repeated visibility/focus events, request counts, retained search/sort/committed filters/page/selected ID/scroll/filter draft/chips/account/Sync, active catch-up and hidden expiry/context invalidation. MutationObserver violations remain empty for eligible switches. Scroll assertions disable decorative motion to avoid expansion animation moving the measurement. Existing action-expiry, passive auth pending, revision thrashing, Handoff A/B/C.1 and real worker recovery regressions remain enabled.

The real `bringToFront()` scenario uses Full Library, a companion surface and another browser page, repeating five times. **Headless Chromium reported `visible` for all ten away/return samples**, so this does not establish real hidden transitions. Deterministic visibility-event coverage establishes the event contract. The companion harness is an ordinary extension page with Side Panel composition, not a populated native Chrome Side Panel; native combined behavior requires human smoke.

## Documentation

Current normative updates: `docs/product-spec.md`, `docs/engineering-spec.md`, `docs/acceptance-criteria.md` (AC-LIFECYCLE-001–003), `docs/runtime-lifecycle.md`, `docs/options-ui.md`, and `docs/verification-strategy.md`. `docs/sync-ui-refresh-fix.md` gains an explicit later supersession note. Historical Phase 6/7 and Handoff verification counts, original recording findings and prior human Sync smoke evidence remain historical; none is relabeled as this fix's smoke approval.

## Verification

Node `24.19.0`, npm `11.17.0`. Final authoritative `npm run verify` exited **0** on 2026-10-07: **669 unit tests across 16 files**, production and separate provider-validation builds/artifact checks, and **65 Chromium E2E tests**, all passing with no skips.

| Command | Final result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run verify:runtime` | PASS: 97 tests across 3 files |
| `npm run verify:ui` | PASS: 93 tests across 3 files |
| `npm run test:e2e` | PASS: 65 Chromium tests; the final verify repeated the full browser suite after rebuilding both artifacts |
| `npm run build` | PASS: production `C:\Dev\likedex\.output\chrome-mv3` |
| `npm run check:build` | PASS: production composition, identity, permissions, assets and fixture exclusion |
| `npm run verify` | PASS, exit 0: lint, typecheck, 669/16 unit tests, production build/check, provider-validation build/check and 65 E2E tests |
| `git diff --check` | PASS |

The 22 added unit cases and eleven additional browser cases extend the supplied baseline of 647 unit tests / 15 files and 54 browser tests. Browser verification uses isolated synthetic profiles and makes no claim of real-account tab-switch smoke or independent review.

Development corrections: baseline instrumentation measured three auth reads rather than the probe's expected two. New browser count selectors were corrected to the actual scoped footer; reduced motion removes unrelated expansion geometry from exact scroll assertions. The first full browser run passed 64/65 and exposed real disconnected first-mount pending-check starvation; the controller was corrected and its regression added. A focused production shell rerun and subsequent complete browser run passed. A pending-first-mount fixture's expected read count was corrected to include the initial authoritative control revision's necessary reread; no lifecycle duplicate or stale-revision guard was allowed through. Initial restricted Chromium launch failed with `spawn EPERM`; permitted isolated-profile browser execution succeeded. Observed notices: Playwright NO_COLOR/FORCE_COLOR and Git LF-to-CRLF conversion warnings.

## Manual production smoke still required

**UNPASSED.** Use the final unpacked production extension at `C:\Dev\likedex\.output\chrome-mv3`.

1. Reload that unpacked extension. Open Full Library and wait for complete readiness.
2. Set a recognizable search/filter/sort/page/selection/detail/scroll view. Switch to an unrelated Chrome tab and immediately back at least five times.
3. Confirm rows/identity/Sync summary are immediately stable, with no skeleton, local/Sync loading, connection checking, disabled controls, empty results or count reset. Confirm the same browsing state and eligible drafts/chips.
4. Stay on another tab longer, within the snapshot's eligibility deadline, then return and confirm the same behavior.
5. Start a real Sync explicitly; switch away while active and return. Confirm rows never disappear, durable progress catches up and no full-surface loading flash occurs.
6. Open the native Side Panel and keep it populated. Repeat the recording's Full Library/other-tab switching shape. Confirm the Full Library remains stable and the panel continues functioning independently; opening/closing the panel causes no unrelated library reload.
7. Confirm explicit Retry, Sync and Connect work; no new permission prompt appears; Handoff A/B/C.1 controls and visuals remain intact.

## Remaining risks and release gates

Actual freezing/discard/reload can stop timers/events or destroy the document; first executable reuse checks gates and a real remount performs fresh observations. Surviving idle reuse relies on the mounted revision subscription and known context; missing hints are additionally fenced by deadlines and discovered by necessary authoritative reads, not by unconditional focus reads. No immediate detection of an unreported remote revocation is claimed. Worker session validation/recovery remains separate from document memory. Native visibility/Side Panel behavior and production account smoke remain unverified here. Fresh independent lifecycle/auth review is required before release; this maker work does not supply that review.

## Git state

Changes are unstaged, uncommitted and unpushed; HEAD/branch unchanged. `demo/` preserved. No recording or fixtures enter the production build graph.
