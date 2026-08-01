import { useEffect, useState } from 'react';
import type { ReadyProduct, Service, Setting, SheetType, SizeFamily } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';

type SettingsData = {
  setting: Setting;
  sheetTypes: SheetType[];
  sizeFamilies: SizeFamily[];
  readyProducts: ReadyProduct[];
  services: Service[];
};

function fmt(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card mb-4 rounded-2xl border p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm">{subtitle}</p>}
      <div className={subtitle ? 'mt-3' : 'mt-1'}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex flex-col gap-1 border-b border-dashed py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<Setting>('/api/settings'),
      apiGet<SheetType[]>('/api/sheet-types'),
      apiGet<SizeFamily[]>('/api/size-families'),
      apiGet<ReadyProduct[]>('/api/ready-products'),
      apiGet<Service[]>('/api/services'),
    ])
      .then(([setting, sheetTypes, sizeFamilies, readyProducts, services]) => {
        setData({ setting, sheetTypes, sizeFamilies, readyProducts, services });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  if (error) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border p-4">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-muted-foreground">Loading settings…</div>;
  }

  const { setting, sheetTypes, sizeFamilies, readyProducts, services } = data;
  const regularSheets = sheetTypes.filter((s) => s.base === 'REGULAR');
  const gayerSheets = sheetTypes.filter((s) => s.base === 'GAYER');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الإعدادات (Phase 1 — read-only)</h1>

      <Section title="الأسعار الثابتة">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="سعر التصميم/الكمبيوتر" value={`${fmt(setting.designPrice)} ج`} />
          <Field label="سعر الزنكاية للون" value={`${fmt(setting.zincPrice)} ج`} />
          <Field label="سعر تراج الطباعة" value={`${fmt(setting.printRunPrice)} ج`} />
          <Field label="سعر تراج الترقيم" value={`${fmt(setting.numberingRunPrice)} ج`} />
          <Field label="تصميم الأظرف" value={`${fmt(setting.envelopeDesignPrice)} ج`} />
          <Field label="تراج طباعة الأظرف" value={`${fmt(setting.envelopePrintRunPrice)} ج`} />
          <Field label="سعر السلوفان لكل فرخ" value={`${fmt(setting.sellophanePricePerSheet)} ج`} />
          <Field label="نسبة الربح %" value={`${setting.profitPercent}%`} />
          <Field label="أفرخ التهدير الافتراضية" value={String(setting.wasteSheetsDefault)} />
          <Field label="حد عدد الدفاتر" value={String(setting.notebookThreshold)} />
          <Field label="حد عدد ورق السايب" value={String(setting.looseThreshold)} />
        </div>
      </Section>

      <Section title="أسعار اللوحات والإعلانات" subtitle="كل الأسعار بالمتر المربع">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="بنر بدون تصميم" value={`${fmt(setting.boardsBannerNoDesign)} ج`} />
          <Field label="بنر مع تصميم" value={`${fmt(setting.boardsBannerWithDesign)} ج`} />
          <Field
            label="فنيل برنت اند كت بدون سلوفان"
            value={`${fmt(setting.boardsVinylPrintCutNoSello)} ج`}
          />
          <Field
            label="فنيل برنت اند كت مع سلوفان"
            value={`${fmt(setting.boardsVinylPrintCutWithSello)} ج`}
          />
          <Field
            label="فنيل عادي بدون سلوفان"
            value={`${fmt(setting.boardsVinylNormalNoSello)} ج`}
          />
          <Field
            label="فنيل عادي مع سلوفان"
            value={`${fmt(setting.boardsVinylNormalWithSello)} ج`}
          />
          <Field label="فلكس" value={`${fmt(setting.boardsFlex)} ج`} />
          <Field label="سيسرو" value={`${fmt(setting.boardsSeasro)} ج`} />
          <Field label="المسافة بين القطع (مم)" value={String(setting.boardsGapMM)} />
        </div>
      </Section>

      <Section title="أنواع الفروخ">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-muted-foreground mb-2 text-sm font-bold">الفرخ الجاير (٦٦×٨٨)</h3>
            <table className="w-full text-sm">
              <tbody>
                {gayerSheets.map((s) => (
                  <tr key={s.id} className="border-border border-b">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-left">{fmt(s.price)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-muted-foreground mb-2 text-sm font-bold">الفرخ ٧٠×١٠٠</h3>
            <table className="w-full text-sm">
              <tbody>
                {regularSheets.map((s) => (
                  <tr key={s.id} className="border-border border-b">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-left">{fmt(s.price)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="دليل المقاسات">
        {sizeFamilies.map((family) => (
          <div key={family.id} className="border-border mb-4 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <b>{family.label}</b>
              <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-bold">
                {family.base === 'GAYER' ? 'جاير ٦٦×٨٨' : 'عادي ٧٠×١٠٠'}
              </span>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-right text-xs">
                  <th className="py-1">المقاس</th>
                  <th className="py-1">عدد القطع في الفرخ الكامل</th>
                </tr>
              </thead>
              <tbody>
                {family.entries.map((entry) => (
                  <tr key={entry.id} className="border-border border-t">
                    <td className="py-1.5">{entry.label}</td>
                    <td className="py-1.5">{entry.piecesPerSheet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>

      <Section title="المنتجات والخدمات الجاهزة">
        <h3 className="text-muted-foreground mb-2 text-sm font-bold">منتجات جاهزة</h3>
        {readyProducts.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا يوجد منتجات جاهزة بعد.</p>
        ) : (
          <ul className="mb-4 text-sm">
            {readyProducts.map((p) => (
              <li key={p.id} className="border-border flex justify-between border-b py-1.5">
                <span>{p.name}</span>
                <span>{fmt(p.price)} ج</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-muted-foreground mb-2 text-sm font-bold">الخدمات (تصميم / مونتاج)</h3>
        {services.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا يوجد خدمات مضافة بعد.</p>
        ) : (
          <ul className="text-sm">
            {services.map((s) => (
              <li key={s.id} className="border-border flex justify-between border-b py-1.5">
                <span>
                  {s.name}{' '}
                  <span className="text-muted-foreground">
                    ({s.category === 'DESIGN' ? 'تصميم' : 'مونتاج'})
                  </span>
                </span>
                <span>{fmt(s.price)} ج</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
