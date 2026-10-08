# Capstone verification and evidence

## Current verification, 2026-10-08

- Final checked product code: [`347cb3e52ba5ef6c71759b61c6be3f56d1d4e4ca`](https://github.com/vitali1024/likedex/commit/347cb3e52ba5ef6c71759b61c6be3f56d1d4e4ca). Verification ran against committed Reset View correction `d237bbf` plus the one-line CSS change subsequently committed as `347cb3e`. Later finalization changes are documentation only.
- Command **`npm run verify`**, started **2026-10-08T07:49:03.9148881+03:00**, branch **main**, Windows, Node **24.19.0**, npm **11.17.0**, WXT **0.21.4**, existing lockfile; exit **0**.
- Lint, strict types, **694 unit tests / 16 files**, production build/check, separate provider-validation build/check and **81 Chromium scenarios** passed. [Genuine full output](corrected-verification-20261008.txt); original local log SHA-256 `1ABCDE40E2771CEF9219B3FB367CCAF639355333B92E1C8E1EB80EE28083A94A`. Unit suite started 07:49:11; E2E duration 1.2m.
- **Linux CI PASS** on that exact SHA: [run 37729610838](https://github.com/vitali1024/likedex/actions/runs/37729610838), completed 2026-10-08; 694 unit / 81 Chromium, E2E 1.8m. CI uses the existing `npm run verify` workflow with locked dependencies; no Google credentials or live account tests.

### Reset View and earlier local/CI results

The approved six-file Reset View correction is [`d237bbf19995f52049e41af078f0c35b11db6c7b`](https://github.com/vitali1024/likedex/commit/d237bbf19995f52049e41af078f0c35b11db6c7b). Its Windows full verification started 2026-10-08T07:30:42.6856923+03:00 and passed 694/81; [actual output](final-verification-20261008.txt), original log SHA-256 `9F528AA4AE64A18B97D3CA26104F081E5BEACE0F5B64ADA0E7CA06526EA62111`. Restricted execution had a WXT module-resolution failure; permitted locked dependency restoration and full rerun passed, without dependency/lockfile changes.

Its source [CI run 37728348923](https://github.com/vitali1024/likedex/actions/runs/37728348923) and initial preview-tag [run 37728513315](https://github.com/vitali1024/likedex/actions/runs/37728513315) failed the existing header-spacing assertion: 694 unit passed; 80/81 Chromium passed; received 17.25px against the required 8–12px. These failures are preserved, not relabeled as passes.

The subsequent human-authorized investigation reproduced exactly 17.25px by using Verdana at 1440px: the fixed 180px filter button wrapped “Filter library,” becoming 57px high while search was 44.5px high. `347cb3e` lets the button size to its content with the 180px minimum and prevents wrapping, preserving compact full-width CSS. Measured system-ui, Arial, Verdana, Tahoma and sans-serif at 1440/1200/1024/800px: filter height 44px and gap 11px after correction. Four existing focused header/filter scenarios passed, then the complete Windows and Linux suites passed. No test case was added and no assertion was weakened; final inventory remains 694/81.

## Tester preview and demonstration, 2026-10-08

The [corrected prerelease](https://github.com/vitali1024/likedex/releases/tag/capstone-preview-2026-10-08-2) tag points to `347cb3e52ba5ef6c71759b61c6be3f56d1d4e4ca`. [Installation and limitations](../release/tester-installation.md) explain voluntary unpacked testing and the human-confirmed OAuth **Testing** audience.

| Artifact | Actual integrity result |
|---|---|
| [Tester ZIP](https://github.com/vitali1024/likedex/releases/download/capstone-preview-2026-10-08-2/likedex-tester-preview-0.1.0-347cb3e-chrome.zip) | 1,509,198 bytes; SHA-256 `3C664881E8A4A54512E204E8E9396E92C49281DC8B190623DB330C73400B2B07` |
| [Optional MP4 download](https://github.com/vitali1024/likedex/releases/download/capstone-preview-2026-10-08/likedex-demo.mp4) | 5,464,198 bytes; SHA-256 `3AC227EA76C01621F7B5A8E542377BB11DBA4FC0AFD7F0E9A85C64844A906F6F`; 68.833333s, 1920×1080, 30 FPS, H.264/AAC |

WXT generated `.output/likedex-0.1.0-chrome.zip`; the descriptive preview copy was extracted separately. All **22** extracted files and the packaging build matched the full-verify production hashes. The archive-root manifest is MV3 version 0.1.0, Chrome 141+, with Options/Side Panel/popup/service worker, canonical icons/public Store key, read-only OAuth scope and expected minimal permissions. Existing artifact checks passed, excluding fixtures/dev-server/user databases/tokens/credentials/private keys/demo material. Production E2E loaded ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`. Extraction and equality establish a selectable manifest-root folder and package equivalence, **not a fresh human Load unpacked or real-account exact-package smoke**. No Store upload occurred.

Published/downloaded ZIP and checksum file match their local originals. The existing MP4 and its previously downloaded copy match the approved original. The first preview/tag/assets remain preserved; its ZIP was 1,509,195 bytes, SHA-256 `2ADE460ABB840992B43DF7FD05E43ACB87E7009A0CE116E44B0033550826A569`, based on `d237bbf`. The corrected release references the unchanged existing MP4 instead of duplicating it.

Full MP4 decode passed without errors; original preserved. Fresh inspection sampled the complete timeline at one-second intervals with no visible credential/account-menu/notification disclosure in those samples. The human reports earlier complete technical/visual QC and Ukrainian narration. No fresh audio-listening verdict is fabricated.

**Browser playback remains pending human upload:** installed GitHub CLI 2.100.0 supports native attachments, but the single upload attempt to [PR #38](https://github.com/koldovsky/2026-agentic-engineering-crash-course-capstone/pull/38) failed: `attaching files requires write access to the repository`. No bypass occurred. The public PR opens signed out; no inline player has yet been published or verified. [Exact manual upload and playback checkpoint](../release/demo-publication.md). The optional Release download is not evidence of browser playback.

## Independent checker and remaining gates

[Retrospective independent-checker evidence](independent-checker-review.md) records the human-reported separate ChatGPT Web / GPT-5.6 Sol High workflow, Reset View finding/recommendation, corrective commit, existing E2E correction and dated rehearsal/QC excerpts. Original transcript/model attestation is unavailable. The qualified maker ≠ checker claim is supported for the capstone UI/artifact workflow; fresh independent high-risk release/security review remains pending.

Export/Clear/complete Disconnect UI, independent auth/sync/storage/provider/lifecycle review, real-account exact-package acceptance, Store submission/publication and public OAuth verification remain unfinished. Tester preview is available; required browser demonstration remains pending. The final documentation commit is separate from the verified code SHA. It does not imply a new CI run has passed.


## Historical submission record — 2026-10-04

This record separates agent-run deterministic checks from human-reported live results. Submission documentation was added after checking the committed UI source; no production code or tests changed during submission preparation.

## Final agent-run verification

Historical final result for the 2026-10-04 submission, not the current preview.

- Checked source: [`162c0bc3b507d6885243fd87aa950b9ee3a6ef31`](https://github.com/vitali1024/likedex/commit/162c0bc3b507d6885243fd87aa950b9ee3a6ef31), `feat: deliver polished Likedex interface`.
- Windows; Node `24.19.0`; npm `11.17.0`; committed lockfile.
- Command: `npm run verify`, exit **0**, on 2026-10-04, Asia/Jerusalem. The unit suite started at 23:34:48.
- Lint, strict type checking, production MV3 build, production artifact checks, separate provider-validation build and its artifact checks all passed.
- The initial sandbox execution passed those checks but failed browser launch with `spawn EPERM`. The complete command was then rerun with permitted Chromium access and passed. This was an environment restriction, not a passing browser run.

Concise actual output from the successful run:

```text
Test Files  13 passed (13)
     Tests  541 passed (541)
Approved production Sync gate, OAuth/Store identity, manifest, entrypoints, icons, and production artifact checks passed.
Separate validation package, unchanged production identity/permissions and fixture/secret exclusion passed.
13 passed (14.5s)
```

The 13 Chromium tests cover production entrypoints and worker recovery, native fetch receiver behavior, non-destructive observation, local queries, truthful failure/expiry states, keyboard actions, modal focus, and Side Panel navigation. Populated browser test views use a separate synthetic composition; they are not real-account screenshots. This run did not start a real YouTube synchronization.

## Human-reported live results

The human's authoritative submission request reports that the production foundation was exercised against a real account, after the separately approved gate-enablement commit [`736633c`](https://github.com/vitali1024/likedex/commit/736633cc707523bd26b32d8f9c0bb7acb01f9ad5):

| First production synchronization | Reported result |
|---|---|
| Outcome | Successful |
| Accepted provider pages | 71 |
| Unique Likes memberships observed | 3,547 |
| Memberships mirrored locally | 3,547 |
| Currently available in primary browsing | Approximately 3,403 |

The human also reports successful local IndexedDB browsing, search/filter/sort/details, and a short smoke of the committed Options and Side Panel presentation. Exact live-run time, browser version, package hash, and a recording were not supplied; none is inferred. These aggregate reports contain no personal channel/video identifiers, titles, tokens, or provider dumps. The earlier [non-destructive observation](../release/live-provider-validation.md#completed-observation-record) remains a distinct result with its own hydration counts.

## Evidence-backed practices

| Practice | Inspectable evidence | What it proves |
|---|---|---|
| Context engineering | [AGENTS.md](../../AGENTS.md); [human-approved production gate amendment](https://github.com/vitali1024/likedex/commit/a70f972b6ca784cf4f457f58131188b19c2336a6); [runtime implementation](https://github.com/vitali1024/likedex/commit/826f546a86c67fa633df1bb9e2694eaf54709537) | Ownership, fail-closed pruning, and human approval constraints affected runtime wiring. |
| Specifications before code (SDD) | [Initial specifications](https://github.com/vitali1024/likedex/commit/aa46ad8c8487d02a33965999943cec3212b489be), before [scaffolding](https://github.com/vitali1024/likedex/commit/6ca6bc2861b4e23cf7d975b842c24633895a3bbe); [Phase 3 boundary amendment](https://github.com/vitali1024/likedex/commit/754fc5028fb6b251d600e07a0e5b3b66ca523c70); [terminal pagination correction](https://github.com/vitali1024/likedex/commit/3dd9744630d9a1fbe14404819d020974ed936478) | Specifications preceded implementation, and contradictions caused narrow documented corrections. |
| Verification | [RED safety regression](https://github.com/vitali1024/likedex/commit/b02dd363897aa7ef08fbd0140026372ac885af8a), [GREEN implementation](https://github.com/vitali1024/likedex/commit/85745b4b217083ccbf970edc050586b77649ea04), [verification command](../../package.json), and actual output above | The untrusted-enumeration pruning prohibition failed before implementation and passed afterward; current code also passed the authoritative checks. |
| Loop engineering | [Actual sync loop record](loops/sync-loop.md), committed with [the implementation](https://github.com/vitali1024/likedex/commit/85745b4b217083ccbf970edc050586b77649ea04) | Baseline 160 passed/1 failed; first implementation 170 passed/55 failed; narrow schema correction; second iteration 225 passed, then stop under a three-failure bound. |

At the 2026-10-04 submission audit, no committed independent checker findings were found, so maker ≠ checker was not claimed then. The 2026-10-08 retrospective evidence above supersedes that current-state conclusion while preserving the original audit's provenance. No trust-level journal, OpenSpec, Spec Kit, or Project Factory practice is claimed.

## Publication review and limits

A focused review covered the 21 existing commits and 275 distinct tracked blobs, current tracked configuration, and publishable untracked files. No actual access/refresh/bearer token, private key, password, credential file, personal API dump, or personal video/channel identifier was found. Flagged watch URLs were generated fixture IDs; the token-field literal was a synthetic persistence-rejection test. OAuth client ID and extension public key are public configuration. Generated builds, browser profiles/results, and local captures are ignored and excluded from publication. The new submission documents contain only sanitized aggregates and public code links.

At that historical submission, the demo-video link was pending. The current artifact, publication state and unchanged release limitations are recorded above. The historical 541/13 output and source/date remain unchanged.
