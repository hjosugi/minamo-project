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
