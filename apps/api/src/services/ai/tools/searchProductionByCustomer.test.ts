import { describe, expect, it, vi, beforeEach } from 'vitest';
import { accessibleDepartmentScope } from '../../authContext.js';

/**
 * Phase 2 Task 3 — `search_production_by_customer` wraps
 * `workflowInstanceService.ts::getAllQueue()` unmodified. These tests lock
 * in the one property the owner's approval called out explicitly:
 * `accessibleDepartmentScope(auth)` is applied at the `getAllQueue()` call
 * itself — before any customer/stage filtering — so no value an LLM
 * passes in `customerName`/`stageName` can ever widen which departments'
 * jobs are visible; the input schema doesn't even have a department/branch
 * field for a model to try that with.
 */
const getAllQueue = vi.fn();

vi.mock('../../workflowInstanceService.js', () => ({
  getAllQueue: (...args: unknown[]) => getAllQueue(...args),
}));

const { searchProductionByCustomerTool } = await import('./searchProductionByCustomer.js');

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stage-1',
    workflowInstanceId: 'wf-1',
    stageId: 'stage-def-1',
    stageName: 'التصميم',
    stageType: 'INTERNAL',
    departmentId: 'dept-1',
    departmentName: 'التصميم',
    status: 'IN_PROGRESS',
    assignedEmployeeId: null,
    startedAt: null,
    finishedAt: null,
    estimatedDurationMinutes: null,
    actualDurationMinutes: null,
    waitingReason: null,
    blockingReason: null,
    notes: null,
    priority: 'NORMAL',
    dueDate: null,
    isDelayed: false,
    variableValues: null,
    assignedSupplierId: null,
    sentDate: null,
    expectedReturnDate: null,
    actualReturnDate: null,
    workOrderId: 'wo-1',
    workOrderNumber: 'CLP-WO-2026-000027',
    customerName: 'شركة كاليكس للتجارة',
    itemNames: ['إنهاء خطاب'],
    productionTrack: null,
    ...overrides,
  };
}

beforeEach(() => {
  getAllQueue.mockReset();
});

describe('search_production_by_customer tool — schema', () => {
  it('accepts no filters, customerName only, stageName only, or both', () => {
    expect(() => searchProductionByCustomerTool.inputSchema.parse({})).not.toThrow();
    expect(() => searchProductionByCustomerTool.inputSchema.parse({ customerName: 'كاليكس' })).not.toThrow();
    expect(() => searchProductionByCustomerTool.inputSchema.parse({ stageName: 'التصميم' })).not.toThrow();
    expect(() =>
      searchProductionByCustomerTool.inputSchema.parse({ customerName: 'كاليكس', stageName: 'التصميم' }),
    ).not.toThrow();
  });

  it('rejects a non-string customerName/stageName', () => {
    expect(searchProductionByCustomerTool.inputSchema.safeParse({ customerName: 5 }).success).toBe(false);
  });
});

describe('search_production_by_customer tool — authorization declaration', () => {
  it('requires work-orders.view, the same permission get_production_status/get_work_order already use', () => {
    expect(searchProductionByCustomerTool.requiredPermission).toBe('work-orders.view');
    expect(searchProductionByCustomerTool.requiresSuperAdmin).toBeUndefined();
  });
});

describe('search_production_by_customer tool — filtering behavior', () => {
  it('filters by customerName (case-insensitive substring)', async () => {
    getAllQueue.mockResolvedValueOnce([
      queueItem({ customerName: 'شركة كاليكس للتجارة' }),
      queueItem({ customerName: 'شركة MTSC', workOrderNumber: 'CLP-WO-2026-000045' }),
    ]);
    const result = (await searchProductionByCustomerTool.execute(
      { customerName: 'كاليكس' },
      { auth: { roleNames: ['SALES'], accessibleDepartmentIds: [], permissions: [] } as never },
    )) as { workOrderNumber: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]!.workOrderNumber).toBe('CLP-WO-2026-000027');
  });

  it('filters by stageName against both stageName and departmentName', async () => {
    getAllQueue.mockResolvedValueOnce([
      queueItem({ stageName: 'التصميم', departmentName: 'التصميم' }),
      queueItem({ stageName: 'الطباعة', departmentName: 'الطباعة', workOrderNumber: 'CLP-WO-2026-000099' }),
    ]);
    const result = (await searchProductionByCustomerTool.execute(
      { stageName: 'التصميم' },
      { auth: { roleNames: ['SALES'], accessibleDepartmentIds: [], permissions: [] } as never },
    )) as { workOrderNumber: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]!.workOrderNumber).toBe('CLP-WO-2026-000027');
  });

  it('combines customerName AND stageName filters', async () => {
    getAllQueue.mockResolvedValueOnce([
      queueItem({ customerName: 'شركة كاليكس للتجارة', stageName: 'التصميم', departmentName: 'التصميم' }),
      queueItem({
        customerName: 'شركة كاليكس للتجارة',
        stageName: 'الطباعة',
        departmentName: 'الطباعة',
        workOrderNumber: 'CLP-WO-2026-000043',
      }),
    ]);
    const result = (await searchProductionByCustomerTool.execute(
      { customerName: 'كاليكس', stageName: 'التصميم' },
      { auth: { roleNames: ['SALES'], accessibleDepartmentIds: [], permissions: [] } as never },
    )) as { workOrderNumber: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]!.workOrderNumber).toBe('CLP-WO-2026-000027');
  });

  it('returns an empty list, never an invented row, when nothing matches', async () => {
    getAllQueue.mockResolvedValueOnce([queueItem()]);
    const result = await searchProductionByCustomerTool.execute(
      { customerName: 'عميل غير موجود' },
      { auth: { roleNames: ['SALES'], accessibleDepartmentIds: [], permissions: [] } as never },
    );
    expect(result).toEqual([]);
  });
});

describe('search_production_by_customer tool — department scope cannot be bypassed', () => {
  it('always calls getAllQueue with accessibleDepartmentScope(auth) — never influenced by input filters', async () => {
    getAllQueue.mockResolvedValue([]);
    const limitedAuth = { roleNames: ['SALES'], accessibleDepartmentIds: ['dept-a'], permissions: [] } as never;

    await searchProductionByCustomerTool.execute({ customerName: 'أي حاجة' }, { auth: limitedAuth });
    await searchProductionByCustomerTool.execute({ stageName: 'أي حاجة' }, { auth: limitedAuth });
    await searchProductionByCustomerTool.execute({}, { auth: limitedAuth });

    const expectedScope = accessibleDepartmentScope(limitedAuth);
    for (const call of getAllQueue.mock.calls) {
      expect(call).toEqual([expectedScope]);
    }
  });

  it('resolves to "all" for a SUPER_ADMIN caller and to their own department list otherwise — identical to get_production_status', async () => {
    getAllQueue.mockResolvedValue([]);

    const superAdminAuth = { roleNames: ['SUPER_ADMIN'], accessibleDepartmentIds: ['dept-a'], permissions: [] } as never;
    await searchProductionByCustomerTool.execute({}, { auth: superAdminAuth });
    expect(getAllQueue).toHaveBeenLastCalledWith('all');

    const regularAuth = { roleNames: ['SALES'], accessibleDepartmentIds: ['dept-a', 'dept-b'], permissions: [] } as never;
    await searchProductionByCustomerTool.execute({}, { auth: regularAuth });
    expect(getAllQueue).toHaveBeenLastCalledWith(['dept-a', 'dept-b']);
  });
});
