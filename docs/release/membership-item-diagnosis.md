# Page-eight playlist-item privacy compatibility correction

Subsequent human evidence proved a separate terminal pagination compatibility defect after the privacy fix: page 71 had 47 valid memberships, resultsPerPage 50, no continuation and cumulative=stable total 3,547. The [terminal correction and current retry](provider-pagination-diagnosis.md) supersede this document's retry/build hashes. The privacy correction below remains in place; successful complete live validation remains PENDING and production Sync remains closed.

Inspection date: 2026-10-04. Clean source baseline: `1b8b6e5` (`chore: expose membership validation diagnostics`). The human request authorizes this narrow provider-contract correction despite historical specifications-only wording in AGENTS.md. No staging/commit, Phase 8 work, production Sync enablement or pruning is authorized or performed. This is maker verification, not independent release review.

## Proven live failure

The earlier human-run observations reached seven accepted/hydrated pages (350 memberships against total 3,547), then a decoded eighth page of 50 items with stable total, fresh continuation, observed envelope count 400 and no internal stop. Structural diagnostics subsequently proved the rejected membership had:

- Valid playlist-item kind and source ID, expected playlist association and video-resource kind.
- Valid snippet and contentDetails video IDs that agree.
- Valid liked timestamp and position; status container and privacyStatus present.
- Only `privacyStatusRecognized: false`, with reason `membership-privacy-status-invalid`.

The human explicitly confirms the unfamiliar value was a **string**. This establishes trustworthy membership identity and an over-strict local privacy enum. It does not identify the video as private/deleted or establish full live completion. No raw privacy value is required or recorded. Actual observation time, Chrome version and original build hashes were not supplied; no missing context is invented.

## Narrow contract correction

