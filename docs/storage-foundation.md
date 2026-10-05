# Phase 2 storage contracts

This records the implemented local foundation, subordinate to the committed product/engineering specifications. It does not establish authentication, provider, synchronization, runtime, UI, Export, or release acceptance. No independent checker review has been performed; storage review remains required before release.

## Database and ownership

`src/storage/database.ts` defines Dexie database **likedex**, storage schema version **1**. There is one initial version, no migration history, and no speculative indexes:

| Store | Primary key | Contents |
|---|---|---|
| `videos` | inline `videoId` | Owned `MirroredVideo` records |
| `owner` | out-of-line key `singleton` | Stable `channelId`, actual `likesPlaylistId`, nullable display name, verification/freshness |
| `sync` | out-of-line key `singleton` | Current attempt, preceding terminal result, latest success, mirror revision provenance |
| `control` | out-of-line key `singleton` | Data-free gates, generation, auth epoch, revision, cleanup intent/outcomes, check/clock deadlines |

Owner, videos, and all sync metadata are the authorized dataset and are deleted together. Control contains no YouTube identifiers, titles, counts, credentials, or raw errors. No preferences are persisted yet; surface interaction state remains memory-only. A separate future export schema version must not be inferred from the Dexie version.

The database is constructed explicitly with no module-load side effect. The future background composition owns its repository instance and is the only production writer. UI/provider callers must use future coordinator contracts, not import Dexie. Tests inject a fresh IndexedDB factory; fixture data is confined to `tests/` and has no production entrypoint.

## Domain contracts

`src/domain/contracts.ts` uses strict Zod schemas to infer TypeScript models and validate both write inputs and persisted reads. Noncanonical instants, invalid counters, missing known-field provenance, contradictory availability evidence, and extra properties are rejected. UTC instants use `YYYY-MM-DDTHH:mm:ss.sssZ`. Identifiers are nonempty and never trimmed/synthesized. Provider identifier and image-host validation remains Phase 4; storage requires HTTPS thumbnail URLs without URL credentials.

Unavailable membership remains representable: availability is `available`, `unavailable`, or `unknown`, with evidence distinguishing private/deleted/rejected and lookup omission. Unknown optional metadata is explicit `null`. `likedAt` is membership metadata and never derived from publication date. Video IDs suffice to derive future watch links; no redundant watch URL or presentation sort key is stored.

Attempts contain worker/request/attempt IDs, owner when established, fences, active/terminal state, timestamps, progress, nullable totals, sanitized errors and nullable completion summaries. These are data definitions, not a sync state machine. Persisted completion summaries are audit data and cannot authorize pruning. The trusted completion capability and finalizer do not exist yet.

Latest success is separate from current and preceding attempts. Updating an attempt preserves latest success; saving a different attempt rotates only a terminal current record into the single preceding slot. Active work cannot be displaced. Cleanup deletes all three records. Mirror-change and finalized revision fields exist; this phase writes change revisions only. The trusted Phase 5 finalizer must establish finalized provenance atomically.

## Repository primitives

`src/storage/repository.ts` provides initialization, control reads, coherent local snapshots, owner persistence, connection-state persistence, current-attempt and latest-success persistence, explicit video upserts with an optional atomic attempt checkpoint, Clear Local Data, durable cleanup intent/deletion, and explicit local retention enforcement.

Connection-state persistence records a future adapter result and increments the auth epoch. It performs no authorization or Chrome identity call. Likewise latest-success persistence is a foundation primitive, not a real synchronization completion path. Phase 5 must add one trusted atomic finalizer covering membership deletion and success; composing independent metadata writes is not sufficient for real success.

Mutations check generation, auth epoch, expected revision, owner, and current attempt before committing. Video/checkpoint writes also require an active matching attempt with current generation/epoch. The expected revision prevents replay of the same local batch; provider page deduplication and progress computation remain Phase 5. Upserts never delete omitted videos. Transactions roll back records, checkpoints, and revision together on failure. Typed `StorageError` codes distinguish invalid input/data, stale writes, ownership/attempt mismatch, expiry, cleanup, unusable clocks and persistence failure; raw driver exceptions are not returned.

