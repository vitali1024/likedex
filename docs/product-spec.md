# Likedex product specification

Status: specification for human review, 2026-10-04, incorporating the human-approved B-01 resolution. Choices are recorded in [decisions](decisions.md); testable gates are in [acceptance criteria](acceptance-criteria.md). The [data inventory](release/privacy-and-data.md#b-01-resolved-human-decision) defines bounded retention and deletion on revocation. B-01 is resolved; implementation and release verification remain future work.

## Problem, user, and value

People with thousands of YouTube Liked Videos need a fast way to find and revisit a video without repeatedly navigating YouTube's native library. Likedex mirrors the authenticated channel's Liked Videos and makes ordinary browsing, search, filtering, sorting, pagination, and details local. It does not download video media or modify a YouTube account.

The primary user uses desktop Chrome, authorizes access to their own YouTube channel, and wants to find a remembered video, narrow a large library, inspect metadata, then open it on YouTube or copy its link. A usable, trustworthy, publicly distributable product matters more than feature breadth.

## First run and connection

On first run, show Likedex, the local-library purpose, and a **Connect YouTube** action. Explain before consent: read-only access reads the channel's liked-video list and necessary metadata; mirrored data is stored on this device subject to refresh/deletion limits; Disconnect revokes access and deletes that mirror; Clear Local Data deletes it without revoking access. Expose privacy and service-terms links and record the required privacy agreement before enabling connected functionality.

Only a deliberate Connect action may open interactive Google consent. Cancellation/denial leaves a clear disconnected state and can be retried by the user. After authorization, establish the authoritative YouTube channel, display its name when known and a compact connected/read-only indicator, then offer **Sync**. Use a truthful unknown-name fallback. Keep the stable channel ID in optional Connection details and show both IDs directly for owner mismatch; the name is presentation only. Connection is not a completed synchronization. Missing or ambiguous channel identity is an actionable connection error, not an empty library.

After successful Disconnect or authorization-invalid cleanup, reconnect to any channel starts with no local mirror; establish ownership and require a new explicit full sync. Token renewal during a still-valid connected session may retain eligible data. If Connect selects a different channel while an eligible local mirror exists, show both identities and pause synchronization. Offer **Keep existing library** (cancel transition and leave sync blocked, subject to freshness/authorization enforcement) or **Replace local library** with explicit confirmation explaining local deletion. Allow Export only while that dataset is eligible. Replacement clears the old local dataset, binds the newly revalidated channel, and requires a new Sync. It never alters YouTube or merges libraries.

## Library interaction

The normal list contains videos whose last validated metadata supports availability. Missing/private/deleted or unknown-availability membership can remain internally for correctness, but is excluded from the primary list. Availability reflects last sync, not a playback guarantee. Show “available videos” counts distinctly from mirrored membership; do not imply the filtered list is the entire remote count.

Search uses title and channel name only. Trim and Unicode-normalize text, perform case-insensitive substring matching, and match all whitespace-separated query terms across those fields. Empty query means all available records. Search never requests YouTube data.

Combine active search and filters with AND. Filters are channel (stable ID; multiple chosen channels use OR), duration (under 4 minutes, 4 to under 20, 20 minutes or longer), and date range with explicit **Liked date** or **Published date** basis. A date-only range includes both selected local-calendar dates; convert boundaries explicitly for comparisons. Missing values fail a corresponding active filter and remain eligible when that filter is unset. Explain unknown liked dates without substituting publication dates. Panel Clear filters edits only draft channels/date fields; Reset view restores all browsing defaults.

Handoff C.1, 2026-10-07: Filter library is a stable draft editor with directly visible Channels search/checkboxes and Date basis/From/Through. Edits leave committed rows/count/page/chips/selection/detail unchanged until validated Apply filters commits once, resets page 1 and closes. Dismissal discards. Clear channels affects draft channels; Clear filters resets draft channel/date fields including date basis and preserves separate search/duration/sort. The fixed-size badge counts committed groups (channels = 1, dates = 1, maximum 2). Duration/Sort/Date basis use shared themed accessible SingleSelect menus; dates remain native. Secondary Reset view restores all browsing defaults/page/selection/detail/notices/scroll/popovers without touching mirror/account/Sync/privacy. See [current control contract](options-ui.md#handoff-c1-library-control-contract-2026-10-07); historical C evidence remains superseded.

Sort modes: liked date newest/oldest, published date newest/oldest, duration longest/shortest, title A–Z. Default is liked date newest. Unknown sort values always sort last in either direction; ties use video ID ascending. Title comparison uses a documented deterministic normalization/comparison rather than device-dependent collation. Details distinguish “Date liked unknown” from publication date.

Use 50 records per page without virtualization. Search/filter/sort changes reset to page 1. A committed data update retains a valid page and clamps an invalid page to the last valid page; zero results uses page 1 with navigation disabled. Retain selection by video ID while it remains in the current result set; otherwise clear selection and explain unavailability when appropriate. Selection may span pages within that result set. Present loading distinctly from zero results.

## Sync and recovery

Sync is explicitly user-triggered and always performs a full remote enumeration followed by reconciliation. Authorization/freshness enforcement also runs independently; it does not silently start a library scan. Acknowledge the start promptly with the authoritative attempt status; the UI stays responsive and observes progress independently. Simultaneous starts from either surface join one attempt.

Show checking, scanning, applying updates, and finalizing as distinct activities. Once scanning begins, show semantic progress derived from durable `rawItems / estimatedTotal` when the provider estimate is positive and usable. Raw processed membership items include duplicate videos; unique videos and page counts are technical Sync details. Round displayed percentages to the nearest whole number and clamp visual width to 0–100. Label the denominator approximate (for example, “1,750 of ~3,547 memberships scanned”); it is provider-reported rather than a guaranteed final library size. Unknown/zero/invalid totals use indeterminate progress and observed counts, with no fake percentage or ETA. Preparing shows its phase without an unsupported 0%. CSS may smoothly transition between real checkpoints; timers never invent progress and reduced motion disables movement.

Success is shown only after safe finalization commits, even if active scanning/finalizing reports 100%. Settle durable success into the application header on both surfaces with a sync-specific icon/check badge. Actual “Sync complete” and Updated freshness are available through its accessible name and shared details, without permanent status prose. The closed header intentionally omits mirror count; exact membership/available metrics remain in structured Sync Details and About library counts. State and freshness are separate semantic UI elements grouped with whitespace, never punctuation-separated metadata. The count describes the durable local membership snapshot, including unavailable videos, rather than a live count or playback promise. Do not repeat the same timestamp in a second always-visible last-success line when the attempt matches the latest successful snapshot. The latest success stays separate from the current/most recent attempt in the data model; matching attempt/owner/generation combines scan diagnostics and finalized results in one structured Sync details view. A later attempt and earlier success remain distinct; after ordinary terminal failure/interruption show the earlier time/count alongside the current problem while eligible. Authorized-data deletion removes associated sync metadata too.

Safe additions and metadata updates may appear before an attempt completes. Suppress the large partially-updated notice during a healthy active Sync; progress already communicates unfinished work. Retain the revision-based warning after terminal partial/failure/interruption or other unreconciled changes. Untrusted or interrupted enumeration never authorizes removal as no longer liked. A trusted empty remote library may clear membership. Separately, Clear, Disconnect and policy enforcement can delete local data, with their actual reason shown. Errors never masquerade as successful empty synchronization.

Failures identify the category and useful next action: reconnect, select the correct channel, wait for quota, retry a temporary problem, or address local storage/runtime trouble. Worker interruption is shown as interrupted after recovery, with a full-retry action. No hidden infinite retry or auto-consent. Local browsing remains usable only while authorization and freshness gates permit it. A storage read failure displays an error, not an empty state.

## Toolbar launcher and Full Library

The pinned toolbar icon opens a compact launcher with canonical Likedex branding and the tagline **Your likes, within reach.** It has exactly two primary rows: **Open Side Panel** (or **Close Side Panel** when this window's Likedex panel is open) and **Open Full Library**. Full Library is the existing full-size Options application, opened in a tab through Chrome's Options API. The popup is a launcher only, with no library rows, search/filter/sort, sync, settings, detail or data observation.

The Side Panel label comes from Chrome's Side Panel contexts plus its current-window live extension views and their visibility, never a stored toggle flag. Ordinary tabs at the panel URL are excluded. This human-approved refinement handles Chrome contexts reporting window ID −1. Open and Close use real window-scoped Side Panel APIs; failed checks show an unavailable action, while failed operations show a sanitized retryable error. Successful panel actions dismiss the launcher; the next opening queries again. Full Library remains independent. Chrome **141 or newer** is required for the real Close API. [Canonical asset policy](branding-assets.md) distinguishes the global brand/toolbar assets from the dedicated border-matched popup-row icons.

## Full Library (Options) experience

Historical Handoff D+.2, 2026-10-07 (presentation superseded by the approved icon redesign below; runtime retained): eligible global Account/Sync status is integrated into the application header on both surfaces, with no standalone normal rail or cards. Wide Full Library targets a 58–68px header; semantic Side Panel uses two compact internal rows and targets at most 96px at 360/480px. Channel title/Connected meaning/Read-only form the Connection details trigger; Sync state/freshness form the Sync details trigger. Closed headers omit raw ID and mirror count, retaining them in D+ structured disclosures. Fields remain separate elements without punctuation separators. Fresh document bootstrap shares ordinary authorization work and uses this same header shell from first paint, while same-document lifecycle retention remains unchanged. Active/error/onboarding/mismatch content may expand below the header. Refreshed/approximate estimates, availability context once in counts, centered count-free pagination, one primary focus frame and centered responsive 16:9 media remain unchanged. See [current contract and unpassed smoke](options-ui.md).

Options is the primary full-size interface: identity/header, connection status, current attempt and last success, Sync, search, focused filters, sort, result count, bounded list, persistent selected-video detail, and settings/data controls. Wide viewports use a library/detail split; narrow widths switch to list and focused detail with Back, preserving list context. No fixed breakpoint is prescribed, but supported widths must not clip controls.

Details contain full title, larger thumbnail, channel, known liked/publication dates, duration, and relevant known description. Unknown values are intentional text/placeholders. Open on YouTube opens the direct watch URL; Copy link copies that same URL and reports success only after clipboard completion. Failures remain visible. No embedded playback, guessed verification badge, hard-coded trusted-channel list, or guessed statistics.

Canonical status refinement, 2026-10-07: both Full Library / Options and Side Panel use the same compact icon-only connection and sync controls, followed by the separate Sync action and existing Privacy shield. Full Library keeps its brand left and cohesive controls right; no permanent account/read-only/phase/freshness prose or status chevrons remain. Actual values stay in accessible names and shared details. The previous verbose desktop branch is removed, with identical state mappings/badges/animation/keyboard behavior on both surfaces. Surface-specific spacing remains; no domain state, auth/sync/storage/lifecycle/query/filter/list/Privacy behavior changes. See [current presentation](options-ui.md).

## Side Panel experience

The launcher explicitly opens or closes the global Side Panel in the current Chrome window. Side Panel provides quick companion browsing beside the current page; Full Library provides the complete experience. The panel uses **compact list → expandable row → detail route**. Rows emphasize thumbnail, title, channel, essential date/duration, and expansion state. Search/filter controls adapt to panel width and short-height scrolling.

At most one row is expanded. Expansion contains a small amount of secondary metadata and Copy link, Open on YouTube, and View details. It does not embed the full detail view. A semantic expansion button exposes expanded state; interactive actions are not nested inside another button.

View details opens a focused panel route with Back, larger thumbnail, full title, channel, useful metadata, Open on YouTube, and Copy link. Back restores query, filters, sort, page, selected/expanded ID, and list scroll position where the list still permits it. Restore keyboard focus to the invoking control. If sync removed that video, show a clear unavailable detail state; Back restores/clamps context and focuses the nearest remaining row or list heading. Route/list state must survive this navigation, but need not survive closing the panel or restarting Chrome.

Both surfaces observe the same connection and sync domain state. They can have independent queries and selections. Neither may infer global success from its own spinner ending.

Same-document tab visibility changes retain eligible in-memory library and auth observations, including their authoritative Sync metadata and browsing state. A short ordinary return shows the same ready UI immediately, with no skeleton, connection check, Sync loading, disabled controls or count reset, and no unnecessary idle snapshot/auth reads. Hidden surface polling pauses; an active Sync catches up once on return while eligible rows remain visible. Deadline, backward-clock and context guards run before reuse; generation/auth-epoch changes, cleanup, authorization invalidity and expiry fence immediately. Real document destruction/remount still requires initial authoritative loading. No persistent UI cache is added. See the [lifecycle contract](lifecycle-retention-fix.md).

## Settings and data controls

Expose only implemented actions: account/connection status, Disconnect YouTube, Export Data, Clear Local Data, privacy/read-only information, and meaningful product/build version. No placeholders, invented storage figures, sync history, or diagnostics dashboard.

**Export Data:** explicitly download a versioned JSON copy of the eligible local dataset, owner, records, and latest success; include snapshot/freshness provenance so partial updates are not represented as a completed remote scan. Export reads local data after the authorization/freshness gate; it cannot bypass pending cleanup, expiry or revoked access. Serialization itself makes no provider request. An empty dataset can be exported, including after successful Disconnect. Filename: `likedex-export-YYYY-MM-DDTHH-mm-ssZ.json` using UTC. No credentials or import capability. Explain that the copy may contain personal information and Likedex cannot remotely erase the user's downloaded file.

**Clear Local Data:** require a titled confirmation describing local deletion and that YouTube is unaffected. Cancel changes nothing. Success removes all mirrored records, owner identity, current/completed attempt data, latest success, reconciliation data, and stored library preferences, and resets both surfaces. OAuth may remain connected; its nonsecret connection gate is retained. No automatic resync or revocation. A connected user can explicitly start a new first sync after identity is revalidated. Serialize with sync to prevent delayed responses repopulating cleared data. Failure is explicit; never claim successful clearing before commit.

**Disconnect YouTube:** explain that this revokes access and deletes the local YouTube mirror; require an explicit confirmation of those effects. Block sync, stop/fence active work, revoke/invalidate authorization through the supported Google flow, and target immediate deletion of all stored Authorized YouTube Data without waiting for a grace period or remote response. Success removes the mirror, derived owner/sync/reconciliation metadata and cached UI copies, and shows disconnected/no local library. Connect followed by fresh Sync is required to populate a library again. Non-YouTube preferences may remain.

Report remote revocation, auth-cache invalidation and local deletion independently. Revocation failure must not postpone deletion. Deletion failure must not prevent revocation or expose residual data: show cleanup pending/failed and retry at the next opportunity. Do not call partial completion successful Disconnect; no library browsing/export is available while cleanup remains incomplete. Offer appropriate retry/manual Google permissions guidance without implying that manual revocation cleans local data.

## Authorized-data freshness and external revocation

API-derived Authorized Data must be refreshed or deleted by its applicable 30-calendar-day deadline. A successful sync refreshes only data actually revalidated; partial progress cannot extend untouched data's lifetime. Explain expiry and offer Sync before data expires, but do not start automatic full scans. At expiry the initial design deletes the entire authorized dataset conservatively; authorization may remain connected and the next explicit sync is a fresh one. Stale data is never presented or exported as a valid mirror.

Check eligibility before first use and after waking/resuming. Revalidate authorization at the session/periodic boundaries defined in engineering, independently of local queries. If authorization cannot be validated/refreshed after bounded recovery, stop sync and delete associated data. External revocation follows this same cleanup flow. Distinguish confirmed invalid authorization from inability to verify due to a network problem; both close the data gate when verification is required. After browser/extension inactivity spanning expiry, enforce deletion at the earliest execution opportunity before rendering/using data. An ordinary query does not itself perform an API search or refresh.

## Empty, loading, and error states

| Condition | Required presentation |
|---|---|
| No local data, not connected | Connect explanation; no invented sync result |
| Connected, never synced | Ready to sync; no claim the remote library is empty |
| First scan running | Progress; safe local records may appear as provisional |
| Trusted completed zero membership | Successful sync, empty remote-library message |
| Membership exists but none available | No available videos in the local mirror; preserve honest membership count |
| Search/filter matches zero | No matches, clear-controls action; no remote request |
| Later attempt failed/interrupted | Last success plus specific current result while the dataset remains authorized and unexpired |
| Successful Disconnect or invalid authorization cleanup | Disconnected, no local library; explain deletion; Connect then fresh Sync |
| Freshness expiry cleanup | Local data expired and was removed; never imply YouTube became empty; Sync if still authorized |
| Authorization check or cleanup pending/failed | Block library/details/export, show the actual verification/deletion status and recovery action |
| Loading/storage/runtime error | Distinct loading or recovery error; never synthetic empty/idle |

## Accessibility, motion, and privacy

Use semantic headings/buttons/links, visible focus, descriptive labels, predictable tab order, and full keyboard access. Dialogs have an accessible role, title, description, Escape/cancel behavior, appropriate focus trapping, and focus restoration. Default destructive confirmation focus is the safe action. Popovers/selects expose keyboard operation and dismissal. Announce major sync state changes politely without announcing every item. Errors remain readable. All controls and dialog actions remain reachable at narrow heights and zoom.

Respect `prefers-reduced-motion`; remove nonessential transitions and continuous motion. Motion never gates correctness. Do not claim WCAG conformance without a separate verification.

No analytics, telemetry, advertising, backend storage, or sale/sharing for unrelated purposes. Google/YouTube authentication, API requests, thumbnail resources, and user-opened YouTube links involve network communication. Text browsing does not depend on thumbnails loading; show a placeholder offline. Do not claim that nothing leaves the device. The data inventory must match the final code and public disclosures.

## Release and non-goals

Release means production-ready, exact-package smoke-tested, submitted to the Chrome Web Store, and prepared/submitted for public OAuth verification as applicable. External review approval may remain pending at the Capstone deadline. See [implementation plan](implementation-plan.md) for required engineering and evidence gates.

### Non-goals

Sync history; user-facing reconciliation diagnostics; incremental sync; Watch Later; additional or arbitrary playlists; generic playlist abstractions; playlist editing or other YouTube writes; multi-account management UI; virtualization; advanced caching; search workers/services; backend; analytics/telemetry; speculative 10,000-item remote engineering or reconciliation indexes; import; bulk account actions; OpenSpec; Spec Kit; Project Factory. None is authorized by this specification.
