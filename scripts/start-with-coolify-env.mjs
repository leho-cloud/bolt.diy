/**
 * Pass Coolify's container runtime variables to the embedded Cloudflare Worker
 * used by Vite preview. Neither the values nor the generated file are logged.
 */
import { writeFileSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';

const keys = [
  'COOLIFY_API_URL',
  'COOLIFY_API_TOKEN',
  'COOLIFY_PROJECT_UUID',
  'COOLIFY_SERVER_UUID',
  'COOLIFY_PUBLISH_KEY',
  'COOLIFY_ENVIRONMENT_NAME',
  'COOLIFY_GITHUB_OWNER',
];

const lines = keys
  .filter((key) => process.env[key])
  .map((key) => `${key}=${JSON.stringify(process.env[key])}`);

if (lines.length) {
  writeFileSync('/app/.dev.vars', lines.join('\n') + '\n', { mode: 0o600 });
  chmodSync('/app/.dev.vars', 0o600);
  writeFileSync('/app/build/server/.dev.vars', lines.join('\n') + '\n', { mode: 0o600 });
}

const child = spawn('pnpm', ['run', 'dockerstart'], { stdio: 'inherit', env: process.env });
child.on('error', (error) => {
  console.error('Nem sikerült elindítani a Buildert:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
