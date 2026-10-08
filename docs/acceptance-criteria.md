# Likedex acceptance criteria

Status: stable acceptance contract; implementation and deterministic checks exist, with [dated verification evidence](agentic/capstone-verification.md). Not every criterion has passed: data-control UI, independent high-risk review, exact-package real-account acceptance and public release gates remain unfinished. B-01 is resolved by human decision. U = unit/domain; P = provider contract; S = storage; R = runtime integration; E = real-extension automated; M = manual production/package; D = document/release evidence. Tests asserting preservation after ordinary sync failure seed an authorized, unexpired dataset. They do not prohibit separate Clear/Disconnect/authorization/expiry cleanup. A passing suite does not establish unperformed manual or external approvals.

## Authentication and ownership

| ID | Observable acceptance condition | Layer |
|---|---|---|
| AC-AUTH-001 | Fresh install is disconnected; Sync is rejected without starting remote calls. Connect explains read-only/local storage/revoke controls before interactive consent. | R, E |
| AC-AUTH-002 | Explicit Connect requests only youtube.readonly and establishes validated channel identity; no background path opens consent. | R, M |
| AC-AUTH-003 | Consent cancellation/denial never creates success. A cancelled new Connect does not itself delete an eligible mirror; confirmed loss of required authorization invokes separately reported cleanup. | U, R |
| AC-AUTH-004 | Cached access works while connected; a 401 triggers at most one cache eviction/noninteractive reacquisition and owner recheck; failed authorization recovery stops sync and invokes authorized-data deletion. | U, R |
| AC-AUTH-005 | OAuth client/extension-ID misconfiguration is distinguished from permission denial and empty remote membership. | P, M |
| AC-AUTH-006 | Local disconnect durably blocks future sync, including after restart and despite a Chrome cached token; only explicit Connect may enable sync again. | R, E |
| AC-AUTH-007 | Disconnect attempts supported grant revocation, cache invalidation and immediate Authorized Data deletion; report all three outcomes separately. Cache eviction alone is not remote revoke success. | R, M |
| AC-AUTH-008 | Reconnect after successful Disconnect, even to the same channel, starts without prior mirror/owner/sync metadata and requires fresh ownership validation plus explicit full Sync. | R, E |
| AC-AUTH-009 | External revocation/invalid grant, or inability to complete a required authorization check after bounded recovery, fences sync and deletes associated Authorized Data; confirmed invalidity and transient verification failure have distinct messages. | R, S, M |
| AC-IDENTITY-001 | Owner identity uses authenticated YouTube channel ID; equal display names with different IDs are different owners. | U, P |
| AC-IDENTITY-002 | Missing/multiple ambiguous channels or missing likes playlist blocks ingestion with an identity error; no guessed playlist or first-channel selection. | P |
| AC-IDENTITY-003 | Different-channel reconnect writes/prunes zero membership before explicit transition approval and presents both identities. | R, S |
| AC-IDENTITY-004 | Cancel/Keep on mismatch leaves the mirror intact and sync blocked; Replace revalidates candidate, confirms local deletion, clears and binds atomically, then waits for Sync. | R, E |
| AC-IDENTITY-005 | A stale replacement confirmation or auth change during a scan/finalization rejects writes for the wrong owner/generation/epoch. | S, R |

## Synchronization and reconciliation

Running-sync criteria use an approved production provider validation gate or an explicitly enabled gate in separate deterministic test composition. Before live approval, production must instead satisfy AC-SYNC-013; this permits Phase 6 runtime/MV3 implementation without claiming production enablement. Provider provenance, owner-check receipts and trusted-finalizer invariants apply unchanged when enabled. Independent retention/authorization cleanup and data controls remain required while the gate is closed.

Release evidence status, **2026-10-04**: **live provider validation COMPLETE / APPROVED; production Sync gate ENABLED; first real synchronization smoke STILL PENDING**. The [successful observation and human acceptance](release/live-provider-validation.md) satisfy the committed provider-validation prerequisite; the separate authorized gate change admits explicit production Sync into existing preconditions. Missing/malformed/disabled gates still reject mutation-free. Deterministic enabled-composition verification does not establish real-account persistence/finalization, independent review or release readiness; no Phase 8 work is included. Stable acceptance conditions and trust/pruning invariants are unchanged.

