# Likedex verification strategy

Status: planned. No package scripts, tests, CI, passing results, or evidence logs exist in the specification phase. Acceptance IDs are defined in [acceptance criteria](acceptance-criteria.md).

## Authoritative command

`npm run verify` is the single completion gate: lint → strict TypeScript → all deterministic unit/provider/sync/storage/runtime/query tests → production build and composition checks → targeted real-extension E2E. Any failed required step fails the command; do not suppress failures, rely on unrelated cached results, or silently skip unavailable browser checks. A release candidate requires the full contract. Phase 1 starts with actual foundation checks and documents incomplete future coverage; each later phase extends the command until full scope exists by Phase 10.

| Planned command | Responsibility |
|---|---|
| `npm run lint` | Source/config lint and architecture/import restrictions where practical |
| `npm run typecheck` | Strict TypeScript across production and test entrypoints |
| `npm run test` | All deterministic tests, non-watch, nonzero on failure |
| `npm run verify:provider` | Provider schemas, mapping, pagination, error classification |
| `npm run verify:storage` | Repository transactions, snapshots, rollback, fence enforcement |
| `npm run verify:auth` | Connect/token recovery/identity/lockout/revocation and periodic/external-authorization validation contracts |
| `npm run verify:sync` | Domain state machine, trust gate, retry policy, critical reconciliation/storage regressions |
| `npm run verify:runtime` | Typed messages, durable start/recovery and cross-surface revisions |
| `npm run verify:ui` | Local query, UI state and focused component behavior |
| `npm run verify:data` | Eligible export, Clear, Disconnect, freshness expiry and cleanup races/postconditions |
| `npm run build` | Real production extension build, never a fixture build |
| `npm run test:e2e` | Separate deterministic extension composition and small Playwright suite |
| `npm run verify:release` | Manifest/identity/configuration, emitted artifact/fixture exclusion, package content checks; validates existing ZIP when present and requires it for release gate |
| `npm run package:release` | Future reproducible ZIP generation after verification; not an alternate test command |

Targeted commands reuse subsets of the same tests; they are not divergent alternate test frameworks. `verify` need not run the same suite multiple times through every alias. Manual external OAuth/Store checks are recorded separately and must not be misrepresented as automated verify results.

## Risk by layer

**Unit/domain:** pure state transitions; full-scan policy; capability construction; unknown metadata; available-only queries; all seven sorts and tie/null behavior; filter/date/duration boundaries; page reset/clamp; error-to-user-state mapping. Deterministic clocks/randomness make retries, timeouts, and attempt outcomes testable without real sleeps.

**Provider contracts:** use synthetic payload fixtures, not personal exports. Test malformed JSON with HTTP 200, absent items, schema-invalid fields, missing resource IDs, wrong playlist, partially mappable data, valid empty array, optional missing fields, unavailable metadata, duplicate video versus duplicate membership IDs, exact page-size boundary, multiple pages, invalid/repeated tokens and totals mismatch. Assert absence of completion evidence as well as error classification. No API call can mutate YouTube.

**Sync/reconciliation:** seed eligible, authorized, unexpired owned membership and a latest success; enumerate controlled pages; inject ordinary failures before/after commits; assert exact surviving IDs and unchanged latest success. Test additions/removals, metadata changes, unavailable entries, trusted empty completion, untrusted paths, retry caps, quota exhaustion, identity switch and finalization cancellation. Prove unrelated membership survives untrusted enumeration, not merely that an exception occurred. Separately test policy cleanup with its explicit reason; do not confuse it with destructive reconciliation.

**IndexedDB/storage:** exercise Dexie against a deterministic IndexedDB test environment for transactions and browser IndexedDB in selected integration flows. Cover page upsert/checkpoint atomicity, final prune/success rollback, read failures, clear-and-bind transaction, generation/auth-epoch fencing, coherent export, bounded attempt records, crash immediately before/after commit. In-memory fakes alone do not prove browser transaction behavior.

