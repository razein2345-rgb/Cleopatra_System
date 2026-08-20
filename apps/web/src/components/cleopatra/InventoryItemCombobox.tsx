import { useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '@cleopatra/shared';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Owner (2026-08-20, "لازم أقدر أعمل سيرش علي الأنواع اللي عندي في البضاعه
 * من المخزون بدل ما كل مرة افضل ادور في القايمة") — same "long list, type
 * to filter" complaint `PartnerCombobox.tsx` already solved for the
 * customer field, applied here to the "بضاعة من المخزون" (INVENTORY_RETAIL)
 * manual picker, which was still a plain `<select>` growing one `<option>`
 * per ready-made stock item. Built on the identical `cmdk`-based `Command`
 * primitives — no new picker pattern introduced, just this field's own
 * thin wrapper around them, matching `PartnerCombobox`'s shape exactly.
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.id === value);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'border-input bg-background w-full rounded-md border px-3 py-2 text-start text-sm disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        {selected ? (
          <>
            {selected.name} — {money(selected.salePrice ?? 0)} ج
          </>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Command className="border-primary overflow-visible rounded-md border bg-transparent" shouldFilter>
        <CommandInput autoFocus placeholder="اكتب أول كام حرف من اسم الصنف…" className="h-auto px-3 py-2 text-sm" />
        <CommandList className="border-border bg-popover absolute z-50 mt-1 max-h-64 w-full rounded-md border shadow-md">
          <CommandEmpty className="text-muted-foreground p-3 text-sm">لا يوجد صنف مطابق</CommandEmpty>
          {items.map((i) => (
            <CommandItem
              key={i.id}
              value={i.name}
              onSelect={() => {
                onChange(i);
                setOpen(false);
              }}
            >
              <span>{i.name}</span>
              <span className="text-muted-foreground ms-auto text-xs" dir="ltr">
                {money(i.salePrice ?? 0)} ج
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
