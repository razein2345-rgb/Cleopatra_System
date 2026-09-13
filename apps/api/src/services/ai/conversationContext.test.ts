import { describe, expect, it } from 'vitest';
import { extractConversationContext } from './conversationContext.js';

const ID_1 = '11111111-1111-1111-1111-111111111111';
const ID_2 = '22222222-2222-2222-2222-222222222222';

describe('extractConversationContext — unknown/malformed input', () => {
  it('returns null for a tool with no registered extractor', () => {
    expect(extractConversationContext('calculate_price', '{}')).toBeNull();
  });

  it('returns null for unparseable JSON content', () => {
    expect(extractConversationContext('get_work_order', 'not valid json{')).toBeNull();
  });
});

describe('extractConversationContext — get_work_order', () => {
  it('extracts a WORK_ORDER context when found', () => {
    const content = JSON.stringify({ found: true, workOrder: { id: ID_1, workOrderNumber: 'WO-2026-000123' } });
    expect(extractConversationContext('get_work_order', content)).toEqual({
      entityType: 'WORK_ORDER',
      entityId: ID_1,
      label: 'WO-2026-000123',
    });
  });

  it('returns null when not found', () => {
    expect(extractConversationContext('get_work_order', JSON.stringify({ found: false }))).toBeNull();
  });
});

describe('extractConversationContext — get_quotation', () => {
  it('extracts a QUOTATION context when found', () => {
    const content = JSON.stringify({ found: true, quotation: { id: ID_1, quotationNumber: 'Q-2026-000045' } });
    expect(extractConversationContext('get_quotation', content)).toEqual({
      entityType: 'QUOTATION',
      entityId: ID_1,
      label: 'Q-2026-000045',
    });
  });

  it('returns null when not found', () => {
    expect(extractConversationContext('get_quotation', JSON.stringify({ found: false }))).toBeNull();
  });
});

describe('extractConversationContext — get_customer', () => {
  it('extracts a CUSTOMER context when found', () => {
    const content = JSON.stringify({ found: true, partner: { id: ID_1, nameAr: 'شركة كاليكس للتجارة' } });
    expect(extractConversationContext('get_customer', content)).toEqual({
      entityType: 'CUSTOMER',
      entityId: ID_1,
      label: 'شركة كاليكس للتجارة',
    });
  });

  it('returns null when not found', () => {
    expect(extractConversationContext('get_customer', JSON.stringify({ found: false }))).toBeNull();
  });
});

describe('extractConversationContext — get_supplier_statement', () => {
  it('extracts a SUPPLIER context from the real flat statement shape (statement.partnerId/nameAr, not statement.partner.id)', () => {
    const content = JSON.stringify({
      found: true,
      statement: { partnerId: ID_1, nameAr: 'كمال سعد للتوريدات', openingBalance: 0, entries: [], closingBalance: 500 },
    });
    expect(extractConversationContext('get_supplier_statement', content)).toEqual({
      entityType: 'SUPPLIER',
      entityId: ID_1,
      label: 'كمال سعد للتوريدات',
    });
  });

  it('returns null when not found', () => {
    expect(extractConversationContext('get_supplier_statement', JSON.stringify({ found: false }))).toBeNull();
  });
});

