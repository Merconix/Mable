#!/usr/bin/env node
//MISE hide=true
//MISE description="Generate the fastlane changelog for the current version"
/* oxlint-disable no-console */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(
    `Usage: node scripts/fastlane-changelog.js <version>  (got: ${version ?? '<none>'})`
  );
  process.exit(1);
}

// Matches the versionCode Tauri writes into gen/android/app/tauri.properties,
// which is what fastlane keys changelog files by.
const [major, minor, patch] = version.split(/[.-]/, 3).map(Number);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

// F-Droid and Play both reject changelogs over 500 characters. Measured in
// bytes so the multi-byte bullets cannot push an accepted file over the limit.
const LIMIT = 500;
const size = (text) => Buffer.byteLength(text, 'utf8');

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const start = changelog.indexOf(`\n## ${version} `);
if (start === -1) {
  console.error(`No "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
const rest = changelog.slice(start + 1);
const end = rest.indexOf('\n## ', 1);
const section = end === -1 ? rest : rest.slice(0, end);

const entries = section
  .split('\n')
  .filter((line) => line.startsWith('* '))
  // Attribution is noise on a store listing and eats the character budget.
  .map((line) => `• ${line.slice(2).replace(/ by @\S+( in #\d+)?\.?$/, '')}`);

let body = '';
for (const entry of entries) {
  if (size(body) + size(entry) + 1 > LIMIT) break;
  body += `${entry}\n`;
}
if (!body) body = `${entries[0].slice(0, LIMIT / 4)}\n`;

const out = `fastlane/metadata/android/en-US/changelogs/${versionCode}.txt`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
console.log(`Wrote ${out} (${size(body)} bytes)`);
