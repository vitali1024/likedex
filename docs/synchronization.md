# Phase 5 synchronization and safe reconciliation

Implemented on human RED baseline `b02dd36`, following Phase 4 `4029f35`. This is service/domain/storage code and deterministic maker evidence. It is not runtime composition, product UI, independent review or production release validation. No implementation commit was made by the agent.

## Service and state

`src/sync/service.ts` exposes `SynchronizationService.start(requestId)`, returning a durable preparing attempt and a separate completion promise. It does not await remote owner validation or library scanning before acknowledgement. `observe()` reads the locally eligible repository snapshot; this internal API is not a surface DTO or authorization barrier. Phase 6 must perform its session/periodic authorization and cleanup barriers before exposing cached owner/count data, and redact pending-validation status as specified.

An atomic repository claim allocates one active slot. Simultaneous starts join that slot; same-instance callers share its completion promise. When another instance owns the task, the acknowledgement returns `completion: null` and the caller observes durable state. No second enumeration is launched. Phase 6 must recover prior-worker truth before admitting new work.

`src/domain/synchronization.ts` defines the authoritative transition rules. Idle/never synced means no current attempt. Active states are `preparing`, `scanning`, `applying`, `finalizing`; terminal states are `success`, `failure`, `partial`, `interrupted`. Preparing validates the owner silently, scanning obtains validated pages, applying commits a page, and finalizing obtains the final owner check then commits reconciliation. A terminal-page hint on a provider page controls activity transitions only; it never grants pruning authority. The provider still issues its separate completion capability only after the consumer resumes the validated stream.

Attempt/request/worker IDs, owner/generation/auth epoch, timestamps, phases, cumulative pages/raw/unique counts, safe commits, added/updated counts, sanitized error and terminal evidence are persisted. New added/updated counters have validated zero defaults for existing version-1 attempt records; there is no new database store or migration. Network cancellation, the current run promise and provider token-chain/capability state remain disposable memory. There are no persisted page cursors or incremental sync.

## Safe pages and counts

Each page application uses one Dexie transaction across control/owner/videos/sync. It checks local eligibility, exact revision, owner, generation, auth epoch and active attempt; validates contiguous page progress; merges supplied records; and commits checkpoint/counts/revision together. A stale replay cannot double-apply. It never removes unseen membership.

Membership comes from Phase 4 canonical video IDs and source playlist-item IDs. Unavailable/private/deleted or lookup-omitted metadata still counts as seen membership. Cross-page duplicates update cumulative source evidence without adding another local membership or another addition count.

Added means a unique video first inserted in this attempt. Updated means a pre-existing unique video first observed/refreshed in this attempt, including provenance updates; it is not a count of changed text fields. A duplicate later occurrence increments neither. Success records raw remote items, unique remote membership, final local membership/available counts, and added/updated/removed counts. Partial attempts retain committed progress and additions/updates but have no finalized removed count or fabricated completion summary. The independent last-success counts continue to describe their earlier successful snapshot.

Validated unknown/unfetched metadata fields retain eligible existing values with their original field freshness. Actual observed fields get only their own provider provenance. Availability from a valid lookup omission remains unknown; it does not establish unliking. Metadata fetch time is the latest actual retained field observation.

## Trusted destructive boundary

`LibraryRepository.finalizeTrustedEnumeration(proof, fence, now, finalOwner)` is the sole membership-pruning path. It first requires the actual Phase 4 `TrustedProviderCompletion` object, checked by in-process WeakSet provenance. Booleans, object spreads, JSON summaries and partial/malformed results fail before any database mutation.

It also requires an authentic `VerifiedSyncOwner` receipt issued by the shared authenticated request session, scoped to the same attempt/generation/auth epoch. The final receipt must come from a later owner check (`checkNumber >= 2`), match the local channel and Likes playlist, and have a valid observation time at/after terminal enumeration. An initial-only receipt, structural receipt or mismatched scope fails closed. Owner network validation occurs before opening the transaction.

