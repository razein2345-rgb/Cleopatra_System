import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { EmployeeCashCustody } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import type { DashboardWidgetDefinition } from '../types';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-26, "لما يكون موظف مبيعات يظهرله بعد تقفيل الحساب اليوم
 * متصفر وهيبدأ من الاول لأن كده مفترض إنه سلم فلوس المبيعات لأمين
 * الخزينة") — الجزء المتبقي الوحيد من الطلب الأصلي لمبادرة "فصل الخزينة/
 * الربح بالفرع + الموردين + التقارير". عهدة نقدية حقيقية، مش مجرد إحصائية
 * يومية — بتتصفر تلقائيًا لحظة تقفيل حساب الفرع (مفيش زرار "سلّمت العهدة"
 * منفصل، owner أكّد صراحة إن التقفيل نفسه هو نقطة التصفير).
 */
function EmployeeCashCustodyWidgetComponent() {
  const [custody, setCustody] = useState<EmployeeCashCustody | null>(null);

  useEffect(() => {
    apiGet<EmployeeCashCustody>('/api/treasury-entries/my-cash-custody')
      .then(setCustody)
      .catch(() => setCustody(null));
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Wallet className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">عهدتك النقدية الحالية</span>
      </div>
      {!custody ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : (
        <>
          <p className="text-lg font-bold">{money(custody.amount)} ج.م</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {custody.sinceDate
              ? `منذ آخر تقفيل حساب — ${new Date(custody.sinceDate).toLocaleString('ar-EG')}`
              : 'منذ بداية التعامل مع فرعك (لسه محصلش تقفيل حساب)'}
          </p>
        </>
      )}
    </Card>
  );
}

export const employeeCashCustodyWidget: DashboardWidgetDefinition = {
  id: 'employee-cash-custody',
  permission: 'treasury.create',
  Component: EmployeeCashCustodyWidgetComponent,
};
