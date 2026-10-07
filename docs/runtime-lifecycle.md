# Phase 6 runtime messaging and MV3 lifecycle

Implemented on clean baseline `a70f972`, following Phase 5 and the human-approved fail-closed provider amendment. This is maker implementation and deterministic/browser verification, not independent review, live OAuth/provider evidence or release acceptance. Changes remain unstaged/uncommitted. Phase 7 has not begun.

## Changed files

| Files | Purpose |
|---|---|
| `src/runtime/contracts.ts` | Strict versioned request/result/error/revision schemas and DTOs |
| `src/runtime/coordinator.ts` | Auth/sync/local snapshot routing, release gate, recovery and lifecycle timers |
| `src/runtime/client.ts` | Validated UI-facing transport and revision subscription |
| `src/runtime/observer.ts` | Serialized snapshot observation, revision/expiry/clock/resume guards |
| `src/runtime/background.ts` | Real background composition, synchronous listener and fixed closed gate |
| `entrypoints/background.ts` | Invoke runtime composition while retaining toolbar behavior |
| `src/auth/service.ts` | Reuse genuine scoped sync authorization evidence |
| `src/sync/service.ts` | Observe initial authorization after its durable deadline is saved |
| `src/storage/repository.ts` | Best-effort revision hints after completed transactions |
| `tests/unit/runtime.test.ts` | 56 coordinator/client/gate/auth/recovery/lifecycle cases |
| `tests/unit/runtime-observer.test.ts` | 8 cache/revision/resume/deadline/clock cases |
| `tests/e2e/shell.spec.ts` | Extend production smoke with runtime and actual browser worker recovery |
| `scripts/check-build.mjs` | Exact Dexie location-only detector exception, retaining endpoint/fixture/secret bans |
| `package.json` | Add focused `verify:runtime` alias |
| `README.md` | Current Phase 6 scope/gate, commands and next phase |
| `docs/runtime-lifecycle.md` | Implemented contracts, traceability and factual verification |

## D+.2 fresh-document bootstrap correction, 2026-10-07

A native Side Panel Close/Open can recreate its extension document. This is distinct from retained same-document visibility and legitimately creates fresh library/auth observations. No destroyed React state, persistent UI snapshot, cross-document identity cache or worker keepalive is reused.

Deterministic held-check tests reproduced AUTH_STATUS_GET's false validation-pending result when LIBRARY_SNAPSHOT_GET had already started authorize(). A held IDB companion control read finishing after shared authorization/snapshot success reproduced false unavailable invalidation in createOptionsRuntime. AUTH_STATUS_GET now returns pending only for true syncAuthorizationPending; ordinary companion reads await authorize()'s shared promise and its actual result/control stamp. Underlying remote work remains coalesced. Real failures still propagate, and generation/authEpoch/deadline/owner/retention fences are unchanged. SYNC_STATUS_GET's existing pending contract and Sync-owned snapshot blocking remain unchanged.

Direct concurrent companion reads in either order use one snapshot, one auth request, one service inspection and one provider request, with coherent context and no recovery retry. A real cold worker/document subscription test uses two companion pairs and two service inspections because the first authorization deadline write broadcasts a newer revision; the existing dirty-read policy rereads that revision. The second inspection uses the already-validated service result, so provider calls remain one and successful-bootstrap recovery timers remain zero. A fresh document in an already-validated worker uses one pair, one service inspection, zero provider calls and zero recovery retries. This preserves conservative observation rather than changing lifecycle/revision policy to optimize local request counts.

OptionsApp uses the final integrated header architecture from first paint and waits for the existing coherent auth/library identity gate before presenting ready rows/Sync when companion auth is initially loading/pending. Real error/unavailable state remains explicit. Five actual test-document close/new-page cycles per surface trace loading/ready DOM without old cards/rail, false unavailable or ready-row/checking-auth combinations. These are extension-document remount simulations, not continuous inspection of native Chrome panel lifetime/animation. Exact production/native smoke and independent release review remain unpassed; historical verification below is unchanged. See [D+.2 evidence and human smoke](handoff-dplus.md).
## Production composition and validation gate

`entrypoints/background.ts` synchronously registers the runtime listener through `src/runtime/background.ts`. The background owns one real Dexie repository, Chrome Identity adapter, Google request boundary, authentication service, synchronization service and coordinator. There are no fixture imports, production mock fallbacks, environment flags or runtime provider-gate overrides. Zod uses interpreted validation (`jitless`) for MV3 CSP compatibility. Permissions, public key, Store identity, OAuth scope and client configuration are unchanged.

