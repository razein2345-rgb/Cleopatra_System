import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

if (!env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Prisma queries will fail until configured.');
}

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL ?? '',
  // Accounting audit fix — Supabase's transaction-mode PgBouncer (port
  // 6543, see DATABASE_URL) silently closes idle client connections from
  // its own side; `pg` doesn't find out until it tries to reuse one,
  // which surfaces as "Connection terminated unexpectedly" (a node-postgres
  // error, not a Prisma engine code — confirmed via the earlier
  // investigation that this app runs through @prisma/adapter-pg, not the
  // raw Prisma query engine). keepAlive sends periodic TCP probes so
  // intermediate NATs/load balancers don't drop the socket silently.
  // idleTimeoutMillis retires an idle client from our own side before the
  // pooler does it to us first.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({ adapter });
