// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import { createHash } from 'node:crypto';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Vice Heat pre-flight: prove every screenshot is a real, whole image ---
// The dossier step trusts whatever sits in screenshots/, so I check the bytes
// myself before anything is copied: each regular file must carry a complete
// PNG signature or a JPEG start/end marker pair, and stay within the cap.
const SCREENSHOT_LIMIT_BYTES = 262144;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function looksLikeWholePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length + 12) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  // A finished PNG always closes with the IEND chunk type near its tail.
  const tail = Buffer.from(bytes.subarray(bytes.length - 12)).toString('latin1');
  return tail.includes('IEND');
}
function looksLikeWholeJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const startsOk = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const endsOk = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  return startsOk && endsOk;
}
const sourceShotsDir = join(here, 'screenshots');
let screenshotsValidated = 0;
if (existsSync(sourceShotsDir)) {
  for (const entryName of readdirSync(sourceShotsDir).sort()) {
    const entryPath = join(sourceShotsDir, entryName);
    if (!statSync(entryPath).isFile()) continue;
    const shotBytes = readFileSync(entryPath);
    if (shotBytes.length > SCREENSHOT_LIMIT_BYTES) {
      throw new Error(`Vice Heat: screenshot "${entryName}" is ${shotBytes.length} bytes, over the ${SCREENSHOT_LIMIT_BYTES}-byte limit`);
    }
    if (!looksLikeWholePng(shotBytes) && !looksLikeWholeJpeg(shotBytes)) {
      throw new Error(`Vice Heat: screenshot "${entryName}" is not a complete PNG or JPEG image`);
    }
    screenshotsValidated += 1;
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// --- Vice Heat manifest: fingerprint everything that was handed in ---
// I walk the copied game/ tree and hash each file, so the exact bytes of this
// build can be re-verified later without trusting folder listings or sizes.
type ManifestEntry = { path: string; bytes: number; sha256: string };
const manifestEntries: ManifestEntry[] = [];
function collectGameFiles(dir: string, prefix: string): void {
  for (const name of readdirSync(dir).sort()) {
    const fullPath = join(dir, name);
    const relPath = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(fullPath).isDirectory()) {
      collectGameFiles(fullPath, relPath);
    } else if (statSync(fullPath).isFile()) {
      const contents = readFileSync(fullPath);
      const digest = createHash('sha256').update(contents).digest('hex');
      manifestEntries.push({ path: relPath, bytes: contents.length, sha256: digest });
    }
  }
}
collectGameFiles(join(out, 'game'), '');
const manifestTotalBytes = manifestEntries.reduce((sum, entry) => sum + entry.bytes, 0);
const manifestDocument = {
  game: 'Vice Heat',
  generatedBy: 'Vice Heat build step in main.ts (manifest writer)',
  fileCount: manifestEntries.length,
  totalBytes: manifestTotalBytes,
  files: manifestEntries,
};
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifestDocument, null, 2)}\n`);

// --- Vice Heat build summary, for the human watching this run ---
console.log('Vice Heat build complete:');
console.log(`  game files copied: ${manifestEntries.length}`);
console.log(`  screenshots validated: ${screenshotsValidated}`);
console.log(`  game bytes total: ${manifestTotalBytes}`);
console.log(`  dossier written: ${join(out, 'dossier.json')}`);
console.log(`  manifest written: ${join(out, 'manifest.json')}`);
