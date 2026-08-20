import type { InventoryItem } from '@cleopatra/shared';
import { Combobox } from './Combobox';

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Owner (2026-08-20, "لازم أقدر أعمل سيرش علي الأنواع اللي عندي في البضاعه
 * من المخزون") — the "بضاعة من المخزون" manual picker's own thin wrapper
 * around the shared `Combobox` (generalized the same day after this
 * component and `PartnerCombobox` turned out to be near-identical copies).
 */
export function InventoryItemCombobox({
  items,
  value,
  onChange,
  placeholder = '— اختر —',
  disabled,
  className,
}: {
  items: InventoryItem[];
  value: string;
  onChange: (item: InventoryItem) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Combobox
      items={items}
      value={value}
      getKey={(i) => i.id}
      getLabel={(i) => i.name}
      getSubLabel={(i) => `${money(i.salePrice ?? 0)} ج`}
      getButtonLabel={(i) => `${i.name} — ${money(i.salePrice ?? 0)} ج`}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="اكتب أول كام حرف من اسم الصنف…"
      emptyText="لا يوجد صنف مطابق"
      disabled={disabled}
      className={className}
    />
  );
}
