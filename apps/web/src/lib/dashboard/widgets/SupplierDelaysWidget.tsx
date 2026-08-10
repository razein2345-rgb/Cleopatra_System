import { Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function SupplierDelaysWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">تأخيرات الموردين</span>
      </div>
      {summary === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : summary.supplierDelays.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد تأخيرات من الموردين حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {summary.supplierDelays.map((s) => (
            <li key={s.supplierId} className="flex items-center justify-between">
              <span>{s.supplierName}</span>
              <StatusBadge tone="danger">{s.delayedCount} متأخرة</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const supplierDelaysWidget: DashboardWidgetDefinition = {
  id: 'supplier-delays',
  permission: 'work-orders.view',
  Component: SupplierDelaysWidgetComponent,
  span: 'lg',
};
