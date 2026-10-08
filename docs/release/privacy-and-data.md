# Likedex privacy and data inventory

Status checked 2026-10-08: implementation exists and a voluntary tester preview is being finalized. This is an engineering inventory and required data contract, not a published privacy policy or a compliance approval. Connect, Sync and local browsing are implemented; Export/Clear/complete Disconnect UI are unfinished. Store review submission, public OAuth verification and independent high-risk release acceptance remain pending. Public disclosures must match actual code, observed network behavior and applicable provider requirements before release.

## B-01: resolved human decision

**Resolved before the first specification commit.** The human owner approved policy compliance taking precedence: Disconnect revokes/invalidates access and targets immediate deletion of all stored YouTube Authorized Data; successful Disconnect leaves no mirror for browsing. Clear deletes local data without revoking authorization. Applicable Authorized Data must be refreshed or deleted within 30 calendar days. External invalid/unverifiable authorization triggers deletion and sync lockout. See [decisions D-17/D-18/D-39/D-40](../decisions.md).

The [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies), sections III.D.3 and III.E.4, set deletion obligations after revocation and refresh/delete limits for stored API data. Likedex targets immediate revocation cleanup rather than deliberate use of a grace period. Source checked 2026-10-04; recheck before release. This records a resolved product constraint, not proof of implemented compliance or external approval.

## Inventory

| Data | Origin/purpose | Planned local handling | Export/disclosure |
|---|---|---|---|
| Authenticated channel ID, optional display name, likes playlist ID | Authenticated channel response; library ownership and ingestion target | Owner singleton in IndexedDB; identity revalidated for sync | Export owner; disclose that it identifies the library |
| Liked membership, video IDs and membership source IDs | Liked playlist pages; full reconciliation | Mirrored video records, including unavailable/unknown records necessary for correctness | Export membership record DTOs; avoid raw provider payloads |
| Video title, creator channel ID/name, description, known dates/duration, thumbnail URL, availability evidence | Membership/video APIs; browse/filter/sort/details | Nullable validated fields and actual observation timestamps | Export allowlisted fields; no fabricated metadata |
| Current attempt, previous result, last success, progress/counts and sanitized error | Likedex processing; honest status and recovery | Bounded record subject to Authorized Data freshness and deletion with its source dataset | Export eligible last success/snapshot provenance only |
| Freshness provenance | Actual authorized API observations and derived-data lineage | Per-component observed/expiry times; earliest retained deadline bounds the whole dataset | Export relevant snapshot/record freshness, no auth internals |
| Generation, auth epoch, connection gate, cleanup reason and revoke/cache/delete results | Likedex control; prevent stale writes and unwanted reconnect | Minimal nonsecret control record can remain only without YouTube IDs, counts or other Authorized Data | Excluded from export |
| Query, filters, sort, page, selection, expanded row, scroll/detail route | User interaction | Surface memory; clear YouTube-derived state and cached view models on all dataset cleanup | Not exported |
| Access token | Chrome identity API; authenticated calls and revoke | Chrome-owned cache plus short-lived auth-adapter memory; no IndexedDB/application token storage | Never exported or logged |
| Privacy agreement/version if persisted | First-run informed use | Non-YouTube preference; may survive Disconnect, cleared with Clear preferences | Not exported; public wording must reflect approved controls |

No passwords or refresh tokens are collected by Likedex. Do not request users' credentials for setup or testing. The Chrome Extension OAuth client is public client configuration; private keys and client secrets are not application data and must not be shipped. Export uses an explicit safe DTO allowlist so future auth fields cannot accidentally enter it.

## Network destinations and data leaving the device

| Destination | Trigger and data sent | Boundary |
|---|---|---|
| Chrome-managed Google authentication | User Connect, permitted cached-token recovery; authentication handled by Chrome/Google | Do not intercept credentials or persist identity internals |
| `www.googleapis.com` YouTube Data API | Sync/identity and required session/periodic authorization checks send bearer authorization and necessary request parameters | Only documented read requests; no library export upload; local queries do not fetch library data |
| `oauth2.googleapis.com` revocation endpoint | Explicit Disconnect/Revoke sends token through auth adapter | Never log token; report remote outcome separately |
| YouTube image hosts such as `i.ytimg.com` | Rendering provider-supplied validated thumbnail URLs | Requests reveal ordinary connection/request information; no API bearer token; no managed image cache |
| `www.youtube.com` | User opens direct video link; browser handles navigation | Not embedded playback; normal YouTube behavior applies |
| Static homepage/privacy/support pages | User opens information/help links | Document actual hosting provider and any request logging before publication; not a Likedex library backend |

