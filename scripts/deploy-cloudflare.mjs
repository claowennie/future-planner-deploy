import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length) {
  console.error(`Missing Cloudflare Build Secrets: ${missing.join(', ')}`);
  process.exit(1);
}

const secrets = Object.fromEntries(
  required.map((name) => [name, String(process.env[name]).trim()]),
);
const secretsFile = join(tmpdir(), `future-planner-secrets-${process.pid}.json`);

await writeFile(secretsFile, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 });

try {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(command, ['wrangler', 'deploy', '--secrets-file', secretsFile], {
    stdio: 'inherit',
    shell: false,
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await unlink(secretsFile).catch(() => {});
}
