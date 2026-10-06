import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkCanonicalAssets(output) {
  // These approved values were copied from the source-package checksum lists.
  const hashes = JSON.parse(await readFile('scripts/canonical-assets.json', 'utf8'));
  for (const [path, approvedHash] of Object.entries(hashes)) {
    for (const root of ['public', output]) {
      const bytes = await readFile(join(root, path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), approvedHash, `Canonical asset changed: ${root}/${path}`);
    }
  }
}
