# OAuth / bootstrap failure diagnosis — 2026-10-04

Baseline was clean at `12df1b5ff324eacbcd440c210041459ab6de4ff0` (`chore: add non-destructive provider validation path`). This is a narrowly scoped bug fix and maker verification. No real account was used during this work, no live success is claimed, and independent release review remains pending. Phase 8 and production synchronization remain untouched.

## Proven defect and failing operation

`GoogleAuthorizationRequests` stored the bare native `fetch` function as its default constructor parameter property. `fetchAndRead()` invoked it as `this.fetcher(...)`, supplying the request-service instance as the JavaScript receiver. Chromium's native worker fetch rejects that receiver with `TypeError: Illegal invocation`, before an HTTP request is sent. The broad catch converted this programming error into `AuthenticationError('network')`; the bootstrap loop retried it twice and Options displayed the generic connection message.

An isolated Chromium service worker probe reproduced native member invocation throwing `Illegal invocation`. Calling the same native function with the global receiver passed that receiver check and reached CSP enforcement instead (the probe used a data URL forbidden by the unchanged CSP). The browser regression then exercised Options Connect through the actual built background with synthetic Identity and receiver-preserving native fetch. It failed against the unchanged baseline build and passed after binding the default fetch to `globalThis`. This establishes the source defect and its bootstrap-fetch failure mechanism. A human retry must still establish whether the live account has any subsequent configuration/provider problem; the original live attempt did not provide a phase trace.

## Exact Connect trace

1. `OptionsApp.connect()` checks the privacy agreement, then calls `RuntimeClient.request('AUTH_CONNECT')`.
2. The client constructs/validates the versioned request and uses `browser.runtime.sendMessage`.
3. `startBackgroundRuntime()` routes Chrome's listener to `RuntimeCoordinator.handle()`. Request and extension-page sender validation precede dispatch.
4. `dispatch(AUTH_CONNECT)` calls `AuthenticationService.connectInteractively()` after local initialization/recovery and concurrency checks.
5. `AuthenticationService.check(true)` owns an AbortController, captures the durable fence, then calls `GoogleAuthorizationRequests.connectExplicitly(signal)`.
6. `bootstrap(true)` → `authenticated()` → `acquire(true)` → `ChromeIdentityAdapter.connectInteractively()` → Promise `chrome.identity.getAuthToken({ interactive: true, scopes: [youtube.readonly] })`.
7. The adapter takes `result.token`, checks returned granted scopes, and returns only the ephemeral token to the request boundary.
8. `bootstrapRequest()` → `jsonRequest()` → `fetchAndRead()` performs the first post-OAuth provider operation:

   ```text
   GET https://www.googleapis.com/youtube/v3/channels?mine=true&part=id%2Csnippet%2CcontentDetails
   Authorization: Bearer <ephemeral token>
   ```

9. The response body is parsed, then `validateBootstrap()` uses Zod to validate exactly one channel and its channel/Likes playlist identifiers. The service compares the stable channel ID with the local owner and checks cancellation/generation/auth epoch again. Connection success saves only connection state/deadline, never membership or a sync attempt.
10. The coordinator serializes the allowlisted DTO or sanitized failure. The client validates correlation and result; Options maps the category through `failureMessage()` / `ERROR_MESSAGES`. Its follow-up refresh reads authoritative status/snapshot; Connect is not a completed sync.

The defective step was 8's native function invocation, not URL encoding, token shape, HTTP status, JSON parsing or channel validation.

## Error mapping audit

Previously, the exact UI sentence could originate from:

- Identity rejection strings containing `network`, `connection` or `offline`.
- Any non-AuthenticationError thrown by the fetch boundary: actual transport/DNS/TLS/offline failure, host/CSP/redirect rejection, native `Illegal invocation`, unexpected adapter/programming exceptions, or abort/timeout errors when the caller signal was not aborted.
- The 20-second fetch/body deadline, including expiry detected after body consumption.
- Any non-SyntaxError rejection from HTTP-200 `response.json()`, including body transport failure or an unexpected body-reader exception.
- An already typed `AuthenticationError('network')` propagated from the internal request boundary. Provider ingestion preserved this category too.

Caller cancellation already mapped to `cancelled`. HTTP 401 already mapped to `auth-required`, recovered once silently, evicted a second invalid token and stopped. HTTP 403 remained permission/quota/rate/configuration-specific when recognized. Other HTTP failures, including 400, mapped to provider/unavailable rather than network. Invalid JSON SyntaxError mapped to malformed-bootstrap/provider; bootstrap Zod checks ran after the fetch wrapper, so typed missing/malformed identities were not network errors. Runtime transport loss, invalid replies, storage failures and worker interruption had distinct runtime/storage/interrupted paths. No HTTP, Zod or runtime bypass was needed.

Now recognized `Illegal invocation` becomes `fetch-invocation` / internal and receives no transient retries. Timeout becomes `request-timeout` with the existing bounded network retry policy. Native TypeError transport/body failures and AbortError without caller cancellation remain network; arbitrary Error exceptions become unexpected/internal and are not blindly retried. A browser's generic Failed to fetch cannot safely distinguish connectivity from host/CSP rejection; diagnostics identify the phase without inventing a cause. HTTP classifications and token recovery remain intact.

