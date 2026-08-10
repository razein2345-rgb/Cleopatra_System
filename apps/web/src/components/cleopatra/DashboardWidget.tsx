import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DashboardWidgetProps {
  label: string;
  value: string | number | null;
  icon: LucideIcon;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  hint?: string;
}

const TONE_CLASSES: Record<NonNullable<DashboardWidgetProps['tone']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};

/**
 * The one card shape every Dashboard metric renders through — independent,
 * reusable, no widget owns a calculation (the value is always a prop, read
 * from an existing endpoint by the caller). `value === null` renders a
 * loading spinner instead of a stale "0".
 */
export function DashboardWidget({ label, value, icon: Icon, tone = 'neutral', hint }: DashboardWidgetProps) {
  return (
    <Card className="flex-row items-center gap-4 p-4">
      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', TONE_CLASSES[tone])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-sm">{label}</p>
        {value === null ? (
          <Loader2 className="text-muted-foreground mt-1 size-4 animate-spin" />
        ) : (
          <p className="text-xl font-bold">{value}</p>
        )}
        {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
      </div>
    </Card>
  );
}
