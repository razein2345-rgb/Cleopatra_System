import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Quotation } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { DashboardWidget } from '@/components/cleopatra';
import type { DashboardWidgetDefinition } from '../types';

function OpenQuotationsWidgetComponent() {
  const [quotations, setQuotations] = useState<Quotation[] | null>(null);

  useEffect(() => {
    apiGet<Quotation[]>('/api/quotations')
      .then(setQuotations)
      .catch(() => setQuotations([]));
  }, []);

  const openCount = quotations?.filter((q) => q.status === 'DRAFT' || q.status === 'SENT').length ?? null;

  return (
    <DashboardWidget
      label="عروض الأسعار المفتوحة"
      value={openCount}
      icon={FileText}
      tone="info"
      hint={quotations ? `من إجمالي ${quotations.length} عرض` : undefined}
    />
  );
}

export const openQuotationsWidget: DashboardWidgetDefinition = {
  id: 'open-quotations',
  permission: 'quotations.view',
  Component: OpenQuotationsWidgetComponent,
};
