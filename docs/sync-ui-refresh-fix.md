# Sync UI refresh and transient snapshot investigation

Maker investigation on 2026-10-05 against `main`, HEAD `3ec9f5143df135ae194e98db9c5810274aec042a`. HEAD is identical to the recording's analyzed source commit; there are no subsequent commits. The initial working tree contained only untracked `demo/`, preserved without modification. No staging, commit, push, agent-run live account operation or release approval occurred. The human subsequently reported a successful post-fix live-account smoke test, recorded separately below.

## Confirmed causes

The supplied 24.33-second recording was inspected locally. It shows normal library/progress states alternating with full loading surfaces, and unavailable/storage-error screens followed by automatic recovery. The recording contains no internal storage subtype evidence.

**UI coordination:** the observer discarded every snapshot on a revision hint, including same-context scanning/applying/page-commit/scanning transitions. The Options hook also published auth loading for each revision and ready callback, and allowed overlapping auth requests. Options identity and active-sync presentation depend on those ready observations. A held-read regression against the original observer failed with `ready -> loading` at the first ordinary progress revision.

**Separate storage-domain race:** production callers captured time before entering queued IndexedDB work. In particular, retention captured `t1`, awaited `readControl`, then called `readSnapshot(t1)` after another read had persisted `lastClockSeenAt = t2 > t1`. The unchanged backward-clock guard therefore reported **`StorageError.code = clock-unverified` despite an advancing clock**. A deterministic six-page test using the actual coordinator/auth/sync/provider/repository and fake-indexeddb also failed against the original four production files with exactly `clock-unverified`. The current implementation passes that same scenario with six sequential page commits and 72 overlapping library/auth RPCs.

This proves a concrete runtime race and its fix. It does not establish IndexedDB driver failure or prove the exact subtype behind both recorded incidents; no internal trace was present in the recording. The successful post-fix live test below is separate behavioral validation, not forensic evidence identifying the subtype of every original incident.

## Post-fix live-account smoke — PASSED (human-reported)

In the follow-up to this investigation, the human reported that a manually performed live-account smoke test passed after the patch. During the observed test:

- Sync progressed normally across multiple pages and continued through the observation.
- Existing library rows and the connected YouTube identity remained visible.
- Search, filters and sorting remained usable, and the Sync button remained in its active state.
- The original repeated full-surface loading/skeleton flashes were not reproduced.
- No transient `Library unavailable` / `Local storage could not be read or saved` state occurred.

This evidence validates the observed post-fix live behavior. The deterministic regression separately identifies `clock-unverified` as the reproduced captured-time/persisted-clock race subtype; the original recording alone does not establish that subtype for both recorded failures. The human supplied no smoke-test timestamp, commands, final page/count totals or exact-package identity, so none is inferred here. This was a human-run test, not an agent-run account operation or independent security review.

## Changes

| File | Change |
|---|---|
| `src/runtime/observer.ts` | Retain eligible ready snapshots for same-context revisions; synchronously invalidate changed contexts; retain deadline timer through stale replies; accept authoritative auth control revisions; fence replies after companion auth failure. |
| `src/options/use-options-runtime.ts` | Serialize/coalesce auth reads; preserve eligible authorized identity on ordinary refresh/pending checks; invalidate on context/security/failure/visibility boundaries; share auth control truth with the observer; clean up timers and pending results. |
| `src/storage/repository.ts` | Accept live clock suppliers and sample after coherent state acquisition inside timed transactions; pass transaction time into mutation callbacks. Explicit-instant callers retain strict clock behavior. |
| `src/auth/service.ts` | Pass live clocks to retention, snapshots and auth persistence. |
| `src/runtime/coordinator.ts` | Pass live clocks to snapshot and lifecycle barriers. |
| `src/sync/service.ts` | Pass live clocks to recovery, claim, page transitions/application and finalization. Provider semantics are unchanged. |
| `tests/unit/runtime-observer.test.ts` | Revision bursts with held/stale replies, generation/epoch invalidation, wrong contexts, missed context hints, auth invalidation and deadline preservation. Existing expiry/clock/transport/disposal coverage remains. |
| `tests/unit/storage.test.ts` | Isolate exact old retention race; live-clock overlap, queued sampling, genuine rollback and expiry/no-freshness-renewal checks. |
| `tests/unit/runtime.test.ts` | Six real provider pages with advancing clocks and 72 overlapping snapshot/auth requests; record exact test-only error subtype; verify success and real rollback rejection. |
| `tests/options-harness/main.tsx` | Test-only held reads, page phase/counter bursts, context changes and dropped broadcasts. No production import path. |
| `tests/e2e/options.spec.ts` | Browse during held revision bursts; DOM mutation monitoring; generation/epoch invalidation; hidden-page races; auth-only context change and auth failure versus eligible passive pending. |
| `docs/runtime-lifecycle.md` | Update current observer/auth refresh contract. |
| `docs/storage-foundation.md` | Document transaction-time sampling without changing retention/write invariants. |
| `docs/sync-ui-refresh-fix.md` | This factual investigation and verification record. |

No public diagnostic payload, raw database/provider logging, retry budget or new permission was added. Exact storage subtypes are captured in deterministic tests only.

## Safety review