Within one Dexie transaction, finalization verifies eligible connected state, exact owner/generation/epoch/revision/active-attempt fences, finalizing state, all durable page/raw/unique counts and safe commits, and exact agreement between completion membership and records committed for this attempt. Only same-owner records absent from that complete set are pruned. Explicit trusted empty therefore removes all owned membership; malformed empty never does.

Pruning, refreshed owner, completion evidence, terminal success, latest success, final counts, mirror/finalization revisions and derived freshness commit together. Failure rolls them all back; earlier page commits survive while eligible. Replay after success/interruption or cleanup is rejected. This is a local atomic snapshot of the complete API-visible enumeration, not a transactional snapshot of changing remote likes or a promise of an uncapped lifetime library.

## Failure, interruption and policy cleanup

Ordinary provider/storage failure before any page commit produces `failure`; after safe commits it produces `partial`. Cancellation produces `interrupted`. Provider/auth error categories remain distinct; raw response/exception/token data is never saved. A failure recording error returns `status-unsaved` and leaves persisted active truth for recovery; it never invents a saved terminal state. Stale/cleared work returns `superseded` and cannot recreate data or metadata.

Latest successful sync is independent of the current attempt and the one preceding terminal result. Ordinary failure/partial/interruption does not erase it. New starts rotate the preceding terminal attempt into one bounded slot. Associated success/attempt metadata is removed with authorized dataset deletion.

`recoverInterruption()` / `recoverSyncInterruption(workerInstanceId, now)` enforce local retention/pending cleanup first. Eligible active work belonging to another worker becomes interrupted with its safe progress intact; same-worker active work and committed success stay unchanged. Explicit retry creates a new attempt and begins at page one. Worker startup wiring, authorization barriers and cross-surface observation remain Phase 6.

Preparation, ingestion (including hydration/recovery bootstrap) and final owner validation share one `YouTubeSyncSession`: at most six additional transient retries, two per request, one stale-token recovery, ten minutes including consumer pauses, and the existing twenty-second fetch/body deadlines. No retry wrapper resets these caps, and no sync operation invokes interactive authorization.

Required owner/auth checks that cannot validate access, or confirmed authorization loss during ingestion, use the existing authentication cleanup coordinator. They fence and delete Authorized Data for `authorization-invalid` or `authorization-unverified`, reporting deletion/cache/persistence outcomes separately. Ordinary ingestion network/quota/schema failures after valid authorization do not trigger that policy deletion. Clear, Disconnect, expiry and these authorization cleanup authorities remain distinct from reconciliation. Failed physical deletion keeps the data gate closed.

## Freshness and release gate

Successful finalization refreshes only facts actually observed: owner, enumerated membership and returned metadata. Derived success/current-attempt freshness inherits the earliest retained relevant factual deadline. Omitted old metadata and bounded prior-result evidence keep their original deadlines and can conservatively constrain whole-dataset expiry even after another successful sync. Partial progress cannot renew untouched membership, prior success or complete-dataset freshness. No scheduler or alarms permission is added.

**Code correctness implemented; production release pruning validation remains pending.** No live account/API test was performed. This service is not wired into production entrypoints. The pending observation is a release-safety prerequisite, not evidence that the provider design is incorrect. Any contradicted assumption requires the stop/amendment process.

## Production live-provider validation gate

Human decision, **2026-10-04**: Phase 6 may implement runtime/MV3 integration and test it deterministically before live-provider validation. Production composition must default to a **closed** provider validation gate until successful live observation and explicit human approval are recorded. Missing, malformed or unapproved configuration must leave the gate closed; fixture results cannot enable it automatically, and runtime callers cannot override it.

For a valid production `SYNC START` request while closed, return the explicit, machine-testable typed result **`provider-validation-required`** before invoking the synchronization service or any request-induced storage mutation. Do not create/persist a new attempt, launch ingestion, alter mirrored videos or owner/library state, renew synchronization freshness, invoke trusted finalization, or prune membership. The request does not perform even a bookkeeping write. Production routing must offer no alternate path that bypasses the gate to run synchronization/finalization/pruning.

