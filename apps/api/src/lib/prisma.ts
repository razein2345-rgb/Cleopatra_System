import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

if (!env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Prisma queries will fail until configured.');
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL ?? '' });

export const prisma = new PrismaClient({ adapter });
