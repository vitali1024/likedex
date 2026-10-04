# Likedex

Likedex is a planned Chrome extension for browsing, searching, and revisiting a local mirror of your YouTube Liked Videos.

Its core principles are local-first browsing, read-only YouTube access, explicit library ownership, safe synchronization, and truthful status. Planned surfaces are a full-size Options page and a compact Side Panel, with Export Data, Clear Local Data, and Disconnect YouTube controls.

**Status:** specification only, awaiting human review and the first specification commit. No application, runnable verification, release package, or external submission exists. B-01 is resolved by the human-approved retention decision: Disconnect deletes the authorized mirror; Clear deletes local data without revoking access; applicable API data must be refreshed or deleted within 30 calendar days.

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

The release goal is a production-ready extension submitted to the Chrome Web Store and prepared for public Google OAuth verification. Builds, automated checks, CI, review, and submissions are all **planned**. Likedex is being developed as an Agentic Engineering Capstone; evidence will be recorded only as work actually occurs.
