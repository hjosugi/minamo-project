import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

const copyTargets = [
  ['docs', 'docs'],
  ['issues', 'issues'],
  ['README.md', 'README.md'],
  ['README.ja.md', 'README.ja.md'],
  ['LICENSE', 'LICENSE'],
];

await fs.mkdir(dist, { recursive: true });
await fs.writeFile(path.join(dist, '.nojekyll'), '');

// Assets that are fetched locally rather than committed (scripts/fetch-avatar.sh).
// They are absent in a fresh checkout and in CI, so a missing one is not an error
// — but when a developer has fetched one, the desktop bundle should contain it,
// because Tauri ships dist/ and nothing else.
const optionalCopyTargets = [
  ['assets/avatars', 'assets/avatars'],
];

for (const [source, target] of copyTargets) {
  const from = path.join(root, source);
  const to = path.join(dist, target);
  try {
    await fs.cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing Pages static asset: ${source}`);
    }
    throw error;
  }
}

for (const [source, target] of optionalCopyTargets) {
  try {
    await fs.cp(path.join(root, source), path.join(dist, target), { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
