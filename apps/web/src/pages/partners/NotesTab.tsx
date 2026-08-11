import { useEffect, useState } from 'react';
import type { CreatePartnerNoteInput, PartnerNote, UpdatePartnerNoteInput, User } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';

const COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'كهرماني', value: '#F59E0B' },
  { label: 'أحمر', value: '#EF4444' },
  { label: 'أخضر', value: '#22C55E' },
  { label: 'أزرق', value: '#3B82F6' },
  { label: 'بنفسجي', value: '#A855F7' },
];

function authorName(staff: User[], staffId: string): string {
  return staff.find((s) => s.id === staffId)?.name ?? 'غير معروف';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Notes tab — FEATURE-002 Milestone 5. */
export function NotesTab({
  partnerId,
  staff,
  canManage,
}: {
  partnerId: string;
  staff: User[];
  canManage: boolean;
}) {
  const [notes, setNotes] = useState<PartnerNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PartnerNote | null>(null);

  const load = (q: string) => {
    const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    apiGet<PartnerNote[]>(`/api/partners/${partnerId}/notes${query}`)
      .then(setNotes)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الملاحظات'));
  };

  useEffect(() => {
    const timeout = setTimeout(() => load(search), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, partnerId]);

  const togglePin = async (note: PartnerNote) => {
    setError(null);
    try {
      await apiPut(`/api/partners/${partnerId}/notes/${note.id}/pin`, { isPinned: !note.isPinned });
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة التثبيت');
    }
  };

  const removeNote = async (note: PartnerNote) => {
    if (!confirm(`حذف الملاحظة "${note.title}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partners/${partnerId}/notes/${note.id}`);
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الملاحظة');
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!notes) return <div className="text-muted-foreground text-sm">جارٍ تحميل الملاحظات…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في الملاحظات…"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm sm:max-w-xs"
        />
        {canManage && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة ملاحظة'}
          </Button>
        )}
      </div>

      {showCreate && (
        <NoteForm
          partnerId={partnerId}
          onSaved={() => {
            setShowCreate(false);
            load(search);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {notes.length === 0 && (
        <div className="text-muted-foreground border-border rounded-2xl border border-dashed p-6 text-center text-sm">
          {search.trim() ? 'لا توجد ملاحظات تطابق بحثك.' : 'لا توجد ملاحظات بعد.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="border-border bg-card rounded-2xl border p-4"
            style={note.color ? { borderInlineStartWidth: 4, borderInlineStartColor: note.color } : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold break-words">{note.title}</h3>
              {note.isPinned && (
                <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs">
                  مثبتة
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                {authorName(staff, note.createdBy)} · {formatDate(note.createdAt)}
              </span>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(note)}>
                    تعديل
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void togglePin(note)}>
                    {note.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void removeNote(note)}>
                    حذف
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <NoteForm
          partnerId={partnerId}
          note={editing}
          onSaved={() => {
            setEditing(null);
            load(search);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NoteForm({
  partnerId,
  note,
  onSaved,
  onCancel,
}: {
  partnerId: string;
  note?: PartnerNote;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [color, setColor] = useState<string>(note?.color ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (note) {
        const input: UpdatePartnerNoteInput = { title, body, color: color || null };
        await apiPut(`/api/partners/${partnerId}/notes/${note.id}`, input);
      } else {
        const input: CreatePartnerNoteInput = { title, body, color: color || undefined };
        await apiPost(`/api/partners/${partnerId}/notes`, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الملاحظة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <h3 className="font-semibold">{note ? `تعديل "${note.title}"` : 'ملاحظة جديدة'}</h3>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">العنوان</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">النص</span>
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <div>
        <p className="text-muted-foreground mb-1.5 text-sm">اللون (اختياري)</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setColor('')}
            className={`h-6 w-6 rounded-full border-2 ${color === '' ? 'border-foreground' : 'border-transparent'}`}
            style={{ background: 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 8px 8px' }}
            aria-label="بدون لون"
          />
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`h-6 w-6 rounded-full border-2 ${color === c.value ? 'border-foreground' : 'border-transparent'}`}
              style={{ background: c.value }}
              aria-label={c.label}
              title={c.label}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
