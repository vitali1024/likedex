# Page-eight membership validation diagnosis

Inspection date: 2026-10-04. Baseline was clean `eb7567a254b29bfdf1e33f65b583f271a9fc5696` (`chore: expose sanitized provider pagination diagnostics`). This is a focused diagnosis and diagnostic patch, not a policy amendment, live agent-run test, independent release review or production approval. No commit/staging, Phase 8 work, Sync enablement or pruning was performed.

## Proven branch and remaining uncertainty

The human's latest real observation reports seven accepted/hydrated pages and 350 memberships, followed by a decoded eighth envelope containing 50 items, stable total 3,547, a fresh continuation and no internal stop. Its reason is `membership-item-invalid`; observed envelope count is 400 and eighth-page hydration counts are null. The excerpt omits some full-result fields and original observation time/Chrome version/build hashes; do not invent those missing details.

In baseline `validateMembershipPage`, only `playlistItem.safeParse(raw)` failure throws an unmappable-membership error with the default `membership-item-invalid` reason. `ProviderError` supplies that default and maps the error to `untrusted-enumeration / enumeration-untrusted / scanning`. The page-count gate precedes item validation. The generator has not reached hydration or its later token/total/source checks. The fresh-token evidence is an internal comparison against the preceding token set, not proof of terminal completeness.

**The specific rejected field and item ordinal are not proven.** The report establishes a schema violation on page eight. It does not identify a deleted/private video, demonstrate a provider cap, or prove an over-strict requirement is the cause.

## Every schema branch behind the original generic reason

The item schema is unchanged by this patch. Absent means missing/undefined; explicit null counts as present and can fail its type check. Every nested required object must be an object, not null, array or scalar.

| Validated field | Exact rejection condition | New structural reason(s) |
|---|---|---|
| Item itself | Not an object, including null/array/scalar | membership-item-not-object |
| `kind` | Missing, wrong type or not youtube#playlistItem | membership-kind-invalid |
| `id` | Missing; or not a nonempty string matching `[A-Za-z0-9_-]+` | membership-playlist-item-id-missing / invalid |
| `snippet` | Missing; or not an object | membership-snippet-missing / invalid |
| `snippet.playlistId` | Missing; or invalid nonempty identifier type/characters | membership-playlist-id-missing / invalid |
| `snippet.resourceId` | Missing; or not an object | membership-resource-id-missing / invalid |
| `snippet.resourceId.kind` | Missing, wrong type or not youtube#video | membership-resource-kind-invalid |
| `snippet.resourceId.videoId` | **If supplied:** not a string of exactly 11 allowed identifier characters | membership-snippet-video-id-invalid |
| `snippet.publishedAt` | **If supplied:** not a string, including null/numeric/object values | membership-liked-at-type-invalid |
| `snippet.position` | **If supplied:** not a finite, nonnegative safe integer (fractional, negative, wrong type or too large) | membership-position-invalid |
| `contentDetails` | Missing; or not an object | membership-content-details-missing / invalid |
| `contentDetails.videoId` | **If supplied:** invalid 11-character video ID | membership-content-video-id-invalid |
| `status` | Missing; or not an object | membership-status-missing / invalid |
| `status.privacyStatus` | **If supplied:** not public, unlisted or private, including wrong type/null | membership-privacy-status-invalid |

There are no other item-level refinements. Unknown extra fields are stripped, not validated. `etag`, playlist title/description/channel/thumbnail fields, `contentDetails.videoPublishedAt`, start/end/note and other extra fields cannot cause this schema failure. Missing optional leaf fields pass. An unusable **string** liked timestamp passes schema validation and maps to null; missing dates do too. Date parsing is not a membership trust gate.

Three post-schema identity branches have different existing reasons and cannot, by themselves, explain the original generic reason: syntactically valid wrong playlist ID (`membership-playlist-conflict`), both membership video IDs absent (`membership-video-id-missing`), and both valid video IDs disagreeing (`membership-video-id-conflict`). Duplicate source IDs are rejected later in ingestion under `membership-source-duplicate`. These distinctions remain intact.

## A/B/C field audit

A = membership identity/type evidence; B = playlist ownership/chain evidence; C = optional metadata that can be unknown. This classification distinguishes intrinsic identity needs from current committed structural requirements; it does not change either.

