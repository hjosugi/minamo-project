import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_METADATA_PATHS = Object.freeze({
  packageJson: 'package.json',
  tauriConfig: 'src-tauri/tauri.conf.json',
  cargoToml: 'src-tauri/Cargo.toml',
  releaseNotesDirectory: 'docs/releases',
});

export function parseCargoPackageVersion(cargoToml) {
  const packageSection = cargoToml
    .split(/(?=^\[[^\]]+\]\s*$)/m)
    .find((section) => section.startsWith('[package]'));
  const version = packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (!version) {
    throw new Error('src-tauri/Cargo.toml has no package version');
  }
  return version;
}

export function validateReleaseMetadata({
  tag,
  packageVersion,
  tauriVersion,
  cargoVersion,
  releaseNotesPath,
  releaseNotesExists,
}) {
  const expectedTag = `v${packageVersion}`;
  if (tag !== expectedTag) {
    throw new Error(`release tag ${tag} does not match package version ${expectedTag}`);
  }
  if (tauriVersion !== packageVersion) {
    throw new Error(`Tauri version ${tauriVersion} does not match package version ${packageVersion}`);
  }
  if (cargoVersion !== packageVersion) {
    throw new Error(`Cargo version ${cargoVersion} does not match package version ${packageVersion}`);
  }
  if (!releaseNotesExists) {
    throw new Error(`release notes are missing: ${releaseNotesPath}`);
  }

  return { tag, version: packageVersion, releaseNotesPath };
}

export function validateReleaseMetadataAtRoot(tag, root = process.cwd()) {
  const resolveMetadataPath = (relativePath) => path.join(root, ...relativePath.split('/'));
  const packageJson = JSON.parse(
    fs.readFileSync(resolveMetadataPath(RELEASE_METADATA_PATHS.packageJson), 'utf8'),
  );
  const tauriConfig = JSON.parse(
    fs.readFileSync(resolveMetadataPath(RELEASE_METADATA_PATHS.tauriConfig), 'utf8'),
  );
  const cargoToml = fs.readFileSync(
    resolveMetadataPath(RELEASE_METADATA_PATHS.cargoToml),
    'utf8',
  );
  const releaseNotesPath = `${RELEASE_METADATA_PATHS.releaseNotesDirectory}/${tag}.md`;

  return validateReleaseMetadata({
    tag,
    packageVersion: packageJson.version,
    tauriVersion: tauriConfig.version,
    cargoVersion: parseCargoPackageVersion(cargoToml),
    releaseNotesPath,
    releaseNotesExists: fs.existsSync(resolveMetadataPath(releaseNotesPath)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag] = process.argv.slice(2);
  if (!tag) {
    console.error('usage: node scripts/validate-release-metadata.mjs <v* tag>');
    process.exit(2);
  }

  const metadata = validateReleaseMetadataAtRoot(tag);
  console.log(
    `OK: ${metadata.tag} matches package, Tauri, Cargo, and ${metadata.releaseNotesPath}`,
  );
}
