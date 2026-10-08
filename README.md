# Likedex

Likedex is a Chrome extension for browsing, searching, and revisiting a local, read-only mirror of your YouTube Liked Videos.

## Demonstration and voluntary tester preview

**Watch demo / Переглянути демонстрацію:** [capstone PR #38](https://github.com/koldovsky/2026-agentic-engineering-crash-course-capstone/pull/38), the primary browser-player destination. **Native video attachment and browser playback verification are still pending human upload** because GitHub CLI requires upstream write access. The approved 68.833-second video is ready; see the [exact upload checkpoint](docs/release/demo-publication.md). A Release download is not a verified watch link.

Optional **[Download MP4 / Завантажити MP4](https://github.com/vitali1024/likedex/releases/download/capstone-preview-2026-10-08/likedex-demo.mp4)** · [tester prerelease](https://github.com/vitali1024/likedex/releases/tag/capstone-preview-2026-10-08-2) · [tester ZIP 0.1.0](https://github.com/vitali1024/likedex/releases/download/capstone-preview-2026-10-08-2/likedex-tester-preview-0.1.0-347cb3e-chrome.zip) · [Ukrainian installation guide](docs/release/tester-installation.md).

The preview is for voluntary unpacked testing on Chrome 141+. Google OAuth remains **Testing**: privately arrange test-user access with the owner before Connect. Store state remains **Draft**, with no public OAuth/Store approval claimed. [Current/historical verification](docs/agentic/capstone-verification.md) records local **694 unit / 81 Chromium PASS** on [`347cb3e`](https://github.com/vitali1024/likedex/commit/347cb3e52ba5ef6c71759b61c6be3f56d1d4e4ca), verified published hashes and **Linux CI PASS** on the corrected source ([actual run](https://github.com/vitali1024/likedex/actions/runs/37729610838)). The [separate checker evidence](docs/agentic/independent-checker-review.md) is explicitly retrospective and human-reported; independent high-risk release/security review and real-account exact-package acceptance remain pending.

Its core principles are local-first browsing, read-only YouTube access, explicit library ownership, safe synchronization, and truthful status. On **Chrome 141+**, the toolbar opens a small launcher with current-window **Open/Close Side Panel** and **Open Full Library**. Full Library is the existing full-size Options app; the popup has no library/data observation. Full Library and compact Side Panel share local search, filtering, sorting, and details. Export Data, Clear Local Data, and complete Disconnect YouTube controls remain planned.

**Status:** Options and Side Panel provide the [working local library experience](docs/options-ui.md), using [typed runtime messaging and MV3 lifecycle recovery](docs/runtime-lifecycle.md). Options supports available-only browsing, focused filters, seven sorts, 50-row pages, wide detail and narrow detail/Back; Side Panel supports single-row expansion and focused detail with restored list context. [Live provider validation](docs/release/live-provider-validation.md) is **COMPLETE / APPROVED**, and the separately approved production Sync gate is **ENABLED**. The human reports a successful first production synchronization: 71 pages and 3,547 mirrored memberships, with approximately 3,403 available in primary browsing. [Capstone verification and evidence](docs/agentic/capstone-verification.md) records the source commit, passing checks, human-reported smoke, and remaining work. Data controls, independent release review, exact-package acceptance, Chrome Web Store submission, and public OAuth verification remain unfinished.

## Foundation development and verification

Use Node **24.19.0** (`.nvmrc`) and npm **11.17.0**. Package versions are exact and `package-lock.json` records the dependency graph. The npm package and extension version are **0.1.0**.

```sh
npm ci
npx playwright install chromium
npm run verify
```

On Linux CI, install browser system dependencies with `npx playwright install --with-deps chromium`. The pinned Playwright package selects its browser revision. CI uses the same `npm run verify` command; it does not use Google credentials.

| Command | Current responsibility |
|---|---|
| `npm run dev` | WXT Chrome MV3 development build |
| `npm run lint` | TypeScript/React/hooks lint; production test-import restrictions; warnings fail |
| `npm run typecheck` | Regenerate WXT declarations and independently check strict production/test TypeScript |
| `npm run test` | Non-watch deterministic shell, domain, auth/provider, Dexie, sync, runtime and lifecycle tests |
| `npm run verify:storage` | Focused domain/storage contracts, transactions, cleanup and freshness tests |
| `npm run verify:auth` | Focused auth/request/bootstrap/ownership and service cleanup/recovery tests with injected fakes |
| `npm run verify:provider` | Focused validated membership/hydration, streaming completion, token/count anomalies and bounded request tests |
| `npm run verify:sync` | Focused domain/storage/provider, synchronization and trusted reconciliation regressions |
| `npm run verify:runtime` | Typed messages, approved production gate and fail-closed configurations, clients, prompt start, recovery, cleanup, cross-client observation and deadline/resume tests |
| `npm run verify:ui` | Pure local query boundaries, unknowns, ordering, pagination, performance and Options presentation |
| `npm run build` | Production MV3 extension at `.output/chrome-mv3` |
| `npm run check:build` | Assert approved release constant; inspect production OAuth/client/scope, permissions/CSP, key/derived Store ID, entries, icons and unwanted test/development/secret artifacts |
| `npm run test:e2e` | Real production Options first run/Store ID/runtime/auth precondition/worker recovery plus separate Options and observation compositions for local interaction, clipboard, non-destructive observation, responsive keyboard paths and expiry; no live OAuth |
| `npm run verify` | Lint → types → unit tests → production build/check → provider-validation build/check → Chromium E2E |

The browser smoke requires `npm run build` first when run alone. It tests real extension page mounting, launcher API boundaries, native Options opening, API configuration and the loaded extension ID; it does **not** exercise native Chrome toolbar clicking. For the human [launcher smoke](docs/toolbar-launcher.md#manual-smoke-still-required), load `.output/chrome-mv3` unpacked through `chrome://extensions`, pin Likedex, click the toolbar icon to open the launcher, then explicitly Open/Close Side Panel or Open Full Library. The Store public key in `wxt.config.ts` pins unpacked builds to the reserved ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`.

TypeScript inherits WXT's `skipLibCheck` for dependency declaration compatibility; strict checking remains enabled for project source, configuration and tests. ESLint 9 and TypeScript 5.9 are intentionally pinned within the lint plugins' supported peer ranges; npm reports ESLint 9's upstream support deprecation. Browser execution may need permission to spawn Chromium in a restricted agent sandbox. A blocked browser launch fails verification and is never treated as a passing smoke test.

Production composition lives in `entrypoints/` and `src/`. Tests live exclusively in `tests/`; production imports of tests, fixtures, mocks, demos or test runners are forbidden by lint. Production has no fixture data or runtime fixture switch. Playwright builds the explicitly identified `tests/options-harness/` entry into `.output/options-test-composition`; its test client injects Options fixture responses while Sync reaches the actual approved production background, whose separate real storage is disconnected. It never overwrites `.output/chrome-mv3`. The dedicated provider-validation build explicitly disables Sync and retains non-destructive observation. No new dependency or extension permission was added. The thumbnail CSP permits only this extension and HTTPS `i.ytimg.com`. Later surfaces/data controls must extend verification toward the Phase 10 contract. Maker results do not establish independent review or release acceptance.

Approved [canonical assets](docs/branding-assets.md) replace the original foundation icons. Package 1 supplies global manifest/toolbar PNGs and the smooth header vector; Package 2 supplies the border-matched popup row PNGs only. Shipping source and emitted assets are checked against package hashes; do not regenerate them. Large Store/alternate variants and archives are not included. Final Store assets and exact-package smoke testing remain later release work.

The human owner completed the Chrome Web Store **draft** reservation with version **0.1.0**; [release documentation](docs/release/chrome-web-store.md#reserved-chrome-web-store-identity) records the reserved identity. The next upload must use a version greater than 0.1.0; the current package remains 0.1.0. The human-supplied public project/client configuration is recorded in [OAuth readiness](docs/release/oauth-verification.md). Deterministic manifest checks establish configuration agreement; the separately recorded live observation and human approval preceded production sync/pruning enablement. Independent auth/storage/provider/lifecycle review remains required before release. Current verification and human smoke reports do not establish public OAuth verification approval or Store release acceptance.

## Documentation

- [Product specification](docs/product-spec.md)
- [Engineering specification](docs/engineering-spec.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Human-approved decisions](docs/decisions.md)
- [Implementation plan and model routing](docs/implementation-plan.md)
- [Verification strategy](docs/verification-strategy.md)
- [Authentication foundation](docs/authentication-foundation.md)
- [Provider ingestion](docs/provider-ingestion.md)
- [Synchronization and production gate](docs/synchronization.md)
- [Runtime and MV3 lifecycle](docs/runtime-lifecycle.md)
- [Options UI behavior and Phase 7 traceability](docs/options-ui.md)
- [Chrome Web Store release](docs/release/chrome-web-store.md)
- [OAuth verification readiness](docs/release/oauth-verification.md)
- [Privacy and data inventory](docs/release/privacy-and-data.md)
- [Agentic Engineering evidence plan](docs/agentic/evidence-plan.md)
- [Repository instructions](AGENTS.md)

The release goal is a production-ready extension submitted to the Chrome Web Store and prepared for public Google OAuth verification. Remaining data controls, independent review, exact-package release checks and submissions remain planned. Likedex is being developed as an Agentic Engineering Capstone; evidence is recorded only as work actually occurs.
