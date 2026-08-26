// Removes localhost from host_permissions in the built manifest.json --
// that entry only exists so `pnpm dev`'s unpacked-extension build can talk
// to a local dev server; it serves no purpose for real users and looks like
// a leftover dev artifact to a store reviewer. The dev build (`pnpm build`)
// is untouched -- this only runs as part of `pnpm build:store`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const manifestPath = path.join(distDir, 'manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const before = manifest.host_permissions?.length ?? 0;
manifest.host_permissions = (manifest.host_permissions ?? []).filter(
  (p) => !p.startsWith('http://localhost') && !p.startsWith('http://127.0.0.1')
);
const removed = before - manifest.host_permissions.length;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Stripped ${removed} localhost host_permission(s) from dist/manifest.json for the store build.`);
