/**
 * Stop dev server on ports 3000-3004 (Windows)
 * Usage: npm run stop
 */
import { execSync } from 'node:child_process';

const ports = [3000, 3001, 3002, 3003, 3004, 3005];
let killed = 0;

for (const port of ports) {
  try {
    const out = execSync(`netstat -aon | findstr ":${port} " | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const pids = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid))
    );
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Stopped process ${pid} (port ${port})`);
        killed++;
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* no listener on port */
  }
}

if (killed === 0) {
  console.log('No server found on ports 3000-3004.');
} else {
  console.log('App stopped.');
}
