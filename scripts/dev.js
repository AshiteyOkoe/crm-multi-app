// Orchestrator: starts embedded Postgres (migrate + seed), then the Express API
// and the Next.js client, streaming all logs to this terminal.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const clientDir = path.join(root, 'client');

const children = new Set();

function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: opts.cwd || root, shell: opts.shell ?? true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });
  children.add(child);
  const prefix = `[${name}]`;
  child.stdout.on('data', (d) => process.stdout.write(`${prefix} ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`${prefix} ${d}`));
  child.on('error', (e) => process.stderr.write(`${prefix} ERROR ${e.message}\n`));
  child.on('exit', (code) => {
    children.delete(child);
    if (opts.critical) {
      console.error(`[dev] ${name} exited (code ${code}) — stopping everything`);
      for (const c of children) c.kill();
      process.exit(code ?? 1);
    }
  });
  return child;
}

function shutdown() {
  for (const c of children) c.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[dev] Starting embedded database...');
const db = run('db', 'node', [path.join(serverDir, 'scripts', 'db.mjs')], { cwd: serverDir, shell: false });

let started = false;
db.stdout.on('data', (chunk) => {
  if (!started && chunk.toString().includes('DB_READY')) {
    started = true;
    console.log('[dev] Database ready — launching API + client');
    run('server', 'npm run dev', [], { cwd: serverDir, critical: true });
    run('client', 'npm run dev', [], { cwd: clientDir, critical: true });
  }
});
