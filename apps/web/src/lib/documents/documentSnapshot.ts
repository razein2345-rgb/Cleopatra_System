import type { BusinessIdentity, DocumentTemplate, DocumentTemplateConfig } from '@cleopatra/shared';
import { DEFAULT_TEMPLATE_CONFIG } from './templateConfigFields';

/**
 * FEATURE-006 M7 — the literal implementation of the merge hierarchy from
 * `00_REQUIREMENTS.md`'s "Document-Level One-Time Overrides" section:
 * Global Settings → Template Configuration → One-Time Document Overrides.
 * The result is what gets persisted, once, into a document's
 * `documentSnapshot` column at first print (wired per document type in
 * M8/M9/M10) — never recomputed from live `Setting`/template data again.
 */
export interface DocumentSnapshotBusiness {
  nameAr: string | null;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  commercialRegisterNumber: string | null;
  logoUrl: string | null;
}

export interface DocumentSnapshot {
  business: DocumentSnapshotBusiness;
  templateName: string | null;
  config: DocumentTemplateConfig;
}

/**
 * Pure — no I/O, no Date.now(), no randomness — so the same three inputs
 * always resolve to the same snapshot. `setting`/`template` may be null
 * (no business identity saved yet / no template selected yet); `overrides`
 * may be null (no one-time customization made for this document).
 */
export function resolveDocumentSnapshot(
  setting: BusinessIdentity | null,
  template: DocumentTemplate | null,
  overrides: DocumentTemplateConfig | null,
  /** FEATURE-007 (2026-08-12, owner: "لما اختار فرع بيت الطباعة يطلعلي فاتورة فيها لوجو بيت الطباعة") — the issuing Branch's own logo, when it has one, wins over the global business logo. */
  branchLogoUrl?: string | null,
): DocumentSnapshot {
  return {
    business: {
      nameAr: setting?.businessNameAr ?? null,
      nameEn: setting?.businessNameEn ?? null,
      address: setting?.address ?? null,
      phone: setting?.phone ?? null,
      email: setting?.email ?? null,
      website: setting?.website ?? null,
      taxNumber: setting?.taxNumber ?? null,
      commercialRegisterNumber: setting?.commercialRegisterNumber ?? null,
      logoUrl: branchLogoUrl ?? setting?.logoUrl ?? null,
    },
    templateName: template?.name ?? null,
    config: {
      ...DEFAULT_TEMPLATE_CONFIG,
      ...(template?.config ?? {}),
      ...(overrides ?? {}),
    },
  };
}