describe('extractConversationContext — search_production_by_customer', () => {
  it('extracts a WORK_ORDER context when exactly one match', () => {
    const content = JSON.stringify([
      { workOrderId: ID_1, workOrderNumber: 'WO-2026-000123', customerName: 'شركة كاليكس للتجارة' },
    ]);
    expect(extractConversationContext('search_production_by_customer', content)).toEqual({
      entityType: 'WORK_ORDER',
      entityId: ID_1,
      label: 'شركة كاليكس للتجارة — WO-2026-000123',
    });
  });

  it('falls back to the work order number alone when customerName is null', () => {
    const content = JSON.stringify([{ workOrderId: ID_1, workOrderNumber: 'WO-2026-000123', customerName: null }]);
    expect(extractConversationContext('search_production_by_customer', content)).toEqual({
      entityType: 'WORK_ORDER',
      entityId: ID_1,
      label: 'WO-2026-000123',
    });
  });

  it('returns null for zero matches', () => {
    expect(extractConversationContext('search_production_by_customer', JSON.stringify([]))).toBeNull();
  });

  it('returns null for two or more matches (ambiguous)', () => {
    const content = JSON.stringify([
      { workOrderId: ID_1, workOrderNumber: 'WO-1', customerName: 'A' },
      { workOrderId: ID_2, workOrderNumber: 'WO-2', customerName: 'B' },
    ]);
    expect(extractConversationContext('search_production_by_customer', content)).toBeNull();
  });
});

describe('extractConversationContext — search_quotations', () => {
  it('extracts a QUOTATION context when exactly one match', () => {
    const content = JSON.stringify([{ id: ID_1, quotationNumber: 'Q-2026-000045' }]);
    expect(extractConversationContext('search_quotations', content)).toEqual({
      entityType: 'QUOTATION',
      entityId: ID_1,
      label: 'Q-2026-000045',
    });
  });

  it('returns null for zero matches', () => {
    expect(extractConversationContext('search_quotations', JSON.stringify([]))).toBeNull();
  });

  it('returns null for two or more matches', () => {
    const content = JSON.stringify([
      { id: ID_1, quotationNumber: 'Q-1' },
      { id: ID_2, quotationNumber: 'Q-2' },
    ]);
    expect(extractConversationContext('search_quotations', content)).toBeNull();
  });
});

describe('extractConversationContext — search_customers', () => {
  it('extracts a CUSTOMER context when exactly one match', () => {
    const content = JSON.stringify([{ id: ID_1, nameAr: 'شركة كاليكس للتجارة' }]);
    expect(extractConversationContext('search_customers', content)).toEqual({
      entityType: 'CUSTOMER',
      entityId: ID_1,
      label: 'شركة كاليكس للتجارة',
    });
  });

  it('returns null for zero matches', () => {
    expect(extractConversationContext('search_customers', JSON.stringify([]))).toBeNull();
  });

  it('returns null for two or more matches', () => {
    const content = JSON.stringify([
      { id: ID_1, nameAr: 'A' },
      { id: ID_2, nameAr: 'B' },
    ]);
    expect(extractConversationContext('search_customers', content)).toBeNull();
  });
});

describe('extractConversationContext — search_suppliers', () => {
  it('extracts a SUPPLIER context from the real SupplierSummary shape (partnerId, not id) when exactly one match', () => {
    const content = JSON.stringify([{ partnerId: ID_1, nameAr: 'كمال سعد للتوريدات', balance: 500 }]);
    expect(extractConversationContext('search_suppliers', content)).toEqual({
      entityType: 'SUPPLIER',
      entityId: ID_1,
      label: 'كمال سعد للتوريدات',
    });
  });

  it('returns null for zero matches', () => {
    expect(extractConversationContext('search_suppliers', JSON.stringify([]))).toBeNull();
  });

  it('returns null for two or more matches (the disambiguation case a breadcrumb cannot resolve on its own)', () => {
    const content = JSON.stringify([
      { partnerId: ID_1, nameAr: 'كمال سعد للتوريدات' },
      { partnerId: ID_2, nameAr: 'كمال سعد الحديثة' },
    ]);
    expect(extractConversationContext('search_suppliers', content)).toBeNull();
  });
});

describe('extractConversationContext — get_machine_status is intentionally not covered', () => {
  it('returns null (no extractor registered) even for a well-formed machine list', () => {
    const content = JSON.stringify([{ id: ID_1, name: 'ماكينة الطباعة الرقمية 2', status: 'RUNNING' }]);
    expect(extractConversationContext('get_machine_status', content)).toBeNull();
  });
});