**Runtime integration:** fake Chrome APIs at the adapter boundary and use the actual coordinator/repositories. Hold remote promises to prove prompt start; start simultaneously from two clients; drop replies/notifications; deliver out-of-order revisions; reset worker instance with durable state intact. Assert invalid envelopes/runtime failures remain errors. Test pending page/hydration/backoff/Connect/export operations against Clear/Disconnect/expiry/authorization-cleanup fences. Worker recovery executes pending cleanup before publishing any dataset.

**Production provider validation gate (AC-SYNC-013):** Phase 6 automated tests may explicitly inject an enabled gate into separate test composition for acknowledgement, active runs, duplicate start, failure/status, cross-client observation and MV3 behavior. Production defaults closed until successful live evidence and explicit human approval; absent/malformed configuration and fixture success cannot enable it. Test the closed production path with eligible seeded data: a valid `SYNC START` returns typed `provider-validation-required`, invokes no sync/ingestion/finalizer and leaves every stored record, attempt, owner, freshness value, control bookkeeping and revision unchanged by that request. Independently triggered lifecycle/cleanup remains separately tested and required. Production build checks must reject fixture activation paths; enabled test composition must retain all provider provenance, owner-receipt and trusted-finalizer checks.

**Authorized-data lifecycle (AC-AUTH-007–009, AC-DATA-010–017):** injected clocks exercise just-before/at/after the conservative 30-calendar-day boundary, DST/timezone differences, invalid provenance and backward clock movement. Demonstrate success refreshes only revalidated facts, including old optional metadata retained after partial/full sync. Test whole-dataset deletion and metadata removal on expiry, independent remote-revoke/local-delete failures, both outcomes attempted despite one failure, persistent cleanup intent and retries after worker loss. Test external revoke, exhausted required-auth verification, and bounded periodic/session checks separately from ordinary sync network errors. Verify no stale UI/thumbnail/detail/export Blob survives cleanup or missed notifications, and reconnect cannot restore deleted rows. Prove lifecycle gates and active timers at browser inactivity/resume before adding a scheduler permission. These are planned tests, not a promise that deletion executes while Chrome is stopped.

**UI/component:** validate query/route/list restoration, clipboard errors, unknown labels, empty/loading/error distinctions, confirmation semantics, and focused accessibility. Performance check uses the documented 3,000-record synthetic corpus and reference desktop, reporting real percentile measurements rather than hard-coding elapsed-time claims.

## Targeted real-extension coverage

Use Playwright with an extension-capable persistent Chromium context and pinned browser/tool versions. Maintain a separate fixture composition that injects provider/auth responses, while retaining real extension messaging, service worker, IndexedDB, and UI. The production build must neither import fixture modules nor accept a runtime fixture flag. Do not log in to Google in CI.

Keep the suite small:

1. Built extension loads; background responds; Options and Side Panel entries mount with known local data.
2. Both surfaces observe the same running/failed/successful attempt without losing latest success.
3. Side Panel list → one expanded row → details → Back preserves query/filter/sort/page/selection/scroll and focus; handle removal during details.
4. Keyboard confirmation flow: Clear cancel preserves data; confirmed Clear deletes locally without revoking. Disconnect deletes authorized records and UI copies, stays locked after reload, and reconnect needs a fresh sync. A separate expiry/resume case prevents stale data flashes.
5. Narrow dimensions/reduced motion and one dialog accessibility path work.

Native toolbar opening is a separate required **real Chrome** check. Automate only if the runner can actually exercise browser chrome; navigating directly to the panel's extension URL proves route mounting, not toolbar integration. When unavailable in Playwright, retain a mandatory manual toolbar check and record the gap honestly. Unit-level provider edge cases should not all be repeated in E2E.

## Release build, manual smoke, and CI

