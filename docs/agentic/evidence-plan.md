# Likedex Agentic Engineering evidence plan

Status: plan only. No tests, loop execution, checker findings, CI run, release submission or completed practice evidence is fabricated here. Claim exactly the five practices below unless later real evidence and human review justify another claim. The final Capstone PR should distinguish artifacts that exist from planned work and link exact commits/runs.

| Practice | Artifact that will prove actual use | When naturally generated | Must not be fabricated | Likely link in final Capstone PR |
|---|---|---|---|---|
| Context Engineering | Committed AGENTS.md plus concrete later examples of an agent following its ownership, verification or scope instructions | Spec commit and implementation slices | Invented adherence transcripts or a claim that merely writing instructions proves they were followed | AGENTS.md at spec commit; implementation turn/commit with relevant action |
| Specification-Driven Development | Specification/context commit before code; explicit human B-01 decision encoded before that commit; acceptance IDs linked from implementation | B-01 amendment now, authorized spec commit later, then real development | Backdated ordering, invented decisions or a claim that the uncommitted amendment already exists in Git history | Decisions D-17/D-18/D-39/D-40 at the future spec commit; later implementation/amendment commits |
| Verification | Actual npm run verify/CI results; meaningful failing test then passing behavior and full-check run | Tooling foundation, sync red→green sequence, final candidate | Made-up command output, configuration errors presented as a meaningful red assertion, passing tests never run | CI run URL; red/green commit links; test and acceptance criterion |
| Loop Engineering | A real bounded sync/reconciliation iteration log with changes, commands, outcomes and stop/escalation | Phase 5 while making verify:sync green | Retrospective invented iterations, empty template called completed evidence, hidden attempts beyond cap | Future docs/agentic/loops/ record plus exact test/commit evidence |
| Maker != Checker | Fresh independent conversation's findings against named commit, actual reruns, disposition and fixes/regressions | Phase 12 review and Phase 13 remediation | Maker self-review labeled independent; predetermined clean report; imaginary findings/fixes | Future docs/agentic/reviews/ report, checker source, remediation commits |

## Evidence sequence

Human B-01 resolution encoded in this uncommitted specification → human review and authorized spec/context commit → tooling and real verification → meaningful failing untrusted-pruning test and authorized red commit → implemented safety and green verification/commit → bounded loop record → fresh checker → fixes/regressions → verified package and actual submissions. Retention/revocation checks must distinguish policy deletion from remote-membership pruning. Some slices occur between these checkpoints; do not manipulate history to suggest otherwise.

The sync loop stops when `npm run verify:sync` passes or after three unsuccessful correction iterations. An escalation is honest evidence of the bound working. A single successful iteration is sufficient; never create artificial failures to increase the count. Follow [verification strategy](../verification-strategy.md) for the meaningful red-test control case and independent checker requirements.

The practice artifacts above remain subject to actual execution; the specification correction below records work performed during Phase 3 preparation. Do not create `docs/agentic/loops/` or `docs/agentic/reviews/` until real activity produces records. Record command, actual result, relevant commit, acceptance IDs and decisions with truthful timestamps when that work occurs. Sanitize tokens, account details and personal liked-library content before any public link.

## Authorized Phase 3 specification correction — 2026-10-04

Implementation preparation at baseline `67453f3` revealed that Phase 3 required runtime contract integration and connection UI, conflicting with the separately defined Phase 6 runtime boundary and later UI phases. Preparation stopped before implementation. The human product owner confirmed the service-level Phase 3 boundary and authorized this focused documentation amendment, while explicitly prohibiting implementation, staging and committing in this amendment task.

The [implementation plan](../implementation-plan.md#phase-3--authentication-and-remote-identity) now assigns OAuth configuration, auth/bootstrap/owner-comparison services, disconnect/revoke and cleanup foundations, injected-fake tests and documentation to Phase 3. It defers runtime contracts/handlers/routing to Phase 6 and connection/onboarding UI to Phases 7–8. The existing `channels.list` channel/Likes-playlist discovery requirement is confirmed; playlist enumeration remains deferred. Live OAuth smoke may wait for the earliest safe explicit user-triggered runtime/UI path; this amendment claims no live OAuth result.

This is an actual Specification-Driven Development correction, not implementation or independent review evidence. The amendment is an unstaged working-tree change at this handoff; link its actual human commit after it exists, without claiming it is already in Git history. Frozen product behavior is unchanged.

## Authorized Phase 6 pruning-gate clarification — 2026-10-04

During Phase 6 preparation at baseline `85745b4`, the maker identified that directly wiring production `SYNC START` to the Phase 5 service would enable finalization/pruning before the committed live-provider prerequisite was satisfied. The maker stopped before editing or implementing runtime code and reported the unresolved prerequisite. No provider incompatibility or failed live validation was observed.

The human product owner chose a fail-closed production provider validation gate: Phase 6 runtime/MV3 integration may be implemented and deterministically tested with an explicitly injected enabled test gate, while valid production Sync requests return typed `provider-validation-required` without request-induced storage/sync mutation until live evidence and explicit human approval permit deliberate enablement. Provider completion provenance, owner-check receipts, the trusted finalizer and pruning invariants remain unchanged. The [implementation plan](../implementation-plan.md#phase-6--mv3-persistence-and-runtime-messaging), [gate contract](../synchronization.md#production-live-provider-validation-gate) and AC-SYNC-013 encode this decision; the [live-validation checklist](../release/live-provider-validation.md) is pending, with no completed observations or approval.

This is an actual Specification-Driven Development clarification. This task authorizes documentation only; no Phase 6 implementation, tests, live-account action, enablement, staging or commit occurred. Link the eventual human amendment commit after it exists. No new formal loop or independent-review evidence is claimed.

## Final submission and demo

Final Capstone PR should link the five practices in the table, product/engineering definition of done, actual CI/checker state, release package identity, Store submission receipt and OAuth readiness/status. Clearly label external reviews pending; a submission receipt is not approval. No generic autonomy-log, dynamic-context, framework or factory practice claim is planned.

Suggested 1–2 minute product/engineering demonstration: briefly state Likedex's purpose; show local search/filter/detail and the compact Side Panel flow; show truthful sync/last-success and data controls; point to one critical pruning-safety regression, the specification-before-code sequence, bounded loop and independent checker evidence; end with actual submission status. Use existing real results and redact personal information. Do not stage a fake live API success or claim an unperformed review. Exact recording and submission artifacts are future work.