The official [playlist-item resource properties](https://developers.google.com/youtube/v3/docs/playlistItems#properties), checked 2026-10-04, describe `status.privacyStatus` as a string and do not document a closed playlist-item-specific enum. Likedex incorrectly treated public/unlisted/private as exhaustive for playlist membership.

Only playlist-item `status.privacyStatus` changes from `privacy.optional()` (the local three-value enum) to `z.string().optional()`. Recognized strings retain existing behavior. Unfamiliar strings are unknown metadata and do not invalidate membership or enumeration solely for that reason. Missing privacy leaf remains permitted. Required status container and all other schema/identity rules remain intact. The separate `videos.list` privacy/upload-status schemas remain unchanged.

The exact mapping remains the existing `{ sourceId, videoId, likedAt, position }` membership representation: playlist-item privacy is discarded, recognized or unfamiliar. No domain field or raw provider string is introduced. Unknown playlist privacy provides no known availability evidence. Existing availability mapping reads only hydrated video status: processed public/unlisted is available; explicit private/deleted/rejected is unavailable; absent usable evidence is unknown, and lookup omission is `unknown / lookup-omitted`. An unfamiliar playlist string cannot override stronger hydration evidence or force resolved availability to unknown.

## Preserved rejection and completion gates

These remain failures: wrong playlist ID; missing usable video ID; supplied IDs disagree; invalid supplied ID; non-video resource; missing/malformed source ID or item kind; missing/null/scalar/array snippet, contentDetails or status container; malformed supplied date/position types; and numeric/object/null/array/boolean privacyStatus. Unknown **strings** are the precise newly accepted case. An unusable date string remains the previously permitted null date.

Duplicate source IDs, token repeats/cycles/empty continuation, malformed envelopes, count discrepancies, transport/hydration failures, owner/attempt/generation/auth-epoch checks and cancellation/time/retry limits remain unchanged. No arbitrary page/item cap is added or raised. `TrustedProviderCompletion` still requires the entire validated terminal chain, reconciled counts and genuine in-process provenance. Production finalizer/pruning gates are unchanged.

## Sanitized diagnostics

Unfamiliar strings alone no longer enter `enumerationDiagnostic.invalidItems`. Existing boolean `privacyStatusRecognized: false` remains useful on an item rejected for another reason, without making privacy an additional rejection reason. Its source-code comment now clarifies that recognition is a metadata fact. No new aggregate/DTO/UI machinery was needed. Malformed privacy types still use `membership-privacy-status-invalid`.

Tests verify the synthetic unfamiliar string is absent from mapped records, completion/page events and final release JSON. Diagnostics persist no raw value or provider identifiers. Observation still performs only read-only precondition checks and in-memory aggregation, with equality of every seeded local store and no claim/apply/finalizer/cleanup calls.

## Deterministic regressions and verification

The synthetic generated fixture puts `synthetic-unrecognized-privacy` at page 8, item 17 (membership 367), with otherwise valid identity/date/position. It never uses the private live value.

- A focused 450-item / nine-page test accepts and preserves that membership, hydrates its ID, yields page eight, follows the exact continuation to page nine and produces genuine completion with matching counts.
- The high-value 3,547-item / 71-page provider regression verifies every membership/hydration request, opaque token, 50-ID batch (47 on the last page), page-eight identity/public hydration, 142 ingestion requests, count reconciliation and terminal-only genuine completion with all 3,547 IDs.
- The release observation regression covers the same unfamiliar page-eight string, all 71 pages, 143 requests including bootstrap, matching counts, empty invalidItems, no raw-string export and zero local-store mutation.
- Availability tests cover trusted public/private hydration, absent status evidence and lookup omission. The existing recognized-state mappings are preserved. Unknown video-resource privacy still fails its unchanged metadata schema.
- Both suites preserve identity failures and now cover five malformed privacy types. A page-eight multi-error case keeps false recognition as a sanitized fact but rejects only its actual date/position and identity/container violations.

Toolchain: Node 24.19.0 / npm 11.17.0. No live account was accessed by this task; successful full live validation and independent release review remain outstanding.

| Requested verification | Final result |
|---|---|
| Focused provider/validation | PASS: 227 tests / two files |
| `npm run lint` | PASS: no lint warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 525 tests / 13 files |
| `npm run verify:sync` | PASS: 265 tests / five files |
| `npm run build` | PASS |
| `npm run check:build` | PASS |
| `npm run build:provider-validation` | PASS |
| `npm run check:provider-validation` | PASS |
| `npm run test:e2e` | PASS: nine Chromium tests |
| `npm run verify` | PASS: exit 0, including all nine browser tests |
| `npm audit` | PASS: zero vulnerabilities; no audit fix |
| `git diff --check` | PASS |

Initial typecheck caught a new negative video-metadata fixture missing its fixture-required uploadStatus; the fixture now retains the normal uploadStatus and varies only privacy. The first authoritative run stopped at that type error. Final standalone typecheck and authoritative verification passed after correction. Initial restricted browser launch failed with `spawn EPERM`; permitted outside-sandbox execution using isolated temporary profiles passed both standalone E2E and final verify. Restricted audit could not reach the advisory endpoint/write its cache log; the permitted outside-sandbox requested audit passed. No test expectation or trust gate was weakened. Notices were Git LF-to-CRLF and Playwright NO_COLOR/FORCE_COLOR.

All ten changed files remain unstaged/uncommitted: two provider source files, three test/fixture files and five documentation files. No provider-ingestion mapper, errors, runtime gate, auth, storage or production configuration changes were needed.

## One required human retry

Review the unstaged correction. The validation package retains the existing manifest/OAuth identity. Source identity is `1b8b6e5` **plus this reviewed unstaged patch**, not the base commit alone. Use the final validation manifest/background hashes recorded below.

Final SHA-256 hashes in `C:\Dev\likedex\.output\provider-validation\chrome-mv3`:

- `manifest.json`: `4D87960FBABDE7E7A133E5A7D637F323506D3C2476B628AF40966EF8E448A3FF`
- `background.js`: `E76DCBA24A1DB133C600ABCC92D0A506558F5F847E3549C419BB767CC94982C0`

1. In `chrome://extensions`, reload the existing unpacked extension at `C:\Dev\likedex\.output\provider-validation\chrome-mv3`. Close old Options/observation tabs and reopen **Details → Extension options**. Load no TEST COMPOSITION directory.
2. Confirm **Likedex — RELEASE VALIDATION ONLY**, version **0.1.0**, ID **mmefiakgfhddiojfdnkfpfpbkgbfgkgj** and the final package hashes. Retain OAuth client `875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com`, project `likedex-extension-prod`, scope `https://www.googleapis.com/auth/youtube.readonly` and existing permissions.
3. Confirm connected/read-only and the intended channel locally. If Connect is offered, complete the agreement if required and explicitly **Connect YouTube** once. An eligible existing connection can remain. Stop on connection/precondition failure and share only its sanitized failure.
4. Open **non-destructive provider observation** from Options, close other Likedex pages, then click **Observe provider without syncing** once. Keep the page open until the final result. Do not click Sync or change likes.
5. Copy the **entire final sanitized JSON** within ten minutes of the last update: summary, pageChain, reasonCode, invalidItems, counts, hydration facts and internalStop, plus optional auth diagnostic. Confirm page eight hydrates and later pages run; success requires `status: "success"`, `bootstrapValidated: true` and `trustedCompletion: true`. Report actual counts/limitations rather than assuming the live count remains 3,547. Record actual Asia/Jerusalem time, Chrome version, source base plus patch/build hashes and unpacked install mode. Share no raw response/privacy string, IDs, titles, tokens, HAR or DevTools output.
6. Report the evidence for assessment, then disable the validation package per the [runbook](provider-observation-runbook.md). Failure remains failure; stop on any new contradiction. Successful observation still requires a separate explicit human approval and deliberate reviewed enablement change.

**Production Sync gate remains false/closed; pruning remains disabled. Phase 8 has not begun. Live validation remains PENDING until the human reruns the complete observation and its evidence is assessed.** Suggested human commit after review: `fix: tolerate unknown playlist item privacy status`. No commit is made automatically.
