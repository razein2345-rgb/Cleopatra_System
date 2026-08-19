import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useAuth } from '@/state/AuthContext';
import { buildPagesProvider } from '@/lib/search/pagesProvider';
import { SEARCH_PROVIDERS } from '@/lib/search/providers';
import type { SearchProvider, SearchResultItem } from '@/lib/search/types';
import type { NavEntry } from './nav-types';

interface CommandPaletteProps {
  entries: NavEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The ERP Command Center — a generic renderer over `SearchProvider[]`.
 * Adding a searchable entity is a new provider file + one registry entry
 * (`lib/search/providers/index.ts`); this component never changes for
 * that. See REFINEMENTS.md §1.
 */
export function CommandPalette({ entries, open, onOpenChange }: CommandPaletteProps) {
  const { can, authContext } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;

  const providers = useMemo<SearchProvider[]>(
    () => [buildPagesProvider(entries, can, isSuperAdmin), ...SEARCH_PROVIDERS],
    [entries, can, isSuperAdmin],
  );
  const [resultsByProvider, setResultsByProvider] = useState<Record<string, SearchResultItem[]>>({});

  useEffect(() => {
    if (!open) return;
    for (const provider of providers) {
      if (provider.permission && !can(provider.permission)) continue;
      provider
        .fetch()
        .then((items) => setResultsByProvider((prev) => ({ ...prev, [provider.id]: items })))
        .catch(() => undefined);
    }
  }, [open, providers, can]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const go = (to: string) => {
    navigate(to);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="البحث السريع">
      <CommandInput placeholder="ابحث عن صفحة، عميل، عرض سعر، منتج أو خدمة…" />
      <CommandList>
        <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>

        {providers.map((provider) => {
          if (provider.permission && !can(provider.permission)) return null;
          const items = resultsByProvider[provider.id] ?? [];
          if (items.length === 0) return null;
          return (
            <CommandGroup key={provider.id} heading={provider.groupLabel}>
              {items.map((item) => (
                <CommandItem key={item.id} value={item.value} onSelect={() => go(item.to)}>
                  <item.icon className="size-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
