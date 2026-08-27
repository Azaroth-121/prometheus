// Cleans up dist/manifest.json for a real store submission (Chrome Web
// Store and Edge Add-ons) -- only runs as part of `pnpm build:store`, never
// touches the plain dev build (`pnpm build`).
//
// 1. Removes localhost from host_permissions -- that entry only exists so
//    `pnpm dev`'s unpacked-extension build can talk to a local dev server;
//    it serves no purpose for real users and looks like a leftover dev
//    artifact to a store reviewer.
// 2. Removes the `key` field -- it pins a deterministic extension ID for
//    *local* unpacked-extension development (so a reloaded dev build keeps
//    the same ID across reloads). It does nothing for a real store listing:
//    both Chrome Web Store and Edge Add-ons assign their own real ID at
//    first publish regardless of this field. Edge's validator rejects a
//    package that includes it outright ("The manifest shouldn't contain
//    the key field"); Chrome tolerates it but gets no benefit from it
//    either, so it's removed unconditionally for both.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const manifestPath = path.join(distDir, 'manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

const beforePermissions = manifest.host_permissions?.length ?? 0;
manifest.host_permissions = (manifest.host_permissions ?? []).filter(
  (p) => !p.startsWith('http://localhost') && !p.startsWith('http://127.0.0.1')
);
const removedPermissions = beforePermissions - manifest.host_permissions.length;

const hadKey = 'key' in manifest;
delete manifest.key;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Stripped ${removedPermissions} localhost host_permission(s) and ${hadKey ? 'removed' : 'found no'} key field from dist/manifest.json for the store build.`
);
