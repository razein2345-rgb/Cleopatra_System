import type { BusinessPartner } from '@cleopatra/shared';
import { Combobox } from './Combobox';

/**
 * FEATURE-016 (2026-08-16, owner: "محتاج أقدر ابحث في خانة العملاء اللي
 * موجودين مسبقاً لأن لو بقى عندى مثلا 100 عميل أكيد مش هفضل انزل ادور
 * عليهم") — the customer field's own thin wrapper around the shared
 * `Combobox` (2026-08-20, generalized after this component and
 * `InventoryItemCombobox` turned out to be near-identical copies of the
 * same picker).
 */
export function PartnerCombobox({
  partners,
  value,
  onChange,
  placeholder = '— اختر —',
  disabled,
  className,
}: {
  partners: BusinessPartner[];
  value: string;
  onChange: (partnerId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Combobox
      items={partners}
      value={value}
      getKey={(p) => p.id}
      getLabel={(p) => p.nameAr}
      getSubLabel={(p) => p.phone}
      onChange={(p) => onChange(p.id)}
      placeholder={placeholder}
      searchPlaceholder="اكتب اسم العميل أو رقم الهاتف…"
      emptyText="لا يوجد عملاء مطابقين"
      disabled={disabled}
      className={className}
    />
  );
}
