# Likedex public OAuth verification readiness

Status: planned, 2026-10-04. No Cloud project/client, consent configuration, test users, credentials, or verification submission were created. Do not request credentials in chat or include secrets in repository artifacts. [B-01](privacy-and-data.md#b-01-resolved-human-decision) is resolved; revoke/delete, external-invalidity cleanup and bounded freshness must be verified before release.

## Deadline-controlled: early production identity

The Chrome extension identity prerequisite is resolved: the human owner reserved the Likedex Store draft as `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`, and its public key is configured in the WXT manifest. The future Google OAuth client of type **Chrome Extension must target exactly `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`**. The existing real-extension smoke checks the loaded production extension ID. This resolves only the identity prerequisite; Google Cloud setup, OAuth client creation/configuration and authentication implementation remain unfinished.

- [x] Reserve the Store draft and pin stable local-build identity, the identity portion of Phase 11A's [sequence](chrome-web-store.md), before final auth integration.
- [ ] Human creates or designates the Likedex Google Cloud project, enables YouTube Data API, and confirms ownership/contact/quota access. Record actual nonsecret project identifiers when available.
- [ ] Configure branding as **Likedex** with real support/developer contacts, homepage, privacy policy and required domain ownership; disclose bounded retention and the approved revoke/delete controls.
- [ ] Create production OAuth client of type **Chrome Extension**, bound to `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`. Configure manifest OAuth client ID and required scope in the future authentication phase; preserve the unpacked/Store ID match. Follow [Chrome OAuth setup](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth).
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