| ID | Observable acceptance condition | Layer |
|---|---|---|
| AC-SYNC-001 | Empty local DB plus a valid nonempty remote sequence produces a persisted owned mirror and committed success with correct counts. | U, S |
| AC-SYNC-002 | Every new attempt starts at the first remote page, including after previous success, failure, or interruption. | U |
| AC-SYNC-003 | Start persists preparing and acknowledges an attempt before a held provider request resolves; controlled fixture acknowledgement is within 1 second. | R |
| AC-SYNC-004 | Duplicate starts from Options and Side Panel yield one active attempt and one enumeration; both surfaces receive the same attempt ID. | R, E |
| AC-SYNC-005 | Checking/scanning/applying/finalizing/terminal states follow durable transitions. Active determinate progress uses rawItems / positive provider-estimated total (including duplicate-video items), nearest whole-percent rounding and 0–100 visual clamp. Approximate denominator is labeled; null/zero/invalid total is indeterminate with no fake current value/ETA. Preparing shows phase only; finalizing preserves its checkpoint without declaring completion. Both surfaces retain stable browsing through updates. | U, E |
| AC-SYNC-014 | Matching durable success settles into one compact summary with mirrored membership count/update time and no repeated primary last-success timestamp. Terminal failure/partial/interruption retains the earlier successful count/time and typed error. Page/raw/unique/change metrics are in Sync details. Healthy active work suppresses the partial warning; terminal unreconciled revision warnings remain. | U, E |
| AC-SYNC-015 | Header Sync status and temporary expanded progress/error strip retain truthful active/progress/retry/error/partial/never-synced presentation. Sync details has semantic Status/Scan/Library snapshot/Changes/Timing groups for matching attempt/owner/generation success with no duplicate event. Later/current attempts and earlier success are separate. Refreshed describes re-observed existing videos; unique videos are distinct video IDs; estimates retain ~; unfinished attempts have no invented Removed count. Only phase/retry is live-announced. | U, E, M |
| AC-IDENTITY-006 | Normal connected account prioritizes channel name (truthful fallback), connected/read-only text and optional keyboard-accessible Connection details containing stable ID. Raw ID is not routinely visible; mismatch still exposes both IDs and blocks Sync. | U, E |
| AC-SYNC-006 | A network failure before any safe commit reports failure; after safe commits reports partial, retains those updates, and performs no pruning. | U, S |
| AC-SYNC-007 | Ordinary later failed/interrupted sync preserves latestSuccessfulSync while the dataset remains eligible; cleanup removes associated metadata and reports its actual reason, not successful empty sync. | S, E |
| AC-SYNC-008 | Worker reinitialization marks prior-instance active work interrupted; retry begins at page one; persisted terminal success stays success. | R, S |
| AC-SYNC-009 | 429, selected 5xx, and network failures obey per-request/attempt/backoff/deadline caps and Retry-After rules using a deterministic clock. No infinite loop. | U, P |
| AC-SYNC-010 | Daily quota exhaustion, malformed data, permission denial, and identity mismatch do not enter blind transient retry loops. | P, U |
| AC-SYNC-011 | Runtime loss or invalid status response displays status unavailable; it does not overwrite durable attempt truth or trigger blind mutation replay. | R, E |
| AC-SYNC-012 | Clear/Disconnect/authorization/expiry cleanup remains serviceable during held page, hydration, backoff or Connect; late writes, finalization and stale Connect/export completion cannot cross generation/auth-epoch/deadline guards. | S, R |
| AC-SYNC-013 | Before successful live-provider evidence and explicit human approval, production defaults to a closed gate. A valid SYNC START returns typed provider-validation-required before any request-induced storage/sync mutation: no attempt, ingestion, owner/video change, synchronization freshness refresh, bookkeeping/revision write, finalization or pruning. Missing/malformed configuration and automated fixture success cannot enable production; an explicitly injected enabled test gate retains every trust invariant. Independently triggered lifecycle/cleanup duties remain in force. | R, D |
| AC-RECON-001 | One and several additions and metadata updates are applied; existing unrelated items remain until trusted completion. | U, S |
| AC-RECON-002 | One and multiple absent videos are pruned only for a trusted completed enumeration of the same owner. | U, S |
| AC-RECON-003 | Malformed HTTP-200 JSON and schema-invalid success responses cannot delete any pre-existing membership. | P, S |
| AC-RECON-004 | Missing items/container/identity, partially mappable records, or unaccounted membership forbids completion capability and all pruning. | P, U |
| AC-RECON-005 | Explicit valid terminal items=[] with zero total is successful empty membership and may prune all records; missing items is not equivalent. | P, S |
| AC-RECON-006 | Single page, exactly 50 items with/without valid continuation, and multiple pages follow tokens rather than inferred page length. | P, U |
| AC-RECON-007 | Repeated/invalid tokens, duplicate playlist-item IDs, inconsistent totals, or premature/incomplete chains fail closed with no pruning. | P, U |
| AC-RECON-008 | Distinct playlist-item IDs referring to the same video deduplicate records/counts as specified without losing membership evidence; conflicting IDs invalidate trust. | P, U |
| AC-RECON-009 | Private/deleted/unavailable video metadata keeps valid liked membership internally; omission from videos.list never means unliked. | P, S |
| AC-RECON-010 | Unknown liked date/channel/duration/availability remains explicit; publication date is never relabeled date liked. | P, U |
| AC-RECON-011 | A transport/malformed metadata failure after membership progress results in partial/failure and no pruning; valid optional omissions are representable. | P, S |
| AC-RECON-012 | Final transaction failure rolls back both pruning and success metadata; prior page updates and earlier latest success survive. | S |
| AC-RECON-013 | Crash after final commit but before notification is recovered as success; crash before commit cannot leave pruning without success metadata. | S, R |
| AC-RECON-014 | UI flags, arbitrary trusted booleans, cancelled attempts, and mismatched evidence cannot invoke the destructive repository path. | U, S |

