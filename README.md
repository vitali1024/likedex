# Likedex

Likedex is a planned Chrome extension for browsing, searching, and revisiting a local mirror of your YouTube Liked Videos.

Its core principles are local-first browsing, read-only YouTube access, explicit library ownership, safe synchronization, and truthful status. Planned surfaces are a full-size Options page and a compact Side Panel, with Export Data, Clear Local Data, and Disconnect YouTube controls.

**Status:** Phase 7 replaces the Options placeholder with [explicit connection/onboarding and a local library experience](docs/options-ui.md), using Phase 6 [typed runtime messaging and MV3 lifecycle recovery](docs/runtime-lifecycle.md). Options supports available-only browsing, search, focused filters, seven sorts, 50-row pages, persistent wide detail and narrow detail/Back, canonical links and truthful sync/error states. Production Sync remains **fail-closed**: `provider-validation-required` is returned without request-induced storage/sync mutation until live provider evidence and explicit human approval permit deliberate enablement. Side Panel still displays its foundation placeholder; Settings/data controls and release submissions remain future work. [Live-provider validation](docs/release/live-provider-validation.md) remains **PENDING**; no real-account success is claimed.

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
| `npm run verify:runtime` | Typed messages, closed gate, clients, prompt start, recovery, cleanup, cross-client observation and deadline/resume tests |
| `npm run verify:ui` | Pure local query boundaries, unknowns, ordering, pagination, performance and Options presentation |
| `npm run build` | Production MV3 extension at `.output/chrome-mv3` |
| `npm run check:build` | Inspect production OAuth/client/scope, permissions/CSP, key/derived Store ID, entries, icons and unwanted test/development/secret artifacts |
| `npm run test:e2e` | Real production Options first run/Store ID/runtime/worker recovery plus a separate Options browser composition for local interaction, clipboard, gate UX, responsive keyboard paths and expiry; no live OAuth |
| `npm run verify` | Lint → types → unit tests → build → artifact checks → browser shell smoke |

The browser smoke requires `npm run build` first when run alone. It tests real extension page mounting, API configuration and the loaded extension ID; it does **not** exercise native Chrome toolbar clicking. For that manual check, load `.output/chrome-mv3` unpacked through `chrome://extensions`, open Options from the extension menu, pin Likedex, and click its toolbar icon to open the Side Panel. The Store public key in `wxt.config.ts` pins unpacked builds to the reserved ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`.

TypeScript inherits WXT's `skipLibCheck` for dependency declaration compatibility; strict checking remains enabled for project source, configuration and tests. ESLint 9 and TypeScript 5.9 are intentionally pinned within the lint plugins' supported peer ranges; npm reports ESLint 9's upstream support deprecation. Browser execution may need permission to spawn Chromium in a restricted agent sandbox. A blocked browser launch fails verification and is never treated as a passing smoke test.

Production composition lives in `entrypoints/` and `src/`. Tests live exclusively in `tests/`; production imports of tests, fixtures, mocks, demos or test runners are forbidden by lint. Production has no fixture data or runtime fixture switch. Playwright builds the explicitly identified `tests/options-harness/` entry into `.output/options-test-composition`; its test client injects fixture responses while Sync reaches the actual closed production background. It never overwrites `.output/chrome-mv3`. No new dependency or extension permission was added. The thumbnail CSP permits only this extension and HTTPS `i.ytimg.com`. Later surfaces/data controls must extend verification toward the Phase 10 contract. Maker results do not establish independent review or release acceptance.

The original foundation icons are a white L on a dark square, checked in at 16, 32, 48 and 128 pixels. Regenerate them with `node scripts/generate-icons.mjs`. Final Store assets and exact-package smoke testing belong to later release work.

The human owner completed the Chrome Web Store **draft** reservation with version **0.1.0**; [release documentation](docs/release/chrome-web-store.md#reserved-chrome-web-store-identity) records the reserved identity. The next upload must use a version greater than 0.1.0; Phase 7 keeps the current version. The human-supplied public project/client configuration is recorded in [OAuth readiness](docs/release/oauth-verification.md). Deterministic manifest checks establish configuration agreement, not live OAuth success or public verification. After human review/commit of Phase 7, the next phase is **Phase 8 — Side Panel Compact Experience**, recommended maker **GPT-6.1 Sol, High** for this handoff. Live observation, preserved evidence and explicit human approval must precede production sync/pruning enablement. Independent auth/storage/provider/lifecycle review remains required before release.

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

The release goal is a production-ready extension submitted to the Chrome Web Store and prepared for public Google OAuth verification. Product implementation, independent review, exact-package release checks and submissions remain planned. Likedex is being developed as an Agentic Engineering Capstone; evidence is recorded only as work actually occurs.
