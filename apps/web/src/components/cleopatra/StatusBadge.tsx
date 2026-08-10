import { cva, type VariantProps } from 'class-variance-authority';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The one status-color vocabulary the whole ERP uses — Production Board/
 * Dashboard widgets and any future status display pick one of these five
 * tones instead of reaching for raw Badge variants or ad-hoc colors.
 */
const statusBadgeVariants = cva('border-transparent', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      success: 'bg-success/15 text-success [&]:bg-success/15',
      warning: 'bg-warning/20 text-warning-foreground',
      danger: 'bg-danger/15 text-danger',
      info: 'bg-info/15 text-info',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export type StatusTone = NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>;

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return <Badge className={cn(statusBadgeVariants({ tone }), className)}>{children}</Badge>;
}
