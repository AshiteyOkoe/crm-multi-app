import app from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

async function start() {
  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (err) {
    console.error('Database connection failed. Check your DATABASE_URL and that PostgreSQL is running.');
    console.error(err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`CRM API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start();
