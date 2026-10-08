# Likedex public OAuth verification readiness

Status: Phase 3 service/configuration foundation, 2026-10-04. The human supplied the production public configuration below; no external resources, test users, credentials or verification submission were created by this implementation task. Deterministic fake-boundary tests and manifest checks do not establish live OAuth or console/public-access readiness. Do not request credentials in chat or include secrets in repository artifacts. [B-01](privacy-and-data.md#b-01-resolved-human-decision) is resolved; live revoke/delete, external-invalidity cleanup and bounded freshness remain release gates.

## Human-supplied public production configuration

Current audience, confirmed by the human on 2026-10-08: **Testing** for `likedex-extension-prod`. Volunteers must privately arrange test-user access with the owner before Connect; no tester addresses are published. Public OAuth verification is not confirmed complete. Testing authorization has a limited lifetime; see [Google's audience guidance](https://support.google.com/cloud/answer/15549945?hl=en). This audience is separate from Chrome Web Store trusted testers. No external console change was performed by this finalization task.

| Field | Value |
|---|---|
| Google Cloud project ID | `likedex-extension-prod` |
| Chrome Web Store item ID | `mmefiakgfhddiojfdnkfpfpbkgbfgkgj` |
| Google OAuth client ID | `875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com` |
| Application type | Chrome Extension, created for the stable Store identity |
| Scope | `https://www.googleapis.com/auth/youtube.readonly` |

The manifest now contains this client and scope, with the original public Store key. `check:build` checks exact values and derived ID; Playwright checks the loaded ID. API enablement, contacts/branding/domains, test-audience settings and public verification status still need human console evidence. Public identifiers are not secrets. [Authentication foundation](../authentication-foundation.md) records implementation, deterministic acceptance coverage and cleanup/recovery limits.

## Deadline-controlled: early production identity

The Chrome extension identity prerequisite is resolved: the human owner reserved the Likedex Store draft as `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`, and its public key is configured in the WXT manifest. The supplied **Chrome Extension** client targets this identity. Existing real-extension smoke checks the loaded production extension ID. Service implementation and deterministic configuration checks are present. The subsequent [successful live observation](live-provider-validation.md) validates authorized bootstrap/provider reads with the production extension/OAuth identity; final console readiness and public verification remain unverified.

- [x] Reserve the Store draft and pin stable local-build identity, the identity portion of Phase 11A's [sequence](chrome-web-store.md), before final auth integration.
- [x] Human designates Google Cloud project `likedex-extension-prod` and supplies its public identifier.
- [ ] Human confirms YouTube Data API enablement, ownership/contact/quota access with console evidence.
- [ ] Configure branding as **Likedex** with real support/developer contacts, homepage, privacy policy and required domain ownership; disclose bounded retention and the approved revoke/delete controls.
- [x] Human reports the production **Chrome Extension** OAuth client created for `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`; Phase 3 configures its exact client ID and read-only scope, preserving the public key/ID. Follow [Chrome OAuth setup](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth). This records supplied configuration, not live-account verification.
- [ ] Never substitute a temporary extension ID and call final production wiring complete. No server client secret, refresh-token store, or service account is required by this product design.

## Scope and consent

Requested scope: `https://www.googleapis.com/auth/youtube.readonly` only.

Justification: read the authenticated YouTube channel identity, discover its liked-video playlist, enumerate that membership and retrieve metadata required to show a local searchable library. Public unauthenticated access cannot read the user's private liked membership. Broader write scopes have no feature justification. No profile/email scope is planned; use channel ID from the authenticated YouTube response. API request list and runtime validation are specified in [engineering](../engineering-spec.md).

- [ ] Verify the requested scope's current classification in Google's console and publish accurate consent-screen scope descriptions.
- [ ] Initial Connect explains why read-only access is needed, local storage and controls before showing Google's consent UI; do not overpromise retention.
- [ ] External/public audience settings must match public distribution. While testing, configure only intended testers, account for warnings/user restrictions/token behavior shown by Google, and do not confuse successful tester access with unrestricted public availability.
- [ ] Keep test-user identities and access details out of public evidence. CI uses synthetic auth/provider adapters, not live consent.

## Deadline-controlled: verification materials

- [ ] Publish real, accessible homepage/privacy/support information under required verified domains; ensure app name and data use agree across UI, policy, Store and consent.
- [ ] Verify immediate Authorized Data deletion on Disconnect, external-invalidity cleanup and refresh/delete deadlines; align actual behavior, tests, user text and policy before asserting compliance.
- [ ] Prepare scope justification plus reviewer steps tracing each API read to a visible feature.
- [ ] Prepare a real demonstration showing the user-initiated consent flow, Likedex branding/client identity as requested, and features enabled by the requested scope. Include sync/local browsing and truthful disconnect outcomes; do not record tokens/passwords. Follow current [sensitive-scope verification instructions](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) for language, video visibility and submission fields.
- [ ] Check the console's branding and data-access verification prerequisites; submit required materials in the order it requires and retain actual status/receipts. The Capstone 1–2 minute demo can reuse footage but is not assumed to satisfy Google's separate demonstration requirements.
- [ ] Review applicable [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), requested permissions, current verification exemptions/classification and deployment status. Do not assume a public extension qualifies for a personal-use exception.

Google's [verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) covers scope justification, branding/domain preparation, demonstration and review. The current console is the execution checklist; this draft claims no completed verification.

## Production account smoke and revoke verification

**Historical checkpoint before gate enablement:** live provider validation was COMPLETE / APPROVED while production Sync was STILL CLOSED and first real sync had not yet occurred. Current production Sync is ENABLED and the first successful sync is [human-reported](../agentic/capstone-verification.md#human-reported-live-results). The human reported successful authorized bootstrap (`bootstrapValidated: true`) and full provider observation through the real production extension/OAuth identity in the dedicated validation build. See the [sanitized evidence and human acceptance](live-provider-validation.md). Fresh-consent versus cached-grant behavior and the broader Connect/revoke/delete/expiry checks below were not supplied as completed evidence. Approval authorizes a separate gate-enablement change; it does not itself enable Sync, establish public access readiness or satisfy the final exact-package smoke. No Phase 8 work is included.

Human runs with the production-like exact package and stable ID:

1. Connect through the real consent flow; confirm scope and actual YouTube channel ID, including channel-selection behavior when relevant.
2. Sync a real liked library; confirm local query behavior and no write requests. Confirm no credentials appear in IndexedDB/export/logs.
3. Exercise expiry/reconnect behavior using supported means; avoid manufacturing raw token evidence. Wrong client/ID should be diagnosable, not reported as an empty library.
4. Disconnect while sync is active; verify actual revoke/cache outcomes and immediate deletion independently. Reopen: no YouTube mirror, owner or derived sync/reconciliation metadata may remain after success; library browsing is unavailable and sync locked. Partial failures remain visible; no claim of remote success from cache removal.
5. Explicitly reconnect, including to the same channel, and verify fresh ownership and explicit full Sync. Separately revoke access through Google settings and confirm required validation triggers sync lockout/deletion. Check freshness/expiry and inactivity evidence, including blocked stale display/export and cleanup recovery; never claim tests that were not run.
6. Clear Local Data independently; confirm it does not revoke consent and permits an explicit fresh sync after identity revalidation.

Record build/commit/Chrome version, test date, observed results, and redacted evidence. Never save token-bearing requests or personal library content as public verification evidence.

## Deadline versus external review

Production wiring, tested functionality, real public links, justified scope, verification materials and submission when applicable are deadline-controlled. Approval and reviewer response times are externally controlled; do not promise approval by Capstone. Record separately: branding status, scope/data-access review status, submission receipt, unresolved request, next action and owner.

If a console prerequisite or external review step prevents final submission, document the exact external dependency and preserve completed materials; do not label engineering that has not been done as externally blocked. Stable ID reservation is early to avoid a preventable late dependency. Public launch remains gated on actual access readiness and verified retention/revocation implementation; B-01 is no longer an unresolved specification conflict.
