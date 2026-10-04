# Likedex product specification

Status: specification for human review, 2026-10-04, incorporating the human-approved B-01 resolution. Choices are recorded in [decisions](decisions.md); testable gates are in [acceptance criteria](acceptance-criteria.md). The [data inventory](release/privacy-and-data.md#b-01-resolved-human-decision) defines bounded retention and deletion on revocation. B-01 is resolved; implementation and release verification remain future work.

## Problem, user, and value

People with thousands of YouTube Liked Videos need a fast way to find and revisit a video without repeatedly navigating YouTube's native library. Likedex mirrors the authenticated channel's Liked Videos and makes ordinary browsing, search, filtering, sorting, pagination, and details local. It does not download video media or modify a YouTube account.

The primary user uses desktop Chrome, authorizes access to their own YouTube channel, and wants to find a remembered video, narrow a large library, inspect metadata, then open it on YouTube or copy its link. A usable, trustworthy, publicly distributable product matters more than feature breadth.

## First run and connection

On first run, show Likedex, the local-library purpose, and a **Connect YouTube** action. Explain before consent: read-only access reads the channel's liked-video list and necessary metadata; mirrored data is stored on this device subject to refresh/deletion limits; Disconnect revokes access and deletes that mirror; Clear Local Data deletes it without revoking access. Expose privacy and service-terms links and record the required privacy agreement before enabling connected functionality.

Only a deliberate Connect action may open interactive Google consent. Cancellation/denial leaves a clear disconnected state and can be retried by the user. After authorization, establish the authoritative YouTube channel, display its name when known and stable channel identifier for disambiguation, then offer **Sync**. Connection is not a completed synchronization. Missing or ambiguous channel identity is an actionable connection error, not an empty library.

After successful Disconnect or authorization-invalid cleanup, reconnect to any channel starts with no local mirror; establish ownership and require a new explicit full sync. Token renewal during a still-valid connected session may retain eligible data. If Connect selects a different channel while an eligible local mirror exists, show both identities and pause synchronization. Offer **Keep existing library** (cancel transition and leave sync blocked, subject to freshness/authorization enforcement) or **Replace local library** with explicit confirmation explaining local deletion. Allow Export only while that dataset is eligible. Replacement clears the old local dataset, binds the newly revalidated channel, and requires a new Sync. It never alters YouTube or merges libraries.

## Library interaction

The normal list contains videos whose last validated metadata supports availability. Missing/private/deleted or unknown-availability membership can remain internally for correctness, but is excluded from the primary list. Availability reflects last sync, not a playback guarantee. Show “available videos” counts distinctly from mirrored membership; do not imply the filtered list is the entire remote count.

Search uses title and channel name only. Trim and Unicode-normalize text, perform case-insensitive substring matching, and match all whitespace-separated query terms across those fields. Empty query means all available records. Search never requests YouTube data.

Combine active search and filters with AND. Filters are channel (stable ID; multiple chosen channels use OR), duration (under 4 minutes, 4 to under 20, 20 minutes or longer), and date range with explicit **Liked date** or **Published date** basis. A date-only range includes both selected local-calendar dates; convert boundaries explicitly for comparisons. Missing values fail a corresponding active filter and remain eligible when that filter is unset. Explain unknown liked dates without substituting publication dates. Clearing filters retains the search query; clearing all search/filter controls resets both.

Sort modes: liked date newest/oldest, published date newest/oldest, duration longest/shortest, title A–Z. Default is liked date newest. Unknown sort values always sort last in either direction; ties use video ID ascending. Title comparison uses a documented deterministic normalization/comparison rather than device-dependent collation. Details distinguish “Date liked unknown” from publication date.

Use 50 records per page without virtualization. Search/filter/sort changes reset to page 1. A committed data update retains a valid page and clamps an invalid page to the last valid page; zero results uses page 1 with navigation disabled. Retain selection by video ID while it remains in the current result set; otherwise clear selection and explain unavailability when appropriate. Selection may span pages within that result set. Present loading distinctly from zero results.

## Sync and recovery

Sync is explicitly user-triggered and always performs a full remote enumeration followed by reconciliation. Authorization/freshness enforcement also runs independently; it does not silently start a library scan. Acknowledge the start promptly with the authoritative attempt status; the UI stays responsive and observes progress independently. Simultaneous starts from either surface join one attempt.

Show checking, scanning, applying updates, and finalizing as distinct activities. Use truthful page/item counts; do not invent a completion percentage from a changing remote total. Success is shown only after safe finalization commits. “Last successful sync” is separate from the current/most recent attempt and remains visible after ordinary sync failure while its dataset remains eligible. Authorized-data deletion removes associated sync metadata too.

Safe additions and metadata updates may appear before an attempt completes. Label the mirror as partially updated if the attempt stops after progress. Untrusted or interrupted enumeration never authorizes removal as no longer liked. A trusted empty remote library may clear membership. Separately, Clear, Disconnect and policy enforcement can delete local data, with their actual reason shown. Errors never masquerade as successful empty synchronization.

Failures identify the category and useful next action: reconnect, select the correct channel, wait for quota, retry a temporary problem, or address local storage/runtime trouble. Worker interruption is shown as interrupted after recovery, with a full-retry action. No hidden infinite retry or auto-consent. Local browsing remains usable only while authorization and freshness gates permit it. A storage read failure displays an error, not an empty state.

## Options experience

Options is the primary full-size interface: identity/header, connection status, current attempt and last success, Sync, search, focused filters, sort, result count, bounded list, persistent selected-video detail, and settings/data controls. Wide viewports use a library/detail split; narrow widths switch to list and focused detail with Back, preserving list context. No fixed breakpoint is prescribed, but supported widths must not clip controls.

Details contain full title, larger thumbnail, channel, known liked/publication dates, duration, and relevant known description. Unknown values are intentional text/placeholders. Open on YouTube opens the direct watch URL; Copy link copies that same URL and reports success only after clipboard completion. Failures remain visible. No embedded playback, guessed verification badge, hard-coded trusted-channel list, or guessed statistics.

## Side Panel experience

The toolbar action explicitly opens the Side Panel. There is no separate popup product surface. The panel uses **compact list → expandable row → detail route**. Rows emphasize thumbnail, title, channel, essential date/duration, and expansion state. Search/filter controls adapt to panel width and short-height scrolling.

At most one row is expanded. Expansion contains a small amount of secondary metadata and Copy link, Open on YouTube, and View details. It does not embed the full detail view. A semantic expansion button exposes expanded state; interactive actions are not nested inside another button.

View details opens a focused panel route with Back, larger thumbnail, full title, channel, useful metadata, Open on YouTube, and Copy link. Back restores query, filters, sort, page, selected/expanded ID, and list scroll position where the list still permits it. Restore keyboard focus to the invoking control. If sync removed that video, show a clear unavailable detail state; Back restores/clamps context and focuses the nearest remaining row or list heading. Route/list state must survive this navigation, but need not survive closing the panel or restarting Chrome.

Both surfaces observe the same connection and sync domain state. They can have independent queries and selections. Neither may infer global success from its own spinner ending.

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
