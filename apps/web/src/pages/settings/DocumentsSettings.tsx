import { useEffect, useState } from 'react';
import type { Setting } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Section } from './Section';
import { BusinessIdentityForm } from './BusinessIdentityForm';
import { DocumentTemplateManager } from './DocumentTemplateManager';

/**
 * FEATURE-006 M6 — "إعدادات المستندات" (Requirement 11): business
 * identity + Quotation/Invoice/Work Order templates in one place.
 */
export function DocumentsSettings() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then(setSetting)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الهوية التجارية'));
  };

  useEffect(load, []);

  return (
    <>
      <Section title="الهوية التجارية" subtitle="تظهر هذه البيانات في رأس المستندات المطبوعة">
        {error && <div className="text-destructive text-sm">{error}</div>}
        {!setting && !error && <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>}
        {setting && <BusinessIdentityForm setting={setting} onSaved={load} />}
      </Section>

      <Section title="قوالب عروض الأسعار">
        <DocumentTemplateManager documentType="QUOTATION" title="عرض السعر" />
      </Section>

      <Section title="قوالب الفواتير">
        <DocumentTemplateManager documentType="INVOICE" title="الفاتورة" />
      </Section>

      <Section title="قوالب أوامر الشغل">
        <DocumentTemplateManager documentType="WORK_ORDER" title="أمر الشغل" />
      </Section>
    </>
  );
}
