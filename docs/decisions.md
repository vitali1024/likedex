# Likedex human-approved decisions

Current authorization, 2026-10-08: the human approved Reset View commit/push, final documentation and tester publication, PR #38 updates, and the focused Linux header-spacing fix. Earlier task-specific no-commit statements describe historical boundaries. See [final provenance](agentic/capstone-verification.md).
Source: the human product owner's specification and explicit B-01 resolution supplied on 2026-10-04. These are approved directions, not model recommendations. B-01 is resolved: policy compliance takes precedence and the current decisions below encode deletion on revocation and bounded freshness. Concrete enforcement mechanisms in engineering operationalize those decisions.

Shell amendment, 2026-10-06: human Handoff A authorizes a launcher with exactly Side Panel and Full Library, canonical Package 1 branding and Package 2 popup-row treatment. Native Close requires Chrome 141+. A real Chromium 153 probe disproved context-only window scoping (`SIDE_PANEL.windowId === -1`); the human explicitly approved live panel window/visibility queries with no stored flag or additional permission. The implementation uses foreground `extension.getViews({windowId})`, visible exact-path views and authoritative SIDE_PANEL contexts, excluding ordinary tabs. Successful operations dismiss the launcher; every reopening re-queries. Close-animation contexts are transient and are never treated as proof of a completed close. This amendment is authorized as an unstaged patch; no commit or push is authorized. Historical evidence remains historical.