Final image/connect allowlists must be derived from real API responses and recorded in release review. Do not broaden to arbitrary URLs. Local query operations need no YouTube API call after the shared eligibility gate; periodic/session authorization checks are separate. Optional thumbnail requests are disclosed; failures need not break eligible text browsing. No video/audio media is downloaded/cached by Likedex. Clear/Disconnect removes extension-controlled cached models/URLs; do not promise erasure of browser-managed caches or user downloads outside that control.

## No collection for unrelated purposes

No analytics, telemetry, advertising, backend dataset storage, sale, or sharing for unrelated purposes. Mirrored records stay in the extension's local IndexedDB unless the user exports them. Authentication/sync/resource requests still communicate with Google/YouTube; therefore “nothing leaves the device” is not a valid claim. Review both dependency graph and observed network traffic to substantiate disclosures.

## User controls and retention

The Export, Clear and Disconnect bullets below describe required final controls. They are not user-available controls in tester preview 0.1.0. Service-level cleanup/fencing foundations and deterministic expiry checks do not establish completion of those UI flows; see [tester limitations and separate revoke instructions](tester-installation.md).

- **Export:** explicit user-initiated versioned JSON copy of eligible local data with owner, mirrored fields, last success and freshness/snapshot provenance. No credentials/tokens/browser internals/secrets. Expired or cleanup-pending data cannot be exported; an empty post-cleanup dataset is valid. Likedex cannot remotely erase the downloaded file. Import is excluded.
- **Clear Local Data:** immediate confirmed transaction removes mirrored/owner/sync/reconciliation/preference data; minimal nonsecret connection/fencing state remains. Does not revoke Google consent. Clears selections on both surfaces; no automatic resync.
- **Disconnect YouTube:** explicitly confirms revoke-and-delete effects, blocks sync, invalidates cached authorization and invokes supported remote revocation; independently attempts immediate deletion of all Authorized YouTube Data and derived owner/sync/reconciliation/attempt metadata. No intentional grace-period retention. Success leaves disconnected/no library and requires Connect plus fresh Sync. Non-YouTube control/preferences may remain. Revoke and delete failures are distinct; residual data stays inaccessible while cleanup is retried.
- **External revocation or failed required validation:** stop synchronization, close data access and attempt immediate deletion of associated Authorized Data. Session/periodic checks detect loss of access; distinguish confirmed invalidity from inability to verify after bounded recovery.
- **Freshness:** applicable data is refreshed or deleted by the 30-calendar-day deadline, independent of whether authorization remains active. Whole-dataset expiry is the initial conservative choice; freshness expiry alone does not revoke access, so a connected user may start a new explicit sync.
- **Uninstall:** extension-owned browser storage is ordinarily removed by Chrome; do not promise removal of user downloads, backups, or Google's authorization solely from uninstalling. Provide separate revoke guidance.

The earliest retained component deadline governs whole-dataset expiry. A successful sync refreshes only revalidated facts; partial sync, token renewal or reads do not renew untouched data. At expiry, or when authorization cannot be validated/refreshed, delete the authorized dataset and derived metadata. Enforce before first access, on relevant events and active timers, and at the earliest execution opportunity after inactivity, before use/display/export. Do not claim execution while the browser is stopped. Persist failed-cleanup intent, block access and retry; failures cannot be called completed deletion. Detailed clock, validation cadence and lifecycle rules are in [engineering](../engineering-spec.md#authorized-data-freshness-and-external-authorization-enforcement). No alarms permission is preselected.

Policy-required deletion is separate from removal because a video is no longer liked. It neither needs nor fabricates trusted enumeration and must not report successful remote reconciliation. The unconditional no-prune rule remains in force for untrusted remote membership results.

## Public policy and disclosure preparation

Publish accurate, accessible privacy/terms pages with real stable URLs and maintainer contact. Disclose YouTube API use, Google Privacy Policy, YouTube Terms/account permission controls, data categories/storage/sharing, bounded retention, revoke/delete behavior, Clear without revocation, user-controlled exports and relevant static-host logging. Link from first run, Settings, Store and OAuth branding. Meet required consent presentation before connected use; do not infer agreement solely from a scope prompt. Check final wording against [official policies](https://developers.google.com/youtube/terms/developer-policies) and actual implementation.

Store declarations must describe actual handling even when data remains local. Choose dashboard answers only after reviewing the final implementation and current definitions. No legal guarantee, verified-compliance badge, or completed external approval is claimed here.