The maker reviewed the diff for eligibility, races, lifecycle and cleanup. Higher same-context revisions are refresh hints, not permission to mutate cached progress or ignore deadlines. Generation/auth-epoch changes still immediately drop rows and identity. Old revision/context replies remain rejected. Auth-only control changes fence library reads even if the corresponding broadcast was dropped; actual auth failures invalidate cached library data and reject a late successful reply. Hidden/unmounted surfaces clear data and ignore pending responses. Deadline timers remain active while old replies are rejected.

Storage still compares sampled time directly against persisted clock truth and retained observations, and fails at expiry. No `Math.max` timestamp clamping, exception swallowing, schema migration, changed owner check, cleanup bypass, pagination change or weakened pruning gate was introduced. Trusted provider completion and final owner receipts, exact revision/generation/epoch/attempt fences, transaction rollback and separate cleanup authorities remain enforced by the existing suite. The post-fix live-account Sync smoke passed as reported above. A fresh independent checker and final exact-package release smoke remain outstanding; the supplied behavioral smoke evidence does not establish that package-specific gate. This maker review is not an independent verdict.

## Verification

Final command results are recorded after the last source edit below. Earlier intentional RED runs and corrected test/harness failures are distinguished from final passes.

| Command/scenario | Result |
|---|---|
| `npx vitest run tests/unit/runtime-observer.test.ts tests/unit/storage.test.ts` on original observer with new regressions | Expected RED: 1 failed / 43 passed; library became loading. Exact old retention `clock-unverified` isolation passed. |
| `node node_modules/vitest/vitest.mjs run tests/unit/runtime.test.ts -t "overlaps snapshot/auth"` with original production files temporarily restored by a try/finally harness | Expected RED: 1 failed / 59 unselected; exact observed code `clock-unverified`. Current source restored afterward. |
| Focused five-file observer/storage/runtime/auth/sync Vitest run | PASS: 200 tests at that intermediate revision. |
| Focused three-file observer/storage/runtime Vitest run | PASS: 108 tests at that intermediate revision. |
| `npm run verify:sync` | PASS: 281 tests; no failed correction loop. |
| `npm run verify:runtime` | PASS: 75 tests after auth-control fencing addition. |
| `npm run lint` | PASS; also included in full verify. |
| `npm run typecheck` | PASS after correcting a Dexie mock to return its required PromiseExtended; initial mock typing failure was genuine. |
| `npm run build` | PASS; also included in full verify. |
| `npx playwright test tests/e2e/options.spec.ts -g "revision|hidden surface"` | Initially 3 passed / 1 failed: the test used nonexistent sort value `title-az`. Corrected to the existing `title` option, without changing product semantics. |
| `npx playwright test tests/e2e/options.spec.ts -g "consecutive page revision"` | PASS: 1 test after correcting the fixture. |
| `npx playwright test tests/e2e/options.spec.ts -g "auth alone|passive auth pending|consecutive page revision"` | PASS: 3 tests. |
| First `npm run verify` | PASS: 551 unit tests / 17 browser tests before the final auth-control and browser regressions. |
| Final `npm run verify` | PASS, exit 0: lint, strict types, **552 unit tests across 13 files**, production build/artifact checks, separate provider-validation build/artifact checks, and **19 Chromium tests**. No suites skipped. |
| Documentation-only smoke-status follow-up: `npm run verify` | PASS, exit 0: lint, strict types, **552 unit tests across 13 files**, production and provider-validation builds/artifact checks, and **19 Chromium tests**. Source and tests were unchanged in this follow-up. |
| `git diff --check` | PASS at handoff. |

Browser runs required permitted outside-sandbox execution after local launch reported `spawn EPERM`. Recording extraction helpers needed media/CORS corrections; they are ignored local `.output` artifacts and are not verification claims. The original baseline stress wrapper also encountered Windows console encoding errors; its saved UTF-8 test log establishes the actual RED result. Observed routine warnings: Playwright NO_COLOR/FORCE_COLOR and Git LF-to-CRLF notices. No tests, approvals, account traces or independent review were fabricated.

## Remaining limits and Git handoff

The stress test uses real Dexie with fake-indexeddb, and the Options integration tests run in Chromium with a separately identified transport fixture. Neither proves every browser driver/timing failure impossible. The supplied recording's two failures have no internal subtype trace. The post-fix live-account Sync smoke is now passed on the human's reported evidence; it is no longer outstanding. Independent release/security review and final exact-package release validation remain outstanding. No installed extension was reloaded or real account sync triggered by the agent in either the implementation or documentation follow-up.

Branch remains `main`; HEAD remains `3ec9f5143df135ae194e98db9c5810274aec042a`. All changes in the table are unstaged; the pre-existing untracked `demo/` remains untouched. No commit or push is authorized.

Final `git status --short`:

```text
 M docs/runtime-lifecycle.md
 M docs/storage-foundation.md
 M src/auth/service.ts
 M src/options/use-options-runtime.ts
 M src/runtime/coordinator.ts
 M src/runtime/observer.ts
 M src/storage/repository.ts
 M src/sync/service.ts
 M tests/e2e/options.spec.ts
 M tests/options-harness/main.tsx
 M tests/unit/runtime-observer.test.ts
 M tests/unit/runtime.test.ts
 M tests/unit/storage.test.ts
?? demo/
?? docs/sync-ui-refresh-fix.md
```