CI pins Node/npm/browser dependencies, uses a committed lockfile and `npm ci`, then runs the same `npm run verify`. No real OAuth credentials or personal library data. Test artifacts label fixture composition clearly. Production build checks inspect manifest, version, permissions, CSP, stable identity/client configuration where available, packaged code, and absence of test/demo imports. A missing production external identity blocks the release check, not a reason to inject a fake client and call release ready.

Reproducibility means the same reviewed commit, toolchain, lockfile, and explicit public configuration produce identical packaged content; normalize ZIP ordering/timestamps if byte-identical ZIPs are claimed. Record command versions, source commit, configuration identifiers, file hashes and final ZIP hash. Repeat a clean build and compare, excluding no unexplained artifacts. No private keys, credentials, fixtures or personal evidence in ZIP.

The human smoke test in [Store release](release/chrome-web-store.md) uses the exact final ZIP contents and production identity. It covers actual OAuth, ownership, sync, local interactions, Options/native Side Panel, eligible Export, Disconnect/revoke with immediate authorized-data deletion and no library browsing, fresh Reconnect/Sync, external revocation, and Clear without revocation. Deterministic deadline/resume results supplement the smoke test; do not falsely claim a real thirty-day wait. An extracted ZIP verifies exact unpacked contents; record install mode and claim Store-installed testing only when performed. Record real dates/results/limitations only.

Before production sync/pruning enablement, the human-controlled [live-provider checklist](release/live-provider-validation.md) must produce actual sanitized observations with the production OAuth/extension identity. Observation itself does not prune unless separately authorized. The sequence is live observation → preserved evidence → explicit human approval → deliberate production enablement → full verification → real-account smoke. Automated fixtures establish deterministic behavior and cannot substitute for live evidence or approval. `provider-validation-required` is a pre-release state; normal public synchronization is enabled only after this prerequisite passes. An incompatible observation follows the stop/amendment process rather than weakening trust checks.

## Red → green evidence reserved

Preferred case: **untrusted remote enumeration cannot prune local membership** (AC-RECON-003/004). After specification commit and test infrastructure:

1. Add a meaningful test seeded with existing membership, then a valid first page followed by schema-invalid HTTP-success data. The assertion is that unrelated membership survives and latest success remains unchanged. Also keep a valid-empty control case to rule out a blanket “never prune” implementation.
2. Run the targeted test and capture its actual expected failure. An import/configuration error is not evidence of the invariant failing. Do not deliberately weaken working code to stage a demonstration; if the behavior already passes, choose another genuinely unimplemented critical acceptance criterion and document why.
3. With commit authorization, commit the red test: `test: reject destructive reconciliation for untrusted remote enumeration`. Keep that intermediate branch state out of a released/mainline passing claim.
4. Implement the approved behavior, run `npm run verify:sync` and full verify, record actual green output, then commit the green result when authorized.

No sequence is performed now. Evidence links must point to actual commits and command results, not reconstructed output.

## Bounded loop and independent checker

Phase 5's loop: implement approved slice → run verify:sync → inspect failure → correct → rerun. Stop on green. Allow at most **three unsuccessful correction iterations**, then stop, surface the failure and inspect the specification assumption; obtain human decision if necessary. Record initial run and each actual correction/command/result/decision when they happen under the future `docs/agentic/loops/` directory. There is no loop artifact in this phase.

Phase 12 uses a fresh GPT-6 Astra High conversation, independent of the maker, reviewing a named commit. It must inspect pruning versus policy-deletion authority, transactions, worker recovery, ownership, revoke/deletion failures, external authorization loss, freshness provenance, wake-time gating and verification gaps, and run checks itself. Store genuine findings later under `docs/agentic/reviews/`. Maker fixes accepted issues with regressions and reruns verify; checker revisits high-risk fixes. Human deferrals cannot silently waive approved safety/retention requirements. B-01 is resolved in the specification, not evidence of passing implementation. No checker report exists now.
