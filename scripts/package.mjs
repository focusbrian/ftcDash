import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the static site and zips the *contents* of dist/ — the shape a cPanel host wants.
 *
 *   node scripts/package.mjs                      → domain root, ftcdash-site.zip
 *   node scripts/package.mjs --base=/ftcdash/     → served from a folder
 *   node scripts/package.mjs --out=../upload.zip  → different archive name/location
 */

/**
 * Bundle names that a host cache may still be serving an index.html for. InMotion puts an nginx
 * proxy in front of Apache and keeps answering `/` from its cache, so a visitor can load a page built
 * before the last deploy — and that page only ever asks for the bundle name it was built with.
 * Shipping the current bundle under those names means those visitors still run the current code.
 * Interim workaround: drop an entry once the host cache has been purged or has expired.
 */
const LEGACY_BUNDLES = ['index-B8b5_PfR.js', 'index-6IMxy0BL.js'];

function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const base = arg('base') ?? '/';
const outArg = arg('out');
const withAssets = process.argv.includes('--with-assets');

if (!base.startsWith('/') || !base.endsWith('/')) {
  console.error(`--base must start and end with "/" (got "${base}"). Use "/" for a domain root.`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = outArg ? resolve(process.cwd(), outArg) : join(root, 'ftcdash-site.zip');

function run(command, options = {}) {
  const result = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true, ...options });
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${command}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Building for base path ${base} …`);
run('npm run build', { env: { ...process.env, BASE_PATH: base } });

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html is missing — the build did not produce a site.');
  process.exit(1);
}

// The one thing that silently breaks a sub-folder deploy is a base path that does not match.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const referenced = /src="([^"]*\/assets\/)/.exec(html)?.[1] ?? null;
if (referenced && !referenced.startsWith(base)) {
  console.error(`index.html points at ${referenced}, which is not under ${base}.`);
  process.exit(1);
}

// On a PHP host the admin page owns shared-assets.json, so shipping the committed copy would wipe
// the library on every deploy. Keep it only when asked for.
const manifest = join(dist, 'shared-assets.json');
if (existsSync(manifest)) {
  if (withAssets) {
    console.log('Including shared-assets.json from the repo (--with-assets).');
  } else {
    rmSync(manifest);
    console.log('Leaving shared-assets.json out — the PHP admin page keeps its own copy on the server.');
  }
}

const entryScript = readdirSync(join(dist, 'assets')).find((name) => /^index-.+\.js$/.test(name));
if (entryScript && LEGACY_BUNDLES.length > 0) {
  for (const legacy of LEGACY_BUNDLES) {
    if (legacy === entryScript) continue;
    copyFileSync(join(dist, 'assets', entryScript), join(dist, 'assets', legacy));
    console.log(`Also shipped ${entryScript} as ${legacy}, for pages a host cache still serves.`);
  }
}

rmSync(out, { force: true });
const win = process.platform === 'win32';
if (win) {
  run(
    `powershell -NoProfile -Command "Compress-Archive -Path '${join(dist, '*')}' -DestinationPath '${out}' -Force"`,
  );
} else {
  run(`zip -r -q "${out}" .`, { cwd: dist });
}

const entries = win ? listZip(out) : listFiles(dist);
const bytes = statSync(out).size;

console.log(`\nPackaged ${entries.length} files into ${out}`);
console.log(`  ${(bytes / 1024).toFixed(1)} KB`);
for (const entry of entries) console.log(`  ${entry}`);
if (!entries.some((entry) => entry.includes('.htaccess'))) {
  console.log('\nNote: .htaccess is missing from the archive — check your zip tool keeps dotfiles.');
}
console.log(
  `\nUpload it to ${base === '/' ? 'public_html' : `the "${base}" folder`}, extract it there, then delete the archive.`,
);
console.log('Then open /admin/ on the site to add logos and robot photos (PHP hosts only).');

function listZip(archive) {
  const command =
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
    `[System.IO.Compression.ZipFile]::OpenRead('${archive}').Entries | ForEach-Object { $_.FullName }`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  return (result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listFiles(dir) {
  const walk = (current) =>
    readdirSync(current).flatMap((name) => {
      const full = join(current, name);
      return statSync(full).isDirectory() ? walk(full) : [full.slice(dir.length + 1).replace(/\\/g, '/')];
    });
  return walk(dir);
}
