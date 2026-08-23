import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BusinessPartner, Department, WorkflowQueueItem } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import type { DashboardWidgetDefinition } from '../types';

/**
 * Owner (2026-08-20, "هو نفس التاب بتاعت منتجات جاهزة هيكون ليها وورك فلو
 * بسيط... ويظهرلي في الداش بورد الحاجات اللي محتاجين نجبها من مورد
 * خارجي") — the new READY_PRODUCTS workflow template's "الإحضار من
 * المورد" stage is `stageType: 'EXTERNAL'` under the (pre-existing, until
 * now unused) `EXTERNAL_SUPPLIER` department — this widget is every open
 * stage instance sitting there, regardless of which track it belongs to
 * (dynamic by department/stageType, not hardcoded to one track — the same
 * "الإحضار من المورد" checkpoint would work for any future track that
 * reuses this department). Reuses `GET /api/workflow-instances/queue`
 * (the same endpoint the Production Board's per-department queues already
 * call) rather than a new backend aggregate.
 */
function SupplierPickupWidgetComponent() {
  const [items, setItems] = useState<WorkflowQueueItem[] | null>(null);
  // Owner (2026-08-23, "ويكتبلي في الداش بورد جمب الطلب هيتجاب من عند
  // (المورد)") — resolve each stage instance's assignedSupplierId (already
  // on the DTO — see workflowInstanceService.ts) to a display name.
  const [suppliers, setSuppliers] = useState<BusinessPartner[]>([]);

  useEffect(() => {
    apiGet<Department[]>('/api/departments')
      .then((departments) => {
        const externalSupplier = departments.find((d) => d.code === 'EXTERNAL_SUPPLIER');
        if (!externalSupplier) {
          setItems([]);
          return;
        }
        return apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?departmentId=${externalSupplier.id}`).then(setItems);
      })
      .catch(() => setItems([]));
    apiGet<BusinessPartner[]>('/api/partners').then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const supplierName = (id: string | null) => (id ? (suppliers.find((s) => s.id === id)?.nameAr ?? null) : null);
  const pending = (items ?? []).filter((i) => i.stageType === 'EXTERNAL');

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">محتاجين نجيبها من المورد</span>
      </div>
      {items === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : pending.length === 0 ? (
        <p className="text-muted-foreground text-sm">مفيش حاجة عند مورد خارجي محتاج نجيبها حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {pending.map((i) => (
            <li key={i.id}>
              <Link
                to={i.workOrderId ? `/work-orders/${i.workOrderId}` : '#'}
                className="hover:bg-accent/60 -mx-1 flex items-center justify-between rounded-md px-1 py-0.5 transition-colors"
              >
                <span>
                  {i.workOrderNumber ?? '—'} — {i.customerName ?? 'عميل'}
                  {supplierName(i.assignedSupplierId) && (
                    <span className="text-muted-foreground"> — من عند {supplierName(i.assignedSupplierId)}</span>
                  )}
                </span>
                {i.sentDate && (
                  <span className="text-muted-foreground text-xs">
                    اتبعت {new Date(i.sentDate).toLocaleDateString('ar-EG')}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const supplierPickupWidget: DashboardWidgetDefinition = {
  id: 'supplier-pickup',
  permission: 'work-orders.view',
  Component: SupplierPickupWidgetComponent,
  span: 'lg',
};
