# Capstone verification and evidence — 2026-10-04

This record separates agent-run deterministic checks from human-reported live results. Submission documentation was added after checking the committed UI source; no production code or tests changed during submission preparation.

## Final agent-run verification

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

No committed independent checker findings were found. Maker ≠ checker is therefore not claimed for this submission, even though implementation and review sessions used multiple models. No trust-level journal, OpenSpec, Spec Kit, or Project Factory practice is claimed.

## Publication review and limits

A focused review covered the 21 existing commits and 275 distinct tracked blobs, current tracked configuration, and publishable untracked files. No actual access/refresh/bearer token, private key, password, credential file, personal API dump, or personal video/channel identifier was found. Flagged watch URLs were generated fixture IDs; the token-field literal was a synthetic persistence-rejection test. OAuth client ID and extension public key are public configuration. Generated builds, browser profiles/results, and local captures are ignored and excluded from publication. The new submission documents contain only sanitized aggregates and public code links.

This is a working capstone slice, not completion of every acceptance criterion or a public release. Export/Clear/complete Disconnect controls, fresh independent high-risk review, final exact-package acceptance, Store submission, and OAuth verification approval remain unfinished. The 1–2 minute capstone demo-video link is pending.
