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
  /** FEATURE-007 (2026-08-12) — short tagline under the business name (e.g. "للدعاية والإعلان"), rendered in a distinct, lighter style than the name itself. */
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  commercialRegisterNumber: string | null;
  logoUrl: string | null;
  /** FEATURE-007 (2026-08-12) — company stamp/seal image, printed above the closing line. */
  stampUrl: string | null;
  /** FEATURE-007 (2026-08-12) — landline (separate from `phone`) and Facebook page link, shown in the document footer. */
  landlinePhone: string | null;
  facebookUrl: string | null;
}

export interface DocumentSnapshot {
  business: DocumentSnapshotBusiness;
  templateName: string | null;
  config: DocumentTemplateConfig;
}

/** FEATURE-007 (2026-08-12, owner: "يظهرلي بيانات بيت الطباعة أو بيانات كليوباترا لما اختار [الفرع]") — the issuing Branch's own letterhead fields; each one that's set wins over the matching global business-identity field. `name` maps to the document's `nameAr` (a branch is one printed name, not separate ar/en variants). */
export interface DocumentBranchIdentity {
  name?: string | null;
  /** Whether this is the main/default branch (كليوباترا) — used only to decide whether the global English name still applies (see `nameEn` below); every other field above overrides the global identity unconditionally regardless of this flag. */
  isDefault?: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  landlinePhone?: string | null;
  facebookUrl?: string | null;
  stampUrl?: string | null;
  tagline?: string | null;
}

/**
 * Pure — no I/O, no Date.now(), no randomness — so the same inputs always
 * resolve to the same snapshot. `setting`/`template` may be null (no
 * business identity saved yet / no template selected yet); `overrides`
 * may be null (no one-time customization made for this document);
 * `branch` may be omitted/null (no per-branch identity to apply, or the
 * document type doesn't carry branding at all — e.g. Invoice).
 */
export function resolveDocumentSnapshot(
  setting: BusinessIdentity | null,
  template: DocumentTemplate | null,
  overrides: DocumentTemplateConfig | null,
  branch?: DocumentBranchIdentity | null,
): DocumentSnapshot {
  return {
    business: {
      nameAr: branch?.name ?? setting?.businessNameAr ?? null,
      // Owner (2026-08-13): "العرض بتاع برينتينج مينفعش يظهر تحت كلمة
      // للدعاية والإعلان كلمة Cleopatra" — `businessNameEn` is a single
      // global field (no per-branch English name exists), so it only
      // belongs on the default branch's own documents; a non-default
      // branch (e.g. بيت الطباعة) must not inherit كليوباترا's English name.
      nameEn: branch?.isDefault === false ? null : (setting?.businessNameEn ?? null),
      tagline: branch?.tagline ?? setting?.businessTagline ?? null,
      address: branch?.address ?? setting?.address ?? null,
      phone: branch?.phone ?? setting?.phone ?? null,
      email: branch?.email ?? setting?.email ?? null,
      website: setting?.website ?? null,
      taxNumber: setting?.taxNumber ?? null,
      commercialRegisterNumber: setting?.commercialRegisterNumber ?? null,
      logoUrl: branch?.logoUrl ?? setting?.logoUrl ?? null,
      stampUrl: branch?.stampUrl ?? setting?.stampUrl ?? null,
      landlinePhone: branch?.landlinePhone ?? setting?.landlinePhone ?? null,
      facebookUrl: branch?.facebookUrl ?? setting?.facebookUrl ?? null,
    },
    templateName: template?.name ?? null,
    config: {
      ...DEFAULT_TEMPLATE_CONFIG,
      ...(template?.config ?? {}),
      ...(overrides ?? {}),
    },
  };
}
