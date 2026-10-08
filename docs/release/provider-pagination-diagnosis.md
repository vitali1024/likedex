# Terminal Likes pagination compatibility correction

Current status, 2026-10-08: production Sync is enabled; the human-reported first real sync succeeded. See [live approval](live-provider-validation.md) and [current verification](../agentic/capstone-verification.md). The closed-gate and pending-smoke statements below belong to the earlier dated checkpoint.

**Historical checkpoint before gate enablement — 2026-10-04:** [live provider validation is COMPLETE / APPROVED](live-provider-validation.md). The human's corrected observation succeeded over 71 pages / 3,547 unique memberships; the final 47-item page retained resultsPerPage 50, had no continuation and hydrated 47/47, with trusted-complete, matching observed/expected/reported counts, zero invalid terminal items and internalStop none. **Production Sync gate: STILL CLOSED. First real synchronization smoke: NOT YET PERFORMED.** Approval authorizes a separate gate-enablement change. The failure analysis, maker checks and retry/build context below are historical; their pending statements are superseded by the completed record. No Phase 8 work is included.

## Current proven terminal failure — 2026-10-04

Clean source baseline: `27a992d` (`fix: tolerate unknown playlist item privacy status`). The human authorized this focused compatibility correction. No Phase 8 work, production Sync enablement, reconciliation/pruning, staging or commit is included. This is maker-local verification, not independent release review or a new agent-run live observation.

The human-provided non-destructive observation traversed 70 pages of 50 memberships with fresh continuation tokens, then a structurally valid terminal page of 47 memberships. Every page reported stable `totalResults=3547`; page 71 retained `resultsPerPage=50`, had no next token, and brought actual observed membership to 3,547. No invalid items or internal stop occurred. No cap, cycle or changing total was encountered in the reported chain. The equality `70 * 50 + 47 = 3547` proves count coherence for this observed API-visible enumeration. Page 71 failed with `pagination-page-count-mismatch` before hydration solely because the old validator required `items.length === pageInfo.resultsPerPage` on every page. Observation time, Chrome version and original build hashes were not supplied; none is invented.

Live YouTube therefore demonstrated that the final Likes page can contain fewer actual items than resultsPerPage. The corrected rule permits this short nonempty terminal shape only when the validated chain has no continuation, every item/playlist association is valid, supplied totals are stable, a total is known and cumulative actual membership equals it, with no integrity/provider/internal-stop failure. Hydration must succeed and the consumer must resume under valid session gates before authentic completion is issued. resultsPerPage retains its original integer/range schema and unchanged diagnostic value; it is metadata rather than terminal completeness proof.

Continuing-page equality remains unchanged. A 47-item continuing page with resultsPerPage 47 follows its token, never completes early; a 47/50 continuing mismatch still fails. The unproven reverse mismatch and explicit empty control retain their safeguards. Matching-page nonempty scans with absent totals retain existing policy; a short-terminal metadata mismatch without any known total fails. Under-count, over-count, premature missing token, changing totals, duplicate source IDs, repeated/cyclic tokens, empty continuation, malformed structure/items, provider/hydration failure and session/cancellation stops still prevent completion.

The generated primary regression now exactly models 3,547 / 71 pages with resultsPerPage 50 throughout. It verifies all 47 terminal hydration IDs and records, cumulative count, authentic WeakSet-backed `TrustedProviderCompletion` and terminal-only issuance. Release observation verifies trustedCompletion true, reason `trusted-complete`, observed=expected=reported 3,547, page 71 itemCount 47/resultsPerPage 50/no token and requested/returned hydration 47, without local-store mutation or `pagination-page-count-mismatch`. Full-chain 3,546 and 3,548 negatives remain untrusted before terminal hydration; a stable greater total, changed total and token/integrity regressions also fail. Existing diagnostics already expose both counts and continuation state, so no new anomaly field or successful-error presentation is needed.

**Live validation remains PENDING until the human reruns the complete corrected observation and the evidence is assessed. Production Sync gate remains false/closed; no production approval is claimed.** Follow the current retry at the end of this document. Earlier sections below are historical evidence; their uncertainty, verification counts, build hashes and suggested commit do not identify this correction.

## Current maker verification and required human retry

Toolchain observed: Node 24.19.0 / npm 11.17.0. No real account/API access or independent review was performed by this task.

