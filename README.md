# Likedex

Likedex is a planned Chrome extension for browsing, searching, and revisiting a local mirror of your YouTube Liked Videos.

Its core principles are local-first browsing, read-only YouTube access, explicit library ownership, safe synchronization, and truthful status. Planned surfaces are a full-size Options page and a compact Side Panel, with Export Data, Clear Local Data, and Disconnect YouTube controls.

**Status:** Phase 1 tooling and minimal extension shell, based on specification commit `aa46ad8`. Options and Side Panel display foundation placeholders. The background only configures toolbar opening of the panel. Product features, production OAuth, persistence, synchronization, and release submissions remain future work.

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
| `npm run test` | Non-watch deterministic shell render tests, including the source alias |
| `npm run build` | Production MV3 extension at `.output/chrome-mv3` |
| `npm run check:build` | Inspect the existing production manifest, entries, icons and unwanted test/development artifacts |
| `npm run test:e2e` | Load the existing production build in isolated Playwright Chromium; check worker, both page mounts and panel behavior configuration |
| `npm run verify` | Lint → types → unit tests → build → artifact checks → browser shell smoke |

The browser smoke requires `npm run build` first when run alone. It tests real extension page mounting and API configuration; it does **not** exercise native Chrome toolbar clicking. For that manual check, load `.output/chrome-mv3` unpacked through `chrome://extensions`, open Options from the extension menu, pin Likedex, and click its toolbar icon to open the Side Panel. No stable Store identity is configured yet; an unpacked ID is not the production identity.

TypeScript inherits WXT's `skipLibCheck` for dependency declaration compatibility; strict checking remains enabled for project source, configuration and tests. ESLint 9 and TypeScript 5.9 are intentionally pinned within the lint plugins' supported peer ranges; npm reports ESLint 9's upstream support deprecation. Browser execution may need permission to spawn Chromium in a restricted agent sandbox. A blocked browser launch fails verification and is never treated as a passing smoke test.

Production composition lives in `entrypoints/` and `src/`. Tests live exclusively in `tests/`; production imports of tests, fixtures, mocks, demos or test runners are forbidden by lint. No fixture data or runtime fixture switch exists. Future domain/provider/storage/runtime/query tests and the separate product E2E fixture composition must extend verification as their phases are implemented, reaching the full contract by Phase 10. Current foundation results do not establish product or release acceptance.

The original foundation icons are a white L on a dark square, checked in at 16, 32, 48 and 128 pixels. Regenerate them with `node scripts/generate-icons.mjs`. Final Store assets and exact-package smoke testing belong to later release work.

After human review of Phase 1, the next external step is a Chrome Web Store **draft** upload to reserve a stable Likedex extension identity (Phase 11A), before production Chrome Extension OAuth configuration. No Store or OAuth resources are created by this scaffold.

## Documentation

- [Product specification](docs/product-spec.md)
- [Engineering specification](docs/engineering-spec.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Human-approved decisions](docs/decisions.md)
- [Implementation plan and model routing](docs/implementation-plan.md)
- [Verification strategy](docs/verification-strategy.md)
- [Chrome Web Store release](docs/release/chrome-web-store.md)
- [OAuth verification readiness](docs/release/oauth-verification.md)
- [Privacy and data inventory](docs/release/privacy-and-data.md)
- [Agentic Engineering evidence plan](docs/agentic/evidence-plan.md)
- [Repository instructions](AGENTS.md)

The release goal is a production-ready extension submitted to the Chrome Web Store and prepared for public Google OAuth verification. Product implementation, independent review, exact-package release checks and submissions remain planned. Likedex is being developed as an Agentic Engineering Capstone; evidence is recorded only as work actually occurs.
