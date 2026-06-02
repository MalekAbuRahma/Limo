/**
 * Run full test suite + production build
 * Run: npm run test:all
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const steps = [
  ['Calculations', ['npx', 'tsx', 'scripts/test-calculations.mjs']],
  ['Sample data', ['npx', 'tsx', 'scripts/test-sample-data.mjs']],
  ['Filters / pagination', ['npx', 'tsx', 'scripts/test-entry-filters.mjs']],
  ['Integration', ['npx', 'tsx', 'scripts/test-integration.mjs']],
  ['Fleet / multi-car', ['npx', 'tsx', 'scripts/test-fleet.mjs']],
  ['Oil change tracking', ['npx', 'tsx', 'scripts/test-oil-change.mjs']],
  ['Production build', ['node', 'node_modules/vite/bin/vite.js', 'build']],
];

let failed = 0;

for (const [name, cmd] of steps) {
  console.log(`\n========== ${name} ==========\n`);
  let result = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit', shell: true });
  const flakyCrash = result.status == null || result.status === 3221226505;
  if (flakyCrash) {
    console.warn(`\n⚠ ${name} returned unstable exit (${result.status}); retrying once...`);
    result = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit', shell: true });
  }
  if (result.status !== 0) {
    console.error(`\n✗ ${name} FAILED (exit ${result.status})`);
    failed++;
    break;
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log('\n========================================');
console.log('  All tests passed + build OK');
console.log('========================================\n');
