import { useEffect, useMemo, useState } from 'react';
import type {
  CreateDigitalPriceTierInput,
  DigitalColorMode,
  DigitalPrintBasis,
  DigitalPriceTierDto,
  DigitalSides,
  UpdateDigitalPriceTierInput,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableNumberCell, useConfirm } from '@/components/cleopatra';

const BASIS_LABELS: Record<DigitalPrintBasis, string> = {
  QUARTER: 'الربع (تنزيلة/Yield)',
  A4_DIRECT: 'A4 مباشر (بدون تجميع)',
  A3_DIRECT: 'A3 مباشر (بدون تجميع)',
};
const COLOR_LABELS: Record<DigitalColorMode, string> = { COLOR: 'ألوان', BW: 'أبيض وأسود' };
const SIDES_LABELS: Record<DigitalSides, string> = { SINGLE: 'وجه', DOUBLE: 'وجه وظهر' };

const ALL_BASES: DigitalPrintBasis[] = ['QUARTER', 'A4_DIRECT', 'A3_DIRECT'];
const ALL_COLORS: DigitalColorMode[] = ['COLOR', 'BW'];
const ALL_SIDES: DigitalSides[] = ['SINGLE', 'DOUBLE'];

/**
 * Owner (2026-08-20, "شرائح كمية أعدلها بنفسي من الإعدادات") — 12
 * independent quantity-tier price tables (3 print bases × 2 color modes ×
 * 2 side-counts), each an admin-editable list of {الكمية الأدنى، السعر}.
 * Replaces the old single flat "سعر طباعة الربع" field that used to live
 * in `FixedPricesForm.tsx` (removed there — see its own comment).
 */
export function DigitalPriceTiersManagement() {
  const confirm = useConfirm();
  const [tiers, setTiers] = useState<DigitalPriceTierDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [basis, setBasis] = useState<DigitalPrintBasis>('QUARTER');
  const [colorMode, setColorMode] = useState<DigitalColorMode>('COLOR');
  const [sides, setSides] = useState<DigitalSides>('SINGLE');
  const [newMinQuantity, setNewMinQuantity] = useState('1');
  const [newPrice, setNewPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiGet<DigitalPriceTierDto[]>('/api/digital-price-tiers')
      .then(setTiers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل شرائح تسعير الديجيتال'));
  };

  useEffect(load, []);

  const currentTableTiers = useMemo(
    () =>
      (tiers ?? [])
        .filter((t) => t.basis === basis && t.colorMode === colorMode && t.sides === sides)
        .sort((a, b) => a.minQuantity - b.minQuantity),
    [tiers, basis, colorMode, sides],
  );

  const updateTier = async (tier: DigitalPriceTierDto, patch: UpdateDigitalPriceTierInput) => {
    setError(null);
    try {
      const updated = await apiPut<DigitalPriceTierDto>(`/api/digital-price-tiers/${tier.id}`, patch);
      setTiers((prev) => prev?.map((t) => (t.id === tier.id ? updated : t)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعديل الشريحة');
    }
  };

  const removeTier = async (tier: DigitalPriceTierDto) => {
    if (!(await confirm({ title: `حذف الشريحة من الكمية ${tier.minQuantity}؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/digital-price-tiers/${tier.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الشريحة');
    }
  };

  const addTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const minQuantity = Number(newMinQuantity);
    const pricePerUnit = Number(newPrice);
    if (!Number.isFinite(minQuantity) || minQuantity < 0 || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      setError('اكتب كمية أدنى وسعر صحيحين');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateDigitalPriceTierInput = { basis, colorMode, sides, minQuantity, pricePerUnit };
      await apiPost('/api/digital-price-tiers', input);
      setNewMinQuantity('1');
      setNewPrice('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة الشريحة');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!tiers) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">أساس الطباعة</span>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as DigitalPrintBasis)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {ALL_BASES.map((b) => (
              <option key={b} value={b}>
                {BASIS_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الألوان</span>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as DigitalColorMode)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {ALL_COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الأوجه</span>
          <select
            value={sides}
            onChange={(e) => setSides(e.target.value as DigitalSides)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {ALL_SIDES.map((s) => (
              <option key={s} value={s}>
                {SIDES_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-2">الكمية الأدنى</th>
              <th className="p-2">السعر</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {currentTableTiers.map((tier) => (
              <tr key={tier.id} className="border-border border-b last:border-0">
                <td className="p-2">
                  <EditableNumberCell
                    value={tier.minQuantity}
                    onSave={(next) => updateTier(tier, { minQuantity: Math.round(next) })}
                  />
                </td>
                <td className="p-2">
                  <EditableNumberCell value={tier.pricePerUnit} onSave={(next) => updateTier(tier, { pricePerUnit: next })} />
                </td>
                <td className="p-2">
                  <Button variant="ghost" size="sm" onClick={() => void removeTier(tier)}>
                    حذف
                  </Button>
                </td>
              </tr>
            ))}
            {currentTableTiers.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-2" colSpan={3}>
                  مفيش شرائح لهذا الجدول بعد — أي طلب بالتوليفة دي هيرفض لحد ما تضيف شريحة تبدأ من كمية 0 أو 1 على الأقل.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={addTier} className="border-border bg-card flex flex-wrap items-end gap-2 rounded-xl border p-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">من كمية</span>
          <input
            type="number"
            min={0}
            step={1}
            value={newMinQuantity}
            onChange={(e) => setNewMinQuantity(e.target.value)}
            className="border-input bg-background w-28 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">السعر</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="border-input bg-background w-28 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الإضافة…' : '+ إضافة شريحة'}
        </Button>
      </form>
    </div>
  );
}
