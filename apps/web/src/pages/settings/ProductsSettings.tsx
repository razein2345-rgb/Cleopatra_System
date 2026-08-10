import { useEffect, useState } from 'react';
import type { ReadyProduct } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { ReadyProductsEditor } from './ReadyProductsEditor';

export function ProductsSettings() {
  const [readyProducts, setReadyProducts] = useState<ReadyProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<ReadyProduct[]>('/api/ready-products')
      .then(setReadyProducts)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المنتجات'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!readyProducts) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <Section title="المنتجات الجاهزة">
      <ReadyProductsEditor readyProducts={readyProducts} onChanged={load} />
    </Section>
  );
}
