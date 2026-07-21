/**
 * Real publish verification — the check that was missing when 0.1.0 shipped
 * broken. A `--dry-run` file list is NOT enough: 0.1.0's manifest pointed
 * `main`/`exports` at `./src/index.ts` (via a pnpm-only `publishConfig`
 * override that `npm publish` silently ignored), and `files: ["dist"]` never
 * shipped `src`, so every install failed with ERR_MODULE_NOT_FOUND. Only an
 * actual install-and-import catches that.
 *
 * This script PACKS each package the way it will really be published, installs
 * the tarball into a clean directory OUTSIDE the workspace, and does a real
 * Node import / bin run against it:
 *   - eslint-plugin-aria-a11y: packed with `npm pack` (it is tool-independent
 *     now, so npm — the tool that broke 0.1.0 — is the strictest test), then
 *     imported; its manifest is asserted to reference no `src`.
 *   - @aria-a11y/cli: packed with `pnpm pack` (its `workspace:^` dep on the
 *     plugin is only converted by pnpm; publishing it with plain `npm` would
 *     leak the protocol), installed alongside the plugin tarball, and its bin
 *     is run against a fixture with a known finding.
 *
 * Exit nonzero on any failure. Wired into CI so this class of bug cannot ship
 * silently again.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(path.join(tmpdir(), 'aria-verify-pack-'));
const cleanups = [work];

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function fail(msg) {
  console.error(`\n✗ verify-pack: ${msg}`);
  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
  process.exit(1);
}
const pkgVersion = (rel) =>
  JSON.parse(readFileSync(path.join(root, rel, 'package.json'), 'utf8')).version;

try {
  console.log('• building both packages');
  run('pnpm', ['-r', 'build'], root);

  const pluginVer = pkgVersion('packages/eslint-plugin');
  const cliVer = pkgVersion('packages/cli');

  // --- pack, each with the tool it will really be published with ---------
  console.log('• packing eslint-plugin-aria-a11y (npm pack — the strict, tool-independent path)');
  run('npm', ['pack', '--pack-destination', work], path.join(root, 'packages/eslint-plugin'));
  const pluginTgz = path.join(work, `eslint-plugin-aria-a11y-${pluginVer}.tgz`);

  console.log('• packing @aria-a11y/cli (pnpm pack — converts its workspace: dep)');
  run('pnpm', ['pack', '--pack-destination', work], path.join(root, 'packages/cli'));
  const cliTgz = path.join(work, `aria-a11y-cli-${cliVer}.tgz`);

  // --- assert the packed plugin manifest references no src -----------------
  const pluginManifest = JSON.parse(
    run('tar', ['-xzOf', pluginTgz, 'package/package.json']),
  );
  const manifestJson = JSON.stringify(pluginManifest);
  if (manifestJson.includes('./src/') || manifestJson.includes('/src/index')) {
    fail(`plugin manifest still references src: ${JSON.stringify(pluginManifest.exports)}`);
  }
  console.log('  ✓ plugin manifest points only at dist');

  // --- install + import the plugin in a clean external dir ----------------
  console.log('• installing the plugin tarball into a clean dir and importing it');
  const dirA = mkdtempSync(path.join(tmpdir(), 'aria-consumer-plugin-'));
  cleanups.push(dirA);
  run('npm', ['init', '-y'], dirA);
  run('npm', ['install', '--no-audit', '--no-fund', pluginTgz], dirA);
  const importOut = run(
    'node',
    [
      '--input-type=module',
      '-e',
      "import p from 'eslint-plugin-aria-a11y';" +
        "const ok = p && p.rules && p.rules['no-redundant-role'] && p.configs && p.configs.recommended;" +
        "if (!ok) { console.error('plugin loaded but missing rules/configs'); process.exit(3); }" +
        "console.log('IMPORT_OK ' + Object.keys(p.rules).length + ' rules');",
    ],
    dirA,
  );
  if (!importOut.includes('IMPORT_OK')) fail(`plugin import did not confirm: ${importOut}`);
  console.log(`  ✓ ${importOut.trim()} (resolved from the installed dist, not the workspace)`);

  // --- install plugin + cli, run the bin ----------------------------------
  console.log('• installing the CLI (with the plugin) into a clean dir and running the bin');
  const dirB = mkdtempSync(path.join(tmpdir(), 'aria-consumer-cli-'));
  cleanups.push(dirB);
  run('npm', ['init', '-y'], dirB);
  run('npm', ['install', '--no-audit', '--no-fund', pluginTgz, cliTgz], dirB);
  writeFileSync(
    path.join(dirB, 'Fixture.tsx'),
    'export const X = () => <button role="button">Save</button>;\n',
  );
  let binOut = '';
  let binExit = 0;
  try {
    binOut = run(path.join(dirB, 'node_modules/.bin/aria'), ['check', 'Fixture.tsx'], dirB);
  } catch (e) {
    binExit = e.status ?? 1;
    binOut = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  if (!binOut.includes('no-redundant-role')) {
    fail(`CLI bin did not report the expected finding.\nexit=${binExit}\noutput:\n${binOut}`);
  }
  if (binExit !== 1) fail(`CLI bin should exit 1 on a format-tier finding; got ${binExit}`);
  console.log('  ✓ aria check fired the plugin rules from the installed CLI (exit 1)');

  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
  console.log('\n✓ verify-pack: both packages install and run from real tarballs.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
