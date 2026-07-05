import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const checks = [
  ['npm', ['run', 'lint']],
  ['npm', ['test']],
  ['npm', ['run', 'verify']],
  ['npm', ['run', 'typecheck:js']],
  ['npm', ['run', 'build']],
];

if (fs.existsSync('relay-rs/Cargo.toml')) {
  checks.push(['cargo', ['fmt', '--manifest-path', 'relay-rs/Cargo.toml', '--', '--check']]);
  checks.push(['cargo', ['clippy', '--manifest-path', 'relay-rs/Cargo.toml', '--all-targets', '--', '-D', 'warnings']]);
  checks.push(['cargo', ['build', '--manifest-path', 'relay-rs/Cargo.toml', '--release']]);
  checks.push(['cargo', ['test', '--manifest-path', 'relay-rs/Cargo.toml']]);
}

if (fs.existsSync('crates/kgm1-codec/Cargo.toml')) {
  checks.push(['cargo', ['test', '--manifest-path', 'crates/kgm1-codec/Cargo.toml']]);
}

if (fs.existsSync('src-tauri/Cargo.toml')) {
  checks.push(['cargo', ['fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check']]);
  checks.push(['cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml']]);
  checks.push(['cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']]);
}

if (fs.existsSync('relay-node/server.mjs')) {
  checks.push(['node', ['--check', 'relay-node/server.mjs']]);
  checks.push(['npm', ['test', '--prefix', 'relay-node']]);
}

for (const [cmd, args] of checks) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`release smoke failed to start ${cmd}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nRelease smoke checks passed. Manual browser, camera, desktop GUI, relay-token, virtual-camera, and WebTransport checks are still required before release.');
