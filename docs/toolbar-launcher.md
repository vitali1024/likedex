# Toolbar launcher handoff A

Historical phase/handoff record: its baseline, then-pending work and staging statements describe that execution. The working implementation and subsequent committed enablement/UI changes are current; [final verification](agentic/capstone-verification.md) records source/package provenance and remaining release gates. Production Sync is enabled; first real sync is human-reported. Independent high-risk and human exact-package/native-toolbar acceptance remain pending.

Implemented as an unstaged shell/branding patch on 2026-10-06. Human native-toolbar/visual smoke remains required; this is not Store release acceptance.

## Starting state

Branch `main`, HEAD `03da5fed6d56e6dc733896ea83a8632fedd000f7`. Initial `git status --short`: only `?? demo/`; the index was empty. The pre-existing untracked demo contains `.gitignore`, `README.md`, `assemble.py`, `capture.py`, `inventory.mjs`, `make-plan.mjs`, `operator-steps.md`, `prepare.mjs`, `record-evidence.mjs`, `recording-report.md`, `requirements.txt`, `timeline.md`, `visual-qa.py`, and `walkthrough.mjs`. No demo file was edited, staged or removed.

## Asset-package inspection

Both complete ZIP inventories, READMEs, handoffs, checksum lists and JSON metadata were inspected in separate temporary extraction directories. Package 1 master and Package 2 preview were visually inspected. Package 1 contains general mark/master/vector/palette and action/favicon/Store/white/dark/disabled variants. Package 2 contains only two 1254×1254 transparent popup-row PNGs and a preview; it does **not** supply toolbar-size or header assets. Therefore Package 1 supplies toolbar/global/header branding, while Package 2 supplies popup rows with its prepared matched borders.

Package 1: all 36 listed payloads verify, including every selected file; the checksum list's self-entry mismatches. Package 2: all six listed files verify. [Canonical assets](branding-assets.md) records the self-entry's expected/actual digests and the exact source → destination → runtime mapping. No geometry regeneration, image resampling/recompression, recentering, source padding/crop changes, or duplicate decorative icon border occurred. Full source canvases are displayed with equal CSS dimensions and preserved aspect ratio. Large Store assets and ZIPs are excluded.

## Product behavior implemented

The toolbar opens `popup.html`, a compact dark navy launcher with canonical Likedex mark/tagline and exactly two native row buttons. It has no library/search/filter/sort/sync/settings/detail controls or data observer. The production worker explicitly disables the old direct toolbar panel behavior, including previously persisted browser configuration on extension update.

The panel label derives from Chrome current-window truth: `windows.getCurrent`, exact-path SIDE_PANEL context queries, window-scoped `extension.getViews`, visible document verification and exclusion of ordinary tab views. Open/Close call the real global/window APIs directly from the click before an await. Query failure remains unknown/disabled; operation failure retains the label with a fixed sanitized error and permits retry. Full Library independently calls `runtime.openOptionsPage` and retains the existing Options manifest/path. Successful panel actions dismiss the popup; reopening queries fresh state. Listeners are cleaned up and late/superseded results cannot update a disposed launcher. No state is persisted.

## Chrome API / compatibility decision

Official documentation inspected on 2026-10-06:

