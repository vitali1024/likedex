# Phase 3 authentication and remote identity foundation

Implemented against specification boundary commit `754fc50`. This is an adapter/service foundation with deterministic fake-boundary tests; it does not establish live production OAuth, synchronization, runtime, UI, or release acceptance. Independent auth/storage review remains required before release.

## Configuration and composition

Human-supplied public configuration: Google Cloud project **likedex-extension-prod**, Chrome Web Store item **mmefiakgfhddiojfdnkfpfpbkgbfgkgj**, Chrome Extension OAuth client **875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com**. Scope is exactly `https://www.googleapis.com/auth/youtube.readonly`. These values are public identifiers, not credentials. No external console state beyond the supplied facts has been verified.

The existing Store public key is unchanged. Manifest permissions are exactly `identity` and `sidePanel`. Host permissions cover only HTTPS `www.googleapis.com` (YouTube reads) and `oauth2.googleapis.com` (supported remote revoke). Chrome host permissions grant origin access; request paths are fixed in the adapter to `/youtube/v3/channels` and `/revoke`. Extension CSP restricts connections to those two origins; requests reject redirects and omit ambient cookies. No storage, email/profile, alarms, tabs, downloads, or write scope is added. Build checks independently assert exact configuration, public key, derived Store ID, CSP and absence of broad optional permissions or secret signatures. Existing Playwright still asserts the actually loaded ID.

Construct `ChromeIdentityAdapter`, `GoogleAuthorizationRequests`, and `AuthenticationService` explicitly in the future background composition. Phase 3 supplies the implementation modules without wiring them to shell entrypoints. Importing or constructing them performs no consent, provider request, or database initialization. Phase 6 owns invocation, runtime validation/routing, lifecycle scheduling, shared surface gates and cancellation of future sync work. UI callers must never import the token boundary.

Phase 4 extends this same request boundary with fixed GET-only `playlistItems`/`videos` ingestion sessions, shared transient/auth recovery and replacement-owner revalidation. The earlier bootstrap/revoke APIs remain available. [Provider ingestion](provider-ingestion.md) records these additional paths and budgets; none is wired to runtime/UI yet.

## Authorization and bootstrap

`ChromeIdentityAdapter` uses Chrome's Promise API: `getAuthToken`, `removeCachedAuthToken` for exact stale-token eviction, and `clearAllCachedAuthTokens` for teardown. Chrome owns the token cache. Token strings exist only at this internal adapter/request boundary, in authorization headers or the ephemeral revoke form body. They are excluded from service results, database records, diagnostics, logs and exports. No token value is saved on a service/class field. Granted scopes, when returned by Chrome, must include the read-only scope. Recognized Chrome rejection messages are classified locally and discarded; unknown exceptions remain unexpected failures.

`connectInteractively()` is an explicit service operation for later informed user intent. No passive operation falls back to interactive acquisition. Disconnected inspection returns `auth-required` without contacting Chrome or YouTube. While connected, the first inspection in each service session validates silently even if a durable check deadline is still in the future. Later inspection shares validated evidence until its 24-hour deadline; `validateAuthorization()` always performs a fresh required check. No session/periodic scheduler is included. An unsuccessful Connect clears cached session evidence; consent denial itself preserves an eligible mirror and previous success.

Bootstrap issues exactly:

```text
GET https://www.googleapis.com/youtube/v3/channels?mine=true&part=id%2Csnippet%2CcontentDetails
Authorization: Bearer <ephemeral token>
```

HTTP 401 removes the exact token, acquires one replacement silently and repeats bootstrap once. A second 401 removes the invalid replacement and stops; there is no third acquisition or automatic consent. The retried channel response itself revalidates remote ownership. Network/429 and selected 500/502/503/504 failures have at most two additional request retries, 1s/2s backoff with up to 250ms jitter, and a 20s fetch/body deadline. Retry-After is honored up to 30s; longer waits stop. Clock, randomness, sleep, fetch and Chrome Identity are injectable. Quota, permission/configuration errors, malformed data and mismatch have no blind transient retry. These bounds apply to one Phase 3 bootstrap operation; later ingestion/sync must enforce its separate global attempt budgets.

Zod validates the channel-list envelope/resource kinds, explicitly present items, exactly one channel, required content/playlist containers, and nonempty identifier types/characters. Missing IDs, malformed fields/JSON, zero/multiple channels and missing Likes identity never become an empty library. Extra provider fields are discarded. Optional title may be absent; an empty returned title is preserved honestly. The trusted domain result is:

```ts
{ channelId: string; channelTitle?: string; likesPlaylistId: string }
```

`compareOwner()` returns `NO_LOCAL_OWNER`, `SAME_REMOTE_OWNER`, or `DIFFERENT_REMOTE_OWNER` using only `channelId`. Mismatch returns the candidate, existing channel ID and sanitized `owner-mismatch` error. It updates no owner, connection deadline/epoch, membership or sync metadata and authorizes no continuation. Future sync must require an `authorized` result and revalidate at its documented boundaries. Even matching Connect does not bind or refresh a durable owner: the result remains a candidate for later authoritative sync owner binding. The Likes playlist ID is returned for Phase 4; its membership is never requested here.

## Cleanup and disconnect