| Requested command | Final result |
|---|---|
| `npx vitest run tests/unit/provider-ingestion.test.ts tests/unit/provider-validation.test.ts` | PASS: 242 tests / two files |
| `npm run lint` | PASS: zero lint warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 540 tests / 13 files |
| `npm run verify:sync` | PASS: 278 tests / five files |
| `npm run build` | PASS |
| `npm run check:build` | PASS |
| `npm run build:provider-validation` | PASS |
| `npm run check:provider-validation` | PASS |
| `npm run test:e2e` | PASS: nine Chromium tests |
| `npm run verify` | PASS: exit 0, including 540 unit and nine browser tests |
| `npm audit` | PASS: zero vulnerabilities; no audit fix |
| `git diff --check` | PASS |

The first focused run caught a negative fixture changing total to 3,548 while intending a stable greater-total case. The existing total-change guard correctly fired. The fixture now uses stable 3,548 across that chain; the separate changed-total case remains explicit. No implementation/trust guard was weakened to fix the fixture. Initial restricted browser launch failed with `spawn EPERM`; permitted outside-sandbox standalone E2E and authoritative verify passed using isolated temporary profiles. Restricted audit could not reach the advisory endpoint/write cache logs; the permitted requested audit passed. Notices were Git LF-to-CRLF and Playwright NO_COLOR/FORCE_COLOR. These are local maker results, not production approval.

Source identity for this retry: `27a992d` **plus this reviewed unstaged patch**. Validation package: `C:\Dev\likedex\.output\provider-validation\chrome-mv3`.

Final SHA-256:

- `manifest.json`: `4D87960FBABDE7E7A133E5A7D637F323506D3C2476B628AF40966EF8E448A3FF`
- `background.js`: `488D91B4E0585B1859C83BC9C00BA3D9C6DD374A6C3FC86072E20CCB4AA0D805`

1. Review the patch. In `chrome://extensions`, reload the existing unpacked validation package at the path above, or load it in a dedicated profile with no other enabled installation of the same ID. Close old Options/observation tabs and reopen **Details → Extension options**. Load no TEST COMPOSITION directory.
2. Confirm **Likedex — RELEASE VALIDATION ONLY**, version **0.1.0**, ID **mmefiakgfhddiojfdnkfpfpbkgbfgkgj**, and the hashes above. Retain existing OAuth client `875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com`, project `likedex-extension-prod`, scope `https://www.googleapis.com/auth/youtube.readonly` and permissions.
3. Confirm connected/read-only and the intended channel locally. If Connect is offered, record the agreement if required and explicitly **Connect YouTube** once. Retain an eligible existing connection. Stop on connection/precondition failure and report only its sanitized diagnostic.
4. Open **non-destructive provider observation**, close other Likedex pages, then click **Observe provider without syncing** once. Keep that page open until the final result. Do not click normal Sync or change likes.
5. Copy the entire final sanitized JSON within ten minutes of the last update. For an unchanged 3,547-item live chain, confirm 71 accepted/hydrated pages, terminal itemCount 47/resultsPerPage 50/no next token, hydrationRequestedCount 47 (returned count may be lower if valid metadata omissions occur), observed=expected=reported 3,547, empty invalidItems, internalStop none, `reasonCode: "trusted-complete"`, `status: "success"`, `bootstrapValidated: true` and `trustedCompletion: true`. Report actual counts if the library changed; do not force the old size. Preserve summary, full pageChain, reasons, counts, hydration facts, internalStop and optional auth diagnostic. Record actual Asia/Jerusalem time, Chrome version, source base plus patch/build hashes and unpacked install mode. Share no raw bodies, IDs, titles, credentials, opaque tokens, HAR or DevTools output.
6. Report evidence for assessment, then disable the validation package per the [runbook](provider-observation-runbook.md). Failure remains failure; stop on a new contradiction. Successful observation still needs a separate explicit human approval and reviewed enablement change. Production Sync/pruning remains gated, live validation PENDING, and Phase 8 has not begun.

All changes remain unstaged/uncommitted. Suggested human commit after review: `fix: accept coherent terminal Likes page`. No automatic commit.

## Historical diagnosis of the reported 350 / 3,547 observation

Baseline: clean `0ef0484766dbb3ed088040fe926d744c9cf58166` on 2026-10-04. This is focused diagnosis and release-only instrumentation. No live account/API call, phase advancement, production enablement, source-strategy change, pruning, staging or commit was performed here. The supplied request authorizes this narrow implementation inspection despite the historical specifications-only wording in AGENTS.md.

## What current evidence establishes

