# Canonical Likedex assets

Approved sources for the launcher handoff, 2026-10-06:

- Package 1: `likedex-exact-center-assets-vector-smooth.zip` — overall mark, centering, palette, manifest/action PNGs and corrected smooth vector.
- Package 2: `likedex-popup-action-icons-border-matched.zip` — two functional **popup row** icons. Its README, handoff and metadata supply no Chrome toolbar sizes or header mark. It therefore supersedes no global/toolbar file in Package 1.

Both complete archive inventories and all included documentation/metadata were inspected before copying. Package 1 includes master, SVG, public, action, favicon, Store, white, dark, disabled and preview variants. Package 2 includes two 1254×1254 transparent PNGs and a preview. Package 1 verified 36 listed payload files; only the checksum file's self-entry fails (expected `d5f3f3c5bd8a405cc81ae977738cae62cc32e0511aa1d5b018f181e5c0486924`, actual `022a1756ba76a045a4d6c7c9f6115ed38e9dfcec4c28a4177eff6fe9b3bf2db7`). All selected files pass. Package 2 verified all six listed files.

## Source → destination plan

| Package/source | Repository destination | Runtime purpose |
|---|---|---|
| 1: `public/icon/{16,32,48,128}.png` | `public/icon/{16,32,48,128}.png` | Global manifest icons |
| 1: `png/action/{16,24,32}.png` | `public/action/{16,24,32}.png` | Chrome toolbar icon, prepared sizes |
| 1: `svg/likedex-mark-vector.svg` | `public/brand/likedex-mark-vector.svg` | Popup header and shared Full Library/Side Panel brand |
| 2: `icons/likedex-open-side-panel.png` | `public/launcher/likedex-open-side-panel.png` | Open/Close Side Panel row |
| 2: `icons/likedex-open-full-library.png` | `public/launcher/likedex-open-full-library.png` | Open Full Library row |

The popup rows use identical square image slots; the prepared rounded-square border is inside each PNG. No second border/container decoration is added. CSS display sizing preserves each full source canvas and aspect ratio; source bytes are never resampled or recompressed. No geometry, crop, padding, centering or palette edits are permitted. The generic functional SVG icon system remains separate from branding.

`scripts/canonical-assets.json` records the selected hashes verbatim from the package checksum files. Production and validation artifact checks compare both source and emitted assets with those hashes. Store/alternate/master/preview files and ZIPs are not runtime assets. The former foundation icon generator is retired; do not regenerate approved artwork.
