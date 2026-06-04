/**
 * Create a Linux-friendly deploy tarball (avoids Windows SCHILY.fflags headers).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDES = [
  'node_modules',
  'dist',
  '.git',
  'data',
  '.env',
  '.env.local',
  '.env.deploy',
  'deploy/node_modules',
  '.cursor',
  'agent-transcripts',
  'terminals',
];

export function createDeployArchive(projectRoot, archivePath) {
  const isWin = process.platform === 'win32';
  /** Prefer GNU/ustar on Windows to avoid SCHILY.fflags; fall back if tar lacks --format. */
  const formatAttempts = isWin
    ? [['--format', 'gnu'], ['--format', 'ustar'], []]
    : [[]];

  const excludeArgs = [
    ...EXCLUDES.flatMap((e) => ['--exclude', e]),
    '--exclude=*.bat',
  ];

  let lastStatus = 1;
  let lastError = null;

  for (const formatFlag of formatAttempts) {
    const args = ['-czf', archivePath, ...formatFlag, ...excludeArgs, '.'];
    const tar = spawnSync('tar', args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
    });
    lastStatus = tar.status ?? 1;
    lastError = tar.error;
    if (lastStatus === 0 && existsSync(archivePath)) {
      return;
    }
    if (existsSync(archivePath)) {
      try {
        unlinkSync(archivePath);
      } catch {
        /* ignore */
      }
    }
  }

  throw new Error(
    lastError?.message ||
      `tar failed (exit ${lastStatus}). Install tar (Windows 10+) or run from Git Bash.`
  );
}
