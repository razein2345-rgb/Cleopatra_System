import { useEffect, useState } from 'react';
import type { SheetType, SizeFamily } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { SheetTypesEditor } from './SheetTypesEditor';
import { SizeFamiliesEditor } from './SizeFamiliesEditor';
import { ExtraServicesManagement } from './ExtraServicesManagement';

export function PrintingSettings() {
  const [sheetTypes, setSheetTypes] = useState<SheetType[] | null>(null);
  const [sizeFamilies, setSizeFamilies] = useState<SizeFamily[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([apiGet<SheetType[]>('/api/sheet-types'), apiGet<SizeFamily[]>('/api/size-families')])
      .then(([types, families]) => {
        setSheetTypes(types);
        setSizeFamilies(families);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات الطباعة'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!sheetTypes || !sizeFamilies) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const gayerSheets = sheetTypes.filter((s) => s.base === 'GAYER');
  const regularSheets = sheetTypes.filter((s) => s.base === 'REGULAR');

  return (
    <>
      <Section title="أنواع الورق" subtitle="أسعار أفرخ الطباعة حسب النوع">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SheetTypesEditor title="الفرخ الجاير (٦٦×٨٨)" base="GAYER" sheetTypes={gayerSheets} onChanged={load} />
          <SheetTypesEditor title="الفرخ ٧٠×١٠٠" base="REGULAR" sheetTypes={regularSheets} onChanged={load} />
        </div>
      </Section>

      <Section title="دليل المقاسات">
        <SizeFamiliesEditor sizeFamilies={sizeFamilies} onChanged={load} />
      </Section>

      <Section title="الخدمات الإضافية" subtitle="خيارات الخدمات الإضافية اللي بتظهر في نموذج الطلب (تغليف، لصق، تكسير، إلخ)">
        <ExtraServicesManagement />
      </Section>
    </>
  );
}