Follow-up: human observations first narrowed this failure to `membership-item-invalid` on a continuing eighth page, then proved the only rejected field was an unfamiliar **string** privacyStatus with valid membership identity. Likedex incorrectly treated its known playlist-item privacy values as exhaustive. The human-authorized compatibility correction now treats unfamiliar strings as unknown metadata and continues hydration/enumeration; malformed types and every identity/token/count/provenance gate still fail closed. This document preserves the earlier audit and its uncertainty as historical evidence; the current [membership-item diagnosis and retry](membership-item-diagnosis.md) supersedes its branch uncertainty, retry and build hashes. Complete live validation remains PENDING; production Sync stays closed.

The human supplied a **failed** observation with bootstrap validated, seven accepted/hydrated pages, 350 raw/unique memberships, reported total 3,547, and `untrusted-enumeration / enumeration-untrusted / scanning`. There were no accepted duplicates or hydration omissions. Actual observation time, Chrome version, loaded build hashes and the rejected response's page/token/count semantics were not supplied. This record preserves the report as human-provided evidence, not a new agent-run observation or successful validation.

The exact live reason is **not proven**. Under the inspected real composition, the seventh accepted page must have supplied a continuation token: a terminal count of 350 against 3,547 would fail before hydration/yield. After the seventh yield, time/cancellation checks have different categories. The next membership response can fail before hydration and leave exactly the supplied summary. Thus `pages: 7` does not mean the provider issued only seven membership requests or that page seven was terminal. The failing eighth response's facts were discarded by the old aggregate-only observation.

A generated regression reproduces this summary with seven valid 50-item pages followed by an empty eighth terminal response still reporting 3,547. It is a **synthetic example of ambiguity**, not proof YouTube returned that response. A rejected nonempty eighth terminal response could also leave 350 in accepted progress. No 350-item provider cap is inferred, and no response was reclassified as trusted.

## Every branch for the reported category/key

`src/provider/errors.ts` maps exactly four internal codes to that category/key. Production domain semantics remain broad. The following lists every throw site, in evaluation order within each operation; reason codes now distinguish the safe cause in validation output.

| Location / internal code | Exact condition | Validation reason |
|---|---|---|
| `validateMembershipPage` / count-integrity | resultsPerPage differs from items.length, except short nonempty terminal shape; ingestion additionally rejects that exception without a known total | pagination-page-count-mismatch |
| Same / unmappable-membership | Any item fails the required resource schema: kind, containers, source/video ID syntax, field types, privacy enum, position/date types | membership-item-invalid |
| Same / unmappable-membership | Item playlist ID differs from requested Likes playlist | membership-playlist-conflict |
| Same / unmappable-membership | Both snippet and contentDetails video IDs absent | membership-video-id-missing |
| Same / unmappable-membership | Both video IDs present but differ | membership-video-id-conflict |
| `enumerateLikedVideos` / pagination-integrity | Returned next token already in the chain; equals current request token | pagination-token-repeat |
| Same / pagination-integrity | Returned next token already in the chain; refers to an earlier token | pagination-token-cycle |
| Same / pagination-integrity | Empty membership page supplies a continuation | pagination-empty-continuation |
| Same / count-integrity | A present total differs from the preceding known total | pagination-total-changed |
| Same / count-integrity | Aggregate raw count is not a safe integer | pagination-count-overflow |
| Same / count-integrity | Aggregate raw count exceeds the known total | pagination-count-exceeds-total |
| Same / count-integrity | No next token and aggregate raw count differs from known total (after excess already rejected) | pagination-premature-terminal |
| Same / count-integrity | Terminal aggregate zero without confirmed total zero | pagination-empty-total-unconfirmed |
| Same / duplicate-source | Playlist-item source ID repeated within/across pages, even with identical video ID | membership-source-duplicate |
| `observeProvider` / pagination-integrity | Page after completion | completion-proof-invalid |
| Same / pagination-integrity | Repeated/fabricated completion, wrong attempt/owner/playlist/generation/epoch, wrong page/raw counts or unique count differing from the observation map | completion-proof-invalid |
| Same / pagination-integrity | Stream ends without a genuine completion capability | completion-proof-missing |

The observation proof guards cannot account for this report through the normal genuine stream: a terminal 350/3,547 chain cannot reach the completion producer. They remain listed because they map to the same category/key and protect against invalid composition/provenance.

With seven accepted pages at total 3,547, the next validated envelope has at most 50 items. Count overflow, count exceeding the unchanged total, and unconfirmed empty-total cannot explain this specific point in the genuine chain. Candidate branches are page-count mismatch, invalid/unmappable/conflicting membership, repeated/cyclic token, empty continuation, changed total, premature terminal, or duplicate source. The diagnostics identify which branch actually fires; current evidence does not select one.

