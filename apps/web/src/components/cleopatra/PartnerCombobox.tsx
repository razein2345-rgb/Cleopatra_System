import { useEffect, useRef, useState } from 'react';
import type { BusinessPartner } from '@cleopatra/shared';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * FEATURE-016 (2026-08-16, owner: "محتاج أقدر ابحث في خانة العملاء اللي
 * موجودين مسبقاً لأن لو بقى عندى مثلا 100 عميل أكيد مش هفضل انزل ادور
 * عليهم") — replaces a plain `<select>` full of every partner with a
 * type-to-filter picker, for the customer field on the order/quotation
 * screen. Built on the same `cmdk`-based `Command` primitives already
 * proven by `CommandPalette.tsx`'s ⌘K search rather than a new library;
 * filters client-side over the already-fully-fetched partner list (the
 * same list `NewOrderPage.tsx` already loads on mount), no backend change.
 *
 * Closed state is a plain button showing the selected partner's name —
 * clicking it swaps in the live search input, closing back to the button
 * on selection or a click outside.
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = partners.find((p) => p.id === value);

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
        {selected ? selected.nameAr : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Command className="border-primary overflow-visible rounded-md border bg-transparent" shouldFilter>
        <CommandInput autoFocus placeholder="اكتب اسم العميل أو رقم الهاتف…" className="h-auto px-3 py-2 text-sm" />
        <CommandList className="border-border bg-popover absolute z-50 mt-1 max-h-64 w-full rounded-md border shadow-md">
          <CommandEmpty className="text-muted-foreground p-3 text-sm">لا يوجد عملاء مطابقين</CommandEmpty>
          {partners.map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.nameAr} ${p.phone ?? ''}`}
              onSelect={() => {
                onChange(p.id);
                setOpen(false);
              }}
            >
              <span>{p.nameAr}</span>
              {p.phone && (
                <span className="text-muted-foreground ms-auto text-xs" dir="ltr">
                  {p.phone}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
