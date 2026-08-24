import { describe, expect, it } from 'vitest';
import type { DocumentTemplate, Setting } from '@cleopatra/shared';
import { resolveDocumentSnapshot } from './documentSnapshot';
import { DEFAULT_TEMPLATE_CONFIG } from './templateConfigFields';

const baseSetting: Setting = {
  id: 'setting-1',
  zincPrice: 0,
  printRunPrice: 0,
  numberingRunPrice: 0,
  envelopeDesignPrice: 0,
  envelopePrintRunPrice: 0,
  envelopeZincPrice: 0,
  designPrice: 0,
  wasteSheetsDefault: 0,
  profitPercent: 0,
  vatRate: 14,
  notebookThreshold: 0,
  looseThreshold: 0,
  sellophanePricePerSheet: 0,
  logoUrl: 'https://example.com/logo.png',
  boardsBannerNoDesign: 0,
  boardsBannerWithDesign: 0,
  boardsVinylPrintCutNoSello: 0,
  boardsVinylPrintCutWithSello: 0,
  boardsVinylNormalNoSello: 0,
  boardsVinylNormalWithSello: 0,
  boardsFlex: 0,
  boardsSeasro: 0,
  boardsGapMM: 0,
  digitalPrintPricePerQuarter: 0,
  digitalSellophanePricePerQuarter: 0,
  digitalQuarterWidthCm: 50,
  digitalQuarterHeightCm: 35,
  businessNameAr: 'مطبعة كليوباترا',
  businessNameEn: 'Cleopatra Press',
  businessTagline: null,
  address: 'القاهرة',
  phone: '0100000000',
  email: 'info@example.com',
  website: 'https://example.com',
  taxNumber: '12345',
  commercialRegisterNumber: '67890',
  stampUrl: null,
  landlinePhone: null,
  facebookUrl: null,
  showStampOnInvoice: false,
  showQuotationDate: true,
  showQuotationSignatureArea: false,
  showQuotationDocumentNumber: false,
  showInvoiceAddress: false,
  showInvoicePhone: false,
  showInvoiceEmail: false,
  showInvoiceLandline: false,
  showInvoiceFacebook: false,
  autoCloseDayTime: null,
  deviceAccessMode: 'ALLOW_ALL_REGISTERED',
};

const baseTemplate: DocumentTemplate = {
  id: 'template-1',
  documentType: 'QUOTATION',
  name: 'القالب الافتراضي',
  config: { showLogo: true, showTaxNumber: true, footerText: 'شكراً لتعاملكم معنا' },
  isDefault: true,
  version: 1,
  previousVersionId: null,
  nextVersionExists: false,
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('resolveDocumentSnapshot', () => {
  it('falls back to defaults and nulls when setting/template/overrides are all absent', () => {
    const snapshot = resolveDocumentSnapshot(null, null, null);
    expect(snapshot.business.nameAr).toBeNull();
    expect(snapshot.templateName).toBeNull();
    expect(snapshot.config).toEqual(DEFAULT_TEMPLATE_CONFIG);
  });

  it('resolves business identity from Setting alone (no template selected)', () => {
    const snapshot = resolveDocumentSnapshot(baseSetting, null, null);
    expect(snapshot.business).toEqual({
      nameAr: 'مطبعة كليوباترا',
      nameEn: 'Cleopatra Press',
      tagline: null,
      address: 'القاهرة',
      phone: '0100000000',
      email: 'info@example.com',
      website: 'https://example.com',
      taxNumber: '12345',
      commercialRegisterNumber: '67890',
      logoUrl: 'https://example.com/logo.png',
      stampUrl: null,
      landlinePhone: null,
      facebookUrl: null,
    });
    expect(snapshot.templateName).toBeNull();
    // untouched keys fall through to the default config
    expect(snapshot.config).toEqual(DEFAULT_TEMPLATE_CONFIG);
  });

  it('layers template config on top of the defaults (Setting + template, no overrides)', () => {
    const snapshot = resolveDocumentSnapshot(baseSetting, baseTemplate, null);
    expect(snapshot.templateName).toBe('القالب الافتراضي');
    // template values win over defaults
    expect(snapshot.config.showTaxNumber).toBe(true);
    expect(snapshot.config.footerText).toBe('شكراً لتعاملكم معنا');
    // keys the template didn't touch still fall through from the default config
    expect(snapshot.config.showBusinessAddress).toBe(DEFAULT_TEMPLATE_CONFIG.showBusinessAddress);
    expect(snapshot.config.showSignatureArea).toBe(DEFAULT_TEMPLATE_CONFIG.showSignatureArea);
  });

  it('layers one-time overrides on top of the template — overrides win, untouched keys fall through', () => {
    const overrides = { showTaxNumber: false, headerNote: 'عرض خاص لهذا العميل' };
    const snapshot = resolveDocumentSnapshot(baseSetting, baseTemplate, overrides);
    // override wins over the template's own value
    expect(snapshot.config.showTaxNumber).toBe(false);
    expect(snapshot.config.headerNote).toBe('عرض خاص لهذا العميل');
    // a key the override didn't touch still falls through from the template
    expect(snapshot.config.footerText).toBe('شكراً لتعاملكم معنا');
    // a key neither the template nor the override touched still falls through from the default
    expect(snapshot.config.showSignatureArea).toBe(DEFAULT_TEMPLATE_CONFIG.showSignatureArea);
  });

  it('is pure — identical inputs always produce a deep-equal snapshot', () => {
    const a = resolveDocumentSnapshot(baseSetting, baseTemplate, { showLogo: false });
    const b = resolveDocumentSnapshot(baseSetting, baseTemplate, { showLogo: false });
    expect(a).toEqual(b);
  });

  it('suppresses the global English name for a non-default branch (owner: "مينفعش يظهر تحت كلمة للدعاية والإعلان كلمة Cleopatra")', () => {
    const printingHouse = resolveDocumentSnapshot(baseSetting, null, null, { name: 'برينتنج هاوس', isDefault: false });
    expect(printingHouse.business.nameAr).toBe('برينتنج هاوس');
    expect(printingHouse.business.nameEn).toBeNull();

    // the default branch keeps the global English name
    const cleopatra = resolveDocumentSnapshot(baseSetting, null, null, { name: 'كليوباترا', isDefault: true });
    expect(cleopatra.business.nameEn).toBe('Cleopatra Press');

    // no branch at all (e.g. a document type that doesn't carry branch identity) also keeps it
    const noBranch = resolveDocumentSnapshot(baseSetting, null, null);
    expect(noBranch.business.nameEn).toBe('Cleopatra Press');
  });
});