Required authorization check failure fences and deletes associated Authorized Data: confirmed absent/invalid authorization uses `authorization-invalid`; exhausted network/service/schema verification uses `authorization-unverified`, without claiming external revocation. Ordinary request failures outside a required check do not independently delete eligible data. Local expiry/pending-cleanup barriers run before service use and do not renew API facts. Successful periodic checks update only the data-free deadline/revision, preserving owner/video/sync freshness and auth epoch.

`disconnect()` first aborts the service's pending Connect/check and persists the disconnected gate, generation/auth epoch and cleanup intent. It starts repository deletion before awaiting remote revocation. The request adapter acquires a token silently for this explicit teardown only, POSTs an ephemeral URL-encoded `token` form to Google's supported `https://oauth2.googleapis.com/revoke`, then clears Chrome's extension auth cache even when acquisition/revoke failed. Only HTTP 200 confirms supported remote revoke. Missing token or transport interruption is `unconfirmed`; HTTP rejection is `failed`. Cache eviction never proves remote revocation. The [official Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity) and [Google token revocation contract](https://developers.google.com/identity/protocols/oauth2/native-app#tokenrevoke) define these operations.

Revocation, cache clearing, durable fencing, local deletion and outcome persistence are separate results. `completed` is true only when all succeed. Deletion failure cannot prevent revoke/cache attempts; revoke failure cannot defer immediate deletion. The repository deletes owner, videos and all derived sync/attempt/success metadata together. Late Connect completion checks generation/epoch and cancellation; an acquired token arriving after cancellation is invalidated. Explicit Disconnect can supersede pending expiry cleanup so it also closes authorization. New Connect cannot run while a check/revoke is active or local cleanup remains unresolved.

Cleanup/cache intent survives interruption. `recoverCleanup()` retries local deletion and cache clearing, independently even when deletion fails. An interrupted pending remote revoke becomes `unconfirmed`; recovery never invents a token or silently repeats remote revoke. A later explicit Disconnect can retry remote teardown. Residual data stays inaccessible behind durable cleanup intent. Fencing/outcome-persistence failure returns incomplete results and blocks the current service instance; a new worker must perform its required validation/cleanup barrier. Successful reconnect starts without owner, mirror or sync history and awaits fresh owner binding plus explicit sync. These service guarantees do not establish future cross-surface UI invalidation or worker scheduling.

## Verification and acceptance limits

`npm run verify:auth` runs Chrome/request/schema tests and service integration with actual Dexie plus fake-indexeddb. Synthetic token sentinels are test-only. Coverage includes silent/interactive separation, categorized denial/configuration failures, no token/candidate persistence, bounded 401/transient recovery, malformed/absent/ambiguous bootstrap, title omissions, ID-only comparison, non-destructive mismatch, 24-hour/session checks, no freshness renewal, held Connect fencing, independent revoke/cache/delete failures, durable cleanup recovery and reconnect.

| Acceptance IDs | Implemented deterministic portion | Remaining criteria |
|---|---|---|
| AC-AUTH-001–003 | Disconnected service gate, explicit consent boundary, validated candidate, denial preservation | Explanation/privacy agreement, runtime/UI and live consent |
| AC-AUTH-004/005 | One silent stale-token recovery, channel recheck, cleanup, configuration classification | Runtime sync integration and live misconfiguration smoke |
| AC-AUTH-006–009 | Durable lockout, independent teardown outcomes, clean reconnect, invalid/unverified cleanup | Runtime/browser lifecycle, both UI copies and real-account revoke |
| AC-IDENTITY-001/002 | ID-only comparison and validated channel/Likes bootstrap | Live provider observation |
| AC-IDENTITY-003–005 | Zero mismatch writes, stale Connect fences | Runtime mismatch presentation, confirmed owner replacement and sync/finalization |
| AC-DATA-010/015/016 | Independent local/remote failures, restart cleanup, service session/periodic checks | Runtime scheduling, inactivity/held sync and export/UI races |
| AC-RELEASE-003 | Deterministic manifest, client/scope/key/ID and shell checks | Live production flow and final release/package checks |

No full runtime, product UI, enumeration, sync, pruning, release, Store review or public OAuth verification criterion is claimed complete. Maker verification is not independent review.

**Live OAuth smoke: DEFERRED TO EARLIEST SAFE EXPLICIT INVOCATION PATH**, normally Phase 7 after Phase 6 runtime composition. There is no temporary production connection UI or developer token-printing path. No real account was used; live authorization, revoke behavior and final exact-package smoke remain mandatory before release.

Local maker verification on **2026-10-04**: clean `npm ci` succeeded with Node **24.19.0** / npm **11.17.0**; `verify:auth` passed **88 tests**. Final `npm run verify` passed lint, strict types, **129 deterministic tests**, production build, artifact/manifest checks and **1 Chromium shell smoke**, which observed the reserved Store ID. Separate `npm audit` reported **0 vulnerabilities**. The initial sandbox install/audit access and Chromium `spawn EPERM` failures were resolved using permitted execution outside the sandbox. Warnings were the pinned ESLint 9 support deprecation and Playwright's `NO_COLOR`/`FORCE_COLOR` environment notice. These are local maker results, not CI, independent review or live-account evidence. Work remains unstaged/uncommitted for human review.