Snapshot validation and clock bookkeeping share a transaction across all four stores, preventing inconsistent owner/revision reads. `lastClockSeenAt` is data-free barrier bookkeeping and does not advance the domain revision or renew any API fact. **These snapshots enforce local freshness/cleanup only.** The future coordinator must enforce session/periodic authorization before exposing data to UI or Export. This phase has no RPC handlers or production consumers of the repository.

The subsequent [sync refresh investigation](sync-ui-refresh-fix.md) established a false `clock-unverified` race when callers captured time before queued transactions or retention's control-read await. Timed repository operations now accept either an explicit instant or a synchronous live clock supplier. Production auth/runtime/sync callers supply a live clock; storage samples it inside the transaction after acquiring coherent state. Mutation callbacks receive that same transaction instant for local attempt bookkeeping. Provider observations and retained API freshness remain unchanged. The persisted backward-clock comparison is unchanged: an actual rollback still fails, and time is never clamped to the persisted maximum. No transaction scope, schema, deletion authority or write fence changed.

Clear uses one transaction to increment generation/revision and delete owner/videos/sync. It preserves the connection gate and auth epoch, records `lastCleanupReason: clear`, and has no OAuth/revoke/resync effects. Stale confirmations and late writes fail. Clear rollback preserves the entire dataset; a pending policy cleanup must instead finish through its cleanup primitive.

Cleanup first commits a data-free reason and fences. Disconnect/authorization cleanup closes the gate and increments epoch; expiry preserves connection intent. A separate transaction deletes the whole dataset and records completion/revision/reason. Failure retains inaccessible residual data and durable intent, attempts to persist a separate failed-deletion outcome, and returns a persistence error even if failure recording also fails. Remote revoke/cache outcomes remain independent and are never marked successful by local deletion. Their adapter integration is Phase 3/9.

## Freshness and retention

Owner validation, video membership, each independently refreshed metadata field, and derived attempt/success records retain actual observation and expiry. Per-field metadata lineage is intentional: retained title, duration or availability must not receive a new deadline just because membership or another field was refreshed. Nullable field provenance can represent validated absence; missing provenance is permitted only for genuinely unknown/unfetched data. `metadataFetchedAt` is the latest actual field observation, not a retention deadline.

`retentionDeadline` uses midnight UTC on the date 30 calendar days after observation, independent of local timezone/DST. Deadlines can be earlier, never later. The dataset deadline is computed from the minimum of all retained facts, including prior attempt and latest-success evidence. Reads/local writes do not renew it. A backward clock or future observation blocks use pending future verification/cleanup; neither extends deadlines.

Snapshots/writes reject data at the exact deadline and reject missing/invalid provenance. `enforceRetention(now)` is the explicit pure-local primitive allowed by the Phase 2 plan: it retries pending deletion or commits expiry cleanup for expired/structurally invalid data. It preserves infrastructure read failures as errors and never interprets them as empty data or expiry. No scheduler, alarms permission, network refresh, or automatic library scan exists. Phase 6 must call barriers before first access/on waking and prove lifecycle/timer/cached-view behavior.

## Verification and remaining acceptance

`npm run verify:storage` reuses the domain/storage subset of the ordinary Vitest suite against Dexie plus test-only fake-indexeddb. Tests exercise isolated empty databases, reopen/round trips, explicit unknowns/evidence, bounded attempts, preserved latest success, coherent revisions, batch/checkpoint rollback, Clear rollback, owner/generation/epoch/attempt/revision fences, durable failed cleanup and retry, earliest retained deadlines, UTC calendar boundaries, backward clocks, and invalid provenance.

Coverage is limited to storage/unit portions of **AC-STORAGE-001–004**, **AC-IDENTITY-001/005**, **AC-SYNC-007**, **AC-RECON-009/010**, and **AC-DATA-005/007/011–015**; bounded-record storage **AC-STORAGE-005** is directly exercised. Full criteria requiring remote behavior, runtime ordering, browser-worker recovery, UI invalidation or Export remain pending. **AC-RECON-012 is not satisfied**: final prune/success transaction rollback requires the Phase 5 trusted finalizer. fake-indexeddb establishes deterministic repository behavior; it does not replace later real-browser storage/lifecycle checks or independent review. Existing E2E remains the production shell smoke only.