| Field | Class / intrinsic purpose | Current committed treatment |
|---|---|---|
| Item object and `kind` | A: correct membership resource | Required |
| `id` | A: source identity and duplicate-source detection | Required valid identifier |
| `snippet` | B: container for playlist association (also carries A fields) | Required object |
| `snippet.playlistId` | B: membership belongs to the bootstrapped Likes playlist | Required valid matching ID |
| `snippet.resourceId`, `.kind` | A: identify a video resource | Required object and video kind |
| `snippet.resourceId.videoId` | A: one authoritative video-ID alternative | May be absent if contentDetails supplies a valid ID |
| `contentDetails`, `.videoId` | A: second authoritative ID source | Container required by committed structure; leaf may be absent if snippet supplies a valid ID |
| `snippet.publishedAt` | C: liked-time provenance | Absent/unusable strings become unknown; wrong types fail |
| `snippet.position` | C: optional position, not used as a completeness or sort proof | Absent becomes unknown; invalid supplied numeric/type value fails |
| `status`, `.privacyStatus` | C: item privacy metadata, not identity or video availability authority | Container required by committed structure; leaf optional but validated if supplied |

Membership trust intrinsically needs source identity, association with the expected playlist, a video resource and at least one valid authoritative video ID; simultaneous IDs must agree. Owner/session/token/count/source uniqueness and full-chain completion remain separate gates. A missing rich title/channel/thumbnail/date is not evidence of missing membership or unavailability.

