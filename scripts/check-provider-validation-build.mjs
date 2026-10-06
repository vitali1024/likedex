import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkCanonicalAssets } from './check-canonical-assets.mjs';

const output = '.output/provider-validation/chrome-mv3';
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const production = JSON.parse(await readFile('.output/chrome-mv3/manifest.json', 'utf8'));
assert.equal(manifest.name, 'Likedex — RELEASE VALIDATION ONLY');
for (const field of ['key', 'oauth2', 'permissions', 'host_permissions', 'content_security_policy', 'version', 'manifest_version', 'minimum_chrome_version', 'icons', 'options_ui', 'background', 'side_panel']) {
  assert.deepEqual(manifest[field], production[field], `Validation identity/permissions changed: ${field}`);
}
// Diagnostic entrypoints are isolated: deliberately no product launcher.
assert.equal(manifest.action.default_popup, undefined);
assert.deepEqual(manifest.action.default_icon, production.action.default_icon);
await checkCanonicalAssets(output);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.ok((await readFile(join(output, 'provider-validation.html'), 'utf8')).length);
const scripts = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.doesNotMatch(entry.name, /fixture|mock|popup\.html|\.zip$|\.map$|\.test\.|\.spec\./i);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(js|html|json)$/.test(path)) {
      const text = await readFile(path, 'utf8');
      assert.doesNotMatch(text, /@vite\/client|vitest|playwright|client_secret|BEGIN (?:RSA )?PRIVATE KEY|ya29\./);
      assert.doesNotMatch(text, /<script[^>]+src=["']https?:/i);
      if (path.endsWith('.js')) scripts.push(text);
    }
  }
}
await inspect(output);
assert.match(scripts.join(''), /likedex-release-provider-observation-v1/);
console.log('Separate validation package, unchanged production identity/permissions and fixture/secret exclusion passed.');
