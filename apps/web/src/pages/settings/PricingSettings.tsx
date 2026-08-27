import { useEffect, useState } from 'react';
import type { BoardsCatalogItem, Setting } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { FixedPricesForm } from './FixedPricesForm';
import { DigitalPriceTiersManagement } from './DigitalPriceTiersManagement';
import { BoardsCatalogItemsEditor } from './BoardsCatalogItemsEditor';

export function PricingSettings() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [boardsCatalogItems, setBoardsCatalogItems] = useState<BoardsCatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then(setSetting)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الأسعار'));
  };
  const loadBoardsCatalogItems = () => {
    apiGet<BoardsCatalogItem[]>('/api/boards-catalog-items')
      .then(setBoardsCatalogItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل كتالوج اللوحات والإعلانات'));
  };

  useEffect(load, []);
  useEffect(loadBoardsCatalogItems, []);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!setting) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <>
      <Section title="الأسعار الثابتة">
        <FixedPricesForm setting={setting} onSaved={load} />
      </Section>

      <Section
        title="كتالوج اللوحات والإعلانات"
        subtitle="أصناف بسعر ثابت لا تتبع معادلة المادة/المقاس — مثل روول أب (حامل + بانر)"
      >
        {boardsCatalogItems ? (
          <BoardsCatalogItemsEditor items={boardsCatalogItems} onChanged={loadBoardsCatalogItems} />
        ) : (
          <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>
        )}
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
