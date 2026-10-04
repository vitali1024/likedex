# Likedex live-provider validation checklist

**Status: PENDING — procedure/template only.** No live-provider observation, successful validation, human approval or production enablement is recorded here. The [production provider validation gate](../synchronization.md#production-live-provider-validation-gate) must remain closed until factual evidence and explicit human approval are recorded. Automated fixture results cannot satisfy this prerequisite.

## Human-controlled observation procedure

Use a real authorized YouTube account with the production Likedex extension/OAuth identity through a safe, explicitly authorized observation path. Phase 6 does not gain a production runtime bypass or fixture switch for this purpose. The observation path must consume the Phase 4 provider without invoking Phase 5 storage application, trusted finalization or local pruning. Any local pruning during observation requires separate authorization. No such observation path is implemented by this documentation amendment.

- [ ] Record actual date/time with timezone, extension version and source commit. Verify the loaded extension ID and public OAuth configuration against [OAuth readiness](oauth-verification.md). Expected human-supplied configuration is Store item `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`, project `likedex-extension-prod`, and scope `https://www.googleapis.com/auth/youtube.readonly`; these expectations are not live verification evidence.
- [ ] With explicit user authorization, verify `channels.list(mine=true, part=id,snippet,contentDetails)` succeeds and yields the expected authoritative channel bootstrap and Likes playlist ID. Missing or ambiguous identity fails validation.
- [ ] Use that returned Likes playlist ID in the Phase 4 provider's `playlistItems.list` enumeration; do not guess a playlist or substitute fixture membership.
- [ ] Observe real membership and follow validated continuation tokens from the first page to a valid terminal response. If the actual library naturally spans multiple pages, observe the multi-page path. Do not manufacture account changes to force it. Record any unobserved paths as limitations.
- [ ] Observe `videos.list` hydration for returned video IDs and confirm mapping behaves as designed. Where rich metadata is naturally absent/unavailable, verify trustworthy membership IDs remain authoritative and metadata is represented honestly. A genuinely empty library has no hydration request; record that coverage limit.
- [ ] Verify a genuine in-process `TrustedProviderCompletion` is produced after consuming the validated terminal stream, with matching bootstrap/playlist context and page/raw/unique counts. A copied or serialized summary is evidence only and cannot substitute for the capability.
- [ ] Check for malformed/unmappable membership, missing required containers, count/token anomalies, unexpected thumbnail origins or observed completeness/cap behavior that undermines the completion proof. Record actual anomalies and limitations; stop affected work and follow the specification-amendment process if an assumption is contradicted. Do not relax provenance, owner receipts, finalizer or pruning gates.
- [ ] Confirm observation did not invoke local reconciliation/finalization/pruning, unless separately authorized and recorded. Rare provider states remain covered by deterministic tests; do not manipulate the user's YouTube account to manufacture them.
- [ ] Preserve sanitized evidence and obtain an explicit human decision to approve enablement or keep production disabled. Unresolved anomalies or missing approval keep the gate closed.

## Pending evidence record

A human-reported failed observation had validated bootstrap, seven accepted/hydrated pages, 350 raw/unique memberships against reported total 3,547, and `untrusted-enumeration / enumeration-untrusted`. Successful completion/approval is still pending. The exact live trust branch and original time/build context were not supplied. See [pagination diagnosis](provider-pagination-diagnosis.md) for the branch audit, safe diagnostic patch and one required human retry. Do not interpret the accepted-page summary as proof of a seven-page or 350-item provider cap.

The subsequent human-provided observation reached a decoded eighth page with 50 items, stable total 3,547, fresh continuation, observed envelope count 400, no internal stop and `membership-item-invalid` before hydration. This proves the item-schema branch but not the exact field, item ordinal or a deleted/private cause. See the [membership-item diagnosis](membership-item-diagnosis.md) for unchanged-contract structural diagnostics and the latest single required retry. Live trusted completion and human approval remain PENDING.

Fill only from actual execution; unchecked fields are not success claims. Never record OAuth tokens, credentials, raw sensitive response bodies, personal liked-video content or opaque page tokens. Use aggregate counts only where safe; identify the account only by a non-sensitive label if necessary.

| Field | Actual evidence |
|---|---|
| Observation date/time and timezone | PENDING |
| Extension version/source commit and install mode | PENDING |
| Loaded Chrome Store item ID | PENDING |
| Google Cloud project ID/public OAuth client configuration | PENDING |
| OAuth scope observed | PENDING |
| Non-sensitive account label, if needed | PENDING |
| Bootstrap/returned Likes playlist used (sanitized confirmation) | PENDING |
| Request categories observed: channels, playlistItems, videos | PENDING |
| Accepted pages/raw membership/unique membership counts, where safe | PENDING |
| Single-/multi-page path and hydration coverage limits | PENDING |
| Genuine terminal trusted-completion result | PENDING |
| Anomalies, completeness/cap observations and other limitations | PENDING |
| No local pruning confirmation or separate pruning authorization | PENDING |
| Sanitized evidence references | PENDING |
| Explicit human approval or decision to keep disabled, with date/reference | PENDING |

## Release enablement sequence

1. Perform the live observation above through the human-controlled path.
2. Preserve actual sanitized evidence in this record or linked artifacts.
3. Obtain explicit human approval based on that evidence; otherwise keep disabled.
4. Deliberately enable production synchronization/pruning in a reviewable change. Missing/malformed configuration must still fail closed; no fixture or caller-controlled bypass is allowed.
5. Rerun full authoritative verification and applicable production/build checks for the enabled composition.
6. Perform the real-account smoke test using the production identity and enabled build; record factual results.

Complete this milestone before Chrome Web Store release, no later than Phase 11B. Independent review/remediation and the final exact-package smoke remain required in their assigned phases. The typed `provider-validation-required` result is a pre-release safety state, not the intended normal public experience after successful validation and approved enablement.
