import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations run against Supabase's direct (non-pooled) connection.
// The app's runtime PrismaClient uses DATABASE_URL (pooled) via the pg adapter, see src/lib/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