The current schema is conservative about required containers and supplied optional types. Requiring `status` or `contentDetails` when a usable video ID exists elsewhere may warrant a future policy discussion **if live structural evidence establishes that omission**. It is not a proven implementation bug here: the committed [provider contract](../provider-ingestion.md#runtime-validation-and-mapping) explicitly requires snippet/contentDetails/status containers, validates identifier characters, and says invalid field types fail. Missing metadata is already handled where that contract permits it. No field was relaxed or newly made mandatory.

## Official API contract review

The official [list method](https://developers.google.com/youtube/v3/docs/playlistItems/list) describes GET enumeration, requested parts and token pagination. Likedex requests id, snippet, contentDetails and status, without a fields projection. Its documentation says selecting a part includes its child properties; it does not separately describe every unavailable/legacy item shape.

The official [resource reference](https://developers.google.com/youtube/v3/docs/playlistItems#properties) describes `id` as a unique playlist-item string; video resource kind and video-ID fields; contentDetails for video items; publishedAt as playlist-addition datetime; and privacyStatus as item privacy. It expressly associates snippet.videoId presence with video kind. It does not specify Likedex's source-ID regex or promise every requested container/metadata property for every unavailable/legacy entry. The resource representation is not observed page-eight data. **Inference:** these docs do not prove which live field failed or justify changing the committed gate. No community report, placeholder title or localized text was used as destructive trust evidence.

## Diagnostic implementation and privacy

The release-only observation now includes `enumerationDiagnostic.invalidItems`, at most 50 entries for the rejected membership page. Each entry carries one-based page/item ordinals, deduplicated allowlisted `reasonCodes`, fixed boolean `fieldPresence` flags and nullable boolean checks: item/video kind, source/playlist/video ID syntax, video-ID agreement, expected-playlist match, date parsing, position validity and privacy-value recognition. Null means absent or not safely comparable; false means a supplied value fails the specified check. Actual timestamps and provider values are never returned.

Schema issues are mapped through fixed code-owned paths; no Zod issue object, message, input value or arbitrary path is serialized. `membership-schema-invalid` is a reserved safe fallback for a future unmapped schema path, not a current reachable branch claimed as live evidence. The result's top-level reason is the first invalid item's first failure reason; the list preserves all schema reasons for every invalid item on that page. Post-schema identity failures are also recorded. If schema validation fails, logical identity checks are not promoted into extra rejection reasons, but the safe comparisons still provide structural evidence when possible.

Production retains immediate failure with its broad error semantics and has no item observer. Release validation examines the remainder of the bounded page solely to collect structural evidence, then **always throws the first failure before returning any membership page or requesting hydration**. It cannot skip invalid membership, produce a completion capability, apply records or prune. Success results have an empty invalidItems list. No diagnostics are saved in extension storage; the existing temporary-view timer/resume expiry still applies.

No video/source/playlist/channel ID, title, description, timestamp value, page token, OAuth token or raw response/item/exception is included. Strict DTOs reject extra fields and arbitrary reasons. No network destination, permission, source strategy, auth logic, storage policy or completion/pruning requirement changed.

## Tests and verification

New synthetic cases cover all 20 reachable schema subreasons and the three existing identity invariants, in both direct provider and observation suites. Each verifies no completion/hydration, safe diagnostics and production rejection. Known IDs, timestamp text, invalid private-value sentinels and OAuth tokens are excluded. Strict DTO tests reject injected ID fields and arbitrary reason values. The reserved future-path fallback is not fabricated as a provider observation.

Representative accepted shapes cover snippet-only ID, content-only ID, both equal, absent videoPublishedAt/title/channel/thumbnail metadata, absent privacy leaf, absent liked date/position and unusable liked-date string. Existing unequal-ID, non-video-kind, missing source-ID and malformed-type safety assertions remain. These are synthetic boundary cases, not assertions about real unavailable videos.

A generated eighth-page regression supplies 50 items after seven valid pages, with invalid items at ordinals 17, 35 and 50. It verifies all invalid entries and multiple reasons per item, accepted count 350 versus observed envelope count 400, stable 3,547 total, fresh token, null eighth hydration counts, no trusted completion and equality of every local store. A separate date case distinguishes an unusable string from a fatal wrong type without exposing the string. The original 3,547-item / 71-page success regression remains passing.

The nine-test Chromium suite now checks actual serialized item diagnostics on the observation page, including missing contentDetails with snippet identity present and an unusable date string. It checks privacy sentinels, every local store, the closed production Sync result and evidence-view expiry. This synthetic case is not the live root cause.

Observed toolchain: Node 24.19.0 / npm 11.17.0. All first focused/source checks passed; no correction iteration was required to make a failed safety test green.

| Requested verification | Result |
|---|---|
| Focused provider/validation | PASS: 213 tests |
| npm run lint | PASS: no lint warnings |
| npm run typecheck | PASS |
| npm run test | PASS: 511 tests / 13 files |
| npm run verify:sync | PASS: 255 tests / 5 files |
| npm run build / npm run check:build | PASS |
| npm run build:provider-validation / npm run check:provider-validation | PASS |
| npm run test:e2e | PASS: nine Chromium tests |
| npm run verify | PASS: exit 0, including all nine enhanced browser tests |
| npm audit | PASS: zero vulnerabilities; no audit fix |
| git diff --check | PASS |

Browser verification used permitted outside-sandbox execution for isolated Playwright profiles. Audit used the human's existing explicit approval to share public dependency names/versions with npm's advisory service. Actual notices: Playwright NO_COLOR/FORCE_COLOR and Git LF-to-CRLF. No live account was accessed; independent release review remains pending.

Changed/new files: `src/provider/diagnostics.ts`, `youtube-schemas.ts`, `youtube-ingestion.ts`; `tools/provider-validation/contracts.ts`, `service.ts`, `entrypoints/provider-validation/main.tsx`; `tests/fixtures/provider.ts`, both provider unit suites and `tests/e2e/provider-validation.spec.ts`; this diagnosis, observation runbook, pending live-validation record and a follow-up link in the earlier pagination diagnosis. All remain unstaged/uncommitted. Suggested human commit: `chore: expose membership validation diagnostics`.

## One required human retry

The rebuilt human validation package uses the same manifest/OAuth identity. SHA-256: manifest `4D87960FBABDE7E7A133E5A7D637F323506D3C2476B628AF40966EF8E448A3FF`; background `483B243DF132E051FDDB1A171D0F87396D8AD13F521C9927C77A7D08B99B63F1`. Source identity is baseline **plus this reviewed unstaged patch**, not the baseline commit alone.

1. Review the patch. Reload the existing unpacked extension in `chrome://extensions` at `C:\Dev\likedex\.output\provider-validation\chrome-mv3`. Close old Options/observation tabs and reopen Extension options. Load no TEST COMPOSITION directory.
2. Confirm **Likedex — RELEASE VALIDATION ONLY**, version **0.1.0**, ID **mmefiakgfhddiojfdnkfpfpbkgbfgkgj**, and the hashes above. OAuth client, read-only scope and permissions are unchanged.
3. Confirm connected/read-only and the expected channel locally. If Connect is offered, complete the agreement if required and explicitly Connect once. An eligible existing connection can remain. Stop on a connection/precondition failure and copy only its sanitized failure.
4. Open **non-destructive provider observation** from Options, close other Likedex pages, and click **Observe provider without syncing** once. Keep the page open until the final result; do not click Sync or alter likes.
5. Copy the **entire final sanitized JSON**, especially `enumerationDiagnostic.invalidItems` with all ordinals/reasonCodes/flags/checks, plus pageChain and top-level reason/internalStop. Record actual local time/timezone, Chrome version, base commit plus patch/build hashes and unpacked install mode. Copy within ten minutes after the last update. Share no raw items/responses, IDs, dates, titles, tokens, HAR or DevTools output.
6. Report that result for assessment, then disable the validation package as in the runbook. A specific live structural failure must be assessed against the committed spec before any contract correction; success alone cannot approve production.

**Production gate remains false/closed. Pruning remains disabled. Phase 8 has not begun.** Exact live field identification still requires this one human observation; there is no justified contract fix in this patch.
