import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';
import type { NavEntry } from './nav-types';

interface MobileNavDrawerProps {
  entries: NavEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logoUrl?: string | null;
  businessName?: string | null;
}

/** The off-canvas counterpart to the desktop `Sidebar`, built on shadcn `Sheet`. */
export function MobileNavDrawer({ entries, open, onOpenChange, logoUrl, businessName }: MobileNavDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0 sm:max-w-72" showCloseButton={false}>
        <SheetTitle className="sr-only">التنقل</SheetTitle>
        <Sidebar entries={entries} onNavigate={() => onOpenChange(false)} logoUrl={logoUrl} businessName={businessName} />
      </SheetContent>
    </Sheet>
  );
}
