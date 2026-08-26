import { useState } from 'react';
import type { Setting, UpdateSettingInput } from '@cleopatra/shared';
import { apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

function fmt(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type FieldDef = { key: keyof UpdateSettingInput; label: string; step?: string };

// Owner (2026-08-27, "عايزة يفصل في إعدادات الأسعار بين أسعار الاوفست
// وأسعار باقي الاصناف") — purely a display/organization split, zero
// pricing-logic change (rule 3 doesn't apply — no calculation touched).
// `designPrice`/`profitPercent` land in "الأوفست" because they're only
// ever read by costCalculation.ts (LOOSE_PAPER/NOTEBOOK/FOLDER/ENVELOPE —
// the OFFSET-track kinds), confirmed by grep — not a generic/shared value
// used elsewhere in the pricing engine.
const FIELD_GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: 'أسعار الأوفست',
    fields: [
      { key: 'designPrice', label: 'سعر التصميم/الكمبيوتر' },
      { key: 'zincPrice', label: 'سعر الزنكاية للون (أسعار الزنكات)' },
      { key: 'envelopeZincPrice', label: 'سعر زنكاية الأظرف' },
      { key: 'printRunPrice', label: 'سعر تراج الطباعة' },
      { key: 'numberingRunPrice', label: 'سعر تراج الترقيم' },
      { key: 'envelopeDesignPrice', label: 'تصميم الأظرف' },
      { key: 'envelopePrintRunPrice', label: 'تراج طباعة الأظرف' },
      { key: 'sellophanePricePerSheet', label: 'سعر السلوفان لكل فرخ' },
      // Owner (2026-08-27, "سعر الزنكات بكام من عند المورد اسمارت") —
      // تكلفة المورد الحقيقية، منفصلة عن zincPrice فوق (سعر التسعير المُضاف
      // عليه هامش الربح بعد كده) — أساس حساب "فرق السعر والربح".
      { key: 'zincSupplierCost', label: 'تكلفة الزنكات من المورد (اسمارت)' },
      { key: 'profitPercent', label: 'نسبة الربح % (هامش الربح الافتراضي)', step: '0.001' },
      { key: 'wasteSheetsDefault', label: 'أفرخ التهدير الافتراضية' },
      { key: 'notebookThreshold', label: 'حد عدد الدفاتر' },
      { key: 'looseThreshold', label: 'حد عدد ورق السايب' },
    ],
  },
  {
    title: 'أسعار اللوحات والإعلانات',
    fields: [
      { key: 'boardsBannerNoDesign', label: 'بنر بدون تصميم' },
      { key: 'boardsBannerWithDesign', label: 'بنر مع تصميم' },
      { key: 'boardsVinylPrintCutNoSello', label: 'فنيل برنت اند كت بدون سلوفان' },
      { key: 'boardsVinylPrintCutWithSello', label: 'فنيل برنت اند كت مع سلوفان' },
      { key: 'boardsVinylNormalNoSello', label: 'فنيل عادي بدون سلوفان' },
      { key: 'boardsVinylNormalWithSello', label: 'فنيل عادي مع سلوفان' },
      { key: 'boardsFlex', label: 'فلكس' },
      { key: 'boardsSeasro', label: 'سيسرو' },
      { key: 'boardsGapMM', label: 'المسافة بين القطع (مم)' },
      // Owner (2026-08-26, "هكتبلك سعر المتر عليا انا سعر المورد في الإعدادات")
      // — جزء 4 من مبادرة الخزينة/الموردين: تكلفة المورد الخارجي بالمتر (مش
      // مرئية للعميل)، أساس حساب الربح الحقيقي وتسجيل المديونية التلقائي.
      { key: 'boardsBannerSupplierCost', label: 'تكلفة المورد — بنر (بالمتر)' },
      { key: 'boardsVinylNormalSupplierCost', label: 'تكلفة المورد — فنيل عادي (بالمتر)' },
      { key: 'boardsVinylPrintCutSupplierCost', label: 'تكلفة المورد — فنيل برنت اند كت (بالمتر)' },
      { key: 'boardsFlexSupplierCost', label: 'تكلفة المورد — فلكس (بالمتر)' },
      { key: 'boardsSeasroSupplierCost', label: 'تكلفة المورد — سيسرو (بالمتر)' },
    ],
  },
  {
    title: 'أسعار الديجيتال',
    fields: [
      // "سعر طباعة الربع" انتقل لشرائح الكمية الجديدة (owner، 2026-08-20) —
      // شاشة "تسعير الديجيتال — شرائح الكمية" تحت نفس تاب الأسعار. العمود في
      // قاعدة البيانات فضل موجود (قاعدة 2 — لا حذف بدون طلب صريح) بس مبقاش
      // بيتقرأ من محرك التسعير ولا من هنا.
      { key: 'digitalSellophanePricePerQuarter', label: 'سعر سلوفان الربع (ديجيتال)' },
      { key: 'digitalQuarterWidthCm', label: 'عرض الربع (سم) — مقاس تغذية الماكينة' },
      { key: 'digitalQuarterHeightCm', label: 'ارتفاع الربع (سم) — مقاس تغذية الماكينة' },
    ],
  },
];

const NUMBER_FIELDS: FieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields);

/**
 * Sprint 1 §3 — Fixed Prices, editable. Every field here already exists on
 * `Setting` and is already writable via `PUT /api/settings`
 * (settings.ts route, `settings.edit`); this only adds the form. Ink
 * Prices and Finishing Costs are not shown — no such field exists
 * (01_ANALYSIS.md Critical Finding #7), and this sprint doesn't add one.
 */
export function FixedPricesForm({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, setting[f.key] as number])),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-3">
        {can('settings.edit') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setValues(Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, setting[f.key] as number])));
              setEditing(true);
            }}
          >
            تعديل الأسعار
          </Button>
        )}
        <div className="space-y-5">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-sm font-bold">{group.title}</h3>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map((f) => (
                  <div key={f.key} className="border-border flex flex-col gap-1 border-b border-dashed py-2 text-sm">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium">
                      {f.key === 'profitPercent' ? `${setting[f.key]}%` : fmt(setting[f.key] as number)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPut('/api/settings', values satisfies UpdateSettingInput);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الأسعار');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <input
              type="number"
              step={f.step ?? '0.01'}
              min={0}
              required
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