Envelope failure (absent/wrong items, pageInfo/kind, invalid or empty next token, >50 items, invalid total/count types), malformed JSON, and invalid hydration map to **malformed-provider / provider-invalid**, not the reported pair. Duplicate video IDs with distinct source IDs are supported and are not a trust failure. Wrong recovery owner is **owner-mismatch**, not this pair. Invalid context/unexpected exceptions are **internal**. Observation precondition, storage, port/worker interruption and cancellation paths are also distinct.

## Internal limit audit

Repository-wide searches covered 350/3,547, seven/6/7, page and request counters, retries, hydration, timeouts and defensive limits across source, tools, tests, scripts, configuration and docs. The provider's `for (;;)` exits only through a validated terminal completion or a typed failure. `pages++`, raw count and hydration counters record progress; none stops enumeration at a count. No max-page, membership, aggregate successful-request or iteration cap exists. Only tests/documentation have the new 350/3,547 regression constants.

| Existing bound | Implementation / effect | Domain category |
|---|---|---|
| 50 items per membership envelope; maxResults=50 | Schemas / playlistItems URL; per-page batch, no aggregate cap | malformed-provider on oversized envelope |
| 1–50 distinct hydration IDs | `createReadSession.videos`; one request per nonempty page | malformed-provider on invalid input |
| Two additional transient retries per request | `jsonRequest`, counter resets for each logical request; does not increment on ordinary successes | Original network/rate/provider category on exhaustion |
| Six additional transient retries across session | RequestBudget.retries increments only before retry sleep, including recovery bootstrap | provider / provider-failed; retry-budget-exceeded diagnostic |
| Ten minutes including consumer pauses | `assertBudget`, remaining-session signal, pre-backoff check; clock regression/nonfinite time also closes session | provider / provider-failed; session-budget-exceeded or session-clock-invalid |
| 20 seconds per fetch/body read | `fetchAndRead`, bounded transient recovery | network / network-failed; request-timeout |
| One silent 401 recovery | RequestBudget.recovered and authoritative identity recheck | authentication or owner-mismatch on failure |
| Ten-minute temporary evidence display | Observation UI timer/reset/resume; not a seven-page provider bound | Expired UI evidence, not trusted completion |

These are the existing specified retry/time limits; no limit was raised. They cannot produce the supplied untrusted-enumeration category. The large generated test is now explicit coverage beyond the previous one/two/three-page cases; no previously hidden seven-page implementation defect was found.

## Diagnostic contract

Only the release observation opts into the provider observer. Production constructs no page diagnostics and returns the same broad domain errors; ordinary runtime responses continue to omit auth diagnostics by default. No diagnostics are persisted.

Final success/failure JSON adds `enumerationDiagnostic`: a compact `pageChain`, exact allowlisted `reasonCode`, `observedMembershipCount`, `expectedTotal`, `reportedTotal`, `lastResponseHadNextPageToken` and `internalStop`. Each decodable membership envelope is captured **before** item/count/token trust checks and then updated with hydration requested/returned counts. It includes ordinal, itemCount, totalResults, resultsPerPage, next-token presence and first/fresh/repeated/cyclic/none relation. An envelope that cannot be decoded safely has no invented page facts; latest response total/token facts become null. A transport failure while fetching the next membership page also clears those latest facts. The prior page chain remains available.

`first` means the first response's continuation; `fresh` a later unseen continuation; `repeated` the current request token returned again; `cyclic` an earlier chain token returned; `none` no continuation. Tokens are compared internally and never returned. Hydration requested count is the unique page video count; returned count is the validated metadata map size. Null means the corresponding stage was not reached/completed; zero is an actual completed empty count.

`summary` still counts accepted, hydrated pages only. `observedMembershipCount` counts items in decodable envelopes including a rejected page, and does not assert those items map or are unique. `expectedTotal` is the first known chain total; `reportedTotal` is the latest decoded response's total or null if absent/unknown. `internalStop` distinguishes no internal stop, elapsed/pre-backoff session exhaustion, aggregate retry exhaustion, invalid session clock, exhausted fetch timeout and cancellation. The optional auth diagnostic keeps endpoint/HTTP/phase/retry context when available.

No actual page token, playlist/channel/video/source ID, title, credential, URL or raw response/exception body is included. Strict schemas reject extra fields; sentinel exclusion, precise rejection reasons, rejected-page preservation and no-mutation checks are covered by unit/browser tests. The genuine completion capability, trusted-empty rule, owner/attempt/fence checks and pruning gate were preserved.

## Changes and verification

