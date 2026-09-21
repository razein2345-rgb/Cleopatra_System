import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structural, DB-independent enforcement of the mandatory RLS rule
 * (VISION.md's Database Security section, MASTER_PROMPT.md's Database
 * Checklist, ADR 0030): every application table must at some point in
 * migration history receive `ENABLE ROW LEVEL SECURITY` +
 * `backend_only_deny_direct_access`. A live audit (2026-09-21) found 27
 * tables added after the original migration
 * (20260805135821_security_foundation_rls_deny_policies, ADR 0029) that
 * never got this treatment -- a six-week, manual-process gap this test
 * exists to make impossible to repeat silently. Reads schema.prisma and
 * every migration.sql file directly off disk; zero database connection,
 * so it runs as a normal part of `npm test` in any environment, CI
 * included.
 */

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(apiRoot, 'prisma/schema.prisma');
const migrationsDir = join(apiRoot, 'prisma/migrations');

/**
 * Explicit, documented exception -- not implicit. `_prisma_migrations` is
 * Prisma's own internal bookkeeping table (never declared as a `model` in
 * schema.prisma, so the scan below would never even consider it), and it
 * has its own dedicated, reasoned exemption migration
 * (20260805142832_prisma_migrations_rls_exempt: only the `postgres` role
 * ever touches it, and that role bypasses RLS regardless; the residual
 * anon-readable migration filenames/timestamps carry no business data).
 * Listed here by name so a future reader never has to wonder why it's
 * missing from the check -- the answer is spelled out, not assumed.
 */
const EXPLICITLY_EXEMPT_TABLES = ['_prisma_migrations'];

function getModelNames(): string[] {
  const schema = readFileSync(schemaPath, 'utf8');
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

function getAllMigrationSql(): string {
  const folders = readdirSync(migrationsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  return folders
    .map((f) => {
      try {
        return readFileSync(join(migrationsDir, f.name, 'migration.sql'), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/**
 * A model only needs RLS coverage once it has actually been given a real
 * migration -- a model that exists in schema.prisma but has never been
 * through `CREATE TABLE` in any migration file isn't live yet at all, and
 * whether it eventually gets RLS is inseparable from whether it gets
 * created in the first place (a separate, already-tracked concern, not
 * this test's job). This is precisely how the 2026-09-21 audit's own
 * still-pending Cutover/Opening-State models (CutoverRecord,
 * TreasuryOpening, CustomerOpening, SupplierOpening, InventoryOpening --
 * committed to schema.prisma, deliberately not yet migrated) behave: they
 * are correctly skipped here, not silently exempted -- the moment any one
 * of them gets a real `CREATE TABLE`, this test starts requiring RLS for
 * it too, with no code change needed.
 */
function hasRealMigration(model: string, allSql: string): boolean {
  return new RegExp(`CREATE TABLE\\s+"${model}"\\s*\\(`, 'i').test(allSql);
}

describe('RLS migration coverage (structural, no DB connection)', () => {
  it('every migrated model has ENABLE ROW LEVEL SECURITY somewhere in migration history', () => {
    const models = getModelNames();
    const allSql = getAllMigrationSql();

    const missing = models.filter((model) => {
      if (EXPLICITLY_EXEMPT_TABLES.includes(model)) return false;
      if (!hasRealMigration(model, allSql)) return false;
      const pattern = new RegExp(`ALTER TABLE\\s+"${model}"\\s+ENABLE ROW LEVEL SECURITY`, 'i');
      return !pattern.test(allSql);
    });

    expect(missing, `Tables missing RLS -- add ENABLE ROW LEVEL SECURITY + the deny policy in a new migration: ${missing.join(', ')}`).toEqual([]);
  });

  it('every migrated model with RLS also has the standard backend_only_deny_direct_access policy', () => {
    const models = getModelNames();
    const allSql = getAllMigrationSql();

    const missingPolicy = models.filter((model) => {
      if (EXPLICITLY_EXEMPT_TABLES.includes(model)) return false;
      if (!hasRealMigration(model, allSql)) return false;
      const pattern = new RegExp(`CREATE POLICY "backend_only_deny_direct_access" ON "${model}"`, 'i');
      return !pattern.test(allSql);
    });

    expect(missingPolicy, `Tables missing the deny policy: ${missingPolicy.join(', ')}`).toEqual([]);
  });

  it('EXPLICITLY_EXEMPT_TABLES stays the real, minimal, documented allowlist -- not a place to quietly add more exceptions', () => {
    expect(EXPLICITLY_EXEMPT_TABLES).toEqual(['_prisma_migrations']);
  });
});
