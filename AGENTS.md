# Likedex agent instructions

## Product and phase boundary

- Name: **Likedex**; internal identifier/database: `likedex`; environment prefix: `LIKEDEX_`.
- YouTube Liked Videos only; local-first browsing; read-only YouTube access.
- This repository currently contains specifications only. Human review and a specification/context commit must precede scaffolding or implementation. Do not stage or commit without authorization.
- Read [product](docs/product-spec.md), [engineering](docs/engineering-spec.md), [acceptance](docs/acceptance-criteria.md), and the current [plan](docs/implementation-plan.md) before coding.

## Critical invariants

- Never remove membership as no longer liked without trusted complete enumeration for the same owner and attempt. HTTP success is insufficient. Separately authorized Clear, Disconnect, invalid-authorization cleanup and freshness expiry delete local data for their stated reasons; never describe them as reconciliation.
- One local mirror belongs to one stable YouTube channel ID. Never merge, reconcile, or prune across identities.
- Persist active attempt truth; worker memory is disposable. An ordinary sync failure preserves latest success while the dataset remains authorized and unexpired. Data deletion also removes associated success/attempt metadata.
- Infrastructure errors must not become empty, idle, or never-synced states.
- Clear Local Data deletes the mirror without revoking authorization. Disconnect revokes/invalidates authorization, blocks sync and targets immediate deletion of all stored YouTube Authorized Data; successful Disconnect leaves no browsable mirror. Report revocation and deletion failures separately and fence late writes.
- **B-01 resolved by human decision:** enforce the [retention contract](docs/release/privacy-and-data.md#b-01-resolved-human-decision). Refresh or delete applicable API data by its 30-calendar-day deadline; reject expired data before use/export, enforce on waking after inactivity, and delete associated data when authorization cannot be validated/refreshed. Do not add an alarms permission without demonstrated need.

## Architecture and scope

- Keep auth, provider validation, domain/sync, storage, runtime messaging, query logic, and UI boundaries clear.
- No backend, generic playlist architecture, production mock-data imports, or speculative scaling infrastructure.
- Preserve the [explicit non-goals](docs/product-spec.md#non-goals); scope additions require a human decision.
- Keep fixtures and test composition separate from the production build graph.

## Quality and workflow

- Inspect before editing; use strict TypeScript and runtime validation of external data.
- Run the smallest relevant verification first; future phase completion requires `npm run verify`. Commands do not exist during this specification phase.
- Sync/auth/storage work requires a fresh independent review before release. Do not fabricate tests, loop logs, reviews, approvals, or evidence.
- For the sync loop: at most three unsuccessful correction iterations, then stop and surface the blocker. Never weaken the pruning gate to make tests pass.
- If implementation disproves an architectural/product assumption, stop affected work, explain the evidence, amend the spec/decision with human approval where required, commit the amendment when authorized, then continue.
- No unrelated refactoring. Use the phase-specific model routing in the plan; no model orchestration is needed for specification work.

## Release and done

- Minimum justified permissions, packaged executable code, Chrome Web Store compatibility, factual privacy claims.
- Reserve stable Store identity early, before production OAuth wiring. External setup is human-controlled and not part of this phase.
- Done means acceptance criteria, authoritative verification, independent review/remediation, exact-package smoke test, release materials, and submission requirements pass. External approval may remain pending; unfinished engineering may not be described as complete.