Changed implementation: `src/provider/diagnostics.ts` (new allowlists), `errors.ts`, `youtube-schemas.ts`, `youtube-ingestion.ts`; `src/auth/errors.ts`, `google-requests.ts` (budget reason annotations only); release `tools/provider-validation/contracts.ts`, `service.ts`. Changed tests: `tests/fixtures/provider.ts`, both provider unit suites and `tests/e2e/provider-validation.spec.ts`. Documentation: this diagnosis, the observation runbook and the pending live-validation record.

The generated 3,547-item / 71-page chain passes through the real request boundary/provider and through non-destructive observation. It verifies every exact opaque token, 50-ID hydration batches (47 on the last page), 142 ingestion requests, counts and genuine completion only after all 71 pages. Observation additionally includes one bootstrap request, safe page-chain evidence and equality of every seeded local store with no mutation/finalizer calls. Chromium tests assert successful and premature-terminal diagnostics reach the actual observation page without content/token disclosure or database changes.

On Node 24.19.0 / npm 11.17.0, focused provider/validation tests passed 159 tests. All requested standalone lint, typecheck, test, verify:sync, production build/check, validation build/check and E2E commands ran. Full unit suite passed 457 tests / 13 files; verify:sync passed 226 / 5 files; Chromium E2E passed nine tests. Final authoritative `npm run verify` passed with exit 0, including the enhanced browser diagnostic assertions. `git diff --check` passed. These are maker-local synthetic checks, not live-provider success or independent release review.

One initial focused diagnostic fixture reused its input token while intending to test empty continuation; the earlier repeat guard correctly fired. The fixture was corrected to use a fresh token. No trust assertion or implementation guard was weakened. Restricted browser launch failed with spawn EPERM; permitted outside-sandbox execution passed. Warnings/notices were Git LF-to-CRLF, Playwright NO_COLOR/FORCE_COLOR, and an optional Vitest transform-cache performance suggestion.

Restricted `npm audit` could not reach the advisory endpoint/write its cache log. Automatic approval review twice rejected the outside-sandbox command because it sends dependency metadata to npm's external advisory service. The human subsequently directly approved sharing public dependency names/versions with `https://registry.npmjs.org` and running the audit. The approved final `npm audit` passed with exit 0 and **zero vulnerabilities**. No audit fix or workaround was run.

Reviewed unstaged build: validation manifest SHA-256 `4D87960FBABDE7E7A133E5A7D637F323506D3C2476B628AF40966EF8E448A3FF`; validation background SHA-256 `ABF940886DBF40D31E1A01264E00B1EF28A2D265A4A02A78B99CCAC8B6433198`. The manifest is unchanged; the background identifies this uncommitted diagnostic patch. No pagination implementation fix was justified. Suggested human commit after review: `chore: expose sanitized provider pagination diagnostics`.

## Historical next human observation (superseded)

One more live observation is required. This task follows case C (static evidence cannot distinguish the live branch). The full chain/failed response semantics now distinguish a provider-premature terminal, repeated/cyclic token, empty continuation, changing totals, bad membership/count/source evidence or an internal timeout/budget. A contradicted source assumption requires a separate human/spec decision; diagnostic failure cannot approve production.

1. Review the unstaged patch. In `chrome://extensions`, reload the existing unpacked extension at `C:\Dev\likedex\.output\provider-validation\chrome-mv3`. Close old Options/observation tabs and reopen **Extension options**. Do not load any TEST COMPOSITION directory.
2. Confirm **Likedex — RELEASE VALIDATION ONLY**, version **0.1.0**, ID **mmefiakgfhddiojfdnkfpfpbkgbfgkgj**. Confirm build hashes above and the existing production OAuth/read-only configuration. No new permissions, client or account manipulation is required.
3. Confirm connected/read-only and the expected channel locally. If Connect is offered, record the agreement if required, click **Connect YouTube** once and complete consent. If already connected and eligible, retain that connection. Stop on any connection/precondition failure and share only its sanitized diagnostic.
4. Open **non-destructive provider observation** from the Options banner, close other Likedex pages, and click **Observe provider without syncing** once. Keep that page open until the final result. Do not click normal Sync or change likes.
5. Copy the **entire final sanitized JSON**, including `enumerationDiagnostic.pageChain`, `reasonCode`, counts, latest total/token presence and `internalStop` (plus optional auth `diagnostic`). Record actual time/timezone, Chrome version, source base plus patch/build hashes and unpacked install mode. The temporary evidence expires ten minutes after the last update. Share no DevTools/HAR/raw response, IDs, titles or tokens.
6. Report the result for assessment, then disable the validation package as in the runbook. Production Sync/pruning stays closed and successful live validation/approval remains pending. Phase 8 has not begun.
