import { Link } from 'react-router-dom';
import type { DuplicatePhoneInfo } from '@/lib/duplicatePhone';
import { Button } from '@/components/ui/button';

/**
 * The existing records that share the number; customers link to their profile. Matches in a branch the
 * user cannot access are only counted. `newTab` opens the profile in a new tab (for a form the user must
 * not lose, e.g. the invoice being composed).
 */
export function DuplicatePhoneMatches({ info, newTab = false }: { info: DuplicatePhoneInfo; newTab?: boolean }) {
  return (
    <ul className="list-inside list-disc space-y-0.5 text-sm">
      {info.matches.map((m) => (
        <li key={`${m.kind}-${m.id}`}>
          {m.kind === 'partner' ? (
            <Link to={`/partners/${m.id}`} className="text-primary hover:underline" {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}>
              عميل: {m.name}
            </Link>
          ) : (
            <span>Lead: {m.name}</span>
          )}
        </li>
      ))}
      {info.hiddenCount > 0 && <li className="text-muted-foreground">{info.hiddenCount} سجل في فرع تاني (مش ظاهر ليك)</li>}
    </ul>
  );
}

/** The inline warning shown under a form whose save was refused because the number already exists. */
export function DuplicatePhoneWarning({
  info,
  submitting,
  onProceed,
  onEdit,
  newTab = false,
  proceedLabel = 'احفظه برضه',
}: {
  info: DuplicatePhoneInfo;
  submitting: boolean;
  onProceed: () => void;
  onEdit: () => void;
  newTab?: boolean;
  proceedLabel?: string;
}) {
  return (
    <div className="border-warning/50 bg-warning/10 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{info.message}</p>
      <DuplicatePhoneMatches info={info} newTab={newTab} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onProceed}>
          {proceedLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          تعديل الرقم
        </Button>
      </div>
    </div>
  );
}