Independent startup, retention, authorization cleanup and explicit data controls retain their approved obligations. Their separately triggered recovery/deletion is not a side effect of a rejected Sync request and must not be suppressed by this release gate or described as reconciliation.

Deterministic tests may explicitly inject an enabled gate into separate test composition to exercise prompt persisted acknowledgement, active runs, duplicate starts, truthful failure/status, cross-client observation and worker recovery. The production build must contain real adapters and no fixture activation switch. Opening the test gate does not change the provider completion/provenance checks, owner-check receipt, trusted finalizer or pruning invariants.

`provider-validation-required` is a pre-release safety state. Before Store release, follow the [pending live-validation procedure](release/live-provider-validation.md): observe the real provider without local pruning unless separately authorized, preserve sanitized evidence, obtain explicit human approval, deliberately enable production synchronization/pruning, rerun full verification, then perform real-account smoke testing. It is not the intended normal public state after this prerequisite is satisfied. This amendment specifies future composition; it implements no gate code and claims no live validation or enablement.

## Deterministic verification and traceability

`npm run verify:sync` runs existing domain/storage/provider tests, the unchanged committed safety regression and `tests/unit/synchronization-service.test.ts`. It excludes Playwright, builds and UI tests. Tests use synthetic provider/auth data, injected timing and real Dexie with isolated fake-indexeddb; browser storage/lifecycle and live-provider behavior remain later gates.

| Acceptance IDs | Phase 5 evidence | Remaining scope |
|---|---|---|
| AC-SYNC-001/002/005–007 | First/full sync; exact durable phases; full retry; ordinary failure/partial/interrupted preserves prior success | Product state presentation |
| AC-SYNC-003/004/008/012 | Service acknowledgement with held bootstrap; duplicate atomic claim; pure prior-worker recovery; delayed Clear fencing | Runtime SLA/integration, Options/Panel clients and lifecycle scheduling |
| AC-SYNC-009/010; AC-AUTH-004 | Shared retry/auth/time caps; clock regression; quota classification; named authorization-loss cleanup | Live authorization and runtime invocation |
| AC-RECON-001–005/007–009/011/014 | Add/update/remove; malformed continuation/empty; trusted empty; provenance rejection; duplicate/unavailable membership; safe partial persistence | Live API completeness assumptions; UI availability |
| AC-RECON-006/010 | Existing Phase 4 token/date/metadata cases retained in the focused command | Live-provider observation |
| AC-RECON-012/013 | Real Dexie transaction rollback after pruning/final metadata; recovery of committed success; completion replay rejection | Actual browser crash/notification integration |
| AC-STORAGE-002/003/005; AC-IDENTITY-005 | Checkpoint atomicity, failure/unsaved status, bounded records and owner/generation/epoch/revision/attempt fences | Runtime errors/confirmation races |
| AC-DATA-011–013/015/016 | Preserved omitted-field lineage; actual refresh deadlines; expired-finalization rejection; cleanup recovery/closed gate | Scheduling, inactive/resume surfaces, export and full lifecycle |

The actual two-iteration maker loop is in [sync-loop](agentic/loops/sync-loop.md). Independent high-risk review remains Phase 12.

Maker verification on **2026-10-04**, Node **24.19.0** / npm **11.17.0**: final `verify:sync` passed **225 tests**. Final authoritative `npm run verify` exited 0 after lint, strict types, all **315 tests**, production build, artifact/manifest checks and **1 Chromium shell smoke** observing reserved ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`. Direct lint/typecheck/test/build/check:build/E2E checks also passed after repairing strict test-fixture typing. Separate `npm audit` reported **0 vulnerabilities**; no audit fix was run. Initial sandbox browser-launch `spawn EPERM` and registry/cache audit failures were resolved with permitted outside-sandbox execution. Actual warnings were Playwright's NO_COLOR/FORCE_COLOR notice and Git LF-to-CRLF conversion notices. `git diff --check` passed. These are local maker results, not CI, live provider/account, independent checker, runtime/lifecycle or release validation. The original RED test remains unchanged; all implementation changes remain unstaged/uncommitted.
