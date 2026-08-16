import { useEffect, useState } from 'react';
import type { Service } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { ServicesEditor } from './ServicesEditor';

export function ServicesSettings() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<Service[]>('/api/services')
      .then(setServices)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الخدمات'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!services) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <Section title="خدمات الوكالة">
      <ServicesEditor services={services} onChanged={load} />
    </Section>
  );
}