- [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): Open 116+, real Close 141+, window-scoped global panels, extension-page user gesture.
- [Runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime): getContexts 116+ MV3, window/document/type filters; promise openOptionsPage 99+ and manifest-dependent behavior.
- [Windows](https://developer.chrome.com/docs/extensions/reference/api/windows): promise getCurrent 88+; window ID alone does not require tabs permission.
- [Extension views](https://developer.chrome.com/docs/extensions/reference/api/extension#method-getViews): foreground live Window objects, native window filter, optional tab view type, no additional permission.
- [Action popup](https://developer.chrome.com/docs/extensions/reference/api/action#popup): default_popup controls toolbar popup behavior; an action popup suppresses action.onClicked.

Final minimum is **Chrome 141**, encoded in source, emitted manifest and both artifact checks. Permissions remain exactly identity + sidePanel. OAuth client/scope/key/derived extension ID, host permissions and CSP remain unchanged.

### Evidence-driven, human-approved detection amendment

The real Chromium **153.0.8010.12** probe found SIDE_PANEL contexts with `windowId: -1`. The initial handoff's scoped-context-only assumption missed the actual open panel. The human explicitly approved live panel window/visibility queries without stored state or added permission. The official foreground view API supplies native window scoping directly, so no new shell messaging/connection is necessary. An immediate post-Close probe also saw the context during animation; after waiting for completion it disappeared and the native closed event fired. No persistent-after-close claim is made.

The real production browser regression now opens/closes the panel from actual extension-page clicks, checks fresh labels on reopening, creates a second real window, and proves that a normal tab at the panel URL cannot impersonate this window's panel. Native pinned-toolbar clicking is still a separate human check.

## Files changed

| File(s) | Purpose |
|---|---|
| `wxt.config.ts` | Chrome 141 minimum and approved multi-size toolbar icons |
| `wxt.validation.config.ts` | Explain diagnostic shell isolation |
| `entrypoints/background.ts` | Disable old direct-action panel configuration |
| `entrypoints/popup/index.html`, `main.tsx` | Production launcher entry/mount and success dismissal |
| `src/launcher/controller.ts`, `Launcher.tsx`, `launcher.css` | Native API state/actions, accessible two-row UI and compact palette |
| `src/options/BrandMark.tsx` | Shared canonical vector header |
| `src/options/OptionsApp.tsx`, `options.css` | Replace constructed brand circle only |
| `public/icon/16.png`, `32.png`, `48.png`, `128.png` | Exact Package 1 global manifest PNGs |
| `public/action/16.png`, `24.png`, `32.png` | Exact Package 1 toolbar PNGs |
| `public/brand/likedex-mark-vector.svg` | Exact corrected Package 1 vector |
| `public/launcher/likedex-open-side-panel.png`, `likedex-open-full-library.png` | Exact Package 2 popup-row PNGs |
| `scripts/canonical-assets.json`, `check-canonical-assets.mjs` | Package-derived source/emitted hash checks |
| `scripts/check-build.mjs` | Popup/default paths, icons/minimum/permissions, dependency isolation, asset hashes and archive exclusion |
| `scripts/check-provider-validation-build.mjs` | Explicit no-popup diagnostic contract and matching identity/canonical assets |
| `scripts/generate-icons.mjs` (deleted) | Retire obsolete generator that overwrote approved global artwork |
| `tests/unit/launcher.test.tsx` | 31 controller/presentation regressions |
| `tests/e2e/launcher.spec.ts` | Nine actual-package launcher/browser regressions |
| `tests/e2e/shell.spec.ts` | Verify direct-action behavior is false |
| `README.md` | Current launch/compatibility/assets/smoke guidance |
| `docs/product-spec.md`, `engineering-spec.md`, `acceptance-criteria.md` | Current launcher contract, refined detection and acceptance gates |
| `docs/implementation-plan.md`, `decisions.md` | Authorized shell/detection amendment; historical plan retained |
| `docs/options-ui.md`, `verification-strategy.md` | Shared mark and launcher verification scope |
| `docs/release/chrome-web-store.md` | Chrome minimum, launcher manifest and native smoke contract |
| `docs/branding-assets.md`, `toolbar-launcher.md` | Asset provenance/mapping and this handoff/smoke report |

No sync/auth/storage/provider/runtime-domain implementation, package dependency, demo or historical evidence was modified. The validation-only composition still has no popup, retains its own direct-action panel behavior, and keeps observation non-destructive/Sync blocked.

## Tests added/updated

31 unit tests cover exact context/window/document queries, windowless context/view detection, hidden views, ordinary-tab exclusion, unknown/pending state, direct gesture-time Open/Close, post-success truth, retryable failures/sanitization, independent Options, duplicate activations, stale queries/disposal, exact two-button rendering and canonical mark/row assets.

Nine Chromium tests cover real production mounting/image loading/layout, native Options opening, actual Side Panel Open/Close/reopening/two-window scope/tab exclusion, injected failure/pending boundaries, keyboard/native-button/focus/reduced-motion behavior, and absence of a duplicate icon border. Injected boundaries exist only in test code. The production shell smoke now verifies direct action-click opening is false. Hash checks validate source **and emitted** approved assets; the popup dependency graph cannot include auth/library/storage/provider observation.

## Documentation

Normative updates: README; product/engineering/acceptance; implementation plan/decisions; Options UI; verification strategy; Chrome Web Store checklist; canonical asset policy and this launcher handoff. The contract is toolbar → launcher → Side Panel / Full Library. The popup is an entry selector; the two existing app surfaces keep their behavior. Historical test counts and human evidence remain historical.

## Verification

Final required pipeline: **`npm run verify` passed**, with **583 unit tests across 14 files** and **28 Chromium E2E tests**, no skipped tests. Production and provider-validation builds and artifact checks pass. `git diff --check` passes. Node 24.19.0, npm 11.17.0; browser 153.0.8010.12.

| Executed verification command | Outcome |
|---|---|
| `npx vitest run tests/unit/launcher.test.tsx` | Initial 26, then final expanded 31 pass |
| `npm run lint` | Pass |
| `npm run typecheck` | Final pass; initial interface/dependency-view declaration mismatches corrected with validated unknown view results |
| `npm run test` | Final full suite 583 pass (earlier pre-amendment suite: 578) |
| `npm run verify:ui` | 29 pass |
| `npm run build` | Pass, production at `.output/chrome-mv3` |
| `npm run check:build` | Final pass; initial WXT popup-title override mismatch fixed at HTML source |
| `npm run build:provider-validation` | Pass |
| `npm run check:provider-validation` | Pass |
| `npx playwright test tests/e2e/launcher.spec.ts` | Focused initial eight pass; expanded run eight pass/one pending mock failure, fixed for the two-query path; all nine pass in final authoritative run |
| `node .output/probe-panel.mjs` | Isolated diagnostic probes establish context ID −1, correct view/window scoping, and eventual real Close lifecycle; disposable scripts/copies are outside runtime artifact/source |
| `npm run test:e2e` (through verify) | 28 pass |
| `npm run verify` | Entire lint/types/tests/build/check/validation/E2E chain passes |
| `git diff --check` | Pass |

Initial sandbox browser spawning failed with EPERM; authorized outside-sandbox isolated Playwright execution succeeded. This is recorded as an initial failure, never a passing browser run. Git emits LF/CRLF conversion warnings and Playwright emits NO_COLOR/FORCE_COLOR warnings; neither changes the verification result.

Production emitted manifest SHA256: `3d5726c3ec605c6329acbe2c6670169ebe5dab120688f3b21cc7748e45b352e6`; background SHA256: `9dc181d912b0168f88bdf0949b2b6421aab79c1670fd7af15415863adc269b8f`. These identify the generated unstaged patch's artifacts, not a release ZIP or Store submission.

## Manual smoke still required

**Human smoke has not been performed or marked passed.** Use the actual generated production directory `C:\Dev\likedex\.output\chrome-mv3`, not a test/validation composition. Record Chrome version, source HEAD plus unstaged patch, install mode and build hashes.

1. In Chrome 141+, open `chrome://extensions`, enable Developer mode, load the exact production directory, and pin Likedex. Confirm unchanged extension ID `mmefiakgfhddiojfdnkfpfpbkgbfgkgj`, expected permissions and no unexpected new prompt.
2. Inspect toolbar mark on light and dark toolbars where practical. Compare **Package 1's action PNGs** (Package 2 has no toolbar artwork). Check clipping, centering, padding and absence of added borders.
3. Click the toolbar icon. Confirm a compact dark navy/cyan launcher appears and the Side Panel does not open immediately. Check canonical mark, Likedex, tagline, exactly two primary actions, both supplied matched row icons and no extra footer/library/search/filter/detail/sync/settings content.
4. With panel closed, confirm Open Side Panel, activate it and confirm the existing compact app opens beside the webpage. Reopen the toolbar popup; confirm Close Side Panel. Activate Close, wait for native animation to finish, then reopen and confirm Open. Repeat; closing through Chrome's own panel control must also produce Open on reopening.
5. In two Chrome windows, open the panel only in one. Reopen both launchers: Close belongs only to that window; the other says Open. Confirm each launcher operates its own window.
6. Activate Open Full Library. Confirm the existing Options application opens/focuses a tab, renders normally and retains ordinary library interactions. Reopen the panel and verify normal app rendering/expand/detail/Back. No duplicate Full Library page exists.
7. Tab through the two launcher rows, check visible focus and Enter/Space activation; inspect at increased text/zoom and reduced motion. Compare popup-row border geometry/padding with **Package 2's source**, without altering artwork by eye.

## Remaining risks

Chrome 141 is required; actual automated browser is 153, so visible Chrome 141 behavior still needs human smoke. The API-approved popup gesture is tested from a real extension page, not the native pinned action. Successful panel actions dismiss the popup; reopening recomputes state, while API failures keep it open/retryable. Native panel closing animation briefly retains contexts/views; no instant optimistic flip is used. Browser API view/context behavior is tested in two real windows but native Chrome/light-dark rendering, screen-reader UX and Store-installed behavior remain human checks. The original Package 1 self-checksum anomaly is documented; selected asset hashes are sound. PNG row source sizes increase runtime package size (about 1.98 MB total); they remain exact approved bytes.

## Git state

Final branch `main`, HEAD `03da5fed6d56e6dc733896ea83a8632fedd000f7`, unchanged. All source/assets/docs changes remain unstaged; no previously staged work existed. No commit, push, reset or clean occurred. `demo/` is preserved. No ZIP was copied into the repository or production package.

Final short status:

```text
 M README.md
 M docs/acceptance-criteria.md
 M docs/decisions.md
 M docs/engineering-spec.md
 M docs/implementation-plan.md
 M docs/options-ui.md
 M docs/product-spec.md
 M docs/release/chrome-web-store.md
 M docs/verification-strategy.md
 M entrypoints/background.ts
 M public/icon/128.png
 M public/icon/16.png
 M public/icon/32.png
 M public/icon/48.png
 M scripts/check-build.mjs
 M scripts/check-provider-validation-build.mjs
 D scripts/generate-icons.mjs
 M src/options/OptionsApp.tsx
 M src/options/options.css
 M tests/e2e/shell.spec.ts
 M wxt.config.ts
 M wxt.validation.config.ts
?? demo/
?? docs/branding-assets.md
?? docs/toolbar-launcher.md
?? entrypoints/popup/
?? public/action/
?? public/brand/
?? public/launcher/
?? scripts/canonical-assets.json
?? scripts/check-canonical-assets.mjs
?? src/launcher/
?? src/options/BrandMark.tsx
?? tests/e2e/launcher.spec.ts
?? tests/unit/launcher.test.tsx
```