## Storage and local library

Current lifecycle amendment, 2026-10-07: the same-document retention contract below supersedes the historical hidden-surface disposal expectation; expiry/authorization/clock/context gates remain required.

| ID | Observable acceptance condition | Layer |
|---|---|---|
| AC-LIFECYCLE-007 | Fresh Full Library/Side Panel remount creates authoritative observations and final header architecture from first paint. Concurrent snapshot/auth consumers share ordinary authorization work; AUTH_STATUS_GET awaits it rather than fabricating pending. True Sync-owned pending remains data-free and snapshots remain blocked. No healthy-bootstrap false unavailable or ready-library/checking-auth combination, duplicate provider check or post-success recovery retry. No persistent cross-document UI cache; all context/owner/deadline/clock and same-document retention gates remain. Native panel smoke is separate and required. | U, E, M |
| AC-STORAGE-001 | Browser/worker restart preserves an eligible mirror and metadata without token persistence; expiry or pending cleanup is enforced before exposing data, and no removed owner/attempt/success metadata is restored. | S, E |
| AC-STORAGE-002 | Page upserts/checkpoint/revision are atomic; a failed write cannot claim accepted progress; retry cannot double-count a page. | S |
| AC-STORAGE-003 | Failed storage reads/writes show typed errors; a failure to save error state is disclosed rather than represented as durable success/failure. | S, R |
| AC-STORAGE-004 | Snapshot readers see a coherent revision and owner; out-of-order response arrival cannot regress rendered state. | S, R |
| AC-LIFECYCLE-001 | Five ordinary same-document idle hide/show cycles and focus alone retain eligible rows, auth identity, snapshot-derived Sync summary, query/filter/sort/page/selection/detail/scroll/draft/chips without loading, disabled controls or count reset. Snapshot/auth request deltas are zero. Initial mount/remount still loads authoritative observations. | U, E, M |
| AC-LIFECYCLE-002 | Hidden UI timers pause while revision subscriptions survive. Active Sync return catches up with one snapshot read without blanking eligible rows, then restores visible polling. Same-context hidden revisions coalesce into one catch-up; focus following visibility adds no duplicate reads. Genuine newer revisions during a read retain stale-response rejection and necessary rereads. | U, E, M |
| AC-LIFECYCLE-003 | Generation/auth-epoch or authorization invalidation while hidden immediately fences rows/identity and held replies; old data never reappears on return. Expiry and backward-clock checks run synchronously before visible reuse/actions. Clear/Disconnect fences are exercised through their authoritative contexts; explicit Connect/Sync acknowledgement recovery/Retry/expiry refresh remain effective. No persistent UI cache, automatic Sync, background polling or new permission. | U, R, E, M |
| AC-STORAGE-005 | Repeated attempts retain only current/prior result and latest success, without implementing an unbounded sync history. | S |
| AC-LIBRARY-001 | After the shared eligibility gate, search/filter/sort/page/details use eligible local snapshots and issue zero YouTube API calls themselves. Session/periodic authorization checks are separate; no browsing survives successful Disconnect. | U, E |
| AC-LIBRARY-002 | Primary list includes only available records; no-available differs from no membership and no search matches. | U, E |
| AC-LIBRARY-003 | Search normalization and all-term matching work across title/channel; empty/whitespace query restores eligible results. | U |
| AC-LIBRARY-004 | Channel, duration boundaries (240/1200 seconds), and chosen date-basis inclusive ranges combine correctly; unknown values fail only relevant active filters. | U |
| AC-LIBRARY-005 | All seven sort modes are deterministic; unknown values last in both directions; ties resolved by video ID. | U |
| AC-LIBRARY-006 | Pages render at most 50 rows; query/filter/sort resets page; data change clamps invalid pages; zero results disables navigation. | U, E |
| AC-LIBRARY-007 | Selection survives data updates by ID when eligible; removal/ineligibility clears selection or shows unavailable details, without stale actions. | U, E |
| AC-LIBRARY-008 | Open uses the validated direct YouTube watch link; Copy writes that same link and reports clipboard failure truthfully. | U, E, M |
| AC-LIBRARY-009 | Missing thumbnail/network resource leaves usable text and placeholder; no guessed badges or statistics appear. | E |
| AC-LIBRARY-010 | With a deterministic 3,000-record fixture, search/filter/sort completes within 200ms at the 95th percentile over 20 runs on the documented reference desktop after warmup; no UI render exceeds page bound. Investigate failure before adding infrastructure. | U, M |
| AC-LIBRARY-011 | Both surfaces expose direct searchable native-checkbox Channels inside one stable Filter library draft editor: stable-ID OR, [] = all, title/fallback labels, collision-only exact IDs and hidden selection retention. channels/dateBasis/from/to drafts leave committed counts/rows/page/chips/badge/selection/detail unchanged until one validated Apply resets page 1/closes. Dismissal discards; reopening copies committed state. Clear channels edits only draft channels; Clear filters resets draft channel/date fields and preserves search/duration/sort. Ineligible snapshots expose no stale controls/chips. | U, E, M |
| AC-OPTIONS-003 | Duration/Sort/Date basis share dependency-free dark themed SingleSelect menus with distinct hover/selected/check/outlined active states and one shared chevron. Filter library opens at bounded stable geometry with internal scrolling/reachable footer; its fixed-size committed badge counts groups (0–2). Reversed-date error disables Apply. Controls and Reset view fit Full Library 800/1024/1200/1440 and Side Panel 320/360/480px. | U, E, M |
| AC-OPTIONS-004 | Secondary Reset view remains on the library/list view on both surfaces, uses one reset path for INITIAL_QUERY, page 1, selection/detail/notice/scroll and popovers/draft search, and is disabled in the initial view without selection. Wide Full Library split presentation retains the normal library toolbar, including Reset view when a detail pane is open. Exclusive detail presentations hide the toolbar and expose only Back to library; no separate Reset control or row appears inside details. Back preserves browsing state with unchanged restoration behavior. Account/privacy/mirror/Sync/outside preferences remain unchanged; no remote request or permission. | U, E, M |
| AC-OPTIONS-005 | Both Full Library / Options and Side Panel use canonical compact Account/Sync icon disclosures in one header row with no normal rail/cards, permanent account/read-only/phase/time prose or status chevrons. DOM/visual order is brand/Connection status/Sync status/explicit Sync/Privacy; Full Library aligns brand left and controls right. Shared 36px controls reuse connection/sync vectors, real-state badges, actual channel/access/phase/freshness names, title tooltips and structured full-ID/count details. Only active glyphs spin, honoring reduced motion; only phase is live. Full Library is 64px at 800/1024/1200/1440; Side Panel is 54px at 320/360/480. Disclosures remain bounded and preserve keyboard/dismissal/focus without layout shifts. Active/error/mismatch/onboarding expand below header. Library geometry/structure, filters, pagination, focus, media and D+.2 lifecycle/security contracts remain intact. | U, E, M |

