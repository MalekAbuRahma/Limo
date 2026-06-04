/**
 * Load DEPLOY_SSH_PASSWORD from deploy/.env.deploy (gitignored).
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const deployDir = dirname(fileURLToPath(import.meta.url));
const root = join(deployDir, '..');

config({ path: join(root, '.env') });
config({ path: join(root, '.env.local'), override: true });
const deployEnv = join(deployDir, '.env.deploy');
if (existsSync(deployEnv)) {
  config({ path: deployEnv, override: true });
}

export function requireDeployPassword() {
  if (!process.env.DEPLOY_SSH_PASSWORD?.trim()) {
    console.error(
      'Set DEPLOY_SSH_PASSWORD in the environment or in deploy/.env.deploy (see deploy/.env.deploy.example)'
    );
    process.exit(1);
  }
}
