import { Link } from 'react-router-dom';
import { useAuth } from '@/state/AuthContext';
import { cn } from '@/lib/utils';
import { DASHBOARD_MODULE_CARDS, type ModuleCardTone } from './moduleCards';

const TONE_ICON_CLASSES: Record<ModuleCardTone, string> = {
  primary: 'bg-primary/12 text-primary',
  secondary: 'bg-secondary/25 text-secondary-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  info: 'bg-info/15 text-info',
  danger: 'bg-danger/15 text-danger',
};

/**
 * The video-reference-style "wall of module cards" home screen (see
 * VIDEO_VS_CLEOPATRA_REVIEW.md §E). Additive to the Dashboard, not a
 * replacement — the real aggregate-data widgets below it (order counts,
 * delayed jobs, etc.) stay exactly as they are; this grid is purely
 * navigation, one tap to any module the signed-in user can access.
 */
export function ModuleNavGrid() {
  const { can } = useAuth();
  // A string requires that exact permission; an array is satisfied by
  // holding any one of them — same rule as ProtectedRoute.tsx/NavTree.tsx.
  const cards = DASHBOARD_MODULE_CARDS.filter(
    (card) => !card.permission || (Array.isArray(card.permission) ? card.permission.some(can) : can(card.permission)),
  );

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Link
          key={card.id}
          to={card.to}
          className="border-border bg-card hover:border-primary/40 hover:shadow-md flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-shadow"
        >
          <div className={cn('flex size-12 items-center justify-center rounded-2xl', TONE_ICON_CLASSES[card.tone])}>
            <card.icon className="size-6" />
          </div>
          <span className="text-sm font-medium">{card.label}</span>
        </Link>
      ))}
    </div>
  );
}