## Surfaces, controls, and accessibility

| ID | Observable acceptance condition | Layer |
|---|---|---|
| AC-OPTIONS-001 | Full-size Options shows library and persistent detail, connection/current sync/last success, controls/counts, and settings. | E, M |
| AC-OPTIONS-002 | Narrow Options switches to reachable detail/back navigation without horizontal clipping and preserves context. | E |
| AC-SIDEPANEL-001 | Packaged Side Panel mounts; native toolbar opens the launcher and its explicit Open/Close row operates the global panel in the current window. | E, M |
| AC-LAUNCHER-001 | Toolbar popup contains canonical Likedex branding/tagline and exactly two native primary buttons: Open/Close Side Panel and Open Full Library. No library/search/filter/sort/sync/settings/detail workflow or data observer exists. | U, E, D, M |
| AC-LAUNCHER-002 | Chrome SIDE_PANEL contexts plus window-scoped visible extension views determine the panel label at mount/resume/after success; another-window panel or ordinary panel-URL tab cannot set Close here. Handle context window ID −1 without stored state. Real window-scoped Open/Close APIs run directly from activation; successful panel actions dismiss the launcher. | U, E, M |
| AC-LAUNCHER-003 | Query failure leaves a mounted launcher with unknown/disabled panel action and independent Full Library; operation failures preserve label, sanitize errors and allow retry. Pending controls are disabled/busy; keyboard order and visible focus work, with no switch role. | U, E |
| AC-LAUNCHER-004 | Full Library uses native openOptionsPage with existing options.html/open_in_tab semantics. Production popup/paths, exact permissions, Chrome 141 minimum and source-package canonical hashes pass artifact checks; diagnostic composition remains isolated with Sync blocked. | U, E, D |
| AC-SIDEPANEL-002 | Compact rows expose essential metadata; expanding a second row collapses the first; inline content stays compact and has labeled actions. | E |
| AC-SIDEPANEL-003 | View details opens a focused detail route with Back, full metadata, Open, and Copy; Back restores query/filter/sort/page/selection/expansion. | E |
| AC-SIDEPANEL-004 | Back restores scroll/focus where possible; concurrent item removal yields truthful unavailable state and predictable list/focus fallback. | E |
| AC-SIDEPANEL-005 | At a 320px-wide content fixture and short viewport, controls/dialog actions scroll without horizontal clipping; manually verify actual native Chrome limits. | E, M |
| AC-DATA-001 | User-initiated export JSON has schemaVersion, product/version/time, nullable owner, stable ordered records, latest success, snapshot/freshness provenance; empty export after completed cleanup is valid. | S, U |
| AC-DATA-002 | Export allowlist excludes tokens, credentials, auth cache, browser internals, raw errors and reconciliation/control fields even if present in test storage objects. | U |
| AC-DATA-003 | Export of eligible data during/after partial sync is coherent and honestly labeled across attempts; expiry or pending cleanup blocks residual-data export; filename has deterministic UTC form. | S, E |
| AC-DATA-004 | Clear always requires explicit accessible confirmation; cancel produces no mutation/revocation. | E |
| AC-DATA-005 | Clear removes mirror/owner/attempt/latest-success/reconciliation/library-preference state atomically and resets both UIs. Only documented nonsecret control state remains. | S, E |
| AC-DATA-006 | Clear retains connected/disconnected intent without revoking OAuth or auto-syncing; next connected Sync revalidates identity and acts as first sync. | R |
| AC-DATA-007 | Clear persistence failure is explicit and cannot be displayed as a completed reset; no stale response repopulates a successfully cleared library. | S, R |
| AC-DATA-008 | Successful Disconnect deletes all Authorized YouTube Data, derived owner/sync/reconciliation/attempt metadata and UI copies, locks sync and shows disconnected/no local library. No local-library browsing remains; only non-YouTube state may survive. | R, E, M |
| AC-DATA-009 | Settings expose no fake storage usage/history/statistics, placeholder action, or unsupported preference. | E, M |
| AC-DATA-010 | Revocation failure does not postpone immediate local deletion; deletion failure does not prevent revoke/cache attempts. Partial outcomes never display successful Disconnect; residual data is blocked from display/export. | S, R, E |
| AC-DATA-011 | Every retained Authorized Data component has validated freshness provenance; dataset expiry is the earliest retained deadline, no later than the applicable 30-calendar-day limit. Missing provenance fails closed. | U, S |
| AC-DATA-012 | Successful API refresh renews only validated facts; partial pages, token renewal, local reads/exports and success with omitted old metadata cannot extend untouched data's deadline. | P, S |
| AC-DATA-013 | Immediately before the expiry boundary data is usable only if otherwise eligible; at the boundary whole-dataset cleanup runs, blocks display/export/writes, and clears derived metadata without claiming remote likes changed. Exercise UTC/date/DST and backward-clock cases. | U, S, E |
| AC-DATA-014 | Worker/browser inactivity across expiry triggers cleanup on the first execution opportunity before data access. Open surfaces expire cached view models even if notifications are dropped; resume cannot flash stale details. | R, E |
| AC-DATA-015 | Pending cleanup survives worker loss and retries before Connect/Sync/data reads; failed deletion remains visible and inaccessible, and delayed provider/export responses cannot restore deleted data. | S, R |
| AC-DATA-016 | Initial/session and due periodic authorization validation run with bounded recovery; an expired validation gate cannot allow indefinite cached use, and an ordinary provider error with valid authorization does not itself bypass reconciliation safety. | U, R |
| AC-DATA-017 | Export clearly describes a user-controlled copy outside extension storage; no credentials or remote-file-deletion promise exists, and pending extension-held export Blobs are discarded on cleanup. | U, E, D |
| AC-A11Y-001 | Keyboard alone can connect, search/filter/sort/page, expand, inspect, Back, Copy/Open, and reach Settings with visible focus and predictable tab order. | E, M |
| AC-A11Y-002 | Dialog has role/title/description, safe initial focus, trap where modal, Escape/cancel, and focus restoration; destructive confirmation is explicit. | E, M |
| AC-A11Y-003 | Popovers/selects are labeled and keyboard-dismissable; screen reader announces major sync changes and readable errors without per-item chatter. | E, M |
| AC-A11Y-004 | Reduced-motion mode removes nonessential movement; actions remain usable with animations disabled and at 200% zoom/short height. | E, M |
| AC-A11Y-005 | Both surfaces expose labeled progressbar min/max/current and truthful estimated value text; unknown total omits aria-valuenow. Decorative internals/counts are outside live announcements. Fill/badge fit low/middle/high percentages at 360/480px Side Panel and 800/1024/1200/1440px Full Library. Reduced motion disables checkpoint transitions and indeterminate animation while preserving information. | U, E, M |
| AC-A11Y-006 | Channel search/native checkboxes/Clear channels and draft footer actions are named; opening focuses search, Tab/Space operates checkboxes without trapping. SingleSelect button/listbox/options use expanded/controlled/selected semantics and current initial active option; arrows/Home/End navigate, Enter/Space choose/close/restore, Escape closes deepest/restores, Tab exits and outside click dismisses without stealing destination focus. Date basis Escape retains filter draft; next Escape cancels/restores Filter library trigger. Verify screen-reader/zoom/native Side Panel manually. | U, E, M |
| AC-A11Y-007 | Mouse selection uses persistent tint/accent without an unnecessary keyboard frame. Primary keyboard focus has exactly one card frame, including when selected; secondary Copy/Open/View details focus retains its own ring without primary card focus. Account/Sync/count disclosures retain native keyboard activation, Escape/dismissal and trigger focus restoration. Decorative image alt remains empty. | E, M |

