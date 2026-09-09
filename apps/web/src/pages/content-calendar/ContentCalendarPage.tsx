import { useEffect, useState } from 'react';
import type {
  BranchSummary,
  ContentCalendarEntry,
  ContentCalendarStatus,
  ContentPlatform,
  CreateContentCalendarEntryInput,
  UpdateContentCalendarEntryInput,
  User,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableDateCell, EditableSelectCell, EditableTextCell, StatusBadge, useConfirm, type StatusTone } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  INSTAGRAM: 'إنستجرام',
  FACEBOOK: 'فيسبوك',
  TIKTOK: 'تيك توك',
  WHATSAPP_STATUS: 'حالة واتساب',
  OTHER: 'تانية',
};
const STATUS_LABELS: Record<ContentCalendarStatus, string> = {
  IDEA: 'فكرة',
  IN_PROGRESS: 'قيد التنفيذ',
  READY: 'جاهز',
  PUBLISHED: 'نُشر',
  CANCELLED: 'أُلغي',
};
const STATUS_TONES: Record<ContentCalendarStatus, StatusTone> = {
  IDEA: 'neutral',
  IN_PROGRESS: 'warning',
  READY: 'success',
  PUBLISHED: 'success',
  CANCELLED: 'danger',
};
const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][];
const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [ContentCalendarStatus, string][];

/**
 * Owner (2026-09-09, "المرحلة الخامسة" → "تقويم المحتوى") — Phase 5's
 * first shipped piece: internal scheduling/tracking of planned social
 * content (تاريخ/نوع/حالة), deliberately NOT a publishing integration —
 * `publishedUrl` is filled in manually once a human actually posts it
 * elsewhere, same "draft a human still sends" pattern as the WhatsApp
 * reminder link in `/reorder-due`.
 */
export function ContentCalendarPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canEdit = can('content-calendar.edit');
  const canCreate = can('content-calendar.create');
  const canDelete = can('content-calendar.delete');

  const [entries, setEntries] = useState<ContentCalendarEntry[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ContentCalendarStatus | ''>('');

  const load = () => {
    apiGet<ContentCalendarEntry[]>('/api/content-calendar')
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل تقويم المحتوى'));
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
    apiGet<User[]>('/api/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  const updateEntry = async (id: string, patch: UpdateContentCalendarEntryInput) => {
    const updated = await apiPut<ContentCalendarEntry>(`/api/content-calendar/${id}`, patch);
    setEntries((prev) => prev?.map((e) => (e.id === id ? updated : e)) ?? prev);
  };

  const remove = async (entry: ContentCalendarEntry) => {
    if (!(await confirm({ title: `حذف "${entry.title}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/content-calendar/${entry.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'الشركة كلها');
  const userOptions: [string, string][] = [['', '— بدون —'], ...users.map((u): [string, string] => [u.id, u.name])];

  if (error && !entries) return <div className="text-destructive">{error}</div>;
  if (!entries) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const visibleEntries = statusFilter ? entries.filter((e) => e.status === statusFilter) : entries;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">تقويم المحتوى</h1>
          <p className="text-muted-foreground text-xs">جدولة ومتابعة المحتوى المخطط للسوشيال ميديا — تسجيل داخلي بحت.</p>
        </div>
        {canCreate && <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ محتوى جديد'}</Button>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showCreate && (
        <CreateEntryForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as ContentCalendarStatus | '')}
        className="border-input bg-background w-fit rounded-md border px-3 py-1.5 text-sm"
      >
        <option value="">كل الحالات</option>
        {STATUS_OPTIONS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">العنوان</th>
              <th className="p-3">المنصة</th>
              <th className="p-3">النوع</th>
              <th className="p-3">تاريخ النشر المخطط</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">المسؤول</th>
              <th className="p-3">الفرع</th>
              <th className="p-3">لينك المنشور</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry) => (
              <tr key={entry.id} className="border-border border-b last:border-0">
                <td className="p-3 font-medium">
                  {canEdit ? (
                    <EditableTextCell value={entry.title} onSave={(v) => updateEntry(entry.id, { title: v })} />
                  ) : (
                    entry.title
                  )}
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableSelectCell
                      value={entry.platform}
                      options={PLATFORM_OPTIONS}
                      onSave={(v) => updateEntry(entry.id, { platform: v })}
                      renderValue={(v) => PLATFORM_LABELS[v]}
                    />
                  ) : (
                    PLATFORM_LABELS[entry.platform]
                  )}
                </td>
                <td className="text-muted-foreground p-3">
                  {canEdit ? (
                    <EditableTextCell
                      value={entry.contentType ?? ''}
                      placeholder="مثال: ريلز"
                      onSave={(v) => updateEntry(entry.id, { contentType: v || null })}
                    />
                  ) : (
                    (entry.contentType ?? '—')
                  )}
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableDateCell
                      value={entry.scheduledDate.slice(0, 10)}
                      onSave={(v) => updateEntry(entry.id, { scheduledDate: v ?? entry.scheduledDate })}
                    />
                  ) : (
                    new Date(entry.scheduledDate).toLocaleDateString('ar-EG')
                  )}
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableSelectCell
                      value={entry.status}
                      options={STATUS_OPTIONS}
                      onSave={(v) => updateEntry(entry.id, { status: v })}
                      renderValue={(v) => <StatusBadge tone={STATUS_TONES[v]}>{STATUS_LABELS[v]}</StatusBadge>}
                    />
                  ) : (
                    <StatusBadge tone={STATUS_TONES[entry.status]}>{STATUS_LABELS[entry.status]}</StatusBadge>
                  )}
                </td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableSelectCell
                      value={entry.assignedToId ?? ''}
                      options={userOptions}
                      onSave={(v) => updateEntry(entry.id, { assignedToId: v || null })}
                      renderValue={() => entry.assignedToName ?? '—'}
                    />
                  ) : (
                    (entry.assignedToName ?? '—')
                  )}
                </td>
                <td className="text-muted-foreground p-3">{branchName(entry.branchId)}</td>
                <td className="p-3">
                  {canEdit ? (
                    <EditableTextCell
                      value={entry.publishedUrl ?? ''}
                      placeholder="— بعد النشر —"
                      onSave={(v) => updateEntry(entry.id, { publishedUrl: v || null })}
                    />
                  ) : entry.publishedUrl ? (
                    <a href={entry.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      فتح
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-3">
                  {canDelete && (
                    <button type="button" onClick={() => void remove(entry)} className="text-destructive text-xs hover:underline">
                      حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={9}>
                  لا يوجد محتوى مجدول بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateEntryForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<ContentPlatform>('INSTAGRAM');
  const [contentType, setContentType] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateContentCalendarEntryInput = {
        title,
        platform,
        contentType: contentType.trim() || undefined,
        scheduledDate,
        branchId: branchId || undefined,
        notes: notes.trim() || undefined,
      };
      await apiPost('/api/content-calendar', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة المحتوى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="عنوان/فكرة المحتوى"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="نوع المحتوى (اختياري، مثال: ريلز)"
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {PLATFORM_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <input
          required
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
            <option value="">الشركة كلها</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات (اختياري)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
