import { useEffect, useState } from 'react';
import type { Setting } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { FixedPricesForm } from './FixedPricesForm';
import { DigitalPriceTiersManagement } from './DigitalPriceTiersManagement';

export function PricingSettings() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then(setSetting)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الأسعار'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!setting) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <>
      <Section title="الأسعار الثابتة">
        <FixedPricesForm setting={setting} onSaved={load} />
      </Section>

      <Section
        title="تسعير الديجيتال — شرائح الكمية"
        subtitle="سعر منفصل تمامًا لكل توليفة (أساس الطباعة × الألوان × الأوجه)، متدرج حسب الكمية"
      >
        <DigitalPriceTiersManagement />
      </Section>
    </>
  );
}