Strict diagnostic DTOs allow only phase, fixed endpoint category, HTTP status/null, allowlisted error code and retryOccurred. They distinguish OAuth acquisition, bootstrap fetch/HTTP/parse/validation and provider fetch/HTTP/parse. Diagnostic context survives authorization cleanup and provider error conversion. Ordinary production responses omit it by default. The separately built validation background enables it; validation Options displays the last explicit Connect failure for ten minutes with timer/resume expiry, and observation failure JSON includes available safe context. No debug console was added to product Options, no raw exceptions are logged, and no diagnostic data is saved to storage.

## Manifest and Chrome Identity findings

Both generated packages contain exactly `identity` and `sidePanel`, hosts `https://www.googleapis.com/*` and `https://oauth2.googleapis.com/*`, the configured client `875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com`, only `https://www.googleapis.com/auth/youtube.readonly`, and the unchanged public key deriving `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`. CSP remains:

```text
script-src 'self'; object-src 'self'; connect-src https://www.googleapis.com https://oauth2.googleapis.com; img-src 'self' https://i.ytimg.com
```

The required YouTube GET and Google revoke POST origins are permitted. WXT's generated configuration matches source and exact build checks; no permission/CSP change was required. Only the disposable native-fetch TEST COMPOSITION permits data URLs to serve synthetic responses without contacting Google. Neither human package contains that exception or fixtures.

