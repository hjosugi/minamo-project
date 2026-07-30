import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_UPDATER_PLATFORMS = Object.freeze([
  'linux-x86_64',
  'windows-x86_64',
  'darwin-aarch64',
  'darwin-x86_64',
]);

export function validateUpdaterEntry(entry, platform) {
  if (!entry) {
    throw new Error(`updater manifest is missing ${platform}`);
  }
  if (typeof entry.signature !== 'string' || entry.signature.length < 80) {
    throw new Error(`updater manifest has no usable signature for ${platform}`);
  }

  let url;
  try {
    url = new URL(entry.url);
  } catch {
    throw new Error(`updater manifest URL for ${platform} is invalid`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`updater manifest URL for ${platform} must use HTTPS`);
  }
}

export function validateUpdaterManifest(manifest, expectedVersion) {
  if (manifest.version !== expectedVersion) {
    throw new Error(`updater manifest version ${manifest.version ?? '(missing)'} does not match ${expectedVersion}`);
  }

  for (const platform of REQUIRED_UPDATER_PLATFORMS) {
    validateUpdaterEntry(manifest.platforms?.[platform], platform);
  }

  return [...REQUIRED_UPDATER_PLATFORMS];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, expectedVersion] = process.argv.slice(2);
  if (!manifestPath || !expectedVersion) {
    console.error('usage: node scripts/validate-updater-manifest.mjs <latest.json> <version>');
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const platforms = validateUpdaterManifest(manifest, expectedVersion);
  console.log(`OK: signed updater manifest covers ${platforms.join(', ')}`);
}
