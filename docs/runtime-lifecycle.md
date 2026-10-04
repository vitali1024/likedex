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

## Production composition and validation gate

`entrypoints/background.ts` synchronously registers the runtime listener through `src/runtime/background.ts`. The background owns one real Dexie repository, Chrome Identity adapter, Google request boundary, authentication service, synchronization service and coordinator. There are no fixture imports, production mock fallbacks, environment flags or runtime provider-gate overrides. Zod uses interpreted validation (`jitless`) for MV3 CSP compatibility. Permissions, public key, Store identity, OAuth scope and client configuration are unchanged.

`PRODUCTION_PROVIDER_VALIDATION_APPROVED` is deliberately **false**. The coordinator enables its injected gate only for the literal boolean `true`; missing, null, malformed and unexpected values remain closed. Only separate deterministic test composition supplies `true`.

After request/sender validation, a closed-gate `SYNC_START` returns `provider-validation-required` **before initialization or any repository/service call**. Even clock bookkeeping is excluded. Tests seed eligible owner, videos, attempts and latest success, move the injected clock forward, compare every raw store before/after, and assert no initialization, snapshot read, sync start, provider request or finalizer invocation. An overdue rejected Sync likewise performs no cleanup; independent startup still fulfills retention obligations. **AC-SYNC-013** is explicitly covered.

**Live provider validation: [COMPLETE / APPROVED](release/live-provider-validation.md). Production Sync gate: STILL CLOSED. First real synchronization smoke: NOT YET PERFORMED.** The human accepted the successful observation as satisfying the provider-validation prerequisite and authorized a separate gate-enablement change; approval does not itself enable Sync. Remaining steps are deliberate reviewed production enablement → full verify for the enabled composition → first real synchronization smoke. Provider capability provenance, final-owner receipt, trusted finalization and every pruning invariant remain unchanged. No Phase 8 work is included in this evidence update.

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
| `SYNC_START` | Production: typed mutation-free release-gate failure. Explicit enabled test composition: `started` or `already-active` with persisted attempt ID/phase, separately running completion. |

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

`LibraryObserver` supplies reusable surface plumbing without product UI: subscribe before reading, serialize/coalesce reads, reject replies older than a received revision, invalidate on revision hints, poll every two seconds when a returned attempt is active, and refetch on explicit mount/reconnection/focus/visibility resume. Every surface retains its own query/navigation state in later UI while sharing the same background truth. The observer publishes typed loading/ready/unavailable states and drops late responses after disposal.

## Retention and lifecycle timers

Initialization and every data-exposure path enforce the existing local retention/pending-cleanup barriers. The snapshot deadline is the minimum of retained-data expiry and the authorization-check deadline. Reads/Connect/token renewal never extend API fact freshness.

An ordinary injected worker timer targets the earliest dataset/auth deadline, with long delays bounded to the platform timer maximum. Due authorization is checked silently at the 24-hour boundary; expiry deletes owner/videos/associated attempt/success metadata for the actual expiry reason. Timer failure is retained and retried through a later lifecycle activation, never converted to a usable empty result. Cleanup remains independent of the provider gate.

The surface observer schedules its own deadline and synchronously discards expired cached data before reuse on timer/resume, even when notifications were missed. An expired delayed successful reply cannot repopulate the view. `resume()` is an integration hook for Phase 7/8 focus/visibility handlers; those product surfaces have not been implemented.

