import { useEffect, useRef, useState } from 'react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * Owner (2026-08-20, "عايز كل الاماكن اللي فيها اختيار من قائمة منسدله
 * يكون فيها بحث") — generic type-to-filter picker, the same "long list of
 * real records" pattern `PartnerCombobox.tsx` first solved for the customer
 * field and `InventoryItemCombobox.tsx` repeated for stock items. Rather
 * than hand-writing a third near-identical component, this is the shared
 * generic version every future "pick one record from a list" field should
 * use directly — built on the same `cmdk`-based `Command` primitives, no
 * new picker library. Deliberately NOT applied to small fixed-enum
 * `<select>`s (يوم/يومين، وارد/صادر/تسوية، ...) — search adds nothing when
 * there are only 2-4 options and never grows, so those stay plain selects.
 */
export function Combobox<T>({
  items,
  value,
  getKey,
  getLabel,
  getSubLabel,
  getButtonLabel,
  onChange,
  placeholder = '— اختر —',
  searchPlaceholder = 'اكتب للبحث…',
  emptyText = 'لا توجد نتائج مطابقة',
  disabled,
  className,
}: {
  items: T[];
  value: string;
  getKey: (item: T) => string;
  /** Shown for each row in the open dropdown. */
  getLabel: (item: T) => string;
  /** Optional right-aligned secondary text per row (phone, price, ...). */
  getSubLabel?: (item: T) => string | null | undefined;
  /** What the closed button shows once a value is selected — defaults to `getLabel` alone; pass this to show more (e.g. name *and* price) only in the closed state. */
  getButtonLabel?: (item: T) => string;
  onChange: (item: T) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => getKey(i) === value);

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
        {selected ? (getButtonLabel ?? getLabel)(selected) : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Command
        className="border-primary overflow-visible rounded-md border bg-transparent"
        shouldFilter
        // Owner (2026-08-24, "لازم ادوس بره القائمة المنسدلة علشان يبانلي
        // الاختيار") — cmdk re-focuses the search input on every pointer
        // move over the list (to keep hover-highlight in sync while
        // typing). A real mouse/trackpad click almost always includes a
        // tiny pointer move between mousedown and mouseup, which lands
        // exactly inside that window — the mid-click refocus can eat the
        // click before it ever reaches the item, so nothing visibly
        // happens until a later, unrelated click (e.g. "outside") finally
        // registers. `disablePointerSelection` turns off pointer-move-
        // driven highlighting only — the actual `onClick` on each item
        // (how selection has always worked) and keyboard arrow-key
        // navigation are both untouched.
        disablePointerSelection
      >
        <CommandInput autoFocus placeholder={searchPlaceholder} className="h-auto px-3 py-2 text-sm" />
        <CommandList className="border-border bg-popover absolute top-full z-50 mt-1 max-h-64 w-full rounded-md border shadow-md">
          <CommandEmpty className="text-muted-foreground p-3 text-sm">{emptyText}</CommandEmpty>
          {items.map((item) => {
            const sub = getSubLabel?.(item);
            return (
              <CommandItem
                key={getKey(item)}
                value={`${getLabel(item)} ${sub ?? ''}`}
                onSelect={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <span>{getLabel(item)}</span>
                {sub && (
                  <span className="text-muted-foreground ms-auto text-xs" dir="ltr">
                    {sub}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>
    </div>
  );
}