## Privacy, verification, and release

| ID | Observable acceptance condition | Layer |
|---|---|---|
| AC-PRIVACY-001 | Production network/build inspection finds no analytics, telemetry, backend, advertising, user-data sale/sharing integrations, remote code, or token logging. | D, M |
| AC-PRIVACY-002 | Only justified Google API/auth/image destinations and user-opened YouTube links occur; no broad host permission is present without reviewed necessity. | D, M |
| AC-PRIVACY-003 | Inventory, consent text, privacy policy, Store disclosures, and implementation agree; no “nothing leaves device” claim appears. | D, M |
| AC-PRIVACY-004 | Release verification proves the human-approved revoke/delete and bounded refresh/delete contracts, external-revocation cleanup and inactivity enforcement. Lifecycle/timer sufficiency is documented; any added alarms permission has demonstrated need and updated disclosure. | D, M |
| AC-PRIVACY-005 | First-run privacy agreement and persistent policy/service terms links are accessible; external text/URLs cannot execute scripts or receive API tokens. | E, M |
| AC-VERIFY-001 | Clean install with pinned toolchain/lockfile passes authoritative npm run verify: lint, strict types, deterministic tests, production build checks, targeted extension E2E. No required suite silently skips. | D |
| AC-VERIFY-002 | CI runs the same authoritative command without live Google OAuth and records failures as failures. | D |
| AC-VERIFY-003 | Production bundle has no fixture/mock import or activation switch; deterministic extension test composition is separately built and identified. | D |
| AC-VERIFY-004 | Genuine red test commit and later green commit prove untrusted enumeration cannot prune; evidence cites actual commands/results. | D |
| AC-VERIFY-005 | Real sync loop stops at verify:sync green or escalates after three unsuccessful corrections; only actual iterations are recorded. | D |
| AC-VERIFY-006 | Fresh independent checker reviews sync/auth/storage/lifecycle risks; accepted findings have fixes/regressions or explicit human disposition; final verify passes. | D |
| AC-RELEASE-001 | Specification/context commit precedes all scaffold/application commits; only allowed documentation exists at specification handoff. | D |
| AC-RELEASE-002 | Early draft establishes stable Store ID/public-key strategy before production Chrome Extension OAuth client/auth integration. | D, M |
| AC-RELEASE-003 | Production manifest has valid nonzero release version, explicit toolbar/Side Panel/Options wiring, minimal permissions, correct stable ID/client/scope. | D, M |
| AC-RELEASE-004 | Reproducible clean build yields inspected release ZIP with recorded commit/tool versions/content hash; exact extracted package passes real-account smoke checklist. | D, M |
| AC-RELEASE-005 | Store icons/screenshots/copy/category/support/homepage/privacy/distribution fields are complete and submission receipt exists, or a precisely evidenced external prerequisite blocks submission. | D |
| AC-RELEASE-006 | Public OAuth branding/scope/domain/policy/demo/test procedure materials are ready and submitted when applicable; approval is tracked separately from preparation. | D |
| AC-RELEASE-007 | A 1–2 minute demo and final Capstone submission link actual product/verification/evidence and distinguish pending external review from incomplete engineering. | D |

Together these criteria define product and engineering completion. B-01 is resolved in the specification; only future execution can prove implementation, production OAuth behavior or Store readiness.
