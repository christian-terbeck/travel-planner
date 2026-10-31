#!/usr/bin/env node
// Raises the app version everywhere it is kept, so the installer recognises a build as an update.
//   node scripts/bump-version.mjs            patch: 0.1.0 -> 0.1.1
//   node scripts/bump-version.mjs minor      0.1.3 -> 0.2.0
//   node scripts/bump-version.mjs 1.0.0      explicit version
// Cargo.lock follows with the next build.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);
const read = (p) => readFileSync(file(p), "utf8");

const current = JSON.parse(read("package.json")).version;
const arg = process.argv[2] ?? "patch";
const [major, minor, patch] = current.split(".").map(Number);
const next =
  arg === "major"
    ? `${major + 1}.0.0`
    : arg === "minor"
      ? `${major}.${minor + 1}.0`
      : arg === "patch"
        ? `${major}.${minor}.${patch + 1}`
        : /^\d+\.\d+\.\d+$/.test(arg)
          ? arg
          : null;
if (!next) {
  console.error(`Unknown version step "${arg}" (patch, minor, major or x.y.z)`);
  process.exit(1);
}

function replace(path, pattern, count) {
  const text = read(path);
  let n = 0;
  const out = text.replace(pattern, (m, before) => (n++ < count ? `${before}${next}"` : m));
  if (n < count) throw new Error(`${path}: version not found`);
  writeFileSync(file(path), out);
}

replace("package.json", /("version":\s*")[^"]+"/, 1);
// The lockfile repeats the version for the root package.
replace("package-lock.json", /("version":\s*")[^"]+"/g, 2);
replace("src-tauri/tauri.conf.json", /("version":\s*")[^"]+"/, 1);
replace("Cargo.toml", /(\[workspace\.package\]\s*\nversion\s*=\s*")[^"]+"/, 1);

console.log(`${current} -> ${next}`);