Installed `@wxt-dev/browser` exports `globalThis.chrome` directly in Chrome, without a callback/promise conversion wrapper. Its typings and the [official Chrome Identity contract](https://developer.chrome.com/docs/extensions/reference/api/identity) agree: Promise getAuthToken resolves to GetAuthTokenResult with optional string token and grantedScopes; TokenDetails is its input. Callback invocation delivers token/scopes separately, but this adapter invokes the Promise overload. removeCachedAuthToken accepts `{ token }` and returns Promise<void>; clearAllCachedAuthTokens also supports Promise use. No account/profile/email API is requested. The adapter extracts the token field correctly and never places an object wrapper in the Bearer header. No speculative Identity change was made.

The caller signal begins before OAuth but has no OAuth-duration timeout. The 20-second fetch/body signal is created only after acquisition, then combined with caller cancellation. The regression verifies it is active at fetch. One 401 evicts the exact token and acquires one silent replacement; a second 401 stops. GET uses the fixed encoded URL, Bearer string, omitted cookies, rejected redirects and disabled cache. Revocation still uses the same corrected default fetch boundary.

Tokens remain only in the internal adapter/request boundary, transient header/revoke body and Chrome-managed cache. They are never saved to a service field, database, UI, runtime result, diagnostic, log or export. Synthetic token/private-message sentinels verify diagnostic exclusion and strict schemas reject an injected token field.

## Changed files and regression coverage

| Files | Change |
|---|---|
| `src/auth/google-requests.ts` | Bind default native fetch; classify transport/timeout/internal exceptions; annotate acquisition/bootstrap/request failures and bounded retry context |
| `src/auth/errors.ts` | Safe typed diagnostic schema and invocation/timeout codes |
| `src/auth/service.ts`, `src/provider/errors.ts` | Preserve diagnostic context during existing failure conversions |
| `src/runtime/background.ts`, `src/runtime/coordinator.ts`, `src/runtime/contracts.ts` | Explicit validation-composition diagnostic option, default-off production response, validated optional DTO |
| `tools/provider-validation/entrypoints/background.ts`, `tools/provider-validation/entrypoints/options/main.tsx` | Enable/show temporary sanitized Connect failures only in validation build |
| `tools/provider-validation/contracts.ts`, `tools/provider-validation/service.ts` | Safe diagnostic context on failed observations |
| `tests/e2e/provider-validation.spec.ts` | Native receiver regression plus exact URL/Bearer/live-signal checks, sanitized failure display and expiry |
| `tests/unit/authentication.test.ts`, `tests/unit/runtime.test.ts`, `tests/unit/provider-validation.test.ts` | Transport/HTTP/parse/schema/deadline/OAuth/recovery diagnostics, production omission, token exclusion, strict DTO and unchanged stores |
| `tests/unit/authentication-service.test.ts` | Model native network rejection using TypeError while preserving all cleanup/retention expectations |
| This document | Diagnosis, evidence, scope and human retry |

Existing auth tests continue to establish explicit-only consent, ephemeral tokens, channel/Likes validation, usable Bearer authorization, one 401 recovery, second failure stop, 403 distinction, genuine network failure, malformed HTTP-200 failure and cancellation fences. Existing observation unit/browser tests prove no membership/control/sync writes during observation, no durable attempt, no finalization/pruning, genuine trusted completion and closed normal Sync. The sync suite and production gate were not weakened. Test fakes representing native network failure were corrected from arbitrary Error to TypeError; separate new tests assert arbitrary Error is internal.

## Verification and warnings

The native browser regression was added and run before the source fix: failed against the baseline build after Connect, while the native worker probe separately confirmed Illegal invocation. Focused post-fix browser regression passed. Auth focused suite passed 97 tests; runtime suite passed 66 tests; final provider-observation suite has 21 tests, all passing in the full deterministic suite. The full unit suite passes 440 tests across 13 files. verify:sync passes 225 tests.

Final authoritative `npm run verify` exited 0 on 2026-10-04: lint, strict types, 440 deterministic tests, both builds and manifest/artifact checks, and nine Chromium E2E tests passed.

| Requested command | Final result |
|---|---|
| `npm run lint` | PASS, no lint warnings |
| `npm run typecheck` | PASS |
| `npm run test` | PASS, 440 tests / 13 files |
| `npm run verify:sync` | PASS, 225 tests / 5 files |
| `npm run build` | PASS |
| `npm run check:build` | PASS |
| `npm run build:provider-validation` | PASS |
| `npm run check:provider-validation` | PASS |
| `npm run test:e2e` | PASS, nine tests |
| `npm run verify` | PASS, exit 0 |
| `npm audit` | PASS, zero vulnerabilities |
| `git diff --check` | PASS |

Final validation package SHA-256: manifest.json `4D87960FBABDE7E7A133E5A7D637F323506D3C2476B628AF40966EF8E448A3FF`; background.js `43DFE480BA282D81291A9154D1CA990DBD168508B842BED1AFA4116652C83C10`. Base commit remains `12df1b5ff324eacbcd440c210041459ab6de4ff0`; these hashes identify the generated files from the unstaged patch, not a committed release.

All requested standalone lint, typecheck, unit test, sync verification, production build/check, validation build/check and E2E commands were run. Final standalone E2E passed nine Chromium tests. npm audit reported zero vulnerabilities; no audit fix was run. Node 24.19.0 / npm 11.17.0 are the observed toolchain.

Intermediate checks accurately surfaced three old network fixtures using arbitrary Error and a strict optional-property typing error; these were corrected without changing cleanup/pruning assertions. An added diagnostic-expiry browser check initially installed its virtual clock after the real timer was created, so standalone E2E and an initial full verify failed that check. Installing the test clock before Connect resolved it; application expiry logic was unchanged. Those failures are not live-account evidence.

Warnings/notices: Playwright reports NO_COLOR ignored because FORCE_COLOR is set; Git reports LF-to-CRLF conversion notices. One verification run emitted Vitest's optional transform-cache performance suggestion. Lint reports no warnings. Restricted Chromium launch failed with spawn EPERM and restricted audit endpoint/log access failed; permitted outside-sandbox runs resolved both. No install/dependency change was made, so no new install deprecation warning is claimed.

## Human retry and remaining boundaries

One real-account retry is required to verify the repaired path on the original account. The human-built package has been regenerated; do not load `.output/native-fetch-test-composition`, `.output/provider-validation-test-composition` or `.output/options-test-composition`.

1. Review the unstaged patch. In `chrome://extensions`, reload the existing unpacked extension pointing to `C:\Dev\likedex\.output\provider-validation\chrome-mv3`. Close old Options/observation tabs and reopen Extension options so both worker and UI use the rebuilt package.
2. Confirm name **Likedex — RELEASE VALIDATION ONLY**, version **0.1.0**, ID **mmefiakgfhddiojfdnkfpfpbkgbfgkgj**. Keep the intended account on Google's human-controlled test-user list; no new client or permission is needed.
3. Record the privacy agreement if required and click **Connect YouTube** once. Complete any Google consent. Chrome may reuse its cached grant; that does not invalidate the bootstrap check. Confirm connected/read-only and the expected channel locally.
4. If Connect fails, stop and copy only **Sanitized Connect diagnostic** JSON plus the concise message. Include actual local date/time/timezone, Chrome version and build identity/hash. The diagnostic expires after ten minutes; no DevTools/HAR/console/token output is needed. Do not share account/channel content.
5. If Connect succeeds, follow the existing observation runbook: open **non-destructive provider observation**, close other Likedex pages, click **Observe provider without syncing** once and keep that page open. Record only the sanitized final JSON and build/time context; failures retain safe phase information when available. Do not click Sync or alter likes.
6. Report that evidence for assessment. Production approval remains a separate human decision; disable the validation package afterward as described in the runbook.

`PRODUCTION_PROVIDER_VALIDATION_APPROVED` remains false and normal Sync remains provider-validation-required before request-induced mutation. The real auth/bootstrap/provider implementation is shared; observation cannot apply mirror pages, create a durable attempt or obtain a finalizer. The live-provider checklist remains PENDING. No external setup, account action, consent, independent review, production enablement or release approval was performed by this task.

No new architectural/provider assumption was disproved and no implementation blocker remains. AGENTS.md's historical specifications-only wording is stale relative to the supplied committed implementation; the current explicit debugging request authorized this narrow repair. No phase/spec approval was inferred from it. Human live confirmation and fresh independent auth/sync/storage review remain release requirements. All changes are unstaged/uncommitted; suggested human commit after review: `fix: repair live YouTube authentication bootstrap`.
