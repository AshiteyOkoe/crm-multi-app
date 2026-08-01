// Boots a portable embedded PostgreSQL (no install/admin required), creates the
// database, runs Prisma migrations + seed, then stays alive to keep Postgres up.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execSync } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

const serverDir = path.join(import.meta.dirname, '..');
const DATA_DIR = path.join(serverDir, '.pgdata');
const PORT = 5433;
const USER = 'postgres';
const PASSWORD = 'postgres';
const DB_NAME = 'crm_app';

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

async function main() {
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log('[db] initialising embedded PostgreSQL cluster...');
    await pg.initialise();
  }

  if (await portOpen(PORT)) {
    console.log(`[db] port ${PORT} already listening — reusing existing postgres`);
  } else {
    try {
      await pg.start();
      console.log(`[db] embedded PostgreSQL listening on localhost:${PORT}`);
    } catch (err) {
      console.error(`[db] failed to start postgres (${err?.message ?? err})`);
      process.exit(1);
    }
  }

  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[db] database "${DB_NAME}" created`);
  } catch {
    console.log(`[db] database "${DB_NAME}" already exists`);
  }

  process.env.DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}?schema=public`;

  console.log('[db] applying Prisma schema...');
  execSync('npx prisma db push --skip-generate', { cwd: serverDir, stdio: 'inherit', env: process.env });

  console.log('[db] seeding demo data...');
  execSync('npx prisma db seed', { cwd: serverDir, stdio: 'inherit', env: process.env });

  console.log('DB_READY');
  setInterval(() => {}, 1 << 30); // keep the orphaned postgres alive
}

main().catch((err) => {
  console.error('[db] failed to start:', err);
  process.exit(1);
});
