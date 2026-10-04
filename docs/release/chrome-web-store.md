# Likedex Chrome Web Store release checklist

Status: Store draft identity reserved by the human owner, 2026-10-04. Product release, listing/privacy completion and review submission remain planned. No external resources were created during specification. **B-01 is resolved** in [privacy and data](privacy-and-data.md#b-01-resolved-human-decision); release must verify the approved immediate revoke/delete and bounded freshness behavior. Recheck official requirements at execution; external dashboards can change.

## Reserved Chrome Web Store identity

- Product: **Likedex**
- Store Item ID: `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`
- Reservation package: **0.1.0**
- Store state at reservation: **Draft**
- Stable local-build identity: **Chrome Web Store public key**, normalized as one base64 line and configured directly in `wxt.config.ts` under `manifest.key`.
- Package accepted successfully; observed item type: **Extension**.
- Package-level validation errors observed: **none**.
- Package-level validation warnings observed: **none**.

These reservation observations and the public key were supplied by the human owner. The Store Item ID and public key are public release metadata, not credentials or private signing material. The production build checker compares the emitted key exactly, and the existing Playwright smoke test compares the loaded service-worker extension ID with the Store Item ID.

Version **0.1.0 has already been uploaded to this Store item**. The **next package uploaded to the same listing must use an extension version greater than 0.1.0**. This identity integration keeps the current package/extension version at 0.1.0 and uploads no package; the eventual release phase will deliberately choose the next version. Draft reservation is not review submission or publication.

## Deadline-controlled: early identity reservation (Phase 11A)

- [ ] Human verifies developer account registration, required account security/contact/payment steps, access rights, and ability to create a new item. Record a real blocker if unavailable; do not invent account readiness.
- [x] After specification commit and Phase 1, build the minimal real MV3 shell and package it for a **draft** Likedex item. Reservation package 0.1.0 was accepted, as reported by the human owner; no production-readiness claim.
- [x] Human creates/uploads the draft item without submitting it for review yet; reserved item ID is recorded above. No public listing URL was supplied.
- [x] Obtain the item's public extension key and configure `manifest.key` so unpacked builds have the Store ID. The real-extension Playwright smoke asserts the actual loaded ID against the reserved ID.
- [ ] Preserve the same Store identity for all release candidates. Never store a signing private key in source or distribute it.
- [ ] Configure the production **Chrome Extension** OAuth client using the stable item ID, then continue Phase 3 authentication integration. Record nonsecret configuration provenance, not credentials.

This sequence follows Chrome's [OAuth identity setup guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth). A draft upload is an early identity prerequisite, not final product submission.

## Deadline-controlled: manifest, version, and permissions

- [ ] Product/listing name is Likedex. Reservation version `0.1.0` is already uploaded; every subsequent Store upload must use a strictly higher valid numeric Chrome package version. Never submit `0.0.0`.
- [ ] Generated production manifest has MV3 service worker, Options entry, explicit toolbar `action`, Side Panel default path and `sidePanel` permission, correct OAuth client/scope, stable identity strategy, and valid icons. Configure action-click panel behavior and omit an action popup.
- [ ] Pick/document minimum Chrome version based on actual used APIs and smoke testing, not an arbitrary compatibility claim.
- [ ] Inspect packaged CSP/code: bundled executable code only; no remote code, development server, source secrets, or fixture switches.
- [ ] Validate final permissions against behavior and remove unused candidates. [Side Panel documentation](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) is the source for panel/action API compatibility.

| Candidate permission/access | Planned justification | Release check |
|---|---|---|
| `identity` | Chrome-managed Google token flow | Connect, cache recovery, disconnect |
| `sidePanel` | Compact Likedex interface | Native toolbar opens panel |
| `https://www.googleapis.com/*` host | Read authenticated channel/liked membership/video metadata | Adapter permits only required read endpoints |
| `https://oauth2.googleapis.com/*` host, if required | Explicit Google revocation | Actual revoke request and error handling |

IndexedDB alone needs no storage permission. Do not request all-sites, history, broad tabs, downloads, clipboard or alarms access by convenience. Start freshness enforcement with lifecycle gates/active timers; prove sufficiency in Phase 6 before considering a scheduler permission. Any extra permission needs demonstrated necessity, spec/disclosure update and review. Record image CSP origins separately from API host permissions.

## Deadline-controlled: listing and public materials

- [ ] Prepare recognizable Likedex extension icons for actual manifest sizes, including Store-required 128×128 PNG; inspect light/dark appearance.
- [ ] Prepare the required small promotional image (440×280) and actual-product screenshots meeting current dashboard format/dimension rules. Show Options, Side Panel interaction, and truthful sync/settings. Remove personal channel/library data or use clearly controlled demonstration data outside the production bundle. Follow [Store image requirements](https://developer.chrome.com/docs/webstore/images).
- [ ] Suggested description foundation: “Likedex helps you browse, search, filter, and revisit a local mirror of your YouTube Liked Videos. Connect with read-only access, sync your library, and open videos on YouTube from the Options page or compact Side Panel.” Disclose bounded data freshness, Disconnect deleting the mirror, and Clear deleting locally without revocation.
- [ ] Choose the current available productivity category appropriate to library organization, supported language, distribution regions and visibility; record actual dashboard choices.
- [ ] Publish real HTTPS homepage, support/contact, and privacy-policy links; no placeholders in submission. Static pages do not require a product backend.
- [ ] Fill single-purpose, permission justification, privacy practices and data-use declarations from the verified [inventory](privacy-and-data.md). No analytics/telemetry claims unless package/network checks substantiate them.
- [ ] Prepare reviewer instructions explaining Connect, read-only scope, normal sync, Options/Side Panel, and controls. Coordinate any restricted test-user access securely through appropriate consoles; do not put credentials in source or public documents.

## Deadline-controlled: reproducible final package and smoke (Phase 14)

- [ ] Verify the approved retention/revocation contracts; close checker findings or record permitted human dispositions; full `npm run verify` and CI pass on the candidate commit.
- [ ] Clean install with pinned Node/npm/lockfile using `npm ci`; build production configuration and generate ZIP using planned `npm run package:release`.
- [ ] Repeat a clean build with the same public configuration; compare content hashes. Normalize archive order/time metadata if claiming identical ZIP bytes. Record commit, tool versions, public client/ID identifiers, output file inventory, and ZIP hash.
- [ ] `npm run verify:release` checks real manifest/version/ID/permissions, required assets and absence of fixture/private/development artifacts. Inspect the archive rather than assuming a successful build implies correct package contents.
- [ ] Extract the exact candidate ZIP into an isolated local folder, load those contents in a dedicated Chrome profile, and record Chrome version and install mode. This is exact-content unpacked testing; later Store-installed testing is a distinct result.
- [ ] Human completes all smoke steps below; any corrected code requires regeneration, renewed hash, relevant tests and another exact-package smoke pass.

| Step | Expected real-account observation |
|---|---|
| Install and connect | Correct name/permissions, readable consent explanation, correct stable channel identity |
| Initial full sync | Truthful progress and committed success; available/membership counts make sense for API-visible library |
| Repeated full sync | Complete reconciliation; no unexpected data loss; retained last success on a deliberately interrupted attempt |
| Local browsing | Search, channel/duration/date filters, seven sorts, pagination and full details work without new API queries |
| Video actions | Direct YouTube link opens; Copy produces the same link |
| Surfaces | Options works; native toolbar opens compact Side Panel; expand/detail/Back restores context |
| Export | Valid JSON with expected owner/records/provenance, no credentials |
| Disconnect/Revoke | Supported remote revoke/cache result and immediate deletion verified independently; no mirror/owner/derived metadata or library browsing remains on success; failures truthful |
| Reconnect | After Disconnect, any channel requires fresh owner validation and fresh explicit full Sync; mismatch protection applies when an eligible mirror otherwise exists |
| Clear and fresh sync | Confirmation, local reset without OAuth revocation, no delayed repopulation, new explicit first sync works |
| External revocation | Revoke externally through Google settings; next required validation closes access, stops sync and deletes associated data; residual cleanup failures remain visible |
| Freshness and inactivity | Review deterministic expiry/provenance results and real lifecycle smoke evidence; no stale snapshot is rendered after wake; do not claim an unperformed 30-day live test |
| Accessibility/privacy | Keyboard/dialog/focus/reduced motion, narrow layout; network/permission behavior matches disclosures |

## Deadline-controlled: upload and review submission (Phase 15)

- [ ] Human uploads the exact verified ZIP to the same Store item; compare dashboard version/ID with the recorded candidate.
- [ ] Complete listing, privacy, distribution and reviewer/test-instruction sections and resolve validation errors.
- [ ] Human chooses publication timing explicitly. Prefer deferred publication until production OAuth/public access prerequisites are satisfied; submission can precede final external approval.
- [ ] Human submits for review and records real receipt/time/status/item URL/package hash. A draft upload alone does not satisfy submission.
- [ ] If an external prerequisite prevents submission, record evidence, owner, next action and actual status. Unimplemented or failing retention/deletion checks are engineering incompleteness, not completed submission or pending external review.

The [official publishing flow](https://developer.chrome.com/docs/webstore/publish) distinguishes draft preparation, review submission, and publication. Capstone evidence must do the same.

## External-review-controlled and post-submission

- [ ] Track actual Store status and reviewer requests separately from engineering completion; human responds with verified fixes/materials.
- [ ] Monitor OAuth verification prerequisites before public launch. Review duration and approval are not promised by the Capstone deadline.
- [ ] On approval, verify publication timing/status and perform a Store-installed smoke test when available. Recheck any dashboard deadline for deferred publication.
- [ ] For a rejected candidate, preserve the reviewed commit/hash/evidence; fix the issue, increase version where required, verify and resubmit. Never mark rejection as approval.
- [ ] For a faulty published build, assess unpublishing/pausing distribution and ship a corrected higher-version package. Do not assume users can install a lower version or that unpublishing removes installed copies. Preserve schema compatibility and data safety when issuing updates.