Chrome may discard worker globals/timers during inactivity. Deadlines are enforced at the first next execution before data use; no execution while Chrome is stopped is claimed. No keepalive loop or alarms permission is added. These choices follow [Chrome's lifecycle guidance](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle); asynchronous replies use the [documented message channel](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).

## Failure truth and acceptance traceability

Storage/schema/recovery/internal failures never become empty/idle/never-synced/auth-required. The handler allowlists known domain error keys and cleanup outcomes; unexpected exceptions become `internal-error` without raw messages, stacks, credentials or provider bodies. Remote/cache/local partial teardown is a successfully delivered outcome, not a claim that Disconnect completed.

| Acceptance IDs | Phase 6 evidence | Remaining scope |
|---|---|---|
| **AC-SYNC-013** | Seven closed/missing/malformed gate configurations; exact all-store equality, zero work; overdue rejection versus independent cleanup; production Chromium gate after restart | Human live evidence/approval and deliberate enablement |
| AC-SYNC-003/004 | Held bootstrap, sub-second ack, simultaneous clients, one attempt/scan, active/completed observation | Product status presentation; approved live production flow |
| AC-SYNC-007/008; AC-RECON-013 | Latest success plus later failure; idempotent prior-worker interruption; real browser IndexedDB attempt recovered after actual CDP stop/restart | Final exact-package/live crash smoke |
| AC-SYNC-011; AC-STORAGE-003/004 | Invalid requests/replies, transport loss, sanitized exceptions, persistence/unsaved/recovery failures, coherent revision observation and old-reply rejection | Product error presentation |
| AC-AUTH-001–003 | Passive versus explicit interactive boundary, required/candidate/mismatch states, denial preservation | Onboarding explanation/privacy agreement/UI; live consent |
| AC-AUTH-006–009; AC-DATA-010/015 | Runtime service Disconnect, independent partial outcomes, late-write fences, network-unverified versus invalid-grant cleanup, pending-deletion restart | Full confirmations/UI copies and real-account revoke/reconnect |
| AC-SYNC-012; AC-IDENTITY-005 | Disconnect serviceable during held sync; preserved Phase 5 transactional fences | Clear/replacement/Export and their later UI races |
| AC-DATA-013–016 | Injected expiry/wake/backward-clock, active deadline and 24-hour timers, pending-cleanup retry, surface cache expiry despite missing notifications | Actual surface event wiring, thumbnails/details/Export disposal in Phases 7–9 |
| AC-RELEASE-003; AC-VERIFY-003 | Production real adapters, exact Store ID, unchanged minimal manifest, no fixture switch, production E2E messaging | Live identity/OAuth and final release checks |

No Options, Side Panel, query, Settings, Export, Clear, video detail, accessibility or final Disconnect UI criteria are claimed. Independent high-risk review remains required in Phase 12.

## Verification record

On **2026-10-04**, Node 24.19.0 / npm 11.17.0: final authoritative `npm run verify` exited **0**, passing lint, strict types, **379 deterministic tests across 10 files**, production build/artifact checks and **1 real Chromium extension E2E** observing Store ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj` and actual stopped/running worker transitions plus IndexedDB recovery. Focused `npm run verify:runtime` passed **64 tests**; `npm run verify:sync` passed the unchanged **225 tests**. Direct lint/typecheck/test/build/check:build/E2E commands also passed after the corrections below. `npm audit` reported **0 vulnerabilities**. `git diff --check` passed; prior history remained at `a70f972`, with no staging or commit.

No Phase 6 implementation blocker or material specification contradiction remained at that verification. Production pruning was disabled and live validation was pending then; no production mock fallback, product UI, incremental sync, backend or token persistence was added. The subsequent live-validation approval is recorded above; production Sync remains closed. Independent review and later synchronization/package/release checks remain outstanding.

The production build now includes real Dexie. Artifact inspection permits only its exact pinned location-only localhost debug-detection expression in `background.js`; every other localhost/development/test/secret marker is still rejected. This is not a network endpoint, fixture path or provider bypass.

Actual corrections: the first focused runtime run exposed a shared-check status race and test fixtures reusing consumed `Response` objects; both were corrected. Typecheck caught schema tuple/API typing and a Playwright listener signature. The initial worker-restart test incorrectly awaited a Playwright object-close event; CDP's actual stopped/running states now verify lifecycle and browser-persisted recovery. No sync trust expectation, prior test, prior commit or frozen specification was weakened or rewritten.

Sandbox Chromium launch was initially `spawn EPERM`; permitted escalation ran the real E2E. Initial audit registry access failed, and its first escalation was rejected by automatic review; after confirming the human's explicit audit instruction and that all 428 resolved dependencies are public npm-registry packages with no private/linked packages, the requested audit was permitted and reported **0 vulnerabilities**. No audit fix was run.

Warnings observed: Playwright `NO_COLOR`/`FORCE_COLOR` environment notice and Git LF-to-CRLF conversion notices. No live provider/account validation or independent review occurred. Recommended next phase, after human review/commit: **Phase 7 — Options Library UI**, maker **GPT-6.1 Sol, Medium**.
