import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const output = '.output/chrome-mv3';
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

assert.equal(pkg.name, 'likedex');
assert.equal(manifest.name, 'Likedex');
assert.equal(manifest.version, pkg.version);
assert.notEqual(manifest.version, '0.0.0');
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ['identity', 'sidePanel']);
assert.deepEqual([...manifest.host_permissions].sort(), ['https://oauth2.googleapis.com/*', 'https://www.googleapis.com/*']);
assert.deepEqual(manifest.oauth2, {
  client_id: '875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com',
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
});
assert.equal(manifest.optional_permissions, undefined);
assert.equal(manifest.optional_host_permissions, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.deepEqual(manifest.content_security_policy, {
  extension_pages: "script-src 'self'; object-src 'self'; connect-src https://www.googleapis.com https://oauth2.googleapis.com; img-src 'self' https://i.ytimg.com",
});
// Exact public release metadata; independent of the build configuration.
assert.equal(manifest.key, 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2Mrsf7jhzWUVvet1U8+ivTvl7skABNZU3ZmlhBchXJ383YHZqNpQju8IUPfZprfoxlBoma1W9Cf6/T+Pc08PmzJS2P1gtHBQ2dsC0FGVVGPdVoq3BpHfA7sHphlorQ59217U4dEPB7KbUFmePOvC+UtJlc1LgVaLTRh1+9Ifiv32CeuHMMg56hqj3e+5O4aBPAfmhBMMfJ5g0xvE5QeNBIuCGVw1uCyVS9HQaZpKfpKnjgNK9WnbVE1JHYjFC4yF3t5k8/qc/Fo/wcClQu8nhrZBiddjbu8dYa6CfQqyeIlc7gTk8288emrXpOLl1qYwfy1spKCaYcd1f3rqnZEpsQIDAQAB');
const extensionId = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, (digit) => String.fromCharCode('a'.charCodeAt(0) + parseInt(digit, 16)));
assert.equal(extensionId, 'mmefiakgfhddiojfdnkfpfpbkgbfgkgj');
assert.equal(manifest.action.default_title, 'Open Likedex');
assert.equal(manifest.action.default_popup, undefined);
assert.deepEqual(manifest.options_ui, { page: 'options.html', open_in_tab: true });
assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.icons, {
  16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png',
});

for (const path of ['options.html', 'sidepanel.html', 'background.js', ...Object.values(manifest.icons)]) {
  assert.ok((await stat(join(output, path))).size > 0, `Missing or empty artifact: ${path}`);
}

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.doesNotMatch(entry.name, /fixture|mock|demo|\.map$|\.test\.|\.spec\./i);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(js|html|json)$/.test(path)) {
      const text = await readFile(path, 'utf8');
      // Bundling the real repository brings Dexie's pinned location-only debug
      // detector. It is not a development connection destination. Exempt only
      // that exact expression; all other local-host references still fail.
      const dexieDebugDetector = String.raw`/^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href)`;
      assert.ok(text.split(dexieDebugDetector).length <= 2, 'Unexpected repeated Dexie debug detector');
      const inspected = path === join(output, 'background.js') ? text.replace(dexieDebugDetector, '') : text;
      assert.doesNotMatch(inspected, /localhost|127\.0\.0\.1|@vite\/client|react-dom\/server|vitest|playwright|LikeDeck/);
      assert.doesNotMatch(text, /<script[^>]+src=["']https?:/i);
      assert.doesNotMatch(text, /client_secret|BEGIN (?:RSA )?PRIVATE KEY|ya29\./);
    }
  }
}

await inspect(output);
console.log('OAuth/Store identity, manifest, entrypoints, icons, and production artifact checks passed.');
