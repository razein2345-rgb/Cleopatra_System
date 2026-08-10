import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * FEATURE-007 — the owner asked for the ability to edit records "زي جدول
 * نوشن" (like a Notion table): click any cell, edit in place, it saves on
 * blur — no separate edit form/dialog. This is the one click-to-edit text
 * cell every editable table in the app should reuse (see
 * `EditableSelectCell` below for the enum/select equivalent), rather than
 * each table growing its own inline-edit logic.
 *
 * Saves only on real changes (never fires `onSave` for an unedited blur),
 * reverts the draft and surfaces the error inline if the save fails —
 * never leaves the UI silently out of sync with the server.
 */
export function EditableTextCell({
  value,
  onSave,
  placeholder,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setDraft(value);
      setError(err instanceof Error ? err.message : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={cn(
          'border-primary bg-background w-full rounded-md border px-2 py-1 text-sm outline-none',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="اضغط للتعديل"
      disabled={saving}
      className={cn(
        'hover:bg-accent/60 w-full rounded-md px-2 py-1 text-start text-sm transition-colors',
        saving && 'opacity-50',
        className,
      )}
    >
      {value || <span className="text-muted-foreground">{placeholder ?? '—'}</span>}
      {error && (
        <span className="text-destructive ms-1 text-xs" title={error}>
          ⚠
        </span>
      )}
    </button>
  );
}

/** The select/enum equivalent of `EditableTextCell` — same click-to-edit-in-place contract. */
export function EditableSelectCell<T extends string>({
  value,
  options,
  onSave,
  renderValue,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onSave: (next: T) => Promise<void>;
  renderValue?: (value: T) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={value}
        onBlur={() => setEditing(false)}
        onChange={async (e) => {
          const next = e.target.value as T;
          setEditing(false);
          if (next === value) return;
          setSaving(true);
          setError(null);
          try {
            await onSave(next);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="border-primary bg-background rounded-md border px-2 py-1 text-sm outline-none"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="اضغط للتعديل"
      disabled={saving}
      className={cn('rounded-md text-start transition-opacity', saving && 'opacity-50')}
    >
      {renderValue ? renderValue(value) : value}
      {error && (
        <span className="text-destructive ms-1 text-xs" title={error}>
          ⚠
        </span>
      )}
    </button>
  );
}