`src/runtime/production-gate.ts` now sets `PRODUCTION_PROVIDER_VALIDATION_APPROVED` to literal **true**, following committed live evidence/human approval and the separate authorized enablement. Production background imports that constant. The coordinator still enables its injected gate only for literal `true`; missing, null, malformed and unexpected values remain closed. The separate observation build explicitly passes `disableSync=true` to background composition, keeping its gate closed even with production approval. This build-only option cannot grant approval or be changed by messages, storage or the UI.

After request/sender validation, a closed-gate `SYNC_START` returns `provider-validation-required` **before initialization or any repository/service call**. Even clock bookkeeping is excluded. Tests seed eligible owner, videos, attempts and latest success, move the injected clock forward, compare every raw store before/after, and assert no initialization, snapshot read, sync start, provider request or finalizer invocation. An overdue rejected Sync likewise performs no cleanup; independent startup still fulfills retention obligations. **AC-SYNC-013** is explicitly covered.

**Live provider validation: [COMPLETE / APPROVED](release/live-provider-validation.md). Production Sync gate: ENABLED. Post-fix live-account Sync smoke: PASSED (human-reported).** The human reported normal multi-page Sync with stable library rows, connected identity, usable search/filter/sort and an active Sync button; neither the repeated full-surface loading flashes nor transient library/storage-error state occurred during the observed test. See the [separate smoke evidence and its limits](sync-ui-refresh-fix.md#post-fix-live-account-smoke--passed-human-reported). The deterministic regression reproduced `clock-unverified`; the original recording alone does not establish that subtype for every recorded failure. Explicit production Sync reaches the existing precondition/durable-start path. Disconnected starts return the ordinary authentication failure; eligible deterministic composition proves acknowledgement, duplicate joining, successful finalization and ordinary provider failure using the production constant. Startup/Connect do not sync. Provider capability provenance, final-owner receipt, trusted finalization and every pruning invariant remain unchanged. No Phase 8 work is included; independent review and final exact-package release validation remain required.

## Wire contracts

Requests are strict JSON objects with `protocolVersion: 1`, UUID `requestId`, discriminated `operation` and an explicitly empty `payload`. No speculative Clear, Export, replacement or query messages are added. Unknown operations/versions, extra properties and malformed payloads return `invalid-request` before work. Sender identity and its extension-page URL must match this extension; external/content-script senders return `forbidden`. There is no externally connectable handler.

Every response echoes protocol/request/operation and discriminates `ok: true` with an operation-specific result, or `ok: false` with a sanitized typed error. Invalid requests have null correlation fields because their supplied values are not trusted.

| Operation | Result and boundary |
|---|---|
| `AUTH_STATUS_GET` | `auth-required`, `authorized`, `owner-mismatch` or data-free `validation-pending`; allowlisted durable connection/fencing/cleanup/revocation/cache outcomes accompany status. Only silent checks, never Likes enumeration or consent. |
| `AUTH_CONNECT` | Explicit interactive authorization; validated candidate or owner mismatch. Candidate is not a bound mirror or completed sync. Consent cancellation/denial remains failure and preserves eligible existing data. |
| `AUTH_DISCONNECT` | Existing service teardown; independent remote revoke, cache invalidation, fencing, deletion and persistence outcomes; `completed` is true only when all succeeded. |
| `LIBRARY_SNAPSHOT_GET` | Authorized coherent local owner/videos/sync DTO, revision, generation, auth epoch, conservative valid-until and actual cleanup reason. Unknown metadata remains unknown. Authorization checks may call channel bootstrap, but library membership/metadata are never fetched by this operation. |
| `SYNC_STATUS_GET` | Persisted sync metadata with separate current/prior attempt and latest success; while silent validation is pending, only data-free attempt ID/phase and fencing/revision are exposed. |
| `SYNC_START` | Approved production: existing preconditions, then `started` or `already-active` with persisted attempt ID/phase and separately running completion. Closed/missing/malformed gate: typed mutation-free release-gate failure. |

The runtime client is the UI-facing messaging boundary. It validates outgoing requests, response envelopes/correlation and the operation result schema. Transport rejection is `transport-error`; malformed/mismatched replies are `protocol-error`. There is no empty, idle, disconnected or mock fallback, and no automatic mutation replay. A lost start reply is resolved through status observation.

## Acknowledgement, authorization and active work

Enabled start waits only for local startup/cleanup and the existing durable Phase 5 claim. It does not await OAuth, owner bootstrap, membership, hydration, backoff or finalization. A held-request test measures acknowledgement under one second and before bootstrap resolves. Atomic duplicate claims from two independent clients return the same attempt and launch one enumeration.

One worker's run registry tracks cancellation and completion only. Persisted attempts remain authoritative. Status/snapshot requests and Disconnect do not queue behind a full scan or consent request. Connect is rejected as busy during an active sync; enabled Sync is rejected as busy during Connect or a required shared check. Disconnect aborts active runs and uses the durable service fences; it remains callable even if startup/recovery failed.

Before the first authorized-data exposure, the authentication service performs its silent session check. Concurrent clients share one pending check. While sync's initial check is held, snapshots return `authorization-pending`, passive status returns data-free pending, and sync status excludes cached owner/count/success evidence.

After sync has persisted its successful initial authorization check, a genuine `VerifiedSyncOwner` receipt seeds the same authentication service's session evidence and coordinator observation gate. A structural receipt cannot do this. This avoids an extra bootstrap racing sync page transactions. Scope/epoch/generation and the persisted deadline are checked when evidence is used; it never refreshes API metadata or authorizes pruning.

Ordinary provider/network failure after valid authorization preserves eligible membership and latest success. Required authorization verification that cannot complete triggers the existing separately named `authorization-unverified` cleanup; confirmed invalid grant uses `authorization-invalid`. A network failure is never described as user revocation. Teardown failures remain observable in durable auth status after the Disconnect reply.

If failure status cannot be persisted, runtime observations report storage failure for this worker, preserving the actual active record for restart recovery or acknowledged cleanup. They do not manufacture a saved terminal result.

## Worker recovery and revisions

Initialization runs local retention/pending-cleanup recovery, then Phase 5 interruption recovery before exposing state. A prior-worker active attempt becomes interrupted, preserving eligible safe page writes, owner and previous success. Terminal success remains success. No new scan starts automatically, and retry uses page one. Initialization is shared/idempotent; a failed initialization can retry on the next request and remains an explicit failure until successful.

Repository revision hints are emitted after completed transactions. They contain only revision, data generation and auth epoch. Notification failure cannot change a successful durable result. Clients validate notifications, suppress older revisions and detach subscriptions on disposal. Reads, not notifications, establish authoritative truth.

`LibraryObserver` subscribes before reading, serializes observations, rejects stale revisions and polls visible active attempts every two seconds. `suspend()` retains the in-memory observation and revision subscription while cancelling surface timers. Same-context hidden revisions mark pending refresh; context changes fence immediately even while hidden. `resumeIfNeeded()` checks deadline/backward clock synchronously and reads only for missing/ineligible observations, pending revisions or active-Sync catch-up. Equivalent lifecycle calls join a read without marking it dirty; genuinely newer revisions still mark dirty/reject stale replies and reread. Explicit `resume()`/refresh/retry continue to force observation. Idle eligible same-document returns need zero reads and publish no loading state.

The Options document-local controller similarly retains eligible auth while hidden and revalidates only when due, pending, unavailable, context-invalidated, revision-driven or explicitly refreshed. Auth controls still advance the observer guard if broadcasts were missed; auth failure fences in-flight library replies. Same-context passive-check pending can retain authorized identity only before its permitted deadline, while retries remain necessary. Real failures, context changes, expiry and backward clock close gates; visibility alone does not. Unmount disposes subscriptions/timers and rejects late replies. There is no persistent presentation cache, separate Sync truth, keepalive, new polling or permission. Sync UI derives from the library snapshot, so retaining that snapshot also retains its Sync summary. See [current lifecycle correction](lifecycle-retention-fix.md) and the [historical sync refresh investigation](sync-ui-refresh-fix.md).

## Retention and lifecycle timers

Initialization and every data-exposure path enforce the existing local retention/pending-cleanup barriers. The snapshot deadline is the minimum of retained-data expiry and the authorization-check deadline. Reads/Connect/token renewal never extend API fact freshness.

An ordinary injected worker timer targets the earliest dataset/auth deadline, with long delays bounded to the platform timer maximum. Due authorization is checked silently at the 24-hour boundary; expiry deletes owner/videos/associated attempt/success metadata for the actual expiry reason. Timer failure is retained and retried through a later lifecycle activation, never converted to a usable empty result. Cleanup remains independent of the provider gate.

Visible surfaces schedule their own deadlines. Hidden surfaces pause timers but synchronously discard expired cached data before reuse on resume or a received revision, even when notifications were missed. An expired delayed successful reply cannot repopulate the view. Options and Side Panel use `resumeIfNeeded()` for focus/visibility and explicit refresh for user retries. Actual document destruction requires fresh first-mount observations. Worker lifecycle enforcement and data deletion remain unchanged.

Chrome may discard worker globals/timers during inactivity. Deadlines are enforced at the first next execution before data use; no execution while Chrome is stopped is claimed. No keepalive loop or alarms permission is added. These choices follow [Chrome's lifecycle guidance](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle); asynchronous replies use the [documented message channel](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).

## Failure truth and acceptance traceability

Storage/schema/recovery/internal failures never become empty/idle/never-synced/auth-required. The handler allowlists known domain error keys and cleanup outcomes; unexpected exceptions become `internal-error` without raw messages, stacks, credentials or provider bodies. Remote/cache/local partial teardown is a successfully delivered outcome, not a claim that Disconnect completed.

| Acceptance IDs | Phase 6 evidence | Remaining scope |
|---|---|---|
| **AC-SYNC-013** | Seven closed/missing/malformed configurations with exact all-store equality/zero work; overdue rejection versus independent cleanup. Approved constant asserted directly; production Chromium reaches auth preconditions before/after worker restart. Separate observation build stays closed. Subsequent human-reported post-fix multi-page Sync smoke passed | Final exact-package release smoke; independent review |
| AC-SYNC-003/004 | Held bootstrap, sub-second ack, simultaneous clients, one attempt/scan, active/completed observation | Product status presentation; approved live production flow |
| AC-SYNC-007/008; AC-RECON-013 | Latest success plus later failure; idempotent prior-worker interruption; real browser IndexedDB attempt recovered after actual CDP stop/restart | Final exact-package/live crash smoke |
| AC-SYNC-011; AC-STORAGE-003/004 | Invalid requests/replies, transport loss, sanitized exceptions, persistence/unsaved/recovery failures, coherent revision observation and old-reply rejection | Product error presentation |
| AC-AUTH-001–003 | Passive versus explicit interactive boundary, required/candidate/mismatch states, denial preservation | Onboarding explanation/privacy agreement/UI; live consent |
| AC-AUTH-006–009; AC-DATA-010/015 | Runtime service Disconnect, independent partial outcomes, late-write fences, network-unverified versus invalid-grant cleanup, pending-deletion restart | Full confirmations/UI copies and real-account revoke/reconnect |
| AC-SYNC-012; AC-IDENTITY-005 | Disconnect serviceable during held sync; preserved Phase 5 transactional fences | Clear/replacement/Export and their later UI races |
| AC-DATA-013–016 | Injected expiry/wake/backward-clock, active deadline and 24-hour timers, pending-cleanup retry, surface cache expiry despite missing notifications | Actual surface event wiring, thumbnails/details/Export disposal in Phases 7–9 |
| AC-RELEASE-003; AC-VERIFY-003 | Production real adapters, exact Store ID, unchanged minimal manifest, no fixture switch, production E2E messaging | Live identity/OAuth and final release checks |

No Options, Side Panel, query, Settings, Export, Clear, video detail, accessibility or final Disconnect UI criteria are claimed. Independent high-risk review remains required in Phase 12.

## Verification record (historical Phase 6)

On **2026-10-04**, Node 24.19.0 / npm 11.17.0: final authoritative `npm run verify` exited **0**, passing lint, strict types, **379 deterministic tests across 10 files**, production build/artifact checks and **1 real Chromium extension E2E** observing Store ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj` and actual stopped/running worker transitions plus IndexedDB recovery. Focused `npm run verify:runtime` passed **64 tests**; `npm run verify:sync` passed the unchanged **225 tests**. Direct lint/typecheck/test/build/check:build/E2E commands also passed after the corrections below. `npm audit` reported **0 vulnerabilities**. `git diff --check` passed; prior history remained at `a70f972`, with no staging or commit.

No Phase 6 implementation blocker or material specification contradiction remained at that verification. Production pruning was disabled and live validation was pending then; no production mock fallback, product UI, incremental sync, backend or token persistence was added. The subsequent approval, authorized production gate enablement and human-reported post-fix live Sync smoke are recorded above. Independent review and final package/release checks remain outstanding.

The production build now includes real Dexie. Artifact inspection permits only its exact pinned location-only localhost debug-detection expression in `background.js`; every other localhost/development/test/secret marker is still rejected. This is not a network endpoint, fixture path or provider bypass.

Actual corrections: the first focused runtime run exposed a shared-check status race and test fixtures reusing consumed `Response` objects; both were corrected. Typecheck caught schema tuple/API typing and a Playwright listener signature. The initial worker-restart test incorrectly awaited a Playwright object-close event; CDP's actual stopped/running states now verify lifecycle and browser-persisted recovery. No sync trust expectation, prior test, prior commit or frozen specification was weakened or rewritten.

Sandbox Chromium launch was initially `spawn EPERM`; permitted escalation ran the real E2E. Initial audit registry access failed, and its first escalation was rejected by automatic review; after confirming the human's explicit audit instruction and that all 428 resolved dependencies are public npm-registry packages with no private/linked packages, the requested audit was permitted and reported **0 vulnerabilities**. No audit fix was run.

Warnings observed: Playwright `NO_COLOR`/`FORCE_COLOR` environment notice and Git LF-to-CRLF conversion notices. No live provider/account validation or independent review occurred in that Phase 6 maker verification; subsequent live evidence is recorded above. The historical next-phase recommendation, after human review/commit, was **Phase 7 — Options Library UI**, maker **GPT-6.1 Sol, Medium**.