| ID | Decision | Why | Trade-off | Revisit trigger |
|---|---|---|---|---|
| D-01 | Product/UI/Store/OAuth brand is Likedex; identifier/database `likedex`; prefix `LIKEDEX_` | One authoritative product identity | Consistent naming discipline | Technical naming restriction confirmed |
| D-02 | Liked Videos only | Focused user value and deadline | No general library platform | Human-approved product scope change |
| D-03 | Read-only YouTube integration | Protect account state and minimize access | No editing likes/playlists | Explicit new product authorization |
| D-04 | Local-first browse/search/filter/sort/details | Fast interaction after mirroring | Local freshness must be communicated | Measured local constraints or provider-policy conflict |
| D-05 | Every sync is full enumeration plus reconciliation | Correct removal detection and recovery simplicity | More quota/latency than incremental sync | Measured quota/latency blocker after completion |
| D-06 | Trusted complete enumeration gates pruning | Prevent data loss on ambiguous responses | Conservative failures can retain stale membership | Provider contract proves a safer alternative |
| D-07 | Safe page additions/updates may persist on later failure | Useful progress without unsafe deletion | Local snapshot can be partially updated | Proven need for stronger snapshot semantics |
| D-08 | Durable MV3 attempt truth, separate latest success while data remains eligible | Worker lifetime cannot define truth | Associated metadata must also be deleted on cleanup/expiry | Lifecycle evidence changes requirements |
| D-09 | Restart full scan after interruption | Simple recoverability | Work may repeat | Measured repeated interruption makes release unusable |
| D-10 | Single stable remote-channel owner | Prevent cross-account merge/prune | Explicit replacement required | Human approves account-management scope |
| D-11 | Simple in-memory local search/filter/sort | Thousands of records are the intended scale | Local scans consume memory/CPU | Measured unacceptable performance |
| D-12 | Bounded pagination around 50; no virtualization | Predictable rendering and simpler accessibility | Page navigation | Measured UX blocker |
| D-13 | Options uses list plus persistent detail when wide | Efficient desktop browsing | Narrow layout needs adaptation | Usability evidence |
| D-14 | Side Panel uses compact list, expandable row, focused detail route/sheet | Fits the narrow surface | Separate navigation behavior | Real panel usability evidence |
| D-15 | Export versioned local JSON is in scope | User data access and portability | Schema must be maintained; import absent | Export usability or policy requirement |
| D-16 | Clear Local Data is in scope and separate from auth | Explicit user control over device data | Requires confirmation and concurrency fencing | Proven contract flaw |
| D-17 | Disconnect revokes/invalidates access, locks sync and targets immediate authorized-data deletion; Clear deletes locally without revocation | Distinct, truthful user controls | Remote revocation and local deletion can fail separately | Supported provider flow changes |
| D-18 | Revocation deletes the YouTube-authorized local mirror | Provider policy requires deletion after revocation and bounded retention unless refreshed | Users cannot browse the mirror after intentionally revoking access; reconnect needs fresh sync | Only future YouTube API policy or authoritative written approval permitting a different retention model |
| D-19 | No verification badges without authoritative data | Avoid fabricated trust | Omit decorative badges | Justified API supplies useful trust signals |
| D-20 | Sync history deferred | Avoid nonessential persistence/UI | Only current/prior result and latest success | Concrete user need after release |
| D-21 | User-facing reconciliation diagnostics deferred | Keep experience focused | Less troubleshooting detail in UI | Measured support need |
| D-22 | Watch Later deferred | Liked Videos focus | No second library source | Explicit scope approval |
| D-23 | Additional playlists and generic abstractions deferred | Avoid speculative architecture | Limited reuse | Approved product requirement |
| D-24 | Advanced caching deferred | Simpler correctness and retention | More repeated work | Measured performance need |
| D-25 | 10,000-item remote engineering and speculative indexes deferred | Realistic Capstone scope | No extraordinary remote-scale promise | Actual supported-library evidence |
| D-26 | No backend | Local-first and privacy-minimal | No server coordination/recovery | Approved unavoidable product dependency |
| D-27 | No analytics or telemetry | Privacy-minimal operation | Less usage visibility | Human-approved privacy/product change |
| D-28 | Chrome Web Store public distribution target | Real product lifecycle | Packaging, disclosures, identity, submission work | External prerequisite makes submission impossible |
| D-29 | Public OAuth verification readiness | Real-user authentication | External approval time uncertainty | Scope/provider requirements change |
| D-30 | Reserve Store identity early before final OAuth wiring | Avoid temporary-ID dependence | Early shell/package and developer setup | Official distribution flow changes |
| D-31 | Lightweight repository-native specification-driven development | Markdown/Git provide focused traceability | Manual consistency discipline | Concrete process blocker |
| D-32 | No OpenSpec | Avoid setup ceremony | No framework automation | Concrete blocker and human approval |
| D-33 | No Spec Kit | Same focused process | No framework automation | Concrete blocker and human approval |
| D-34 | No Project Factory | Deadline favors a complete product | No factory workflow | Concrete blocker and human approval |
| D-35 | Strict TypeScript, runtime schemas, deterministic checks, targeted extension E2E | Verification is architectural | Upfront test/tooling effort | Evidence supports a bounded tool substitution |
| D-36 | Exactly five planned agentic practices | Evidence quality over practice count | No unsupported claims | Actual additional practice/evidence warrants review |
| D-37 | Phase-specific model routing; Astra High not default implementation | Control usage while reviewing high risk independently | Switching sessions at deliberate boundaries | Observed task complexity or limits |
| D-38 | No implementation in specification phase; commit spec before code | Visible human decisions and SDD sequence | Explicit review/commit handoff | No automatic exception |
| D-39 | Applicable Authorized API Data must be refreshed or deleted within 30 calendar days; this is a hard release constraint | Bounded retention required by provider policy | Expiry can remove a local mirror; inactivity requires enforcement before next use | Applicable policy changes or authoritative written approval |
| D-40 | Invalid/unverifiable authorization triggers sync lockout and deletion, including external revocation | Do not retain an indefinitely authorized-looking cache after loss of access | Failed required validation can force a fresh connection/sync | Supported authorization evidence or policy changes |

## B-01: resolved human decision

The human owner explicitly approved D-17/D-18/D-39/D-40 before the first specification commit. Disconnect deletes Authorized YouTube Data immediately where practical, reports independent failures, and leaves no browsable mirror on success. Clear remains a separately confirmed local-only deletion without revoking access. Export remains an explicit credential-free user copy outside Likedex's deletion control; Import stays excluded.

Freshness provenance, bounded refresh/delete enforcement, external-revocation handling and enforcement before use after inactivity are mandatory. See the [data inventory](release/privacy-and-data.md#b-01-resolved-human-decision). B-01 no longer blocks specification approval; implementation and evidence of these contracts remain future work. No extra permission, alarms mechanism, or external policy approval is claimed.

## Specification refinements for review

The engineering/product documents select a focused detail route, page size 50, default liked-date sort, unknown-last ordering, conservative page-count trust checks, finite retry limits, and generation/auth-epoch fencing. These fill implementation gaps in the frozen request. They are not additional historical human decisions. Failure of a provider assumption must stop affected work and produce a documented amendment rather than weaken the core invariants.
