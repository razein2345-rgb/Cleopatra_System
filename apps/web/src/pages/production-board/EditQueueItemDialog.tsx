import { useEffect, useState } from 'react';
import type { BusinessPartner, User, WorkflowPriority, WorkflowQueueItem } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/cleopatra';
import { PRIORITY_OPTIONS } from './productionBoardLabels';

/**
 * Queue metadata editing (priority/due date/assignee/waiting reason, plus
 * External Supplier fields when the stage is EXTERNAL) — calls the same
 * `PUT .../current-stage` FEATURE-004 M1 already built and secured. Never
 * touches `status` or advances the workflow (that's `advance`, a separate
 * action), so it never writes a `WorkflowEvent`.
 */
export function EditQueueItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: WorkflowQueueItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employees, setEmployees] = useState<User[]>([]);
  const [suppliers, setSuppliers] = useState<BusinessPartner[]>([]);
  const [priority, setPriority] = useState<WorkflowPriority>(item.priority);
  const [dueDate, setDueDate] = useState(item.dueDate ? item.dueDate.slice(0, 10) : '');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(item.assignedEmployeeId ?? '');
  const [waitingReason, setWaitingReason] = useState(item.waitingReason ?? '');
  const [blockingReason, setBlockingReason] = useState(item.blockingReason ?? '');
  const [assignedSupplierId, setAssignedSupplierId] = useState(item.assignedSupplierId ?? '');
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    item.expectedReturnDate ? item.expectedReturnDate.slice(0, 10) : '',
  );
  const [externalCost, setExternalCost] = useState(item.externalCost ?? 0);
  const [supplierStatus, setSupplierStatus] = useState(item.supplierStatus ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiGet<User[]>('/api/users').then(setEmployees).catch(() => undefined);
    if (item.stageType === 'EXTERNAL') {
      apiGet<BusinessPartner[]>('/api/partners')
        .then((partners) => setSuppliers(partners.filter((p) => p.roles.includes('SUPPLIER'))))
        .catch(() => undefined);
    }
  }, [item.stageType]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPut(`/api/workflow-instances/${item.workflowInstanceId}/current-stage`, {
        priority,
        dueDate: dueDate || null,
        assignedEmployeeId: assignedEmployeeId || null,
        waitingReason: waitingReason || null,
        blockingReason: blockingReason || null,
        ...(item.stageType === 'EXTERNAL'
          ? {
              assignedSupplierId: assignedSupplierId || null,
              expectedReturnDate: expectedReturnDate || null,
              externalCost,
              supplierStatus: supplierStatus || null,
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديلات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات المهمة — {item.stageName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-destructive text-sm">{error}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">الأولوية</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as WorkflowPriority)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">تاريخ الاستحقاق</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">الموظف المسؤول</span>
              <Combobox
                items={[{ id: '', name: '— بدون —' }, ...employees]}
                value={assignedEmployeeId}
                getKey={(emp) => emp.id}
                getLabel={(emp) => emp.name}
                onChange={(emp) => setAssignedEmployeeId(emp.id)}
                placeholder="— بدون —"
                searchPlaceholder="اكتب اسم الموظف…"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">سبب الانتظار (اختياري)</span>
              <input
                value={waitingReason}
                onChange={(e) => setWaitingReason(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">سبب التعطل (اختياري)</span>
              <input
                value={blockingReason}
                onChange={(e) => setBlockingReason(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>

            {item.stageType === 'EXTERNAL' && (
              <>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">المورّد الخارجي</span>
                  <Combobox
                    items={[{ id: '', nameAr: '— بدون —' }, ...suppliers]}
                    value={assignedSupplierId}
                    getKey={(s) => s.id}
                    getLabel={(s) => s.nameAr}
                    onChange={(s) => setAssignedSupplierId(s.id)}
                    placeholder="— بدون —"
                    searchPlaceholder="اكتب اسم المورّد…"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">تاريخ الاستلام المتوقع</span>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">تكلفة المورّد</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={externalCost}
                    onChange={(e) => setExternalCost(Number(e.target.value))}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">حالة المورّد (اختياري)</span>
                  <input
                    value={supplierStatus}
                    onChange={(e) => setSupplierStatus(e.target.value)}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
